#!/usr/bin/env node
// ============================================================
// Ingesta de AGEBs urbanas a PostGIS (Supabase) — corre UNA VEZ
// por entidad. Ver README.md de esta carpeta para el paso a paso.
//
// Entradas:
//  --entidad 09                      clave INEGI de la entidad
//  --shp ../../data/09a.shp          shapefile de AGEB urbana (MG 2020)
//  --censo ../../data/RESAGEBURB_09CSV20.csv   resultados por AGEB/manzana
//  --tolerancia 0.0001               simplificación (grados, ~10 m)
//
// Env: SUPABASE_DB_URL = cadena de conexión Postgres de Supabase
// ============================================================

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import * as shapefile from "shapefile";
import proj4 from "proj4";
import simplify from "@turf/simplify";
import Papa from "papaparse";
import pg from "pg";

const { values: args } = parseArgs({
  options: {
    entidad: { type: "string" },
    shp: { type: "string" },
    censo: { type: "string" },
    tolerancia: { type: "string", default: "0.0001" },
  },
});

if (!args.entidad || !args.shp || !args.censo) {
  console.error(
    "Uso: node index.mjs --entidad 09 --shp ../../data/09a.shp --censo ../../data/RESAGEBURB_09CSV20.csv"
  );
  process.exit(1);
}
if (!process.env.SUPABASE_DB_URL) {
  console.error(
    "Falta SUPABASE_DB_URL (Supabase → Settings → Database → Connection string, URI)."
  );
  process.exit(1);
}

const TOLERANCIA = Number(args.tolerancia);

// Proyección del Marco Geoestadístico de INEGI (Lambert Conformal
// Conic sobre GRS80/ITRF2008). Se usa si el .prj no es geográfico.
const INEGI_LCC =
  "+proj=lcc +lat_1=17.5 +lat_2=29.5 +lat_0=12 +lon_0=-102 +x_0=2500000 +y_0=0 +ellps=GRS80 +units=m +no_defs";

// ---- 1) Censo: variables por AGEB -------------------------------

/** "*" y "N/D" son confidencialidad de INEGI → null. */
function num(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "" || s === "*" || s.toUpperCase() === "N/D") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * Índice socioeconómico aproximado 0-100 (PROXY CENSAL, no NSE AMAI):
 *   nse = 100 × (0.4·escolaridad + 0.3·autos + 0.3·internet)
 *   escolaridad = (GRAPROES − 4) / 12, recortado a [0,1]
 *                  (4 ≈ primaria incompleta, 16 ≈ posgrado)
 *   autos       = VPH_AUTOM / TVIVHAB, recortado a [0,1]
 *   internet    = VPH_INTER / TVIVHAB, recortado a [0,1]
 * Si ninguna componente está disponible → null.
 */
function nseProxy(graproes, vphAutom, vphInter, tvivhab) {
  const comps = [];
  if (graproes !== null) comps.push([0.4, clamp01((graproes - 4) / 12)]);
  if (vphAutom !== null && tvivhab) comps.push([0.3, clamp01(vphAutom / tvivhab)]);
  if (vphInter !== null && tvivhab) comps.push([0.3, clamp01(vphInter / tvivhab)]);
  if (comps.length === 0) return null;
  const pesoTotal = comps.reduce((s, [w]) => s + w, 0);
  const suma = comps.reduce((s, [w, v]) => s + w * v, 0);
  return Math.round((100 * suma) / pesoTotal * 10) / 10;
}

console.log(`→ Leyendo censo: ${args.censo}`);
const csvTexto = readFileSync(args.censo, "latin1"); // INEGI usa latin1/ansi
const censo = Papa.parse(csvTexto, { header: true, skipEmptyLines: true });

const porCvegeo = new Map();
for (const fila of censo.data) {
  // Filas de nivel AGEB: NOM_LOC = "Total AGEB urbana" (MZA = 0)
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

  porCvegeo.set(cvegeo, {
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
    nse_proxy: nseProxy(graproes, vphAutom, vphInter, tvivhab),
  });
}
console.log(`  ${porCvegeo.size} AGEBs con datos censales`);

// ---- 2) Shapefile: geometrías ------------------------------------

let reproyectar = null;
try {
  const prj = readFileSync(args.shp.replace(/\.shp$/i, ".prj"), "utf8");
  if (/lambert|conformal|conic/i.test(prj)) {
    reproyectar = proj4(INEGI_LCC, "EPSG:4326");
    console.log("→ .prj en Lambert Conformal Conic: reproyectando a WGS84");
  }
} catch {
  console.log("→ Sin .prj legible; se detectará por magnitud de coordenadas");
}

function transformarCoords(coords) {
  if (typeof coords[0] === "number") {
    // detección de respaldo: coordenadas proyectadas son > 180
    if (!reproyectar && Math.abs(coords[0]) <= 180) return coords;
    const fn = reproyectar ?? proj4(INEGI_LCC, "EPSG:4326");
    const [x, y] = fn.forward([coords[0], coords[1]]);
    return [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6];
  }
  return coords.map(transformarCoords);
}

console.log(`→ Leyendo shapefile: ${args.shp}`);
const features = [];
const source = await shapefile.open(args.shp, undefined, { encoding: "latin1" });
for (;;) {
  const r = await source.read();
  if (r.done) break;
  features.push(r.value);
}
console.log(`  ${features.length} geometrías en el shapefile`);

// ---- 3) Cargar a PostGIS -----------------------------------------

const cliente = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await cliente.connect();

let cargados = 0;
let sinCenso = 0;
let saltados = 0;
const LOTE = 200;
let lote = [];

async function flush() {
  if (lote.length === 0) return;
  const valores = [];
  const params = [];
  lote.forEach((f, i) => {
    const base = i * 14;
    valores.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13}, extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($${base + 14}),4326)))`
    );
    params.push(
      f.cvegeo, f.entidad, f.municipio, f.pobtot, f.p_18ymas, f.p_18a24,
      f.p_60ymas, f.graproes, f.tvivhab, f.vph_autom, f.vph_inter, f.vph_pc,
      f.nse_proxy, JSON.stringify(f.geometry)
    );
  });
  await cliente.query(
    `insert into public.agebs
      (cvegeo, entidad, municipio, pobtot, p_18ymas, p_18a24, p_60ymas,
       graproes, tvivhab, vph_autom, vph_inter, vph_pc, nse_proxy, geom)
     values ${valores.join(",")}
     on conflict (cvegeo) do update set
       entidad = excluded.entidad, municipio = excluded.municipio,
       pobtot = excluded.pobtot, p_18ymas = excluded.p_18ymas,
       p_18a24 = excluded.p_18a24, p_60ymas = excluded.p_60ymas,
       graproes = excluded.graproes, tvivhab = excluded.tvivhab,
       vph_autom = excluded.vph_autom, vph_inter = excluded.vph_inter,
       vph_pc = excluded.vph_pc, nse_proxy = excluded.nse_proxy,
       geom = excluded.geom`,
    params
  );
  cargados += lote.length;
  process.stdout.write(`\r  cargados: ${cargados}`);
  lote = [];
}

for (const f of features) {
  const cvegeo = String(f.properties?.CVEGEO ?? f.properties?.cvegeo ?? "").trim();
  if (cvegeo.length !== 13) {
    saltados++;
    continue;
  }
  const censoAgeb = porCvegeo.get(cvegeo);
  if (!censoAgeb) sinCenso++;

  let geometry = {
    type: f.geometry.type,
    coordinates: transformarCoords(f.geometry.coordinates),
  };
  try {
    geometry = simplify(
      { type: "Feature", properties: {}, geometry },
      { tolerance: TOLERANCIA, highQuality: false }
    ).geometry;
  } catch {
    // si la simplificación degenera el polígono, se carga sin simplificar
  }

  lote.push({
    cvegeo,
    entidad: censoAgeb?.entidad ?? cvegeo.slice(0, 2),
    municipio: censoAgeb?.municipio ?? cvegeo.slice(2, 5),
    pobtot: censoAgeb?.pobtot ?? null,
    p_18ymas: censoAgeb?.p_18ymas ?? null,
    p_18a24: censoAgeb?.p_18a24 ?? null,
    p_60ymas: censoAgeb?.p_60ymas ?? null,
    graproes: censoAgeb?.graproes ?? null,
    tvivhab: censoAgeb?.tvivhab ?? null,
    vph_autom: censoAgeb?.vph_autom ?? null,
    vph_inter: censoAgeb?.vph_inter ?? null,
    vph_pc: censoAgeb?.vph_pc ?? null,
    nse_proxy: censoAgeb?.nse_proxy ?? null,
    geometry,
  });
  if (lote.length >= LOTE) await flush();
}
await flush();
await cliente.end();

console.log(`\n✔ Entidad ${args.entidad}: ${cargados} AGEBs cargados`);
console.log(`  · sin datos censales (solo geometría): ${sinCenso}`);
console.log(`  · geometrías saltadas (CVEGEO inválido): ${saltados}`);
