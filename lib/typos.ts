// DETECCIÓN DE TYPOS EN TÉRMINOS — un término mal escrito ("cafateria")
// descarta miles de puntos YA PAGADOS. Se compara cada término contra
// el diccionario del dominio (catálogo curado: labels, textQuery, DENUE
// y sinónimos de lib/categories + palabras comunes) con distancia de
// edición ≤ 2. La sugerencia NUNCA bloquea: un clic corrige.

import { CATEGORIAS } from "./categories";
import { normalizarComparable } from "./geo";
import { createClient } from "./supabase/client";

/** Distancia de Levenshtein con corte temprano (> tope regresa tope+1). */
export function distanciaEdicion(a: string, b: string, tope = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let mejor = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, fila[j - 1] + 1, prev[j - 1] + costo);
      fila.push(v);
      if (v < mejor) mejor = v;
    }
    if (mejor > tope) return tope + 1; // toda la fila ya excede el tope
    prev = fila;
  }
  return prev[b.length];
}

/** Palabras comunes del dominio que no salen 1:1 del catálogo. */
const COMUNES = [
  "cafetería",
  "restaurante",
  "taquería",
  "panadería",
  "farmacia",
  "gasolinera",
  "papelería",
  "ferretería",
  "tortillería",
  "carnicería",
  "lavandería",
  "veterinaria",
  "refaccionaria",
  "pizzería",
  "hamburguesas",
  "abarrotes",
  "estética",
  "barbería",
  "gimnasio",
  "consultorio",
];

interface EntradaDiccionario {
  /** Forma bonita para sugerir ("cafetería"). */
  display: string;
  norm: string;
}

let diccionario: EntradaDiccionario[] | null = null;

/** Catálogo curado + sinónimos + comunes, normalizado una sola vez. */
function diccionarioDominio(): EntradaDiccionario[] {
  if (diccionario) return diccionario;
  const vistos = new Set<string>();
  const salida: EntradaDiccionario[] = [];
  const agregar = (display: string) => {
    const d = display.trim().toLowerCase();
    const norm = normalizarComparable(d);
    // entradas muy cortas generan falsos "¿quisiste decir?"
    if (norm.length < 5 || vistos.has(norm)) return;
    vistos.add(norm);
    salida.push({ display: d, norm });
  };
  for (const c of CATEGORIAS) {
    agregar(c.label);
    agregar(c.textQuery);
    if (c.denue) agregar(c.denue);
    for (const s of c.sinonimos ?? []) agregar(s);
  }
  for (const w of COMUNES) agregar(w);
  diccionario = salida;
  return salida;
}

/**
 * Sugerencia de corrección para un término de filtro: la entrada del
 * diccionario a distancia de edición 1-2 (0 = ya es correcto → null).
 * `extras` suma términos exitosos del historial de la sesión.
 */
export function sugerirCorreccion(
  termino: string,
  extras: string[] = []
): string | null {
  const limpio = termino.replace(/^"+|"+$/g, "").trim();
  const norm = normalizarComparable(limpio);
  if (norm.length < 5) return null;
  const candidatos: EntradaDiccionario[] = [
    ...diccionarioDominio(),
    ...extras
      .map((e) => e.trim())
      .filter((e) => normalizarComparable(e).length >= 5)
      .map((e) => ({ display: e.toLowerCase(), norm: normalizarComparable(e) })),
  ];
  let mejor: { entrada: EntradaDiccionario; d: number } | null = null;
  for (const entrada of candidatos) {
    const d = distanciaEdicion(norm, entrada.norm, 2);
    if (d === 0) return null; // el término ya está en el diccionario
    if (d <= 2 && (!mejor || d < mejor.d)) mejor = { entrada, d };
  }
  if (!mejor) return null;
  // conservar el modo exacto ("comillas") del término original
  return /^".*"$/.test(termino.trim())
    ? `"${mejor.entrada.display}"`
    : mejor.entrada.display;
}

/** Log de sugerencias ACEPTADAS (para medir cuánto dinero salvan):
 * queda en api_usage_log como método "typo_corregido" con los puntos
 * re-aprovechados como unidades gratis. Nunca lanza. */
export async function registrarTypoCorregido(
  original: string,
  corregido: string,
  puntosReaprovechados = 0
): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.rpc("registrar_consumo_api", {
      p_metodo: "typo_corregido",
      p_contexto: `"${original}" → "${corregido}"`,
      p_consultas: 0,
      p_de_cache: Math.max(1, puntosReaprovechados),
      p_costo_mxn: 0,
    });
  } catch {
    // el log es cortesía
  }
}
