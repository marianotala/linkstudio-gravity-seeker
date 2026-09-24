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

/**
 * CHUNKS CORTOS: cada request a /api/search debe terminar holgadamente
 * bajo el timeout de la plataforma (Vercel). El costo dominante es el
 * pacing de Google (GOOGLE_MAX_QPS) por consulta — y "solo por nombre"
 * pagina hasta 3 páginas por consulta — así que el chunk se dimensiona
 * por CONSULTAS, no por centros: ~16 consultas ≈ 5-20 s por request.
 * El cliente orquesta el loop; el avance se persiste POR CHUNK.
 */
export const CONSULTAS_POR_CHUNK = 16;

/** Centros por chunk para que cada request quede corta. */
export function centrosPorChunk(consultasPorCentro: number): number {
  return Math.max(1, Math.floor(CONSULTAS_POR_CHUNK / Math.max(1, consultasPorCentro)));
}

/** ¿El error NO se arregla reintentando? (cuota diaria de Google,
 * límite del usuario o de la plataforma, sesión) — abortar. */
export function esErrorFatalBusqueda(e: unknown): boolean {
  if (!(e instanceof ErrorApi)) return false;
  if (
    e.codigo === "cuota_diaria" ||
    e.codigo === "limite_diario" ||
    e.codigo === "limite_global"
  ) {
    return true;
  }
  return /no autorizado|inicia sesión|api key|clave/i.test(e.message);
}

/** Esperas de reintento por chunk ante fallas TRANSITORIAS (504/red). */
export const ESPERAS_TRANSITORIAS_S = [2, 5, 10];

export interface OpcionesBusquedaLotes {
  /** Centros YA consolidados (consolidarCentros de lib/geo). */
  centros: Origin[];
  radius: number;
  categorias: SeleccionCategoria[];
  nameFilters: string[];
  excludes: string[];
  /** Reanudación: chunk 0-based desde el que continuar (los previos ya
   * están pagados y persistidos). */
  desdeLote?: number;
  /** Reanudación: POIs ya acumulados de los chunks previos (no se
   * re-consultan ni se re-pagan). */
  semilla?: Poi[];
  /** Progreso legible ("lote 2 de 5 · esperando cuota…"). */
  onEstado?: (texto: string) => void;
  /** POIs NUEVOS de cada chunk (para autosave incremental POR CHUNK). */
  onLote?: (nuevos: Poi[], lote: number, total: number) => Promise<void> | void;
  detenerRef?: { current: boolean };
  /** Etiqueta legible del análisis, para el log de consumo. */
  contexto?: string;
  /** Solicitud de corrida grande APROBADA (autoriza exceder límites). */
  solicitudId?: string;
}

export interface ResultadoBusquedaLotes {
  pois: Poi[];
  excluidos: number;
  descartados: number;
  /** false = detenida/cuota: el avance regresa igual (POIs acumulados). */
  completa: boolean;
  /** Chunk 0-based donde quedó (para reanudar con desdeLote). */
  loteFinal: number;
  totalLotes: number;
  /** Chunks (1-based) saltados tras agotar reintentos transitorios. */
  chunksFallidos: number[];
  /** Mensaje del error que interrumpió (cuota diaria / límite), si hubo. */
  interrupcion?: string;
  /** Consumo agregado de la corrida: llamadas pagadas a Google,
   * consultas servidas del caché ($0) y costo en MXN. */
  consumo: { pagadas: number; deCache: number; costoMxn: number };
}

/**
 * Búsqueda de POIs por chunks CORTOS alrededor de centros — el cliente
 * orquesta, el servidor procesa ~16 consultas por request:
 * - rate limit de Google → backoff automático con cuenta regresiva (el
 *   mismo chunk se reintenta; lo acumulado nunca se re-paga);
 * - falla TRANSITORIA (504 / red) → reintentos con backoff y, si el
 *   chunk sigue fallando, se salta y la corrida CONTINÚA;
 * - cuota diaria o límite de celdas → regresa lo acumulado con
 *   `completa: false` + `loteFinal` para reanudar después.
 * Dedupe por place_id entre chunks.
 */
export async function buscarPorLotes(
  o: OpcionesBusquedaLotes
): Promise<ResultadoBusquedaLotes> {
  const consultasCentro = consultasPorCentroDe(o.categorias, o.nameFilters);
  const tamanoLote = centrosPorChunk(consultasCentro);
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
    contexto: o.contexto,
    solicitudId: o.solicitudId,
  };

  const acumulados = new Map<string, Poi>(
    (o.semilla ?? []).map((p) => [p.placeId, p])
  );
  let excluidos = 0;
  let descartados = 0;
  const consumo = { pagadas: 0, deCache: 0, costoMxn: 0 };
  let esperasCuota = 0;
  let reintentosTransitorios = 0;
  const chunksFallidos: number[] = [];
  let interrupcion: string | undefined;

  let li = Math.min(Math.max(0, o.desdeLote ?? 0), lotes.length);
  for (; li < lotes.length; ) {
    if (o.detenerRef?.current) break;
    o.onEstado?.(
      `chunk ${li + 1} de ${lotes.length} · ${acumulados.size.toLocaleString("es-MX")} POIs`
    );
    let data: SearchResponse;
    try {
      data = await postJson<SearchResponse>("/api/search", {
        ...cuerpoBase,
        centers: lotes[li],
      } satisfies SearchRequest);
    } catch (e) {
      // 1) rate limit de Google: backoff largo, mismo chunk
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
        continue; // reintenta el MISMO chunk
      }
      // 2) fatal (cuota diaria / límite de celdas): abortar con avance
      if (esErrorFatalBusqueda(e)) {
        interrupcion = e instanceof Error ? e.message : "Error al buscar";
        break;
      }
      // 3) transitorio (504 / red): backoff corto y mismo chunk; si se
      //    agotan los reintentos, se SALTA y la corrida continúa
      if (reintentosTransitorios < ESPERAS_TRANSITORIAS_S.length) {
        const espera = ESPERAS_TRANSITORIAS_S[reintentosTransitorios];
        reintentosTransitorios++;
        o.onEstado?.(
          `chunk ${li + 1} falló (${e instanceof Error ? e.message.slice(0, 60) : "red"}) — reintento ${reintentosTransitorios} de ${ESPERAS_TRANSITORIAS_S.length} en ${espera}s`
        );
        await new Promise((r) => setTimeout(r, espera * 1000));
        continue;
      }
      chunksFallidos.push(li + 1);
      reintentosTransitorios = 0;
      li++;
      continue;
    }
    esperasCuota = 0;
    reintentosTransitorios = 0;
    excluidos += data.excluidos;
    descartados += data.descartadosPorNombre;
    if (data.consumo) {
      consumo.pagadas += data.consumo.pagadas;
      consumo.deCache += data.consumo.deCache;
      consumo.costoMxn =
        Math.round((consumo.costoMxn + data.consumo.costoMxn) * 100) / 100;
    }
    const nuevos: Poi[] = [];
    for (const p of data.pois) {
      if (!acumulados.has(p.placeId)) {
        acumulados.set(p.placeId, p);
        nuevos.push(p);
      }
    }
    // persistencia POR CHUNK: lo consultado a Google se paga una vez y
    // se guarda SIEMPRE — un timeout nunca vuelve a dejar 0 puntos
    await o.onLote?.(nuevos, li + 1, lotes.length);
    li++;
  }

  return {
    pois: Array.from(acumulados.values()),
    excluidos,
    descartados,
    completa: li >= lotes.length && !interrupcion,
    loteFinal: li,
    totalLotes: lotes.length,
    chunksFallidos,
    interrupcion,
    consumo,
  };
}
