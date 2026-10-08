"use client";

// Modo PLANNER de un proyecto (F2 — levantamientos con rol): las
// secciones POI (puntos propios) y Competencia usan el MISMO buscador
// del modo consulta (ruta /planner/[id]/levantar/[rol]) y aquí se
// listan sus levantamientos guardados: ver en mapa, reanudar los
// interrumpidos (continúan donde quedaron, sin repagar), re-correr,
// renombrar y eliminar. El mapa del proyecto pinta TODOS los
// levantamientos visibles con color por ROL; el panel demográfico
// muestra el universo del levantamiento seleccionado (la consolidación
// llega en F4). plan_state recuerda la sección activa y la visibilidad.
// Proximidad y OOH llegan en F3; el export de proyecto en F5.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppHeader from "./AppHeader";
import ExportarProyecto from "./ExportarProyecto";
import ResumenProyecto from "./ResumenProyecto";
import UniversosPanel from "./UniversosPanel";
import {
  BORRADOR_VACIO,
  SeccionCompetencia,
  SeccionOoh,
  SeccionProximidad,
  type BorradorSeccion,
} from "./PlannerRecolectar";
import type { PuntoRecolectado } from "./RecolectorPuntos";
import type { TacticaClave } from "@/lib/tacticas";
import {
  calcularDetallePorPuntoSurvey,
  cargarDescartados,
  cargarPuntosCrudosSurvey,
  cargarPuntosSurveys,
  colorCapaEstable,
  contarDescartados,
  dividirSurveyEnCapas,
  ETIQUETA_REVISAR,
  ETIQUETA_ROL,
  deduplicarEntreSurveys,
  geocercasDeSurvey,
  moverSurveyARol,
  NOTA_DETALLE_PUNTO,
  radioDetalleDe,
  rescatarDescartados,
  type DescarteGuardado,
  type PuntoSurvey,
} from "@/lib/planner";
import { reFiltrarRun } from "@/lib/refiltrado";
import { circlePolygon } from "@/lib/geo";
import PanelDescartados from "./PanelDescartados";
import PlannerGeotargeting, {
  type SurveyGeoGuardado,
} from "./PlannerGeotargeting";
import type { ConfigGeotargeting, CpCobertura } from "@/lib/geotargeting";
import { marcaNormalizada } from "@/lib/marcas";
import { MensajeError } from "./ui";
import { ChipsTerminos } from "./PlannerRecolectar";
import { calcularUniversosCliente } from "@/lib/universos-lotes";
import { createClient } from "@/lib/supabase/client";
import type {
  LatLng,
  PerfilUsuario,
  Poi,
  Proyecto,
  RolLevantamiento,
  Universos,
} from "@/lib/types";
import type { CapaProyecto } from "./PlannerMapa";

// El Buscador completo de siempre (censo por ciudad, celdas hex/cuadradas,
// marca/territorial/CP/zona, DENUE/Google, filtros, depuración, exports de
// geocercas), EMBEBIDO como la sección "Puntos de interés" del plan: sus
// corridas son levantamientos rol 'poi_propio', movibles a cualquier
// sección sin re-pagar.
const SeekerEmbebido = dynamic(() => import("./SeekerApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[76vh] min-h-[560px] items-center justify-center font-mono text-xs text-zinc-600">
      Cargando el buscador…
    </div>
  ),
});

const PlannerMapa = dynamic(() => import("./PlannerMapa"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-600">
      Cargando mapa…
    </div>
  ),
});


type SeccionPlanner = RolLevantamiento | "exportar" | "resumen";

interface SurveyFila {
  id: string;
  rol: RolLevantamiento;
  fuente: string | null;
  configuracion: Record<string, unknown>;
  status: "en_progreso" | "completado" | "interrumpido";
  progreso: Record<string, unknown> | null;
  created_at: string;
  survey_points: { count: number }[];
  survey_universes: { resultados: Universos }[];
}

const SECCIONES: {
  clave: SeccionPlanner;
  nombre: string;
  descriptor: string;
  color: string;
  activa: boolean;
  fase: string;
  detalle: string;
}[] = [
  {
    clave: "resumen",
    nombre: "Resumen del proyecto",
    descriptor: "Universo consolidado y traslapes",
    color: "#f7d154",
    activa: true,
    fase: "",
    detalle: "",
  },
  {
    // El Buscador de siempre, renombrado: "Puntos de interés" ES el
    // buscador completo embebido — sus levantamientos nacen con rol
    // poi_propio y se mueven a Competencia/Proximidad sin re-pagar
    clave: "poi_propio",
    nombre: "Puntos de interés",
    descriptor: "Busca, carga y censa los puntos del plan",
    color: "#2fb9e8",
    activa: true,
    fase: "",
    detalle: "",
  },
  {
    clave: "proximidad",
    nombre: "Proximidad",
    descriptor: "El universo cerca de tus puntos de venta",
    color: "#9d5cf0",
    activa: true,
    fase: "",
    detalle: "",
  },
  {
    clave: "competencia",
    nombre: "Competencia",
    descriptor: "Qué hay alrededor de tus orígenes",
    color: "#f4368a",
    activa: true,
    fase: "",
    detalle: "",
  },
  {
    clave: "ooh",
    nombre: "OOH",
    descriptor: "Pantallas × puntos de venta",
    color: "#ff8c42",
    activa: true,
    fase: "",
    detalle: "",
  },
  {
    clave: "geotargeting",
    nombre: "Geo-Targeting",
    descriptor: "CPs de cobertura + bulk de keywords para el DSP",
    color: "#2dd4bf",
    activa: true,
    fase: "",
    detalle: "",
  },
  {
    clave: "exportar",
    nombre: "Exportar",
    descriptor: "El plan completo (PDF + Excel)",
    color: "#34d399",
    activa: true,
    fase: "",
    detalle: "",
  },
];

const fmt = (n: number) => n.toLocaleString("es-MX");

/** Tabla por PDV (Proximidad): universo 18+ individual, NSE dominante
 * y % del universo — la base de la asignación de presupuesto por
 * tienda, ordenable por universo. */
function TablaDetallePorPunto({
  surveyId,
  refresco,
}: {
  surveyId: string;
  refresco: number;
}) {
  const [filas, setFilas] = useState<PuntoSurvey[] | null>(null);
  const [desc, setDesc] = useState(true);
  useEffect(() => {
    let vivo = true;
    setFilas(null);
    (async () => {
      const crudos = await cargarPuntosCrudosSurvey(surveyId);
      if (vivo) setFilas(crudos);
    })();
    return () => {
      vivo = false;
    };
  }, [surveyId, refresco]);

  if (filas === null) {
    return (
      <p className="font-body text-[11px] text-texto-terciario">
        Cargando detalle por punto…
      </p>
    );
  }
  const conDato = filas.filter((f) => f.universo_individual != null);
  if (conDato.length === 0) {
    return (
      <p className="font-body text-[11px] text-texto-terciario">
        Sin detalle por punto todavía — usa el botón «Detalle por punto» del
        levantamiento (PostGIS propio, gratis, sin re-pagar consultas).
      </p>
    );
  }
  const suma = conDato.reduce((t, f) => t + (f.universo_individual ?? 0), 0);
  const orden = [...filas].sort((a, b) =>
    desc
      ? (b.universo_individual ?? -1) - (a.universo_individual ?? -1)
      : (a.universo_individual ?? Number.MAX_SAFE_INTEGER) -
        (b.universo_individual ?? Number.MAX_SAFE_INTEGER)
  );
  return (
    <div>
      <div className="max-h-56 overflow-y-auto rounded-control border border-linea">
        <table className="w-full text-left font-body text-xs">
          <thead className="sticky top-0 bg-panel2 text-texto-terciario">
            <tr>
              <th className="px-3 py-1.5 font-medium">PDV</th>
              <th className="px-3 py-1.5 text-right font-medium">
                <button
                  onClick={() => setDesc((d) => !d)}
                  className="hover:text-texto-primario"
                  title="Ordenar por universo"
                >
                  Universo 18+ individual {desc ? "▾" : "▴"}
                </button>
              </th>
              <th className="px-3 py-1.5 text-right font-medium">NSE</th>
              <th className="px-3 py-1.5 text-right font-medium">% del universo</th>
            </tr>
          </thead>
          <tbody className="text-texto-primario">
            {orden.map((f) => (
              <tr key={f.place_id} className="border-t border-linea/60">
                <td className="max-w-[280px] truncate px-3 py-1.5">{f.nombre}</td>
                <td className="px-3 py-1.5 text-right font-mono text-cian">
                  {f.universo_individual != null
                    ? fmt(f.universo_individual)
                    : "—"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-violeta">
                  {f.nse_dominante ?? "—"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-texto-secundario">
                  {f.universo_individual != null && suma > 0
                    ? `${((100 * f.universo_individual) / suma).toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 font-body text-[10px] leading-relaxed text-texto-terciario">
        Suma de individuales: <span className="font-mono">{fmt(suma)}</span> ·{" "}
        {NOTA_DETALLE_PUNTO}
      </p>
    </div>
  );
}

export default function PlannerView({
  usuario,
  proyectoId,
}: {
  usuario: PerfilUsuario | null;
  proyectoId: string;
}) {
  const router = useRouter();
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [surveys, setSurveys] = useState<SurveyFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // FUSIÓN: Puntos de interés es la primera sección y el default.
  // ?seccion=buscador|exploracion (ligas del Buscador viejo) redirige
  // a la sección fusionada aunque plan_state recuerde otra.
  const searchParams = useSearchParams();
  const forzarBuscador =
    searchParams.get("seccion") === "buscador" ||
    searchParams.get("seccion") === "exploracion" ||
    searchParams.get("seccion") === "poi";
  const [seccion, setSeccion] = useState<SeccionPlanner>("poi_propio");
  /** Visibilidad por survey en el mapa (default: visible). */
  const [visibles, setVisibles] = useState<Record<string, boolean>>({});
  /** Tácticas marcadas del proyecto (persisten en plan_state; null =
   * default por capas presentes, calculado en Exportar). */
  const [tacticasPlan, setTacticasPlan] = useState<TacticaClave[] | null>(null);
  /** Borradores de recolección por sección (puntos agregados sin
   * calcular todavía) — persisten en plan_state: cerrar y reabrir el
   * proyecto no pierde la lista armada. */
  const [borradores, setBorradores] = useState<
    Record<string, BorradorSeccion>
  >({});
  const [puntosCache, setPuntosCache] = useState<Record<string, Poi[]>>({});
  /** Crudos con metadata (cruces OOH: relaciones pantalla→PDV). */
  const [crudosCache, setCrudosCache] = useState<Record<string, PuntoSurvey[]>>({});
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  /** Cobertura de CPs del Geo-Targeting (polígonos en el mapa). */
  const [coberturaGeo, setCoberturaGeo] = useState<CpCobertura[] | null>(null);
  const [foco, setFoco] = useState<LatLng | null>(null);
  const [confirmando, setConfirmando] = useState<{
    accion: "eliminar" | "recorrer" | "dividir";
    id: string;
  } | null>(null);
  /** División de un survey mezclado en capas por marca (progreso). */
  const [dividiendo, setDividiendo] = useState<{ id: string; texto: string } | null>(null);
  const [avisoDivision, setAvisoDivision] = useState<{
    tipo: "ok" | "error";
    texto: string;
  } | null>(null);
  // descartados persistidos (ya pagados): conteo por survey, panel de
  // rescate y re-filtrado sin consultas nuevas
  const [descPorSurvey, setDescPorSurvey] = useState<Record<string, number>>({});
  const [panelDesc, setPanelDesc] = useState<{
    survey: SurveyFila;
    filas: DescarteGuardado[];
  } | null>(null);
  const [conservandoDesc, setConservandoDesc] = useState(false);
  const [refiltro, setRefiltro] = useState<{
    survey: SurveyFila;
    terminos: string[];
    exclusiones: string[];
  } | null>(null);
  const [refiltrando, setRefiltrando] = useState<string | null>(null);
  const [renombrando, setRenombrando] = useState<{ id: string; texto: string } | null>(null);
  const estadoListoRef = useRef(false);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data: p, error: e } = await supabase
      .from("projects")
      .select(
        "id, nombre_cliente, titulo, creado_por, status, created_at, updated_at, profiles(email, nombre)"
      )
      .eq("id", proyectoId)
      .maybeSingle();
    if (e || !p) {
      setError(e?.message ?? "Este plan no existe (¿fue eliminado?)");
      setCargando(false);
      return;
    }
    setProyecto(p as unknown as Proyecto);
    const { data: s } = await supabase
      .from("surveys")
      .select(
        "id, rol, fuente, configuracion, status, progreso, created_at, survey_points(count), survey_universes(resultados)"
      )
      .eq("project_id", proyectoId)
      .order("created_at", { ascending: false });
    setSurveys(((s ?? []) as unknown as SurveyFila[]) ?? []);
    // conteo de descartados persistidos (badge "Descartados (N)")
    if (s && s.length > 0) {
      setDescPorSurvey(await contarDescartados(s.map((x) => (x as { id: string }).id)));
    }
    // estado de UI del plan (sección activa + visibilidad de capas)
    if (!estadoListoRef.current) {
      const { data: ps } = await supabase
        .from("plan_state")
        .select("estado")
        .eq("project_id", proyectoId)
        .maybeSingle();
      const estado = (ps?.estado ?? {}) as {
        seccion?: SeccionPlanner;
        visibles?: Record<string, boolean>;
        tacticas?: TacticaClave[];
        borradores?: Record<string, BorradorSeccion>;
      };
      if (estado.seccion && !forzarBuscador) {
        // plan_state guardado antes de la fusión Buscador+POIs
        setSeccion(
          (estado.seccion as string) === "exploracion"
            ? "poi_propio"
            : estado.seccion
        );
      }
      if (estado.visibles) setVisibles(estado.visibles);
      if (estado.tacticas) setTacticasPlan(estado.tacticas);
      if (estado.borradores) setBorradores(estado.borradores);
      estadoListoRef.current = true;
    }
    setCargando(false);
  }, [proyectoId, forzarBuscador]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // persistir la vista (sección + visibilidad) en plan_state
  useEffect(() => {
    if (!estadoListoRef.current || cargando) return;
    const timer = setTimeout(async () => {
      const supabase = createClient();
      await supabase
        .from("plan_state")
        .upsert(
          {
            project_id: proyectoId,
            estado: {
              seccion,
              visibles,
              ...(tacticasPlan ? { tacticas: tacticasPlan } : {}),
              // borradores acotados: listas gigantes se recortan a 3000
              // puntos por sección para no inflar plan_state
              borradores: Object.fromEntries(
                Object.entries(borradores)
                  .filter(
                    ([, b]) =>
                      b.puntos.length > 0 || Object.keys(b.config).length > 0
                  )
                  .map(([k, b]) => [k, { ...b, puntos: b.puntos.slice(0, 3000) }])
              ),
            },
          },
          { onConflict: "project_id" }
        );
    }, 600);
    return () => clearTimeout(timer);
  }, [seccion, visibles, tacticasPlan, borradores, proyectoId, cargando]);

  const esVisible = (id: string) => visibles[id] !== false;

  // puntos de los surveys visibles (cache por survey; los cruces OOH
  // se cargan CRUDOS para redibujar sus líneas pantalla→PDV)
  useEffect(() => {
    const faltan = surveys
      .filter(
        (s) => esVisible(s.id) && !(s.id in puntosCache) && !(s.id in crudosCache)
      )
      .map((s) => ({ id: s.id, rol: s.rol }));
    if (faltan.length === 0) return;
    (async () => {
      const normales = faltan.filter((f) => f.rol !== "ooh").map((f) => f.id);
      if (normales.length > 0) {
        const mapa = await cargarPuntosSurveys(normales);
        setPuntosCache((prev) => {
          const nuevo = { ...prev };
          mapa.forEach((pts, id) => (nuevo[id] = pts));
          return nuevo;
        });
      }
      for (const f of faltan.filter((x) => x.rol === "ooh")) {
        const crudos = await cargarPuntosCrudosSurvey(f.id);
        setCrudosCache((prev) => ({ ...prev, [f.id]: crudos }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveys, visibles]);

  // FUSIÓN: los levantamientos de exploración viven en Puntos de
  // interés (los existentes se migraron a 'poi_propio' en BD; este
  // fallback cubre cualquier rezagado sin perder nada)
  const porRol = (rol: RolLevantamiento) =>
    surveys.filter(
      (s) =>
        s.rol === rol || (rol === "poi_propio" && s.rol === "exploracion")
    );
  const nombreDe = (s: SurveyFila) =>
    (s.configuracion?.nombre as string) ?? ETIQUETA_ROL[s.rol];
  const puntosDe = (s: SurveyFila) => s.survey_points?.[0]?.count ?? 0;
  const universoDe = (s: SurveyFila): Universos | null =>
    s.survey_universes?.[0]?.resultados ?? null;
  /** Color estable por capa: hash del NOMBRE sobre la paleta del rol —
   * la misma marca se pinta igual en todas las plazas y exports. */
  const colorDe = (s: SurveyFila) => colorCapaEstable(s.rol, nombreDe(s));

  // lo RECOLECTADO (sin calcular todavía) se pinta en vivo en el mapa
  const capasBorrador: CapaProyecto[] = SECCIONES.filter(
    (sec) =>
      sec.clave !== "exportar" &&
      sec.clave !== "resumen" &&
      (borradores[sec.clave]?.puntos.length ?? 0) > 0
  ).map((sec) => ({
    id: `borrador-${sec.clave}`,
    nombre: `Recolectando · ${sec.nombre}`,
    color: sec.color,
    puntos: (borradores[sec.clave]?.puntos ?? []).map((p) => ({
      lat: p.lat,
      lng: p.lng,
      nombre: p.nombre,
      direccion: p.direccion,
    })),
  }));

  const capasSurveys: CapaProyecto[] = surveys
    .filter(
      (s) =>
        esVisible(s.id) &&
        ((puntosCache[s.id]?.length ?? 0) > 0 ||
          (crudosCache[s.id]?.length ?? 0) > 0)
    )
    .map((s) => {
      if (s.rol === "ooh") {
        const crudos = crudosCache[s.id] ?? [];
        return {
          id: s.id,
          nombre: `${nombreDe(s)} · ${ETIQUETA_ROL[s.rol]}`,
          color: colorDe(s),
          cuadrados: true,
          puntos: crudos.map((p) => ({
            lat: p.lat,
            lng: p.lng,
            nombre: p.nombre,
            direccion: p.direccion,
          })),
          lineas: crudos.flatMap((p) =>
            (
              (p.metadata?.pdvs as
                | { lat: number; lng: number }[]
                | undefined) ?? []
            ).map((rel) => ({
              a: { lat: p.lat, lng: p.lng },
              b: { lat: rel.lat, lng: rel.lng },
            }))
          ),
        };
      }
      return {
        id: s.id,
        nombre: `${nombreDe(s)} · ${ETIQUETA_ROL[s.rol]}`,
        color: colorDe(s),
        puntos: (puntosCache[s.id] ?? []).map((p) => ({
          lat: p.lat,
          lng: p.lng,
          nombre: p.nombre,
          direccion: p.direccion,
        })),
      };
    });

  const capaGeo: CapaProyecto[] =
    coberturaGeo && coberturaGeo.length > 0
      ? [
          {
            id: "geotargeting-cobertura",
            nombre: `Geo-Targeting · ${coberturaGeo.length} CPs`,
            color: "#2dd4bf",
            puntos: [],
            poligonos: coberturaGeo
              .filter((c) => c.geometria)
              .map((c) => ({
                nombre: `CP ${c.codigo_postal}`,
                detalle:
                  [c.municipio, (c.colonias ?? []).slice(0, 2).join(", ")]
                    .filter(Boolean)
                    .join(" · ") || undefined,
                geometria: c.geometria!,
                bbox: c.bbox,
              })),
          },
        ]
      : [];
  const capasMapa: CapaProyecto[] = [...capasSurveys, ...capasBorrador, ...capaGeo];

  const surveySeleccionado = surveys.find((s) => s.id === seleccionado) ?? null;
  const universoSeleccionado = surveySeleccionado
    ? universoDe(surveySeleccionado)
    : null;

  /** Estado del recálculo de universo de un survey (fix: cada capa
   * sobre la geometría de SUS PROPIOS puntos). */
  const [recalculando, setRecalculando] = useState<{
    id: string;
    texto: string;
  } | null>(null);

  /** Recalcula el universo de UN levantamiento con la geometría
   * correcta de su capa (geocercasDeSurvey post-fix: competencia usa
   * sus propios puntos, no los orígenes de la búsqueda) — la migración
   * de los surveys existentes afectados. */
  async function recalcularUniverso(s: SurveyFila) {
    setError("");
    setRecalculando({ id: s.id, texto: "cargando puntos…" });
    try {
      const crudos = await cargarPuntosCrudosSurvey(s.id);
      const geocercas = geocercasDeSurvey(s, crudos);
      if (geocercas.length === 0) {
        setError("Este levantamiento no tiene geometría para calcular universos");
        return;
      }
      const u = await calcularUniversosCliente(
        geocercas,
        `recalculado sobre ${geocercas.length.toLocaleString("es-MX")} geocercas propias de la capa`,
        {
          onProgreso: (lote, total) =>
            setRecalculando({ id: s.id, texto: `lote ${lote + 1} de ${total}…` }),
        }
      );
      if (!u.disponible) {
        setError(u.mensaje ?? "Universos no disponibles para esta capa");
        return;
      }
      const supabase = createClient();
      await supabase.from("survey_universes").delete().eq("survey_id", s.id);
      await supabase.from("survey_universes").insert({
        survey_id: s.id,
        resultados: { ...u, porAgeb: undefined, agebsGeo: undefined },
      });
      // el universo ya corresponde al censo depurado: se quita la marca
      if (s.configuracion?.universos_desactualizados) {
        const cfgLimpia = { ...s.configuracion };
        delete cfgLimpia.universos_desactualizados;
        await supabase
          .from("surveys")
          .update({ configuracion: cfgLimpia })
          .eq("id", s.id);
      }
      await cargar();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error al recalcular el universo"
      );
    } finally {
      setRecalculando(null);
    }
  }

  /** Marca(s) DEL CLIENTE en este proyecto: términos de los POIs
   * propios + nombre del cliente — se pre-cargan como exclusión
   * sugerida en Competencia (la marca propia no es su competencia). */
  const marcasPropias = (() => {
    const set = new Set<string>();
    for (const s of surveys.filter((x) => x.rol === "poi_propio")) {
      const cfg = s.configuracion ?? {};
      for (const t of (cfg.nameFilters as string[]) ?? []) set.add(t);
      for (const t of (cfg.censoTerminos as string[]) ?? []) set.add(t);
      if (typeof cfg.marca === "string" && cfg.marca.trim()) {
        set.add(cfg.marca.trim());
      }
    }
    if (proyecto?.nombre_cliente?.trim()) set.add(proyecto.nombre_cliente.trim());
    return Array.from(set).slice(0, 8);
  })();

  /** Marcas censadas en la capa Competencia (pre-carga de competidores
   * del generador de keywords del Geo-Targeting — editables ahí). */
  const marcasCompetencia = (() => {
    const set = new Set<string>();
    const agregar = (t: string) => {
      const m = marcaNormalizada(t.trim());
      if (m) set.add(m);
    };
    for (const s of surveys.filter((x) => x.rol === "competencia")) {
      const cfg = s.configuracion ?? {};
      for (const t of (cfg.nameFilters as string[]) ?? []) agregar(t);
      for (const t of (cfg.censoTerminos as string[]) ?? []) agregar(t);
      if (typeof cfg.etiqueta === "string" && cfg.etiqueta.trim()) {
        agregar(cfg.etiqueta);
      }
    }
    // la marca del cliente no es su propia competencia
    const propias = new Set(
      marcasPropias.map((m) => marcaNormalizada(m)).filter(Boolean)
    );
    return Array.from(set)
      .filter((m) => !propias.has(m))
      .slice(0, 10);
  })();

  /** runId del survey (hermana capas de una misma corrida). */
  const runIdDe = (s: SurveyFila) =>
    (s.configuracion?.runId as string | undefined) ?? s.id;
  /** Descartados persistidos del RUN completo del survey. */
  const descDeRun = (s: SurveyFila) =>
    surveys
      .filter((x) => runIdDe(x) === runIdDe(s))
      .reduce((t, x) => t + (descPorSurvey[x.id] ?? 0), 0);

  async function abrirDescartados(s: SurveyFila) {
    const filas = await cargarDescartados({ runId: runIdDe(s) });
    setPanelDesc({ survey: s, filas });
  }

  /** Rescate manual desde la tabla: cada punto a la capa de su término
   * más afín (ambiguos al survey abierto) — 0 consultas a Google. */
  async function conservarDescartados(seleccion: DescarteGuardado[]) {
    if (!panelDesc || seleccion.length === 0) return;
    setConservandoDesc(true);
    try {
      const hermanos = surveys.filter(
        (x) => runIdDe(x) === runIdDe(panelDesc.survey)
      );
      const porEtiqueta = new Map(
        hermanos.map((h) => [
          (h.configuracion?.etiqueta as string) ?? "",
          h.id,
        ])
      );
      const porSurvey = new Map<string, DescarteGuardado[]>();
      for (const d of seleccion) {
        const destino =
          (d.termino && porEtiqueta.get(d.termino)) || panelDesc.survey.id;
        porSurvey.set(destino, [...(porSurvey.get(destino) ?? []), d]);
      }
      const n = await rescatarDescartados(
        Array.from(porSurvey.entries()).map(([surveyId, filas]) => ({
          surveyId,
          filas,
        }))
      );
      const ids = new Set(seleccion.map((d) => d.placeId));
      setPanelDesc((prev) =>
        prev ? { ...prev, filas: prev.filas.filter((d) => !ids.has(d.placeId)) } : prev
      );
      setPuntosCache({});
      await cargar();
      setAvisoDivision({
        tipo: "ok",
        texto: `${fmt(n)} ${n === 1 ? "punto rescatado" : "puntos rescatados"} a mano — origen "rescatado manual" en los exports · universos marcados para recalcular (⟳ Universo) · 0 consultas a Google.`,
      });
    } catch (e) {
      setAvisoDivision({
        tipo: "error",
        texto: e instanceof Error ? e.message : "No se pudo rescatar la selección",
      });
    } finally {
      setConservandoDesc(false);
    }
  }

  const [dedupeando, setDedupeando] = useState<string | null>(null);

  /** DEDUPE ENTRE CAPAS del rol activo: place_id/coordenada repetidos
   * entre capas → el punto queda en la de marca más específica. */
  async function deduplicarRol(filas: SurveyFila[]) {
    setDedupeando("preparando…");
    try {
      const r = await deduplicarEntreSurveys(
        filas.map((s) => ({
          id: s.id,
          nombre: nombreDe(s),
          etiqueta: (s.configuracion?.etiqueta as string) ?? null,
        })),
        setDedupeando
      );
      setPuntosCache({});
      await cargar();
      setAvisoDivision({
        tipo: "ok",
        texto:
          r.eliminados === 0
            ? "Sin duplicados entre capas — nada que quitar."
            : `${fmt(r.eliminados)} duplicados quitados entre capas (${r.detalle.join(" · ")}) — cada punto quedó en la capa de marca más específica · universos marcados para recalcular.`,
      });
    } catch (e) {
      setAvisoDivision({
        tipo: "error",
        texto: e instanceof Error ? e.message : "No se pudo deduplicar",
      });
    } finally {
      setDedupeando(null);
    }
  }

  /** RE-FILTRADO (cero consultas): re-aplica el filtro con términos y
   * exclusiones corregidos sobre TODO lo guardado del run. */
  async function aplicarReFiltro() {
    if (!refiltro) return;
    const { survey, terminos, exclusiones } = refiltro;
    const hermanos = surveys.filter((x) => runIdDe(x) === runIdDe(survey));
    setRefiltrando("preparando…");
    try {
      const r = await reFiltrarRun({
        surveyIds: hermanos.map((h) => h.id),
        terminos,
        exclusiones,
        onEstado: setRefiltrando,
      });
      setRefiltro(null);
      setPuntosCache({});
      await cargar();
      setAvisoDivision({
        tipo: "ok",
        texto: `Re-filtrado: entraron ${fmt(r.entraron)} y salieron ${fmt(r.salieron)} — ${r.porCapa
          .map((c) => `${c.etiqueta}: ${fmt(c.puntos)}`)
          .join(" · ")} · universos marcados para recalcular · 0 consultas a Google${
          !r.habiaDescartados
            ? " (esta corrida no tenía descartados guardados: solo se pudo quitar; para rescatar, re-córrela — el caché de 36 h la hace ~$0)"
            : ""
        }`,
      });
    } catch (e) {
      setAvisoDivision({
        tipo: "error",
        texto: e instanceof Error ? e.message : "No se pudo re-filtrar",
      });
    } finally {
      setRefiltrando(null);
    }
  }

  /** ¿El survey se puede dividir en capas? Por término de captura o,
   * sin términos (capa de categoría tipo "pizza"), por MARCA
   * NORMALIZADA — los Little Caesars dentro de "pizza" se reasignan. */
  const esDivisible = (s: SurveyFila) => s.rol !== "ooh" && puntosDe(s) > 0;

  /** DIVIDIR EN CAPAS POR MARCA: reasigna los puntos ya pagados a un
   * survey por término (cero consultas a Google) y calcula el universo
   * propio de cada capa nueva. */
  async function dividirSurvey(s: SurveyFila) {
    setConfirmando(null);
    setAvisoDivision(null);
    setDividiendo({ id: s.id, texto: "preparando…" });
    try {
      const r = await dividirSurveyEnCapas(s.id, (t) =>
        setDividiendo({ id: s.id, texto: t })
      );
      // caches del survey retirado fuera; recarga trae las capas nuevas
      setPuntosCache((prev) => {
        const nuevo = { ...prev };
        delete nuevo[s.id];
        return nuevo;
      });
      if (seleccionado === s.id) setSeleccionado(null);
      await cargar();
      setAvisoDivision({
        tipo: "ok",
        texto: `"${nombreDe(s)}" dividido en ${r.capas.length} capas — ${r.capas
          .map((c) => `${c.etiqueta}: ${fmt(c.puntos)}`)
          .join(" · ")}${
          r.ambiguos > 0
            ? ` · ${fmt(r.ambiguos)} puntos sin marca inferible quedaron en "${ETIQUETA_REVISAR}"`
            : ""
        } · 0 consultas a Google. Recalcula el consolidado en el Resumen.`,
      });
    } catch (e) {
      setAvisoDivision({
        tipo: "error",
        texto: e instanceof Error ? e.message : "No se pudo dividir el levantamiento",
      });
    } finally {
      setDividiendo(null);
    }
  }

  async function eliminarSurvey(id: string) {
    const supabase = createClient();
    const { error: e } = await supabase.from("surveys").delete().eq("id", id);
    if (e) setError(`No se pudo eliminar: ${e.message}`);
    setConfirmando(null);
    if (seleccionado === id) setSeleccionado(null);
    await cargar();
  }

  async function recorrerSurvey(s: SurveyFila) {
    // re-correr = misma configuración, REEMPLAZA el run completo (las
    // capas hermanas del mismo runId se van juntas)
    const supabase = createClient();
    const runId = (s.configuracion?.runId as string) ?? s.id;
    // levantamiento RECOLECTADO inline (F6): sus puntos regresan al
    // borrador de la sección para editarlos y volver a Calcular — sin
    // brincar de vista
    if (
      s.fuente === "recoleccion" &&
      s.rol !== "ooh" &&
      // la sección POIs ya no tiene recolector: sin borrador que reabrir
      s.rol !== "poi_propio"
    ) {
      const mapa = await cargarPuntosSurveys([s.id]);
      const puntos: PuntoRecolectado[] = (mapa.get(s.id) ?? []).map((p) => ({
        ...p,
        via: "proyecto" as const,
      }));
      await supabase
        .from("surveys")
        .delete()
        .eq("project_id", proyectoId)
        .eq("configuracion->>runId", runId);
      setBorradores((prev) => ({
        ...prev,
        [s.rol]: {
          puntos,
          config: { ...(prev[s.rol]?.config ?? {}), ...s.configuracion },
        },
      }));
      setConfirmando(null);
      setSeccion(s.rol);
      await cargar();
      return;
    }
    try {
      sessionStorage.setItem(
        s.rol === "ooh" ? "seeker:recorrer-ooh" : "seeker:recorrer",
        JSON.stringify(s.configuracion)
      );
    } catch {
      setError("No se pudo preparar el re-correr (almacenamiento bloqueado)");
      return;
    }
    await supabase
      .from("surveys")
      .delete()
      .eq("project_id", proyectoId)
      .eq("configuracion->>runId", runId);
    setConfirmando(null);
    router.push(
      s.rol === "ooh"
        ? `/planner/${proyectoId}/ooh`
        : `/planner/${proyectoId}/levantar/${s.rol}`
    );
  }

  /** Export rápido de un survey (Proximidad): coordenadas + nombre en
   * CSV y GeoJSON, listos para alimentar DSPs. */
  function descargarTexto(nombre: string, contenido: string, mime: string) {
    // CSV con BOM UTF-8: Excel detecta el encoding y los acentos no se
    // rompen al abrir con doble clic (los GeoJSON van sin BOM)
    const cuerpo =
      mime.startsWith("text/csv") && !contenido.startsWith("﻿")
        ? "﻿" + contenido
        : contenido;
    const blob = new Blob([cuerpo], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  const campoCsv = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  async function puntosParaExport(s: SurveyFila): Promise<Poi[]> {
    if (puntosCache[s.id]) return puntosCache[s.id];
    const mapa = await cargarPuntosSurveys([s.id]);
    const pts = mapa.get(s.id) ?? [];
    setPuntosCache((prev) => ({ ...prev, [s.id]: pts }));
    return pts;
  }
  function nombreArchivo(s: SurveyFila): string {
    return (
      nombreDe(s)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 50) || "levantamiento"
    );
  }
  /** Export data del levantamiento como Excel NATIVO (.xlsx) — cero
   * ambigüedad de encoding; el CSV con BOM queda como alternativa. */
  async function exportarXlsxSurvey(s: SurveyFila) {
    // crudos: traen el detalle por punto (universo/NSE del radio
    // individual) — la base de la asignación de presupuesto por PDV
    const crudos = await cargarPuntosCrudosSurvey(s.id);
    const sumaInd = crudos.reduce((t, r) => t + (r.universo_individual ?? 0), 0);
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const filas = crudos.map((r) => ({
      nombre: r.nombre,
      direccion: r.direccion ?? "",
      lat: r.lat,
      lng: r.lng,
      cp: r.cp ?? "",
      categoria: r.categoria ?? "",
      universo_18_radio_individual: r.universo_individual ?? null,
      nse_dominante: r.nse_dominante ?? "",
      pct_del_universo:
        r.universo_individual != null && sumaInd > 0
          ? Math.round((10000 * r.universo_individual) / sumaInd) / 100
          : null,
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja["!cols"] = [
      { wch: 32 },
      { wch: 42 },
      { wch: 11 },
      { wch: 11 },
      { wch: 8 },
      { wch: 22 },
      { wch: 22 },
      { wch: 13 },
      { wch: 15 },
    ];
    XLSX.utils.book_append_sheet(wb, hoja, "Puntos");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ Nota: NOTA_DETALLE_PUNTO }]),
      "Metodología"
    );
    XLSX.writeFile(wb, `seeker_${nombreArchivo(s)}.xlsx`);
  }

  async function exportarCsvSurvey(s: SurveyFila) {
    const crudos = await cargarPuntosCrudosSurvey(s.id);
    const sumaInd = crudos.reduce((t, r) => t + (r.universo_individual ?? 0), 0);
    const filas = [
      "nombre,direccion,lat,lng,categoria,universo_18_radio_individual,nse_dominante,pct_del_universo",
      ...crudos.map((r) =>
        [
          campoCsv(r.nombre),
          campoCsv(r.direccion ?? ""),
          r.lat,
          r.lng,
          campoCsv(r.categoria ?? ""),
          r.universo_individual ?? "",
          campoCsv(r.nse_dominante ?? ""),
          r.universo_individual != null && sumaInd > 0
            ? Math.round((10000 * r.universo_individual) / sumaInd) / 100
            : "",
        ].join(",")
      ),
    ];
    descargarTexto(
      `seeker_${nombreArchivo(s)}.csv`,
      filas.join("\n"),
      "text/csv;charset=utf-8"
    );
  }
  async function exportarGeoJsonSurvey(s: SurveyFila) {
    const pts = await puntosParaExport(s);
    const fc = {
      type: "FeatureCollection",
      features: pts.map((p) => ({
        type: "Feature",
        properties: {
          nombre: p.nombre,
          direccion: p.direccion ?? null,
          categoria: p.categoria ?? null,
        },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
    };
    descargarTexto(
      `seeker_${nombreArchivo(s)}.geojson`,
      JSON.stringify(fc, null, 2),
      "application/geo+json"
    );
  }

  /** BUFFERS de proximidad: un Polygon circular por punto con su radio
   * de influencia — la geocerca real que se carga al DSP. */
  async function exportarGeoJsonBuffersSurvey(s: SurveyFila) {
    const crudos = await cargarPuntosCrudosSurvey(s.id);
    const radioM = radioDetalleDe(s.configuracion);
    const fc = {
      type: "FeatureCollection",
      features: crudos.map((p) => ({
        type: "Feature",
        properties: {
          nombre: p.nombre,
          direccion: p.direccion ?? null,
          radio_m: radioM,
          universo_18_radio_individual: p.universo_individual ?? null,
          nse_dominante: p.nse_dominante ?? null,
        },
        geometry: {
          type: "Polygon",
          coordinates: [circlePolygon({ lat: p.lat, lng: p.lng }, radioM, 48)],
        },
      })),
    };
    descargarTexto(
      `seeker_${nombreArchivo(s)}_buffers.geojson`,
      JSON.stringify(fc, null, 2),
      "application/geo+json"
    );
  }

  /** DETALLE POR PUNTO retroactivo: llena universo_individual y
   * nse_dominante de los puntos que falten — PostGIS, gratis. */
  const [detallando, setDetallando] = useState<{ id: string; texto: string } | null>(null);
  const [refrescoDetalle, setRefrescoDetalle] = useState(0);
  async function detallePorPunto(s: SurveyFila) {
    setDetallando({ id: s.id, texto: "calculando…" });
    try {
      const r = await calcularDetallePorPuntoSurvey(
        s.id,
        radioDetalleDe(s.configuracion),
        (t) => setDetallando({ id: s.id, texto: t })
      );
      setAvisoDivision({
        tipo: "ok",
        texto:
          r.pendientes === 0
            ? `“${nombreDe(s)}” ya tiene el detalle por punto completo (${fmt(r.total)} puntos).`
            : `Detalle por punto de “${nombreDe(s)}”: ${fmt(r.calculados)} de ${fmt(r.pendientes)} puntos con universo 18+ y NSE de su radio individual — 0 consultas a Google.`,
      });
      setRefrescoDetalle((n) => n + 1);
    } catch (e) {
      setAvisoDivision({
        tipo: "error",
        texto: e instanceof Error ? e.message : "No se pudo calcular el detalle",
      });
    } finally {
      setDetallando(null);
    }
  }

  /** Reclasificar un levantamiento a otra sección ("Mover a…"):
   * reasigna el rol conservando puntos, descartados y universos ya
   * pagados (0 consultas a Google) — lo valioso del Buscador, ahora
   * disponible en las tres secciones normales. */
  const [promoviendo, setPromoviendo] = useState<string | null>(null);
  async function promoverSurvey(s: SurveyFila, rol: RolLevantamiento) {
    setPromoviendo(s.id);
    try {
      await moverSurveyARol(s.id, rol);
      await cargar();
      setSeccion(rol);
      setAvisoDivision({
        tipo: "ok",
        texto: `“${nombreDe(s)}” se movió a ${ETIQUETA_ROL[rol]} — puntos, descartados y universos ya pagados se conservaron (0 consultas a Google).`,
      });
    } catch (e) {
      setAvisoDivision({
        tipo: "error",
        texto:
          e instanceof Error ? e.message : "No se pudo mover el levantamiento",
      });
    } finally {
      setPromoviendo(null);
    }
  }

  async function renombrarSurvey(id: string, nombre: string) {
    const s = surveys.find((x) => x.id === id);
    if (!s || !nombre.trim()) {
      setRenombrando(null);
      return;
    }
    const supabase = createClient();
    await supabase
      .from("surveys")
      .update({ configuracion: { ...s.configuracion, nombre: nombre.trim() } })
      .eq("id", id);
    setRenombrando(null);
    await cargar();
  }

  const activa = SECCIONES.find((x) => x.clave === seccion)!;
  const filasSeccion =
    activa.activa &&
    seccion !== "exportar" &&
    seccion !== "resumen" &&
    seccion !== "geotargeting"
      ? porRol(seccion as RolLevantamiento)
      : [];

  const chipStatus = (s: SurveyFila) =>
    s.status === "completado" ? (
      <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-emerald-400">
        completado
      </span>
    ) : (
      <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-amber-400">
        {s.status === "interrumpido" ? "interrumpido" : "en progreso"}
      </span>
    );

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-fondo p-3">
      <AppHeader usuario={usuario} />

      <div className="tarjeta flex shrink-0 items-center gap-2 px-4 py-2 font-body text-xs">
        <Link href="/planes" className="text-texto-secundario transition-colors duration-rapida hover:text-violeta">
          Mis planes
        </Link>
        <span className="text-zinc-700">/</span>
        <span className="text-violeta">
          {cargando ? "…" : (proyecto?.nombre_cliente ?? "Plan")}
        </span>
        {proyecto?.titulo && (
          <span className="truncate text-zinc-500">· {proyecto.titulo}</span>
        )}
        {proyecto && (
          <span className="truncate text-zinc-600">
            · creado por{" "}
            {proyecto.creado_por === usuario?.id
              ? "ti"
              : (proyecto.profiles?.nombre ?? proyecto.profiles?.email ?? "el equipo")}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ---------- menú lateral ---------- */}
        <aside className="tarjeta w-[300px] shrink-0 overflow-y-auto">
          <div className="border-b border-linea px-5 py-4">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.25em] text-violeta">
              Planner
            </p>
            <h1 className="mt-1 truncate font-display text-lg font-bold tracking-tight text-texto-primario">
              {cargando ? "Cargando…" : (proyecto?.nombre_cliente ?? "Plan")}
            </h1>
            {proyecto?.titulo && (
              <p className="mt-1 truncate font-body text-[11px] text-texto-terciario">
                {proyecto.titulo}
              </p>
            )}
          </div>
          <nav className="px-3 py-3">
            {SECCIONES.map((sec) => (
              <button
                key={sec.clave}
                onClick={() => setSeccion(sec.clave)}
                className={`mb-1 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  seccion === sec.clave
                    ? "border-linea bg-panel2"
                    : "border-transparent hover:bg-panel2/60"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: sec.color }}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block font-body text-[13px] font-semibold ${
                      seccion === sec.clave
                        ? "text-texto-primario"
                        : "text-texto-secundario"
                    }`}
                  >
                    {sec.nombre}
                  </span>
                  <span className="block truncate font-body text-[11px] text-texto-terciario">
                    {sec.descriptor}
                  </span>
                </span>
                {sec.clave !== "exportar" && sec.clave !== "resumen" && (
                  <span className="shrink-0 rounded-full border border-linea bg-fondo px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                    {porRol(sec.clave as RolLevantamiento).length}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <p className="px-5 pb-4 font-body text-[11px] leading-relaxed text-texto-terciario">
            Los levantamientos se guardan automáticamente conforme corren:
            cerrar el navegador no pierde el avance, y los interrumpidos se
            reanudan donde quedaron sin repagar consultas.
          </p>
        </aside>

        {/* ---------- contenido ---------- */}
        <main className="tarjeta flex min-w-0 flex-1 flex-col overflow-hidden">
          {error ? (
            <div className="m-auto max-w-md px-6 text-center">
              <MensajeError mensaje={error} />
              <Link
                href="/planes"
                className="mt-4 inline-block rounded-md border border-violeta bg-violeta/10 px-4 py-2 font-mono text-xs text-violeta transition-colors hover:bg-violeta/20"
              >
                Volver a Mis planes
              </Link>
            </div>
          ) : seccion === "resumen" ? (
            // lo explorado no entra al consolidado ni al export: primero
            // se promueve a una sección (Mover a…)
            <ResumenProyecto
              proyectoId={proyectoId}
              surveys={surveys.filter((s) => s.rol !== "exploracion")}
            />
          ) : seccion === "exportar" ? (
            <ExportarProyecto
              proyectoId={proyectoId}
              cliente={proyecto?.nombre_cliente ?? "Cliente"}
              tituloProyecto={proyecto?.titulo ?? null}
              usuario={usuario}
              surveys={surveys.filter((s) => s.rol !== "exploracion")}
              tacticas={tacticasPlan}
              onTacticas={setTacticasPlan}
              irAResumen={() => setSeccion("resumen")}
            />
          ) : !activa.activa ? (
            <div className="m-auto max-w-lg px-6 py-10 text-center">
              <span
                className="mx-auto block h-3 w-3 rounded-full"
                style={{ backgroundColor: activa.color }}
              />
              <h2 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-white">
                {activa.nombre}
              </h2>
              <p className="mt-2 font-mono text-xs leading-relaxed text-zinc-400">
                {activa.detalle}
              </p>
              <div className="mt-6 inline-block rounded-full border border-dashed border-linea px-4 py-1.5 font-mono text-[11px] text-zinc-500">
                Disponible en la siguiente fase ({activa.fase})
              </div>
            </div>
          ) : (
            <>
              {/* interfaz inline de la sección (recolectar → calcular)
                  + lista de levantamientos guardados. Puntos de interés
                  es el Buscador completo embebido: trae su propio mapa,
                  así que su sección ocupa todo el alto y no pinta el
                  mapa del proyecto. */}
              <div
                className={
                  seccion === "poi_propio"
                    ? "min-h-0 flex-1 overflow-y-auto px-5 py-3"
                    : "max-h-[62%] shrink-0 overflow-y-auto border-b border-linea px-5 py-3"
                }
              >
                <div className="mb-3">
                  <h2 className="font-display text-base font-extrabold tracking-tight text-white">
                    {activa.nombre}
                  </h2>
                  <p className="font-mono text-[10px] text-zinc-500">
                    {filasSeccion.length > 0
                      ? `${filasSeccion.length} ${filasSeccion.length === 1 ? "levantamiento guardado" : "levantamientos guardados"}${seccion === "poi_propio" ? " · muévelos a otra sección con «Mover a»" : " · el mapa pinta lo recolectado y todos los visibles del proyecto"}`
                      : activa.descriptor}
                  </p>
                </div>

                {seccion === "geotargeting" ? (
                  <PlannerGeotargeting
                    proyectoId={proyectoId}
                    cliente={proyecto?.nombre_cliente ?? "Cliente"}
                    surveysFuente={surveys
                      .filter(
                        (s) =>
                          (s.rol === "poi_propio" ||
                            s.rol === "proximidad" ||
                            s.rol === "competencia" ||
                            s.rol === "exploracion") &&
                          puntosDe(s) > 0
                      )
                      .map((s) => ({
                        id: s.id,
                        nombre: nombreDe(s),
                        puntos: puntosDe(s),
                      }))}
                    surveysGeo={porRol("geotargeting").map(
                      (s): SurveyGeoGuardado => ({
                        id: s.id,
                        nombre: nombreDe(s),
                        created_at: s.created_at,
                        config: s.configuracion as unknown as ConfigGeotargeting,
                      })
                    )}
                    marcaSugerida={marcasPropias[0] ?? proyecto?.nombre_cliente ?? ""}
                    industriaSugerida=""
                    competidoresSugeridos={marcasCompetencia}
                    alGuardar={cargar}
                    onCobertura={(cps) => setCoberturaGeo(cps)}
                  />
                ) : seccion === "poi_propio" ? (
                  <SeekerEmbebido
                    usuario={usuario}
                    planner={{
                      proyectoId,
                      rol: "poi_propio",
                      nombreCliente: proyecto?.nombre_cliente,
                      embebido: true,
                      alGuardar: cargar,
                    }}
                  />
                ) : seccion === "proximidad" ? (
                  <SeccionProximidad
                    proyectoId={proyectoId}
                    color={activa.color}
                    borrador={borradores.proximidad ?? BORRADOR_VACIO}
                    onBorrador={(b) =>
                      setBorradores((prev) => ({ ...prev, proximidad: b }))
                    }
                    alGuardar={cargar}
                  />
                ) : seccion === "competencia" ? (
                  <SeccionCompetencia
                    proyectoId={proyectoId}
                    color={activa.color}
                    borrador={borradores.competencia ?? BORRADOR_VACIO}
                    onBorrador={(b) =>
                      setBorradores((prev) => ({ ...prev, competencia: b }))
                    }
                    alGuardar={cargar}
                    exclusionesSugeridas={marcasPropias}
                  />
                ) : seccion === "ooh" ? (
                  <SeccionOoh
                    proyectoId={proyectoId}
                    color={activa.color}
                    borrador={borradores.ooh ?? BORRADOR_VACIO}
                    onBorrador={(b) =>
                      setBorradores((prev) => ({ ...prev, ooh: b }))
                    }
                    alGuardar={cargar}
                    surveysFuente={surveys
                      .filter(
                        (s) =>
                          (s.rol === "poi_propio" || s.rol === "proximidad") &&
                          puntosDe(s) > 0
                      )
                      .map((s) => ({
                        id: s.id,
                        nombre: nombreDe(s),
                        puntos: puntosDe(s),
                      }))}
                  />
                ) : null}

                {avisoDivision && (
                  <p
                    className={`mt-3 rounded-md border px-3 py-2 font-mono text-[11px] leading-relaxed ${
                      avisoDivision.tipo === "ok"
                        ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-400"
                        : "border-magenta/50 bg-magenta/10 text-magenta"
                    }`}
                  >
                    {avisoDivision.texto}
                  </p>
                )}

                {/* RE-FILTRADO: corrige términos/exclusiones y re-aplica
                    sobre todo lo guardado — cero consultas a Google */}
                {refiltro && (
                  <div className="mt-3 rounded-lg border border-cian/50 bg-cian/5 p-3">
                    <p className="font-mono text-[11px] font-semibold text-cian">
                      Re-filtrar “{nombreDe(refiltro.survey)}”
                      {runIdDe(refiltro.survey) !== refiltro.survey.id ||
                      surveys.filter((x) => runIdDe(x) === runIdDe(refiltro.survey))
                        .length > 1
                        ? " (y sus capas hermanas)"
                        : ""}
                    </p>
                    <p className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-500">
                      El filtro se re-aplica LOCALMENTE sobre todos los
                      resultados guardados (conservados + descartados): entran
                      los que ahora pasan, salen los que ya no — 0 consultas a
                      Google, universos marcados para recalcular.
                      {descDeRun(refiltro.survey) === 0 &&
                        " Esta corrida no guardó descartados (previa a esta versión): solo se puede QUITAR; para rescatar lo descartado, re-córrela — las consultas repetidas salen del caché ($0 dentro de 36 h)."}
                    </p>
                    <div className="mt-2">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        Términos de marca
                      </p>
                      <ChipsTerminos
                        terminos={refiltro.terminos}
                        onCambiar={(t) => setRefiltro({ ...refiltro, terminos: t })}
                        placeholder='p. ej. cafetería, "tim hortons" (comas = varios)'
                      />
                    </div>
                    <div className="mt-2">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        Exclusiones
                      </p>
                      <ChipsTerminos
                        terminos={refiltro.exclusiones}
                        onCambiar={(t) =>
                          setRefiltro({ ...refiltro, exclusiones: t })
                        }
                        placeholder="marcas a excluir"
                      />
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={aplicarReFiltro}
                        disabled={refiltrando !== null}
                        className="rounded-md bg-cian px-4 py-2 font-display text-xs font-extrabold text-fondo transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {refiltrando ? `⟳ ${refiltrando}` : "Aplicar re-filtrado (0 consultas)"}
                      </button>
                      <button
                        onClick={() => setRefiltro(null)}
                        disabled={refiltrando !== null}
                        className="rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-[11px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* panel de rescate de descartados (overlay) */}
                {panelDesc && (
                  <PanelDescartados
                    titulo={`${nombreDe(panelDesc.survey)} · ${ETIQUETA_ROL[panelDesc.survey.rol]}`}
                    descartes={panelDesc.filas}
                    onCerrar={() => setPanelDesc(null)}
                    onConservar={conservarDescartados}
                    conservando={conservandoDesc}
                  />
                )}
                {/* P4a: un punto no puede vivir en DOS capas del mismo
                    proyecto — queda en la de marca más específica */}
                {filasSeccion.length >= 2 && (
                  <button
                    onClick={() => deduplicarRol(filasSeccion)}
                    disabled={dedupeando !== null}
                    className="mt-3 rounded-md border border-linea bg-panel2 px-3 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors hover:border-cian hover:text-cian disabled:opacity-50"
                    title="Deduplica por place_id y por coordenada (~11 m) ENTRE las capas de esta sección: el punto queda en la capa de marca más específica"
                  >
                    {dedupeando ? `⟳ ${dedupeando}` : "Deduplicar entre capas"}
                  </button>
                )}
                {filasSeccion.length > 0 && (
                  <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-linea">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="sticky top-0 bg-panel2 text-zinc-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Ver</th>
                          <th className="px-3 py-2 font-medium">Levantamiento</th>
                          <th className="px-3 py-2 font-medium">Fecha</th>
                          <th className="px-3 py-2 text-right font-medium">Puntos</th>
                          <th className="px-3 py-2 text-right font-medium">Universo 18+</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 text-right font-medium">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="bg-panel">
                        {filasSeccion.map((s) => {
                          const u = universoDe(s);
                          return (
                            <tr
                              key={s.id}
                              onClick={() => {
                                setSeleccionado(s.id);
                                const pts = puntosCache[s.id];
                                if (pts?.length) {
                                  setFoco({ lat: pts[0].lat, lng: pts[0].lng });
                                  setTimeout(() => setFoco(null), 800);
                                }
                              }}
                              className={`cursor-pointer border-t border-linea/60 transition-colors ${
                                seleccionado === s.id
                                  ? "bg-panel2 text-white"
                                  : "text-zinc-300 hover:bg-panel2/60"
                              }`}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={esVisible(s.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setVisibles((prev) => ({
                                      ...prev,
                                      [s.id]: e.target.checked,
                                    }))
                                  }
                                  className="accent-cian"
                                  title="Ver en el mapa"
                                />
                              </td>
                              <td className="max-w-[220px] truncate px-3 py-2">
                                <span
                                  className="mr-1.5 inline-block h-2 w-2 rounded-full"
                                  style={{ backgroundColor: colorDe(s) }}
                                />
                                {renombrando?.id === s.id ? (
                                  <input
                                    autoFocus
                                    value={renombrando.texto}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                      setRenombrando({ id: s.id, texto: e.target.value })
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter")
                                        renombrarSurvey(s.id, renombrando.texto);
                                      if (e.key === "Escape") setRenombrando(null);
                                    }}
                                    onBlur={() => renombrarSurvey(s.id, renombrando.texto)}
                                    className="w-40 rounded border border-cian bg-fondo px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none"
                                  />
                                ) : (
                                  nombreDe(s)
                                )}
                              </td>
                              <td className="px-3 py-2 text-zinc-500">
                                {new Date(s.created_at).toLocaleDateString("es-MX", {
                                  dateStyle: "medium",
                                })}
                              </td>
                              <td className="px-3 py-2 text-right text-cian">
                                {fmt(puntosDe(s))}
                              </td>
                              <td className="px-3 py-2 text-right text-violeta">
                                {u?.disponible
                                  ? fmt(u.residencial!.adultos18)
                                  : "—"}
                                {Boolean(
                                  s.configuracion?.universos_desactualizados
                                ) && (
                                  <span
                                    className="ml-1 cursor-help text-amber-400"
                                    title="Universo desactualizado: el censo fue depurado después del último cálculo — recalcula con ⟳ Universo"
                                  >
                                    ⚠
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">{chipStatus(s)}</td>
                              <td className="px-3 py-2 text-right">
                                {confirmando?.id === s.id ? (
                                  <span
                                    className="inline-flex items-center gap-1.5"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span className="text-[10px] text-magenta">
                                      {confirmando.accion === "eliminar"
                                        ? "¿Eliminar?"
                                        : confirmando.accion === "dividir"
                                          ? "¿Dividir en una capa por marca? (0 consultas)"
                                          : "¿Re-correr y reemplazar?"}
                                    </span>
                                    <button
                                      onClick={() =>
                                        confirmando.accion === "eliminar"
                                          ? eliminarSurvey(s.id)
                                          : confirmando.accion === "dividir"
                                            ? dividirSurvey(s)
                                            : recorrerSurvey(s)
                                      }
                                      className="rounded border border-magenta bg-magenta/10 px-2 py-0.5 text-[10px] text-magenta hover:bg-magenta/20"
                                    >
                                      Sí
                                    </button>
                                    <button
                                      onClick={() => setConfirmando(null)}
                                      className="rounded border border-linea bg-panel2 px-2 py-0.5 text-[10px] text-zinc-400"
                                    >
                                      No
                                    </button>
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {/* reclasificar sin re-pagar: el rol
                                        cambia, los puntos/descartados/
                                        universos se conservan tal cual */}
                                    {s.rol !== "ooh" && s.rol !== "geotargeting" && (
                                      <select
                                        value=""
                                        disabled={promoviendo !== null}
                                        onChange={(e) => {
                                          const rol = e.target
                                            .value as RolLevantamiento;
                                          if (rol) promoverSurvey(s, rol);
                                        }}
                                        className="cursor-pointer rounded border border-exito/60 bg-exito/10 px-1.5 py-0.5 text-[10px] text-exito hover:bg-exito/20 disabled:opacity-50"
                                        title="Reclasifica este levantamiento a otra sección del plan: cambia el rol conservando puntos, descartados y universos ya pagados (0 consultas)"
                                      >
                                        <option value="" disabled>
                                          {promoviendo === s.id
                                            ? "Moviendo…"
                                            : "Mover a…"}
                                        </option>
                                        {(
                                          [
                                            ["poi_propio", "Puntos de interés"],
                                            ["proximidad", "Proximidad"],
                                            ["competencia", "Competencia"],
                                          ] as const
                                        )
                                          .filter(([r]) => r !== s.rol)
                                          .map(([r, etiqueta]) => (
                                            <option key={r} value={r}>
                                              {etiqueta}
                                            </option>
                                          ))}
                                      </select>
                                    )}
                                    {s.rol !== "ooh" &&
                                      s.status !== "completado" &&
                                      (s.fuente === "recoleccion" ? (
                                        <button
                                          onClick={() => setSeccion(s.rol)}
                                          className="rounded border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-400 hover:bg-amber-400/20"
                                          title='Corrida interrumpida: el botón "Continuar" de la sección retoma desde el chunk siguiente, sin repagar consultas'
                                        >
                                          Reanudar
                                        </button>
                                      ) : (
                                        <Link
                                          href={`/planner/${proyectoId}/levantar/${s.rol}?reanudar=${s.id}`}
                                          className="rounded border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-400 hover:bg-amber-400/20"
                                          title="Continúa exactamente donde quedó, sin repagar consultas"
                                        >
                                          Reanudar
                                        </Link>
                                      ))}
                                    {s.rol === "proximidad" && (
                                      <>
                                        <button
                                          onClick={() => exportarXlsxSurvey(s)}
                                          className="rounded border border-linea bg-panel2 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-emerald-400 hover:text-emerald-400"
                                          title="Excel nativo (.xlsx): acentos siempre correctos"
                                        >
                                          XLSX
                                        </button>
                                        <button
                                          onClick={() => exportarCsvSurvey(s)}
                                          className="rounded border border-linea bg-panel2 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-emerald-400 hover:text-emerald-400"
                                          title="CSV UTF-8 con BOM, listo para DSPs"
                                        >
                                          CSV
                                        </button>
                                        <button
                                          onClick={() => exportarGeoJsonSurvey(s)}
                                          className="rounded border border-linea bg-panel2 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-emerald-400 hover:text-emerald-400"
                                          title="GeoJSON de puntos, listo para DSPs"
                                        >
                                          GeoJSON
                                        </button>
                                        <button
                                          onClick={() =>
                                            exportarGeoJsonBuffersSurvey(s)
                                          }
                                          className="rounded border border-linea bg-panel2 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-emerald-400 hover:text-emerald-400"
                                          title="GeoJSON de BUFFERS: un círculo por punto con su radio de influencia (la geocerca real del DSP) + universo 18+ individual"
                                        >
                                          Buffers
                                        </button>
                                      </>
                                    )}
                                    {s.rol !== "ooh" && s.rol !== "geotargeting" && (
                                      <button
                                        onClick={() => detallePorPunto(s)}
                                        disabled={detallando !== null}
                                        className="rounded border border-linea bg-panel2 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-cian hover:text-cian disabled:opacity-50"
                                        title="Universo 18+ y NSE del radio INDIVIDUAL de cada punto (la base del presupuesto por PDV) — PostGIS propio, gratis, sin re-pagar consultas"
                                      >
                                        {detallando?.id === s.id
                                          ? `⟳ ${detallando.texto}`
                                          : "Detalle por punto"}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => recalcularUniverso(s)}
                                      disabled={recalculando !== null}
                                      className={`rounded px-2 py-0.5 text-[10px] disabled:opacity-50 ${
                                        s.configuracion?.universos_desactualizados
                                          ? "border border-amber-400/60 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20"
                                          : "border border-linea bg-panel2 text-zinc-400 hover:border-violeta hover:text-violeta"
                                      }`}
                                      title="Recalcular el universo de ESTA capa sobre la geometría de sus propios puntos (gratis)"
                                    >
                                      {recalculando?.id === s.id
                                        ? `⟳ ${recalculando.texto}`
                                        : "⟳ Universo"}
                                    </button>
                                    {descDeRun(s) > 0 && (
                                      <button
                                        onClick={() => abrirDescartados(s)}
                                        disabled={conservandoDesc}
                                        className="rounded border border-cian/60 bg-cian/10 px-2 py-0.5 text-[10px] text-cian hover:bg-cian/20 disabled:opacity-50"
                                        title="Los descartados de esta corrida ya se pagaron: revísalos, búscalos y rescata los que sí sirven — 0 consultas a Google"
                                      >
                                        Descartados ({fmt(descDeRun(s))})
                                      </button>
                                    )}
                                    {s.status === "completado" &&
                                      s.rol !== "ooh" &&
                                      (((s.configuracion?.nameFilters as string[])
                                        ?.length ?? 0) > 0 ||
                                        ((s.configuracion?.excludes as string[])
                                          ?.length ?? 0) > 0) && (
                                        <button
                                          onClick={() =>
                                            setRefiltro({
                                              survey: s,
                                              terminos:
                                                (s.configuracion
                                                  ?.nameFilters as string[]) ?? [],
                                              exclusiones:
                                                (s.configuracion
                                                  ?.excludes as string[]) ?? [],
                                            })
                                          }
                                          disabled={refiltrando !== null}
                                          className="rounded border border-linea bg-panel2 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-cian hover:text-cian disabled:opacity-50"
                                          title="Corrige términos/exclusiones y re-aplica el filtro sobre TODO lo guardado (conservados + descartados) — cero consultas a Google"
                                        >
                                          Re-filtrar
                                        </button>
                                      )}
                                    {esDivisible(s) && (
                                      <button
                                        onClick={() =>
                                          setConfirmando({ accion: "dividir", id: s.id })
                                        }
                                        disabled={dividiendo !== null}
                                        className="rounded border border-cian/60 bg-cian/10 px-2 py-0.5 text-[10px] text-cian hover:bg-cian/20 disabled:opacity-50"
                                        title="Levantamiento con varias marcas mezcladas: crea una capa por marca reasignando los puntos YA PAGADOS (0 consultas a Google) y calcula el universo propio de cada capa"
                                      >
                                        {dividiendo?.id === s.id
                                          ? `⟳ ${dividiendo.texto}`
                                          : "Dividir en capas"}
                                      </button>
                                    )}
                                    {/* recolecciones de la sección POIs vieja: ya no
                                        hay recolector donde reabrir su borrador — se
                                        conservan tal cual (universos, exports, mover a) */}
                                    {!(s.fuente === "recoleccion" && s.rol === "poi_propio") && (
                                      <button
                                        onClick={() =>
                                          setConfirmando({ accion: "recorrer", id: s.id })
                                        }
                                        className="rounded border border-linea bg-panel2 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-cian hover:text-cian"
                                        title="Nueva ejecución con la misma configuración (reemplaza este levantamiento y sus capas hermanas)"
                                      >
                                        Re-correr
                                      </button>
                                    )}
                                    <button
                                      onClick={() =>
                                        setRenombrando({ id: s.id, texto: nombreDe(s) })
                                      }
                                      className="rounded border border-linea bg-panel2 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-violeta hover:text-violeta"
                                    >
                                      Renombrar
                                    </button>
                                    <button
                                      onClick={() =>
                                        setConfirmando({ accion: "eliminar", id: s.id })
                                      }
                                      className="rounded border border-linea bg-panel2 px-2 py-0.5 text-[10px] text-zinc-500 hover:border-magenta hover:text-magenta"
                                    >
                                      ×
                                    </button>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* detalle por PDV (Proximidad): presupuesto por tienda */}
              {seccion === "proximidad" && surveySeleccionado && (
                <div className="shrink-0 px-5 pt-3">
                  <p className="mb-1.5 font-body text-[10px] font-semibold uppercase tracking-[0.2em] text-texto-terciario">
                    Detalle por PDV de “{nombreDe(surveySeleccionado)}”
                    <span className="ml-2 font-normal normal-case tracking-normal">
                      universo del radio individual — base de la asignación de
                      presupuesto por tienda
                    </span>
                  </p>
                  <TablaDetallePorPunto
                    surveyId={surveySeleccionado.id}
                    refresco={refrescoDetalle}
                  />
                </div>
              )}

              {/* universo del levantamiento seleccionado */}
              {universoSeleccionado && surveySeleccionado && (
                <div className="shrink-0 px-5 pt-3">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Universo de “{nombreDe(surveySeleccionado)}”
                    <span className="ml-2 normal-case tracking-normal text-zinc-600">
                      (el consolidado del plan vive en Resumen del proyecto)
                    </span>
                  </p>
                  <UniversosPanel universos={universoSeleccionado} notaTerritorio />
                </div>
              )}

              {/* mapa del proyecto: todos los levantamientos visibles
                  (el Buscador embebido trae su propio mapa) */}
              {seccion !== "poi_propio" && (
                <div className="relative m-4 min-h-0 flex-1 overflow-hidden rounded-lg border border-linea">
                  <PlannerMapa capas={capasMapa} foco={foco} />
                  {capasMapa.length > 0 && (
                    <div className="absolute right-3 top-3 z-[800] max-h-64 overflow-y-auto rounded-lg border border-linea bg-panel/90 px-3 py-2 backdrop-blur">
                      {capasMapa.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center gap-2 font-mono text-[10px] text-zinc-300"
                        >
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          <span className="max-w-[180px] truncate">{c.nombre}</span>
                          <span className="text-zinc-500">{fmt(c.puntos.length)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
