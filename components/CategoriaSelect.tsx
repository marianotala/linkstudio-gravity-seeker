"use client";

// Selector de categoría con GRUPOS y BUSCADOR: con ~37 categorías la
// lista plana era ilegible. Botón que abre un panel con input de
// filtrado (escribe para filtrar, sin acentos) y la lista agrupada
// por encabezados; Enter elige la primera visible, Esc cierra.

import { useEffect, useMemo, useRef, useState } from "react";
import { GRUPOS_CATEGORIAS, getCategoria, SOLO_NOMBRE } from "@/lib/categories";
import { normalizar } from "@/lib/geo";

export default function CategoriaSelect({
  value,
  onChange,
  incluirSoloNombre = false,
}: {
  value: string;
  onChange: (key: string) => void;
  /** Agrega la opción "Solo por nombre" al final (búsquedas de marca). */
  incluirSoloNombre?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const contRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (!contRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    inputRef.current?.focus();
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);

  const grupos = useMemo(() => {
    const f = normalizar(filtro);
    return GRUPOS_CATEGORIAS.map((g) => ({
      nombre: g.nombre,
      categorias: f
        ? g.categorias.filter((c) => normalizar(c.label).includes(f))
        : g.categorias,
    })).filter((g) => g.categorias.length > 0);
  }, [filtro]);
  const soloNombreVisible =
    incluirSoloNombre && (!filtro || normalizar("Solo por nombre").includes(normalizar(filtro)));

  const etiqueta =
    value === SOLO_NOMBRE
      ? "Solo por nombre"
      : (getCategoria(value)?.label ?? value);

  const elegir = (key: string) => {
    onChange(key);
    setAbierto(false);
    setFiltro("");
  };

  return (
    <div ref={contRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center justify-between rounded-md border border-linea bg-panel2 px-3 py-2 text-left font-mono text-xs text-zinc-200 focus:border-cian focus:outline-none"
      >
        <span className="truncate">{etiqueta}</span>
        <span className="ml-2 text-zinc-500">{abierto ? "▴" : "▾"}</span>
      </button>

      {abierto && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-md border border-linea bg-panel2 shadow-xl shadow-black/50">
          <input
            ref={inputRef}
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setAbierto(false);
                setFiltro("");
              }
              if (e.key === "Enter") {
                e.preventDefault();
                const primera = grupos[0]?.categorias[0];
                if (primera) elegir(primera.key);
                else if (soloNombreVisible) elegir(SOLO_NOMBRE);
              }
            }}
            placeholder="Escribe para filtrar…"
            className="w-full border-b border-linea bg-fondo px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          />
          <div className="max-h-72 overflow-y-auto py-1">
            {grupos.map((g) => (
              <div key={g.nombre}>
                <p className="px-3 pb-0.5 pt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
                  {g.nombre}
                </p>
                {g.categorias.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => elegir(c.key)}
                    className={`block w-full px-3 py-1.5 text-left font-mono text-xs transition-colors ${
                      c.key === value
                        ? "bg-cian/15 text-cian"
                        : "text-zinc-300 hover:bg-fondo hover:text-white"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            ))}
            {soloNombreVisible && (
              <div>
                <p className="px-3 pb-0.5 pt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
                  Marca
                </p>
                <button
                  type="button"
                  onClick={() => elegir(SOLO_NOMBRE)}
                  className={`block w-full px-3 py-1.5 text-left font-mono text-xs transition-colors ${
                    value === SOLO_NOMBRE
                      ? "bg-cian/15 text-cian"
                      : "text-zinc-300 hover:bg-fondo hover:text-white"
                  }`}
                >
                  Solo por nombre
                </button>
              </div>
            )}
            {grupos.length === 0 && !soloNombreVisible && (
              <p className="px-3 py-3 font-mono text-[11px] text-zinc-600">
                Sin categorías que coincidan con “{filtro}”.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
