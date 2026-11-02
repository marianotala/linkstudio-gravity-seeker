// CACHÉ DE CONSULTAS A GOOGLE (lado servidor) + medidor de consumo.
// La misma consulta (método + query + ubicación + radio) dentro del TTL
// se sirve de la tabla google_cache y cuesta $0: aplica a reintentos de
// chunks, re-corridas y usuarios distintos pidiendo lo mismo. Cada
// llamada PAGADA se cuenta por método con su costo en MXN (tarifas de
// app_config('costos')) para el log de consumo.

import "server-only";
import { createHash } from "crypto";
import {
  geocodeDireccion,
  searchNearby,
  searchText,
  type AreaBusqueda,
  type MedidorLlamadas,
  type PlaceResult,
} from "./google";
import {
  configCostosDe,
  costoLlamadaMxn,
  type ConfigCostos,
  type MetodoGoogle,
} from "./costos";
import type { GeocodeResult, LatLng } from "./types";

/** Vigencia del caché: dentro de esta ventana la consulta es gratis.
 * 30 días = el máximo que permiten los términos de Google Places para
 * resultados; los place_id NO caducan (lo persistido en surveys se
 * conserva para siempre — esto solo rige las RESPUESTAS cacheadas). */
export const TTL_DIAS_CACHE = 30;
const TTL_HORAS = TTL_DIAS_CACHE * 24;
/** Retención física = TTL: lo vencido se barre, lo vigente se queda. */
const RETENCION_HORAS = TTL_HORAS;

/** Normalización de la LLAVE: minúsculas, sin acentos, espacios
 * colapsados — "Café", "cafe" y "CAFÉ " son la misma consulta. */
export function normalizarClaveTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Llave de una consulta searchText sobre una celda circular — LA
 * MISMA construcción que usa el caché, exportada para que el estimador
 * pre-corrida (/api/cache-estado) calcule hits sin ejecutar nada. */
export function claveTextoCircular(
  q: string,
  centro: LatLng,
  radioM: number
): string {
  const consulta = `text|${normalizarClaveTexto(q)}|c:${centro.lat.toFixed(5)},${centro.lng.toFixed(5)},${Math.round(radioM)}`;
  return hash(consulta);
}

export interface ConsumoGoogle {
  /** Llamadas facturables ejecutadas, por método. */
  pagadas: Partial<Record<MetodoGoogle, number>>;
  /** Consultas servidas del caché ($0). */
  deCache: number;
  /** Costo estimado en MXN de lo pagado en esta request. */
  costoMxn: number;
}

// Cliente supabase mínimo que necesitamos (evita acoplar el tipo
// completo del SDK): from().select/eq/gte/maybeSingle, upsert, delete.
// el builder encadenable del SDK no vale la pena tiparlo completo aquí
type BuilderTabla = any;
type ClienteDb = {
  from: (tabla: string) => BuilderTabla;
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ error: { message: string } | null }>;
};

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export class CacheGoogle {
  consumo: ConsumoGoogle = { pagadas: {}, deCache: 0, costoMxn: 0 };

  constructor(
    private db: ClienteDb,
    private cfg: ConfigCostos,
    /** true = "Refrescar todo": ignora las lecturas del caché (paga y
     * sobreescribe). SIEMPRE es decisión explícita del usuario desde el
     * estimador — nunca se refresca solo. */
    private refrescar = false
  ) {}

  private async leer(clave: string): Promise<unknown | null> {
    if (this.refrescar) return null;
    try {
      const desde = new Date(Date.now() - TTL_HORAS * 3600_000).toISOString();
      const { data } = await this.db
        .from("google_cache")
        .select("resultados")
        .eq("clave", clave)
        .gte("created_at", desde)
        .maybeSingle();
      return data?.resultados ?? null;
    } catch {
      return null; // un caché caído nunca tumba la búsqueda
    }
  }

  private async guardar(
    clave: string,
    metodo: string,
    consulta: string,
    resultados: unknown
  ): Promise<void> {
    try {
      await this.db.from("google_cache").upsert({
        clave,
        metodo,
        consulta: consulta.slice(0, 300),
        resultados,
        created_at: new Date().toISOString(),
      });
      if (Math.random() < 0.02) {
        const corte = new Date(Date.now() - RETENCION_HORAS * 3600_000).toISOString();
        await this.db.from("google_cache").delete().lt("created_at", corte);
      }
    } catch {
      // no guardar no es error: la próxima igual pagará
    }
  }

  private pagar(metodo: MetodoGoogle, llamadas: number): void {
    if (llamadas <= 0) return;
    this.consumo.pagadas[metodo] = (this.consumo.pagadas[metodo] ?? 0) + llamadas;
    this.consumo.costoMxn += llamadas * costoLlamadaMxn(metodo, this.cfg);
  }

  /** searchText con caché (la clave incluye query normalizada + área). */
  async text(q: string, area: AreaBusqueda): Promise<PlaceResult[]> {
    const desc =
      "rectangle" in area
        ? `r:${area.rectangle.north.toFixed(4)},${area.rectangle.south.toFixed(4)},${area.rectangle.east.toFixed(4)},${area.rectangle.west.toFixed(4)}`
        : `c:${area.circle.center.lat.toFixed(5)},${area.circle.center.lng.toFixed(5)},${Math.round(area.circle.radius)}`;
    const consulta = `text|${normalizarClaveTexto(q)}|${desc}`;
    const clave = hash(consulta);
    const enCache = await this.leer(clave);
    if (enCache) {
      this.consumo.deCache++;
      return enCache as PlaceResult[];
    }
    const medidor: MedidorLlamadas = { llamadas: 0 };
    const r = await searchText(q, area, medidor);
    this.pagar("text", medidor.llamadas);
    await this.guardar(clave, "text", consulta, r);
    return r;
  }

  /** searchNearby con caché (la clave incluye tipos + centro + radio). */
  async nearby(
    centro: LatLng,
    radioM: number,
    tipos: string[]
  ): Promise<PlaceResult[]> {
    const consulta = `nearby|${[...tipos].sort().join(",")}|c:${centro.lat.toFixed(5)},${centro.lng.toFixed(5)},${Math.round(radioM)}`;
    const clave = hash(consulta);
    const enCache = await this.leer(clave);
    if (enCache) {
      this.consumo.deCache++;
      return enCache as PlaceResult[];
    }
    const medidor: MedidorLlamadas = { llamadas: 0 };
    const r = await searchNearby(centro, radioM, tipos, medidor);
    this.pagar("nearby", medidor.llamadas);
    await this.guardar(clave, "nearby", consulta, r);
    return r;
  }

  /** Geocoding con caché (también los "sin resultados": igual costaron). */
  async geocode(direccion: string): Promise<GeocodeResult> {
    const consulta = `geo|${normalizarClaveTexto(direccion)}`;
    const clave = hash(consulta);
    const enCache = await this.leer(clave);
    if (enCache) {
      this.consumo.deCache++;
      return enCache as GeocodeResult;
    }
    const r = await geocodeDireccion(direccion);
    this.pagar("geocode", 1);
    await this.guardar(clave, "geocode", consulta, r);
    return r;
  }

  /**
   * Registra el consumo de esta request en api_usage_log (una fila por
   * método + una del caché) y suma las consultas pagadas al tope diario
   * del usuario. Nunca lanza.
   */
  async registrar(contexto: string): Promise<void> {
    try {
      for (const [metodo, n] of Object.entries(this.consumo.pagadas)) {
        if (!n) continue;
        await this.db.rpc("registrar_consumo_api", {
          p_metodo: metodo,
          p_contexto: contexto,
          p_consultas: n,
          p_de_cache: 0,
          p_costo_mxn:
            Math.round(n * costoLlamadaMxn(metodo as MetodoGoogle, this.cfg) * 10000) /
            10000,
        });
      }
      if (this.consumo.deCache > 0) {
        await this.db.rpc("registrar_consumo_api", {
          p_metodo: "cache",
          p_contexto: contexto,
          p_consultas: 0,
          p_de_cache: this.consumo.deCache,
          p_costo_mxn: 0,
        });
      }
    } catch (e) {
      console.error("No se pudo registrar el consumo:", e);
    }
  }

  /** Resumen plano para la respuesta al cliente. */
  resumen(): { pagadas: number; deCache: number; costoMxn: number } {
    const pagadas = Object.values(this.consumo.pagadas).reduce(
      (t, n) => t + (n ?? 0),
      0
    );
    return {
      pagadas,
      deCache: this.consumo.deCache,
      costoMxn: Math.round(this.consumo.costoMxn * 100) / 100,
    };
  }
}

/** Config de costos leída de app_config (con defaults si no existe). */
export async function cargarConfigCostos(db: ClienteDb): Promise<ConfigCostos> {
  try {
    const { data } = await db
      .from("app_config")
      .select("valor")
      .eq("clave", "costos")
      .maybeSingle();
    return configCostosDe(data?.valor);
  } catch {
    return configCostosDe(null);
  }
}
