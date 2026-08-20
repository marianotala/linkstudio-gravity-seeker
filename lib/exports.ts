// Los 4 exports de Seeker, generados 100% en el cliente.
// Nombres de archivo seeker_* listos para cargar en DSPs.

import { circlePolygon } from "./geo";
import type { Origin, Poi } from "./types";

function descargar(nombre: string, contenido: string, mime: string) {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCampo(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 1) CSV de POIs. */
export function exportarCsv(pois: Poi[]) {
  const filas = [
    ["nombre", "direccion", "lat", "lng", "distancia_m", "place_id"].join(","),
    ...pois.map((p) =>
      [
        csvCampo(p.nombre),
        csvCampo(p.direccion),
        p.lat,
        p.lng,
        p.distancia,
        p.placeId,
      ].join(",")
    ),
  ];
  descargar("seeker_pois.csv", filas.join("\n"), "text/csv;charset=utf-8");
}

/** 2) GeoJSON de puntos (un Point por POI). */
export function exportarGeoJsonPuntos(pois: Poi[]) {
  const fc = {
    type: "FeatureCollection",
    features: pois.map((p) => ({
      type: "Feature",
      properties: {
        nombre: p.nombre,
        direccion: p.direccion,
        distancia_m: p.distancia,
        place_id: p.placeId,
      },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    })),
  };
  descargar(
    "seeker_pois_puntos.geojson",
    JSON.stringify(fc, null, 2),
    "application/geo+json"
  );
}

/** 3) GeoJSON de geocercas: un Polygon circular por POI, con radio y vértices configurables. */
export function exportarGeoJsonGeocercas(
  pois: Poi[],
  radioM: number,
  vertices: number
) {
  const fc = {
    type: "FeatureCollection",
    features: pois.map((p) => ({
      type: "Feature",
      properties: {
        nombre: p.nombre,
        direccion: p.direccion,
        radio_m: radioM,
        place_id: p.placeId,
      },
      geometry: {
        type: "Polygon",
        coordinates: [circlePolygon({ lat: p.lat, lng: p.lng }, radioM, vertices)],
      },
    })),
  };
  descargar(
    "seeker_geocercas_pois.geojson",
    JSON.stringify(fc, null, 2),
    "application/geo+json"
  );
}

/**
 * 4) GeoJSON de radios de origen: un Polygon circular por origen con el
 * radio de búsqueda. Las zonas (con viewport) exportan su rectángulo real.
 */
export function exportarGeoJsonRadiosOrigen(
  origenes: Origin[],
  radioM: number,
  vertices: number
) {
  const fc = {
    type: "FeatureCollection",
    features: origenes.map((o, i) => ({
      type: "Feature",
      properties: {
        nombre: o.nombre ?? `Origen ${i + 1}`,
        direccion: o.direccion ?? "",
        ...(o.viewport ? {} : { radio_m: radioM }),
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          o.viewport
            ? ([
                [o.viewport.west, o.viewport.south],
                [o.viewport.east, o.viewport.south],
                [o.viewport.east, o.viewport.north],
                [o.viewport.west, o.viewport.north],
                [o.viewport.west, o.viewport.south],
              ] as [number, number][])
            : circlePolygon(o, radioM, vertices),
        ],
      },
    })),
  };
  descargar(
    "seeker_radios_origen.geojson",
    JSON.stringify(fc, null, 2),
    "application/geo+json"
  );
}
