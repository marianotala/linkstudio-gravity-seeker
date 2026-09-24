// CORRIDAS GRANDES — flujo de aprobación (no bloqueo). Una corrida que
// supera el umbral configurado (consultas o MXN estimados) requiere
// aprobación de un admin ANTES de ejecutarse: la solicitud se guarda en
// run_requests con su configuración y estimado, el admin la aprueba o
// rechaza en /admin, y al aprobarse corre de inmediato con la misma
// maquinaria de chunks (la solicitud aprobada autoriza el gasto ante
// verificar_gasto). Los admin ejecutan directo, con confirmación
// reforzada que muestra el costo estimado y el consumo del día.

import {
  configCostosDe,
  estimarCostoCorridaMxn,
  type ConfigCostos,
} from "./costos";
import { createClient } from "./supabase/client";

export interface SolicitudCorrida {
  id: string;
  user_id: string;
  proyecto_id: string | null;
  origen: string;
  titulo: string;
  firma: string;
  configuracion: Record<string, unknown>;
  consultas_estimadas: number;
  costo_estimado_mxn: number;
  status: "pendiente" | "aprobada" | "rechazada" | "ejecutada" | "cancelada";
  nota_admin: string | null;
  created_at: string;
}

export interface GastoHoy {
  mxn_hoy_global: number;
  mxn_hoy_usuario: number;
  consultas_hoy_global: number;
  limite_global_mxn_dia: number;
  es_admin: boolean;
}

/** Firma estable de la configuración de una corrida (para reencontrar
 * la solicitud aprobada al relanzar la misma corrida). */
export function firmaCorrida(config: unknown): string {
  const s = JSON.stringify(config);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}-${s.length}`;
}

export async function cargarConfigCostosCliente(): Promise<ConfigCostos> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("app_config")
      .select("valor")
      .eq("clave", "costos")
      .maybeSingle();
    return configCostosDe(data?.valor);
  } catch {
    return configCostosDe(null);
  }
}

export async function cargarGastoHoy(): Promise<GastoHoy | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.rpc("gasto_api_hoy");
    return (data as GastoHoy) ?? null;
  } catch {
    return null;
  }
}

export interface ParamsCorrida {
  /** Consultas estimadas (la unidad de los estimadores de la UI). */
  consultas: number;
  origen: string;
  titulo: string;
  configuracion: Record<string, unknown>;
  proyectoId?: string;
}

export type EvaluacionCorrida =
  | { decision: "ejecutar"; solicitudId?: string; costoMxn: number }
  | {
      decision: "confirmar_admin";
      costoMxn: number;
      gasto: GastoHoy | null;
    }
  | { decision: "esperando"; solicitud: SolicitudCorrida; costoMxn: number }
  | { decision: "rechazada"; solicitud: SolicitudCorrida; costoMxn: number };

/**
 * Evalúa una corrida contra el umbral de aprobación:
 * - bajo el umbral → "ejecutar" (flujo normal: estimador + confirmar);
 * - admin → "confirmar_admin" (confirmación reforzada con el gasto del día);
 * - no-admin con solicitud APROBADA de esta misma config → "ejecutar"
 *   (se marca ejecutada y su id autoriza el gasto en el servidor);
 * - no-admin sin solicitud → se CREA y queda "esperando";
 * - última solicitud rechazada → "rechazada" (se muestra la nota).
 */
export async function evaluarCorrida(p: ParamsCorrida): Promise<EvaluacionCorrida> {
  const cfg = await cargarConfigCostosCliente();
  const costoMxn = Math.round(estimarCostoCorridaMxn(p.consultas, cfg) * 100) / 100;
  const esGrande =
    p.consultas > cfg.umbral_aprobacion_consultas ||
    costoMxn > cfg.umbral_aprobacion_mxn;
  if (!esGrande) return { decision: "ejecutar", costoMxn };

  const gasto = await cargarGastoHoy();
  if (gasto?.es_admin) return { decision: "confirmar_admin", costoMxn, gasto };

  const supabase = createClient();
  const firma = firmaCorrida(p.configuracion);
  const { data: ud } = await supabase.auth.getUser();
  const uid = ud?.user?.id;
  const { data: previas } = await supabase
    .from("run_requests")
    .select("*")
    .eq("firma", firma)
    .eq("user_id", uid ?? "")
    .in("status", ["pendiente", "aprobada", "rechazada"])
    .order("created_at", { ascending: false })
    .limit(1);
  const previa = (previas?.[0] as SolicitudCorrida | undefined) ?? null;

  if (previa?.status === "aprobada") {
    // la aprobación ES la autorización del gasto: se consume una vez
    await supabase
      .from("run_requests")
      .update({ status: "ejecutada" })
      .eq("id", previa.id);
    return { decision: "ejecutar", solicitudId: previa.id, costoMxn };
  }
  if (previa?.status === "pendiente") {
    return { decision: "esperando", solicitud: previa, costoMxn };
  }
  if (previa?.status === "rechazada") {
    return { decision: "rechazada", solicitud: previa, costoMxn };
  }
  const solicitud = await crearSolicitud(p, costoMxn);
  return { decision: "esperando", solicitud, costoMxn };
}

export async function crearSolicitud(
  p: ParamsCorrida,
  costoMxn: number
): Promise<SolicitudCorrida> {
  const supabase = createClient();
  const { data: ud } = await supabase.auth.getUser();
  const uid = ud?.user?.id;
  if (!uid) throw new Error("Inicia sesión para solicitar la corrida");
  const { data, error } = await supabase
    .from("run_requests")
    .insert({
      user_id: uid,
      proyecto_id: p.proyectoId ?? null,
      origen: p.origen,
      titulo: p.titulo.slice(0, 200),
      firma: firmaCorrida(p.configuracion),
      configuracion: p.configuracion,
      consultas_estimadas: Math.round(p.consultas),
      costo_estimado_mxn: costoMxn,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`No se pudo registrar la solicitud: ${error?.message}`);
  }
  return data as SolicitudCorrida;
}

/** Estado actual de una solicitud (para el polling de la espera). */
export async function consultarSolicitud(
  id: string
): Promise<SolicitudCorrida | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("run_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return (data as SolicitudCorrida) ?? null;
  } catch {
    return null;
  }
}

/** Consume la aprobación (la corrida arranca YA). */
export async function marcarEjecutada(id: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.from("run_requests").update({ status: "ejecutada" }).eq("id", id);
  } catch {
    // no marcar no bloquea la corrida (verificar_gasto acepta ejecutada)
  }
}
