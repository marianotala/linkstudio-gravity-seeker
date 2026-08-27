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
  pobfem: number | null;
  pobmas: number | null;
  p_18ymas: number | null;
  p_18a24: number | null;
  p_60ymas: number | null;
  pob65_mas: number | null;
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
  pobfem: number | null;
  pobmas: number | null;
  p_18ymas: number | null;
  p_18a24: number | null;
  p_60ymas: number | null;
  pob65_mas: number | null;
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
    // INEGI publica los CSV a veces en latin1 y a veces en UTF-8 (con
    // o sin BOM): detección automática con fallback (ver
    // decodificarTextoPlano).
    const texto = decodificarTextoPlano(await archivo.arrayBuffer());
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
      pobfem: num(fila.POBFEM),
      pobmas: num(fila.POBMAS),
      p_18ymas: num(fila.P_18YMAS),
      p_18a24: num(fila.P_18A24),
      p_60ymas: num(fila.P_60YMAS),
      pob65_mas: num(fila.POB65_MAS),
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
  //    lo parsea. Sin .prj legible NO se asume proyección (los
  //    shapefiles de CP suelen venir ya en WGS84): se parsea crudo y
  //    el respaldo de abajo reproyecta con la Lambert de INEGI solo
  //    si las coordenadas resultan proyectadas (metros).
  let defProyeccion: string | undefined;
  if (prjFile) {
    const wkt = await prjFile.text();
    try {
      proj4(wkt);
      defProyeccion = wkt;
    } catch {
      defProyeccion = undefined;
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
    const conv = proj4(defProyeccion ?? INEGI_LCC);
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
      pobfem: vars?.pobfem ?? null,
      pobmas: vars?.pobmas ?? null,
      p_18ymas: vars?.p_18ymas ?? null,
      p_18a24: vars?.p_18a24 ?? null,
      p_60ymas: vars?.p_60ymas ?? null,
      pob65_mas: vars?.pob65_mas ?? null,
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

// ------------------------------------------------------------------
// Polígonos de códigos postales (Correos de México / datos.gob.mx)
// ------------------------------------------------------------------

/** Registro listo para admin_upsert_cps. */
export interface CpRegistro {
  codigo_postal: string;
  geometria: Record<string, unknown>;
}

// Campo del CP en el .dbf. El dataset oficial de Correos de México
// (datos.gob.mx) trae UN solo campo: d_codigo, texto de 5 dígitos con
// ceros a la izquierda (verificado; la comparación es sin
// mayúsculas). Los demás nombres cubren otras versiones publicadas;
// si ninguno aparece, se autodetecta la columna cuyos valores son
// códigos de 4-5 dígitos.
const CAMPOS_CP = [
  "D_CODIGO",
  "D_CP",
  "CP",
  "COD_POST",
  "CODIGO_POS",
  "C_POSTAL",
  "CVE_CP",
  "CODIGO",
];

function detectarCampoCp(fc: GeoJSON.FeatureCollection): string | null {
  const muestra = fc.features.slice(0, 50);
  if (muestra.length === 0) return null;
  const llaves = Object.keys(muestra[0].properties ?? {});
  const porNombre = llaves.find((k) =>
    CAMPOS_CP.includes(k.trim().toUpperCase())
  );
  if (porNombre) return porNombre;
  // autodetección: ≥80% de los valores son códigos de 4-5 dígitos
  // (4 = ceros iniciales perdidos por tipado numérico del .dbf)
  for (const k of llaves) {
    const valores = muestra
      .map((f) => String((f.properties as Record<string, unknown>)?.[k] ?? "").trim())
      .filter(Boolean);
    if (
      valores.length >= muestra.length * 0.8 &&
      valores.filter((v) => /^\d{4,5}$/.test(v)).length >= valores.length * 0.8
    ) {
      return k;
    }
  }
  return null;
}

/**
 * Agrupa las geometrías del shapefile por código postal (5 dígitos,
 * preservando ceros a la izquierda) en un MultiPolygon por CP,
 * simplificado para carga vía admin_upsert_cps.
 */
export function construirCps(
  fc: GeoJSON.FeatureCollection,
  toleranciaSimplify = 0.0001
): { registros: CpRegistro[]; sinCp: number; campoCp: string | null } {
  const campoCp = detectarCampoCp(fc);
  if (!campoCp) return { registros: [], sinCp: fc.features.length, campoCp };

  let sinCp = 0;
  // un CP puede venir en varias features: se acumulan sus polígonos
  const porCp = new Map<string, GeoJSON.Position[][][]>();
  for (const f of fc.features) {
    const crudo = String(
      (f.properties as Record<string, unknown>)?.[campoCp] ?? ""
    ).trim();
    if (!/^\d{4,5}$/.test(crudo) || !f.geometry) {
      sinCp++;
      continue;
    }
    const cp = crudo.padStart(5, "0");

    let geometria = f.geometry;
    try {
      geometria = simplify(
        { type: "Feature", properties: {}, geometry: f.geometry },
        { tolerance: toleranciaSimplify, highQuality: false }
      ).geometry;
    } catch {
      // si la simplificación degenera el polígono, se usa el original
    }

    const acumulado = porCp.get(cp) ?? [];
    if (geometria.type === "Polygon") {
      acumulado.push(geometria.coordinates as GeoJSON.Position[][]);
    } else if (geometria.type === "MultiPolygon") {
      acumulado.push(...(geometria.coordinates as GeoJSON.Position[][][]));
    } else {
      sinCp++;
      continue;
    }
    porCp.set(cp, acumulado);
  }

  const registros: CpRegistro[] = Array.from(porCp.entries()).map(
    ([codigo_postal, coordinates]) => ({
      codigo_postal,
      geometria: { type: "MultiPolygon", coordinates },
    })
  );
  return { registros, sinCp, campoCp };
}

// ------------------------------------------------------------------
// Catálogo Nacional de Códigos Postales (CP → colonias)
// ------------------------------------------------------------------

/** Registro listo para admin_upsert_colonias. */
export interface ColoniaRegistro {
  codigo_postal: string;
  colonia: string;
  tipo_asentamiento: string | null;
  municipio: string | null;
  estado: string | null;
}

/**
 * Decodifica texto plano detectando el encoding: BOM → UTF-8; sin BOM
 * se intenta UTF-8 ESTRICTO (fatal) y solo si los bytes no son UTF-8
 * válido se cae a latin-1. Un archivo latin-1 real con acentos siempre
 * tiene secuencias inválidas en UTF-8, así que el fallback es seguro;
 * forzar latin-1 por default sobre un archivo UTF-8 produce mojibake
 * ("MÃ©xico"). SOLO para texto plano — los .dbf de shapefiles siguen
 * leyéndose como latin-1 en su propio pipeline.
 */
function decodificarTextoPlano(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buffer);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("latin1").decode(buffer);
  }
}

/**
 * Parsea el txt/csv del Catálogo Nacional de Códigos Postales de
 * Correos de México: delimitado por "|" (txt oficial) o por comas
 * (variante CSV, con campos entrecomillados que pueden traer comas),
 * UTF-8 o latin-1 con detección automática, primera línea de
 * copyright y encabezados en la segunda (d_codigo, d_asenta,
 * d_tipo_asenta, D_mnpio, d_estado, …).
 */
export async function parsearCatalogoColonias(
  archivo: File
): Promise<ColoniaRegistro[]> {
  const texto = decodificarTextoPlano(await archivo.arrayBuffer());

  // delimitador según la línea de encabezados
  const lineaHeader = texto
    .split(/\r?\n/)
    .find((l) => /d_codigo/i.test(l));
  if (!lineaHeader) {
    throw new Error(
      "No encontré la columna d_codigo: ¿es el txt/csv del Catálogo Nacional de Códigos Postales?"
    );
  }
  const sep = lineaHeader.includes("|") ? "|" : ",";

  // Papa maneja los campos entrecomillados (una colonia con coma en el
  // nombre NO debe desplazar las columnas, como pasaba con split)
  const filasArr = Papa.parse<string[]>(texto, {
    delimiter: sep,
    header: false,
    skipEmptyLines: true,
  }).data;
  const idxHeader = filasArr.findIndex((f) =>
    f.some((c) => /d_codigo/i.test(c))
  );
  const headers = filasArr[idxHeader].map((h) =>
    h.replace(/^﻿/, "").trim().toLowerCase()
  );
  const col = (nombre: string) => headers.indexOf(nombre);
  const iCp = col("d_codigo");
  const iColonia = col("d_asenta");
  const iTipo = col("d_tipo_asenta");
  const iMun = col("d_mnpio");
  const iEdo = col("d_estado");
  if (iCp === -1 || iColonia === -1) {
    throw new Error(
      "El archivo no trae las columnas d_codigo y d_asenta del catálogo"
    );
  }

  const vistos = new Set<string>();
  const registros: ColoniaRegistro[] = [];
  for (let i = idxHeader + 1; i < filasArr.length; i++) {
    const campos = filasArr[i];
    const cpCrudo = String(campos[iCp] ?? "").trim();
    const colonia = String(campos[iColonia] ?? "").trim();
    if (!/^\d{4,5}$/.test(cpCrudo) || !colonia) continue;
    const codigo_postal = cpCrudo.padStart(5, "0");
    const llave = `${codigo_postal}|${colonia}`;
    if (vistos.has(llave)) continue;
    vistos.add(llave);
    registros.push({
      codigo_postal,
      colonia,
      tipo_asentamiento:
        iTipo >= 0 ? String(campos[iTipo] ?? "").trim() || null : null,
      municipio: iMun >= 0 ? String(campos[iMun] ?? "").trim() || null : null,
      estado: iEdo >= 0 ? String(campos[iEdo] ?? "").trim() || null : null,
    });
  }
  return registros;
}

// ------------------------------------------------------------------
// Localidades rurales (ITER 2020)
// ------------------------------------------------------------------

/** Registro listo para admin_upsert_localidades. */
export interface LocalidadRegistro {
  cvegeo: string;
  entidad: string;
  nom_ent: string | null;
  mun: string | null;
  nom_mun: string | null;
  loc: string | null;
  nom_loc: string | null;
  lng: number;
  lat: number;
  pobtot: number | null;
  pobfem: number | null;
  pobmas: number | null;
  p_18ymas: number | null;
  p_18a24: number | null;
  p_60ymas: number | null;
  vivtot: number | null;
  tvivhab: number | null;
}

const COLUMNAS_ITER = [
  "entidad", "nom_ent", "mun", "nom_mun", "loc", "nom_loc",
  "lng", "lat", "pobtot", "pobfem", "pobmas", "p_18ymas",
  "p_18a24", "p_60ymas", "vivtot", "tvivhab",
] as const;

/**
 * Parsea el CSV nacional YA PROCESADO de localidades rurales del ITER
 * 2020 (columnas exactas de COLUMNAS_ITER; lng/lat en grados decimales
 * WGS84; solo localidades <2,500 hab, sin filas de totales). Los
 * valores confidenciales de INEGI vienen como celda vacía y quedan
 * como null — cuentan cero al sumar pero no distorsionan promedios.
 * UTF-8 con detección automática (decodificarTextoPlano).
 */
export async function parsearLocalidadesRurales(
  archivo: File
): Promise<{ registros: LocalidadRegistro[]; saltados: number }> {
  const texto = decodificarTextoPlano(await archivo.arrayBuffer());
  const res = Papa.parse<Record<string, string>>(texto, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.replace(/^﻿/, "").trim().toLowerCase(),
  });
  const headers = (res.meta.fields ?? []).map((h) => h.toLowerCase());
  const faltantes = COLUMNAS_ITER.filter((c) => !headers.includes(c));
  if (faltantes.length > 0) {
    throw new Error(
      `Al CSV le faltan columnas del ITER procesado: ${faltantes.join(", ")}`
    );
  }

  const registros: LocalidadRegistro[] = [];
  const vistos = new Set<string>();
  let saltados = 0;
  for (const fila of res.data) {
    const entidad = String(fila.entidad ?? "").trim().padStart(2, "0");
    const mun = String(fila.mun ?? "").trim().padStart(3, "0");
    const loc = String(fila.loc ?? "").trim().padStart(4, "0");
    const lng = num(fila.lng);
    const lat = num(fila.lat);
    // sin clave o sin coordenadas válidas de México no hay punto que cargar
    if (
      !/^\d{2}$/.test(entidad) || !/^\d{3}$/.test(mun) || !/^\d{4}$/.test(loc) ||
      lng === null || lat === null ||
      lng < -120 || lng > -85 || lat < 13 || lat > 34
    ) {
      saltados++;
      continue;
    }
    const cvegeo = `${entidad}${mun}${loc}`;
    if (vistos.has(cvegeo)) {
      saltados++;
      continue;
    }
    vistos.add(cvegeo);
    registros.push({
      cvegeo,
      entidad,
      nom_ent: String(fila.nom_ent ?? "").trim() || null,
      mun,
      nom_mun: String(fila.nom_mun ?? "").trim() || null,
      loc,
      nom_loc: String(fila.nom_loc ?? "").trim() || null,
      lng,
      lat,
      pobtot: num(fila.pobtot),
      pobfem: num(fila.pobfem),
      pobmas: num(fila.pobmas),
      p_18ymas: num(fila.p_18ymas),
      p_18a24: num(fila.p_18a24),
      p_60ymas: num(fila.p_60ymas),
      vivtot: num(fila.vivtot),
      tvivhab: num(fila.tvivhab),
    });
  }
  return { registros, saltados };
}
