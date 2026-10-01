"use client";

// PANEL DE DESCARTADOS — revisión y rescate manual. Los puntos que los
// filtros tiraron YA SE PAGARON: aquí se ven completos (nombre,
// dirección/ciudad, término y motivo), se buscan sobre el TOTAL, se
// ordenan, se exportan a Excel y se rescatan con checkbox — cero
// consultas a Google. Modal overlay reutilizable (modo consulta,
// secciones del Planner y PlannerView).

import { useMemo, useState } from "react";
import { ciudadDeDireccion, normalizarComparable } from "@/lib/geo";
import type { DescartePoi } from "@/lib/types";

const fmt = (n: number) => n.toLocaleString("es-MX");
const PAGINA = 200;

const ETIQUETA_MOTIVO: Record<DescartePoi["motivo"], string> = {
  nombre: "filtro estricto",
  exclusion: "exclusión",
  calidad: "filtro de calidad",
};

export default function PanelDescartados<T extends DescartePoi>({
  titulo,
  descartes,
  onCerrar,
  onConservar,
  conservando = false,
}: {
  titulo: string;
  descartes: T[];
  onCerrar: () => void;
  /** Rescate: los seleccionados entran al levantamiento/resultados. */
  onConservar: (seleccion: T[]) => void | Promise<void>;
  conservando?: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<"nombre" | "ciudad">("nombre");
  const [visibles, setVisibles] = useState(PAGINA);
  const [checks, setChecks] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);

  // el BUSCADOR opera sobre el TOTAL (no solo la página visible)
  const filtrados = useMemo(() => {
    const q = normalizarComparable(busqueda.trim());
    const lista = q
      ? descartes.filter((d) =>
          normalizarComparable(
            `${d.nombre} ${d.direccion} ${d.termino ?? ""}`
          ).includes(q)
        )
      : [...descartes];
    lista.sort((a, b) =>
      orden === "ciudad"
        ? ciudadDeDireccion(a.direccion).localeCompare(
            ciudadDeDireccion(b.direccion),
            "es"
          ) || a.nombre.localeCompare(b.nombre, "es")
        : a.nombre.localeCompare(b.nombre, "es")
    );
    return lista;
  }, [descartes, busqueda, orden]);

  const pagina = filtrados.slice(0, visibles);
  const seleccionados = descartes.filter((d) => checks.has(d.placeId));

  function alternar(placeId: string, valor: boolean) {
    setChecks((prev) => {
      const s = new Set(prev);
      if (valor) s.add(placeId);
      else s.delete(placeId);
      return s;
    });
  }

  function seleccionarFiltrados(valor: boolean) {
    setChecks((prev) => {
      const s = new Set(prev);
      for (const d of filtrados) {
        if (valor) s.add(d.placeId);
        else s.delete(d.placeId);
      }
      return s;
    });
  }

  async function exportar() {
    setExportando(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const hoja = XLSX.utils.json_to_sheet(
        filtrados.map((d) => ({
          Nombre: d.nombre,
          "Dirección": d.direccion,
          Ciudad: ciudadDeDireccion(d.direccion),
          Latitud: d.lat,
          Longitud: d.lng,
          "Término": d.termino ?? "",
          Motivo: ETIQUETA_MOTIVO[d.motivo],
          Types: d.types.join(", "),
        }))
      );
      XLSX.utils.book_append_sheet(wb, hoja, "Descartados");
      XLSX.writeFile(wb, "seeker_descartados.xlsx");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
      <div className="tarjeta-elevada flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-linea px-5 py-3">
          <div>
            <p className="font-display text-sm font-extrabold text-white">
              Descartados · {fmt(descartes.length)}
            </p>
            <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-zinc-500">
              {titulo} — ya se pagaron: palomea los que SÍ te sirven y
              consérvalos sin volver a consultar a Google.
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded-md border border-linea bg-panel2 px-2.5 py-1 font-mono text-xs text-zinc-400 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-linea px-5 py-2.5">
          <input
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setVisibles(PAGINA);
            }}
            placeholder={`Buscar en los ${fmt(descartes.length)} descartados…`}
            className="min-w-[220px] flex-1 rounded-md border border-linea bg-panel2 px-3 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cian focus:outline-none"
          />
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as "nombre" | "ciudad")}
            className="rounded-md border border-linea bg-panel2 px-2 py-1.5 font-mono text-[11px] text-zinc-300"
          >
            <option value="nombre">por nombre</option>
            <option value="ciudad">por ciudad</option>
          </select>
          <button
            onClick={() => seleccionarFiltrados(true)}
            className="rounded-md border border-linea bg-panel2 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 hover:border-cian hover:text-cian"
            title="Selecciona TODOS los que pasan el buscador (no solo la página visible)"
          >
            Seleccionar los {fmt(filtrados.length)} filtrados
          </button>
          <button
            onClick={() => seleccionarFiltrados(false)}
            className="rounded-md border border-linea bg-panel2 px-2.5 py-1.5 font-mono text-[11px] text-zinc-500 hover:text-zinc-300"
          >
            Quitar
          </button>
          <button
            onClick={exportar}
            disabled={exportando}
            className="rounded-md border border-linea bg-panel2 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 hover:border-emerald-400 hover:text-emerald-400 disabled:opacity-40"
            title="Excel de la lista filtrada, para auditoría"
          >
            {exportando ? "Exportando…" : "XLSX"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1">
          {pagina.map((d) => (
            <label
              key={d.placeId}
              className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-panel2"
            >
              <input
                type="checkbox"
                checked={checks.has(d.placeId)}
                onChange={(e) => alternar(d.placeId, e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#2fb9e8]"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-zinc-200">
                  {d.nombre}
                </span>
                <span className="block truncate text-[10px] text-zinc-500">
                  {d.direccion || "(sin dirección)"}
                </span>
              </span>
              <span className="shrink-0 text-right">
                {d.termino && (
                  <span className="block font-mono text-[9px] text-cian">
                    {d.termino}
                  </span>
                )}
                <span className="block font-mono text-[9px] text-zinc-600">
                  {ETIQUETA_MOTIVO[d.motivo]}
                </span>
              </span>
            </label>
          ))}
          {filtrados.length > visibles && (
            <button
              onClick={() => setVisibles((v) => v + PAGINA)}
              className="my-2 w-full rounded-md border border-linea bg-panel2 px-3 py-1.5 font-mono text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              Mostrar más ({fmt(filtrados.length - visibles)} restantes)
            </button>
          )}
          {filtrados.length === 0 && (
            <p className="px-2 py-6 text-center font-mono text-[11px] text-zinc-600">
              Nada coincide con la búsqueda.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-linea px-5 py-3">
          <button
            onClick={() => onConservar(seleccionados as T[])}
            disabled={seleccionados.length === 0 || conservando}
            className="rounded-md bg-cian px-4 py-2 font-display text-xs font-extrabold text-fondo transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {conservando
              ? "Conservando…"
              : `Conservar seleccionados (${fmt(seleccionados.length)})`}
          </button>
          <span className="font-mono text-[10px] text-zinc-600">
            0 consultas a Google · quedan marcados como &quot;rescatado
            manual&quot; en los exports
          </span>
        </div>
      </div>
    </div>
  );
}
