"use client";

// MÓDULO "USUARIOS" (/admin/usuarios): quiénes han entrado, último
// acceso, rol admin/normal con toggle y consumo del mes por persona.
// Lee la RPC admin_usuarios() (profiles + auth.users + api_usage_log)
// y cambia roles con admin_set_rol() — ambas solo para admins; el
// guardarraíl del servidor impide quitarse el rol a uno mismo.

import { useCallback, useEffect, useState } from "react";
import { CifraAnimada, MensajeError, Skeleton } from "../ui";
import { fmtMxn } from "@/lib/costos";
import { createClient } from "@/lib/supabase/client";
import type { PerfilUsuario } from "@/lib/types";

const fmt = (n: number) => n.toLocaleString("es-MX");

interface FilaUsuario {
  user_id: string;
  email: string;
  nombre: string | null;
  rol: string;
  ultimo_acceso: string | null;
  creado: string;
  consultas_mes: number;
  gasto_mes_mxn: number;
}

export default function AdminUsuarios({
  usuario,
}: {
  usuario: PerfilUsuario | null;
}) {
  const [filas, setFilas] = useState<FilaUsuario[] | null>(null);
  const [error, setError] = useState("");
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error: e } = await supabase.rpc("admin_usuarios");
    if (e) {
      setError(`No pude cargar los usuarios: ${e.message}`);
    } else {
      setFilas(((data ?? []) as FilaUsuario[]) ?? []);
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiarRol(f: FilaUsuario) {
    const nuevo = f.rol === "admin" ? "vendedor" : "admin";
    setCambiando(f.user_id);
    setMensaje("");
    setError("");
    try {
      const supabase = createClient();
      const { data, error: e } = await supabase.rpc("admin_set_rol", {
        p_user: f.user_id,
        p_rol: nuevo,
      });
      if (e) throw new Error(e.message);
      if (data === false) throw new Error("Tu usuario no tiene rol admin.");
      setMensaje(
        nuevo === "admin"
          ? `${f.nombre ?? f.email} ahora es admin (sin límites y con acceso a este panel).`
          : `${f.nombre ?? f.email} ahora es usuario normal (aplican topes y aprobaciones).`
      );
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el rol");
    } finally {
      setCambiando(null);
    }
  }

  const fechaCorta = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("es-MX", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "nunca";

  const admins = (filas ?? []).filter((f) => f.rol === "admin").length;

  return (
    <>
      <div className="tarjeta glow-cian px-6 py-5">
        <h1 className="font-display text-xl font-bold tracking-tight text-texto-primario">
          Usuarios
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 font-body text-xs text-texto-secundario">
          <span>
            <CifraAnimada
              valor={filas?.length ?? 0}
              className="font-mono text-texto-primario"
            />{" "}
            con acceso
          </span>
          <span>
            <span className="font-mono text-violeta">{admins}</span>{" "}
            {admins === 1 ? "admin" : "admins"}
          </span>
          <span className="text-texto-terciario">
            El rol se cambia aquí; nadie puede quitarse el admin a sí mismo.
          </span>
        </div>
      </div>

      {error && <MensajeError mensaje={error} onCerrar={() => setError("")} />}
      {mensaje && (
        <p className="rounded-control border border-exito/50 bg-exito/10 px-3.5 py-2.5 font-body text-[13px] text-texto-primario">
          {mensaje}
        </p>
      )}

      <div className="tarjeta px-6 py-5">
        {filas === null ? (
          <div className="space-y-2" aria-label="Cargando usuarios">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-5/6" />
          </div>
        ) : (
          <table className="w-full text-left font-body text-xs">
            <thead className="text-texto-terciario">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Usuario</th>
                <th className="py-1.5 pr-3 font-medium">Último acceso</th>
                <th className="py-1.5 pr-3 text-right font-medium">Consultas mes</th>
                <th className="py-1.5 pr-3 text-right font-medium">Gasto mes</th>
                <th className="py-1.5 pr-3 font-medium">Rol</th>
                <th className="py-1.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="text-texto-primario">
              {filas.map((f) => (
                <tr key={f.user_id} className="border-t border-linea/60">
                  <td className="max-w-[240px] py-2.5 pr-3">
                    <span className="block truncate" title={f.email}>
                      {f.nombre ?? f.email}
                      {f.user_id === usuario?.id && (
                        <span className="ml-1.5 text-cian">· tú</span>
                      )}
                    </span>
                    {f.nombre && (
                      <span className="block truncate font-body text-[11px] text-texto-terciario">
                        {f.email}
                      </span>
                    )}
                  </td>
                  <td
                    className="py-2.5 pr-3 font-mono text-texto-secundario"
                    title={`Cuenta creada: ${fechaCorta(f.creado)}`}
                  >
                    {fechaCorta(f.ultimo_acceso)}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-cian">
                    {fmt(Number(f.consultas_mes))}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-violeta">
                    {fmtMxn(Number(f.gasto_mes_mxn))}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={`rounded-chip border px-2 py-0.5 text-[10px] ${
                        f.rol === "admin"
                          ? "border-violeta/60 bg-violeta/10 text-violeta"
                          : "border-linea bg-panel2 text-texto-secundario"
                      }`}
                    >
                      {f.rol === "admin" ? "admin" : "normal"}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => cambiarRol(f)}
                      disabled={cambiando !== null || f.user_id === usuario?.id}
                      className="btn-secundario !px-2.5 !py-1 !text-[11px] disabled:opacity-40"
                      title={
                        f.user_id === usuario?.id
                          ? "No puedes cambiarte el rol a ti mismo"
                          : f.rol === "admin"
                            ? "Quitar rol admin (vuelve a usuario normal)"
                            : "Hacer admin (sin límites y con acceso a este panel)"
                      }
                    >
                      {cambiando === f.user_id
                        ? "Cambiando…"
                        : f.rol === "admin"
                          ? "Quitar admin"
                          : "Hacer admin"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
