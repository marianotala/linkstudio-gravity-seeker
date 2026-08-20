"use client";

// Tabla de resultados colapsable, montada sobre el mapa.
// Clic en una fila = zoom al POI en el mapa.

import type { Origin, Poi } from "@/lib/types";

interface ResultsTableProps {
  pois: Poi[];
  origenes: Origin[];
  colapsada: boolean;
  onToggle: () => void;
  onSeleccionar: (poi: Poi) => void;
  seleccionado: Poi | null;
}

export default function ResultsTable({
  pois,
  origenes,
  colapsada,
  onToggle,
  onSeleccionar,
  seleccionado,
}: ResultsTableProps) {
  if (pois.length === 0) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1000] border-t border-linea bg-panel/95 backdrop-blur">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2 text-left"
      >
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">
          Resultados{" "}
          <span className="text-magenta">{pois.length} POIs</span>
        </span>
        <span className="font-mono text-xs text-zinc-500">
          {colapsada ? "▲ mostrar" : "▼ ocultar"}
        </span>
      </button>

      {!colapsada && (
        <div className="max-h-56 overflow-y-auto border-t border-linea">
          <table className="w-full text-left font-mono text-xs">
            <thead className="sticky top-0 bg-panel2 text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-2 py-2 font-medium">Nombre</th>
                <th className="px-2 py-2 font-medium">Dirección</th>
                <th className="px-2 py-2 font-medium">Fuente</th>
                <th className="px-2 py-2 font-medium">Estrato</th>
                <th className="px-2 py-2 font-medium text-right">Dist. (m)</th>
                <th className="px-2 py-2 font-medium">Origen</th>
                <th className="px-4 py-2 font-medium text-right">Lat, Lng</th>
              </tr>
            </thead>
            <tbody>
              {pois.map((p, i) => {
                const origen = origenes[p.origenIdx];
                const activo = seleccionado?.placeId === p.placeId;
                return (
                  <tr
                    key={p.placeId}
                    onClick={() => onSeleccionar(p)}
                    className={`cursor-pointer border-t border-linea/60 transition-colors hover:bg-panel2 ${
                      activo ? "bg-panel2 text-magenta" : "text-zinc-300"
                    }`}
                    title="Clic para hacer zoom en el mapa"
                  >
                    <td className="px-4 py-1.5 text-zinc-600">{i + 1}</td>
                    <td className="px-2 py-1.5">{p.nombre}</td>
                    <td className="max-w-[280px] truncate px-2 py-1.5 text-zinc-500">
                      {p.direccion}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          p.fuente === "denue"
                            ? "text-[#ff8c42]"
                            : p.fuente === "ambas"
                              ? "text-emerald-400"
                              : "text-magenta"
                        }
                      >
                        {p.fuente === "denue"
                          ? "DENUE"
                          : p.fuente === "ambas"
                            ? "Ambas"
                            : "Google"}
                      </span>
                    </td>
                    <td className="max-w-[130px] truncate px-2 py-1.5 text-zinc-500">
                      {p.estrato ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right text-cian">
                      {p.distancia}
                    </td>
                    <td className="max-w-[160px] truncate px-2 py-1.5 text-zinc-500">
                      {origen?.nombre ?? `Origen ${p.origenIdx + 1}`}
                    </td>
                    <td className="px-4 py-1.5 text-right text-zinc-500">
                      {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
