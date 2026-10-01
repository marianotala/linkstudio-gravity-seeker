"use client";

// Header compartido: GravityMark + tagline, navegación global, estatus
// animado (opcional), usuario y cerrar sesión. Migrado al sistema de
// tokens v2: navegación y botones en sans; monospace solo para datos.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import GravityMark from "./GravityMark";
import NuevoPlanModal from "./NuevoPlanModal";
import { Boton } from "./ui";
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
  const [modalPlan, setModalPlan] = useState(false);

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const dotColor = !status
    ? "bg-texto-terciario"
    : status.tipo === "error"
      ? "bg-error"
      : status.tipo === "busy"
        ? "bg-cian dot-pulso"
        : status.tipo === "ok"
          ? "bg-exito"
          : "bg-texto-terciario";

  const navCls = (activo: boolean) =>
    `rounded-chip px-3 py-1.5 font-body text-[13px] font-medium transition-colors duration-rapida ${
      activo
        ? "bg-superficie-hover text-texto-primario"
        : "text-texto-secundario hover:text-texto-primario"
    }`;

  return (
    <header className="tarjeta glow-cian flex items-center justify-between gap-3 px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <GravityMark size={30} />
        <div className="min-w-0">
          <div className="font-display text-lg font-bold leading-tight tracking-tight text-texto-primario">
            Gravity
          </div>
          <div className="truncate font-body text-[11px] text-texto-terciario">
            Seeker — point of interest intelligence · powered by Link Studio
          </div>
        </div>
        {/* v2 F1: el Buscador vive dentro de cada plan (primera sección
            del menú lateral) — Mis planes es el home */}
        <nav className="ml-4 flex gap-1">
          <Link
            href="/planes"
            className={navCls(
              pathname === "/" ||
                pathname === "/planes" ||
                pathname.startsWith("/planner")
            )}
          >
            Mis planes
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

      <div className="flex shrink-0 items-center gap-2.5">
        {usuario && (
          <Boton
            variante="primario"
            compacto
            onClick={() => setModalPlan(true)}
            title="Crear un plan por cliente (Planner): organiza levantamientos y genera el plan completo"
          >
            + Nuevo plan
          </Boton>
        )}
        {onNueva && (
          <Boton
            variante="secundario"
            compacto
            onClick={onNueva}
            title="Limpia orígenes, zonas, filtros y resultados"
          >
            + Nueva búsqueda
          </Boton>
        )}
        {status && (
          <div className="flex items-center gap-2 rounded-chip border border-linea bg-panel2 px-3 py-1.5">
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            <span className="max-w-[340px] truncate font-body text-xs text-texto-secundario">
              {status.texto}
            </span>
          </div>
        )}
        {usuario && (
          <div className="flex items-center gap-1.5">
            <span
              className="max-w-[160px] truncate font-body text-xs text-texto-secundario"
              title={usuario.email}
            >
              {usuario.nombre ?? usuario.email}
              {usuario.rol === "admin" && (
                <span className="ml-1 text-violeta">· admin</span>
              )}
            </span>
            <Boton variante="fantasma" compacto onClick={cerrarSesion}>
              Cerrar sesión
            </Boton>
          </div>
        )}
      </div>

      <NuevoPlanModal
        abierto={modalPlan}
        onCerrar={() => setModalPlan(false)}
        usuarioId={usuario?.id}
      />
    </header>
  );
}
