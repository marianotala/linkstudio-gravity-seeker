// MARCA NORMALIZADA — agrupador único de marca para capas, exports y
// dedupe entre capas: el término que capturó al punto (limpio) o, sin
// término, el prefijo comercial del nombre (sin sufijos de sucursal).

import { normalizarComparable } from "./geo";

/** Palabras de sucursal/ubicación que NO son parte de la marca. */
const SUFIJOS_SUCURSAL = new Set([
  "sucursal",
  "suc",
  "plaza",
  "centro",
  "cc",
  "mall",
  "local",
  "unidad",
  "modulo",
  "km",
]);

/**
 * Marca normalizada de un punto (minúsculas, sin acentos):
 * - con término de captura: el término sin comillas, normalizado;
 * - sin término: los primeros 1-2 tokens comerciales del nombre
 *   ("Little Caesars Pizza Av. Juárez" → "little caesars").
 */
export function marcaNormalizada(nombre: string, termino?: string | null): string {
  if (termino) {
    return normalizarComparable(termino.replace(/^"+|"+$/g, ""));
  }
  const tokens = normalizarComparable(nombre)
    .split(" ")
    .filter((t) => t.length > 0 && !SUFIJOS_SUCURSAL.has(t));
  if (tokens.length === 0) return normalizarComparable(nombre);
  // un token largo suele ser la marca completa ("starbucks"); dos
  // tokens cubren marcas compuestas ("little caesars", "pizza hut")
  return tokens.slice(0, 2).join(" ");
}

/** ¿marcaA es MÁS específica que marcaB? (más tokens/caracteres: para
 * decidir en qué capa queda un punto duplicado entre capas). */
export function masEspecifica(a: string, b: string): boolean {
  const ta = a.split(" ").length;
  const tb = b.split(" ").length;
  if (ta !== tb) return ta > tb;
  return a.length > b.length;
}
