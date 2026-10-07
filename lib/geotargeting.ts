// GEO-TARGETING (CPs + keywords): automatiza el armado de la táctica
// de campaña geolocalizada en los CPs cercanos a los PDVs, activada
// por keyword/contextual targeting en el DSP (Simpli.fi/Eskimi).
// Seeker genera los DOS insumos: la lista de CPs (consulta local
// PostGIS, gratis) y el bulk de keywords clasificado (IA — la key de
// Anthropic vive SOLO en el servidor, vía /api/keywords).

import { postJson } from "./busqueda-cliente";
import { cargarPuntosSurveys } from "./planner";
import { createClient } from "@/lib/supabase/client";
import type { Viewport } from "./types";

// ------------------------------------------------------------------
// CPs por radios (PostGIS local, 0 consultas a APIs externas)
// ------------------------------------------------------------------

export interface CpCobertura {
  codigo_postal: string;
  entidad: string;
  /** Índices de los centros (tiendas) cuyos radios cubren este CP —
   * un CP repetido entre tiendas cercanas es correcto. */
  origenes?: number[];
  municipio: string | null;
  /** Colonias principales del catálogo (hasta 3); null sin catálogo. */
  colonias: string[] | null;
  total_colonias: number | null;
  bbox: Viewport;
  /** GeoJSON geometry simplificada para el mapa (null si no se pidió). */
  geometria: Record<string, unknown> | null;
  /** Adultos 18+ del CP (interpolación areal censal) — se llena con
   * ⟳ Universo por CP; null mientras no se calcule. */
  universo_18?: number | null;
}

export const RADIOS_GEOTARGETING = [
  { m: 1000, label: "1 km" },
  { m: 3000, label: "3 km" },
  { m: 5000, label: "5 km" },
  { m: 10000, label: "10 km" },
];

/** Máximo de centros que acepta la RPC (consolidar o recortar antes). */
export const MAX_CENTROS_GEO = 500;

/**
 * Todos los códigos postales cuyo polígono intersecta los radios de
 * los centros. Operación gratuita (PostGIS propio, sin APIs externas).
 */
export async function calcularCpsPorRadios(
  centros: { lat: number; lng: number }[],
  radioM: number,
  incluirGeometria = true
): Promise<CpCobertura[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cps_por_radios", {
    p_centros: centros.map((c) => ({ lat: c.lat, lng: c.lng })),
    p_radio_m: radioM,
    p_incluir_geometria: incluirGeometria,
  });
  if (error) {
    throw new Error(`No se pudieron calcular los CPs: ${error.message}`);
  }
  const r = data as { cps?: CpCobertura[] } | null;
  return r?.cps ?? [];
}

// ------------------------------------------------------------------
// Bulk de keywords (IA) — tres grupos: marca / industria / competencia
// ------------------------------------------------------------------

export type GrupoKeywords = "marca" | "industria" | "competencia";

export interface BulkKeywords {
  marca: string[];
  industria: string[];
  competencia: string[];
}

export const CANTIDADES_KEYWORDS = [100, 300, 500] as const;

/** Costo estimado en USD de generar n keywords (modelo económico,
 * mismo de la depuración): ~600 tokens de prompt + ~9 tokens por
 * keyword de salida. Transparencia: se muestra ANTES de generar. */
export function costoEstimadoKeywordsUsd(n: number): number {
  const USD_POR_MTOK_IN = 1; // Haiku 4.5
  const USD_POR_MTOK_OUT = 5;
  const tokensIn = 600;
  const tokensOut = n * 9 + 100;
  return (
    (tokensIn * USD_POR_MTOK_IN + tokensOut * USD_POR_MTOK_OUT) / 1_000_000
  );
}

export interface ParamsKeywords {
  marca: string;
  industria: string;
  competidores: string[];
  cantidad: number;
  /** Ciudades/plazas del plan para keywords locales ("pizza monterrey"). */
  ciudades?: string[];
}

/** Genera el bulk clasificado vía /api/keywords (Claude en el
 * servidor). Regresa los tres grupos ya deduplicados y filtrados. */
export async function generarBulkKeywords(
  params: ParamsKeywords
): Promise<{ keywords: BulkKeywords; modelo: string }> {
  return await postJson<{ keywords: BulkKeywords; modelo: string }>(
    "/api/keywords",
    params as unknown as Record<string, unknown>
  );
}

// ------------------------------------------------------------------
// Persistencia: survey rol 'geotargeting' (reabrible, re-ejecutable)
// ------------------------------------------------------------------

export interface ConfigGeotargeting {
  nombre: string;
  radio: number;
  /** Descripción del origen ("38 puntos de Domino's MTY" / "12 recolectados"). */
  origen: string;
  /** Survey fuente de los centros (para re-ejecutar), si aplica. */
  origenSurveyId?: string | null;
  /** Centros usados (para re-ejecutar cargas manuales; cap 500). */
  centros?: { lat: number; lng: number; nombre?: string }[];
  /** CPs compactos (la geometría se re-consulta al reabrir, gratis).
   * universo_18 se persiste para no repetir la interpolación. */
  cps: { cp: string; municipio: string | null; universo_18?: number | null }[];
  keywords?: BulkKeywords | null;
  /** Contexto del generador (para reabrir con el formulario lleno). */
  kwParams?: Omit<ParamsKeywords, "cantidad"> & { cantidad?: number };
  generado_en: string;
}

export async function guardarSurveyGeotargeting(
  proyectoId: string,
  config: ConfigGeotargeting,
  /** Si viene, actualiza ese survey (reabierto) en vez de crear otro. */
  surveyId?: string | null
): Promise<string> {
  const supabase = createClient();
  if (surveyId) {
    const { error } = await supabase
      .from("surveys")
      .update({ configuracion: config as unknown as Record<string, unknown> })
      .eq("id", surveyId);
    if (error) throw new Error(`No se pudo actualizar: ${error.message}`);
    return surveyId;
  }
  const { data, error } = await supabase
    .from("surveys")
    .insert({
      project_id: proyectoId,
      rol: "geotargeting",
      fuente: "geotargeting",
      status: "completado",
      configuracion: config as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`No se pudo guardar: ${error?.message}`);
  }
  return data.id as string;
}

// ------------------------------------------------------------------
// Export: el entregable para el trafficker
// ------------------------------------------------------------------

const limpiarNombre = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "geotargeting";

/**
 * Export Geo-Targeting (.xlsx): hoja CPs (uno por fila, listos para
 * pegar en el DSP + contexto) y hojas Keywords_Marca / _Industria /
 * _Competencia (una keyword por fila).
 */
export async function exportarGeotargetingXlsx(
  cps: CpCobertura[],
  keywords: BulkKeywords | null,
  cliente: string,
  /** Nombres de los centros, alineados con CpCobertura.origenes —
   * habilitan "tiendas_que_cubre" y la hoja CPs_por_origen. */
  nombresOrigenes?: string[]
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const nombreDe = (idx: number) =>
    nombresOrigenes?.[idx]?.trim() || `Origen ${idx + 1}`;

  const filasCps = cps.map((c) => ({
    codigo_postal: c.codigo_postal,
    municipio: c.municipio ?? "",
    colonias_principales: (c.colonias ?? []).join(" · "),
    total_colonias: c.total_colonias ?? "",
    entidad: c.entidad,
    tiendas_que_cubre: c.origenes?.length ?? "",
    tiendas: (c.origenes ?? []).map(nombreDe).join(" · "),
    universo_18: c.universo_18 ?? "",
  }));
  const hojaCps = XLSX.utils.json_to_sheet(
    filasCps.length > 0 ? filasCps : [{ codigo_postal: "" }]
  );
  hojaCps["!cols"] = [
    { wch: 14 },
    { wch: 24 },
    { wch: 46 },
    { wch: 13 },
    { wch: 9 },
    { wch: 16 },
    { wch: 60 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, hojaCps, "CPs");

  // desglose tienda×CP: la base para armar line items y presupuesto
  // por tienda en el DSP (una fila por combinación origen→CP)
  const filasPorOrigen = cps
    .flatMap((c) =>
      (c.origenes ?? []).map((idx) => ({
        idx,
        origen: nombreDe(idx),
        codigo_postal: c.codigo_postal,
        municipio: c.municipio ?? "",
        colonias_principales: (c.colonias ?? []).join(" · "),
      }))
    )
    .sort(
      (a, b) =>
        a.idx - b.idx || a.codigo_postal.localeCompare(b.codigo_postal)
    )
    .map(({ idx: _idx, ...fila }) => fila);
  if (filasPorOrigen.length > 0) {
    const hojaOrigen = XLSX.utils.json_to_sheet(filasPorOrigen);
    hojaOrigen["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 24 }, { wch: 46 }];
    XLSX.utils.book_append_sheet(wb, hojaOrigen, "CPs_por_origen");
  }

  // keywords: SOLO hojas con contenido — nada de grupos fantasma
  const hojaKw = (lista: string[], titulo: string) => {
    if (lista.length === 0) return;
    const hoja = XLSX.utils.json_to_sheet(lista.map((k) => ({ keyword: k })));
    hoja["!cols"] = [{ wch: 44 }];
    XLSX.utils.book_append_sheet(wb, hoja, titulo);
  };
  if (keywords) {
    hojaKw(keywords.marca, "Keywords_Marca");
    hojaKw(keywords.industria, "Keywords_Industria");
    hojaKw(keywords.competencia, "Keywords_Competencia");
  }

  XLSX.writeFile(wb, `seeker_geotargeting_${limpiarNombre(cliente)}.xlsx`);
}

// ------------------------------------------------------------------
// Exports GeoJSON: archivos .geojson APARTE (nunca geometrías en
// celdas de Excel) con los polígonos REALES de los CPs en WGS84
// [lng, lat], listos para cargar en el DSP o abrir en geojson.io.
// Las geometrías vienen de la RPC ya pasadas por ST_MakeValid.
// ------------------------------------------------------------------

interface FeatureGeo {
  type: "Feature";
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
}

export interface FeatureCollectionGeo {
  type: "FeatureCollection";
  features: FeatureGeo[];
}

/** Nombre de archivo por tienda dentro del ZIP (slug en minúsculas). */
const slugTienda = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "origen";

function propsDeCp(
  c: CpCobertura,
  nombreDe: (idx: number) => string
): Record<string, unknown> {
  return {
    codigo_postal: c.codigo_postal,
    municipio: c.municipio,
    entidad: c.entidad,
    colonias_principales: (c.colonias ?? []).join(" · ") || null,
    tiendas_que_cubre: c.origenes?.length ?? null,
    tiendas: (c.origenes ?? []).map(nombreDe).join(" · ") || null,
    universo_18: c.universo_18 ?? null,
  };
}

const nombreOrigenDe =
  (nombres?: string[]) => (idx: number) =>
    nombres?.[idx]?.trim() || `Origen ${idx + 1}`;

/** FeatureCollection global: un Feature por CP de la cobertura. */
export function featureCollectionCobertura(
  cps: CpCobertura[],
  nombresOrigenes?: string[]
): FeatureCollectionGeo {
  const nombreDe = nombreOrigenDe(nombresOrigenes);
  return {
    type: "FeatureCollection",
    features: cps
      .filter((c) => c.geometria)
      .map((c) => ({
        type: "Feature" as const,
        geometry: c.geometria!,
        properties: propsDeCp(c, nombreDe),
      })),
  };
}

/** FeatureCollection por origen: un Feature por tienda×CP (el mismo
 * CP aparece una vez por cada tienda cuyo radio lo cubre). */
export function featureCollectionPorOrigen(
  cps: CpCobertura[],
  nombresOrigenes?: string[]
): FeatureCollectionGeo {
  const nombreDe = nombreOrigenDe(nombresOrigenes);
  const features = cps
    .filter((c) => c.geometria)
    .flatMap((c) =>
      (c.origenes ?? []).map((idx) => ({
        idx,
        f: {
          type: "Feature" as const,
          geometry: c.geometria!,
          properties: {
            origen: nombreDe(idx),
            codigo_postal: c.codigo_postal,
            municipio: c.municipio,
            entidad: c.entidad,
            colonias_principales: (c.colonias ?? []).join(" · ") || null,
            universo_18: c.universo_18 ?? null,
          },
        },
      }))
    )
    .sort(
      (a, b) =>
        a.idx - b.idx ||
        String(a.f.properties.codigo_postal).localeCompare(
          String(b.f.properties.codigo_postal)
        )
    )
    .map((x) => x.f);
  return { type: "FeatureCollection", features };
}

export function descargarBlob(nombre: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const descargarGeoJson = (nombre: string, fc: FeatureCollectionGeo) =>
  descargarBlob(
    nombre,
    new Blob([JSON.stringify(fc)], { type: "application/geo+json" })
  );

/** geotargeting_[plan]_cobertura.geojson — un polígono por CP. */
export function exportarGeoJsonCobertura(
  cps: CpCobertura[],
  plan: string,
  nombresOrigenes?: string[]
) {
  descargarGeoJson(
    `geotargeting_${limpiarNombre(plan)}_cobertura.geojson`,
    featureCollectionCobertura(cps, nombresOrigenes)
  );
}

/** geotargeting_[plan]_por_origen.geojson — Feature por tienda×CP. */
export function exportarGeoJsonPorOrigen(
  cps: CpCobertura[],
  plan: string,
  nombresOrigenes?: string[]
) {
  descargarGeoJson(
    `geotargeting_${limpiarNombre(plan)}_por_origen.geojson`,
    featureCollectionPorOrigen(cps, nombresOrigenes)
  );
}

/** geotargeting_[plan]_origenes.zip — UN .geojson por tienda (solo con
 * los CPs que ESA tienda cubre), nombrado por la tienda slugificada. */
export async function exportarZipPorOrigen(
  cps: CpCobertura[],
  plan: string,
  nombresOrigenes: string[]
) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const nombreDe = nombreOrigenDe(nombresOrigenes);
  const usados = new Set<string>();
  for (let idx = 0; idx < nombresOrigenes.length; idx++) {
    const propios = cps.filter((c) => (c.origenes ?? []).includes(idx));
    if (propios.length === 0) continue;
    let archivo = slugTienda(nombreDe(idx));
    // dos sucursales con el mismo nombre no se pisan dentro del ZIP
    if (usados.has(archivo)) archivo = `${archivo}-${idx + 1}`;
    usados.add(archivo);
    zip.file(
      `${archivo}.geojson`,
      JSON.stringify(featureCollectionCobertura(propios, nombresOrigenes))
    );
  }
  const blob = await zip.generateAsync({ type: "blob" });
  descargarBlob(`geotargeting_${limpiarNombre(plan)}_origenes.zip`, blob);
}

/** ZIP integral del proyecto: cobertura global + por origen + un
 * .geojson por tienda en origenes/ — todo el geo-targeting en UNA
 * descarga desde el Export data. */
export async function exportarZipProyectoGeo(
  cps: CpCobertura[],
  plan: string,
  nombresOrigenes: string[]
) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const base = `geotargeting_${limpiarNombre(plan)}`;
  zip.file(
    `${base}_cobertura.geojson`,
    JSON.stringify(featureCollectionCobertura(cps, nombresOrigenes))
  );
  if (nombresOrigenes.length > 0) {
    zip.file(
      `${base}_por_origen.geojson`,
      JSON.stringify(featureCollectionPorOrigen(cps, nombresOrigenes))
    );
    const nombreDe = nombreOrigenDe(nombresOrigenes);
    const usados = new Set<string>();
    for (let idx = 0; idx < nombresOrigenes.length; idx++) {
      const propios = cps.filter((c) => (c.origenes ?? []).includes(idx));
      if (propios.length === 0) continue;
      let archivo = slugTienda(nombreDe(idx));
      if (usados.has(archivo)) archivo = `${archivo}-${idx + 1}`;
      usados.add(archivo);
      zip.file(
        `origenes/${archivo}.geojson`,
        JSON.stringify(featureCollectionCobertura(propios, nombresOrigenes))
      );
    }
  }
  const blob = await zip.generateAsync({ type: "blob" });
  descargarBlob(`${base}_geojson.zip`, blob);
}

// ------------------------------------------------------------------
// Reconstrucción de cobertura desde la config guardada (gratis):
// para reabrir, exportar desde el plan y armar la sección del PDF
// sin repetir trabajo pagado.
// ------------------------------------------------------------------

export interface CpGeometria {
  codigo_postal: string;
  entidad: string;
  bbox: Viewport;
  geometria: Record<string, unknown> | null;
  colonias: string[] | null;
  total_colonias: number | null;
  municipio: string | null;
}

/** Geometrías + contexto por código postal vía buscar_cps (lotes de
 * 500 — el máximo de la RPC). */
export async function geometriasPorCodigo(
  codigos: string[]
): Promise<Map<string, CpGeometria>> {
  const supabase = createClient();
  const salida = new Map<string, CpGeometria>();
  for (let i = 0; i < codigos.length; i += 500) {
    const lote = codigos.slice(i, i + 500);
    if (lote.length === 0) break;
    const { data, error } = await supabase.rpc("buscar_cps", {
      p_cps: lote,
      p_incluir_geometria: true,
    });
    if (error) {
      throw new Error(`No se pudieron cargar los CPs: ${error.message}`);
    }
    const enc = (data as { encontrados?: CpGeometria[] } | null)?.encontrados;
    for (const f of enc ?? []) {
      salida.set(f.codigo_postal, f);
    }
  }
  return salida;
}

/**
 * Reconstruye la cobertura completa de un geo-targeting guardado:
 * re-corre la RPC de radios si hay centros (relación origen→CP
 * incluida) o, si el origen ya no existe, reconstruye las geometrías
 * desde los códigos guardados con buscar_cps. Siempre conserva el
 * universo_18 persistido en la config.
 */
export async function reconstruirCobertura(cfg: ConfigGeotargeting): Promise<{
  cps: CpCobertura[];
  /** Centros re-ejecutados (vacío cuando solo quedaron los códigos). */
  centros: { lat: number; lng: number; nombre?: string }[];
}> {
  const uniGuardado = new Map(
    (cfg.cps ?? []).map((c) => [c.cp, c.universo_18 ?? null])
  );
  let centros: { lat: number; lng: number; nombre?: string }[] =
    cfg.centros ?? [];
  if (cfg.origenSurveyId) {
    const mapa = await cargarPuntosSurveys([cfg.origenSurveyId]);
    const pts = mapa.get(cfg.origenSurveyId) ?? [];
    if (pts.length > 0) {
      centros = pts.map((p) => ({ lat: p.lat, lng: p.lng, nombre: p.nombre }));
    }
  }
  centros = centros.slice(0, MAX_CENTROS_GEO);
  if (centros.length > 0) {
    const cps = await calcularCpsPorRadios(centros, cfg.radio);
    for (const c of cps) {
      c.universo_18 = uniGuardado.get(c.codigo_postal) ?? null;
    }
    return { cps, centros };
  }
  // sin centros re-ejecutables: geometrías desde los códigos guardados
  const geom = await geometriasPorCodigo((cfg.cps ?? []).map((c) => c.cp));
  const cps: CpCobertura[] = (cfg.cps ?? []).flatMap((c) => {
    const g = geom.get(c.cp);
    if (!g) return [];
    return [
      {
        codigo_postal: c.cp,
        entidad: g.entidad,
        municipio: c.municipio ?? g.municipio,
        colonias: (g.colonias ?? []).slice(0, 3),
        total_colonias: g.total_colonias,
        bbox: g.bbox,
        geometria: g.geometria,
        universo_18: c.universo_18 ?? null,
      },
    ];
  });
  return { cps, centros: [] };
}

/** CSV plano de un bloque (CPs o un grupo de keywords). */
export function exportarBloqueCsv(
  bloque: "cps" | GrupoKeywords,
  cps: CpCobertura[],
  keywords: BulkKeywords | null,
  cliente: string
) {
  const lineas =
    bloque === "cps"
      ? ["codigo_postal", ...cps.map((c) => c.codigo_postal)]
      : ["keyword", ...(keywords?.[bloque] ?? [])];
  const blob = new Blob(["﻿" + lineas.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `seeker_geotargeting_${bloque}_${limpiarNombre(cliente)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
