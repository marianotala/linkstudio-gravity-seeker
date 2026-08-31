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
