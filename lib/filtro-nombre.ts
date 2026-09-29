// FILTRO ESTRICTO DE NOMBRE — espejo CLIENTE de las reglas del
// servidor (/api/search), una sola fuente para el re-filtrado local,
// la división en capas y el rescate de descartados:
// - término sin comillas: TODAS sus palabras aparecen en el nombre
//   (sin acentos ni puntuación) — "7 eleven" atrapa "7-Eleven";
// - término "con comillas": EXACTO INTELIGENTE — el nombre EMPIEZA con
//   el término (frontera de palabra);
// - exclusiones: sobre nombre + types con la misma normalización.

import { esNombreBasura, normalizarComparable } from "./geo";

export interface MatcherTermino {
  termino: string;
  exacto: boolean;
  norm: string;
  tokens: string[];
}

export function matchersDe(terminos: string[]): MatcherTermino[] {
  return terminos
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const exacto = /^".*"$/.test(t);
      const norm = normalizarComparable(exacto ? t.slice(1, -1) : t);
      return { termino: t, exacto, norm, tokens: norm.split(" ").filter(Boolean) };
    });
}

/** PRIMER término que captura el nombre (regla del servidor), o null. */
export function terminoQueCaptura(
  nombre: string,
  matchers: MatcherTermino[]
): string | null {
  const n = normalizarComparable(nombre);
  const captura = matchers.find((m) =>
    m.exacto
      ? m.norm.length > 0 && (n === m.norm || n.startsWith(m.norm + " "))
      : m.tokens.length > 0 && m.tokens.every((t) => n.includes(t))
  );
  return captura?.termino ?? null;
}

/** ¿El punto cae por una exclusión de marca? (nombre + types). */
export function excluidoPor(
  nombre: string,
  types: string[],
  exclusiones: string[]
): boolean {
  if (exclusiones.length === 0) return false;
  const pajar = normalizarComparable(`${nombre} ${types.join(" ")}`);
  return exclusiones
    .map(normalizarComparable)
    .filter(Boolean)
    .some((t) => pajar.includes(t));
}

export interface VeredictoFiltro {
  pasa: boolean;
  termino: string | null;
  motivo: "nombre" | "exclusion" | "calidad" | null;
}

/** Aplica calidad + exclusiones + filtro estricto (si hay términos). */
export function aplicarFiltroNombre(
  punto: { nombre: string; types: string[] },
  matchers: MatcherTermino[],
  exclusiones: string[]
): VeredictoFiltro {
  if (esNombreBasura(punto.nombre)) {
    return { pasa: false, termino: null, motivo: "calidad" };
  }
  if (excluidoPor(punto.nombre, punto.types, exclusiones)) {
    return { pasa: false, termino: null, motivo: "exclusion" };
  }
  if (matchers.length === 0) return { pasa: true, termino: null, motivo: null };
  const termino = terminoQueCaptura(punto.nombre, matchers);
  return termino
    ? { pasa: true, termino, motivo: null }
    : { pasa: false, termino: null, motivo: "nombre" };
}
