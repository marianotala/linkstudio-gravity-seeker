"use client";

// Tabla de resultados colapsable, montada sobre el mapa.
// Clic en una fila = zoom al POI en el mapa.

import { ciudadDeDireccion } from "@/lib/geo";
import type { Origin, Poi } from "@/lib/types";

interface ResultsTableProps {
  pois: Poi[];
  origenes: Origin[];
  colapsada: boolean;
  onToggle: () => void;
  onSeleccionar: (poi: Poi) => void;
  seleccionado: Poi | null;
  /** Universo residencial de la geocerca de cada origen (por índice). */
  poblacionPorOrigen?: (number | null)[];
}

export default function ResultsTable({
  pois,
  origenes,
  colapsada,
  onToggle,
  onSeleccionar,
  seleccionado,
  poblacionPorOrigen,
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
                <th className="px-2 py-2 font-medium">Ciudad</th>
                <th className="px-2 py-2 font-medium">Estrato</th>
                <th className="px-2 py-2 font-medium text-right">Dist. (m)</th>
                <th className="px-2 py-2 font-medium">Origen</th>
                <th className="px-2 py-2 font-medium text-right">Población</th>
                <th className="px-4 py-2 font-medium text-right">Lat, Lng</th>
              </tr>
            </thead>
            <tbody>
              {pois.map((p, i) => {
                const origen = origenes[p.origenIdx];
                const activo = seleccionado?.placeId === p.placeId;
                return (
                  <tr
                    key={`${p.capa ?? ""}:${p.placeId}`}
                    onClick={() => onSeleccionar(p)}
                    className={`cursor-pointer border-t border-linea/60 transition-colors hover:bg-panel2 ${
                      activo ? "bg-panel2 text-magenta" : "text-zinc-300"
                    }`}
                    title="Clic para hacer zoom en el mapa"
                  >
                    <td className="px-4 py-1.5 text-zinc-600">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      {/* el punto de color indica la fuente, igual que en
                          el mapa: Google magenta, DENUE naranja, ambas verde */}
                      <span
                        className={`mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                          p.fuente === "denue"
                            ? "bg-[#ff8c42]"
                            : p.fuente === "ambas"
                              ? "bg-emerald-400"
                              : "bg-magenta"
                        }`}
                        title={
                          p.fuente === "denue"
                            ? "DENUE (INEGI)"
                            : p.fuente === "ambas"
                              ? "Confirmado por ambas fuentes"
                              : "Google"
                        }
                      />
                      {p.nombre}
                    </td>
                    <td className="max-w-[240px] truncate px-2 py-1.5 text-zinc-500">
                      {p.direccion}
                    </td>
                    <td className="max-w-[150px] truncate px-2 py-1.5 text-zinc-300">
                      {ciudadDeDireccion(p.direccion) || "—"}
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
                    <td
                      className="px-2 py-1.5 text-right text-violeta"
                      title="Universo residencial de la geocerca de este origen (Censo 2020)"
                    >
                      {poblacionPorOrigen?.[p.origenIdx] != null
                        ? poblacionPorOrigen[p.origenIdx]!.toLocaleString("es-MX")
                        : "—"}
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
