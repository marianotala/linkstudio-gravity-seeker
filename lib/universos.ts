// Cálculo de universos demográficos, lado SERVIDOR.
// Fuente: Censo de Población y Vivienda 2020 (INEGI), AGEB urbana,
// por interpolación areal en PostGIS (RPC calcular_universos).
// El universo direccionable es un ESTIMADO: 18+ × factor smartphone ×
// factor de match, ambos configurables por variables de entorno.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeocercaUniverso, Universos } from "./types";

const FACTOR_SMARTPHONE =
  Number(process.env.FACTOR_SMARTPHONE) > 0
    ? Number(process.env.FACTOR_SMARTPHONE)
    : 0.82;
const FACTOR_MATCH =
  Number(process.env.FACTOR_MATCH) > 0 ? Number(process.env.FACTOR_MATCH) : 0.65;

export const ETIQUETA_FUENTE_UNIVERSOS =
  "Censo 2020 INEGI · AGEB urbana · interpolación areal · índice socioeconómico aproximado (proxy censal)";

const MENSAJE_NO_DISPONIBLE =
  "Universos no disponibles para esta zona — falta cargar la entidad en la base demográfica (corre scripts/ingesta-ageb).";

interface RpcUniversos {
  disponible: boolean;
  motivo?: string;
  agebs?: number;
  total?: {
    poblacion: number;
    adultos18: number;
    viviendas: number;
    nse_proxy: number | null;
    pct_18a24: number | null;
    pct_60ymas: number | null;
  };
  por_geocerca?: {
    id: string;
    poblacion: number;
    adultos18: number;
    nse_proxy: number | null;
  }[];
  agebs_geo?: Universos["agebsGeo"];
}

/**
 * Calcula universos sobre la unión de geocercas. NUNCA lanza: si algo
 * falla o la zona no tiene AGEBs cargados, regresa disponible=false
 * con mensaje claro — los POIs de la búsqueda no se bloquean.
 */
export async function calcularUniversos(
  supabase: SupabaseClient,
  geocercas: GeocercaUniverso[],
  opts?: { incluirAgebs?: boolean }
): Promise<Universos> {
  try {
    if (geocercas.length === 0) {
      return { disponible: false, mensaje: "Sin geocercas para calcular" };
    }
    const { data, error } = await supabase.rpc("calcular_universos", {
      p_geocercas: geocercas.slice(0, 2000),
      p_incluir_agebs: opts?.incluirAgebs ?? false,
    });
    if (error) {
      console.error("calcular_universos falló:", error.message);
      return { disponible: false, mensaje: MENSAJE_NO_DISPONIBLE };
    }
    const r = data as RpcUniversos;
    if (!r?.disponible || !r.total) {
      return { disponible: false, mensaje: MENSAJE_NO_DISPONIBLE };
    }
    return {
      disponible: true,
      fuente: ETIQUETA_FUENTE_UNIVERSOS,
      agebs: r.agebs,
      residencial: {
        poblacion: r.total.poblacion,
        adultos18: r.total.adultos18,
        viviendas: r.total.viviendas,
      },
      direccionable: {
        dispositivos: Math.round(
          r.total.adultos18 * FACTOR_SMARTPHONE * FACTOR_MATCH
        ),
        factorSmartphone: FACTOR_SMARTPHONE,
        factorMatch: FACTOR_MATCH,
      },
      perfil: {
        nseProxy: r.total.nse_proxy,
        pct18a24: r.total.pct_18a24,
        pct60ymas: r.total.pct_60ymas,
      },
      porGeocerca: r.por_geocerca ?? [],
      agebsGeo: r.agebs_geo ?? undefined,
    };
  } catch (e) {
    console.error("calcularUniversos:", e);
    return { disponible: false, mensaje: MENSAJE_NO_DISPONIBLE };
  }
}
