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
import { useRouter } from "next/navigation";
import AppHeader from "./AppHeader";
import ExportarProyecto from "./ExportarProyecto";
import ResumenProyecto from "./ResumenProyecto";
import UniversosPanel from "./UniversosPanel";
import type { TacticaClave } from "@/lib/tacticas";
import {
  cargarPuntosCrudosSurvey,
  cargarPuntosSurveys,
  colorSurvey,
  ETIQUETA_ROL,
  type PuntoSurvey,
} from "@/lib/planner";
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
    clave: "poi_propio",
    nombre: "POI (puntos propios)",
    descriptor: "Los PDVs del cliente",
    color: "#2fb9e8",
    activa: true,
    fase: "",
    detalle: "",
  },
  {
    clave: "competencia",
    nombre: "Competencia",
    descriptor: "Censos de marcas rivales",
    color: "#f4368a",
    activa: true,
    fase: "",
    detalle: "",
  },
  {
    clave: "proximidad",
    nombre: "Proximidad",
    descriptor: "Puntos de afinidad del target",
    color: "#9d5cf0",
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
  const [seccion, setSeccion] = useState<SeccionPlanner>("poi_propio");
  /** Visibilidad por survey en el mapa (default: visible). */
  const [visibles, setVisibles] = useState<Record<string, boolean>>({});
  /** Tácticas marcadas del proyecto (persisten en plan_state; null =
   * default por capas presentes, calculado en Exportar). */
  const [tacticasPlan, setTacticasPlan] = useState<TacticaClave[] | null>(null);
  const [puntosCache, setPuntosCache] = useState<Record<string, Poi[]>>({});
  /** Crudos con metadata (cruces OOH: relaciones pantalla→PDV). */
  const [crudosCache, setCrudosCache] = useState<Record<string, PuntoSurvey[]>>({});
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [foco, setFoco] = useState<LatLng | null>(null);
  const [confirmando, setConfirmando] = useState<{
    accion: "eliminar" | "recorrer";
    id: string;
  } | null>(null);
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
      };
      if (estado.seccion) setSeccion(estado.seccion);
      if (estado.visibles) setVisibles(estado.visibles);
      if (estado.tacticas) setTacticasPlan(estado.tacticas);
      estadoListoRef.current = true;
    }
    setCargando(false);
  }, [proyectoId]);

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
            },
          },
          { onConflict: "project_id" }
        );
    }, 600);
    return () => clearTimeout(timer);
  }, [seccion, visibles, tacticasPlan, proyectoId, cargando]);

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

  const porRol = (rol: RolLevantamiento) => surveys.filter((s) => s.rol === rol);
  const nombreDe = (s: SurveyFila) =>
    (s.configuracion?.nombre as string) ?? ETIQUETA_ROL[s.rol];
  const puntosDe = (s: SurveyFila) => s.survey_points?.[0]?.count ?? 0;
  const universoDe = (s: SurveyFila): Universos | null =>
    s.survey_universes?.[0]?.resultados ?? null;
  /** Color estable por survey: índice dentro de su rol (orden cronológico). */
  const colorDe = (s: SurveyFila) => {
    const delRol = [...porRol(s.rol)].reverse();
    return colorSurvey(s.rol, delRol.findIndex((x) => x.id === s.id));
  };

  const capasMapa: CapaProyecto[] = surveys
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

  const surveySeleccionado = surveys.find((s) => s.id === seleccionado) ?? null;
  const universoSeleccionado = surveySeleccionado
    ? universoDe(surveySeleccionado)
    : null;

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
    const blob = new Blob([contenido], { type: mime });
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
  async function exportarCsvSurvey(s: SurveyFila) {
    const pts = await puntosParaExport(s);
    const filas = [
      "nombre,direccion,lat,lng,categoria",
      ...pts.map((p) =>
        [
          campoCsv(p.nombre),
          campoCsv(p.direccion ?? ""),
          p.lat,
          p.lng,
          campoCsv(p.categoria ?? ""),
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
    activa.activa && seccion !== "exportar" && seccion !== "resumen"
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

      <div className="tarjeta flex shrink-0 items-center gap-2 px-4 py-2 font-mono text-[11px]">
        <Link href="/planes" className="text-zinc-500 transition-colors hover:text-violeta">
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
        <Link
          href="/"
          className="ml-auto rounded-full border border-linea bg-panel2 px-3 py-1 text-zinc-400 transition-colors hover:border-cian hover:text-cian"
          title="El modo consulta sigue igual que siempre; este plan queda guardado"
        >
          ← Ir al modo consulta
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ---------- menú lateral ---------- */}
        <aside className="tarjeta w-[300px] shrink-0 overflow-y-auto">
          <div className="border-b border-linea px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-violeta">
              Planner
            </p>
            <h1 className="mt-1 truncate font-display text-lg font-extrabold tracking-tight text-white">
              {cargando ? "Cargando…" : (proyecto?.nombre_cliente ?? "Plan")}
            </h1>
            {proyecto?.titulo && (
              <p className="mt-1 truncate font-mono text-[10px] text-zinc-500">
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
                    className={`block font-display text-sm font-extrabold ${
                      seccion === sec.clave ? "text-white" : "text-zinc-300"
                    }`}
                  >
                    {sec.nombre}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-zinc-500">
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
          <p className="px-5 pb-4 font-mono text-[10px] leading-relaxed text-zinc-600">
            Los levantamientos se guardan automáticamente conforme corren:
            cerrar el navegador no pierde el avance, y los interrumpidos se
            reanudan donde quedaron sin repagar consultas.
          </p>
        </aside>

        {/* ---------- contenido ---------- */}
        <main className="tarjeta flex min-w-0 flex-1 flex-col overflow-hidden">
          {error ? (
            <div className="m-auto max-w-md px-6 text-center">
              <p className="font-mono text-xs text-magenta">{error}</p>
              <Link
                href="/planes"
                className="mt-4 inline-block rounded-md border border-violeta bg-violeta/10 px-4 py-2 font-mono text-xs text-violeta transition-colors hover:bg-violeta/20"
              >
                Volver a Mis planes
              </Link>
            </div>
          ) : seccion === "resumen" ? (
            <ResumenProyecto proyectoId={proyectoId} surveys={surveys} />
          ) : seccion === "exportar" ? (
            <ExportarProyecto
              proyectoId={proyectoId}
              cliente={proyecto?.nombre_cliente ?? "Cliente"}
              tituloProyecto={proyecto?.titulo ?? null}
              usuario={usuario}
              surveys={surveys}
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
              {/* toolbar + lista de levantamientos de la sección */}
              <div className="shrink-0 border-b border-linea px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-extrabold tracking-tight text-white">
                      {activa.nombre}
                    </h2>
                    <p className="font-mono text-[10px] text-zinc-500">
                      {filasSeccion.length > 0
                        ? `${filasSeccion.length} ${filasSeccion.length === 1 ? "levantamiento" : "levantamientos"} · el mapa pinta todos los visibles del proyecto`
                        : seccion === "proximidad"
                          ? "Carga la lista de lugares de afinidad (Excel, sin búsqueda) o censa categorías alrededor de una zona"
                          : seccion === "ooh"
                            ? "Cruza el inventario de pantallas contra los PDVs del proyecto (o un Excel)"
                            : "Sin levantamientos todavía — corre el primero con el buscador completo"}
                    </p>
                  </div>
                  <Link
                    href={
                      seccion === "ooh"
                        ? `/planner/${proyectoId}/ooh`
                        : `/planner/${proyectoId}/levantar/${seccion}`
                    }
                    className="shrink-0 rounded-md bg-violeta px-4 py-2 font-display text-xs font-extrabold text-white transition-opacity hover:opacity-90"
                  >
                    {seccion === "ooh" ? "+ Nuevo cruce de pantallas" : "+ Nuevo levantamiento"}
                  </Link>
                </div>

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
                                        : "¿Re-correr y reemplazar?"}
                                    </span>
                                    <button
                                      onClick={() =>
                                        confirmando.accion === "eliminar"
                                          ? eliminarSurvey(s.id)
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
                                    {s.rol !== "ooh" && s.status !== "completado" && (
                                      <Link
                                        href={`/planner/${proyectoId}/levantar/${s.rol}?reanudar=${s.id}`}
                                        className="rounded border border-amber-400/60 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-400 hover:bg-amber-400/20"
                                        title="Continúa exactamente donde quedó, sin repagar consultas"
                                      >
                                        Reanudar
                                      </Link>
                                    )}
                                    {s.rol === "proximidad" && (
                                      <>
                                        <button
                                          onClick={() => exportarCsvSurvey(s)}
                                          className="rounded border border-linea bg-panel2 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-emerald-400 hover:text-emerald-400"
                                          title="Coordenadas + nombre en CSV, listo para DSPs"
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
                                      </>
                                    )}
                                    <button
                                      onClick={() =>
                                        setConfirmando({ accion: "recorrer", id: s.id })
                                      }
                                      className="rounded border border-linea bg-panel2 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-cian hover:text-cian"
                                      title="Nueva ejecución con la misma configuración (reemplaza este levantamiento y sus capas hermanas)"
                                    >
                                      Re-correr
                                    </button>
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

              {/* universo del levantamiento seleccionado */}
              {universoSeleccionado && surveySeleccionado && (
                <div className="shrink-0 px-5 pt-3">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                    Universo de “{nombreDe(surveySeleccionado)}”
                    <span className="ml-2 normal-case tracking-normal text-zinc-600">
                      (la consolidación multi-levantamiento llega en F4)
                    </span>
                  </p>
                  <UniversosPanel universos={universoSeleccionado} notaTerritorio />
                </div>
              )}

              {/* mapa del proyecto: todos los levantamientos visibles */}
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}
