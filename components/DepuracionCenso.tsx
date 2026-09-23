"use client";

// PANEL DE REVISIÓN de la depuración inteligente de censos (versión
// inline, para las secciones del Planner). La heurística de types
// (capa 1) o la IA (capa 2) PROPONEN sospechosos; el usuario DISPONE:
// palomeado = "sí pertenece a la marca" (se conserva), desmarcado se
// excluye al confirmar. Nada se borra en silencio.

import { costoEstimadoIA, type Sospechoso } from "@/lib/depuracion";

export default function PanelDepuracion({
  sospechosos,
  checks,
  onCheck,
  onConfirmar,
  onConservar,
  onDepurarIA,
  depurandoIA,
  ocupado,
  nPois,
}: {
  sospechosos: Sospechoso[];
  /** checked = "sí pertenece" (se conserva). */
  checks: Record<string, boolean>;
  onCheck: (placeId: string, valor: boolean) => void;
  onConfirmar: () => void;
  onConservar: () => void;
  onDepurarIA: () => void;
  depurandoIA: boolean;
  ocupado: boolean;
  /** Tamaño del censo a juzgar con IA (para el costo estimado). */
  nPois: number;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-magenta/50 bg-fondo/60">
      <div className="border-b border-linea px-4 py-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-magenta">
          Depuración del censo ·{" "}
          {sospechosos.length.toLocaleString("es-MX")}{" "}
          {sospechosos.length === 1 ? "sospechoso" : "sospechosos"}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
          Puntos con giro incompatible con el censo. Palomea los que SÍ
          pertenecen a la marca; los desmarcados se excluyen del
          levantamiento al confirmar.
        </p>
      </div>
      <div className="max-h-64 overflow-y-auto px-2 py-1">
        {sospechosos.map((s) => (
          <label
            key={s.placeId}
            className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-panel2"
          >
            <input
              type="checkbox"
              checked={checks[s.placeId] ?? false}
              onChange={(e) => onCheck(s.placeId, e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#2fb9e8]"
            />
            <span className="min-w-0">
              <span className="block truncate font-mono text-xs text-zinc-200">
                {s.nombre}
              </span>
              <span className="block truncate text-[10px] text-zinc-500">
                {s.direccion}
              </span>
              <span className="mt-0.5 block text-[10px] leading-snug text-magenta/90">
                {s.razon}
                <span className="ml-1.5 rounded border border-linea px-1 py-px font-mono text-[9px] uppercase text-zinc-500">
                  {s.fuente === "ia" ? "IA" : "tipos"}
                </span>
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-linea px-3 py-2.5">
        <button
          onClick={onConfirmar}
          disabled={ocupado}
          className="rounded-md border border-magenta bg-magenta/10 px-3 py-1.5 font-mono text-[11px] font-medium text-magenta transition-colors hover:bg-magenta/20 disabled:opacity-40"
        >
          Confirmar depuración
        </button>
        <button
          onClick={onConservar}
          disabled={ocupado}
          className="rounded-md border border-linea bg-panel2 px-3 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors hover:border-zinc-600 disabled:opacity-40"
        >
          Conservar todos
        </button>
        <button
          onClick={onDepurarIA}
          disabled={depurandoIA || ocupado}
          title="Juicio de pertenencia punto por punto con Claude (modelo económico) — la decisión sigue siendo tuya"
          className="ml-auto rounded-md border border-violeta/60 bg-violeta/10 px-3 py-1.5 font-mono text-[11px] text-violeta transition-colors hover:bg-violeta/20 disabled:opacity-40"
        >
          {depurandoIA
            ? "Depurando…"
            : `Depurar con IA (~$${costoEstimadoIA(nPois).toFixed(2)})`}
        </button>
      </div>
    </div>
  );
}
