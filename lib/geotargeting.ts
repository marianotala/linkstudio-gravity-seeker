// GEO-TARGETING (CPs + keywords): automatiza el armado de la táctica
// de campaña geolocalizada en los CPs cercanos a los PDVs, activada
// por keyword/contextual targeting en el DSP (Simpli.fi/Eskimi).
// Seeker genera los DOS insumos: la lista de CPs (consulta local
// PostGIS, gratis) y el bulk de keywords clasificado (IA — la key de
// Anthropic vive SOLO en el servidor, vía /api/keywords).

import { postJson } from "./busqueda-cliente";
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
  /** CPs compactos (la geometría se re-consulta al reabrir, gratis). */
  cps: { cp: string; municipio: string | null }[];
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
