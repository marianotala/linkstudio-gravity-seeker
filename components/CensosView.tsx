"use client";

// Biblioteca de censos: censos de marca (Google, con semáforo de
// frescura) y censos territoriales (DENUE/INEGI, con etiqueta censal
// sin leyendas de actualización — su frescura depende de las oleadas
// de INEGI, no de cuándo se consultan).

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "./AppHeader";
import { createClient } from "@/lib/supabase/client";
import {
  DIAS_AMARILLO,
  DIAS_VERDE,
  diasDesde,
  fechaCorta,
  frescuraCenso,
} from "@/lib/censos";
import type { Censo, PerfilUsuario } from "@/lib/types";

function SemaforoFrescura({ censo }: { censo: Censo }) {
  // Solo los censos de fuente Google llevan semáforo.
  if (censo.tipo === "territorial" || censo.fuente !== "google") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2.5 py-0.5 font-mono text-[10px] text-[#9ca3af]">
        Censal INEGI · {fechaCorta(censo.created_at)}
      </span>
    );
  }
  const f = frescuraCenso(censo.created_at);
  const dias = diasDesde(censo.created_at);
  const estilo =
    f === "verde"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
      : f === "amarillo"
        ? "border-amber-400/40 bg-amber-400/10 text-amber-400"
        : "border-magenta/40 bg-magenta/10 text-magenta";
  const dot =
    f === "verde" ? "bg-emerald-400" : f === "amarillo" ? "bg-amber-400" : "bg-magenta";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] ${estilo}`}
      title={`Verde < ${DIAS_VERDE} días · amarillo ${DIAS_VERDE}-${DIAS_AMARILLO} · rojo > ${DIAS_AMARILLO}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {dias} días{f === "rojo" ? " · se recomienda actualizar" : ""}
    </span>
  );
}

export default function CensosView({
  usuario,
}: {
  usuario: PerfilUsuario | null;
}) {
  const [censos, setCensos] = useState<Censo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("censuses")
        .select("*, profiles(email, nombre)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (e) setError(`No pude cargar la biblioteca: ${e.message}`);
      else setCensos((data ?? []) as unknown as Censo[]);
      setCargando(false);
    })();
  }, []);

  async function eliminar(id: string) {
    const supabase = createClient();
    const { error: e } = await supabase.from("censuses").delete().eq("id", id);
    if (!e) setCensos((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-fondo p-3">
      <AppHeader usuario={usuario} />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="tarjeta glow-cian mx-auto max-w-6xl px-6 py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-xl font-extrabold tracking-tight text-white">
                Biblioteca de censos
              </h1>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">
                Censos de marca (Google, con semáforo de frescura) y censos
                territoriales (DENUE/INEGI). Ábrelos en el mapa y re-exporta
                sin llamadas externas.
              </p>
            </div>
            {!cargando && !error && (
              <span className="shrink-0 rounded-full border border-linea bg-panel2 px-3 py-1 font-mono text-[10px] text-zinc-400">
                {censos.length} {censos.length === 1 ? "censo" : "censos"}
              </span>
            )}
          </div>

          {cargando && (
            <p className="mt-8 font-mono text-xs text-zinc-500">
              Cargando biblioteca…
            </p>
          )}
          {error && <p className="mt-8 font-mono text-xs text-magenta">{error}</p>}
          {!cargando && !error && censos.length === 0 && (
            <div className="mt-8 rounded-lg border border-dashed border-linea bg-panel px-6 py-10 text-center">
              <p className="font-mono text-xs text-zinc-500">
                Todavía no hay censos guardados. Corre un censo de marca o un
                censo territorial y aparecerá aquí automáticamente.
              </p>
              <Link
                href="/"
                className="mt-4 inline-block rounded-md border border-cian bg-cian/10 px-4 py-2 font-mono text-xs text-cian transition-colors hover:bg-cian/20"
              >
                Ir al buscador
              </Link>
            </div>
          )}

          {censos.length > 0 && (
            <div className="mt-6 overflow-hidden rounded-xl border border-linea">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-panel2 text-zinc-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Tipo</th>
                    <th className="px-3 py-2.5 font-medium">Marca / categoría</th>
                    <th className="px-3 py-2.5 font-medium">Alcance</th>
                    <th className="px-3 py-2.5 font-medium">Frescura</th>
                    <th className="px-3 py-2.5 font-medium">Autor</th>
                    <th className="px-3 py-2.5 text-right font-medium">POIs</th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-panel">
                  {censos.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-linea/60 text-zinc-300"
                    >
                      <td className="px-4 py-2.5">
                        <span
                          className={
                            c.tipo === "marca"
                              ? "text-magenta"
                              : "text-[#ff8c42]"
                          }
                        >
                          {c.tipo === "marca" ? "Marca" : "Territorial"}
                        </span>
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-white">
                        {c.marca_o_categoria}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5 text-zinc-400">
                        {c.alcance_descripcion}
                      </td>
                      <td className="px-3 py-2.5">
                        <SemaforoFrescura censo={c} />
                      </td>
                      <td
                        className="max-w-[140px] truncate px-3 py-2.5 text-zinc-500"
                        title={c.profiles?.email}
                      >
                        {c.profiles?.nombre ?? c.profiles?.email ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-cian">
                        {c.poi_count}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Link
                            href={`/?censo=${c.id}`}
                            className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-cian hover:text-cian"
                            title="Cargar los POIs en el mapa y re-exportar sin llamadas"
                          >
                            Ver en mapa
                          </Link>
                          <Link
                            href={`/?censo=${c.id}&actualizar=1`}
                            className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-violeta hover:text-violeta"
                            title="Re-correr el censo y comparar el delta contra esta versión"
                          >
                            Actualizar
                          </Link>
                          <button
                            onClick={() => eliminar(c.id)}
                            className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:border-magenta hover:text-magenta"
                            title="Eliminar de la biblioteca"
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
