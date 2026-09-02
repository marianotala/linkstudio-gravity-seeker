"use client";

// Header compartido: GravityMark + tagline, navegación Buscador/Historial,
// estatus animado (opcional), usuario y cerrar sesión.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import GravityMark from "./GravityMark";
import { createClient } from "@/lib/supabase/client";
import type { PerfilUsuario } from "@/lib/types";

export type StatusTipo = "idle" | "busy" | "ok" | "error";

interface AppHeaderProps {
  usuario: PerfilUsuario | null;
  status?: { tipo: StatusTipo; texto: string };
  /** Si viene, muestra el botón "Nueva búsqueda" que resetea el buscador. */
  onNueva?: () => void;
}

export default function AppHeader({ usuario, status, onNueva }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const dotColor = !status
    ? "bg-zinc-600"
    : status.tipo === "error"
      ? "bg-magenta"
      : status.tipo === "busy"
        ? "bg-cian dot-pulso"
        : status.tipo === "ok"
          ? "bg-emerald-400"
          : "bg-zinc-600";

  const navCls = (activo: boolean) =>
    `rounded-full border px-3 py-1 font-mono text-[11px] transition-colors ${
      activo
        ? "border-cian/50 bg-cian/10 text-cian"
        : "border-transparent text-zinc-500 hover:text-zinc-300"
    }`;

  return (
    <header className="tarjeta glow-cian flex items-center justify-between gap-3 px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <GravityMark size={30} />
        <div className="min-w-0">
          <div className="font-display text-lg font-extrabold leading-tight tracking-tight text-white">
            Gravity
          </div>
          <div className="truncate font-mono text-[10px] tracking-wide text-zinc-500">
            Seeker — point of interest intelligence · powered by Link Studio
          </div>
        </div>
        <nav className="ml-4 flex gap-1">
          <Link href="/" className={navCls(pathname === "/")}>
            Buscador
          </Link>
          <Link href="/censos" className={navCls(pathname === "/censos")}>
            Censos
          </Link>
          <Link href="/ooh" className={navCls(pathname === "/ooh")}>
            OOH
          </Link>
          <Link href="/historial" className={navCls(pathname === "/historial")}>
            Historial
          </Link>
          {usuario?.rol === "admin" && (
            <Link href="/admin" className={navCls(pathname === "/admin")}>
              Admin
            </Link>
          )}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {onNueva && (
          <button
            onClick={onNueva}
            className="rounded-full border border-cian/50 bg-cian/10 px-3 py-1.5 font-mono text-[11px] text-cian transition-colors hover:bg-cian/20"
            title="Limpia orígenes, zonas, filtros y resultados"
          >
            + Nueva búsqueda
          </button>
        )}
        {status && (
          <div className="flex items-center gap-2 rounded-full border border-linea bg-panel2 px-3 py-1.5">
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            <span className="max-w-[340px] truncate font-mono text-xs text-zinc-400">
              {status.texto}
            </span>
          </div>
        )}
        {usuario && (
          <div className="flex items-center gap-2">
            <span
              className="max-w-[160px] truncate font-mono text-xs text-zinc-400"
              title={usuario.email}
            >
              {usuario.nombre ?? usuario.email}
              {usuario.rol === "admin" && (
                <span className="ml-1 text-violeta">· admin</span>
              )}
            </span>
            <button
              onClick={cerrarSesion}
              className="rounded-md border border-linea bg-panel2 px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors hover:border-magenta hover:text-magenta"
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
