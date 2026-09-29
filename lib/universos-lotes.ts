// Universos A ESCALA: con cientos o miles de geocercas dispersas, la
// interpolación areal sobre la unión completa excede el timeout. El
// cliente agrupa las geocercas POR PROXIMIDAD en lotes chicos, pide
// las SUMAS CRUDAS de cada lote (RPC calcular_universos_crudo vía
// /api/universos con crudo:true) y las agrega aquí. La agregación es
// exacta porque suma crudos, no porcentajes: las identidades de
// edades se conservan y los seis rangos siguen sumando 100%.
// Corre en el CLIENTE (sin server-only) para orquestar los lotes con
// progreso y reintentos desde la UI.

import type { GeocercaUniverso, Universos, UniversoPorGeocerca } from "./types";
import { ETIQUETA_FUENTE_UNIVERSOS } from "./universos-etiquetas";

/** Geocercas por lote: cada unión queda local y el GIST sí filtra. */
export const LOTE_UNIVERSOS = 120;
/** Umbral para usar la ruta por lotes en vez del RPC único. */
export const UMBRAL_UNIVERSOS_LOTES = 150;

/** Sumas crudas de un lote (espejo del RPC calcular_universos_crudo). */
export interface UniversosCrudo {
  ok: boolean;
  motivo?: string;
  agebs: number;
  rurales: number;
  /** Claves de los AGEBs/localidades del lote — para contar zonas
   * DISTINTAS al agregar (un AGEB puede tocar varios lotes). */
  ageb_ids?: string[];
  rural_ids?: string[];
  pob_u: number;
  adultos_u: number;
  viv_u: number;
  pobfem_u: number | null;
  pobmas_u: number | null;
  e18a24_u: number;
  e25a59_u: number;
  e60a64_u: number;
  e65_u: number;
  e60_u: number;
  s_nse: number;
  w_nse: number;
  w_ab: number;
  w_cmas: number;
  w_c: number;
  w_cmenos: number;
  w_dmas: number;
  w_de: number;
  pob_r: number;
  adultos_r: number;
  viv_r: number;
  pobfem_r: number | null;
  pobmas_r: number | null;
  e18a24_r: number;
  e25a59_r: number;
  e60_r: number;
}

/** Centro representativo de una geocerca para agruparla. */
function llaveEspacial(g: GeocercaUniverso): { lat: number; lng: number } {
  if (g.lat !== undefined && g.lng !== undefined) return { lat: g.lat, lng: g.lng };
  if (g.viewport)
    return {
      lat: (g.viewport.north + g.viewport.south) / 2,
      lng: (g.viewport.east + g.viewport.west) / 2,
    };
  // CP sin coordenadas: aproximar por prefijo (entidad) para no mezclar
  // extremos del país en un lote
  const pref = Number((g.cp ?? "00").slice(0, 2));
  return { lat: pref, lng: 0 };
}

// ------------------------------------------------------------------
// GEOMETRÍA DISJUNTA para el camino por lotes. El RPC crudo deduplica
// (ST_Union) DENTRO de cada lote, pero los lotes se SUMAN entre sí:
// mandar buffers crudos traslapados repartidos en varios lotes contaba
// a la misma población 2-3 veces (bug del consolidado Domino's GDL:
// 7.49M "adultos" contra un techo real de ~3.4M en la ZMG). El fix:
// TODOS los círculos se convierten en celdas de una MALLA GLOBAL
// ALINEADA; cada celda aparece UNA sola vez, clipeada en el servidor a
// la UNIÓN de los círculos que la tocan (clips múltiples). Las celdas
// son disjuntas por construcción → la suma entre lotes es EXACTA
// (validado en vivo: celda con clips [A,B] == unión directa de A+B al
// decimal). Los viewports grandes se teselan (exacto) como antes.
// ------------------------------------------------------------------

/** Círculo con radio mayor a esto obliga el camino por lotes. */
export const RADIO_SUBDIVIDIR_M = 8000;
/** Lado de las celdas de la malla global (~4 km). */
export const CELDA_GLOBAL_M = 4000;
/** Techo de clips por celda: con más círculos que esto tocando una
 * celda de 4 km, se conservan los más cercanos (el resto aporta
 * orillas ya cubiertas — error despreciable, jamás sobreconteo). */
const MAX_CLIPS_CELDA = 60;
/** Viewport con lado mayor a esto (km) se subdivide. */
const LADO_SUBDIVIDIR_VIEWPORT_KM = 25;
const PASO_VIEWPORT_KM = 18;
/** Área máxima (km²) que puede cargar un lote del RPC crudo. */
export const MAX_AREA_LOTE_KM2 = 300;

interface Circulo {
  lat: number;
  lng: number;
  radio_m: number;
}

/**
 * Convierte un conjunto de círculos (buffers) en celdas DISJUNTAS de
 * la malla global. Una celda totalmente cubierta por algún círculo va
 * completa (sin clip); una celda parcial lleva `clips` con los
 * círculos que la tocan (el servidor hace celda ∩ unión de buffers).
 */
export function celdasDeCirculos(circulos: Circulo[]): GeocercaUniverso[] {
  if (circulos.length === 0) return [];
  const latRef =
    circulos.reduce((s, c) => s + c.lat, 0) / circulos.length;
  const mLat = 111320;
  const mLng = 111320 * Math.max(0.2, Math.cos((latRef * Math.PI) / 180));
  const dLat = CELDA_GLOBAL_M / mLat;
  const dLng = CELDA_GLOBAL_M / mLng;

  const celdas = new Map<
    string,
    { i: number; j: number; circulos: Circulo[]; llena: boolean }
  >();
  for (const c of circulos) {
    const iMin = Math.floor((c.lat - c.radio_m / mLat) / dLat);
    const iMax = Math.floor((c.lat + c.radio_m / mLat) / dLat);
    const jMin = Math.floor((c.lng - c.radio_m / mLng) / dLng);
    const jMax = Math.floor((c.lng + c.radio_m / mLng) / dLng);
    for (let i = iMin; i <= iMax; i++) {
      for (let j = jMin; j <= jMax; j++) {
        const south = i * dLat;
        const north = (i + 1) * dLat;
        const west = j * dLng;
        const east = (j + 1) * dLng;
        // punto de la celda MÁS CERCANO al centro: ¿toca el círculo?
        const cLat = Math.min(Math.max(c.lat, south), north);
        const cLng = Math.min(Math.max(c.lng, west), east);
        const dy = (cLat - c.lat) * mLat;
        const dx = (cLng - c.lng) * mLng;
        if (dx * dx + dy * dy > c.radio_m * c.radio_m) continue;
        const k = `${i}:${j}`;
        let celda = celdas.get(k);
        if (!celda) {
          celda = { i, j, circulos: [], llena: false };
          celdas.set(k, celda);
        }
        if (celda.llena) continue;
        // ¿el círculo cubre la celda COMPLETA? (esquina más lejana)
        const fLat = north - c.lat > c.lat - south ? north : south;
        const fLng = east - c.lng > c.lng - west ? east : west;
        const fy = (fLat - c.lat) * mLat;
        const fx = (fLng - c.lng) * mLng;
        if (fx * fx + fy * fy <= c.radio_m * c.radio_m) {
          celda.llena = true;
          celda.circulos = [];
        } else {
          celda.circulos.push(c);
        }
      }
    }
  }

  const salida: GeocercaUniverso[] = [];
  celdas.forEach((celda, k) => {
    const viewport = {
      south: celda.i * dLat,
      north: (celda.i + 1) * dLat,
      west: celda.j * dLng,
      east: (celda.j + 1) * dLng,
    };
    if (celda.llena || celda.circulos.length === 0) {
      salida.push({ id: `celda:${k}`, viewport });
      return;
    }
    let clips = celda.circulos;
    if (clips.length > MAX_CLIPS_CELDA) {
      const cy = (viewport.south + viewport.north) / 2;
      const cx = (viewport.west + viewport.east) / 2;
      const holgura = (c: Circulo) =>
        Math.hypot((c.lat - cy) * mLat, (c.lng - cx) * mLng) - c.radio_m;
      clips = [...clips].sort((a, b) => holgura(a) - holgura(b)).slice(0, MAX_CLIPS_CELDA);
    }
    salida.push({
      id: `celda:${k}`,
      viewport,
      clips: clips.map((c) => ({
        lat: c.lat,
        lng: c.lng,
        radio_m: Math.round(c.radio_m),
      })),
    });
  });
  return salida;
}

const KM_POR_GRADO = 111.32;

/** Área estimada (km²) de una geocerca, para acotar los lotes. */
export function areaGeocercaKm2(g: GeocercaUniverso): number {
  if (g.viewport) {
    const midLat = ((g.viewport.north + g.viewport.south) / 2) * (Math.PI / 180);
    const w =
      Math.abs(g.viewport.east - g.viewport.west) *
      KM_POR_GRADO *
      Math.max(0.2, Math.cos(midLat));
    const h = Math.abs(g.viewport.north - g.viewport.south) * KM_POR_GRADO;
    return w * h;
  }
  if (g.lat !== undefined && g.radio_m !== undefined) {
    return (Math.PI * g.radio_m * g.radio_m) / 1e6;
  }
  return 3; // CP: polígono chico típico
}

/** Área total estimada (km²) — para decidir servidor vs lotes. */
export function areaTotalKm2(geocercas: GeocercaUniverso[]): number {
  return geocercas.reduce((s, g) => s + areaGeocercaKm2(g), 0);
}

/** Teselado exacto de un viewport grande en sub-rectángulos. */
function teselarViewport(g: GeocercaUniverso): GeocercaUniverso[] {
  if (!g.viewport) return [g];
  const midLat = ((g.viewport.north + g.viewport.south) / 2) * (Math.PI / 180);
  const wKm =
    Math.abs(g.viewport.east - g.viewport.west) *
    KM_POR_GRADO *
    Math.max(0.2, Math.cos(midLat));
  const hKm = Math.abs(g.viewport.north - g.viewport.south) * KM_POR_GRADO;
  if (Math.max(wKm, hKm) <= LADO_SUBDIVIDIR_VIEWPORT_KM) return [g];
  const salida: GeocercaUniverso[] = [];
  const nx = Math.max(1, Math.ceil(wKm / PASO_VIEWPORT_KM));
  const ny = Math.max(1, Math.ceil(hKm / PASO_VIEWPORT_KM));
  const dLng = (g.viewport.east - g.viewport.west) / nx;
  const dLat = (g.viewport.north - g.viewport.south) / ny;
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      salida.push({
        id: `${g.id}~${ix}:${iy}`,
        viewport: {
          west: g.viewport.west + ix * dLng,
          east: g.viewport.west + (ix + 1) * dLng,
          south: g.viewport.south + iy * dLat,
          north: g.viewport.south + (iy + 1) * dLat,
        },
      });
    }
  }
  return salida;
}

/**
 * Vuelve DISJUNTA la geometría para el camino por lotes: todos los
 * círculos → celdas de malla global (sin traslape entre celdas ni
 * entre lotes); viewports grandes → teselas exactas; CPs y viewports
 * chicos pasan tal cual. Con la geometría disjunta, la SUMA de los
 * crudos de los lotes equivale a la interpolación areal de la unión
 * completa — sin doble conteo.
 */
export function volverGeometriaDisjunta(
  geocercas: GeocercaUniverso[]
): GeocercaUniverso[] {
  const circulos: Circulo[] = [];
  const resto: GeocercaUniverso[] = [];
  for (const g of geocercas) {
    if (
      g.lat !== undefined &&
      g.lng !== undefined &&
      g.radio_m !== undefined &&
      !g.viewport &&
      !g.cp
    ) {
      circulos.push({ lat: g.lat, lng: g.lng, radio_m: g.radio_m });
    } else if (g.viewport && !g.cp) {
      resto.push(...teselarViewport(g));
    } else {
      resto.push(g);
    }
  }
  return [...celdasDeCirculos(circulos), ...resto];
}

/**
 * Agrupa por proximidad y parte en lotes acotados por CONTEO y por
 * ÁREA estimada: celdas de subdivisión (16 km² c/u) llenan un lote
 * mucho antes que buffers de 500 m — cada unión queda barata.
 */
export function agruparGeocercasEnLotes(
  geocercas: GeocercaUniverso[],
  maxPorLote = LOTE_UNIVERSOS,
  maxAreaKm2 = MAX_AREA_LOTE_KM2
): GeocercaUniverso[][] {
  const ordenadas = geocercas
    .map((g) => ({ g, c: llaveEspacial(g) }))
    .sort((a, b) => {
      const ca = `${Math.floor(a.c.lat)}:${Math.floor(a.c.lng)}`;
      const cb = `${Math.floor(b.c.lat)}:${Math.floor(b.c.lng)}`;
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a.c.lat - b.c.lat || a.c.lng - b.c.lng;
    })
    .map(({ g }) => g);
  const lotes: GeocercaUniverso[][] = [];
  let actual: GeocercaUniverso[] = [];
  let area = 0;
  for (const g of ordenadas) {
    const a = areaGeocercaKm2(g);
    if (actual.length > 0 && (actual.length >= maxPorLote || area + a > maxAreaKm2)) {
      lotes.push(actual);
      actual = [];
      area = 0;
    }
    actual.push(g);
    area += a;
  }
  if (actual.length > 0) lotes.push(actual);
  return lotes;
}

// ------------------------------------------------------------------
// PIEZA ÚNICA del cálculo de universos desde el cliente — la comparten
// TODOS los modos (orígenes, zona, CPs, censo de marca, censo
// territorial, OOH). Geometría chica → RPC único (conserva el desglose
// por geocerca); geometría grande o muchas geocercas → subdivisión +
// lotes crudos con reintentos y progreso. Cada fix aquí aplica a todos
// los modos de una vez.
// ------------------------------------------------------------------

/** Área total máxima para el RPC único (sin lotes). */
export const MAX_AREA_SENCILLO_KM2 = 300;

export interface OpcionesUniversosCliente {
  /** Progreso del camino por lotes (lote actual 0-based, total). */
  onProgreso?: (lote: number, totalLotes: number) => void;
  /** true = abortar entre lotes (botón Detener). */
  cancelado?: () => boolean;
}

async function postUniversos<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/universos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

export async function calcularUniversosCliente(
  geocercas: GeocercaUniverso[],
  criterio: string,
  opciones: OpcionesUniversosCliente = {}
): Promise<Universos> {
  if (geocercas.length === 0) {
    return { disponible: false, mensaje: "Sin geocercas para calcular" };
  }
  const hayCirculoGrande = geocercas.some(
    (g) =>
      g.radio_m !== undefined &&
      !g.viewport &&
      !g.cp &&
      g.radio_m > RADIO_SUBDIVIDIR_M
  );

  // geometría CHICA: un solo RPC — la unión completa en una llamada es
  // EXACTA por construcción y conserva porGeocerca y el detalle
  if (
    !hayCirculoGrande &&
    geocercas.length <= UMBRAL_UNIVERSOS_LOTES &&
    areaTotalKm2(geocercas) <= MAX_AREA_SENCILLO_KM2
  ) {
    try {
      const { universos } = await postUniversos<{ universos: Universos }>({
        geocercas,
      });
      return await verificarTechoUniverso(
        geocercas,
        universos?.disponible ? { ...universos, criterio } : universos
      );
    } catch (e) {
      return {
        disponible: false,
        mensaje:
          e instanceof Error ? e.message : "Error al calcular universos",
      };
    }
  }

  // geometría GRANDE: se vuelve DISJUNTA (celdas de malla global con
  // clips múltiples) y se reparte en lotes — la suma de crudos es
  // exacta porque ninguna celda se repite ni se traslapa entre lotes
  const lotes = agruparGeocercasEnLotes(volverGeometriaDisjunta(geocercas));
  const crudos: UniversosCrudo[] = [];
  const fallidos: number[] = [];
  for (let i = 0; i < lotes.length; i++) {
    if (opciones.cancelado?.()) {
      return {
        disponible: false,
        mensaje: `Cálculo detenido en el lote ${i + 1} de ${lotes.length}.`,
      };
    }
    opciones.onProgreso?.(i, lotes.length);
    let logrado = false;
    let ultimoError = "";
    for (let intento = 0; intento < 3 && !logrado; intento++) {
      try {
        const { crudo } = await postUniversos<{ crudo: UniversosCrudo }>({
          geocercas: lotes[i],
          crudo: true,
        });
        if (crudo?.ok) crudos.push(crudo);
        logrado = true;
      } catch (e) {
        ultimoError = e instanceof Error ? e.message : "error de consulta";
        await new Promise((r) => setTimeout(r, 800 * (intento + 1)));
      }
    }
    if (!logrado) {
      fallidos.push(i + 1);
      console.error(
        `Universos: el lote ${i + 1} de ${lotes.length} falló tras 3 intentos: ${ultimoError}`
      );
    }
  }
  if (crudos.length === 0) {
    return {
      disponible: false,
      mensaje: `Los ${lotes.length} lotes de universos fallaron — reintenta; si persiste, avisa al admin.`,
    };
  }
  const nota =
    fallidos.length > 0
      ? ` · ${fallidos.length} de ${lotes.length} lotes fallaron (${fallidos.slice(0, 5).join(", ")}${fallidos.length > 5 ? "…" : ""}) y quedaron fuera del total`
      : "";
  return verificarTechoUniverso(
    geocercas,
    agregarUniversosCrudos(crudos, `${criterio}${nota}`)
  );
}

// ------------------------------------------------------------------
// VALIDACIÓN DE SANIDAD permanente: el universo de cualquier geometría
// no puede exceder la población 18+ de los AGEBs que intersectan su
// ENVOLVENTE (+ la rural dentro). Si el cálculo la excede hay doble
// conteo: advertencia visible + log — un número físicamente imposible
// nunca vuelve a llegar a un PDF (los exports se bloquean con la
// advertencia presente).
// ------------------------------------------------------------------

/** Envolvente de las geocercas; null si alguna no tiene coordenadas
 * (CP puro) — sin envolvente confiable no se valida. */
export function bboxDeGeocercas(
  geocercas: GeocercaUniverso[]
): { north: number; south: number; east: number; west: number } | null {
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  let alguna = false;
  for (const g of geocercas) {
    if (g.viewport) {
      north = Math.max(north, g.viewport.north);
      south = Math.min(south, g.viewport.south);
      east = Math.max(east, g.viewport.east);
      west = Math.min(west, g.viewport.west);
      alguna = true;
    } else if (g.lat !== undefined && g.lng !== undefined) {
      const r = g.radio_m ?? 0;
      const dLat = r / 111320;
      const dLng =
        r / (111320 * Math.max(0.2, Math.cos((g.lat * Math.PI) / 180)));
      north = Math.max(north, g.lat + dLat);
      south = Math.min(south, g.lat - dLat);
      east = Math.max(east, g.lng + dLng);
      west = Math.min(west, g.lng - dLng);
      alguna = true;
    } else {
      // CP sin coordenadas: la envolvente no lo cubriría → no validar
      return null;
    }
  }
  return alguna ? { north, south, east, west } : null;
}

async function verificarTechoUniverso(
  geocercas: GeocercaUniverso[],
  u: Universos
): Promise<Universos> {
  if (!u.disponible || !u.residencial) return u;
  const bbox = bboxDeGeocercas(geocercas);
  if (!bbox) return u;
  try {
    const { techo } = await postUniversos<{
      techo: { adultos_techo: number; agebs_techo: number } | null;
    }>({ techo: bbox });
    if (
      techo &&
      techo.adultos_techo > 0 &&
      u.residencial.adultos18 > techo.adultos_techo * 1.001
    ) {
      const advertencia = `NÚMERO IMPOSIBLE: el universo calculado (${u.residencial.adultos18.toLocaleString("es-MX")} adultos 18+) excede el techo físico de su zona (${Math.round(techo.adultos_techo).toLocaleString("es-MX")} adultos en los ${techo.agebs_techo.toLocaleString("es-MX")} AGEBs de la envolvente). Hay doble conteo: recalcula y, si persiste, avisa al admin. Este universo NO se puede exportar.`;
      console.error("[universos] validación de sanidad:", advertencia, {
        geocercas: geocercas.length,
        criterio: u.criterio,
      });
      return { ...u, advertencia };
    }
  } catch (e) {
    console.error("No se pudo validar el techo del universo:", e);
  }
  return u;
}

/**
 * Universos POR GEOCERCA INDIVIDUAL (detalle por punto): pide el RPC
 * COMPLETO en pasadas batched acotadas por conteo y área — cada lote
 * conserva su desglose por_geocerca (población, adultos 18+ y NSE del
 * buffer de CADA punto por separado). PostGIS propio: costo cero de
 * APIs. Regresa un mapa id → detalle.
 */
export async function calcularUniversosPorGeocerca(
  geocercas: GeocercaUniverso[],
  opciones: OpcionesUniversosCliente = {}
): Promise<Map<string, UniversoPorGeocerca>> {
  const salida = new Map<string, UniversoPorGeocerca>();
  if (geocercas.length === 0) return salida;
  // el detalle exige el RPC completo (por_geocerca): lotes chicos por
  // conteo Y por área (radios de 5 km llenan 300 km² con ~3 buffers)
  const lotes = agruparGeocercasEnLotes(
    geocercas,
    UMBRAL_UNIVERSOS_LOTES,
    MAX_AREA_SENCILLO_KM2
  );
  for (let i = 0; i < lotes.length; i++) {
    if (opciones.cancelado?.()) break;
    opciones.onProgreso?.(i, lotes.length);
    let logrado = false;
    for (let intento = 0; intento < 3 && !logrado; intento++) {
      try {
        const { universos } = await postUniversos<{ universos: Universos }>({
          geocercas: lotes[i],
        });
        for (const g of universos?.porGeocerca ?? []) {
          salida.set(g.id, g);
        }
        logrado = true;
      } catch {
        await new Promise((r) => setTimeout(r, 800 * (intento + 1)));
      }
    }
    // un lote fallido no tira el detalle: esos puntos quedan sin dato
  }
  return salida;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Agrega las sumas crudas de todos los lotes en un objeto Universos
 * (misma forma que regresa el RPC calcular_universos completo).
 */
export function agregarUniversosCrudos(
  crudos: UniversosCrudo[],
  criterio?: string
): Universos {
  const ok = crudos.filter((c) => c.ok);
  // zonas DISTINTAS: un AGEB puede tocar varios lotes — se cuenta una
  // vez (la población no se duplica: cada lote suma solo su fracción)
  const contarDistintos = (
    ids: (string[] | undefined)[],
    respaldo: number
  ): number => {
    if (ids.some((x) => x === undefined)) return respaldo;
    const set = new Set<string>();
    for (const lista of ids) for (const id of lista ?? []) set.add(id);
    return set.size;
  };
  const agebs = contarDistintos(
    ok.map((c) => c.ageb_ids),
    ok.reduce((s, c) => s + c.agebs, 0)
  );
  const rurales = contarDistintos(
    ok.map((c) => c.rural_ids),
    ok.reduce((s, c) => s + c.rurales, 0)
  );
  if (agebs === 0 && rurales === 0) {
    return {
      disponible: false,
      mensaje:
        "Sin datos demográficos para estas zonas — carga las entidades en Admin.",
    };
  }
  const suma = (f: (c: UniversosCrudo) => number) =>
    ok.reduce((s, c) => s + f(c), 0);
  // nullable: null solo si TODOS los lotes vinieron null
  const sumaNullable = (f: (c: UniversosCrudo) => number | null) => {
    const conDato = ok.filter((c) => f(c) !== null);
    return conDato.length === 0
      ? null
      : conDato.reduce((s, c) => s + (f(c) ?? 0), 0);
  };

  const pobU = suma((c) => c.pob_u);
  const pobR = suma((c) => c.pob_r);
  const adU = suma((c) => c.adultos_u);
  const adR = suma((c) => c.adultos_r);
  const pob = pobU + pobR;
  const base18 = adU + adR;

  const e18a24 = suma((c) => c.e18a24_u) + suma((c) => c.e18a24_r);
  const e25a59 = suma((c) => c.e25a59_u) + suma((c) => c.e25a59_r);
  const e60r = suma((c) => c.e60_r);
  // el bloque 60+ rural se reparte 60-64/65+ con estructura nacional
  // (0.327/0.673, espejo de lib/edades.ts y del RPC fase 12)
  const e60a64 = suma((c) => c.e60a64_u) + e60r * 0.327;
  const e65 = suma((c) => c.e65_u) + e60r * 0.673;
  const e60 = suma((c) => c.e60_u) + e60r;

  const wNse = suma((c) => c.w_nse);
  const sNse = suma((c) => c.s_nse);
  const pobfem = sumaNullable((c) => c.pobfem_u);
  const pobfemR = sumaNullable((c) => c.pobfem_r);
  const pobmas = sumaNullable((c) => c.pobmas_u);
  const pobmasR = sumaNullable((c) => c.pobmas_r);

  return {
    disponible: true,
    fuente: ETIQUETA_FUENTE_UNIVERSOS,
    criterio,
    agebs,
    rurales,
    residencial: {
      poblacion: Math.round(pob),
      adultos18: Math.round(base18),
      viviendas: Math.round(suma((c) => c.viv_u) + suma((c) => c.viv_r)),
      pobfem:
        pobfem === null && pobfemR === null
          ? null
          : Math.round((pobfem ?? 0) + (pobfemR ?? 0)),
      pobmas:
        pobmas === null && pobmasR === null
          ? null
          : Math.round((pobmas ?? 0) + (pobmasR ?? 0)),
      pobRural: Math.round(pobR),
      adultos18Rural: Math.round(adR),
    },
    perfil: {
      nseProxy: wNse > 0 ? r1(sNse / wNse) : null,
      pct18a24: pob > 0 ? r1((100 * e18a24) / pob) : null,
      pct60ymas: pob > 0 ? r1((100 * e60) / pob) : null,
      edades:
        base18 > 0
          ? {
              pct18a24: r1((100 * e18a24) / base18),
              pct25a59: r1((100 * e25a59) / base18),
              pct60a64: r1((100 * e60a64) / base18),
              pct65ymas: r1((100 * e65) / base18),
              pct60ymas: r1((100 * e60) / base18),
            }
          : null,
      nseDist:
        wNse > 0
          ? {
              ab: r1((100 * suma((c) => c.w_ab)) / wNse),
              c_mas: r1((100 * suma((c) => c.w_cmas)) / wNse),
              c: r1((100 * suma((c) => c.w_c)) / wNse),
              c_menos: r1((100 * suma((c) => c.w_cmenos)) / wNse),
              d_mas: r1((100 * suma((c) => c.w_dmas)) / wNse),
              de: r1((100 * suma((c) => c.w_de)) / wNse),
            }
          : null,
    },
    // con miles de geocercas no hay desglose por geocerca ni por AGEB
    porGeocerca: [],
    porAgeb: [],
  };
}
