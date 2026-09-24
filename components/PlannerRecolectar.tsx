"use client";

// SECCIONES AUTOCONTENIDAS del Planner (patrón "recolectar → calcular"):
// cada sección despliega su interfaz inline — recolectar puntos con el
// buscador tipo Google Maps y CSV/Excel (RecolectorPuntos), revisar la
// lista, y UN botón Calcular que ejecuta los llamados y guarda el
// levantamiento. Nada de brincar al buscador global. Las piezas de
// motor son las del modo consulta: buscarPorLotes (cuotas y lotes de
// /api/search), calcularUniversosCliente (universos por lotes),
// cruzarPantallasPdvs (cruce OOH local) y la persistencia del Planner.

import { useEffect, useMemo, useRef, useState } from "react";
import CategoriaBuscador, {
  etiquetaSeleccion,
  type SeleccionCategoria,
} from "./CategoriaBuscador";
import BuscadorLugar from "./BuscadorLugar";
import { useAprobacionCorrida } from "./AprobacionCorrida";
import PanelDepuracion from "./DepuracionCenso";
import RecolectorPuntos, {
  origenARecolectado,
  sumarPuntos,
  type PuntoRecolectado,
} from "./RecolectorPuntos";
import {
  buscarPorLotes,
  consultasPorCentroDe,
  categoriasParaApi,
  dividirTerminos,
} from "@/lib/busqueda-cliente";
import { CATEGORIA_LIBRE } from "@/lib/categories";
import {
  depurarConIA,
  perfilDeGiro,
  sospechososPorTipo,
  type Sospechoso,
} from "@/lib/depuracion";
import {
  consolidarCentros,
  crearBuscadorCercano,
  etiquetaOrigen,
} from "@/lib/geo";
import {
  CLAVES_TIPO_PANTALLA,
  cruzarPantallasPdvs,
  esZmvm,
  etiquetaTipoPantalla,
  filasCruceSurvey,
  pdvsCubiertos,
} from "@/lib/ooh";
import {
  actualizarRunPlanner,
  cargarPuntosSurveys,
  crearSurveysPlanner,
  depurarRunPersistido,
  guardarPuntosPlanner,
  guardarUniversosPlanner,
  guardarUniversosPorCapa,
  insertarPuntosCrudos,
  reescribirPuntosPlanner,
  type RunPlanner,
} from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { calcularUniversosCliente } from "@/lib/universos-lotes";
import type {
  GeocercaUniverso,
  Origin,
  Pantalla,
  Poi,
  RolLevantamiento,
} from "@/lib/types";

/** Borrador de recolección de una sección: se persiste en plan_state —
 * cerrar y reabrir el proyecto no pierde la lista armada. */
export interface BorradorSeccion {
  puntos: PuntoRecolectado[];
  config: Record<string, unknown>;
}

export const BORRADOR_VACIO: BorradorSeccion = { puntos: [], config: {} };

const fmt = (n: number) => n.toLocaleString("es-MX");

const RADIOS_INFLUENCIA = [
  { m: 250, label: "250 m" },
  { m: 500, label: "500 m" },
  { m: 1000, label: "1 km" },
  { m: 2000, label: "2 km" },
];

const RADIOS_CENSO = [
  { m: 500, label: "500 m" },
  { m: 1000, label: "1 km" },
  { m: 2000, label: "2 km" },
  { m: 3000, label: "3 km" },
  { m: 5000, label: "5 km" },
  { m: 10000, label: "10 km" },
  { m: 20000, label: "20 km" },
];

/** Confirmación explícita de costo a partir de este tamaño. */
const UMBRAL_CONFIRMAR_CONSULTAS = 60;

const labelCls =
  "mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500";
const inputCls =
  "w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cian focus:outline-none";
const selectCls =
  "rounded-md border border-linea bg-panel2 px-2 py-1.5 font-mono text-[11px] text-zinc-200 focus:border-cian focus:outline-none";

interface PropsBase {
  proyectoId: string;
  color: string;
  borrador: BorradorSeccion;
  onBorrador: (b: BorradorSeccion) => void;
  /** Recarga la lista de levantamientos del proyecto tras guardar. */
  alGuardar: () => Promise<void>;
}

/** Etiquetas EXACTAS que el servidor pone en p.categoria. */
function etiquetasDe(categorias: SeleccionCategoria[]): string[] {
  return categorias.map((c) =>
    c.key === CATEGORIA_LIBRE
      ? `Libre: "${(c.libre ?? "").trim()}"`
      : etiquetaSeleccion(c)
  );
}

/** Guarda una lista recolectada como survey COMPLETADO con universos. */
async function guardarListaComoSurvey(args: {
  proyectoId: string;
  rol: RolLevantamiento;
  nombre: string;
  puntos: PuntoRecolectado[];
  radioM: number;
  configExtra?: Record<string, unknown>;
  onEstado: (texto: string) => void;
}): Promise<void> {
  const { proyectoId, rol, nombre, puntos, radioM, onEstado } = args;
  const geocercas: GeocercaUniverso[] = puntos.map((p, i) => ({
    id: p.nombre || String(i),
    lat: p.lat,
    lng: p.lng,
    radio_m: radioM,
  }));
  onEstado("Calculando universos…");
  const u = await calcularUniversosCliente(
    geocercas,
    `población a ${radioM} m de ${fmt(puntos.length)} puntos`,
    {
      onProgreso: (lote, total) =>
        onEstado(`Calculando universos · lote ${lote + 1} de ${total}…`),
    }
  );
  onEstado("Guardando el levantamiento…");
  const run = await crearSurveysPlanner(
    { proyectoId, rol },
    [],
    {
      mode: "origins",
      radius: radioM,
      fuente_recoleccion: true,
      vias: {
        manual: puntos.filter((p) => p.via === "manual").length,
        excel: puntos.filter((p) => p.via === "excel").length,
        censo: puntos.filter((p) => p.via === "censo").length,
        proyecto: puntos.filter((p) => p.via === "proyecto").length,
      },
      nombre,
      ...(args.configExtra ?? {}),
    },
    "recoleccion"
  );
  await guardarPuntosPlanner(run, puntos);
  await guardarUniversosPlanner(run, u);
  await actualizarRunPlanner(run, { status: "completado", progreso: null });
  if (!u.disponible) {
    throw new Error(
      `Levantamiento guardado, pero los universos no estuvieron disponibles: ${u.mensaje ?? ""}`
    );
  }
}

/** Chips de términos (marcas) con input que acepta comas y "comillas". */
function ChipsTerminos({
  terminos,
  onCambiar,
  placeholder,
}: {
  terminos: string[];
  onCambiar: (t: string[]) => void;
  placeholder: string;
}) {
  const [texto, setTexto] = useState("");
  const agregar = () => {
    const nuevos = dividirTerminos(texto, terminos);
    if (nuevos.length > 0) onCambiar([...terminos, ...nuevos]);
    setTexto("");
  };
  return (
    <div>
      <div className="flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregar();
            }
          }}
          placeholder={placeholder}
          className={inputCls}
        />
        <button
          onClick={agregar}
          className="shrink-0 rounded-md border border-linea bg-panel2 px-3 font-mono text-[11px] text-zinc-300 hover:border-cian hover:text-cian"
        >
          +
        </button>
      </div>
      {terminos.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {terminos.map((t) => (
            <button
              key={t}
              onClick={() => onCambiar(terminos.filter((x) => x !== t))}
              className="group inline-flex items-center gap-1.5 rounded-full border border-magenta/50 bg-magenta/10 px-2.5 py-0.5 font-mono text-[10px] text-magenta"
            >
              {t}
              <span className="text-magenta/50 group-hover:text-magenta">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================================================================
// SECCIÓN 1 — POIs (Puntos de interés)
// ==================================================================

export function SeccionPois({
  proyectoId,
  color,
  borrador,
  onBorrador,
  alGuardar,
}: PropsBase) {
  const cfg = borrador.config;
  const puntos = borrador.puntos;
  const setPuntos = (p: PuntoRecolectado[]) =>
    onBorrador({ ...borrador, puntos: p });
  const setCfg = (extra: Record<string, unknown>) =>
    onBorrador({ ...borrador, config: { ...cfg, ...extra } });

  // censo de categorías/marcas que SUMA a la lista
  const [censoAbierto, setCensoAbierto] = useState(false);
  const centro = (cfg.censoCentro as Origin | null) ?? null;
  const radioCenso = (cfg.censoRadio as number) ?? 3000;
  const categorias = (cfg.censoCategorias as SeleccionCategoria[]) ?? [];
  const terminos = (cfg.censoTerminos as string[]) ?? [];
  const exclusiones = (cfg.censoExclusiones as string[]) ?? [];
  const radioInfluencia = (cfg.radioInfluencia as number) ?? 500;

  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // depuración inteligente del censo de marca (aquí opera sobre el
  // BORRADOR: la revisión pasa ANTES de Calcular/persistir el survey)
  const [sospechosos, setSospechosos] = useState<Sospechoso[] | null>(null);
  const [checksDep, setChecksDep] = useState<Record<string, boolean>>({});
  const [depurandoIA, setDepurandoIA] = useState(false);
  const ctxDepRef = useRef<{ lista: Poi[]; marca: string } | null>(null);

  function evaluarCoherencia(lista: Poi[], marca: string) {
    ctxDepRef.current = { lista, marca };
    const s = sospechososPorTipo(lista);
    setSospechosos(s.length > 0 ? s : null);
    setChecksDep(
      Object.fromEntries(s.map((x) => [x.placeId, x.veredicto === "dudoso"]))
    );
  }

  async function correrDepuracionIA() {
    const ctx = ctxDepRef.current;
    if (!ctx || ctx.lista.length === 0) return;
    setDepurandoIA(true);
    setError("");
    try {
      const res = await depurarConIA(
        ctx.lista,
        ctx.marca,
        perfilDeGiro(ctx.lista).etiqueta,
        setEstado
      );
      const porId = new Map((sospechosos ?? []).map((s) => [s.placeId, s]));
      for (const s of res) porId.set(s.placeId, s);
      const lista = Array.from(porId.values());
      setSospechosos(lista.length > 0 ? lista : null);
      setChecksDep(
        Object.fromEntries(lista.map((x) => [x.placeId, x.veredicto === "dudoso"]))
      );
      setEstado(
        res.length === 0
          ? "La IA no encontró intrusos: todo el censo pertenece a la marca"
          : `La IA marcó ${res.length} ${res.length === 1 ? "punto" : "puntos"} — revisa la lista y confirma`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "La depuración con IA falló");
    } finally {
      setDepurandoIA(false);
    }
  }

  /** Los NO palomeados salen del borrador — todavía no hay survey, así
   * que los universos se calcularán ya depurados al dar Calcular. */
  function confirmarDepuracion() {
    if (!sospechosos) return;
    const excluir = new Set(
      sospechosos.filter((s) => !checksDep[s.placeId]).map((s) => s.placeId)
    );
    setSospechosos(null);
    setChecksDep({});
    if (excluir.size === 0) {
      setEstado("Revisión confirmada — todos los puntos se conservan");
      return;
    }
    onBorrador({
      puntos: puntos.filter((p) => !excluir.has(p.placeId)),
      config: {
        ...cfg,
        depurados: (Number(cfg.depurados) || 0) + excluir.size,
      },
    });
    if (ctxDepRef.current) {
      ctxDepRef.current = {
        ...ctxDepRef.current,
        lista: ctxDepRef.current.lista.filter((p) => !excluir.has(p.placeId)),
      };
    }
    setEstado(
      `Censo depurado: ${fmt(excluir.size)} ${excluir.size === 1 ? "punto excluido" : "puntos excluidos"} por coherencia de giro`
    );
  }

  const consultasCenso = centro
    ? consultasPorCentroDe(categorias, terminos)
    : 0;

  async function correrCenso() {
    if (!centro) {
      setError("Primero fija el centro del censo (búscalo por nombre)");
      return;
    }
    if (categorias.length === 0 && terminos.length === 0) {
      setError("Elige una categoría o agrega un término de marca");
      return;
    }
    setError("");
    setOcupado(true);
    try {
      const r = await buscarPorLotes({
        centros: [centro],
        radius: radioCenso,
        categorias,
        nameFilters: terminos,
        excludes: exclusiones,
        onEstado: (t) => setEstado(`Censando · ${t}`),
      });
      const nuevos = r.pois.map((p) => ({
        ...p,
        via: "censo" as const,
        capa: p.categoria ?? p.termino ?? etiquetasDe(categorias)[0] ?? null,
      }));
      const { lista, duplicados } = sumarPuntos(puntos, nuevos);
      setPuntos(lista);
      // capa 1 de depuración: solo si el censo es de MARCA — la
      // revisión aparece ANTES de Calcular (dar por bueno el survey)
      if (terminos.length > 0) {
        evaluarCoherencia(nuevos, terminos.join(", "));
      }
      const notas = [
        `${fmt(nuevos.length - duplicados)} POIs sumados a la lista`,
        ...(duplicados > 0 ? [`${fmt(duplicados)} ya estaban`] : []),
        ...(r.excluidos > 0 ? [`${fmt(r.excluidos)} excluidos`] : []),
        ...(r.descartados > 0 ? [`${fmt(r.descartados)} descartados por nombre`] : []),
      ];
      setEstado(notas.join(" · "));
      if (!r.completa && r.interrupcion) setError(r.interrupcion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al censar");
      setEstado("");
    } finally {
      setOcupado(false);
    }
  }

  async function calcular() {
    if (puntos.length === 0) return;
    setError("");
    setOcupado(true);
    try {
      await guardarListaComoSurvey({
        proyectoId,
        rol: "poi_propio",
        nombre:
          (cfg.nombre as string)?.trim() ||
          `Puntos de interés · ${fmt(puntos.length)}`,
        puntos,
        radioM: radioInfluencia,
        configExtra:
          (Number(cfg.depurados) || 0) > 0
            ? { depurados: Number(cfg.depurados) }
            : undefined,
        onEstado: setEstado,
      });
      onBorrador({ puntos: [], config: { radioInfluencia } });
      setEstado(
        `Levantamiento guardado: ${fmt(puntos.length)} puntos con sus universos`
      );
      await alGuardar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al calcular");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="rounded-lg border border-linea bg-panel2/40 p-4">
      <p className="mb-2 font-mono text-[10px] leading-relaxed text-zinc-500">
        <span style={{ color }}>1 · Recolecta</span> los puntos de interés
        del plan por cualquiera de las tres vías —{" "}
        <span style={{ color }}>2 · revisa</span> la lista —{" "}
        <span style={{ color }}>3 · Calcular</span> guarda el levantamiento
        con sus universos.
      </p>

      <RecolectorPuntos puntos={puntos} onCambiar={setPuntos} disabled={ocupado} />

      {/* vía 3: censo de categorías / marcas que SUMA a la lista */}
      <div className="mt-3 rounded-lg border border-linea bg-panel p-3">
        <button
          onClick={() => setCensoAbierto(!censoAbierto)}
          className="flex w-full items-center justify-between font-mono text-[11px] text-zinc-300"
        >
          <span>
            Sumar un censo de categorías / marcas
            <span className="ml-2 text-[10px] text-zinc-600">
              los resultados se AGREGAN a la lista
            </span>
          </span>
          <span className="text-zinc-500">{censoAbierto ? "▴" : "▾"}</span>
        </button>
        {censoAbierto && (
          <div className="mt-3 space-y-3">
            <div>
              <label className={labelCls}>Alrededor de qué lugar</label>
              {centro ? (
                <button
                  onClick={() => setCfg({ censoCentro: null })}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-cian/60 bg-cian/10 px-2.5 py-1 font-mono text-[11px] text-cian"
                >
                  {centro.nombre ?? "Centro"}
                  <span className="text-cian/60 group-hover:text-cian">×</span>
                </button>
              ) : (
                <BuscadorLugar
                  onAgregar={(o) => setCfg({ censoCentro: o })}
                  disabled={ocupado}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                Radio
              </label>
              <select
                value={radioCenso}
                onChange={(e) => setCfg({ censoRadio: Number(e.target.value) })}
                className={selectCls}
              >
                {RADIOS_CENSO.map((r) => (
                  <option key={r.m} value={r.m}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Categorías (OR entre ellas)</label>
              <CategoriaBuscador
                selecciones={categorias}
                onCambiar={(c) => setCfg({ censoCategorias: c })}
                opcional
              />
            </div>
            <div>
              <label className={labelCls}>
                Términos de marca · &quot;comillas&quot; = nombre exacto
              </label>
              <ChipsTerminos
                terminos={terminos}
                onCambiar={(t) => setCfg({ censoTerminos: t })}
                placeholder='p. ej. oxxo, "farmacias guadalajara" (comas = varios)'
              />
            </div>
            <div>
              <label className={labelCls}>Exclusiones de marca</label>
              <ChipsTerminos
                terminos={exclusiones}
                onCambiar={(t) => setCfg({ censoExclusiones: t })}
                placeholder="marcas a excluir de los resultados"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={correrCenso}
                disabled={ocupado || !centro}
                className="rounded-md border border-magenta bg-magenta/10 px-4 py-2 font-mono text-[11px] text-magenta transition-colors hover:bg-magenta/20 disabled:opacity-40"
              >
                Correr censo y sumar a la lista
              </button>
              {centro && (
                <span className="font-mono text-[10px] text-zinc-500">
                  ≈ {consultasCenso} consulta{consultasCenso === 1 ? "" : "s"} a
                  Google
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* revisión de la depuración: gate ANTES de dar por bueno el survey */}
      {sospechosos && (
        <PanelDepuracion
          sospechosos={sospechosos}
          checks={checksDep}
          onCheck={(id, v) => setChecksDep((prev) => ({ ...prev, [id]: v }))}
          onConfirmar={confirmarDepuracion}
          onConservar={() => {
            setSospechosos(null);
            setChecksDep({});
          }}
          onDepurarIA={correrDepuracionIA}
          depurandoIA={depurandoIA}
          ocupado={ocupado}
          nPois={ctxDepRef.current?.lista.length ?? puntos.length}
        />
      )}

      {/* calcular */}
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-linea pt-3">
        <input
          value={(cfg.nombre as string) ?? ""}
          onChange={(e) => setCfg({ nombre: e.target.value })}
          placeholder="Nombre del levantamiento (opcional)"
          className={`${inputCls} max-w-xs`}
        />
        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Radio de influencia
        </label>
        <select
          value={radioInfluencia}
          onChange={(e) => setCfg({ radioInfluencia: Number(e.target.value) })}
          className={selectCls}
        >
          {RADIOS_INFLUENCIA.map((r) => (
            <option key={r.m} value={r.m}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          onClick={calcular}
          disabled={ocupado || puntos.length === 0 || sospechosos !== null}
          className="rounded-md px-5 py-2 font-display text-xs font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: color }}
          title={
            sospechosos !== null
              ? "Primero resuelve la depuración del censo (confirma o conserva todos)"
              : "Universos del conjunto + guardado del levantamiento (gratis: 0 consultas a Google)"
          }
        >
          Calcular ({fmt(puntos.length)} puntos)
        </button>
        {sospechosos !== null && (
          <span className="font-mono text-[10px] text-amber-400">
            resuelve la depuración del censo antes de calcular
          </span>
        )}
        {/* capa 2 bajo demanda cuando la capa 1 no marcó nada */}
        {!sospechosos && ctxDepRef.current && ctxDepRef.current.lista.length > 0 && (
          <button
            onClick={correrDepuracionIA}
            disabled={depurandoIA || ocupado}
            title="Revisa con IA si cada punto del censo pertenece realmente a la marca (falsos positivos de otro giro)"
            className="rounded-md border border-violeta/60 bg-violeta/10 px-3 py-1.5 font-mono text-[11px] text-violeta transition-colors hover:bg-violeta/20 disabled:opacity-40"
          >
            {depurandoIA ? "Depurando…" : "Depurar con IA"}
          </button>
        )}
      </div>
      {estado && <p className="mt-2 font-mono text-[11px] text-cian">⟳ {estado}</p>}
      {error && <p className="mt-2 font-mono text-[11px] text-magenta">{error}</p>}
    </div>
  );
}

// ==================================================================
// SECCIÓN 2 — Proximidad (simple: puntos + radio + universos gratis)
// ==================================================================

export function SeccionProximidad({
  proyectoId,
  color,
  borrador,
  onBorrador,
  alGuardar,
}: PropsBase) {
  const puntos = borrador.puntos;
  const cfg = borrador.config;
  const radio = (cfg.radio as number) ?? 1000;
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function calcular() {
    if (puntos.length === 0) return;
    setError("");
    setOcupado(true);
    try {
      await guardarListaComoSurvey({
        proyectoId,
        rol: "proximidad",
        nombre:
          (cfg.nombre as string)?.trim() ||
          `Proximidad · ${fmt(puntos.length)} puntos`,
        puntos,
        radioM: radio,
        onEstado: setEstado,
      });
      onBorrador({ puntos: [], config: { radio } });
      setEstado(`Universos guardados para ${fmt(puntos.length)} puntos`);
      await alGuardar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al calcular universos");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="rounded-lg border border-linea bg-panel2/40 p-4">
      <p className="mb-2 font-mono text-[10px] leading-relaxed text-zinc-500">
        PROXIMIDAD: el universo que está CERCA de tus puntos de venta. Aquí
        no se buscan POIs: <span style={{ color }}>recolecta</span> los
        puntos (buscador o Excel), elige el{" "}
        <span style={{ color }}>radio</span> y{" "}
        <span style={{ color }}>Calcular universos</span> trae la demografía
        cercana — gratis, cero consultas a Google.
      </p>
      <RecolectorPuntos
        puntos={puntos}
        onCambiar={(p) => onBorrador({ ...borrador, puntos: p })}
        disabled={ocupado}
        etiquetaPunto="punto"
        etiquetaPuntos="puntos"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-linea pt-3">
        <input
          value={(cfg.nombre as string) ?? ""}
          onChange={(e) =>
            onBorrador({ ...borrador, config: { ...cfg, nombre: e.target.value } })
          }
          placeholder="Nombre del levantamiento (opcional)"
          className={`${inputCls} max-w-xs`}
        />
        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Radio
        </label>
        <select
          value={radio}
          onChange={(e) =>
            onBorrador({
              ...borrador,
              config: { ...cfg, radio: Number(e.target.value) },
            })
          }
          className={selectCls}
        >
          {RADIOS_CENSO.slice(0, 5).map((r) => (
            <option key={r.m} value={r.m}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          onClick={calcular}
          disabled={ocupado || puntos.length === 0}
          className="rounded-md px-5 py-2 font-display text-xs font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: color }}
        >
          Calcular universos ({fmt(puntos.length)})
        </button>
      </div>
      {estado && <p className="mt-2 font-mono text-[11px] text-cian">⟳ {estado}</p>}
      {error && <p className="mt-2 font-mono text-[11px] text-magenta">{error}</p>}
    </div>
  );
}

// ==================================================================
// SECCIÓN 3 — Competencia (orígenes + qué buscar alrededor)
// ==================================================================

export function SeccionCompetencia({
  proyectoId,
  color,
  borrador,
  onBorrador,
  alGuardar,
}: PropsBase) {
  const origenes = borrador.puntos;
  const cfg = borrador.config;
  const radio = (cfg.radio as number) ?? 5000;
  const categorias = (cfg.categorias as SeleccionCategoria[]) ?? [];
  const terminos = (cfg.terminos as string[]) ?? [];
  const exclusiones = (cfg.exclusiones as string[]) ?? [];
  const separarEnCapas = (cfg.separarEnCapas as boolean) ?? true;
  const setCfg = (extra: Record<string, unknown>) =>
    onBorrador({ ...borrador, config: { ...cfg, ...extra } });

  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  // gate de corridas grandes (umbral configurable en /admin)
  const { gate: gateCorrida, panel: panelAprobacion } = useAprobacionCorrida();

  // depuración inteligente: aquí el survey YA está persistido al
  // terminar la corrida — la revisión aparece antes de darlo por bueno
  // y confirmar borra los intrusos de survey_points y marca universos
  // de la capa + consolidado como desactualizados
  const [sospechosos, setSospechosos] = useState<Sospechoso[] | null>(null);
  const [checksDep, setChecksDep] = useState<Record<string, boolean>>({});
  const [depurandoIA, setDepurandoIA] = useState(false);
  const ctxDepRef = useRef<{
    run: RunPlanner;
    lista: Poi[];
    marca: string;
  } | null>(null);

  async function correrDepuracionIA() {
    const ctx = ctxDepRef.current;
    if (!ctx || ctx.lista.length === 0) return;
    setDepurandoIA(true);
    setError("");
    try {
      const res = await depurarConIA(
        ctx.lista,
        ctx.marca,
        perfilDeGiro(ctx.lista).etiqueta,
        setEstado
      );
      const porId = new Map((sospechosos ?? []).map((s) => [s.placeId, s]));
      for (const s of res) porId.set(s.placeId, s);
      const lista = Array.from(porId.values());
      setSospechosos(lista.length > 0 ? lista : null);
      setChecksDep(
        Object.fromEntries(lista.map((x) => [x.placeId, x.veredicto === "dudoso"]))
      );
      setEstado(
        res.length === 0
          ? "La IA no encontró intrusos: todo el levantamiento pertenece a las marcas"
          : `La IA marcó ${res.length} ${res.length === 1 ? "punto" : "puntos"} — revisa la lista y confirma`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "La depuración con IA falló");
    } finally {
      setDepurandoIA(false);
    }
  }

  /** Confirmación: los NO palomeados se borran del levantamiento
   * persistido; los universos de la capa y el consolidado del proyecto
   * quedan MARCADOS como desactualizados para recalcular. */
  async function confirmarDepuracion() {
    const ctx = ctxDepRef.current;
    if (!ctx || !sospechosos) return;
    const noPertenecen = new Set(
      sospechosos.filter((s) => !checksDep[s.placeId]).map((s) => s.placeId)
    );
    const excluidos = ctx.lista.filter((p) => noPertenecen.has(p.placeId));
    setSospechosos(null);
    setChecksDep({});
    if (excluidos.length === 0) {
      setEstado("Revisión confirmada — todos los puntos se conservan");
      return;
    }
    setOcupado(true);
    setError("");
    try {
      setEstado("Excluyendo los intrusos del levantamiento…");
      await depurarRunPersistido(ctx.run, excluidos);
      ctx.lista = ctx.lista.filter((p) => !noPertenecen.has(p.placeId));
      setEstado(
        `Censo depurado: ${fmt(excluidos.length)} ${excluidos.length === 1 ? "punto excluido" : "puntos excluidos"} — los universos de la capa quedaron desactualizados: recalcúlalos con ⟳ Universo y con "Recalcular consolidado" en el Resumen`
      );
      await alGuardar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar la depuración");
    } finally {
      setOcupado(false);
    }
  }

  // estimador de costo en vivo (con orígenes consolidados por traslape)
  const centros = useMemo(
    () =>
      consolidarCentros(
        origenes.map((p) => ({ lat: p.lat, lng: p.lng })),
        radio
      ),
    [origenes, radio]
  );
  const consultas = centros.length * consultasPorCentroDe(categorias, terminos);

  /** Firma de la corrida: misma config = mismo plan de chunks (la
   * reanudación solo aplica si nada cambió). */
  const etiquetasRun =
    separarEnCapas && categorias.length >= 2
      ? etiquetasDe(categorias)
      : separarEnCapas && terminos.length >= 2
        ? terminos
        : [];
  const firmaRun = JSON.stringify([
    origenes.length,
    radio,
    categoriasParaApi(categorias),
    terminos,
    exclusiones,
    etiquetasRun,
  ]);
  /** Corrida interrumpida REANUDABLE (persistida en el borrador del
   * proyecto: cerrar el navegador no la pierde). */
  interface RunActivo {
    runId: string;
    surveys: [string | null, string][];
    indice: number;
    total: number;
    firma: string;
    /** Solicitud aprobada que autorizó esta corrida (reanudar la reusa). */
    solicitudId?: string;
  }
  const runActivo = cfg.runActivo as RunActivo | undefined;
  const reanudable = !!runActivo && runActivo.firma === firmaRun;

  async function calcular() {
    if (origenes.length === 0) {
      setError("Primero recolecta los orígenes (paso 1)");
      return;
    }
    if (categorias.length === 0 && terminos.length === 0) {
      setError("Elige qué buscar alrededor: una categoría o términos de marca");
      return;
    }
    // reanudar lo ya pagado/aprobado no vuelve a pasar por el gate
    if (reanudable && runActivo) {
      await correr(runActivo.solicitudId);
      return;
    }
    if (consultas > UMBRAL_CONFIRMAR_CONSULTAS && !confirmando) {
      setConfirmando(true);
      return;
    }
    setConfirmando(false);
    setError("");
    // GATE de corridas grandes: bajo el umbral corre igual que siempre;
    // sobre el umbral, admin confirma reforzado y no-admin queda en
    // espera de aprobación (al aprobarse en /admin arranca sola aquí)
    await gateCorrida(
      {
        consultas,
        origen: "planner_competencia",
        titulo: `Competencia · ${
          (cfg.nombre as string)?.trim() ||
          (terminos.length > 0 ? terminos.join(", ") : etiquetasDe(categorias).join(", "))
        } · ${fmt(origenes.length)} orígenes`,
        proyectoId,
        configuracion: {
          proyectoId,
          firmaRun,
          radio,
          categorias: categoriasParaApi(categorias),
          terminos,
          exclusiones,
          origenes: origenes.length,
        },
      },
      (solicitudId) => correr(solicitudId)
    );
  }

  async function correr(solicitudId?: string) {
    setError("");
    setOcupado(true);
    // copia local de la config: el marcador de reanudación se persiste
    // POR CHUNK vía onBorrador (plan_state) sin closures viejos
    const cfgLocal: Record<string, unknown> = { ...cfg };
    let run: RunPlanner | null = null;
    try {
      const etiquetas = etiquetasRun;
      const listaOrigenes: Origin[] = origenes.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        nombre: p.nombre,
        direccion: p.direccion || undefined,
      }));

      // REANUDAR: reconstruir el run guardado y sembrar lo ya pagado
      let semilla: Poi[] = [];
      let desdeLote = 0;
      if (reanudable && runActivo) {
        const surveys = new Map<string | null, string>(runActivo.surveys);
        run = { runId: runActivo.runId, surveys, guardados: new Set() };
        setEstado(
          `Reanudando desde el chunk ${runActivo.indice + 1} de ${runActivo.total} — cargando lo ya guardado…`
        );
        const porSurvey = await cargarPuntosSurveys(Array.from(surveys.values()));
        porSurvey.forEach((puntosSurvey) => {
          for (const p of puntosSurvey) {
            if (!run!.guardados.has(p.placeId)) {
              run!.guardados.add(p.placeId);
              semilla.push(p);
            }
          }
        });
        desdeLote = runActivo.indice;
      } else {
        run = await crearSurveysPlanner(
          { proyectoId, rol: "competencia" },
          etiquetas,
          {
            mode: "origins",
            radius: radio,
            origenes: listaOrigenes,
            categories: categoriasParaApi(categorias),
            nameFilters: terminos,
            excludes: exclusiones,
            nombre:
              (cfg.nombre as string)?.trim() ||
              (terminos.length > 0
                ? terminos.join(" · ")
                : etiquetasDe(categorias).join(" · ")),
          },
          "recoleccion"
        );
      }
      const elRun = run;
      const marcarAvance = (indice: number, total: number) => {
        cfgLocal.runActivo = {
          runId: elRun.runId,
          surveys: Array.from(elRun.surveys.entries()),
          indice,
          total,
          firma: firmaRun,
          solicitudId,
        } satisfies RunActivo;
        onBorrador({ ...borrador, config: { ...cfgLocal } });
      };
      const r = await buscarPorLotes({
        centros,
        radius: radio,
        categorias,
        nameFilters: terminos,
        excludes: exclusiones,
        desdeLote,
        semilla,
        contexto: `planner:competencia · ${terminos.length > 0 ? terminos.join(", ") : etiquetasDe(categorias).join(", ")}`,
        solicitudId,
        onEstado: (t) => setEstado(`Buscando competencia · ${t}`),
        onLote: async (nuevos, lote, total) => {
          // granularidad POR CHUNK: puntos + progreso + marcador de
          // reanudación — un timeout nunca vuelve a dejar 0 puntos
          await guardarPuntosPlanner(elRun, nuevos);
          await actualizarRunPlanner(elRun, {
            progreso: { modo: "origins", indice: lote, total },
          });
          marcarAvance(lote, total);
        },
      });
      if (!r.completa) {
        // quedó a medias (cuota/detenido): el marcador ya apunta al
        // chunk siguiente — Continuar retoma sin repagar
        marcarAvance(r.loteFinal, r.totalLotes);
        await actualizarRunPlanner(elRun, { status: "interrumpido" });
        setEstado(
          `${fmt(r.pois.length)} puntos guardados hasta el chunk ${r.loteFinal} de ${r.totalLotes}`
        );
        setError(
          r.interrupcion
            ? `Interrumpido: ${r.interrupcion} — el avance quedó guardado; "Continuar" retoma donde iba sin repagar`
            : "Búsqueda interrumpida — el avance quedó guardado; \"Continuar\" retoma donde iba"
        );
        await alGuardar();
        return;
      }
      // reasignación: cada POI a su origen más cercano de la lista COMPLETA
      setEstado("Asignando cada punto a su origen más cercano…");
      const buscador = crearBuscadorCercano(listaOrigenes, Math.max(radio * 1.5, 500));
      const lista: Poi[] = r.pois
        .map((p) => {
          const { idx, dist } = buscador(p);
          return { ...p, origenIdx: Math.max(idx, 0), distancia: Math.round(dist) };
        })
        .filter((p) => p.distancia <= radio + 50)
        .sort((a, b) => a.distancia - b.distancia);
      await reescribirPuntosPlanner(elRun, lista);

      // universos POR CAPA: cada marca sobre los buffers de SUS PROPIOS
      // puntos con el radio del análisis (los orígenes solo definen
      // dónde buscar, no el territorio de la capa)
      await guardarUniversosPorCapa(elRun, lista, radio, setEstado);
      await actualizarRunPlanner(elRun, { status: "completado", progreso: null });

      const notas = [
        `${fmt(lista.length)} puntos de competencia`,
        ...(r.excluidos > 0 ? [`${fmt(r.excluidos)} excluidos`] : []),
        ...(r.descartados > 0 ? [`${fmt(r.descartados)} descartados por nombre`] : []),
        ...(etiquetas.length > 1 ? [`${etiquetas.length} capas`] : []),
        `costo ~$${r.consumo.costoMxn.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN`,
        ...(r.consumo.deCache > 0
          ? [`${fmt(r.consumo.deCache)} consultas del caché ($0)`]
          : []),
        ...(r.chunksFallidos.length > 0
          ? [
              `${r.chunksFallidos.length} chunks fallaron tras reintentos (${r.chunksFallidos.slice(0, 4).join(", ")}${r.chunksFallidos.length > 4 ? "…" : ""}) y quedaron fuera`,
            ]
          : []),
      ];
      setEstado(notas.join(" · "));
      // capa 1 de depuración: solo si la corrida buscó MARCAS — la
      // revisión aparece al terminar, antes de dar por bueno el survey
      if (terminos.length > 0) {
        ctxDepRef.current = { run: elRun, lista, marca: terminos.join(", ") };
        const sosp = sospechososPorTipo(lista);
        setSospechosos(sosp.length > 0 ? sosp : null);
        setChecksDep(
          Object.fromEntries(
            sosp.map((x) => [x.placeId, x.veredicto === "dudoso"])
          )
        );
      } else {
        ctxDepRef.current = null;
        setSospechosos(null);
        setChecksDep({});
      }
      // corrida terminada: se limpia el marcador y lo ya censado
      delete cfgLocal.runActivo;
      onBorrador({
        ...borrador,
        config: { ...cfgLocal, terminos: [], categorias: [] },
      });
      await alGuardar();
    } catch (e) {
      if (run) {
        await actualizarRunPlanner(run, { status: "interrumpido" });
      }
      setError(e instanceof Error ? e.message : "Error al buscar competencia");
      setEstado("");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="rounded-lg border border-linea bg-panel2/40 p-4">
      <p className="mb-2 font-mono text-[10px] leading-relaxed text-zinc-500">
        La competencia se define por cercanía a algo:{" "}
        <span style={{ color }}>paso 1</span> recolecta los puntos de
        referencia (típicamente los PDVs del cliente);{" "}
        <span style={{ color }}>paso 2</span> define qué buscar alrededor;{" "}
        <span style={{ color }}>Calcular</span> estima el costo y corre la
        búsqueda por lotes.
      </p>

      <label className={labelCls}>Paso 1 · Orígenes (puntos de referencia)</label>
      <RecolectorPuntos
        puntos={origenes}
        onCambiar={(p) => onBorrador({ ...borrador, puntos: p })}
        disabled={ocupado}
        etiquetaPunto="origen"
        etiquetaPuntos="orígenes"
      />

      <div className="mt-4 space-y-3 border-t border-linea pt-3">
        <div className="flex items-center gap-3">
          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Paso 2 · Radio de cercanía
          </label>
          <select
            value={radio}
            onChange={(e) => setCfg({ radio: Number(e.target.value) })}
            className={selectCls}
          >
            {RADIOS_CENSO.map((r) => (
              <option key={r.m} value={r.m}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Categorías (OR entre ellas)</label>
          <CategoriaBuscador
            selecciones={categorias}
            onCambiar={(c) => setCfg({ categorias: c })}
            opcional
          />
        </div>
        <div>
          <label className={labelCls}>
            Marcas rivales · &quot;comillas&quot; = nombre exacto · comas = varias
          </label>
          <ChipsTerminos
            terminos={terminos}
            onCambiar={(t) => setCfg({ terminos: t })}
            placeholder="p. ej. byd, chirey, geely"
          />
        </div>
        <div>
          <label className={labelCls}>Exclusiones de marca</label>
          <ChipsTerminos
            terminos={exclusiones}
            onCambiar={(t) => setCfg({ exclusiones: t })}
            placeholder="marcas a excluir"
          />
        </div>
        {(categorias.length >= 2 || terminos.length >= 2) && (
          <label className="flex items-center gap-2 font-mono text-[10px] text-zinc-400">
            <input
              type="checkbox"
              checked={separarEnCapas}
              onChange={(e) => setCfg({ separarEnCapas: e.target.checked })}
              className="accent-magenta"
            />
            Separar en capas: un levantamiento por{" "}
            {categorias.length >= 2 ? "categoría" : "marca"}
          </label>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-linea pt-3">
        <input
          value={(cfg.nombre as string) ?? ""}
          onChange={(e) => setCfg({ nombre: e.target.value })}
          placeholder="Nombre del levantamiento (opcional)"
          className={`${inputCls} max-w-xs`}
        />
        <button
          onClick={calcular}
          disabled={ocupado || origenes.length === 0}
          className="rounded-md px-5 py-2 font-display text-xs font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: confirmando ? "#f59e0b" : color }}
        >
          {confirmando
            ? `Confirmar ~${fmt(consultas)} consultas`
            : reanudable && runActivo
              ? `Continuar (chunk ${runActivo.indice + 1} de ${runActivo.total})`
              : "Calcular"}
        </button>
        {origenes.length > 0 && (
          <span className="font-mono text-[10px] text-zinc-500">
            {fmt(origenes.length)} orígenes
            {centros.length < origenes.length
              ? ` → ${fmt(centros.length)} centros (traslapes consolidados)`
              : ""}{" "}
            · ≈ {fmt(consultas)} consultas a Google
          </span>
        )}
        {confirmando && (
          <button
            onClick={() => setConfirmando(false)}
            className="font-mono text-[10px] text-zinc-500 underline decoration-dotted"
          >
            cancelar
          </button>
        )}
        {/* capa 2 bajo demanda cuando la capa 1 no marcó nada */}
        {!sospechosos && ctxDepRef.current && ctxDepRef.current.lista.length > 0 && (
          <button
            onClick={correrDepuracionIA}
            disabled={depurandoIA || ocupado}
            title="Revisa con IA si cada punto pertenece realmente a las marcas censadas (falsos positivos de otro giro)"
            className="rounded-md border border-violeta/60 bg-violeta/10 px-3 py-1.5 font-mono text-[11px] text-violeta transition-colors hover:bg-violeta/20 disabled:opacity-40"
          >
            {depurandoIA ? "Depurando…" : "Depurar con IA"}
          </button>
        )}
      </div>

      {/* gate de corridas grandes: confirmación de admin / en espera */}
      {panelAprobacion}

      {/* revisión de la depuración del levantamiento recién corrido */}
      {sospechosos && (
        <PanelDepuracion
          sospechosos={sospechosos}
          checks={checksDep}
          onCheck={(id, v) => setChecksDep((prev) => ({ ...prev, [id]: v }))}
          onConfirmar={confirmarDepuracion}
          onConservar={() => {
            setSospechosos(null);
            setChecksDep({});
          }}
          onDepurarIA={correrDepuracionIA}
          depurandoIA={depurandoIA}
          ocupado={ocupado}
          nPois={ctxDepRef.current?.lista.length ?? 0}
        />
      )}
      {estado && <p className="mt-2 font-mono text-[11px] text-cian">⟳ {estado}</p>}
      {error && <p className="mt-2 font-mono text-[11px] text-magenta">{error}</p>}
    </div>
  );
}

// ==================================================================
// SECCIÓN 4 — OOH (PDVs + radio + filtros → cruce local)
// ==================================================================

export function SeccionOoh({
  proyectoId,
  color,
  borrador,
  onBorrador,
  alGuardar,
  surveysFuente,
}: PropsBase & {
  /** Levantamientos del proyecto usables como fuente de PDVs. */
  surveysFuente: { id: string; nombre: string; puntos: number }[];
}) {
  const pdvs = borrador.puntos;
  const cfg = borrador.config;
  const radioKm = (cfg.radioKm as number) ?? 6;
  const radioDiferenciado = (cfg.radioDiferenciado as boolean) ?? false;
  const radioUrbanoKm = (cfg.radioUrbanoKm as number) ?? 6;
  const radioForaneoKm = (cfg.radioForaneoKm as number) ?? 15;
  const fTipos = useMemo(() => (cfg.tipos as string[]) ?? [], [cfg.tipos]);
  const fCiudades = useMemo(
    () => (cfg.ciudades as string[]) ?? [],
    [cfg.ciudades]
  );
  const fDigital = (cfg.digital as "todas" | "digital" | "estatica") ?? "todas";
  const setCfg = (extra: Record<string, unknown>) =>
    onBorrador({ ...borrador, config: { ...cfg, ...extra } });

  const [pantallas, setPantallas] = useState<Pantalla[]>([]);
  const [inventarioCargado, setInventarioCargado] = useState(false);
  const [estado, setEstado] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [resumen, setResumen] = useState<{
    pantallas: number;
    cubiertos: number;
    total: number;
    impresiones: number | null;
  } | null>(null);

  // inventario de pantallas (Supabase, paginado — gratis)
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const todas: Pantalla[] = [];
      for (let desde = 0; ; desde += 1000) {
        const { data, error: e } = await supabase
          .from("screens")
          .select(
            "clave, nombre, tipo, medio, ciudad, digital, impresiones, costo, direccion, lote, lat, lng"
          )
          .order("clave")
          .range(desde, desde + 999);
        if (e) {
          setError(`No pude leer el inventario: ${e.message}`);
          break;
        }
        todas.push(...((data ?? []) as Pantalla[]));
        if (!data || data.length < 1000) break;
      }
      setPantallas(todas);
      setInventarioCargado(true);
    })();
  }, []);

  const tiposDisponibles = useMemo(
    () => CLAVES_TIPO_PANTALLA.filter((t) => pantallas.some((p) => p.tipo === t)),
    [pantallas]
  );
  const ciudadesDisponibles = useMemo(
    () =>
      Array.from(
        new Set(pantallas.map((p) => p.ciudad?.trim()).filter(Boolean))
      ).sort() as string[],
    [pantallas]
  );
  const pantallasFiltradas = useMemo(
    () =>
      pantallas.filter(
        (p) =>
          (fTipos.length === 0 || fTipos.includes(p.tipo)) &&
          (fCiudades.length === 0 || fCiudades.includes(p.ciudad?.trim() ?? "")) &&
          (fDigital === "todas" ||
            (fDigital === "digital" ? p.digital === true : p.digital === false))
      ),
    [pantallas, fTipos, fCiudades, fDigital]
  );

  async function usarSurvey(id: string) {
    const fuente = surveysFuente.find((s) => s.id === id);
    if (!fuente) return;
    setOcupado(true);
    try {
      const mapa = await cargarPuntosSurveys([id]);
      const nuevos = (mapa.get(id) ?? []).map((p) => ({
        ...p,
        via: "proyecto" as const,
      }));
      const { lista, duplicados } = sumarPuntos(pdvs, nuevos);
      onBorrador({ ...borrador, puntos: lista });
      setEstado(
        `${fmt(nuevos.length - duplicados)} PDVs de "${fuente.nombre}"${duplicados > 0 ? ` · ${fmt(duplicados)} ya estaban` : ""}`
      );
    } catch {
      setError("No pude cargar los puntos de ese levantamiento");
    } finally {
      setOcupado(false);
    }
  }

  async function encontrarPantallas() {
    if (pdvs.length === 0) {
      setError("Primero recolecta los PDVs del cliente");
      return;
    }
    if (pantallasFiltradas.length === 0) {
      setError(
        pantallas.length === 0
          ? "No hay inventario de pantallas — cárgalo en Admin"
          : "Los filtros dejan 0 pantallas — quita alguno"
      );
      return;
    }
    setError("");
    setOcupado(true);
    setEstado("Cruzando pantallas × PDVs (local, gratis)…");
    try {
      const listaPdvs: Origin[] = pdvs.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        nombre: p.nombre,
        direccion: p.direccion || undefined,
      }));
      const radioDe = radioDiferenciado
        ? (p: Pantalla) =>
            (esZmvm(p.lat, p.lng) ? radioUrbanoKm : radioForaneoKm) * 1000
        : () => radioKm * 1000;
      const cruces = cruzarPantallasPdvs(pantallasFiltradas, listaPdvs, radioDe);
      const enPlan = cruces.filter((c) => c.pdvs.length > 0);
      const cubiertos = pdvsCubiertos(cruces).size;
      const impresiones = enPlan.some((c) => c.pantalla.impresiones != null)
        ? enPlan.reduce((t, c) => t + (c.pantalla.impresiones ?? 0), 0)
        : null;
      if (enPlan.length === 0) {
        setEstado("");
        setError(
          `Ninguna pantalla del inventario cae a ${radioDiferenciado ? `${radioUrbanoKm}/${radioForaneoKm}` : radioKm} km de tus PDVs — prueba con un radio mayor`
        );
        return;
      }
      setEstado("Guardando el cruce en el proyecto…");
      const run = await crearSurveysPlanner(
        { proyectoId, rol: "ooh" },
        [null],
        {
          mode: "ooh",
          radioKm,
          radioDiferenciado,
          radioUrbanoKm,
          radioForaneoKm,
          tipos: fTipos,
          ciudades: fCiudades,
          medios: [],
          digital: fDigital,
          totalPdvs: listaPdvs.length,
          pantallas: enPlan.length,
          cubiertos,
          sinCobertura: listaPdvs.length - cubiertos,
          impresiones,
          nombre:
            (cfg.nombre as string)?.trim() ||
            `Cruce OOH · ${enPlan.length} pantallas × ${listaPdvs.length} PDVs`,
        },
        "inventario"
      );
      await insertarPuntosCrudos(run, filasCruceSurvey(enPlan, listaPdvs, etiquetaOrigen));
      await actualizarRunPlanner(run, { status: "completado", progreso: null });
      setResumen({
        pantallas: enPlan.length,
        cubiertos,
        total: listaPdvs.length,
        impresiones,
      });
      setEstado("");
      await alGuardar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cruzar pantallas");
      setEstado("");
    } finally {
      setOcupado(false);
    }
  }

  const chip = (activo: boolean) =>
    `rounded-full border px-2.5 py-0.5 font-mono text-[10px] transition-colors ${
      activo
        ? "border-[#ff8c42] bg-[#ff8c42]/15 text-[#ff8c42]"
        : "border-linea bg-panel2 text-zinc-500 hover:text-zinc-300"
    }`;
  const alternarLista = (lista: string[], valor: string) =>
    lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];

  return (
    <div className="rounded-lg border border-linea bg-panel2/40 p-4">
      <p className="mb-2 font-mono text-[10px] leading-relaxed text-zinc-500">
        <span style={{ color }}>Recolecta</span> los PDVs del cliente
        (buscador, Excel o un levantamiento del proyecto), elige{" "}
        <span style={{ color }}>radio y filtros</span>, y{" "}
        <span style={{ color }}>Encontrar pantallas cercanas</span> corre el
        cruce contra el inventario — local y gratis — y lo guarda en el plan.
      </p>

      <RecolectorPuntos
        puntos={pdvs}
        onCambiar={(p) => onBorrador({ ...borrador, puntos: p })}
        disabled={ocupado}
        etiquetaPunto="PDV"
        etiquetaPuntos="PDVs"
        extraVias={
          surveysFuente.length > 0 ? (
            <select
              value=""
              onChange={(e) => e.target.value && usarSurvey(e.target.value)}
              className={selectCls}
              disabled={ocupado}
            >
              <option value="">usar puntos de un levantamiento…</option>
              {surveysFuente.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} ({fmt(s.puntos)})
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      <div className="mt-4 space-y-3 border-t border-linea pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Radio de cruce
          </label>
          {!radioDiferenciado && (
            <select
              value={radioKm}
              onChange={(e) => setCfg({ radioKm: Number(e.target.value) })}
              className={selectCls}
            >
              {[3, 5, 6, 10, 15].map((km) => (
                <option key={km} value={km}>
                  {km} km
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
            <input
              type="checkbox"
              checked={radioDiferenciado}
              onChange={(e) => setCfg({ radioDiferenciado: e.target.checked })}
              className="accent-[#ff8c42]"
            />
            diferenciado urbano / foráneo
          </label>
          {radioDiferenciado && (
            <>
              <select
                value={radioUrbanoKm}
                onChange={(e) => setCfg({ radioUrbanoKm: Number(e.target.value) })}
                className={selectCls}
                title="ZMVM"
              >
                {[3, 5, 6, 10].map((km) => (
                  <option key={km} value={km}>
                    ZMVM {km} km
                  </option>
                ))}
              </select>
              <select
                value={radioForaneoKm}
                onChange={(e) => setCfg({ radioForaneoKm: Number(e.target.value) })}
                className={selectCls}
                title="Foráneo"
              >
                {[6, 10, 15, 20].map((km) => (
                  <option key={km} value={km}>
                    foráneo {km} km
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {tiposDisponibles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Tipo
            </span>
            {tiposDisponibles.map((t) => (
              <button
                key={t}
                onClick={() => setCfg({ tipos: alternarLista(fTipos, t) })}
                className={chip(fTipos.includes(t))}
              >
                {etiquetaTipoPantalla(t)}
              </button>
            ))}
          </div>
        )}
        {ciudadesDisponibles.length > 1 && (
          <div className="flex max-h-16 flex-wrap items-center gap-1.5 overflow-y-auto">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Ciudad
            </span>
            {ciudadesDisponibles.map((c) => (
              <button
                key={c}
                onClick={() => setCfg({ ciudades: alternarLista(fCiudades, c) })}
                className={chip(fCiudades.includes(c))}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Medio
          </span>
          {(["todas", "digital", "estatica"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setCfg({ digital: d })}
              className={chip(fDigital === d)}
            >
              {d === "todas" ? "todas" : d === "digital" ? "digitales" : "estáticas"}
            </button>
          ))}
          <span className="ml-2 font-mono text-[10px] text-zinc-600">
            {inventarioCargado
              ? `${fmt(pantallasFiltradas.length)} de ${fmt(pantallas.length)} pantallas pasan los filtros`
              : "cargando inventario…"}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-linea pt-3">
        <input
          value={(cfg.nombre as string) ?? ""}
          onChange={(e) => setCfg({ nombre: e.target.value })}
          placeholder="Nombre del cruce (opcional)"
          className={`${inputCls} max-w-xs`}
        />
        <button
          onClick={encontrarPantallas}
          disabled={ocupado || pdvs.length === 0 || !inventarioCargado}
          className="rounded-md px-5 py-2 font-display text-xs font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: color }}
          title="Cruce local por Haversine: 0 consultas a Google"
        >
          Encontrar pantallas cercanas
        </button>
      </div>
      {resumen && (
        <p className="mt-2 font-mono text-[11px] text-zinc-300">
          <span style={{ color }}>{fmt(resumen.pantallas)} pantallas</span> apoyan
          a {fmt(resumen.cubiertos)} de {fmt(resumen.total)} PDVs
          {resumen.total - resumen.cubiertos > 0 && (
            <span className="text-magenta">
              {" "}
              · {fmt(resumen.total - resumen.cubiertos)} sin cobertura
            </span>
          )}
          {resumen.impresiones != null &&
            ` · ${fmt(resumen.impresiones)} impresiones/mes`}{" "}
          — guardado en el plan (las líneas se ven en el mapa de abajo).
        </p>
      )}
      {estado && <p className="mt-2 font-mono text-[11px] text-cian">⟳ {estado}</p>}
      {error && <p className="mt-2 font-mono text-[11px] text-magenta">{error}</p>}
    </div>
  );
}
