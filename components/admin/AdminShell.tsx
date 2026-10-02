"use client";

// /admin reestructurado en MÓDULOS: el hub (tarjetas con resumen) y
// una navegación lateral propia, consistente con los design tokens.
// Cada módulo tiene deep-link (/admin/data, /admin/ooh, /admin/gasto,
// /admin/usuarios) — la lógica de cargas/límites vive en su módulo,
// movida sin reescribirse.

import Link from "next/link";
import AppHeader from "../AppHeader";
import AdminHub from "./AdminHub";
import AdminData from "./AdminData";
import AdminOoh from "./AdminOoh";
import AdminGasto from "./AdminGasto";
import AdminUsuarios from "./AdminUsuarios";
import type { PerfilUsuario } from "@/lib/types";

export type ModuloAdmin = "data" | "ooh" | "gasto" | "usuarios";

export const MODULOS_ADMIN: {
  clave: ModuloAdmin;
  nombre: string;
  descriptor: string;
  /** clase de color del punto (token semántico) */
  punto: string;
}[] = [
  {
    clave: "data",
    nombre: "Data de geolocalización",
    descriptor: "Demografía INEGI, CPs, colonias e ITER",
    punto: "bg-violeta",
  },
  {
    clave: "ooh",
    nombre: "Inventario OOH",
    descriptor: "Pantallas: cargas, lotes y desglose",
    punto: "bg-alerta",
  },
  {
    clave: "gasto",
    nombre: "Gasto y facturación",
    descriptor: "Consumo, límites, aprobaciones y log",
    punto: "bg-exito",
  },
  {
    clave: "usuarios",
    nombre: "Usuarios",
    descriptor: "Accesos, roles y consumo por persona",
    punto: "bg-cian",
  },
];

export default function AdminShell({
  usuario,
  modulo,
}: {
  usuario: PerfilUsuario | null;
  /** null = hub de módulos. */
  modulo: ModuloAdmin | null;
}) {
  const activo = MODULOS_ADMIN.find((m) => m.clave === modulo) ?? null;

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-fondo p-3">
      <AppHeader usuario={usuario} />

      {/* breadcrumb /admin → módulo */}
      <div className="tarjeta flex shrink-0 items-center gap-2 px-4 py-2 font-body text-xs">
        <Link
          href="/admin"
          className={
            activo
              ? "text-texto-secundario transition-colors duration-rapida hover:text-texto-primario"
              : "text-texto-primario"
          }
        >
          Admin
        </Link>
        {activo && (
          <>
            <span className="text-texto-terciario">/</span>
            <span className="text-texto-primario">{activo.nombre}</span>
          </>
        )}
        <span className="ml-auto font-body text-[11px] text-texto-terciario">
          Solo administradores
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* navegación lateral de módulos */}
        <aside className="tarjeta w-[260px] shrink-0 overflow-y-auto">
          <div className="border-b border-linea px-5 py-4">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.25em] text-violeta">
              Administración
            </p>
            <h1 className="mt-1 font-display text-lg font-bold tracking-tight text-texto-primario">
              Seeker
            </h1>
          </div>
          <nav className="px-3 py-3">
            <Link
              href="/admin"
              className={`mb-1 flex w-full items-center gap-3 rounded-control border px-3 py-2.5 transition-colors duration-rapida ${
                !activo
                  ? "border-linea bg-panel2"
                  : "border-transparent hover:bg-panel2/60"
              }`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-texto-terciario" />
              <span
                className={`font-body text-[13px] font-semibold ${
                  !activo ? "text-texto-primario" : "text-texto-secundario"
                }`}
              >
                Resumen
              </span>
            </Link>
            {MODULOS_ADMIN.map((m) => (
              <Link
                key={m.clave}
                href={`/admin/${m.clave}`}
                className={`mb-1 flex w-full items-center gap-3 rounded-control border px-3 py-2.5 transition-colors duration-rapida ${
                  modulo === m.clave
                    ? "border-linea bg-panel2"
                    : "border-transparent hover:bg-panel2/60"
                }`}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${m.punto}`} />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block font-body text-[13px] font-semibold ${
                      modulo === m.clave
                        ? "text-texto-primario"
                        : "text-texto-secundario"
                    }`}
                  >
                    {m.nombre}
                  </span>
                  <span className="block truncate font-body text-[11px] text-texto-terciario">
                    {m.descriptor}
                  </span>
                </span>
              </Link>
            ))}
          </nav>
        </aside>

        {/* contenido del módulo (o hub) */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 pb-6">
            {modulo === "data" ? (
              <AdminData />
            ) : modulo === "ooh" ? (
              <AdminOoh />
            ) : modulo === "gasto" ? (
              <AdminGasto />
            ) : modulo === "usuarios" ? (
              <AdminUsuarios usuario={usuario} />
            ) : (
              <AdminHub />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
