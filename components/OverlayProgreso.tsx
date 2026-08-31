"use client";

// Overlay de progreso sobre el mapa para TODO proceso largo
// (procesamiento de orígenes, búsqueda de POIs por celdas/lotes,
// universos por lotes, Export plan). Mapa atenuado detrás e
// interacción bloqueada; anillo de progreso con gradiente
// magenta→violeta→cian, porcentaje grande y línea de estado. El
// progreso es REAL (lotes/celdas completados) — nunca animación fake.
// Si el proceso falla, el overlay muestra el error con reintentar en
// vez de desaparecer en silencio. La tabla de resultados (z-1000)
// queda ENCIMA: solo el mapa se atenúa.

export interface ProcesoLargo {
  /** Etapa activa, p. ej. "Buscando POIs". */
  etapa: string;
  /** Detalle bajo el porcentaje, p. ej. "celda 12 de 31". */
  detalle: string;
  actual: number;
  total: number;
  /** Presente = el proceso admite cancelar (muestra "Detener"). */
  onDetener?: () => void;
  /** Error del proceso: el overlay lo muestra con reintentar/cerrar. */
  error?: string | null;
  onReintentar?: () => void;
  onCerrar?: () => void;
}

const RADIO = 52;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

export default function OverlayProgreso({
  proceso,
}: {
  proceso: ProcesoLargo | null;
}) {
  if (!proceso) return null;
  const pct =
    proceso.total > 0
      ? Math.min(100, Math.round((100 * proceso.actual) / proceso.total))
      : 0;
  const avance = CIRCUNFERENCIA * (1 - pct / 100);

  return (
    <div className="absolute inset-0 z-[900] flex items-center justify-center bg-fondo/70 backdrop-blur-[1px]">
      <div className="flex flex-col items-center">
        {proceso.error ? (
          <>
            <p className="max-w-sm text-center font-mono text-xs leading-relaxed text-magenta">
              {proceso.error}
            </p>
            <div className="mt-4 flex gap-2">
              {proceso.onReintentar && (
                <button
                  onClick={proceso.onReintentar}
                  className="rounded-md border border-cian bg-cian/10 px-4 py-1.5 font-mono text-[11px] text-cian transition-colors hover:bg-cian/20"
                >
                  Reintentar
                </button>
              )}
              {proceso.onCerrar && (
                <button
                  onClick={proceso.onCerrar}
                  className="rounded-md border border-linea bg-panel2 px-4 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  Cerrar
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="relative h-[132px] w-[132px]">
              <svg
                viewBox="0 0 132 132"
                className="h-full w-full -rotate-90"
                aria-hidden
              >
                <defs>
                  <linearGradient id="anillo-gravity" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f4368a" />
                    <stop offset="50%" stopColor="#9d5cf0" />
                    <stop offset="100%" stopColor="#2fb9e8" />
                  </linearGradient>
                </defs>
                <circle
                  cx="66"
                  cy="66"
                  r={RADIO}
                  fill="none"
                  stroke="#26262e"
                  strokeWidth="7"
                />
                <circle
                  cx="66"
                  cy="66"
                  r={RADIO}
                  fill="none"
                  stroke="url(#anillo-gravity)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUNFERENCIA}
                  strokeDashoffset={avance}
                  className="transition-[stroke-dashoffset] duration-300"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display text-2xl font-extrabold text-white">
                  {pct}%
                </span>
              </div>
            </div>
            <p className="mt-3 font-mono text-[11px] tracking-wide text-zinc-300">
              {proceso.etapa}
              <span className="text-zinc-500"> · {proceso.detalle}</span>
            </p>
            {proceso.onDetener && (
              <button
                onClick={proceso.onDetener}
                className="mt-3 rounded-md border border-linea bg-panel2/80 px-4 py-1 font-mono text-[10px] text-zinc-500 transition-colors hover:border-magenta hover:text-magenta"
              >
                Detener
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
