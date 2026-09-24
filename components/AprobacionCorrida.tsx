"use client";

// GATE DE CORRIDAS GRANDES — hook reutilizable (modo consulta y
// Planner). El caller separa su corrida en `ejecutar(solicitudId?)` y
// llama `gate(params, ejecutar)`:
// - corrida chica → ejecuta de inmediato (flujo normal);
// - admin → panel de confirmación REFORZADA ("esta corrida: ~$450 MXN ·
//   hoy llevas $120 de $500") y ejecuta al confirmar;
// - no-admin sobre el umbral → la solicitud queda EN ESPERA (se ve el
//   estado y el estimado); el hook sondea cada 12 s y, al aprobarse en
//   /admin, la corrida ARRANCA SOLA con la maquinaria de chunks;
//   rechazada → se muestra la nota del admin y se puede re-solicitar.

import { useEffect, useRef, useState } from "react";
import { fmtMxn } from "@/lib/costos";
import {
  consultarSolicitud,
  crearSolicitud,
  evaluarCorrida,
  marcarEjecutada,
  type GastoHoy,
  type ParamsCorrida,
  type SolicitudCorrida,
} from "@/lib/corridas";

const POLL_MS = 12_000;

type Ejecutor = (solicitudId?: string) => void | Promise<void>;

interface EstadoGate {
  tipo: "confirmar_admin" | "esperando" | "rechazada";
  solicitud?: SolicitudCorrida;
  costoMxn: number;
  gasto?: GastoHoy | null;
  params: ParamsCorrida;
}

export function useAprobacionCorrida() {
  const [estado, setEstado] = useState<EstadoGate | null>(null);
  const [error, setError] = useState("");
  const ejecutorRef = useRef<Ejecutor | null>(null);

  /**
   * Evalúa la corrida. Si puede correr, llama `ejecutar` (con el id de
   * la solicitud aprobada si la hubo) y regresa true; si queda gateada
   * (confirmación de admin o espera de aprobación), el hook toma el
   * control y regresa false.
   */
  async function gate(params: ParamsCorrida, ejecutar: Ejecutor): Promise<boolean> {
    setError("");
    ejecutorRef.current = ejecutar;
    try {
      const ev = await evaluarCorrida(params);
      if (ev.decision === "ejecutar") {
        setEstado(null);
        await ejecutar(ev.solicitudId);
        return true;
      }
      if (ev.decision === "confirmar_admin") {
        setEstado({
          tipo: "confirmar_admin",
          costoMxn: ev.costoMxn,
          gasto: ev.gasto,
          params,
        });
        return false;
      }
      setEstado({
        tipo: ev.decision,
        solicitud: ev.solicitud,
        costoMxn: ev.costoMxn,
        params,
      });
      return false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo evaluar la corrida");
      return false;
    }
  }

  // polling de la solicitud en espera: aprobada → arranca sola
  useEffect(() => {
    if (estado?.tipo !== "esperando" || !estado.solicitud) return;
    const id = estado.solicitud.id;
    const timer = setInterval(async () => {
      const s = await consultarSolicitud(id);
      if (!s) return;
      if (s.status === "aprobada") {
        clearInterval(timer);
        setEstado(null);
        await marcarEjecutada(s.id);
        await ejecutorRef.current?.(s.id);
      } else if (s.status === "rechazada") {
        clearInterval(timer);
        setEstado((prev) =>
          prev ? { ...prev, tipo: "rechazada", solicitud: s } : prev
        );
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [estado?.tipo, estado?.solicitud]);

  async function reSolicitar() {
    if (!estado) return;
    try {
      const s = await crearSolicitud(estado.params, estado.costoMxn);
      setEstado({ ...estado, tipo: "esperando", solicitud: s });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo re-solicitar");
    }
  }

  async function confirmarAdmin() {
    if (estado?.tipo !== "confirmar_admin") return;
    setEstado(null);
    await ejecutorRef.current?.();
  }

  const panel = !estado ? (
    error ? (
      <p className="mt-2 font-mono text-[11px] text-magenta">{error}</p>
    ) : null
  ) : estado.tipo === "confirmar_admin" ? (
    <div className="mt-3 rounded-lg border border-amber-400/60 bg-amber-400/10 p-3 font-mono text-[11px] text-amber-400">
      <p className="font-semibold">Corrida grande — confirmación de admin</p>
      <p className="mt-1 text-amber-300/90">
        Esta corrida: ~{fmtMxn(estado.costoMxn)} MXN estimados (
        {estado.params.consultas.toLocaleString("es-MX")} consultas).
        {estado.gasto && (
          <>
            {" "}
            Hoy la plataforma lleva {fmtMxn(estado.gasto.mxn_hoy_global)} de{" "}
            {fmtMxn(estado.gasto.limite_global_mxn_dia)} del límite diario.
          </>
        )}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={confirmarAdmin}
          className="rounded-md border border-amber-400 bg-amber-400/15 px-3 py-1.5 font-semibold text-amber-300 hover:bg-amber-400/25"
        >
          Ejecutar (~{fmtMxn(estado.costoMxn)})
        </button>
        <button
          onClick={() => setEstado(null)}
          className="rounded-md border border-linea bg-panel2 px-3 py-1.5 text-zinc-400 hover:border-zinc-600"
        >
          Cancelar
        </button>
      </div>
    </div>
  ) : estado.tipo === "esperando" ? (
    <div className="mt-3 rounded-lg border border-violeta/50 bg-violeta/10 p-3 font-mono text-[11px] text-violeta">
      <p className="font-semibold">
        ⏳ Esperando aprobación · estimado {fmtMxn(estado.costoMxn)} MXN
      </p>
      <p className="mt-1 text-violeta/80">
        La corrida supera el umbral de corridas grandes (
        {estado.params.consultas.toLocaleString("es-MX")} consultas). Un admin
        la verá en /admin; en cuanto la apruebe, ARRANCA SOLA aquí mismo —
        deja esta pantalla abierta o vuelve a lanzarla después.
      </p>
    </div>
  ) : (
    <div className="mt-3 rounded-lg border border-magenta/50 bg-magenta/10 p-3 font-mono text-[11px] text-magenta">
      <p className="font-semibold">Solicitud rechazada</p>
      {estado.solicitud?.nota_admin && (
        <p className="mt-1 text-magenta/90">
          Nota del admin: {estado.solicitud.nota_admin}
        </p>
      )}
      <button
        onClick={reSolicitar}
        className="mt-2 rounded-md border border-magenta bg-magenta/10 px-3 py-1.5 hover:bg-magenta/20"
      >
        Volver a solicitar
      </button>
    </div>
  );

  return { gate, panel, gateActivo: estado !== null };
}
