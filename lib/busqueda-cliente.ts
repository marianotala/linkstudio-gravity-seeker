// Piezas CLIENTE de la búsqueda, compartidas entre el modo consulta
// (SeekerApp) y las secciones inline del Planner — una sola fuente de
// verdad para el manejo de errores de API, el backoff de cuota de
// Google, el parseo de términos de marca, el estimador de consultas,
// la geocodificación por lotes y la búsqueda de POIs por lotes.

import { CATEGORIA_LIBRE, getCategoria } from "./categories";
import { normalizarComparable } from "./geo";
import type { SeleccionCategoria } from "@/components/CategoriaBuscador";
import type {
  ApiError,
  GeocodeResponse,
  Origin,
  Poi,
  SearchRequest,
  SearchResponse,
} from "./types";

/** Error de la API con código para decidir el manejo: "rate" (backoff
 * automático y se reanuda solo), "cuota_diaria" (Google: se reinicia a
 * medianoche del Pacífico) o "limite_diario" (celdas por usuario). */
export class ErrorApi extends Error {
  codigo?: string;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ErrorApi((data as ApiError).error ?? `Error ${res.status}`);
    err.codigo = (data as { codigo?: string }).codigo;
    throw err;
  }
  return data as T;
}

/** Esperas del backoff automático ante rate limit de Google. */
export const ESPERAS_CUOTA_S = [30, 60, 120, 240, 300];
export const MAX_ESPERAS_CUOTA = 5;

/** ¿El término del filtro es de modo exacto ("comillas")? */
export function esTerminoExacto(t: string): boolean {
  return /^".*"$/.test(t);
}

/** Divide un texto en términos de filtro (comas), sin duplicados.
 * Los términos con "comillas" (modo exacto) conservan sus comillas y
 * no chocan con su versión sin comillas (son modos distintos). */
export function dividirTerminos(texto: string, existentes: string[] = []): string[] {
  const clave = (t: string) =>
    (esTerminoExacto(t) ? '"' : "") + normalizarComparable(t);
  const vistos = new Set(existentes.map(clave));
  const salida: string[] = [];
  for (const t of texto.split(",").map((v) => v.trim()).filter(Boolean)) {
    const k = clave(t);
    if (k === '"' || k === "" || vistos.has(k)) continue;
    vistos.add(k);
    salida.push(t);
  }
  return salida;
}

/** Consultas a Google por centro: cada categoría CURADA con tipos corre
 * DOS vías (Nearby por tipo + text query), cada libre una, y cada
 * término de nombre agrega otra pasada de texto. */
export function consultasPorCentroDe(
  categorias: SeleccionCategoria[],
  nameFilters: string[]
): number {
  return Math.max(
    1,
    categorias.reduce(
      (s, c) =>
        s +
        (c.key !== CATEGORIA_LIBRE && (getCategoria(c.key)?.types.length ?? 0) > 0
          ? 2
          : 1),
      0
    ) + nameFilters.length
  );
}

/** Categorías en el formato del API (`libre:` para búsquedas libres). */
export function categoriasParaApi(categorias: SeleccionCategoria[]): string[] {
  return categorias.map((c) =>
    c.key === CATEGORIA_LIBRE ? `libre:${(c.libre ?? "").trim()}` : c.key
  );
}

const LOTE_GEOCODE = 500;

/** Geocodifica direcciones por lotes vía /api/geocode. Regresa los
 * orígenes resueltos (con su nombre) y cuántas fallaron. */
export async function geocodificarDirecciones(
  direcciones: { direccion: string; nombre?: string }[],
  onEstado?: (hechas: number, total: number) => void
): Promise<{ origenes: Origin[]; fallidas: number }> {
  const listos: Origin[] = [];
  let fallidas = 0;
  for (let i = 0; i < direcciones.length; i += LOTE_GEOCODE) {
    onEstado?.(i, direcciones.length);
    const lote = direcciones.slice(i, i + LOTE_GEOCODE);
    const { resultados } = await postJson<GeocodeResponse>("/api/geocode", {
      direcciones: lote.map((d) => d.direccion),
    });
    resultados.forEach((r, j) => {
      if (r.ok && r.lat !== undefined && r.lng !== undefined) {
        listos.push({
          lat: r.lat,
          lng: r.lng,
          nombre: lote[j].nombre,
          direccion: r.formatted ?? lote[j].direccion,
        });
      } else {
        fallidas++;
      }
    });
  }
  onEstado?.(direcciones.length, direcciones.length);
  return { origenes: listos, fallidas };
}

const LOTE_CENTROS = 150;

export interface OpcionesBusquedaLotes {
  /** Centros YA consolidados (consolidarCentros de lib/geo). */
  centros: Origin[];
  radius: number;
  categorias: SeleccionCategoria[];
  nameFilters: string[];
  excludes: string[];
  /** Progreso legible ("lote 2 de 5 · esperando cuota…"). */
  onEstado?: (texto: string) => void;
  /** POIs NUEVOS de cada lote (para autosave incremental). */
  onLote?: (nuevos: Poi[], lote: number, total: number) => Promise<void> | void;
  detenerRef?: { current: boolean };
}

export interface ResultadoBusquedaLotes {
  pois: Poi[];
  excluidos: number;
  descartados: number;
  /** false = detenida/cuota: el avance regresa igual (POIs acumulados). */
  completa: boolean;
  /** Mensaje del error que interrumpió (cuota diaria / límite), si hubo. */
  interrupcion?: string;
}

/**
 * Búsqueda de POIs por lotes alrededor de centros, con el MISMO manejo
 * de cuota del modo consulta: rate limit → backoff automático con
 * cuenta regresiva (el mismo lote se reintenta; lo acumulado nunca se
 * re-paga); cuota diaria o límite de celdas → regresa lo acumulado con
 * `completa: false` y el mensaje. Dedupe por place_id entre lotes.
 */
export async function buscarPorLotes(
  o: OpcionesBusquedaLotes
): Promise<ResultadoBusquedaLotes> {
  const consultasCentro = consultasPorCentroDe(o.categorias, o.nameFilters);
  const tamanoLote =
    consultasCentro > 1
      ? Math.max(25, Math.floor(120 / consultasCentro))
      : LOTE_CENTROS;
  const lotes: Origin[][] = [];
  for (let i = 0; i < o.centros.length; i += tamanoLote) {
    lotes.push(o.centros.slice(i, i + tamanoLote));
  }
  const primera = o.categorias[0];
  const cuerpoBase = {
    mode: "origins" as const,
    radius: o.radius,
    category: !primera ? "solo_nombre" : primera.key,
    freeQuery:
      primera?.key === CATEGORIA_LIBRE
        ? (primera.libre ?? "").trim() || undefined
        : undefined,
    categories: o.categorias.length ? categoriasParaApi(o.categorias) : undefined,
    nameFilter: o.nameFilters.join(", "),
    nameFilters: o.nameFilters,
    excludes: o.excludes,
    persist: false,
  };

  const acumulados = new Map<string, Poi>();
  let excluidos = 0;
  let descartados = 0;
  let esperasCuota = 0;
  let interrupcion: string | undefined;

  let li = 0;
  for (; li < lotes.length; ) {
    if (o.detenerRef?.current) break;
    o.onEstado?.(
      `lote ${li + 1} de ${lotes.length} · ${acumulados.size.toLocaleString("es-MX")} POIs`
    );
    let data: SearchResponse;
    try {
      data = await postJson<SearchResponse>("/api/search", {
        ...cuerpoBase,
        centers: lotes[li],
      } satisfies SearchRequest);
    } catch (e) {
      if (
        e instanceof ErrorApi &&
        e.codigo === "rate" &&
        esperasCuota < MAX_ESPERAS_CUOTA
      ) {
        const espera =
          ESPERAS_CUOTA_S[Math.min(esperasCuota, ESPERAS_CUOTA_S.length - 1)];
        esperasCuota++;
        for (let s = espera; s > 0; s--) {
          if (o.detenerRef?.current) break;
          o.onEstado?.(
            `Google limitó el ritmo — reintento en ${s}s (pausa ${esperasCuota} de ${MAX_ESPERAS_CUOTA})`
          );
          await new Promise((r) => setTimeout(r, 1000));
        }
        continue; // reintenta el MISMO lote
      }
      interrupcion = e instanceof Error ? e.message : "Error al buscar";
      break;
    }
    esperasCuota = 0;
    excluidos += data.excluidos;
    descartados += data.descartadosPorNombre;
    const nuevos: Poi[] = [];
    for (const p of data.pois) {
      if (!acumulados.has(p.placeId)) {
        acumulados.set(p.placeId, p);
        nuevos.push(p);
      }
    }
    await o.onLote?.(nuevos, li + 1, lotes.length);
    li++;
  }

  return {
    pois: Array.from(acumulados.values()),
    excluidos,
    descartados,
    completa: li >= lotes.length,
    interrupcion,
  };
}
