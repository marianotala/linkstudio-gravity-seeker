"use client";

// RESUMEN DEL PROYECTO (Planner F4): el universo TOTAL del plan.
// - Consolidado: unión DEDUPLICADA de las geometrías de los surveys
//   seleccionados (la pieza única de universos por lotes hace el
//   ST_Union — dos surveys sobre Polanco no cuentan doble), guardado
//   en project_universes con fecha y composición.
// - Desglose por survey (cuánto aporta cada capa) + comparativo de
//   NSE y edades entre surveys (usa los survey_universes ya guardados,
//   sin cálculos nuevos).
// - Traslapes entre ROLES bajo demanda, por inclusión-exclusión:
//   pob(A∩B) = pob(A) + pob(B) − pob(A∪B) — exacto con la misma
//   maquinaria (validado en vivo). La base del argumento de conquista.

import { useCallback, useEffect, useState } from "react";
import UniversosPanel from "./UniversosPanel";
import { rangosEdadEstandar } from "@/lib/edades";
import { NIVELES_NSE } from "@/lib/nse";
import {
  cargarPuntosCrudosSurvey,
  colorSurvey,
  ETIQUETA_ROL,
  geocercasDeSurvey,
  type PuntoSurvey,
} from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { calcularUniversosCliente } from "@/lib/universos-lotes";
import type {
  GeocercaUniverso,
  RolLevantamiento,
  Universos,
} from "@/lib/types";

interface SurveyResumen {
  id: string;
  rol: RolLevantamiento;
  configuracion: Record<string, unknown>;
  status: string;
  created_at: string;
  survey_points: { count: number }[];
  survey_universes: { resultados: Universos }[];
}

interface Consolidado {
  resultados: Universos;
  survey_ids: { id: string; nombre: string; rol: string }[];
  created_at: string;
}

interface Traslape {
  roles: [RolLevantamiento, RolLevantamiento];
  poblacion: number;
  pctBase: number;
  base: RolLevantamiento;
  poblacionBase: number;
}

const fmt = (n: number) => n.toLocaleString("es-MX");
const ORDEN_ROLES: RolLevantamiento[] = [
  "poi_propio",
  "competencia",
  "proximidad",
  "ooh",
];

/** Barra apilada compacta (misma lectura que el panel de universos). */
function Barra({
  segmentos,
}: {
  segmentos: { etiqueta: string; pct: number; color: string }[];
}) {
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-fondo">
        {segmentos.map(
          (s) =>
            s.pct > 0 && (
              <div
                key={s.etiqueta}
                style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                title={`${s.etiqueta} ${s.pct.toLocaleString("es-MX")}%`}
              />
            )
        )}
      </div>
    </div>
  );
}

export default function ResumenProyecto({
  proyectoId,
  surveys,
}: {
  proyectoId: string;
  surveys: SurveyResumen[];
}) {
  const [seleccion, setSeleccion] = useState<Record<string, boolean> | null>(null);
  const [consolidado, setConsolidado] = useState<Consolidado | null>(null);
  const [traslapes, setTraslapes] = useState<Traslape[] | null>(null);
  const [fechaTraslapes, setFechaTraslapes] = useState<string | null>(null);
  const [calculando, setCalculando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [crudosCache, setCrudosCache] = useState<Record<string, PuntoSurvey[]>>({});

  const nombreDe = (s: SurveyResumen) =>
    (s.configuracion?.nombre as string) ?? ETIQUETA_ROL[s.rol];
  const puntosDe = (s: SurveyResumen) => s.survey_points?.[0]?.count ?? 0;
  const universoDe = (s: SurveyResumen): Universos | null =>
    s.survey_universes?.[0]?.resultados ?? null;

  // cargar el consolidado y los traslapes guardados
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("project_universes")
        .select("tipo, survey_ids, resultados, created_at")
        .eq("project_id", proyectoId)
        .order("created_at", { ascending: false });
      const filas = (data ?? []) as {
        tipo: string;
        survey_ids: unknown;
        resultados: unknown;
        created_at: string;
      }[];
      const cons = filas.find((f) => f.tipo === "consolidado");
      if (cons) {
        setConsolidado({
          resultados: cons.resultados as Universos,
          survey_ids: (cons.survey_ids as Consolidado["survey_ids"]) ?? [],
          created_at: cons.created_at,
        });
      }
      const tras = filas.filter((f) => f.tipo === "traslape");
      if (tras.length > 0) {
        setTraslapes(
          tras.map((t) => t.resultados as unknown as Traslape)
        );
        setFechaTraslapes(tras[0].created_at);
      }
    })();
  }, [proyectoId]);

  // selección default: la composición del consolidado guardado, o
  // todos los surveys COMPLETADOS
  useEffect(() => {
    if (seleccion !== null || surveys.length === 0) return;
    const guardados = new Set(consolidado?.survey_ids.map((x) => x.id) ?? []);
    const inicial: Record<string, boolean> = {};
    for (const s of surveys) {
      inicial[s.id] =
        guardados.size > 0 ? guardados.has(s.id) : s.status === "completado";
    }
    setSeleccion(inicial);
  }, [surveys, consolidado, seleccion]);

  const sel = seleccion ?? {};
  const seleccionados = surveys.filter((s) => sel[s.id] && puntosDe(s) > 0);

  /** ¿El consolidado guardado ya no corresponde a la selección o hay
   * surveys más nuevos que el cálculo? */
  const desactualizado = (() => {
    if (!consolidado) return false;
    const guardados = consolidado.survey_ids.map((x) => x.id).sort().join(",");
    const actuales = seleccionados.map((s) => s.id).sort().join(",");
    if (guardados !== actuales) return true;
    return seleccionados.some(
      (s) => new Date(s.created_at) > new Date(consolidado.created_at)
    );
  })();

  const crudosDe = useCallback(
    async (s: SurveyResumen): Promise<PuntoSurvey[]> => {
      if (crudosCache[s.id]) return crudosCache[s.id];
      const modo = (s.configuracion?.mode as string) ?? "census";
      // cp/zone/orígenes-con-config no necesitan puntos para su
      // geometría; COMPETENCIA siempre los necesita (su territorio son
      // SUS puntos, no los orígenes donde se buscó)
      const necesitaPuntos =
        modo === "census" ||
        modo === "territorial" ||
        modo === "ooh" ||
        s.rol === "competencia" ||
        (modo === "origins" &&
          !((s.configuracion?.origenes as unknown[])?.length ?? 0) &&
          !((s.configuracion?.centers as unknown[])?.length ?? 0));
      if (!necesitaPuntos) return [];
      const crudos = await cargarPuntosCrudosSurvey(s.id);
      setCrudosCache((prev) => ({ ...prev, [s.id]: crudos }));
      return crudos;
    },
    [crudosCache]
  );

  async function geocercasDe(lista: SurveyResumen[]): Promise<GeocercaUniverso[]> {
    const salida: GeocercaUniverso[] = [];
    for (const s of lista) {
      const crudos = await crudosDe(s);
      salida.push(...geocercasDeSurvey(s, crudos));
    }
    return salida;
  }

  async function calcularConsolidado() {
    if (seleccionados.length === 0) {
      setError("Selecciona al menos un levantamiento con puntos");
      return;
    }
    setError("");
    setCalculando("Preparando geometrías…");
    try {
      const geocercas = await geocercasDe(seleccionados);
      const criterio = `unión deduplicada de ${seleccionados.length} ${seleccionados.length === 1 ? "levantamiento" : "levantamientos"} (${fmt(geocercas.length)} geocercas)`;
      const u = await calcularUniversosCliente(geocercas, criterio, {
        onProgreso: (lote, total) =>
          setCalculando(`Calculando universo consolidado · lote ${lote + 1} de ${total}…`),
      });
      if (!u.disponible) {
        setError(u.mensaje ?? "No se pudo calcular el consolidado");
        return;
      }
      const composicion = seleccionados.map((s) => ({
        id: s.id,
        nombre: nombreDe(s),
        rol: s.rol,
      }));
      const supabase = createClient();
      await supabase
        .from("project_universes")
        .delete()
        .eq("project_id", proyectoId)
        .eq("tipo", "consolidado");
      const { data } = await supabase
        .from("project_universes")
        .insert({
          project_id: proyectoId,
          tipo: "consolidado",
          survey_ids: composicion,
          resultados: { ...u, porAgeb: undefined, agebsGeo: undefined },
        })
        .select("created_at")
        .single();
      setConsolidado({
        resultados: u,
        survey_ids: composicion,
        created_at: data?.created_at ?? new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al calcular el consolidado");
    } finally {
      setCalculando(null);
    }
  }

  async function calcularTraslapes() {
    // geocercas por ROL (solo roles con surveys seleccionados)
    const porRol = new Map<RolLevantamiento, SurveyResumen[]>();
    for (const s of seleccionados) {
      porRol.set(s.rol, [...(porRol.get(s.rol) ?? []), s]);
    }
    const roles = ORDEN_ROLES.filter((r) => porRol.has(r));
    if (roles.length < 2) {
      setError("Se necesitan levantamientos de al menos 2 roles para calcular traslapes");
      return;
    }
    setError("");
    try {
      // 1) universo por rol (unión de sus surveys)
      const geocercasRol = new Map<RolLevantamiento, GeocercaUniverso[]>();
      const universoRol = new Map<RolLevantamiento, number>();
      for (let i = 0; i < roles.length; i++) {
        const rol = roles[i];
        setCalculando(
          `Universo de ${ETIQUETA_ROL[rol]} (${i + 1} de ${roles.length})…`
        );
        const g = await geocercasDe(porRol.get(rol)!);
        geocercasRol.set(rol, g);
        const u = await calcularUniversosCliente(
          g,
          `rol ${rol}`,
          {
            onProgreso: (lote, total) =>
              setCalculando(
                `Universo de ${ETIQUETA_ROL[rol]} · lote ${lote + 1} de ${total}…`
              ),
          }
        );
        universoRol.set(rol, u.disponible ? u.residencial!.poblacion : 0);
      }
      // 2) pares: inclusión-exclusión con el universo de la UNIÓN
      const resultados: Traslape[] = [];
      for (let i = 0; i < roles.length; i++) {
        for (let j = i + 1; j < roles.length; j++) {
          const a = roles[i];
          const b = roles[j];
          setCalculando(
            `Traslape ${ETIQUETA_ROL[a]} × ${ETIQUETA_ROL[b]}…`
          );
          const union = await calcularUniversosCliente(
            [...geocercasRol.get(a)!, ...geocercasRol.get(b)!],
            `unión ${a}+${b}`,
            {
              onProgreso: (lote, total) =>
                setCalculando(
                  `Traslape ${ETIQUETA_ROL[a]} × ${ETIQUETA_ROL[b]} · lote ${lote + 1} de ${total}…`
                ),
            }
          );
          const pobA = universoRol.get(a) ?? 0;
          const pobB = universoRol.get(b) ?? 0;
          const pobU = union.disponible ? union.residencial!.poblacion : pobA + pobB;
          const interseccion = Math.max(0, Math.round(pobA + pobB - pobU));
          resultados.push({
            roles: [a, b],
            poblacion: interseccion,
            pctBase: pobA > 0 ? Math.round((1000 * interseccion) / pobA) / 10 : 0,
            base: a,
            poblacionBase: pobA,
          });
        }
      }
      const supabase = createClient();
      await supabase
        .from("project_universes")
        .delete()
        .eq("project_id", proyectoId)
        .eq("tipo", "traslape");
      await supabase.from("project_universes").insert(
        resultados.map((t) => ({
          project_id: proyectoId,
          tipo: "traslape",
          survey_ids: {
            roles: t.roles,
            surveys: seleccionados
              .filter((s) => t.roles.includes(s.rol))
              .map((s) => s.id),
          },
          resultados: t,
        }))
      );
      setTraslapes(resultados);
      setFechaTraslapes(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al calcular traslapes");
    } finally {
      setCalculando(null);
    }
  }

  const sumaSimple = seleccionados.reduce(
    (t, s) => t + (universoDe(s)?.residencial?.adultos18 ?? 0),
    0
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-extrabold tracking-tight text-white">
            Resumen del proyecto
          </h2>
          <p className="font-mono text-[10px] leading-relaxed text-zinc-500">
            El universo TOTAL del plan: la unión de las geometrías de los
            levantamientos seleccionados, deduplicando traslapes — dos capas
            sobre Polanco no cuentan a los polanqueños dos veces.
          </p>
        </div>
        <button
          onClick={calcularConsolidado}
          disabled={calculando !== null || seleccionados.length === 0}
          className={`shrink-0 rounded-md px-4 py-2 font-display text-xs font-extrabold transition-opacity hover:opacity-90 disabled:opacity-40 ${
            desactualizado || !consolidado
              ? "bg-violeta text-white"
              : "border border-linea bg-panel2 text-zinc-300"
          }`}
        >
          {consolidado ? "Recalcular consolidado" : "Calcular consolidado"}
        </button>
      </div>

      {/* selector de surveys que entran al consolidado */}
      <div className="mt-3 rounded-lg border border-linea bg-panel2/50 p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Qué levantamientos entran al consolidado
          <span className="ml-2 normal-case tracking-normal text-zinc-600">
            (a veces la competencia no debe sumar al alcance — tú decides)
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {surveys
            .filter((s) => puntosDe(s) > 0)
            .map((s, i) => (
              <button
                key={s.id}
                onClick={() =>
                  setSeleccion((prev) => ({ ...(prev ?? {}), [s.id]: !sel[s.id] }))
                }
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors ${
                  sel[s.id]
                    ? "border-zinc-500 bg-fondo text-zinc-200"
                    : "border-linea bg-panel2 text-zinc-600 hover:text-zinc-400"
                }`}
                title={`${ETIQUETA_ROL[s.rol]} · ${fmt(puntosDe(s))} puntos${s.status !== "completado" ? " · " + s.status : ""}`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: colorSurvey(s.rol, i), opacity: sel[s.id] ? 1 : 0.35 }}
                />
                {nombreDe(s)}
                <span className="text-zinc-600">{ETIQUETA_ROL[s.rol]}</span>
              </button>
            ))}
        </div>
      </div>

      {calculando && (
        <p className="mt-3 font-mono text-[11px] text-cian">⟳ {calculando}</p>
      )}
      {error && <p className="mt-3 font-mono text-[11px] text-magenta">{error}</p>}

      {/* consolidado */}
      {consolidado && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] text-zinc-500">
            <span className="uppercase tracking-[0.2em]">Universo consolidado</span>
            <span>
              · calculado el{" "}
              {new Date(consolidado.created_at).toLocaleString("es-MX", {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              con {consolidado.survey_ids.length} levantamientos
            </span>
            {desactualizado && (
              <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-amber-400">
                desactualizado — recalcula
              </span>
            )}
          </div>
          <UniversosPanel universos={consolidado.resultados} notaTerritorio />
          {sumaSimple > 0 &&
            consolidado.resultados.disponible &&
            consolidado.resultados.residencial && (
              <p className="mt-1.5 font-mono text-[10px] text-zinc-500">
                Suma simple de los universos individuales:{" "}
                {fmt(sumaSimple)} adultos 18+ · consolidado deduplicado:{" "}
                <span className="text-violeta">
                  {fmt(consolidado.resultados.residencial.adultos18)}
                </span>{" "}
                {sumaSimple > consolidado.resultados.residencial.adultos18 && (
                  <span className="text-zinc-600">
                    (−{fmt(sumaSimple - consolidado.resultados.residencial.adultos18)}{" "}
                    por traslapes entre capas)
                  </span>
                )}
              </p>
            )}
        </div>
      )}

      {/* desglose por survey */}
      {seleccionados.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Cuánto aporta cada capa
          </p>
          <div className="overflow-hidden rounded-lg border border-linea">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-panel2 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Levantamiento</th>
                  <th className="px-3 py-2 font-medium">Rol</th>
                  <th className="px-3 py-2 text-right font-medium">Puntos</th>
                  <th className="px-3 py-2 text-right font-medium">Universo 18+ individual</th>
                </tr>
              </thead>
              <tbody className="bg-panel">
                {seleccionados.map((s, i) => (
                  <tr key={s.id} className="border-t border-linea/60 text-zinc-300">
                    <td className="max-w-[260px] truncate px-3 py-2">
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: colorSurvey(s.rol, i) }}
                      />
                      {nombreDe(s)}
                    </td>
                    <td className="px-3 py-2 text-zinc-500">{ETIQUETA_ROL[s.rol]}</td>
                    <td className="px-3 py-2 text-right text-cian">{fmt(puntosDe(s))}</td>
                    <td className="px-3 py-2 text-right text-violeta">
                      {universoDe(s)?.disponible
                        ? fmt(universoDe(s)!.residencial!.adultos18)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* comparativo NSE + edades entre surveys */}
      {seleccionados.filter((s) => universoDe(s)?.perfil?.nseDist).length >= 2 && (
        <div className="mt-5">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Comparativo entre capas · NSE y edades
            <span className="ml-2 normal-case tracking-normal text-zinc-600">
              ¿el territorio de la competencia tiene mejor NSE que el tuyo?
            </span>
          </p>
          <div className="space-y-2 rounded-lg border border-linea bg-panel p-3">
            {seleccionados.map((s) => {
              const u = universoDe(s);
              if (!u?.disponible) return null;
              const nse = u.perfil?.nseDist
                ? NIVELES_NSE.map((n) => ({
                    etiqueta: n.etiqueta,
                    pct: u.perfil!.nseDist![n.clave],
                    color: n.color,
                  }))
                : null;
              const edades = rangosEdadEstandar(u.perfil?.edades)?.map((r) => ({
                etiqueta: r.etiqueta,
                pct: r.pct,
                color: r.color,
              }));
              return (
                <div key={s.id} className="grid grid-cols-[220px_1fr_1fr] items-center gap-3">
                  <span className="truncate font-mono text-[11px] text-zinc-300">
                    {nombreDe(s)}
                    <span className="ml-1.5 text-[9px] text-zinc-600">
                      {ETIQUETA_ROL[s.rol]}
                    </span>
                  </span>
                  {nse ? <Barra segmentos={nse} /> : <span />}
                  {edades ? <Barra segmentos={edades} /> : <span />}
                </div>
              );
            })}
            <div className="grid grid-cols-[220px_1fr_1fr] gap-3 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
              <span />
              <span>NSE (proxy censal)</span>
              <span>Edades · % del universo 18+</span>
            </div>
          </div>
        </div>
      )}

      {/* traslapes entre roles */}
      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Traslape entre capas
            <span className="ml-2 normal-case tracking-normal text-zinc-600">
              población en zona propia que TAMBIÉN está en zona de competencia —
              la base cuantitativa de la conquista
            </span>
          </p>
          <button
            onClick={calcularTraslapes}
            disabled={calculando !== null || seleccionados.length === 0}
            className="shrink-0 rounded-md border border-magenta bg-magenta/10 px-3 py-1.5 font-mono text-[11px] text-magenta transition-colors hover:bg-magenta/20 disabled:opacity-40"
            title="Cálculo bajo demanda (usa la maquinaria por lotes): universo por rol + inclusión-exclusión"
          >
            {traslapes ? "Recalcular traslapes" : "Calcular traslapes"}
          </button>
        </div>
        {traslapes && traslapes.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {traslapes.map((t, i) => (
              <div
                key={i}
                className="rounded-lg border border-linea bg-panel px-4 py-2.5 font-mono text-xs text-zinc-300"
              >
                Traslape{" "}
                <span className="text-cian">{ETIQUETA_ROL[t.roles[0]]}</span> ×{" "}
                <span className="text-magenta">{ETIQUETA_ROL[t.roles[1]]}</span>:{" "}
                <span className="text-white">{fmt(t.poblacion)} personas</span>{" "}
                <span className="text-zinc-500">
                  ({t.pctBase.toLocaleString("es-MX")}% del universo de{" "}
                  {ETIQUETA_ROL[t.base]}, {fmt(t.poblacionBase)})
                </span>
              </div>
            ))}
            {fechaTraslapes && (
              <p className="font-mono text-[9px] text-zinc-600">
                Calculados el{" "}
                {new Date(fechaTraslapes).toLocaleString("es-MX", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}{" "}
                · pob(A∩B) = pob(A) + pob(B) − pob(A∪B), con las mismas sumas
                crudas del censo.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 font-mono text-[10px] text-zinc-600">
            Aún sin calcular — requiere levantamientos seleccionados de al
            menos 2 roles.
          </p>
        )}
      </div>
    </div>
  );
}
