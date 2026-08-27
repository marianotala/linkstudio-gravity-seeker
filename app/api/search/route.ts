import { NextResponse } from "next/server";
import { z } from "zod";
import {
  GoogleError,
  searchNearby,
  searchText,
  type PlaceResult,
} from "@/lib/google";
import { haversine, normalizarComparable } from "@/lib/geo";
import { getCategoria, SOLO_NOMBRE } from "@/lib/categories";
import { createClient } from "@/lib/supabase/server";
import { calcularUniversos } from "@/lib/universos";
import type {
  GeocercaUniverso,
  Poi,
  SearchRequest,
  SearchResponse,
  Universos,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// El modo CP puede paginar searchText sobre varios códigos postales
// en una sola llamada: hasta 60 s en Vercel.
export const maxDuration = 60;

const ViewportSchema = z
  .object({
    north: z.number().min(-90).max(90),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    west: z.number().min(-180).max(180),
  })
  .refine((v) => v.north > v.south, { message: "Viewport inválido" });

const CenterSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  nombre: z.string().optional(),
  direccion: z.string().optional(),
  viewport: ViewportSchema.optional(),
});

/** Viewport de respaldo (~5 km) para zonas que llegaran sin límites. */
function viewportDeRespaldo(c: { lat: number; lng: number }) {
  const dLat = 0.045;
  const dLng = 0.045 / Math.max(0.2, Math.cos((c.lat * Math.PI) / 180));
  return {
    north: c.lat + dLat,
    south: c.lat - dLat,
    east: c.lng + dLng,
    west: c.lng - dLng,
  };
}

/** ¿El punto cae dentro del viewport (con un margen pequeño)? */
function dentroDeViewport(
  p: { lat: number; lng: number },
  v: { north: number; south: number; east: number; west: number }
): boolean {
  const margen = 0.002;
  return (
    p.lat <= v.north + margen &&
    p.lat >= v.south - margen &&
    p.lng <= v.east + margen &&
    p.lng >= v.west - margen
  );
}

const BodySchema = z
  .object({
    mode: z.enum(["origins", "zone", "census", "cp"]),
    centers: z
      .array(CenterSchema)
      .max(200, "Máximo 200 orígenes por búsqueda")
      .default([]),
    radius: z
      .number()
      .min(50, "El radio mínimo es 50 m")
      .max(50000, "El radio máximo es 50 km"),
    category: z.string().min(1, "Falta la categoría"),
    nameFilter: z.string().trim().default(""),
    excludes: z.array(z.string().trim().min(1)).max(50).default([]),
    persist: z.boolean().optional(),
    /** Solo modo cp: códigos postales de 5 dígitos. */
    cps: z
      .array(z.string().regex(/^\d{5}$/, "CP inválido: usa 5 dígitos"))
      .max(25, "Máximo 25 códigos postales por búsqueda")
      .optional(),
  })
  .refine((b) => b.category === SOLO_NOMBRE || getCategoria(b.category), {
    message: "Categoría desconocida",
    path: ["category"],
  })
  .refine((b) => b.category !== SOLO_NOMBRE || b.nameFilter.length > 0, {
    message: 'Para buscar "solo por nombre" escribe un nombre',
    path: ["nameFilter"],
  })
  .refine((b) => b.mode !== "census" || b.centers.length === 1, {
    message: "El modo censo procesa una celda por llamada",
    path: ["centers"],
  })
  .refine((b) => b.mode === "cp" || b.centers.length >= 1, {
    message: "Manda al menos un centro de búsqueda",
    path: ["centers"],
  })
  .refine((b) => b.mode !== "cp" || (b.cps?.length ?? 0) >= 1, {
    message: "Manda al menos un código postal",
    path: ["cps"],
  });

// Límites diarios por usuario (los admin no tienen límite).
const LIMITE_BUSQUEDAS = parseInt(process.env.DAILY_SEARCH_LIMIT ?? "", 10) || 50;
const LIMITE_CELDAS = parseInt(process.env.DAILY_CELL_LIMIT ?? "", 10) || 300;

const LOTE_CENTROS = 8;

async function enLotes<T, R>(
  items: T[],
  tamano: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const salida: R[] = [];
  for (let i = 0; i < items.length; i += tamano) {
    const parciales = await Promise.all(items.slice(i, i + tamano).map(fn));
    salida.push(...parciales);
  }
  return salida;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "No autorizado. Inicia sesión." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "El body no es JSON válido" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Input inválido" },
      { status: 400 }
    );
  }

  const { mode, radius, category, nameFilter, excludes } = parsed.data;
  let centers = parsed.data.centers;
  // Las celdas de censo no se guardan como búsquedas individuales.
  const persistir = parsed.data.persist ?? mode !== "census";
  const categoria = getCategoria(category);

  // Modo CP: resolver los códigos postales a sus polígonos. El bbox de
  // cada CP se vuelve un "centro" tipo zona (searchText restringido al
  // rectángulo) y el filtro fino contra el polígono REAL corre después
  // vía puntos_en_cps.
  const cpsPedidos = Array.from(new Set(parsed.data.cps ?? []));
  let cpsEncontrados: {
    codigo_postal: string;
    entidad: string;
    bbox: { north: number; south: number; east: number; west: number };
  }[] = [];
  if (mode === "cp") {
    const { data, error } = await supabase.rpc("buscar_cps", {
      p_cps: cpsPedidos,
      p_incluir_geometria: false,
    });
    if (error) {
      console.error("buscar_cps falló:", error.message);
      return NextResponse.json(
        { error: "No se pudieron consultar los códigos postales" },
        { status: 502 }
      );
    }
    const r = data as {
      encontrados: typeof cpsEncontrados;
      no_encontrados: string[];
    };
    cpsEncontrados = r.encontrados ?? [];
    if (cpsEncontrados.length === 0) {
      return NextResponse.json(
        {
          error: `Ningún CP está en la base de polígonos (${(r.no_encontrados ?? cpsPedidos).join(", ")}). Carga la entidad en Admin.`,
        },
        { status: 400 }
      );
    }
    centers = cpsEncontrados.map((c) => ({
      lat: (c.bbox.north + c.bbox.south) / 2,
      lng: (c.bbox.east + c.bbox.west) / 2,
      nombre: `CP ${c.codigo_postal}`,
      viewport: c.bbox,
    }));
  }

  // Protección de cuota: 1 búsqueda normal o 1 celda de censo por llamada.
  // La RPC es security definer, atómica, y regresa permitido=true para admin.
  try {
    const { data: cuota, error: errorCuota } = await supabase.rpc(
      "consumir_cuota",
      {
        p_tipo: mode === "census" ? "celda" : "busqueda",
        p_max_busquedas: LIMITE_BUSQUEDAS,
        p_max_celdas: LIMITE_CELDAS,
      }
    );
    if (errorCuota) {
      console.error("No se pudo verificar la cuota:", errorCuota.message);
    } else if (cuota && (cuota as { permitido?: boolean }).permitido === false) {
      const c = cuota as { searches_count?: number; cells_count?: number };
      return NextResponse.json(
        {
          error:
            mode === "census"
              ? `Alcanzaste tu límite diario de censo (${LIMITE_CELDAS} celdas por día; llevas ${c.cells_count ?? LIMITE_CELDAS}). Se reinicia mañana; los admin no tienen límite.`
              : `Alcanzaste tu límite diario (${LIMITE_BUSQUEDAS} búsquedas por día; llevas ${c.searches_count ?? LIMITE_BUSQUEDAS}). Se reinicia mañana; los admin no tienen límite.`,
        },
        { status: 429 }
      );
    }
  } catch (e) {
    console.error("No se pudo verificar la cuota:", e);
  }

  try {
    // 1) Traer resultados crudos de Google.
    let crudos: PlaceResult[];
    if (mode === "origins" && categoria) {
      // Categoría alrededor de cada origen: searchNearby, máx 20 por
      // origen, ordenados por distancia.
      const porCentro = await enLotes(centers, LOTE_CENTROS, (c) =>
        searchNearby(c, radius, categoria.types)
      );
      crudos = porCentro.flat();
    } else if (mode === "zone" || mode === "cp") {
      // Modo zona: sin radio — restricción dura a los límites reales de
      // cada zona (viewport de Geocoding), paginado hasta 60 por zona.
      // Modo CP: mismo mecanismo sobre el bbox de cada código postal;
      // el recorte al polígono real viene después.
      const query = categoria ? categoria.textQuery : nameFilter;
      const porZona = await enLotes(centers, LOTE_CENTROS, (c) =>
        searchText(query, { rectangle: c.viewport ?? viewportDeRespaldo(c) })
      );
      crudos = porZona.flat();
    } else {
      // Censo y "solo por nombre" en orígenes: searchText con sesgo
      // circular, paginado hasta 60 por centro.
      const query = categoria ? categoria.textQuery : nameFilter;
      const porCentro = await enLotes(centers, LOTE_CENTROS, (c) =>
        searchText(query, { circle: { center: c, radius } })
      );
      crudos = porCentro.flat();
    }

    // 2) Deduplicar por place_id.
    const porId = new Map<string, PlaceResult>();
    for (const p of crudos) {
      if (!porId.has(p.placeId)) porId.set(p.placeId, p);
    }
    let lugares = Array.from(porId.values());

    // 3) Filtro estricto de nombre: todas las palabras del filtro deben
    //    aparecer en el nombre, comparando sin acentos ni puntuación
    //    ("7 eleven" atrapa "7-Eleven").
    let descartadosPorNombre = 0;
    const detalleDescartados: string[] = [];
    if (nameFilter) {
      const tokens = normalizarComparable(nameFilter).split(" ").filter(Boolean);
      lugares = lugares.filter((p) => {
        const nombre = normalizarComparable(p.nombre);
        const pasa = tokens.every((t) => nombre.includes(t));
        if (!pasa) {
          descartadosPorNombre++;
          if (detalleDescartados.length < 300) detalleDescartados.push(p.nombre);
        }
        return pasa;
      });
    }

    // 4) Exclusiones de marca sobre nombre + types, con la misma
    //    comparación sin puntuación (types tipo convenience_store se
    //    comparan como "convenience store").
    let excluidos = 0;
    const detalleExcluidos: string[] = [];
    if (excludes.length > 0) {
      const terminos = excludes.map(normalizarComparable).filter(Boolean);
      lugares = lugares.filter((p) => {
        const pajar = normalizarComparable(`${p.nombre} ${p.types.join(" ")}`);
        const fuera = terminos.some((t) => pajar.includes(t));
        if (fuera) {
          excluidos++;
          if (detalleExcluidos.length < 300) detalleExcluidos.push(p.nombre);
        }
        return !fuera;
      });
    }

    // 5) Distancia haversine al centro más cercano. Descarte:
    //    - orígenes/censo: fuera de radio + 50 m de tolerancia
    //    - zona: fuera de los límites (viewport) de todas las zonas
    const pois: Poi[] = [];
    for (const p of lugares) {
      let mejorDist = Infinity;
      let mejorIdx = 0;
      centers.forEach((c, i) => {
        const d = haversine(c, p);
        if (d < mejorDist) {
          mejorDist = d;
          mejorIdx = i;
        }
      });
      const dentro =
        mode === "zone" || mode === "cp"
          ? centers.some((c) =>
              dentroDeViewport(p, c.viewport ?? viewportDeRespaldo(c))
            )
          : mejorDist <= radius + 50;
      if (dentro) {
        pois.push({
          placeId: p.placeId,
          nombre: p.nombre,
          direccion: p.direccion,
          lat: p.lat,
          lng: p.lng,
          types: p.types,
          distancia: Math.round(mejorDist),
          origenIdx: mejorIdx,
          fuente: "google",
        });
      }
    }
    // Modo CP: recorte fino al POLÍGONO real (el bbox de arriba es solo
    // cobertura). puntos_en_cps regresa únicamente los puntos dentro de
    // algún CP pedido, con el CP que los contiene — los de fuera se
    // descartan aunque Google los haya devuelto.
    let poisFinales = pois;
    if (mode === "cp" && pois.length > 0) {
      const { data, error } = await supabase.rpc("puntos_en_cps", {
        p_cps: cpsEncontrados.map((c) => c.codigo_postal),
        p_puntos: pois
          .slice(0, 5000)
          .map((p) => ({ id: p.placeId, lat: p.lat, lng: p.lng })),
      });
      if (error) {
        console.error("puntos_en_cps falló:", error.message);
        return NextResponse.json(
          { error: "No se pudo aplicar el filtro espacial de los CPs" },
          { status: 502 }
        );
      }
      const cpPorId = new Map(
        ((data ?? []) as { id: string; cp: string }[]).map((f) => [f.id, f.cp])
      );
      poisFinales = pois
        .filter((p) => cpPorId.has(p.placeId))
        .map((p) => {
          const cp = cpPorId.get(p.placeId)!;
          const idx = cpsEncontrados.findIndex((c) => c.codigo_postal === cp);
          const centro = centers[idx] ?? centers[p.origenIdx];
          return {
            ...p,
            cp,
            origenIdx: idx >= 0 ? idx : p.origenIdx,
            distancia: Math.round(haversine(centro, p)),
          };
        });
    }
    poisFinales.sort((a, b) => a.distancia - b.distancia);

    // Guardar la búsqueda + resultados en el historial (RPC = una sola
    // transacción, con RLS del usuario). Si el guardado falla, la
    // búsqueda igual se regresa.
    let searchId: string | null = null;
    if (!persistir) {
      return NextResponse.json({
        pois: poisFinales,
        excluidos,
        descartadosPorNombre,
        detalleExcluidos,
        detalleDescartados,
        searchId,
      } satisfies SearchResponse);
    }

    // Universos demográficos sobre las geocercas de la búsqueda:
    // orígenes = círculos con su radio; zona = rectángulos (viewport);
    // CP = interpolación areal contra el POLÍGONO real de cada código.
    // Nunca bloquea los POIs: si falla, universos.disponible = false.
    let universos: Universos | undefined;
    if (poisFinales.length > 0) {
      const geocercas: GeocercaUniverso[] =
        mode === "cp"
          ? cpsEncontrados.map((c) => ({
              id: c.codigo_postal,
              cp: c.codigo_postal,
            }))
          : centers.map((c, i) =>
              mode === "zone"
                ? { id: c.nombre ?? String(i), viewport: c.viewport ?? viewportDeRespaldo(c) }
                : { id: c.nombre ?? String(i), lat: c.lat, lng: c.lng, radio_m: radius }
            );
      universos = await calcularUniversos(supabase, geocercas);
      if (mode === "cp" && universos.disponible) {
        const lista = cpsEncontrados.map((c) => c.codigo_postal);
        const mostrados = lista.slice(0, 8).join(", ");
        universos.criterio = `población dentro de los CPs ${mostrados}${lista.length > 8 ? ` y ${lista.length - 8} más` : ""}`;
      }
    }

    try {
      const paramsGuardados: SearchRequest = {
        mode,
        centers,
        radius,
        category,
        nameFilter,
        excludes,
        ...(mode === "cp" ? { cps: cpsPedidos } : {}),
      };
      const etiquetaCategoria = categoria?.label ?? "Solo por nombre";
      const { data: idGuardado, error: errorGuardado } = await supabase.rpc(
        "guardar_busqueda",
        {
          p_mode: mode,
          p_params: paramsGuardados,
          // sin porAgeb ni agebsGeo: son detalle de sesión (hasta 300
          // filas / geometrías), no se persisten en el historial
          p_universos: universos
            ? { ...universos, porAgeb: undefined, agebsGeo: undefined }
            : null,
          p_results: poisFinales.map((p) => ({
            name: p.nombre,
            category: etiquetaCategoria,
            lat: p.lat,
            lng: p.lng,
            address: p.direccion,
            origin_name:
              centers[p.origenIdx]?.nombre ?? `Origen ${p.origenIdx + 1}`,
            distance_m: p.distancia,
            place_id: p.placeId,
          })),
        }
      );
      if (!errorGuardado) searchId = idGuardado as string;
      else console.error("No se pudo guardar la búsqueda:", errorGuardado.message);
    } catch (e) {
      console.error("No se pudo guardar la búsqueda:", e);
    }

    const respuesta: SearchResponse = {
      pois: poisFinales,
      excluidos,
      descartadosPorNombre,
      detalleExcluidos,
      detalleDescartados,
      universos,
      searchId,
    };
    return NextResponse.json(respuesta);
  } catch (e) {
    const mensaje =
      e instanceof GoogleError ? e.message : "Error inesperado al buscar POIs";
    return NextResponse.json({ error: mensaje }, { status: 502 });
  }
}
