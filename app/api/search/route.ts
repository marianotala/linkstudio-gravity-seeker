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
import type { Poi, SearchResponse } from "@/lib/types";

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
    mode: z.enum(["origins", "zone"]),
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
  })
  .refine((b) => b.category === SOLO_NOMBRE || getCategoria(b.category), {
    message: "Categoría desconocida",
    path: ["category"],
  })
  .refine((b) => b.category !== SOLO_NOMBRE || b.nameFilter.length > 0, {
    message: 'Para buscar "solo por nombre" escribe un nombre',
    path: ["nameFilter"],
  });

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
  const categoria = getCategoria(category);

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

    const respuesta: SearchResponse = { pois, excluidos, descartadosPorNombre };
    return NextResponse.json(respuesta);
  } catch (e) {
    const mensaje =
      e instanceof GoogleError ? e.message : "Error inesperado al buscar POIs";
    return NextResponse.json({ error: mensaje }, { status: 502 });
  }
}
