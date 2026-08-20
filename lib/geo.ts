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
