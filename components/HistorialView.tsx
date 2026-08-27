"use client";

// Historial de búsquedas del usuario (RLS: solo las suyas; admin ve todas).
// Abrir = carga POIs en el mapa del buscador sin llamar a Google.
// Duplicar = precarga solo los parámetros.

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "./AppHeader";
import { getCategoria, SOLO_NOMBRE } from "@/lib/categories";
import { createClient } from "@/lib/supabase/client";
import type { BusquedaGuardada, PerfilUsuario } from "@/lib/types";

function etiquetaCategoria(key: string): string {
  if (key === SOLO_NOMBRE) return "Solo por nombre";
  return getCategoria(key)?.label ?? key;
}

function etiquetaAlcance(b: BusquedaGuardada): string {
  if (b.mode === "zone") {
    return b.params.centers[0]?.nombre ?? "Zona sin nombre";
  }
  if (b.mode === "cp") {
    const cps = b.params.cps ?? [];
    return cps.length > 0
      ? `CP ${cps.slice(0, 4).join(", ")}${cps.length > 4 ? ` +${cps.length - 4}` : ""}`
      : "Códigos postales";
  }
  if (b.mode === "census") {
    const ciudad = b.params.censo?.ciudad ?? b.params.centers[0]?.nombre ?? "Ciudad";
    const celdas = b.params.censo?.celdas;
    return celdas ? `${ciudad} · ${celdas} celdas` : ciudad;
  }
  const n = b.params.centers.length;
  return `${n} ${n === 1 ? "origen" : "orígenes"}`;
}

export default function HistorialView({
  usuario,
}: {
  usuario: PerfilUsuario | null;
}) {
  const [busquedas, setBusquedas] = useState<BusquedaGuardada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // admin: RLS ya le regresa las búsquedas de todo el equipo;
  // este filtro solo decide qué mostrar.
  const esAdmin = usuario?.rol === "admin";
  const [filtro, setFiltro] = useState<"equipo" | "mias">("equipo");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("searches")
        .select(
          "id, user_id, created_at, mode, params, result_count, profiles(email, nombre)"
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (e) {
        setError(`No pude cargar el historial: ${e.message}`);
      } else {
        setBusquedas((data ?? []) as unknown as BusquedaGuardada[]);
      }
      setCargando(false);
    })();
  }, []);

  const visibles =
    esAdmin && filtro === "mias"
      ? busquedas.filter((b) => b.user_id === usuario?.id)
      : busquedas;

  async function borrar(id: string) {
    const supabase = createClient();
    const { error: e } = await supabase.from("searches").delete().eq("id", id);
    if (!e) setBusquedas((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-fondo p-3">
      <AppHeader usuario={usuario} />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="tarjeta glow-violeta mx-auto max-w-5xl px-6 py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-xl font-extrabold tracking-tight text-white">
                Historial de búsquedas
              </h1>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">
                Abre una búsqueda para ver sus POIs en el mapa y re-exportar
                sin llamar a Google, o duplícala para ajustar los parámetros.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {esAdmin && !cargando && !error && (
                <div className="flex gap-1 rounded-full border border-linea bg-panel2 p-0.5">
                  {(
                    [
                      ["equipo", "Equipo"],
                      ["mias", "Mías"],
                    ] as ["equipo" | "mias", string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setFiltro(key)}
                      className={`rounded-full px-3 py-1 font-mono text-[10px] transition-colors ${
                        filtro === key
                          ? "bg-cian/15 text-cian"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {!cargando && !error && (
                <span className="rounded-full border border-linea bg-panel2 px-3 py-1 font-mono text-[10px] text-zinc-400">
                  {visibles.length}{" "}
                  {visibles.length === 1 ? "búsqueda" : "búsquedas"}
                </span>
              )}
            </div>
          </div>

          {cargando && (
            <p className="mt-8 font-mono text-xs text-zinc-500">
              Cargando historial…
            </p>
          )}
          {error && (
            <p className="mt-8 font-mono text-xs text-magenta">{error}</p>
          )}
          {!cargando && !error && visibles.length === 0 && (
            <div className="mt-8 rounded-lg border border-dashed border-linea bg-panel px-6 py-10 text-center">
              <p className="font-mono text-xs text-zinc-500">
                Todavía no hay búsquedas guardadas. Cada búsqueda que hagas en
                el buscador se guarda aquí automáticamente.
              </p>
              <Link
                href="/"
                className="mt-4 inline-block rounded-md border border-cian bg-cian/10 px-4 py-2 font-mono text-xs text-cian transition-colors hover:bg-cian/20"
              >
                Ir al buscador
              </Link>
            </div>
          )}

          {visibles.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-xl border border-linea">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-panel2 text-zinc-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Fecha</th>
                    <th className="px-3 py-2.5 font-medium">Modo</th>
                    <th className="px-3 py-2.5 font-medium">Categoría</th>
                    <th className="px-3 py-2.5 font-medium">Zona / orígenes</th>
                    {esAdmin && (
                      <th className="px-3 py-2.5 font-medium">Autor</th>
                    )}
                    <th className="px-3 py-2.5 text-right font-medium">POIs</th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-panel">
                  {visibles.map((b) => (
                    <tr
                      key={b.id}
                      className="border-t border-linea/60 text-zinc-300"
                    >
                      <td className="px-4 py-2.5 text-zinc-400">
                        {new Date(b.created_at).toLocaleString("es-MX", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={
                            b.mode === "origins"
                              ? "text-cian"
                              : b.mode === "zone"
                                ? "text-violeta"
                                : b.mode === "cp"
                                  ? "text-emerald-400"
                                  : "text-magenta"
                          }
                        >
                          {b.mode === "origins"
                            ? "Orígenes"
                            : b.mode === "zone"
                              ? "Zona"
                              : b.mode === "cp"
                                ? "Código postal"
                                : "Censo"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {etiquetaCategoria(b.params.category)}
                        {b.params.nameFilter && (
                          <span className="text-zinc-500">
                            {" "}
                            · &quot;{b.params.nameFilter}&quot;
                          </span>
                        )}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-zinc-400">
                        {etiquetaAlcance(b)}
                      </td>
                      {esAdmin && (
                        <td
                          className="max-w-[140px] truncate px-3 py-2.5"
                          title={b.profiles?.email}
                        >
                          {b.user_id === usuario?.id ? (
                            <span className="text-cian">tú</span>
                          ) : (
                            <span className="text-zinc-400">
                              {b.profiles?.nombre ?? b.profiles?.email ?? "—"}
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right text-magenta">
                        {b.result_count}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Link
                            href={`/?cargar=${b.id}`}
                            className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-cian hover:text-cian"
                          >
                            Abrir
                          </Link>
                          <Link
                            href={`/?duplicar=${b.id}`}
                            className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-violeta hover:text-violeta"
                          >
                            Duplicar
                          </Link>
                          {/* RLS solo permite borrar las propias */}
                          {b.user_id === usuario?.id && (
                            <button
                              onClick={() => borrar(b.id)}
                              className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:border-magenta hover:text-magenta"
                              title="Borrar del historial"
                            >
                              ×
                            </button>
                          )}
                        </div>
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
