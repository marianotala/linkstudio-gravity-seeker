"use client";

// HUB de /admin: una tarjeta por módulo con su resumen de un vistazo
// (salud de la data, pantallas, gasto de hoy, pendientes y usuarios).

import Link from "next/link";
import { useEffect, useState } from "react";
import { MODULOS_ADMIN } from "./AdminShell";
import { CifraAnimada, Skeleton } from "../ui";
import { fmtMxn } from "@/lib/costos";
import { createClient } from "@/lib/supabase/client";
import type { ResumenLotePantallas } from "@/lib/types";

const fmt = (n: number) => n.toLocaleString("es-MX");
export const TOTAL_ENTIDADES = 32;

interface ResumenHub {
  entidadesDemo: number;
  agebs: number;
  entidadesCp: number;
  colonias: number;
  rurales: number;
  pantallas: number;
  lotes: number;
  gastoHoyMxn: number;
  gastoMesMxn: number;
  pendientes: number;
  usuarios: number;
}

/** Semáforo de cobertura: verde completo, ámbar parcial, rojo vacío. */
export function Semaforo({ valor, total }: { valor: number; total: number }) {
  const color =
    valor >= total ? "bg-exito" : valor > 0 ? "bg-alerta" : "bg-error";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

export default function AdminHub() {
  const [r, setR] = useState<ResumenHub | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [agebs, cps, colonias, rural, pantallas, pendientes, usuarios, gasto] =
        await Promise.all([
          supabase.rpc("agebs_resumen"),
          supabase.rpc("cps_resumen"),
          supabase
            .from("cp_colonias")
            .select("codigo_postal", { count: "exact", head: true }),
          supabase.rpc("localidades_resumen"),
          supabase.rpc("screens_resumen"),
          supabase
            .from("run_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "pendiente"),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.rpc("gasto_resumen_admin"),
        ]);
      const listaAgebs = (agebs.data ?? []) as { agebs: number }[];
      const lotes = (pantallas.data ?? []) as ResumenLotePantallas[];
      const g = (gasto.data ?? {}) as { hoy_mxn?: number; mes_mxn?: number };
      setR({
        entidadesDemo: listaAgebs.length,
        agebs: listaAgebs.reduce((t, x) => t + (x.agebs ?? 0), 0),
        entidadesCp: ((cps.data ?? []) as unknown[]).length,
        colonias: colonias.count ?? 0,
        rurales:
          (rural.data as { total?: number } | null)?.total ?? 0,
        pantallas: lotes.reduce((t, x) => t + (x.total ?? 0), 0),
        lotes: lotes.length,
        gastoHoyMxn: Number(g.hoy_mxn ?? 0),
        gastoMesMxn: Number(g.mes_mxn ?? 0),
        pendientes: pendientes.count ?? 0,
        usuarios: usuarios.count ?? 0,
      });
    })();
  }, []);

  const meta = Object.fromEntries(MODULOS_ADMIN.map((m) => [m.clave, m]));

  const tarjetas: {
    clave: string;
    resumen: React.ReactNode;
    alerta?: string;
  }[] = [
    {
      clave: "data",
      resumen: r ? (
        <span className="space-y-1">
          <span className="flex items-center gap-2">
            <Semaforo valor={r.entidadesDemo} total={TOTAL_ENTIDADES} />
            <span className="font-mono">
              {r.entidadesDemo}/{TOTAL_ENTIDADES}
            </span>{" "}
            entidades demográficas · <span className="font-mono">{fmt(r.agebs)}</span>{" "}
            AGEBs
          </span>
          <span className="flex items-center gap-2">
            <Semaforo valor={r.entidadesCp} total={TOTAL_ENTIDADES} />
            <span className="font-mono">
              {r.entidadesCp}/{TOTAL_ENTIDADES}
            </span>{" "}
            entidades con CPs · <span className="font-mono">{fmt(r.colonias)}</span>{" "}
            colonias
          </span>
          <span className="flex items-center gap-2">
            <Semaforo valor={r.rurales} total={1} />
            <span className="font-mono">{fmt(r.rurales)}</span> localidades
            rurales (ITER)
          </span>
        </span>
      ) : null,
    },
    {
      clave: "ooh",
      resumen: r ? (
        <span>
          <span className="font-mono">{fmt(r.pantallas)}</span> pantallas en{" "}
          <span className="font-mono">{r.lotes}</span>{" "}
          {r.lotes === 1 ? "lote" : "lotes"}
        </span>
      ) : null,
    },
    {
      clave: "gasto",
      resumen: r ? (
        <span>
          hoy <span className="font-mono text-cian">{fmtMxn(r.gastoHoyMxn)}</span> ·
          mes <span className="font-mono text-violeta">{fmtMxn(r.gastoMesMxn)}</span>
        </span>
      ) : null,
      alerta:
        r && r.pendientes > 0
          ? `${r.pendientes} ${r.pendientes === 1 ? "corrida en espera" : "corridas en espera"} de aprobación`
          : undefined,
    },
    {
      clave: "usuarios",
      resumen: r ? (
        <span>
          <CifraAnimada valor={r.usuarios} className="font-mono" /> usuarios con
          acceso
        </span>
      ) : null,
    },
  ];

  return (
    <>
      <div className="tarjeta glow-violeta px-6 py-5">
        <h1 className="font-display text-xl font-bold tracking-tight text-texto-primario">
          Administración de Seeker
        </h1>
        <p className="mt-1 font-body text-xs leading-relaxed text-texto-secundario">
          Cuatro módulos: data territorial, inventario OOH, gasto y
          facturación, y usuarios. Cada tarjeta muestra su estado de un
          vistazo — entra para cargar, configurar o aprobar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {tarjetas.map((t) => {
          const m = meta[t.clave];
          return (
            <Link
              key={t.clave}
              href={`/admin/${t.clave}`}
              className="tarjeta group px-5 py-5 transition-colors duration-rapida hover:border-linea2"
            >
              <div className="flex items-center gap-2.5">
                <span className={`h-2.5 w-2.5 rounded-full ${m.punto}`} />
                <h2 className="font-display text-base font-bold text-texto-primario">
                  {m.nombre}
                </h2>
                <span className="ml-auto text-texto-terciario transition-colors duration-rapida group-hover:text-texto-primario">
                  →
                </span>
              </div>
              <p className="mt-1 font-body text-[11px] text-texto-terciario">
                {m.descriptor}
              </p>
              <div className="mt-3 font-body text-xs leading-relaxed text-texto-secundario">
                {t.resumen ?? <Skeleton className="h-10 w-3/4" />}
              </div>
              {t.alerta && (
                <p className="mt-2 inline-block rounded-chip border border-alerta/50 bg-alerta/10 px-2.5 py-0.5 font-body text-[11px] text-alerta">
                  ⚠ {t.alerta}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
