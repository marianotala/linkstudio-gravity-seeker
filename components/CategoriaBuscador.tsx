"use client";

// Campo de texto INTELIGENTE para elegir CATEGORÍAS (una o varias):
// al escribir sugiere en vivo del catálogo curado (sin acentos y por
// sinónimos: "coches" → Agencias de autos); elegir una sugerencia usa
// su MAPEO CURADO exacto y la agrega como CHIP azul con su × — misma
// UX que los términos de marca. Enter sin match agrega una BÚSQUEDA
// LIBRE (chip gris): el texto va como query a Google y como palabra
// clave a DENUE. OR entre categorías: un POI pasa si CUALQUIERA lo
// captura. Con max=1 funciona como selector único (censo territorial).

import { useEffect, useRef, useState } from "react";
import {
  CATEGORIA_LIBRE,
  getCategoria,
  sugerirCategorias,
} from "@/lib/categories";
import { normalizarComparable } from "@/lib/geo";

export interface SeleccionCategoria {
  /** Key curada o CATEGORIA_LIBRE. */
  key: string;
  /** Texto de la búsqueda libre (cuando key === CATEGORIA_LIBRE). */
  libre?: string;
}

export function etiquetaSeleccion(s: SeleccionCategoria): string {
  if (s.key === CATEGORIA_LIBRE) return s.libre ?? "Búsqueda libre";
  return getCategoria(s.key)?.label ?? s.key;
}

export default function CategoriaBuscador({
  selecciones,
  onCambiar,
  max = 12,
  opcional = false,
}: {
  selecciones: SeleccionCategoria[];
  onCambiar: (selecciones: SeleccionCategoria[]) => void;
  /** Máximo de categorías (1 = selector único, p. ej. territorial). */
  max?: number;
  /** true = puede quedar sin categoría (hay filtro por nombre abajo). */
  opcional?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const contRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (!contRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);

  const sugerencias = sugerirCategorias(texto).filter(
    (c) => !selecciones.some((s) => s.key === c.key)
  );
  const textoLimpio = texto.trim();

  const agregar = (sel: SeleccionCategoria) => {
    const duplicada = selecciones.some(
      (s) =>
        s.key === sel.key &&
        (s.key !== CATEGORIA_LIBRE ||
          normalizarComparable(s.libre ?? "") ===
            normalizarComparable(sel.libre ?? ""))
    );
    if (!duplicada) {
      // con max=1 la nueva REEMPLAZA (selector único)
      const base = max === 1 ? [] : selecciones;
      if (base.length >= max) return;
      onCambiar([...base, sel]);
    }
    setTexto("");
    setAbierto(false);
  };
  const agregarLibre = () => {
    if (!textoLimpio) return;
    agregar({ key: CATEGORIA_LIBRE, libre: textoLimpio });
  };
  const quitar = (idx: number) =>
    onCambiar(selecciones.filter((_, i) => i !== idx));

  return (
    <div ref={contRef} className="relative">
      <input
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAbierto(false);
          if (e.key === "Enter") {
            e.preventDefault();
            if (sugerencias.length > 0) agregar({ key: sugerencias[0].key });
            else agregarLibre();
          }
        }}
        placeholder={
          selecciones.length > 0 && max > 1
            ? "Agrega otra categoría · escribe para sugerencias"
            : opcional
              ? "Categoría (opcional) · escribe para sugerencias"
              : "Categoría · escribe para sugerencias, Enter = búsqueda libre"
        }
        className="w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cian focus:outline-none"
      />

      {abierto && (sugerencias.length > 0 || textoLimpio) && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-linea bg-panel2 py-1 shadow-xl shadow-black/50">
          {sugerencias.map((c, i) => (
            <button
              key={c.key}
              type="button"
              onClick={() => agregar({ key: c.key })}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-xs text-zinc-300 transition-colors hover:bg-fondo hover:text-white"
            >
              <span>
                {c.label}
                {i === 0 && (
                  <span className="ml-2 text-[9px] text-zinc-600">Enter</span>
                )}
              </span>
              <span className="ml-3 shrink-0 text-[9px] uppercase tracking-wider text-zinc-600">
                {c.grupo}
              </span>
            </button>
          ))}
          {textoLimpio && (
            <button
              type="button"
              onClick={agregarLibre}
              className="block w-full border-t border-linea/60 px-3 py-1.5 text-left font-mono text-xs text-zinc-400 transition-colors hover:bg-fondo hover:text-zinc-200"
            >
              Búsqueda libre: “{textoLimpio}”
              {sugerencias.length === 0 && (
                <span className="ml-2 text-[9px] text-zinc-600">Enter</span>
              )}
            </button>
          )}
        </div>
      )}

      {/* chips de categorías activas (azul = verificada, gris = libre),
          cada una con su × — o el estado vacío */}
      <div className="mt-1.5 flex max-h-24 flex-wrap items-center gap-1.5 overflow-y-auto">
        {selecciones.map((s, idx) =>
          s.key === CATEGORIA_LIBRE ? (
            <button
              key={`${s.key}:${s.libre}`}
              type="button"
              onClick={() => quitar(idx)}
              className="group inline-flex items-center gap-1.5 rounded-full border border-zinc-600 bg-zinc-700/20 px-2.5 py-0.5 font-mono text-[10px] text-zinc-400"
              title="Búsqueda libre (sin mapeo curado) · quitar"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
              libre · “{s.libre}”
              <span className="text-zinc-600 group-hover:text-zinc-300">×</span>
            </button>
          ) : (
            <button
              key={s.key}
              type="button"
              onClick={() => quitar(idx)}
              className="group inline-flex items-center gap-1.5 rounded-full border border-[#3b82f6]/60 bg-[#3b82f6]/10 px-2.5 py-0.5 font-mono text-[10px] text-[#60a5fa]"
              title="Mapeo curado exacto (Google Places + SCIAN de DENUE) · quitar"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6]" />
              {etiquetaSeleccion(s)}
              <span className="text-[#60a5fa]/60 group-hover:text-[#60a5fa]">
                ×
              </span>
            </button>
          )
        )}
        {selecciones.length === 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-linea px-2.5 py-0.5 font-mono text-[10px] text-zinc-600">
            {opcional
              ? "sin categoría — se busca con los términos del filtro (marca pura)"
              : "sin categoría — elige una sugerida o escribe y presiona Enter"}
          </span>
        )}
        {selecciones.length >= 2 && (
          <span className="font-mono text-[10px] text-zinc-600">
            OR: un POI pasa si CUALQUIERA lo captura
          </span>
        )}
      </div>
    </div>
  );
}
