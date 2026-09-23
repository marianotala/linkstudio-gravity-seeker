// DEPURACIÓN INTELIGENTE DE CENSOS — coherencia de negocio. Los censos
// por keyword atrapan falsos positivos de otro giro ("Barbería Dominó"
// en un censo de Domino's Pizza). Dos capas:
// - CAPA 1 (automática, sin costo): perfil de giro con los types de
//   Google — los POIs con type incompatible con el perfil mayoritario
//   se marcan como SOSPECHOSOS para revisión humana. Nada se borra en
//   silencio: la IA/heurística propone, el humano dispone.
// - CAPA 2 (bajo demanda): juicio de pertenencia con Claude (modelo
//   económico, lotes de ~50 POIs) vía /api/depurar — la key de
//   Anthropic vive SOLO en el servidor, como la de Google.

import { postJson } from "./busqueda-cliente";
import type { Poi } from "./types";

/** Types de Google demasiado genéricos para definir un giro. */
const TYPES_GENERICOS = new Set([
  "establishment",
  "point_of_interest",
  "store",
  "food",
  "health",
  "finance",
  "general_contractor",
  "premise",
  "geocode",
  "political",
  "locality",
  "sublocality",
  "route",
]);

export interface Sospechoso {
  placeId: string;
  nombre: string;
  direccion: string;
  /** Razón legible ("giro barbería, no restaurante"). */
  razon: string;
  /** no_pertenece = pre-desmarcado; dudoso = marcado para ojo humano. */
  veredicto: "no_pertenece" | "dudoso";
  fuente: "tipos" | "ia";
}

const tiposDeGiro = (p: Poi) =>
  (p.types ?? []).filter((t) => !TYPES_GENERICOS.has(t));

/**
 * PERFIL DE GIRO del censo: los types NO genéricos que aparecen en una
 * fracción significativa de los resultados (ej. 95% de los "domino's"
 * son restaurant/meal_delivery/meal_takeaway).
 */
export function perfilDeGiro(pois: Poi[]): {
  nucleo: Set<string>;
  etiqueta: string;
} {
  const conteo = new Map<string, number>();
  let conTipos = 0;
  for (const p of pois) {
    const tipos = tiposDeGiro(p);
    if (tipos.length === 0) continue;
    conTipos++;
    for (const t of Array.from(new Set(tipos))) {
      conteo.set(t, (conteo.get(t) ?? 0) + 1);
    }
  }
  const nucleo = new Set<string>();
  // mayoritarios: presentes en ≥25% de los POIs con tipos (mínimo 3)
  const umbral = Math.max(3, Math.ceil(conTipos * 0.25));
  const ordenados = Array.from(conteo.entries()).sort((a, b) => b[1] - a[1]);
  for (const [t, n] of ordenados) {
    if (n >= umbral) nucleo.add(t);
  }
  // respaldo: con pocos datos, el type más frecuente define el giro
  if (nucleo.size === 0 && ordenados.length > 0 && conTipos >= 5) {
    nucleo.add(ordenados[0][0]);
  }
  return {
    nucleo,
    etiqueta: Array.from(nucleo).slice(0, 3).join(", ") || "sin perfil",
  };
}

/**
 * CAPA 1 — sospechosos por coherencia de types: POIs cuyo giro es
 * INCOMPATIBLE con el perfil mayoritario del censo. Solo marca cuando
 * hay señal real (el POI trae types de giro y NINGUNO coincide con el
 * núcleo); los POIs sin types (p. ej. DENUE) no se marcan.
 */
export function sospechososPorTipo(pois: Poi[]): Sospechoso[] {
  if (pois.length < 8) return []; // sin masa crítica no hay perfil
  const { nucleo, etiqueta } = perfilDeGiro(pois);
  if (nucleo.size === 0) return [];
  const salida: Sospechoso[] = [];
  for (const p of pois) {
    const tipos = tiposDeGiro(p);
    if (tipos.length === 0) continue;
    if (tipos.some((t) => nucleo.has(t))) continue;
    salida.push({
      placeId: p.placeId,
      nombre: p.nombre,
      direccion: p.direccion,
      razon: `giro "${tipos.slice(0, 2).join(", ")}" — el censo es ${etiqueta}`,
      veredicto: "no_pertenece",
      fuente: "tipos",
    });
  }
  return salida;
}

// ------------------------------------------------------------------
// CAPA 2 — depuración con IA (Claude, modelo económico, bajo demanda)
// ------------------------------------------------------------------

const LOTE_IA = 50;
// Haiku 4.5: $1 / $5 por MTok. Por POI ≈ 45 tokens de entrada + 22 de
// salida; overhead de prompt ≈ 400 tokens por lote.
const USD_POR_MTOK_IN = 1;
const USD_POR_MTOK_OUT = 5;

/** Costo estimado en USD de depurar n POIs con IA (transparencia). */
export function costoEstimadoIA(n: number): number {
  const lotes = Math.ceil(n / LOTE_IA);
  const tokensIn = n * 45 + lotes * 400;
  const tokensOut = n * 22;
  return (
    (tokensIn * USD_POR_MTOK_IN + tokensOut * USD_POR_MTOK_OUT) / 1_000_000
  );
}

interface VeredictoIA {
  id: string;
  v: "pertenece" | "no_pertenece" | "dudoso";
  r: string;
}

/**
 * Envía el censo por lotes a /api/depurar (Claude en el servidor) y
 * regresa los sospechosos ("no pertenece" pre-desmarcados con su razón;
 * "dudoso" marcados para ojo humano). La decisión final es del usuario.
 */
export async function depurarConIA(
  pois: Poi[],
  marca: string,
  giro: string,
  onEstado?: (texto: string) => void
): Promise<Sospechoso[]> {
  const porId = new Map(pois.map((p) => [p.placeId, p]));
  const salida: Sospechoso[] = [];
  for (let i = 0; i < pois.length; i += LOTE_IA) {
    const lote = pois.slice(i, i + LOTE_IA);
    onEstado?.(
      `Depurando con IA · lote ${Math.floor(i / LOTE_IA) + 1} de ${Math.ceil(pois.length / LOTE_IA)}…`
    );
    const { veredictos } = await postJson<{ veredictos: VeredictoIA[] }>(
      "/api/depurar",
      {
        marca,
        giro,
        pois: lote.map((p) => ({
          id: p.placeId,
          nombre: p.nombre,
          direccion: p.direccion,
          types: tiposDeGiro(p).slice(0, 6),
        })),
      }
    );
    for (const v of veredictos ?? []) {
      if (v.v === "pertenece") continue;
      const p = porId.get(v.id);
      if (!p) continue;
      salida.push({
        placeId: p.placeId,
        nombre: p.nombre,
        direccion: p.direccion,
        razon: v.r || (v.v === "dudoso" ? "revisar manualmente" : "no pertenece a la marca"),
        veredicto: v.v === "dudoso" ? "dudoso" : "no_pertenece",
        fuente: "ia",
      });
    }
  }
  return salida;
}
