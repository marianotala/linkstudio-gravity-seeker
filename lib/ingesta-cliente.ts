// Parseo de archivos de INEGI EN EL NAVEGADOR (página /admin):
// shapefile del Marco Geoestadístico 2020 (AGEB urbana) + CSV/XLS del
// Censo 2020 (RESAGEBURB). El navegador del admin hace el trabajo
// pesado y la carga va por lotes a Supabase, protegida por RLS.

import Papa from "papaparse";
import * as XLSX from "xlsx";
import simplify from "@turf/simplify";

/** Registro listo para admin_upsert_agebs. */
export interface AgebRegistro {
  cvegeo: string;
  entidad: string;
  municipio: string;
  pobtot: number | null;
  p_18ymas: number | null;
  p_18a24: number | null;
  p_60ymas: number | null;
  graproes: number | null;
  tvivhab: number | null;
  vph_autom: number | null;
  vph_inter: number | null;
  vph_pc: number | null;
  nse_proxy: number | null;
  geometria: Record<string, unknown>;
}

interface VarsCenso {
  entidad: string;
  municipio: string;
  pobtot: number | null;
  p_18ymas: number | null;
  p_18a24: number | null;
  p_60ymas: number | null;
  graproes: number | null;
  tvivhab: number | null;
  vph_autom: number | null;
  vph_inter: number | null;
  vph_pc: number | null;
  nse_proxy: number | null;
}

/** "*" y "N/D" son confidencialidad de INEGI → null. */
function num(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "" || s === "*" || s.toUpperCase() === "N/D") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Índice socioeconómico aproximado 0-100 (PROXY CENSAL, no NSE AMAI):
 * 100 × (0.4·escolaridad + 0.3·autos/vivienda + 0.3·internet/vivienda),
 * escolaridad = (GRAPROES−4)/12 recortado a [0,1].
 */
export function nseProxyCenso(
  graproes: number | null,
  vphAutom: number | null,
  vphInter: number | null,
  tvivhab: number | null
): number | null {
  const comps: [number, number][] = [];
  if (graproes !== null) comps.push([0.4, clamp01((graproes - 4) / 12)]);
  if (vphAutom !== null && tvivhab) comps.push([0.3, clamp01(vphAutom / tvivhab)]);
  if (vphInter !== null && tvivhab) comps.push([0.3, clamp01(vphInter / tvivhab)]);
  if (comps.length === 0) return null;
  const pesoTotal = comps.reduce((s, [w]) => s + w, 0);
  const suma = comps.reduce((s, [w, v]) => s + w * v, 0);
  return Math.round(((100 * suma) / pesoTotal) * 10) / 10;
}

/** Lee el archivo censal (CSV latin1 o XLS/XLSX) → mapa CVEGEO→variables. */
export async function parsearCensoInegi(
  archivo: File
): Promise<Map<string, VarsCenso>> {
  // normaliza headers: quita el BOM (﻿, o "ï»¿" si un BOM UTF-8 se
  // decodificó como latin1), espacios y mayúsculas
  const limpiarHeader = (h: string) =>
    h.replace(/^﻿/, "").replace(/^ï»¿/, "").trim().toUpperCase();

  let filas: Record<string, unknown>[];
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith(".xls") || nombre.endsWith(".xlsx")) {
    const wb = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
    filas = XLSX.utils
      .sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], {
        defval: "",
      })
      .map((f) =>
        Object.fromEntries(
          Object.entries(f).map(([k, v]) => [limpiarHeader(k), v])
        )
      );
  } else {
    // INEGI publica los CSV a veces en latin1 y a veces en UTF-8 con
    // BOM: si el archivo empieza con EF BB BF se decodifica como UTF-8
    // (el decoder descarta el BOM); si no, latin1.
    const buffer = await archivo.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const esUtf8ConBom =
      bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    const texto = new TextDecoder(esUtf8ConBom ? "utf-8" : "latin1").decode(
      buffer
    );
    filas = Papa.parse<Record<string, unknown>>(texto, {
      header: true,
      skipEmptyLines: true,
      transformHeader: limpiarHeader,
    }).data;
  }

  const mapa = new Map<string, VarsCenso>();
  for (const fila of filas) {
    // Filas de nivel AGEB: NOM_LOC = "Total AGEB urbana". Si la columna
    // NOM_LOC no existiera, respaldo: MZA = 0 excluyendo los totales de
    // entidad/municipio/localidad (AGEB = "0000").
    const agebCrudo = String(fila.AGEB ?? "").trim().toUpperCase();
    const mzaCrudo = String(fila.MZA ?? "").trim();
    if (fila.NOM_LOC !== undefined) {
      const nomLoc = String(fila.NOM_LOC ?? "").trim().toLowerCase();
      if (!nomLoc.includes("total ageb")) continue;
    } else {
      const esMzaCero = mzaCrudo !== "" && Number(mzaCrudo) === 0;
      const esTotalAgregado = /^0+$/.test(agebCrudo) || agebCrudo === "";
      if (!esMzaCero || esTotalAgregado) continue;
    }

    // CVEGEO = ENTIDAD(2)+MUN(3)+LOC(4)+AGEB(4), SIEMPRE como strings
    // con ceros a la izquierda. Sin ENTIDAD no hay llave válida.
    const entCrudo = String(fila.ENTIDAD ?? "").trim();
    if (!entCrudo) continue;
    const ent = entCrudo.padStart(2, "0");
    const mun = String(fila.MUN ?? "").trim().padStart(3, "0");
    const loc = String(fila.LOC ?? "").trim().padStart(4, "0");
    const ageb = agebCrudo.padStart(4, "0");
    const cvegeo = `${ent}${mun}${loc}${ageb}`;

    const graproes = num(fila.GRAPROES);
    const tvivhab = num(fila.TVIVHAB);
    const vphAutom = num(fila.VPH_AUTOM);
    const vphInter = num(fila.VPH_INTER);
    mapa.set(cvegeo, {
      entidad: ent,
      municipio: mun,
      pobtot: num(fila.POBTOT),
      p_18ymas: num(fila.P_18YMAS),
      p_18a24: num(fila.P_18A24),
      p_60ymas: num(fila.P_60YMAS),
      graproes,
      tvivhab,
      vph_autom: vphAutom,
      vph_inter: vphInter,
      vph_pc: num(fila.VPH_PC),
      nse_proxy: nseProxyCenso(graproes, vphAutom, vphInter, tvivhab),
    });
  }
  return mapa;
}

// Proyección del Marco Geoestadístico de INEGI (Lambert Conformal
// Conic sobre GRS80/ITRF2008) — respaldo si el .prj falta o no parsea.
const INEGI_LCC =
  "+proj=lcc +lat_1=17.5 +lat_2=29.5 +lat_0=12 +lon_0=-102 +x_0=2500000 +y_0=0 +ellps=GRS80 +units=m +no_defs";

/** Reproyecta recursivamente coordenadas proyectadas→WGS84. */
function reproyectarCoords(
  coords: unknown,
  inversa: (p: [number, number]) => [number, number]
): unknown {
  if (Array.isArray(coords)) {
    if (typeof coords[0] === "number") {
      const [lng, lat] = inversa([coords[0] as number, coords[1] as number]);
      return [
        Math.round(lng * 1e6) / 1e6,
        Math.round(lat * 1e6) / 1e6,
      ];
    }
    return coords.map((c) => reproyectarCoords(c, inversa));
  }
  return coords;
}

/**
 * Lee el shapefile (.shp + .dbf + .prj) en el navegador con shpjs y lo
 * reproyecta de la Lambert ITRF2008 de INEGI a WGS84 (EPSG:4326).
 *
 * Nota crítica de la API de shpjs v6 (verificada de punta a punta con
 * un shapefile sintético): el export público parseShp hace
 * toString(prj) — si le pasas un conversor de proj4 lo DESCARTA en
 * silencio y no reproyecta. Hay que pasarle el TEXTO del .prj (WKT) o
 * una proj-string; el wrapper llama proj4() por dentro.
 */
export async function parsearShapefileInegi(
  shpFile: File,
  dbfFile: File,
  prjFile?: File
): Promise<GeoJSON.FeatureCollection> {
  const [{ parseShp, parseDbf, combine }, proj4mod] = await Promise.all([
    import("shpjs"),
    import("proj4"),
  ]);
  const proj4 = proj4mod.default;

  // 1) definición de proyección COMO TEXTO: el WKT del .prj si proj4
  //    lo parsea; si falta o no parsea, la Lambert de INEGI directa
  let defProyeccion = INEGI_LCC;
  if (prjFile) {
    const wkt = await prjFile.text();
    try {
      proj4(wkt);
      defProyeccion = wkt;
    } catch {
      defProyeccion = INEGI_LCC;
    }
  }

  const geoms = parseShp(await shpFile.arrayBuffer(), defProyeccion);
  const props = parseDbf(await dbfFile.arrayBuffer(), "ISO-8859-1");
  const fc = combine([geoms, props]);

  // 2) verificación de sanidad post-reproyección: México cae en
  //    lng [-119,-85], lat [13,34] (CDMX: lng ~-99.2 a -98.9, lat
  //    ~19.0 a 19.6). Si las coordenadas siguen proyectadas (metros,
  //    cientos de miles), reproyectamos manualmente como respaldo.
  const primera = (function buscar(c: unknown): number[] | null {
    if (Array.isArray(c)) {
      if (typeof c[0] === "number") return c as number[];
      for (const hijo of c) {
        const r = buscar(hijo);
        if (r) return r;
      }
    }
    return null;
  })(fc.features[0]?.geometry && (fc.features[0].geometry as { coordinates?: unknown }).coordinates);

  if (primera && (Math.abs(primera[0]) > 180 || Math.abs(primera[1]) > 90)) {
    const conv = proj4(defProyeccion);
    for (const f of fc.features) {
      const g = f.geometry as { coordinates?: unknown } | null;
      if (g?.coordinates) {
        g.coordinates = reproyectarCoords(g.coordinates, (p) =>
          conv.inverse(p)
        );
      }
    }
  }

  // 3) validación final: dentro del rango de México o error claro
  const check = (function buscar(c: unknown): number[] | null {
    if (Array.isArray(c)) {
      if (typeof c[0] === "number") return c as number[];
      for (const hijo of c) {
        const r = buscar(hijo);
        if (r) return r;
      }
    }
    return null;
  })(fc.features[0]?.geometry && (fc.features[0].geometry as { coordinates?: unknown }).coordinates);
  if (
    check &&
    (check[0] < -119 || check[0] > -85 || check[1] < 13 || check[1] > 34)
  ) {
    throw new Error(
      `La reproyección salió fuera del rango de México (lng ${check[0].toFixed(2)}, lat ${check[1].toFixed(2)}). ¿El .prj corresponde a este shapefile?`
    );
  }

  return fc;
}

/** Cruza geometrías con censo, simplifica y arma los registros a cargar. */
export function construirAgebs(
  fc: GeoJSON.FeatureCollection,
  censo: Map<string, VarsCenso>,
  toleranciaSimplify = 0.0001
): { registros: AgebRegistro[]; sinCenso: number; saltados: number } {
  const registros: AgebRegistro[] = [];
  let sinCenso = 0;
  let saltados = 0;

  for (const f of fc.features) {
    const propiedades = (f.properties ?? {}) as Record<string, unknown>;
    const cvegeo = String(propiedades.CVEGEO ?? propiedades.cvegeo ?? "").trim();
    if (cvegeo.length !== 13 || !f.geometry) {
      saltados++;
      continue;
    }
    const vars = censo.get(cvegeo);
    if (!vars) sinCenso++;

    let geometria = f.geometry;
    try {
      geometria = simplify(
        { type: "Feature", properties: {}, geometry: f.geometry },
        { tolerance: toleranciaSimplify, highQuality: false }
      ).geometry;
    } catch {
      // si la simplificación degenera el polígono, se usa el original
    }

    registros.push({
      cvegeo,
      entidad: vars?.entidad ?? cvegeo.slice(0, 2),
      municipio: vars?.municipio ?? cvegeo.slice(2, 5),
      pobtot: vars?.pobtot ?? null,
      p_18ymas: vars?.p_18ymas ?? null,
      p_18a24: vars?.p_18a24 ?? null,
      p_60ymas: vars?.p_60ymas ?? null,
      graproes: vars?.graproes ?? null,
      tvivhab: vars?.tvivhab ?? null,
      vph_autom: vars?.vph_autom ?? null,
      vph_inter: vars?.vph_inter ?? null,
      vph_pc: vars?.vph_pc ?? null,
      nse_proxy: vars?.nse_proxy ?? null,
      geometria: geometria as unknown as Record<string, unknown>,
    });
  }
  return { registros, sinCenso, saltados };
}
