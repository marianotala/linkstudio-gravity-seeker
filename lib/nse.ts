// Clasificación del índice socioeconómico aproximado (proxy censal,
// 0-100) en niveles tipo NSE. Son cortes HEURÍSTICOS propios sobre el
// proxy (0.4·escolaridad + 0.3·autos + 0.3·internet) — NO es la regla
// NSE AMAI (esa requiere variables de encuesta que el censo no tiene).
//
// IMPORTANTE: estos cortes están duplicados en el RPC
// calcular_universos (supabase/schema.sql), que calcula la
// distribución ponderada por población sobre TODOS los AGEBs de la
// zona. Si cambias un corte aquí, cámbialo también allá.

export interface NivelNse {
  clave: "ab" | "c_mas" | "c" | "c_menos" | "d_mas" | "de";
  etiqueta: string;
  /** índice mínimo (inclusive) para caer en este nivel */
  desde: number;
  color: string;
}

export const NIVELES_NSE: NivelNse[] = [
  { clave: "ab", etiqueta: "AB", desde: 75, color: "#9d5cf0" },
  { clave: "c_mas", etiqueta: "C+", desde: 65, color: "#7d6cf0" },
  { clave: "c", etiqueta: "C", desde: 55, color: "#5b7ce8" },
  { clave: "c_menos", etiqueta: "C-", desde: 45, color: "#3f97d8" },
  { clave: "d_mas", etiqueta: "D+", desde: 35, color: "#2fb9e8" },
  { clave: "de", etiqueta: "DE", desde: 0, color: "#57707d" },
];

/** Nivel para un índice proxy 0-100 (null si no hay dato). */
export function clasificarNse(nseProxy: number | null): NivelNse | null {
  if (nseProxy === null || !Number.isFinite(nseProxy)) return null;
  return NIVELES_NSE.find((n) => nseProxy >= n.desde) ?? null;
}
