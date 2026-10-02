"use client";

// MÓDULO "GASTO Y FACTURACIÓN" (/admin/gasto): el panel de consumo,
// solicitudes de corridas grandes y configuración de costos ya
// construidos (AdminCostos), ahora con casa propia — más el tope
// diario de consultas por usuario, el consumo por persona y el LOG de
// llamadas exportable (api_usage_log → Excel).

import { useEffect, useState } from "react";
import AdminCostos from "../AdminCostos";
import { createClient } from "@/lib/supabase/client";

const fmt = (n: number) => n.toLocaleString("es-MX");

interface ConsumoUsuario {
  user_id: string;
  email: string;
  nombre: string | null;
  rol: string;
  celdas_hoy: number;
  busquedas_hoy: number;
  celdas_mes: number;
  busquedas_mes: number;
}

export default function AdminGasto() {
  const [consumo, setConsumo] = useState<ConsumoUsuario[]>([]);
  const [topeCeldas, setTopeCeldas] = useState<string>("");
  const [guardandoTope, setGuardandoTope] = useState(false);
  const [mensajeTope, setMensajeTope] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [exportandoLog, setExportandoLog] = useState(false);
  const [mensajeLog, setMensajeLog] = useState<string>("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: consumoApi } = await supabase.rpc("admin_consumo_api");
      setConsumo(((consumoApi ?? []) as ConsumoUsuario[]) ?? []);
      const { data: config } = await supabase
        .from("app_config")
        .select("valor")
        .eq("clave", "cuotas")
        .maybeSingle();
      const tope = (config?.valor as { tope_celdas_dia?: number } | null)
        ?.tope_celdas_dia;
      if (tope) setTopeCeldas(String(tope));
    })();
  }, []);

  // ---- tope diario de consultas: editable, vive en app_config (la
  //      RPC consumir_cuota lo lee en cada consulta)
  async function guardarTopeCeldas() {
    const tope = parseInt(topeCeldas, 10);
    if (!Number.isFinite(tope) || tope < 1 || tope > 1000000) {
      setMensajeTope({ tipo: "error", texto: "Escribe un tope válido (1 a 1,000,000)." });
      return;
    }
    setGuardandoTope(true);
    setMensajeTope(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("app_config")
      .upsert({ clave: "cuotas", valor: { tope_celdas_dia: tope }, updated_at: new Date().toISOString() });
    if (error) {
      setMensajeTope({
        tipo: "error",
        texto: /row-level security/i.test(error.message)
          ? "Tu usuario no tiene rol admin."
          : error.message,
      });
    } else {
      setMensajeTope({
        tipo: "ok",
        texto: `Tope guardado: ${fmt(tope)} consultas/día por usuario (aplica de inmediato; los admin siguen sin límite).`,
      });
    }
    setGuardandoTope(false);
  }

  // ---- LOG de llamadas exportable: los últimos 90 días del
  //      api_usage_log (RLS: admin lee todo) a Excel nativo
  async function exportarLog() {
    setExportandoLog(true);
    setMensajeLog("");
    try {
      const supabase = createClient();
      const desde = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
      const TAM = 1000;
      const filas: Record<string, unknown>[] = [];
      for (let pagina = 0; pagina < 25; pagina++) {
        const { data, error } = await supabase
          .from("api_usage_log")
          .select(
            "created_at, metodo, contexto, consultas, de_cache, costo_mxn, profiles(email, nombre)"
          )
          .gte("created_at", desde)
          .order("created_at", { ascending: false })
          .range(pagina * TAM, pagina * TAM + TAM - 1);
        if (error) throw new Error(error.message);
        const lote = (data ?? []) as unknown as {
          created_at: string;
          metodo: string;
          contexto: string | null;
          consultas: number;
          de_cache: number;
          costo_mxn: number;
          profiles: { email: string; nombre: string | null } | null;
        }[];
        for (const f of lote) {
          filas.push({
            fecha: new Date(f.created_at).toLocaleString("es-MX"),
            usuario: f.profiles?.nombre ?? f.profiles?.email ?? "—",
            metodo: f.metodo,
            contexto: f.contexto ?? "",
            consultas_pagadas: f.consultas,
            de_cache: f.de_cache,
            costo_mxn: Number(f.costo_mxn),
          });
        }
        if (lote.length < TAM) break;
      }
      if (filas.length === 0) {
        setMensajeLog("Sin llamadas registradas en los últimos 90 días.");
        return;
      }
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const hoja = XLSX.utils.json_to_sheet(filas);
      hoja["!cols"] = [
        { wch: 20 },
        { wch: 26 },
        { wch: 16 },
        { wch: 44 },
        { wch: 16 },
        { wch: 10 },
        { wch: 12 },
      ];
      XLSX.utils.book_append_sheet(wb, hoja, "Log de llamadas");
      XLSX.writeFile(
        wb,
        `seeker_log_llamadas_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      setMensajeLog(
        `Exportadas ${fmt(filas.length)} llamadas de los últimos 90 días.`
      );
    } catch (e) {
      setMensajeLog(
        e instanceof Error ? `Error: ${e.message}` : "No se pudo exportar el log"
      );
    } finally {
      setExportandoLog(false);
    }
  }

  return (
    <>
      {/* solicitudes de corridas grandes + gasto MXN + configuración de
          costos (límite global y umbral de corrida grande) — el panel
          ya construido, con casa propia */}
      <AdminCostos />

      {/* ---------- tope diario por usuario + consumo ---------- */}
      <div className="tarjeta px-6 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold tracking-tight text-texto-primario">
              Consumo de la API y tope diario por usuario
            </h2>
            <p className="mt-1 font-body text-xs leading-relaxed text-texto-secundario">
              El tope diario por usuario cuenta CONSULTAS PAGADAS a Google
              (las servidas del caché no suman) — edítalo con datos reales del
              gasto de arriba (los admin no tienen límite). Al toparlo, el
              avance queda guardado y se reanuda al día siguiente; una corrida
              aprobada lo puede exceder.
            </p>
          </div>
          <button
            onClick={exportarLog}
            disabled={exportandoLog}
            className="btn-secundario shrink-0 !px-3 !py-1.5 !text-xs"
            title="Exporta el log de llamadas (fecha, usuario, método, contexto, consultas, caché y costo MXN) de los últimos 90 días a Excel"
          >
            {exportandoLog ? "Exportando…" : "⬇ Exportar log de llamadas"}
          </button>
        </div>
        {mensajeLog && (
          <p className="mt-2 font-body text-xs text-texto-secundario">
            {mensajeLog}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <label className="font-body text-xs text-texto-secundario">
            Tope de consultas/día por usuario
          </label>
          <input
            type="number"
            min={1}
            value={topeCeldas}
            onChange={(e) => setTopeCeldas(e.target.value)}
            placeholder="2500"
            className="campo w-32"
          />
          <button
            onClick={guardarTopeCeldas}
            disabled={guardandoTope}
            className="btn-primario shrink-0"
          >
            {guardandoTope ? "Guardando…" : "Guardar tope"}
          </button>
        </div>
        {mensajeTope && (
          <p
            className={`mt-2 font-body text-xs ${
              mensajeTope.tipo === "ok" ? "text-exito" : "text-error"
            }`}
          >
            {mensajeTope.texto}
          </p>
        )}

        {consumo.length > 0 ? (
          <table className="mt-4 w-full text-left font-body text-xs">
            <thead className="text-texto-terciario">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Usuario</th>
                <th className="py-1.5 pr-3 text-right font-medium">Consultas hoy</th>
                <th className="py-1.5 pr-3 text-right font-medium">Búsq. hoy</th>
                <th className="py-1.5 pr-3 text-right font-medium">Consultas mes</th>
                <th className="py-1.5 text-right font-medium">Búsq. mes</th>
              </tr>
            </thead>
            <tbody className="text-texto-primario">
              {consumo.map((c) => (
                <tr key={c.user_id} className="border-t border-linea/60">
                  <td className="max-w-[220px] truncate py-2 pr-3" title={c.email}>
                    {c.nombre ?? c.email}
                    {c.rol === "admin" && (
                      <span className="ml-1.5 text-violeta">· admin (sin límite)</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-cian">
                    {fmt(c.celdas_hoy)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-texto-secundario">
                    {fmt(c.busquedas_hoy)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-violeta">
                    {fmt(c.celdas_mes)}
                  </td>
                  <td className="py-2 text-right font-mono text-texto-secundario">
                    {fmt(c.busquedas_mes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 font-body text-xs text-texto-terciario">
            Sin consumo registrado todavía (el consumo de los admin no se
            contabiliza).
          </p>
        )}
      </div>
    </>
  );
}
