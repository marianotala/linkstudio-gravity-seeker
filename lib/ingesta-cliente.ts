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
  let filas: Record<string, unknown>[];
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith(".xls") || nombre.endsWith(".xlsx")) {
    const wb = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
    filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  } else {
    // los CSV de INEGI vienen en latin1
    const texto = new TextDecoder("latin1").decode(await archivo.arrayBuffer());
    filas = Papa.parse<Record<string, unknown>>(texto, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toUpperCase(),
    }).data;
  }

  const mapa = new Map<string, VarsCenso>();
  for (const fila of filas) {
    const nomLoc = String(fila.NOM_LOC ?? "").trim().toLowerCase();
    if (!nomLoc.includes("total ageb")) continue;
    const ent = String(fila.ENTIDAD ?? "").padStart(2, "0");
    const mun = String(fila.MUN ?? "").padStart(3, "0");
    const loc = String(fila.LOC ?? "").padStart(4, "0");
    const ageb = String(fila.AGEB ?? "").trim().padStart(4, "0");
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

/**
 * Lee el shapefile (.shp + .dbf + .prj) en el navegador con shpjs y lo
 * reproyecta de la Lambert ITRF2008 de INEGI a WGS84.
 * Notas de la API de shpjs v6 (verificada en el paquete instalado):
 * - parseShp/parseDbf/combine son exports NOMBRADOS (el default es
 *   getShapefile, sin métodos — de ahí el "parseShp is not a function")
 * - parseShp recibe un CONVERSOR de proj4 (usa .inverse), no el .prj crudo
 * - parseDbf recibe el encoding como string: INEGI usa ISO-8859-1
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

  // conversor proyectada→WGS84: del .prj (WKT) o del respaldo de INEGI
  let trans: unknown;
  const prjTexto = prjFile ? await prjFile.text() : null;
  try {
    trans = proj4(prjTexto ?? INEGI_LCC);
  } catch {
    trans = proj4(INEGI_LCC);
  }

  const geoms = parseShp(await shpFile.arrayBuffer(), trans);
  const props = parseDbf(await dbfFile.arrayBuffer(), "ISO-8859-1");
  return combine([geoms, props]);
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
