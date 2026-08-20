import { NextResponse } from "next/server";
import { z } from "zod";
import {
  GoogleError,
  searchNearby,
  searchText,
  type PlaceResult,
} from "@/lib/google";
import { haversine, normalizar } from "@/lib/geo";
import { getCategoria, SOLO_NOMBRE } from "@/lib/categories";
import { createClient } from "@/lib/supabase/server";
import type { Poi, SearchRequest, SearchResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CenterSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  nombre: z.string().optional(),
  direccion: z.string().optional(),
});

const BodySchema = z
  .object({
    mode: z.enum(["origins", "zone", "census"]),
    centers: z
      .array(CenterSchema)
      .min(1, "Manda al menos un centro de búsqueda")
      .max(200, "Máximo 200 orígenes por búsqueda"),
    radius: z
      .number()
      .min(50, "El radio mínimo es 50 m")
      .max(50000, "El radio máximo es 50 km"),
    category: z.string().min(1, "Falta la categoría"),
    nameFilter: z.string().trim().default(""),
    excludes: z.array(z.string().trim().min(1)).max(50).default([]),
    persist: z.boolean().optional(),
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
  .refine((b) => b.mode !== "census" || b.nameFilter.length > 0, {
    message: "El censo necesita la marca en nameFilter",
    path: ["nameFilter"],
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

  const { mode, centers, radius, category, nameFilter, excludes } = parsed.data;
  // Las celdas de censo no se guardan como búsquedas individuales.
  const persistir = parsed.data.persist ?? mode !== "census";
  const categoria = getCategoria(category);

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
    } else {
      // Modo zona y búsqueda "solo por nombre": searchText con textQuery
      // en español, paginado hasta 60 por centro.
      const query = categoria ? categoria.textQuery : nameFilter;
      const porCentro = await enLotes(centers, LOTE_CENTROS, (c) =>
        searchText(query, c, radius)
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
    //    aparecer en el nombre normalizado sin acentos.
    let descartadosPorNombre = 0;
    if (nameFilter) {
      const tokens = normalizar(nameFilter).split(" ").filter(Boolean);
      lugares = lugares.filter((p) => {
        const nombre = normalizar(p.nombre);
        const pasa = tokens.every((t) => nombre.includes(t));
        if (!pasa) descartadosPorNombre++;
        return pasa;
      });
    }

    // 4) Exclusiones de marca sobre nombre + types.
    let excluidos = 0;
    if (excludes.length > 0) {
      const terminos = excludes.map(normalizar).filter(Boolean);
      lugares = lugares.filter((p) => {
        const pajar = `${normalizar(p.nombre)} ${p.types.join(" ")}`;
        const fuera = terminos.some((t) => pajar.includes(t));
        if (fuera) excluidos++;
        return !fuera;
      });
    }

    // 5) Distancia haversine al centro más cercano y descarte fuera de
    //    radio + 50 m de tolerancia.
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
      if (mejorDist <= radius + 50) {
        pois.push({
          placeId: p.placeId,
          nombre: p.nombre,
          direccion: p.direccion,
          lat: p.lat,
          lng: p.lng,
          types: p.types,
          distancia: Math.round(mejorDist),
          origenIdx: mejorIdx,
        });
      }
    }
    pois.sort((a, b) => a.distancia - b.distancia);

    // Guardar la búsqueda + resultados en el historial (RPC = una sola
    // transacción, con RLS del usuario). Si el guardado falla, la
    // búsqueda igual se regresa.
    let searchId: string | null = null;
    if (!persistir) {
      return NextResponse.json({
        pois,
        excluidos,
        descartadosPorNombre,
        searchId,
      } satisfies SearchResponse);
    }
    try {
      const paramsGuardados: SearchRequest = {
        mode,
        centers,
        radius,
        category,
        nameFilter,
        excludes,
      };
      const etiquetaCategoria = categoria?.label ?? "Solo por nombre";
      const { data: idGuardado, error: errorGuardado } = await supabase.rpc(
        "guardar_busqueda",
        {
          p_mode: mode,
          p_params: paramsGuardados,
          p_results: pois.map((p) => ({
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
      pois,
      excluidos,
      descartadosPorNombre,
      searchId,
    };
    return NextResponse.json(respuesta);
  } catch (e) {
    const mensaje =
      e instanceof GoogleError ? e.message : "Error inesperado al buscar POIs";
    return NextResponse.json({ error: mensaje }, { status: 502 });
  }
}
