"use client";

// COMPONENTES BASE del sistema de diseño v2 — construidos SOLO con
// los design tokens (app/globals.css + tailwind.config.ts). Son la
// anatomía única de botones, chips, estados y microinteracciones:
// las pantallas migradas usan esto en lugar de estilos ad-hoc.

import { useEffect, useRef, useState, type ReactNode } from "react";

// ------------------------------------------------------------------
// BOTÓN — solo 3 variantes. REGLA: un "primario" por vista (y
// "primario-firma" reservado al CTA principal de la app).
// ------------------------------------------------------------------
export function Boton({
  variante = "secundario",
  compacto = false,
  className = "",
  children,
  ...props
}: {
  variante?: "primario" | "primario-firma" | "secundario" | "fantasma";
  /** Altura reducida para barras densas (tablas, toolbars). */
  compacto?: boolean;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    variante === "primario"
      ? "btn-primario"
      : variante === "primario-firma"
        ? "btn-primario-firma"
        : variante === "fantasma"
          ? "btn-fantasma"
          : "btn-secundario";
  const densidad = compacto ? "!px-2.5 !py-1 !text-xs" : "";
  return (
    <button className={`${base} ${densidad} ${className}`} {...props}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------
// CHIP ÚNICO — una sola anatomía (píldora, altura fija, × opcional);
// la variante solo cambia el color semántico del borde/punto.
// ------------------------------------------------------------------
export type VarianteChip =
  | "marca"
  | "categoria"
  | "libre"
  | "exclusion"
  | "exito"
  | "alerta";

const PUNTO_CHIP: Record<VarianteChip, string> = {
  marca: "bg-magenta",
  categoria: "bg-cian",
  libre: "bg-texto-terciario",
  exclusion: "bg-error",
  exito: "bg-exito",
  alerta: "bg-alerta",
};

export function Chip({
  variante = "libre",
  onRemover,
  title,
  className = "",
  children,
  onClick,
}: {
  variante?: VarianteChip;
  /** Si viene, el chip muestra el × de remover. */
  onRemover?: () => void;
  title?: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <span
      className={`chip chip-${variante} ${onClick ? "cursor-pointer hover:bg-superficie-hover" : ""} ${className}`}
      title={title}
      onClick={onClick}
    >
      <span className={`chip-punto ${PUNTO_CHIP[variante]}`} />
      <span className="min-w-0 truncate">{children}</span>
      {onRemover && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemover();
          }}
          className="chip-remover"
          title="Quitar"
        >
          ×
        </button>
      )}
    </span>
  );
}

// ------------------------------------------------------------------
// AYUDA (ⓘ) — los textos de ayuda largos viven detrás de un popover,
// no permanentes en el panel.
// ------------------------------------------------------------------
export function Ayuda({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-linea2 font-body text-[9px] text-texto-terciario transition-colors duration-rapida hover:text-texto-primario"
        title="Más información"
        aria-label="Más información"
      >
        i
      </button>
      {abierto && (
        <span className="tarjeta-elevada absolute left-0 top-6 z-[900] block w-72 px-3 py-2.5 font-body text-xs font-normal normal-case leading-relaxed tracking-normal text-texto-secundario">
          {children}
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------
// CIFRA ANIMADA — conteo al aparecer (microinteracción de cifras
// grandes). Respeta prefers-reduced-motion.
// ------------------------------------------------------------------
export function CifraAnimada({
  valor,
  formato = (n) => Math.round(n).toLocaleString("es-MX"),
  duracionMs = 600,
  className = "",
}: {
  valor: number;
  formato?: (n: number) => string;
  duracionMs?: number;
  className?: string;
}) {
  const [mostrado, setMostrado] = useState(0);
  const previoRef = useRef(0);
  useEffect(() => {
    const reducido =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reducido || !Number.isFinite(valor)) {
      previoRef.current = valor;
      setMostrado(valor);
      return;
    }
    const desde = previoRef.current;
    previoRef.current = valor;
    const inicio = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracionMs);
      const suavizado = 1 - (1 - p) * (1 - p); // ease-out
      setMostrado(desde + (valor - desde) * suavizado);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valor, duracionMs]);
  return <span className={className}>{formato(mostrado)}</span>;
}

// ------------------------------------------------------------------
// SKELETON — superficie con shimmer sutil mientras carga.
// ------------------------------------------------------------------
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

// ------------------------------------------------------------------
// ESTADO VACÍO — icono + una línea + CTA.
// ------------------------------------------------------------------
export function EstadoVacio({
  icono = "◌",
  titulo,
  cta,
}: {
  icono?: ReactNode;
  titulo: string;
  cta?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-tarjeta border border-dashed border-linea bg-panel px-6 py-10 text-center">
      <span className="text-2xl text-texto-terciario" aria-hidden>
        {icono}
      </span>
      <p className="font-body text-sm text-texto-secundario">{titulo}</p>
      {cta}
    </div>
  );
}

// ------------------------------------------------------------------
// MENSAJE DE ERROR — componente propio (icono, mensaje, acción); no
// texto rojo monospace crudo.
// ------------------------------------------------------------------
export function MensajeError({
  mensaje,
  accion,
  onCerrar,
}: {
  mensaje: string;
  accion?: ReactNode;
  onCerrar?: () => void;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-control border border-error/50 bg-error/10 px-3.5 py-2.5">
      <span
        className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-error/20 font-body text-[10px] font-bold text-error"
        aria-hidden
      >
        !
      </span>
      <p className="min-w-0 flex-1 font-body text-[13px] leading-relaxed text-texto-primario">
        {mensaje}
      </p>
      {accion}
      {onCerrar && (
        <button
          onClick={onCerrar}
          className="shrink-0 text-texto-terciario transition-colors duration-rapida hover:text-texto-primario"
          aria-label="Cerrar"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// BARRA APILADA (NSE/edades) — llenado animado 300ms, esquinas
// redondeadas y tooltip con el dato exacto al hover.
// ------------------------------------------------------------------
export function BarraApiladaUI({
  titulo,
  segmentos,
  leyenda,
}: {
  titulo?: string;
  /** pct en 0-100; el tooltip muestra etiqueta + detalle (dato exacto). */
  segmentos: { etiqueta: string; pct: number; color: string; detalle?: string }[];
  leyenda?: ReactNode;
}) {
  return (
    <div>
      {titulo && (
        <p className="mb-1.5 font-body text-[11px] font-medium text-texto-secundario">
          {titulo}
        </p>
      )}
      <div className="barra-apilada">
        {segmentos.map(
          (s, i) =>
            s.pct > 0 && (
              <div
                key={s.etiqueta}
                className="barra-segmento"
                style={{
                  width: `${s.pct}%`,
                  backgroundColor: s.color,
                  animationDelay: `${i * 40}ms`,
                }}
                title={`${s.etiqueta}: ${s.detalle ?? `${s.pct.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`}`}
              />
            )
        )}
      </div>
      {leyenda}
    </div>
  );
}
