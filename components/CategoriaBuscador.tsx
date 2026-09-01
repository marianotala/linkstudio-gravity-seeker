"use client";

// Campo de texto INTELIGENTE para elegir categoría (reemplaza al
// dropdown): al escribir sugiere en vivo las categorías del catálogo
// curado (sin acentos/mayúsculas y por sinónimos: "coches" → Agencias
// de autos). Elegir una sugerencia usa su MAPEO CURADO exacto (tipos
// de Google + condición DENUE). Si el texto no tiene match y se
// presiona Enter, corre como BÚSQUEDA LIBRE (el texto va como query a
// Google y como palabra clave a DENUE). El chip bajo el campo dice
// SIEMPRE con qué precisión corre el censo: azul = categoría
// verificada, gris = búsqueda libre.

import { useEffect, useRef, useState } from "react";
import {
  CATEGORIA_LIBRE,
  getCategoria,
  SOLO_NOMBRE,
  sugerirCategorias,
} from "@/lib/categories";

export default function CategoriaBuscador({
  categoria,
  libre,
  onChange,
  incluirSoloNombre = false,
}: {
  /** Key curada, SOLO_NOMBRE o CATEGORIA_LIBRE. */
  categoria: string;
  /** Texto de la búsqueda libre (cuando categoria === CATEGORIA_LIBRE). */
  libre: string;
  onChange: (key: string, libreTexto?: string) => void;
  /** Agrega la opción "Solo por nombre" (búsquedas de marca). */
  incluirSoloNombre?: boolean;
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

  const sugerencias = sugerirCategorias(texto);
  const textoLimpio = texto.trim();

  const elegirCurada = (key: string) => {
    onChange(key);
    setTexto("");
    setAbierto(false);
  };
  const elegirLibre = () => {
    if (!textoLimpio) return;
    onChange(CATEGORIA_LIBRE, textoLimpio);
    setTexto("");
    setAbierto(false);
  };

  const cat = getCategoria(categoria);

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
            if (sugerencias.length > 0) elegirCurada(sugerencias[0].key);
            else elegirLibre();
          }
        }}
        placeholder='Categoría · escribe para sugerencias, Enter = búsqueda libre'
        className="w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cian focus:outline-none"
      />

      {abierto && (sugerencias.length > 0 || textoLimpio || incluirSoloNombre) && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-linea bg-panel2 py-1 shadow-xl shadow-black/50">
          {sugerencias.map((c, i) => (
            <button
              key={c.key}
              type="button"
              onClick={() => elegirCurada(c.key)}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-xs transition-colors ${
                c.key === categoria
                  ? "bg-cian/15 text-cian"
                  : "text-zinc-300 hover:bg-fondo hover:text-white"
              }`}
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
              onClick={elegirLibre}
              className="block w-full border-t border-linea/60 px-3 py-1.5 text-left font-mono text-xs text-zinc-400 transition-colors hover:bg-fondo hover:text-zinc-200"
            >
              Búsqueda libre: “{textoLimpio}”
              {sugerencias.length === 0 && (
                <span className="ml-2 text-[9px] text-zinc-600">Enter</span>
              )}
            </button>
          )}
          {incluirSoloNombre && (
            <button
              type="button"
              onClick={() => elegirCurada(SOLO_NOMBRE)}
              className={`block w-full border-t border-linea/60 px-3 py-1.5 text-left font-mono text-xs transition-colors ${
                categoria === SOLO_NOMBRE
                  ? "bg-cian/15 text-cian"
                  : "text-zinc-400 hover:bg-fondo hover:text-zinc-200"
              }`}
            >
              Solo por nombre (censa únicamente los términos del filtro)
            </button>
          )}
        </div>
      )}

      {/* chip del modo activo: el vendedor SIEMPRE sabe con qué
          precisión corre su censo */}
      <div className="mt-1.5">
        {categoria === CATEGORIA_LIBRE ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-600 bg-zinc-700/20 px-2.5 py-0.5 font-mono text-[10px] text-zinc-400"
            title="Sin mapeo curado: el texto va como query a Google Places y como palabra clave de actividad a DENUE"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
            búsqueda libre · “{libre}”
          </span>
        ) : categoria === SOLO_NOMBRE ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cian/50 bg-cian/10 px-2.5 py-0.5 font-mono text-[10px] text-cian">
            <span className="h-1.5 w-1.5 rounded-full bg-cian" />
            solo por nombre
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-[#3b82f6]/60 bg-[#3b82f6]/10 px-2.5 py-0.5 font-mono text-[10px] text-[#60a5fa]"
            title="Mapeo curado exacto: tipos de Google Places + actividad SCIAN de DENUE"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#3b82f6]" />
            categoría verificada · {cat?.label ?? categoria}
          </span>
        )}
      </div>
    </div>
  );
}
