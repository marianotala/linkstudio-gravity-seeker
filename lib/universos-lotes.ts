// Universos A ESCALA: con cientos o miles de geocercas dispersas, la
// interpolación areal sobre la unión completa excede el timeout. El
// cliente agrupa las geocercas POR PROXIMIDAD en lotes chicos, pide
// las SUMAS CRUDAS de cada lote (RPC calcular_universos_crudo vía
// /api/universos con crudo:true) y las agrega aquí. La agregación es
// exacta porque suma crudos, no porcentajes: las identidades de
// edades se conservan y los seis rangos siguen sumando 100%.
// Corre en el CLIENTE (sin server-only) para orquestar los lotes con
// progreso y reintentos desde la UI.

import type { GeocercaUniverso, Universos } from "./types";
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

/**
 * Agrupa geocercas por proximidad espacial (retícula de 1°) y las
 * parte en lotes de hasta `maxPorLote`. El orden por celda mantiene
 * cada lote geográficamente compacto — los traslapes se deduplican
 * DENTRO del lote (ST_Union) y entre lotes vecinos son despreciables.
 */
export function agruparGeocercasPorProximidad(
  geocercas: GeocercaUniverso[],
  maxPorLote = LOTE_UNIVERSOS
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
  for (let i = 0; i < ordenadas.length; i += maxPorLote) {
    lotes.push(ordenadas.slice(i, i + maxPorLote));
  }
  return lotes;
}

// ------------------------------------------------------------------
// Subdivisión de geometrías GRANDES (radios de 10-30 km, viewports de
// ciudad completa): una sola unión gigante excede el timeout del RPC.
// Un círculo grande se parte en celdas de cuadrícula CLIPEADAS al
// círculo (celda ∩ círculo, exacto — validado en vivo al habitante) y
// un viewport grande en sub-rectángulos (teselado exacto). Las celdas
// no se traslapan entre lotes: la agregación de crudos es exacta.
// ------------------------------------------------------------------

/** Círculo con radio mayor a esto se subdivide en celdas. */
export const RADIO_SUBDIVIDIR_M = 8000;
/** Lado de las celdas al subdividir un círculo. */
const CELDA_CIRCULO_M = 4000;
/** Viewport con lado mayor a esto (km) se subdivide. */
const LADO_SUBDIVIDIR_VIEWPORT_KM = 25;
const PASO_VIEWPORT_KM = 18;
/** Área máxima (km²) que puede cargar un lote del RPC crudo. */
export const MAX_AREA_LOTE_KM2 = 300;

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

/**
 * Subdivide las geocercas grandes. Regresa la lista fina y si hubo
 * subdivisión (para decidir el camino por lotes).
 */
export function subdividirGeocercas(geocercas: GeocercaUniverso[]): {
  finas: GeocercaUniverso[];
  huboSubdivision: boolean;
} {
  const finas: GeocercaUniverso[] = [];
  let huboSubdivision = false;

  for (const g of geocercas) {
    // círculo grande → celdas clipeadas al círculo (exacto)
    if (
      g.lat !== undefined &&
      g.lng !== undefined &&
      g.radio_m !== undefined &&
      !g.viewport &&
      !g.cp &&
      g.radio_m > RADIO_SUBDIVIDIR_M
    ) {
      huboSubdivision = true;
      const dLat = CELDA_CIRCULO_M / 111320;
      const dLng =
        CELDA_CIRCULO_M /
        (111320 * Math.max(0.2, Math.cos((g.lat * Math.PI) / 180)));
      const n = Math.ceil(g.radio_m / CELDA_CIRCULO_M);
      const clip = { lat: g.lat, lng: g.lng, radio_m: g.radio_m };
      for (let i = -n - 1; i <= n; i++) {
        for (let j = -n - 1; j <= n; j++) {
          const south = g.lat + i * dLat;
          const north = south + dLat;
          const west = g.lng + j * dLng;
          const east = west + dLng;
          // ¿la celda toca el círculo? distancia del punto del
          // rectángulo más cercano al centro (aprox plana escalada)
          const cLat = Math.min(Math.max(g.lat, south), north);
          const cLng = Math.min(Math.max(g.lng, west), east);
          const dy = (cLat - g.lat) * 111320;
          const dx =
            (cLng - g.lng) *
            111320 *
            Math.max(0.2, Math.cos((g.lat * Math.PI) / 180));
          if (Math.sqrt(dx * dx + dy * dy) > g.radio_m) continue;
          finas.push({
            id: `${g.id}~${i}:${j}`,
            viewport: { north, south, east, west },
            clip,
          });
        }
      }
      continue;
    }
    // viewport grande → sub-rectángulos (teselado exacto, sin clip)
    if (g.viewport && !g.cp) {
      const midLat =
        ((g.viewport.north + g.viewport.south) / 2) * (Math.PI / 180);
      const wKm =
        Math.abs(g.viewport.east - g.viewport.west) *
        KM_POR_GRADO *
        Math.max(0.2, Math.cos(midLat));
      const hKm =
        Math.abs(g.viewport.north - g.viewport.south) * KM_POR_GRADO;
      if (Math.max(wKm, hKm) > LADO_SUBDIVIDIR_VIEWPORT_KM) {
        huboSubdivision = true;
        const nx = Math.max(1, Math.ceil(wKm / PASO_VIEWPORT_KM));
        const ny = Math.max(1, Math.ceil(hKm / PASO_VIEWPORT_KM));
        const dLng = (g.viewport.east - g.viewport.west) / nx;
        const dLat = (g.viewport.north - g.viewport.south) / ny;
        for (let iy = 0; iy < ny; iy++) {
          for (let ix = 0; ix < nx; ix++) {
            finas.push({
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
        continue;
      }
    }
    finas.push(g);
  }
  return { finas, huboSubdivision };
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
  const { finas, huboSubdivision } = subdividirGeocercas(geocercas);

  // geometría CHICA: un solo RPC — conserva porGeocerca y el detalle
  if (
    !huboSubdivision &&
    geocercas.length <= UMBRAL_UNIVERSOS_LOTES &&
    areaTotalKm2(geocercas) <= MAX_AREA_SENCILLO_KM2
  ) {
    try {
      const { universos } = await postUniversos<{ universos: Universos }>({
        geocercas,
      });
      return universos?.disponible ? { ...universos, criterio } : universos;
    } catch (e) {
      return {
        disponible: false,
        mensaje:
          e instanceof Error ? e.message : "Error al calcular universos",
      };
    }
  }

  // geometría GRANDE: lotes crudos con reintentos y agregación exacta
  const lotes = agruparGeocercasEnLotes(finas);
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
  return agregarUniversosCrudos(crudos, `${criterio}${nota}`);
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
  const agebs = ok.reduce((s, c) => s + c.agebs, 0);
  const rurales = ok.reduce((s, c) => s + c.rurales, 0);
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
