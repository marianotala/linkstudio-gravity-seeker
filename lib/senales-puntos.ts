// SEÑALES DE REVISIÓN de la vista Puntos — solo MARCAN la fila para
// revisarla primero; nunca borran nada:
// - cerrado: Google reporta el negocio cerrado (temporal o permanente);
// - duplicado: hay otro punto activo del levantamiento a menos de 75 m;
// - marca: el nombre no contiene la marca buscada.

import { matchersDe, terminoQueCaptura } from "./filtro-nombre";
import { haversine } from "./geo";
import type { PuntoSurvey } from "./planner";
import type { RolLevantamiento } from "./types";

export const RADIO_DUPLICADO_M = 75;

export type ClaveSenal = "cerrado" | "duplicado" | "marca";

export interface SenalPunto {
  clave: ClaveSenal;
  etiqueta: string;
  detalle: string;
}

/** Estado de negocio de Google en español ("—" sin dato: cargas de
 * Excel, DENUE y corridas previas a la captura del estatus). */
export function estadoNegocio(bs: unknown): { etiqueta: string; cerrado: boolean } {
  switch (bs) {
    case "OPERATIONAL":
      return { etiqueta: "Operando", cerrado: false };
    case "CLOSED_TEMPORARILY":
      return { etiqueta: "Cierre temporal", cerrado: true };
    case "CLOSED_PERMANENTLY":
      return { etiqueta: "Cerrado permanente", cerrado: true };
    default:
      return { etiqueta: "—", cerrado: false };
  }
}

/**
 * Marca(s) buscada(s) de un levantamiento: la etiqueta de su capa si es
 * uno de los términos de la corrida; si no, los términos de marca de la
 * búsqueda. Una lista cargada (sin términos) de Proximidad o Puntos de
 * interés se compara contra el nombre del cliente (`deCliente`).
 */
export function terminosMarcaDe(
  cfg: Record<string, unknown> | null,
  rol: RolLevantamiento,
  marcaCliente: string | null
): { terminos: string[]; deCliente: boolean } {
  const buscados = [
    ...((cfg?.nameFilters as string[] | undefined) ?? []),
    ...((cfg?.censoTerminos as string[] | undefined) ?? []),
    ...(typeof cfg?.marca === "string" ? [cfg.marca] : []),
  ]
    .map((t) => t.trim())
    .filter(Boolean);
  const etiqueta =
    typeof cfg?.etiqueta === "string" ? cfg.etiqueta.trim() : "";
  if (etiqueta && buscados.includes(etiqueta)) {
    return { terminos: [etiqueta], deCliente: false };
  }
  if (buscados.length > 0) {
    return { terminos: Array.from(new Set(buscados)), deCliente: false };
  }
  if ((rol === "proximidad" || rol === "poi_propio") && marcaCliente?.trim()) {
    return { terminos: [marcaCliente.trim()], deCliente: true };
  }
  return { terminos: [], deCliente: false };
}

const claveFila = (f: PuntoSurvey) => f.id ?? f.place_id;

/**
 * Señales por fila (llave: id de la fila). Los duplicados se buscan
 * contra los puntos ACTIVOS — un borrado no vuelve sospechoso a su
 * vecino. La señal de marca se apaga sola cuando sale del nombre del
 * cliente y la mayoría de los nombres no lo contienen (no es la marca
 * de esos puntos: marcar todo no ayudaría a revisar nada).
 */
export function calcularSenales(
  filas: PuntoSurvey[],
  marca: { terminos: string[]; deCliente: boolean }
): Map<number | string, SenalPunto[]> {
  const salida = new Map<number | string, SenalPunto[]>();
  const agregar = (f: PuntoSurvey, s: SenalPunto) => {
    const k = claveFila(f);
    salida.set(k, [...(salida.get(k) ?? []), s]);
  };
  const activos = filas
    .filter((f) => f.estado !== "excluido")
    .sort((a, b) => a.lat - b.lat);

  // ---- marca buscada
  const matchers = matchersDe(marca.terminos);
  const sinMarca = (f: PuntoSurvey) => {
    const propio =
      typeof f.metadata?.termino === "string" && f.metadata.termino.trim()
        ? matchersDe([f.metadata.termino])
        : [];
    return terminoQueCaptura(f.nombre, [...matchers, ...propio]) === null;
  };
  const marcaUtil =
    matchers.length > 0 &&
    !(
      marca.deCliente &&
      activos.length > 0 &&
      activos.filter(sinMarca).length > activos.length / 2
    );
  const marcaTexto = marca.terminos
    .map((t) => `“${t.replace(/^"|"$/g, "")}”`)
    .join(" / ");

  const ventanaLat = RADIO_DUPLICADO_M / 111320;
  for (const f of filas) {
    // ---- cerrado según Google
    const estado = estadoNegocio(f.metadata?.business_status);
    if (estado.cerrado) {
      agregar(f, {
        clave: "cerrado",
        etiqueta: estado.etiqueta,
        detalle: `Google reporta el negocio como “${estado.etiqueta.toLowerCase()}”`,
      });
    }

    // ---- posible duplicado: otro punto activo a < 75 m
    let lo = 0;
    let hi = activos.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (activos[mid].lat < f.lat - ventanaLat) lo = mid + 1;
      else hi = mid;
    }
    let vecino: PuntoSurvey | null = null;
    let distVecino = Infinity;
    for (let i = lo; i < activos.length && activos[i].lat <= f.lat + ventanaLat; i++) {
      const o = activos[i];
      if (claveFila(o) === claveFila(f)) continue;
      const d = haversine(f, o);
      if (d < RADIO_DUPLICADO_M && d < distVecino) {
        vecino = o;
        distVecino = d;
      }
    }
    if (vecino) {
      agregar(f, {
        clave: "duplicado",
        etiqueta: "Posible duplicado",
        detalle: `A ${Math.round(distVecino)} m de “${vecino.nombre}” (menos de ${RADIO_DUPLICADO_M} m)`,
      });
    }

    // ---- el nombre no contiene la marca buscada
    if (marcaUtil && sinMarca(f)) {
      agregar(f, {
        clave: "marca",
        etiqueta: "Sin la marca",
        detalle: `El nombre no contiene la marca buscada (${marcaTexto})`,
      });
    }
  }
  return salida;
}

/** Liga para verificar el punto en Google Maps sin salir del plan: por
 * place_id cuando es de Google, por coordenadas en cargas propias. */
export function ligaGoogleMaps(f: {
  place_id: string;
  lat: number;
  lng: number;
}): string {
  const base = `https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}`;
  return /^[A-Za-z0-9_-]{20,}$/.test(f.place_id)
    ? `${base}&query_place_id=${encodeURIComponent(f.place_id)}`
    : base;
}
