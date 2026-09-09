"use client";

// Mis planes (Planner F1): lista de proyectos del EQUIPO completo
// (colaboración: todos ven todos, con su autor visible). Abrir entra
// al modo Planner; archivar lo saca de la vista activa; eliminar pide
// confirmación en línea y borra en cascada.

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "./AppHeader";
import { createClient } from "@/lib/supabase/client";
import type { PerfilUsuario, Proyecto } from "@/lib/types";

export default function PlanesView({
  usuario,
}: {
  usuario: PerfilUsuario | null;
}) {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState<"activos" | "archivados">("activos");
  /** id del proyecto con confirmación de borrado abierta. */
  const [confirmando, setConfirmando] = useState<string | null>(null);

  async function cargar() {
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from("projects")
      .select(
        "id, nombre_cliente, titulo, creado_por, status, created_at, updated_at, profiles(email, nombre), surveys(count)"
      )
      .order("updated_at", { ascending: false })
      .limit(300);
    if (e) {
      setError(`No pude cargar los planes: ${e.message}`);
    } else {
      setProyectos((data ?? []) as unknown as Proyecto[]);
    }
    setCargando(false);
  }
  useEffect(() => {
    cargar();
  }, []);

  const visibles = proyectos.filter((p) =>
    filtro === "activos" ? p.status === "activo" : p.status === "archivado"
  );
  const archivados = proyectos.filter((p) => p.status === "archivado").length;

  async function cambiarStatus(p: Proyecto, status: "activo" | "archivado") {
    const supabase = createClient();
    const { error: e } = await supabase
      .from("projects")
      .update({ status })
      .eq("id", p.id);
    if (e) setError(`No se pudo actualizar: ${e.message}`);
    else await cargar();
  }

  async function eliminar(p: Proyecto) {
    const supabase = createClient();
    // cascada: se van también levantamientos, puntos, universos y estado
    const { error: e } = await supabase.from("projects").delete().eq("id", p.id);
    if (e) setError(`No se pudo eliminar: ${e.message}`);
    else {
      setConfirmando(null);
      await cargar();
    }
  }

  const conteoLevantamientos = (p: Proyecto) => p.surveys?.[0]?.count ?? 0;

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-fondo p-3">
      <AppHeader usuario={usuario} />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="tarjeta glow-violeta mx-auto max-w-5xl px-6 py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-violeta">
                Planner
              </p>
              <h1 className="mt-1 font-display text-xl font-extrabold tracking-tight text-white">
                Mis planes
              </h1>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">
                Los planes son de todo el equipo: cualquiera puede abrirlos y
                continuar los levantamientos. Crea uno nuevo con el botón{" "}
                <span className="text-violeta">+ Nuevo plan</span> de arriba.
              </p>
            </div>
            {!cargando && !error && archivados > 0 && (
              <div className="flex shrink-0 gap-1 rounded-full border border-linea bg-panel2 p-0.5">
                {(
                  [
                    ["activos", "Activos"],
                    ["archivados", `Archivados (${archivados})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFiltro(key)}
                    className={`rounded-full px-3 py-1 font-mono text-[10px] transition-colors ${
                      filtro === key
                        ? "bg-violeta/15 text-violeta"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {cargando && (
            <p className="mt-8 font-mono text-xs text-zinc-500">
              Cargando planes…
            </p>
          )}
          {error && (
            <p className="mt-8 font-mono text-xs text-magenta">{error}</p>
          )}
          {!cargando && !error && visibles.length === 0 && (
            <div className="mt-8 rounded-lg border border-dashed border-linea bg-panel px-6 py-10 text-center">
              <p className="font-mono text-xs text-zinc-500">
                {filtro === "archivados"
                  ? "No hay planes archivados."
                  : "Todavía no hay planes. Crea el primero con + Nuevo plan: organiza los levantamientos de un cliente y genera el plan completo."}
              </p>
            </div>
          )}

          {visibles.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-xl border border-linea">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-panel2 text-zinc-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-3 py-2.5 font-medium">Título</th>
                    <th className="px-3 py-2.5 font-medium">Creado por</th>
                    <th className="px-3 py-2.5 font-medium">Actualizado</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Levantamientos
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-panel">
                  {visibles.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-linea/60 text-zinc-300"
                    >
                      <td className="max-w-[200px] truncate px-4 py-2.5 font-medium text-white">
                        {p.nombre_cliente}
                        {p.status === "archivado" && (
                          <span className="ml-2 rounded-full border border-linea px-2 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500">
                            archivado
                          </span>
                        )}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-zinc-400">
                        {p.titulo ?? "—"}
                      </td>
                      <td
                        className="max-w-[140px] truncate px-3 py-2.5"
                        title={p.profiles?.email}
                      >
                        {p.creado_por === usuario?.id ? (
                          <span className="text-cian">tú</span>
                        ) : (
                          <span className="text-zinc-400">
                            {p.profiles?.nombre ?? p.profiles?.email ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-zinc-400">
                        {new Date(p.updated_at).toLocaleString("es-MX", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-violeta">
                        {conteoLevantamientos(p)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {confirmando === p.id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] text-magenta">
                              ¿Eliminar el plan y todo su contenido?
                            </span>
                            <button
                              onClick={() => eliminar(p)}
                              className="rounded border border-magenta bg-magenta/10 px-2 py-1 text-[11px] text-magenta transition-colors hover:bg-magenta/20"
                            >
                              Sí, eliminar
                            </button>
                            <button
                              onClick={() => setConfirmando(null)}
                              className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1.5">
                            <Link
                              href={`/planner/${p.id}`}
                              className="rounded border border-violeta/60 bg-violeta/10 px-2 py-1 text-[11px] text-violeta transition-colors hover:bg-violeta/20"
                            >
                              Abrir
                            </Link>
                            <button
                              onClick={() =>
                                cambiarStatus(
                                  p,
                                  p.status === "activo" ? "archivado" : "activo"
                                )
                              }
                              className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
                            >
                              {p.status === "activo" ? "Archivar" : "Restaurar"}
                            </button>
                            <button
                              onClick={() => setConfirmando(p.id)}
                              className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:border-magenta hover:text-magenta"
                              title="Eliminar el plan (pide confirmación)"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
