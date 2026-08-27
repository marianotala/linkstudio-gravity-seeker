// Rangos de edad estándar de medios: 18-24 / 25-34 / 35-44 / 45-54 /
// 55-64 / 65+, como % del universo 18+.
//
// IMPORTANTE — límite de la fuente: INEGI NO publica quinquenios
// adultos a nivel AGEB (el RESAGEBURB solo trae P_18A24, P_60YMAS y
// POB65_MAS; verificado contra el descriptor del censo y la tabla
// agebs). Por eso:
//   · 18-24 y 65+ son censales EXACTOS de la zona.
//   · 25-34 / 35-44 / 45-54 y la parte 55-59 del rango 55-64 se
//     ESTIMAN repartiendo el bloque censal real 25-59 de la zona con
//     la estructura nacional por quinquenios del Censo 2020.
//   · 60-64 es censal exacto cuando la entidad trae POB65_MAS; si no,
//     el bloque 60+ también se reparte con estructura nacional.
// La UI debe etiquetar el 25-64 como estimado.

export interface RangoEdad {
  etiqueta: string;
  pct: number;
  color: string;
}

// Pesos del bloque 25-59 por rango (estructura nacional, Censo 2020:
// 25-29 ≈9.8M, 30-34 ≈9.1M, 35-39 ≈8.8M, 40-44 ≈8.1M, 45-49 ≈7.7M,
// 50-54 ≈6.9M, 55-59 ≈5.9M). Suman 1.
const W_25A34 = 0.336;
const W_35A44 = 0.3;
const W_45A54 = 0.26;
const W_55A59 = 0.104;
// Reparto nacional del bloque 60+ (60-64 ≈5.0M de ≈15.1M) — solo se
// usa cuando la entidad no tiene POB65_MAS cargado.
const W_60A64_DE_60MAS = 0.327;

// Rampa esmeralda→profundo, joven→mayor (misma familia que el acento
// de la tarjeta de Edades).
const COLORES = [
  "#34d399",
  "#2cbb8b",
  "#25a37f",
  "#1e8a71",
  "#177262",
  "#115a51",
];

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Convierte las edades del RPC (% del universo 18+: 18-24, 25-59,
 * 60-64/65+ o 60+) a los seis rangos estándar de medios. Regresa null
 * si no hay datos de edades.
 */
export function rangosEdadEstandar(
  edades:
    | {
        pct18a24: number;
        pct25a59: number;
        pct60a64: number | null;
        pct65ymas: number | null;
        pct60ymas: number;
      }
    | null
    | undefined
): RangoEdad[] | null {
  if (!edades) return null;
  // El RPC (fase 11) ya reparte el 60+ de los AGEBs sin POB65_MAS con
  // la estructura nacional FILA POR FILA, así que pct60a64/pct65ymas
  // siempre vienen; este fallback queda para universos guardados
  // antes de ese cambio.
  const p6064 =
    edades.pct60a64 ?? edades.pct60ymas * W_60A64_DE_60MAS;
  const p65 =
    edades.pct65ymas ?? edades.pct60ymas * (1 - W_60A64_DE_60MAS);
  const valores = [
    edades.pct18a24,
    edades.pct25a59 * W_25A34,
    edades.pct25a59 * W_35A44,
    edades.pct25a59 * W_45A54,
    edades.pct25a59 * W_55A59 + p6064,
    p65,
  ];

  // REGLA DURA: los seis rangos deben sumar 100% del universo 18+ en
  // cualquier modo (buffers, zona, CPs). Fuera de 99.5-100.5 = regresión
  // en el RPC o universos viejos de zona mixta: warning con desglose.
  const suma = valores.reduce((s, v) => s + v, 0);
  if (suma < 99.5 || suma > 100.5) {
    console.warn(
      `[edades] Los rangos suman ${suma.toFixed(1)}% del universo 18+ (deben sumar 100 ±0.5)`,
      { entrada: edades, rangos: valores.map(r1) }
    );
  }

  const etiquetas = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
  return etiquetas.map((etiqueta, i) => ({
    etiqueta,
    pct: r1(valores[i]),
    color: COLORES[i],
  }));
}
