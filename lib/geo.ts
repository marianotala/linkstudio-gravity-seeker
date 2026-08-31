// Utilidades geográficas puras (sirven en cliente y servidor).

import type { LatLng } from "./types";

/** Normaliza texto: minúsculas, sin acentos, espacios colapsados. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalización para COMPARAR nombres y exclusiones: además de quitar
 * acentos y mayúsculas, convierte la puntuación en espacios para que
 * "7 eleven" atrape "7-Eleven" y "circulo k" atrape "Círculo-K".
 */
export function normalizarComparable(texto: string): string {
  return normalizar(texto)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ------------------------------------------------------------------
// Filtro de calidad de nombres de POI (aplica a todos los modos):
// Google y DENUE a veces regresan registros basura (".", "Casa",
// "Sin nombre") que ensucian censos y exports. Lista EDITABLE de
// nombres genéricos sin valor de negocio — se comparan normalizados
// (sin acentos ni puntuación) y solo cuando el nombre es EXACTAMENTE
// eso ("Casa" se descarta; "Casa Toño" pasa).
// ------------------------------------------------------------------

export const NOMBRES_SIN_VALOR = [
  "casa",
  "local",
  "tienda",
  "negocio",
  "bodega",
  "sin nombre",
  "unnamed",
  "s n",
  "n a",
  "na",
];

/** true si el nombre no identifica un negocio: 1-2 caracteres, solo
 * números/puntuación, o un genérico de NOMBRES_SIN_VALOR a secas. */
export function esNombreBasura(nombre: string): boolean {
  const limpio = normalizarComparable(nombre);
  if (limpio.length <= 2) return true;
  if (!/[a-z]/.test(limpio)) return true;
  return NOMBRES_SIN_VALOR.includes(limpio);
}

/**
 * Extrae la ciudad de una dirección formateada (Google o DENUE).
 * Heurística: el segmento que trae el código postal suele ser
 * "06100 Ciudad de México" — se quita el CP; si no queda texto se toma
 * el siguiente segmento. Fallback: el antepenúltimo segmento (antes de
 * estado y país).
 */
export function ciudadDeDireccion(direccion: string): string {
  const partes = direccion
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (partes.length === 0) return "";
  for (let i = 0; i < partes.length; i++) {
    const cp = partes[i].match(/\b\d{5}\b/);
    if (cp) {
      const resto = partes[i].replace(cp[0], "").replace(/\bCP\b\.?/i, "").trim();
      if (resto) return resto;
      if (partes[i + 1]) return partes[i + 1];
    }
  }
  if (partes.length >= 3) return partes[partes.length - 3];
  return partes[partes.length - 1] ?? "";
}

/** Sufijos legales que no aportan identidad de marca. */
const SUFIJOS_LEGALES =
  /\b(sapi|sab|sa de cv|s de rl de cv|s de rl|sa|de cv|cv|sc|ac|s en c)\b/g;

/**
 * Normaliza un nombre comercial para COMPARAR entre fuentes: sin
 * acentos, sin puntuación y sin sufijos legales (SA DE CV, S DE RL…).
 */
export function normalizarNombreComercial(nombre: string): string {
  return normalizarComparable(nombre)
    .replace(SUFIJOS_LEGALES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Similitud de texto entre 0 y 1 (coeficiente de Dice sobre bigramas).
 * No exige igualdad exacta: "oxxo napoles" vs "oxxo nap" ≈ alto.
 */
export function similitudTexto(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigramas = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const ba = bigramas(a);
  const bb = bigramas(b);
  let inter = 0;
  let totalA = 0;
  let totalB = 0;
  ba.forEach((n) => (totalA += n));
  bb.forEach((n) => (totalB += n));
  ba.forEach((n, bg) => {
    const nb = bb.get(bg);
    if (nb) inter += Math.min(n, nb);
  });
  if (totalA + totalB === 0) return 0;
  return (2 * inter) / (totalA + totalB);
}

/** Umbrales de la regla de dedupe cruzado Google×DENUE. */
export const DEDUPE_CRUZADO_METROS = 75;
export const DEDUPE_CRUZADO_SIMILITUD = 0.6;

/**
 * ¿Dos POIs de fuentes distintas son el mismo establecimiento?
 * Regla obligatoria: distan < 75 m Y sus nombres normalizados (sin
 * acentos ni sufijos legales) son similares — contención de uno en otro
 * o similitud de texto ≥ 0.6. Nunca mezclar fuentes sin esta regla.
 */
export function esMismoEstablecimiento(
  a: { lat: number; lng: number; nombre: string },
  b: { lat: number; lng: number; nombre: string }
): boolean {
  if (haversine(a, b) >= DEDUPE_CRUZADO_METROS) return false;
  const na = normalizarNombreComercial(a.nombre);
  const nb = normalizarNombreComercial(b.nombre);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  return similitudTexto(na, nb) >= DEDUPE_CRUZADO_SIMILITUD;
}

const RADIO_TIERRA_M = 6371000;

/** Distancia haversine en metros entre dos puntos. */
export function haversine(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(s));
}

/**
 * Cuadrícula de celdas circulares que cubre un círculo de `alcanceM`
 * alrededor del centro. Las celdas tienen radio `radioCeldaM` y el
 * espaciamiento garantiza cobertura completa del plano:
 * - hex: retícula hexagonal con separación r·√3
 * - square: retícula cuadrada con separación r·√2
 * Regresa los centros ordenados del centro hacia afuera.
 */
export function generarCuadricula(
  center: LatLng,
  alcanceM: number,
  radioCeldaM: number,
  tipo: "hex" | "square"
): LatLng[] {
  const latRad = (center.lat * Math.PI) / 180;
  const mPorGradoLat = 111320;
  const mPorGradoLng = 111320 * Math.cos(latRad);
  const celdas: { lat: number; lng: number; d: number }[] = [];

  const agregar = (xM: number, yM: number) => {
    const d = Math.hypot(xM, yM);
    if (d > alcanceM) return;
    celdas.push({
      lat: center.lat + yM / mPorGradoLat,
      lng: center.lng + xM / mPorGradoLng,
      d,
    });
  };

  if (tipo === "square") {
    const paso = radioCeldaM * Math.SQRT2;
    const n = Math.ceil(alcanceM / paso);
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        agregar(i * paso, j * paso);
      }
    }
  } else {
    const d = radioCeldaM * Math.sqrt(3);
    const dy = (d * Math.sqrt(3)) / 2;
    const nFilas = Math.ceil(alcanceM / dy);
    const nCols = Math.ceil(alcanceM / d) + 1;
    for (let f = -nFilas; f <= nFilas; f++) {
      const offset = f % 2 !== 0 ? d / 2 : 0;
      for (let c = -nCols; c <= nCols; c++) {
        agregar(c * d + offset, f * dy);
      }
    }
  }

  celdas.sort((a, b) => a.d - b.d);
  return celdas.map(({ lat, lng }) => ({ lat, lng }));
}

/**
 * Polígono circular alrededor de un centro, como anillo GeoJSON
 * [lng, lat] cerrado (el primer vértice se repite al final).
 */
export function circlePolygon(
  center: LatLng,
  radiusM: number,
  vertices: number
): [number, number][] {
  const ring: [number, number][] = [];
  const latRad = (center.lat * Math.PI) / 180;
  // metros por grado, aproximación local suficiente para geocercas de DSP
  const mPorGradoLat = 111320;
  const mPorGradoLng = 111320 * Math.cos(latRad);
  for (let i = 0; i < vertices; i++) {
    const theta = (2 * Math.PI * i) / vertices;
    const lat = center.lat + (radiusM * Math.cos(theta)) / mPorGradoLat;
    const lng = center.lng + (radiusM * Math.sin(theta)) / mPorGradoLng;
    ring.push([Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
  }
  ring.push(ring[0]);
  return ring;
}

// ------------------------------------------------------------------
// Escalamiento del modo por orígenes (listas de hasta 10,000 PDVs)
// ------------------------------------------------------------------

// cos(23°): factor fijo para convertir grados de longitud a metros al
// armar retículas de hash espacial en México. Solo afecta el tamaño de
// celda del hash (las distancias reales siempre se miden con
// haversine), así que la aproximación es inocua.
const COS_MX = Math.cos((23 * Math.PI) / 180);

function hashEspacial(p: LatLng, celdaM: number): [number, number] {
  return [
    Math.floor((p.lat * 111320) / celdaM),
    Math.floor((p.lng * 111320 * COS_MX) / celdaM),
  ];
}

/**
 * Consolida centros de búsqueda cuyos círculos se traslapan >80%
 * (centros a menos de 0.35·radio): una consulta a Google en vez de
 * varias. Conserva el primer centro de cada grupo.
 */
export function consolidarCentros<T extends LatLng>(
  centros: T[],
  radioM: number
): T[] {
  const umbralM = 0.35 * radioM;
  if (umbralM <= 0) return centros;
  const celdaM = Math.max(umbralM, 50);
  const porCelda = new Map<string, T[]>();
  const salida: T[] = [];
  for (const c of centros) {
    const [fy, fx] = hashEspacial(c, celdaM);
    let duplicado = false;
    busca: for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const vecinos = porCelda.get(`${fy + dy}:${fx + dx}`);
        if (!vecinos) continue;
        for (const v of vecinos) {
          if (haversine(c, v) < umbralM) {
            duplicado = true;
            break busca;
          }
        }
      }
    }
    if (duplicado) continue;
    salida.push(c);
    const llave = `${fy}:${fx}`;
    const lista = porCelda.get(llave);
    if (lista) lista.push(c);
    else porCelda.set(llave, [c]);
  }
  return salida;
}

/**
 * Buscador de origen más cercano con hash espacial: para reasignar
 * miles de POIs contra miles de orígenes sin O(n·m) completo. Explora
 * anillos crecientes de celdas hasta encontrar candidatos (con
 * respaldo de barrido completo si el punto quedara muy lejos).
 */
export function crearBuscadorCercano(
  origenes: LatLng[],
  celdaM: number
): (p: LatLng) => { idx: number; dist: number } {
  const celda = Math.max(celdaM, 100);
  const porCelda = new Map<string, number[]>();
  origenes.forEach((o, i) => {
    const [fy, fx] = hashEspacial(o, celda);
    const llave = `${fy}:${fx}`;
    const lista = porCelda.get(llave);
    if (lista) lista.push(i);
    else porCelda.set(llave, [i]);
  });
  return (p: LatLng) => {
    const [fy, fx] = hashEspacial(p, celda);
    let mejorIdx = -1;
    let mejorDist = Infinity;
    for (let anillo = 1; anillo <= 5; anillo++) {
      for (let dy = -anillo; dy <= anillo; dy++) {
        for (let dx = -anillo; dx <= anillo; dx++) {
          const candidatos = porCelda.get(`${fy + dy}:${fx + dx}`);
          if (!candidatos) continue;
          for (const i of candidatos) {
            const d = haversine(p, origenes[i]);
            if (d < mejorDist) {
              mejorDist = d;
              mejorIdx = i;
            }
          }
        }
      }
      // un anillo completo con candidato garantiza que nada más
      // cercano vive fuera (el anillo cubre > mejorDist)
      if (mejorIdx >= 0 && mejorDist <= anillo * celda) break;
    }
    if (mejorIdx < 0) {
      origenes.forEach((o, i) => {
        const d = haversine(p, o);
        if (d < mejorDist) {
          mejorDist = d;
          mejorIdx = i;
        }
      });
    }
    return { idx: mejorIdx, dist: mejorDist };
  };
}
