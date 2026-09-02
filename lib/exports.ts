// Los 4 exports de Seeker, generados 100% en el cliente.
// Nombres de archivo seeker_* listos para cargar en DSPs.

import { ciudadDeDireccion, circlePolygon, etiquetaOrigen } from "./geo";
import type { Origin, Poi, Universos } from "./types";

/** Filas de resumen de universos para anexar al final del CSV. */
function filasUniversos(universos: Universos | null | undefined): string[] {
  if (!universos?.disponible) return [];
  return [
    "",
    "— UNIVERSOS (Censo 2020 INEGI · interpolación areal por AGEB) —",
    `universo_residencial,${universos.residencial!.poblacion}`,
    `adultos_18_mas,${universos.residencial!.adultos18}`,
    `nse_proxy_promedio (proxy censal; no NSE AMAI),${universos.perfil!.nseProxy ?? ""}`,
    `pct_18a24,${universos.perfil!.pct18a24 ?? ""}`,
    `pct_60ymas,${universos.perfil!.pct60ymas ?? ""}`,
    `viviendas,${universos.residencial!.viviendas}`,
    `agebs_intersectados,${universos.agebs ?? ""}`,
  ];
}

/** Resumen de universos para las properties de un FeatureCollection. */
function propsUniversos(universos: Universos | null | undefined) {
  if (!universos?.disponible) return undefined;
  return {
    fuente: universos.fuente,
    residencial: universos.residencial,
    perfil: universos.perfil,
    agebs: universos.agebs,
  };
}

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

/**
 * 1) CSV de POIs con la relación origen↔POI: cada fila trae el origen
 * más cercano (nombre y coordenadas) y la distancia entre ambos.
 */
export function exportarCsv(
  pois: Poi[],
  origenes: Origin[] = [],
  universos?: Universos | null
) {
  const filas = [
    [
      "nombre",
      "direccion",
      "ciudad",
      "codigo_postal",
      "capa",
      "termino_marca",
      "categoria",
      "lat",
      "lng",
      "fuente",
      "estrato",
      "origen_nombre",
      "origen_id",
      "origen_lat",
      "origen_lng",
      "distancia_m",
      "place_id",
    ].join(","),
    ...pois.map((p) => {
      const origen = origenes[p.origenIdx];
      return [
        csvCampo(p.nombre),
        csvCampo(p.direccion),
        csvCampo(ciudadDeDireccion(p.direccion)),
        csvCampo(p.cp ?? ""),
        csvCampo(p.capa ?? ""),
        csvCampo(p.termino ?? ""),
        csvCampo(p.categoria ?? ""),
        p.lat,
        p.lng,
        p.fuente,
        csvCampo(p.estrato ?? ""),
        csvCampo(origen ? etiquetaOrigen(origen, p.origenIdx) : ""),
        origen ? p.origenIdx + 1 : "",
        origen?.lat ?? "",
        origen?.lng ?? "",
        p.distancia,
        p.placeId,
      ].join(",");
    }),
    ...filasUniversos(universos),
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
        fuente: p.fuente,
        estrato: p.estrato ?? null,
        codigo_postal: p.cp ?? null,
        termino_marca: p.termino ?? null,
        categoria: p.categoria ?? null,
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
  vertices: number,
  universos?: Universos | null
) {
  const fc = {
    type: "FeatureCollection",
    properties: { universos: propsUniversos(universos) ?? null },
    features: pois.map((p) => ({
      type: "Feature",
      properties: {
        nombre: p.nombre,
        direccion: p.direccion,
        radio_m: radioM,
        fuente: p.fuente,
        estrato: p.estrato ?? null,
        codigo_postal: p.cp ?? null,
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
  vertices: number,
  universos?: Universos | null
) {
  const porGeocerca = universos?.disponible ? universos.porGeocerca : undefined;
  const fc = {
    type: "FeatureCollection",
    properties: { universos: propsUniversos(universos) ?? null },
    features: origenes.map((o, i) => ({
      type: "Feature",
      properties: {
        nombre: etiquetaOrigen(o, i),
        direccion: o.direccion ?? "",
        ...(o.viewport ? {} : { radio_m: radioM }),
        universo_residencial: porGeocerca?.[i]?.poblacion ?? null,
        adultos_18_mas: porGeocerca?.[i]?.adultos18 ?? null,
        nse_proxy: porGeocerca?.[i]?.nse_proxy ?? null,
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
