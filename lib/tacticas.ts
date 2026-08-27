// Catálogo de tácticas Gravity (nombres y descriptores OFICIALES del
// pitch deck — no reescribir). Vive fuera de plan-pdf.tsx para que la
// UI de Seeker (selector de tácticas del Export plan) pueda importarlo
// sin arrastrar @react-pdf/renderer al bundle principal.

import type { SearchMode } from "./types";

export type TacticaClave =
  | "poi"
  | "conquista"
  | "proximidad"
  | "trade"
  | "targeting"
  | "pdooh"
  | "audiencias";

export const TACTICAS: Record<
  TacticaClave,
  { nombre: string; descriptor: string }
> = {
  poi: { nombre: "Geo-Fence POI", descriptor: "Quién visita lugares clave" },
  conquista: { nombre: "Geo-Fence Conquista", descriptor: "Quién visita a tu competencia" },
  proximidad: { nombre: "Geo-Fence Proximidad", descriptor: "Quién está cerca ahora" },
  trade: { nombre: "Geo-Trade Area", descriptor: "Dónde están tus próximos clientes" },
  targeting: { nombre: "Geo-Targeting", descriptor: "Quién vive y busca en el territorio" },
  pdooh: { nombre: "Geo-PDOOH", descriptor: "El exterior, ahora medible" },
  audiencias: { nombre: "Geo-Audiencias", descriptor: "Marcas sin punto de venta" },
};

/** Orden canónico de las 7 tácticas (el del deck). */
export const CLAVES_TACTICAS: TacticaClave[] = [
  "poi",
  "conquista",
  "proximidad",
  "trade",
  "targeting",
  "pdooh",
  "audiencias",
];

/**
 * Tácticas sugeridas según el modo del análisis (3-4, las más
 * relevantes). Son el DEFAULT pre-marcado del selector del Export
 * plan: el vendedor puede editarlas antes de exportar.
 */
export function tacticasParaModo(
  modo: SearchMode,
  esCompetencia: boolean,
  multiCapa = false
): TacticaClave[] {
  // varias categorías censadas → activación multi-categoría del
  // territorio: Geo-Fence POI + Geo-Targeting encabezan el set
  if (multiCapa) {
    return modo === "cp"
      ? ["poi", "targeting", "pdooh"]
      : ["poi", "targeting", "trade"];
  }
  switch (modo) {
    case "census":
      return esCompetencia
        ? ["conquista", "poi", "trade", "proximidad"]
        : ["poi", "trade", "proximidad"];
    case "cp":
      return ["targeting", "pdooh", "poi"];
    case "territorial":
      return ["audiencias", "poi", "targeting"];
    case "zone":
      return ["targeting", "poi", "trade"];
    default:
      return ["poi", "proximidad", "trade"];
  }
}
