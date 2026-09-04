"use client";

// Buscar un lugar por NOMBRE y fijarlo como origen (estilo Google
// Maps): "Midtown Jalisco" → sugerencias en vivo → seleccionar → el
// lugar queda como origen nombrado y el mapa se centra ahí. Usa
// sesiones de Places Autocomplete (baratas: teclas + detalle = una
// sesión); la key vive solo en el servidor (/api/lugares).

import { useEffect, useRef, useState } from "react";
import type { Origin } from "@/lib/types";

interface Sugerencia {
  placeId: string;
  texto: string;
  secundario: string;
}

function nuevaSesion(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export default function BuscadorLugar({
  onAgregar,
  disabled = false,
}: {
  /** Recibe el lugar elegido como origen nombrado. */
  onAgregar: (lugar: Origin) => void;
  disabled?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const sesionRef = useRef(nuevaSesion());
  const contRef = useRef<HTMLDivElement>(null);
  const ultimaConsultaRef = useRef("");

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (!contRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);

  // autocompletado con debounce de 300 ms (mín. 3 caracteres)
  useEffect(() => {
    const q = texto.trim();
    if (q.length < 3) {
      setSugerencias([]);
      return;
    }
    const timer = setTimeout(async () => {
      ultimaConsultaRef.current = q;
      try {
        const res = await fetch("/api/lugares", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q, session: sesionRef.current }),
        });
        const data = (await res.json()) as {
          sugerencias?: Sugerencia[];
          error?: string;
        };
        // respuesta vieja (el usuario siguió tecleando): se ignora
        if (ultimaConsultaRef.current !== q) return;
        if (!res.ok) {
          setError(data.error ?? "Error al buscar");
          return;
        }
        setError("");
        setSugerencias(data.sugerencias ?? []);
        setAbierto(true);
      } catch {
        // red intermitente: no ensuciar la UI por una tecla
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [texto]);

  async function elegir(s: Sugerencia) {
    setCargando(true);
    setError("");
    try {
      const res = await fetch("/api/lugares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: s.placeId, session: sesionRef.current }),
      });
      const data = (await res.json()) as {
        lugar?: { nombre: string; direccion: string; lat: number; lng: number };
        error?: string;
      };
      if (!res.ok || !data.lugar) {
        setError(data.error ?? "No pude obtener el lugar");
        return;
      }
      onAgregar({
        lat: data.lugar.lat,
        lng: data.lugar.lng,
        nombre: data.lugar.nombre,
        direccion: data.lugar.direccion,
      });
      // la sesión de autocomplete se cierra con el detalle: la próxima
      // búsqueda abre una nueva
      sesionRef.current = nuevaSesion();
      setTexto("");
      setSugerencias([]);
      setAbierto(false);
    } catch {
      setError("Error de red al obtener el lugar");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div ref={contRef} className="relative">
      <input
        value={texto}
        disabled={disabled || cargando}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={() => sugerencias.length > 0 && setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAbierto(false);
          if (e.key === "Enter" && sugerencias.length > 0) {
            e.preventDefault();
            elegir(sugerencias[0]);
          }
        }}
        placeholder={
          cargando
            ? "Fijando el lugar…"
            : "Buscar un lugar · p. ej. Midtown Jalisco, Torre Reforma"
        }
        className="w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cian focus:outline-none"
      />
      {abierto && sugerencias.length > 0 && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-linea bg-panel2 py-1 shadow-xl shadow-black/50">
          {sugerencias.map((s, i) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => elegir(s)}
              className="block w-full px-3 py-1.5 text-left font-mono text-xs text-zinc-300 transition-colors hover:bg-fondo hover:text-white"
            >
              <span className="text-zinc-100">{s.texto}</span>
              {i === 0 && (
                <span className="ml-2 text-[9px] text-zinc-600">Enter</span>
              )}
              {s.secundario && (
                <span className="block truncate text-[10px] text-zinc-500">
                  {s.secundario}
                </span>
              )}
            </button>
          ))}
          <p className="border-t border-linea/60 px-3 pb-0.5 pt-1.5 font-mono text-[9px] text-zinc-600">
            Autocompletado por sesión de Places (costo mínimo · no gasta tu
            saldo de celdas)
          </p>
        </div>
      )}
      {error && (
        <p className="mt-1 font-mono text-[10px] text-magenta">{error}</p>
      )}
    </div>
  );
}
