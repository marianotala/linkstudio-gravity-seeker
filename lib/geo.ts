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
