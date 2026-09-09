"use client";

// Modal "Nuevo plan" (Planner F1): pide el nombre del cliente y un
// título opcional, crea el proyecto en Supabase y entra directo al
// modo Planner de ese proyecto. Se abre desde la barra superior.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NuevoPlanModal({
  abierto,
  onCerrar,
  usuarioId,
}: {
  abierto: boolean;
  onCerrar: () => void;
  usuarioId: string | undefined;
}) {
  const router = useRouter();
  const [cliente, setCliente] = useState("");
  const [titulo, setTitulo] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierto) {
      setCliente("");
      setTitulo("");
      setError("");
      // foco al abrir (después del render del modal)
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [abierto]);

  if (!abierto) return null;

  async function crear() {
    const nombre = cliente.trim();
    if (!nombre) {
      setError("Escribe el nombre del cliente");
      return;
    }
    if (!usuarioId) {
      setError("Tu sesión expiró — vuelve a iniciar sesión");
      return;
    }
    setCreando(true);
    setError("");
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from("projects")
      .insert({
        nombre_cliente: nombre,
        titulo: titulo.trim() || null,
        creado_por: usuarioId,
      })
      .select("id")
      .single();
    if (e || !data) {
      setError(`No se pudo crear el plan: ${e?.message ?? "error desconocido"}`);
      setCreando(false);
      return;
    }
    router.push(`/planner/${data.id}`);
  }

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-fondo/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !creando) onCerrar();
      }}
    >
      <div className="tarjeta glow-violeta w-full max-w-md px-6 py-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-violeta">
          Planner
        </p>
        <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight text-white">
          Nuevo plan
        </h2>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
          Un plan organiza los levantamientos de un cliente (POI propios,
          competencia, proximidad, OOH) y al final genera el plan completo.
          Todo se guarda automáticamente y lo ve todo el equipo.
        </p>

        <label className="mt-4 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Cliente
        </label>
        <input
          ref={inputRef}
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") crear();
            if (e.key === "Escape" && !creando) onCerrar();
          }}
          placeholder="Nombre del cliente · p. ej. MG Motors"
          disabled={creando}
          className="mt-1.5 w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violeta focus:outline-none"
        />

        <label className="mt-3 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Título del plan (opcional)
        </label>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") crear();
            if (e.key === "Escape" && !creando) onCerrar();
          }}
          placeholder="p. ej. Lanzamiento Q1 2027 · Bajío"
          disabled={creando}
          className="mt-1.5 w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-violeta focus:outline-none"
        />

        {error && (
          <p className="mt-3 font-mono text-[11px] text-magenta">{error}</p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={crear}
            disabled={creando}
            className="flex-1 rounded-md bg-violeta px-3 py-2.5 font-display text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {creando ? "Creando…" : "Crear plan"}
          </button>
          <button
            onClick={onCerrar}
            disabled={creando}
            className="rounded-md border border-linea bg-panel2 px-4 py-2.5 font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-40"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
