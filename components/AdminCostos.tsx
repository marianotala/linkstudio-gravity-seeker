"use client";

// BLINDAJE DE COSTOS — panel de /admin:
// 1) SOLICITUDES de corridas grandes: aprobar (arranca sola en la
//    pantalla del solicitante en segundos) o rechazar con nota.
// 2) GASTO de hoy y del mes en MXN por usuario, método y análisis —
//    visible el mismo día, no en la factura.
// 3) CONFIGURACIÓN: límite global diario, umbral de aprobación,
//    tarifas por SKU y tipo de cambio (se calibran contra la consola
//    de facturación de Google).

import { useCallback, useEffect, useState } from "react";
import { configCostosDe, fmtMxn, type ConfigCostos } from "@/lib/costos";
import type { SolicitudCorrida } from "@/lib/corridas";
import { createClient } from "@/lib/supabase/client";

const fmt = (n: number) => n.toLocaleString("es-MX");

interface ResumenGasto {
  hoy_mxn: number;
  mes_mxn: number;
  hoy_consultas: number;
  mes_consultas: number;
  hoy_cache: number;
  mes_cache: number;
  usuarios: {
    email: string;
    nombre: string | null;
    hoy_mxn: number;
    mes_mxn: number;
    hoy_consultas: number;
    mes_consultas: number;
  }[];
  metodos: {
    metodo: string;
    hoy_mxn: number;
    mes_mxn: number;
    hoy_consultas: number;
    mes_consultas: number;
    mes_cache: number;
  }[];
  contextos: { contexto: string; mes_mxn: number; mes_consultas: number }[];
}

type SolicitudConPerfil = SolicitudCorrida & {
  profiles?: { email: string; nombre: string | null } | null;
};

const inputCls =
  "rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cian focus:outline-none";

const ETIQUETA_METODO: Record<string, string> = {
  text: "Text Search",
  nearby: "Nearby Search",
  geocode: "Geocoding",
  autocomplete_sesion: "Autocomplete (sesiones)",
  cache: "Caché (gratis)",
};

const CAMPOS_CONFIG: { clave: keyof ConfigCostos; etiqueta: string }[] = [
  { clave: "limite_global_mxn_dia", etiqueta: "Límite global MXN/día" },
  { clave: "umbral_aprobacion_consultas", etiqueta: "Umbral aprobación (consultas)" },
  { clave: "umbral_aprobacion_mxn", etiqueta: "Umbral aprobación (MXN)" },
  { clave: "tipo_cambio_mxn", etiqueta: "Tipo de cambio USD→MXN" },
  { clave: "usd_text_por_mil", etiqueta: "Text Search USD/1000" },
  { clave: "usd_nearby_por_mil", etiqueta: "Nearby USD/1000" },
  { clave: "usd_geocode_por_mil", etiqueta: "Geocoding USD/1000" },
  { clave: "usd_sesion_autocomplete_por_mil", etiqueta: "Sesión autocomplete USD/1000" },
  { clave: "factor_paginacion", etiqueta: "Factor de paginación (estimador)" },
];

export default function AdminCostos() {
  const [gasto, setGasto] = useState<ResumenGasto | null>(null);
  const [solicitudes, setSolicitudes] = useState<SolicitudConPerfil[]>([]);
  const [notas, setNotas] = useState<Record<string, string>>({});
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, string>>({});
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data: g } = await supabase.rpc("gasto_resumen_admin");
    if (g && Object.keys(g as object).length > 0) setGasto(g as ResumenGasto);
    const { data: s } = await supabase
      .from("run_requests")
      .select("*, profiles!run_requests_user_id_fkey(email, nombre)")
      .order("created_at", { ascending: false })
      .limit(30);
    if (s) {
      const lista = s as unknown as SolicitudConPerfil[];
      // pendientes arriba, luego el resto por fecha
      setSolicitudes([
        ...lista.filter((x) => x.status === "pendiente"),
        ...lista.filter((x) => x.status !== "pendiente"),
      ]);
    }
    const { data: cfgRow } = await supabase
      .from("app_config")
      .select("valor")
      .eq("clave", "costos")
      .maybeSingle();
    const cfg = configCostosDe(cfgRow?.valor);
    setConfig(
      Object.fromEntries(
        CAMPOS_CONFIG.map((c) => [c.clave, String(cfg[c.clave])])
      )
    );
  }, []);

  useEffect(() => {
    cargar();
    // las solicitudes nuevas aparecen sin recargar la página
    const timer = setInterval(cargar, 20_000);
    return () => clearInterval(timer);
  }, [cargar]);

  async function resolver(s: SolicitudConPerfil, aprobar: boolean) {
    setOcupadoId(s.id);
    setMensaje(null);
    try {
      const supabase = createClient();
      const { data: ud } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("run_requests")
        .update({
          status: aprobar ? "aprobada" : "rechazada",
          nota_admin: (notas[s.id] ?? "").trim() || null,
          resuelto_por: ud?.user?.id ?? null,
          resuelto_en: new Date().toISOString(),
        })
        .eq("id", s.id)
        .eq("status", "pendiente");
      if (error) throw new Error(error.message);
      setMensaje({
        tipo: "ok",
        texto: aprobar
          ? `Aprobada: "${s.titulo}" — la corrida arranca sola en la pantalla del solicitante (o al relanzarla) y su aprobación autoriza el gasto aunque exceda el límite del día.`
          : `Rechazada: "${s.titulo}".`,
      });
      await cargar();
    } catch (e) {
      setMensaje({
        tipo: "error",
        texto: e instanceof Error ? e.message : "No se pudo resolver la solicitud",
      });
    } finally {
      setOcupadoId(null);
    }
  }

  async function guardarConfig() {
    setGuardandoConfig(true);
    setMensaje(null);
    try {
      const supabase = createClient();
      const valor = Object.fromEntries(
        CAMPOS_CONFIG.map((c) => [c.clave, Number(config[c.clave]) || 0])
      );
      const { error } = await supabase
        .from("app_config")
        .upsert({ clave: "costos", valor, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      setMensaje({
        tipo: "ok",
        texto: "Configuración de costos guardada — aplica de inmediato a estimadores, límites y umbral.",
      });
    } catch (e) {
      setMensaje({
        tipo: "error",
        texto:
          e instanceof Error && /row-level security/i.test(e.message)
            ? "Tu usuario no tiene rol admin."
            : e instanceof Error
              ? e.message
              : "No se pudo guardar",
      });
    } finally {
      setGuardandoConfig(false);
    }
  }

  const pendientes = solicitudes.filter((s) => s.status === "pendiente");

  const badge = (status: SolicitudCorrida["status"]) => {
    const estilos: Record<string, string> = {
      pendiente: "border-amber-400/60 bg-amber-400/10 text-amber-400",
      aprobada: "border-emerald-400/60 bg-emerald-400/10 text-emerald-400",
      ejecutada: "border-cian/60 bg-cian/10 text-cian",
      rechazada: "border-magenta/60 bg-magenta/10 text-magenta",
      cancelada: "border-linea bg-panel2 text-zinc-500",
    };
    return (
      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${estilos[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <>
      {/* ---- solicitudes de corridas grandes ---- */}
      <div className="tarjeta glow-magenta px-6 py-6">
        <h2 className="font-display text-xl font-extrabold tracking-tight text-white">
          Corridas grandes — solicitudes
          {pendientes.length > 0 && (
            <span className="ml-2 rounded-full border border-amber-400/60 bg-amber-400/10 px-2.5 py-0.5 font-mono text-xs text-amber-400">
              {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"}
            </span>
          )}
        </h2>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
          Las corridas que superan el umbral quedan aquí en espera. Al
          aprobar, la corrida ARRANCA SOLA en la pantalla del solicitante
          (sondea cada 12 s) y la aprobación autoriza el gasto aunque exceda
          el límite global del día. Rechaza con nota para que sepa por qué.
        </p>
        {solicitudes.length === 0 ? (
          <p className="mt-3 font-mono text-[11px] text-zinc-600">
            Sin solicitudes todavía.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {solicitudes.slice(0, 12).map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-linea bg-panel p-3 font-mono text-[11px]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {badge(s.status)}
                  <span className="text-zinc-200">{s.titulo}</span>
                  <span className="text-zinc-500">
                    · {s.profiles?.nombre ?? s.profiles?.email ?? "usuario"} ·{" "}
                    {new Date(s.created_at).toLocaleString("es-MX", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                <p className="mt-1 text-zinc-400">
                  ~{fmt(s.consultas_estimadas)} consultas · estimado{" "}
                  <span className="text-amber-400">
                    {fmtMxn(Number(s.costo_estimado_mxn))}
                  </span>{" "}
                  MXN · origen: {s.origen}
                  {s.nota_admin && (
                    <span className="text-zinc-500"> · nota: {s.nota_admin}</span>
                  )}
                </p>
                {s.status === "pendiente" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => resolver(s, true)}
                      disabled={ocupadoId === s.id}
                      className="rounded-md border border-emerald-400 bg-emerald-400/10 px-3 py-1.5 font-semibold text-emerald-400 transition-colors hover:bg-emerald-400/20 disabled:opacity-40"
                    >
                      Aprobar (autoriza {fmtMxn(Number(s.costo_estimado_mxn))})
                    </button>
                    <button
                      onClick={() => resolver(s, false)}
                      disabled={ocupadoId === s.id}
                      className="rounded-md border border-magenta bg-magenta/10 px-3 py-1.5 text-magenta transition-colors hover:bg-magenta/20 disabled:opacity-40"
                    >
                      Rechazar
                    </button>
                    <input
                      value={notas[s.id] ?? ""}
                      onChange={(e) =>
                        setNotas((prev) => ({ ...prev, [s.id]: e.target.value }))
                      }
                      placeholder="Nota (opcional, la ve el solicitante)"
                      className={`${inputCls} min-w-[220px] flex-1`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- gasto en MXN (hoy / mes) ---- */}
      <div className="tarjeta glow-violeta px-6 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-extrabold tracking-tight text-white">
              Gasto de la API de Google (MXN)
            </h2>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
              Estimado con las tarifas configuradas abajo — visible el mismo
              día, no en la factura. Calíbralo contra la consola de Google.
            </p>
          </div>
          <button
            onClick={cargar}
            className="shrink-0 rounded-md border border-linea bg-panel2 px-3 py-1.5 font-mono text-[11px] text-zinc-400 hover:border-cian hover:text-cian"
          >
            ⟳ Actualizar
          </button>
        </div>

        {gasto ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { etiqueta: "Hoy", valor: fmtMxn(gasto.hoy_mxn), sub: `${fmt(gasto.hoy_consultas)} consultas` },
                { etiqueta: "Mes", valor: fmtMxn(gasto.mes_mxn), sub: `${fmt(gasto.mes_consultas)} consultas` },
                { etiqueta: "Caché hoy", valor: fmt(gasto.hoy_cache), sub: "consultas gratis" },
                { etiqueta: "Caché mes", valor: fmt(gasto.mes_cache), sub: "consultas gratis" },
              ].map((c) => (
                <div key={c.etiqueta} className="rounded-lg border border-linea bg-panel p-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    {c.etiqueta}
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-white">
                    {c.valor}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-500">{c.sub}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Por usuario
                </p>
                <table className="w-full text-left font-mono text-xs">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Usuario</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Hoy</th>
                      <th className="py-1.5 text-right font-medium">Mes</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    {gasto.usuarios.map((u) => (
                      <tr key={u.email} className="border-t border-linea/60">
                        <td className="max-w-[200px] truncate py-1.5 pr-3" title={u.email}>
                          {u.nombre ?? u.email}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-cian">
                          {fmtMxn(u.hoy_mxn)}
                        </td>
                        <td className="py-1.5 text-right text-violeta">
                          {fmtMxn(u.mes_mxn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Por método
                </p>
                <table className="w-full text-left font-mono text-xs">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Método</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Hoy</th>
                      <th className="py-1.5 text-right font-medium">Mes</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    {gasto.metodos.map((m) => (
                      <tr key={m.metodo} className="border-t border-linea/60">
                        <td className="py-1.5 pr-3">
                          {ETIQUETA_METODO[m.metodo] ?? m.metodo}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-cian">
                          {m.metodo === "cache" ? `${fmt(m.hoy_consultas)} ·` : ""}{" "}
                          {fmtMxn(m.hoy_mxn)}
                        </td>
                        <td className="py-1.5 text-right text-violeta">
                          {m.metodo === "cache"
                            ? `${fmt(m.mes_cache)} gratis`
                            : fmtMxn(m.mes_mxn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {gasto.contextos.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Por búsqueda / plan (mes, top 25)
                </p>
                <div className="max-h-52 overflow-y-auto rounded-lg border border-linea">
                  <table className="w-full text-left font-mono text-xs">
                    <tbody className="text-zinc-300">
                      {gasto.contextos.map((c, i) => (
                        <tr key={i} className="border-t border-linea/60 first:border-t-0">
                          <td className="max-w-[380px] truncate px-3 py-1.5">
                            {c.contexto}
                          </td>
                          <td className="px-3 py-1.5 text-right text-zinc-500">
                            {fmt(c.mes_consultas)} consultas
                          </td>
                          <td className="px-3 py-1.5 text-right text-amber-400">
                            {fmtMxn(c.mes_mxn)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="mt-3 font-mono text-[11px] text-zinc-600">
            Sin gasto registrado todavía — el log arranca con la primera
            búsqueda desde esta versión.
          </p>
        )}
      </div>

      {/* ---- configuración de costos ---- */}
      <div className="tarjeta px-6 py-5">
        <h2 className="font-display text-base font-extrabold text-white">
          Configuración de costos y umbral de aprobación
        </h2>
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
          Tarifas por SKU (USD por 1,000 llamadas) y tipo de cambio para el
          estimado en MXN; el límite global corta el gasto del día completo
          (admin y corridas aprobadas lo pueden exceder); el umbral define
          qué corridas requieren aprobación.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CAMPOS_CONFIG.map((c) => (
            <label key={c.clave} className="block">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                {c.etiqueta}
              </span>
              <input
                type="number"
                min={0}
                step="any"
                value={config[c.clave] ?? ""}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, [c.clave]: e.target.value }))
                }
                className={`${inputCls} w-full`}
              />
            </label>
          ))}
        </div>
        <button
          onClick={guardarConfig}
          disabled={guardandoConfig}
          className="mt-3 rounded-md bg-cian px-4 py-2 font-display text-xs font-extrabold text-fondo transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {guardandoConfig ? "Guardando…" : "Guardar configuración"}
        </button>
        {mensaje && (
          <p
            className={`mt-2 font-mono text-[11px] ${
              mensaje.tipo === "ok" ? "text-emerald-400" : "text-magenta"
            }`}
          >
            {mensaje.texto}
          </p>
        )}
      </div>
    </>
  );
}
