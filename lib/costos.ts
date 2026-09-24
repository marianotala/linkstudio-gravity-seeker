// COSTOS DE LA API DE GOOGLE — una sola fuente de verdad para estimar
// y registrar el gasto en MXN. Las tarifas por SKU (USD por 1,000
// llamadas), el tipo de cambio, el límite global diario y el umbral de
// aprobación viven en app_config('costos') y se editan en /admin; los
// defaults de aquí aplican si la config no existe. Las tarifas se
// calibran contra la consola de facturación de Google.

export interface ConfigCostos {
  /** Text Search (SKU Pro con nuestro field mask mínimo). */
  usd_text_por_mil: number;
  /** Nearby Search (SKU Pro). */
  usd_nearby_por_mil: number;
  /** Geocoding API. */
  usd_geocode_por_mil: number;
  /** Sesión de Autocomplete (teclas + detalle = 1 sesión). */
  usd_sesion_autocomplete_por_mil: number;
  /** USD → MXN para reportar todo en pesos. */
  tipo_cambio_mxn: number;
  /** searchText pagina hasta 3 páginas: promedio de llamadas reales
   * por consulta (para ESTIMAR; el log registra las reales). */
  factor_paginacion: number;
  /** Límite de gasto de TODA la plataforma por día (MXN). */
  limite_global_mxn_dia: number;
  /** Umbral de corrida grande: sobre esto se pide aprobación. */
  umbral_aprobacion_consultas: number;
  umbral_aprobacion_mxn: number;
}

export const COSTOS_DEFAULT: ConfigCostos = {
  usd_text_por_mil: 32,
  usd_nearby_por_mil: 32,
  usd_geocode_por_mil: 5,
  usd_sesion_autocomplete_por_mil: 17,
  tipo_cambio_mxn: 18.5,
  factor_paginacion: 1.5,
  limite_global_mxn_dia: 500,
  umbral_aprobacion_consultas: 1500,
  umbral_aprobacion_mxn: 300,
};

/** Config completa a partir de lo guardado en app_config (parcial). */
export function configCostosDe(valor: unknown): ConfigCostos {
  const v = (valor ?? {}) as Partial<Record<keyof ConfigCostos, unknown>>;
  const num = (x: unknown, def: number) => {
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 ? n : def;
  };
  return {
    usd_text_por_mil: num(v.usd_text_por_mil, COSTOS_DEFAULT.usd_text_por_mil),
    usd_nearby_por_mil: num(v.usd_nearby_por_mil, COSTOS_DEFAULT.usd_nearby_por_mil),
    usd_geocode_por_mil: num(v.usd_geocode_por_mil, COSTOS_DEFAULT.usd_geocode_por_mil),
    usd_sesion_autocomplete_por_mil: num(
      v.usd_sesion_autocomplete_por_mil,
      COSTOS_DEFAULT.usd_sesion_autocomplete_por_mil
    ),
    tipo_cambio_mxn: num(v.tipo_cambio_mxn, COSTOS_DEFAULT.tipo_cambio_mxn),
    factor_paginacion: num(v.factor_paginacion, COSTOS_DEFAULT.factor_paginacion),
    limite_global_mxn_dia: num(
      v.limite_global_mxn_dia,
      COSTOS_DEFAULT.limite_global_mxn_dia
    ),
    umbral_aprobacion_consultas: num(
      v.umbral_aprobacion_consultas,
      COSTOS_DEFAULT.umbral_aprobacion_consultas
    ),
    umbral_aprobacion_mxn: num(
      v.umbral_aprobacion_mxn,
      COSTOS_DEFAULT.umbral_aprobacion_mxn
    ),
  };
}

export type MetodoGoogle = "text" | "nearby" | "geocode" | "autocomplete_sesion";

/** Costo en MXN de UNA llamada pagada del método dado. */
export function costoLlamadaMxn(metodo: MetodoGoogle, cfg: ConfigCostos): number {
  const usdPorMil =
    metodo === "text"
      ? cfg.usd_text_por_mil
      : metodo === "nearby"
        ? cfg.usd_nearby_por_mil
        : metodo === "geocode"
          ? cfg.usd_geocode_por_mil
          : cfg.usd_sesion_autocomplete_por_mil;
  return (usdPorMil / 1000) * cfg.tipo_cambio_mxn;
}

/**
 * Costo ESTIMADO en MXN de una corrida de n "consultas" (la unidad que
 * muestran los estimadores de la UI: término/categoría × centro). Cada
 * consulta puede paginar hasta 3 llamadas reales: se aplica el factor
 * de paginación promedio. El log registra después las llamadas REALES.
 */
export function estimarCostoCorridaMxn(consultas: number, cfg: ConfigCostos): number {
  return consultas * cfg.factor_paginacion * costoLlamadaMxn("text", cfg);
}

/** $1,234.56 — siempre en MXN, es-MX. */
export function fmtMxn(n: number): string {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Consumo agregado de una corrida (para mostrar el costo al usuario). */
export interface ConsumoRun {
  pagadas: number;
  deCache: number;
  costoMxn: number;
}

export const consumoVacio = (): ConsumoRun => ({
  pagadas: 0,
  deCache: 0,
  costoMxn: 0,
});

export function sumarConsumo(acum: ConsumoRun, c?: ConsumoRun): void {
  if (!c) return;
  acum.pagadas += c.pagadas;
  acum.deCache += c.deCache;
  acum.costoMxn = Math.round((acum.costoMxn + c.costoMxn) * 100) / 100;
}

/** " · costo ~$12.40 MXN · 128 del caché ($0)" — o "" sin consumo. */
export function notaConsumo(c: ConsumoRun): string {
  if (c.pagadas + c.deCache === 0) return "";
  const cache =
    c.deCache > 0 ? ` · ${c.deCache.toLocaleString("es-MX")} del caché ($0)` : "";
  return ` · costo ~${fmtMxn(c.costoMxn)} MXN${cache}`;
}

/** ¿La corrida supera el umbral de aprobación? */
export function esCorridaGrande(consultas: number, cfg: ConfigCostos): boolean {
  return (
    consultas > cfg.umbral_aprobacion_consultas ||
    estimarCostoCorridaMxn(consultas, cfg) > cfg.umbral_aprobacion_mxn
  );
}
