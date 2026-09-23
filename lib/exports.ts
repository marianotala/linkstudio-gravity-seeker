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

/** BOM UTF-8: la señal que Excel (Windows y Mac) necesita para
 * detectar UTF-8 al abrir un CSV con doble clic — sin él interpreta
 * MacRoman/Latin-1 y los acentos salen rotos ("C√°rdenas"). */
export const BOM_UTF8 = "﻿";

function descargar(nombre: string, contenido: string, mime: string) {
  // TODO CSV de la plataforma sale con BOM (los GeoJSON no: algunos
  // parsers de DSPs no toleran BOM en JSON)
  const cuerpo =
    mime.startsWith("text/csv") && !contenido.startsWith(BOM_UTF8)
      ? BOM_UTF8 + contenido
      : contenido;
  const blob = new Blob([cuerpo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Descarga un CSV con BOM UTF-8 (pieza compartida de la plataforma). */
export function descargarCsvUtf8(nombre: string, contenido: string) {
  descargar(nombre, contenido, "text/csv;charset=utf-8");
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

/** Fila del Export data como objeto (comparten CSV y XLSX). */
function filaDeDatos(p: Poi, origenes: Origin[]) {
  const origen = origenes[p.origenIdx];
  return {
    nombre: p.nombre,
    direccion: p.direccion,
    ciudad: ciudadDeDireccion(p.direccion),
    codigo_postal: p.cp ?? "",
    capa: p.capa ?? "",
    termino_marca: p.termino ?? "",
    categoria: p.categoria ?? "",
    lat: p.lat,
    lng: p.lng,
    fuente: p.fuente,
    estrato: p.estrato ?? "",
    origen_nombre: origen ? etiquetaOrigen(origen, p.origenIdx) : "",
    origen_lat: origen?.lat ?? "",
    origen_lng: origen?.lng ?? "",
    distancia_m: p.distancia,
    place_id: p.placeId,
  };
}

/** Anchos de columna (wch) a partir del contenido, acotados. */
function anchosDeColumnas(filas: Record<string, unknown>[]): { wch: number }[] {
  if (filas.length === 0) return [];
  return Object.keys(filas[0]).map((k) => {
    const max = filas
      .slice(0, 200)
      .reduce((m, f) => Math.max(m, String(f[k] ?? "").length), k.length);
    return { wch: Math.min(42, Math.max(8, max + 2)) };
  });
}

/**
 * 1b) EXPORT DATA COMO EXCEL NATIVO (.xlsx) — el formato principal:
 * cero ambigüedad de encoding (los acentos jamás se rompen),
 * encabezados propios, columnas auto-anchas, una hoja POR CAPA en
 * exports multi-capa y hoja de universos. El CSV con BOM queda como
 * alternativa para sistemas que pidan texto plano.
 */
export async function exportarXlsxData(
  pois: Poi[],
  origenes: Origin[] = [],
  universos?: Universos | null,
  capas?: { nombre: string; pois: Poi[] }[] | null
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const usados = new Set<string>();
  const nombreHoja = (base: string) => {
    const limpio = base.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Hoja";
    let nombre = limpio;
    let n = 2;
    while (usados.has(nombre)) nombre = `${limpio.slice(0, 25)} ${n++}`;
    usados.add(nombre);
    return nombre;
  };
  const agregarHoja = (nombre: string, lista: Poi[]) => {
    const filas = lista.map((p) => filaDeDatos(p, origenes));
    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja["!cols"] = anchosDeColumnas(filas);
    XLSX.utils.book_append_sheet(wb, hoja, nombreHoja(nombre));
  };
  if (capas && capas.length > 1) {
    for (const c of capas) agregarHoja(c.nombre, c.pois);
  } else {
    agregarHoja("POIs", pois);
  }
  if (universos?.disponible) {
    const resumen = [
      { dato: "universo_residencial", valor: universos.residencial!.poblacion },
      { dato: "adultos_18_mas", valor: universos.residencial!.adultos18 },
      {
        dato: "nse_proxy_promedio (proxy censal; no NSE AMAI)",
        valor: universos.perfil!.nseProxy ?? "",
      },
      { dato: "pct_18a24", valor: universos.perfil!.pct18a24 ?? "" },
      { dato: "pct_60ymas", valor: universos.perfil!.pct60ymas ?? "" },
      { dato: "viviendas", valor: universos.residencial!.viviendas },
      { dato: "agebs_intersectados", valor: universos.agebs ?? "" },
      { dato: "fuente", valor: universos.fuente ?? "" },
    ];
    const hoja = XLSX.utils.json_to_sheet(resumen);
    hoja["!cols"] = [{ wch: 44 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, hoja, nombreHoja("Universos"));
  }
  XLSX.writeFile(wb, "seeker_pois.xlsx");
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
