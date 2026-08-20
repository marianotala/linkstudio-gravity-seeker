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

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("searches")
        .select("id, created_at, mode, params, result_count")
        .order("created_at", { ascending: false })
        .limit(200);
      if (e) {
        setError(`No pude cargar el historial: ${e.message}`);
      } else {
        setBusquedas((data ?? []) as unknown as BusquedaGuardada[]);
      }
      setCargando(false);
    })();
  }, []);

  async function borrar(id: string) {
    const supabase = createClient();
    const { error: e } = await supabase.from("searches").delete().eq("id", id);
    if (!e) setBusquedas((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader usuario={usuario} />

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-white">
            Historial de búsquedas
          </h1>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            Abre una búsqueda para ver sus POIs en el mapa y re-exportar sin
            llamar a Google, o duplícala para ajustar los parámetros.
          </p>

          {cargando && (
            <p className="mt-8 font-mono text-xs text-zinc-500">
              Cargando historial…
            </p>
          )}
          {error && (
            <p className="mt-8 font-mono text-xs text-magenta">{error}</p>
          )}
          {!cargando && !error && busquedas.length === 0 && (
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

          {busquedas.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-lg border border-linea">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-panel2 text-zinc-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Fecha</th>
                    <th className="px-3 py-2.5 font-medium">Modo</th>
                    <th className="px-3 py-2.5 font-medium">Categoría</th>
                    <th className="px-3 py-2.5 font-medium">Zona / orígenes</th>
                    <th className="px-3 py-2.5 text-right font-medium">POIs</th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-panel">
                  {busquedas.map((b) => (
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
                            b.mode === "origins" ? "text-cian" : "text-violeta"
                          }
                        >
                          {b.mode === "origins" ? "Orígenes" : "Zona"}
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
                          <button
                            onClick={() => borrar(b.id)}
                            className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:border-magenta hover:text-magenta"
                            title="Borrar del historial"
                          >
                            ×
                          </button>
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
