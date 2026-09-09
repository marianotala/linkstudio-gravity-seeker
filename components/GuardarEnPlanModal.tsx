"use client";

// Puente modo consulta → Planner: convierte la búsqueda ACTIVA en
// levantamiento(s) de un plan existente (elegir proyecto y rol). Con
// capas múltiples, cada capa se guarda como su propio survey.

import { useEffect, useState } from "react";
import {
  actualizarRunPlanner,
  crearSurveysPlanner,
  ETIQUETA_ROL,
  guardarPuntosPlanner,
  guardarUniversosPlanner,
} from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import type { Poi, Proyecto, RolLevantamiento, Universos } from "@/lib/types";

export default function GuardarEnPlanModal({
  abierto,
  onCerrar,
  pois,
  capas,
  universos,
  configuracion,
  onGuardado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  pois: Poi[];
  capas: { nombre: string; pois: Poi[] }[] | null;
  universos: Universos | null;
  configuracion: Record<string, unknown>;
  onGuardado: (nombreCliente: string) => void;
}) {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [proyectoId, setProyectoId] = useState("");
  const [rol, setRol] = useState<RolLevantamiento>("competencia");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!abierto) return;
    setError("");
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("projects")
        .select("id, nombre_cliente, titulo, creado_por, status, created_at, updated_at")
        .eq("status", "activo")
        .order("updated_at", { ascending: false })
        .limit(100);
      const lista = ((data ?? []) as Proyecto[]) ?? [];
      setProyectos(lista);
      if (lista.length > 0) setProyectoId((prev) => prev || lista[0].id);
    })();
  }, [abierto]);

  if (!abierto) return null;

  async function guardar() {
    const proyecto = proyectos.find((p) => p.id === proyectoId);
    if (!proyecto) {
      setError("Elige un plan (o crea uno con + Nuevo plan)");
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const etiquetas = capas ? capas.map((c) => c.nombre) : [];
      const run = await crearSurveysPlanner(
        { proyectoId: proyecto.id, rol },
        etiquetas.length > 0 ? etiquetas : [null],
        configuracion,
        "google"
      );
      await guardarPuntosPlanner(run, pois);
      if (universos?.disponible) await guardarUniversosPlanner(run, universos);
      await actualizarRunPlanner(run, { status: "completado", progreso: null });
      onGuardado(proyecto.nombre_cliente);
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-fondo/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !guardando) onCerrar();
      }}
    >
      <div className="tarjeta glow-violeta w-full max-w-md px-6 py-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-violeta">
          Planner
        </p>
        <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight text-white">
          Guardar en un plan
        </h2>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
          Esta búsqueda ({pois.length.toLocaleString("es-MX")} puntos
          {capas ? ` en ${capas.length} capas — cada capa será su propio levantamiento` : ""}
          ) se guarda como levantamiento del plan que elijas.
        </p>

        <label className="mt-4 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Plan
        </label>
        {proyectos.length === 0 ? (
          <p className="mt-1.5 font-mono text-[11px] text-zinc-500">
            No hay planes activos — crea uno con el botón{" "}
            <span className="text-violeta">+ Nuevo plan</span> de arriba.
          </p>
        ) : (
          <select
            value={proyectoId}
            onChange={(e) => setProyectoId(e.target.value)}
            disabled={guardando}
            className="mt-1.5 w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 focus:border-violeta focus:outline-none"
          >
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre_cliente}
                {p.titulo ? ` · ${p.titulo}` : ""}
              </option>
            ))}
          </select>
        )}

        <label className="mt-3 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Rol del levantamiento
        </label>
        <div className="mt-1.5 flex gap-1.5">
          {(["poi_propio", "competencia"] as RolLevantamiento[]).map((r) => (
            <button
              key={r}
              onClick={() => setRol(r)}
              disabled={guardando}
              className={`flex-1 rounded-md border px-3 py-2 font-mono text-[11px] transition-colors ${
                rol === r
                  ? r === "poi_propio"
                    ? "border-cian bg-cian/10 text-cian"
                    : "border-magenta bg-magenta/10 text-magenta"
                  : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {ETIQUETA_ROL[r]}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-3 font-mono text-[11px] text-magenta">{error}</p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={guardar}
            disabled={guardando || proyectos.length === 0}
            className="flex-1 rounded-md bg-violeta px-3 py-2.5 font-display text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Guardar levantamiento"}
          </button>
          <button
            onClick={onCerrar}
            disabled={guardando}
            className="rounded-md border border-linea bg-panel2 px-4 py-2.5 font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-40"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
