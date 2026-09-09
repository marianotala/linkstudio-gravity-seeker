// PLANNER F2 — persistencia de levantamientos. El motor de búsqueda es
// el MISMO del modo consulta (SeekerApp): cuando corre con contexto de
// Planner, estas funciones guardan los resultados al proyecto como
// surveys con rol — creación por capa (una capa = un survey), puntos
// por lote conforme llegan (autosave), universos y progreso para
// reanudar sin repagar consultas. Todo vía Supabase con RLS de equipo.

import { createClient } from "./supabase/client";
import type { Poi, RolLevantamiento, Universos } from "./types";

export interface ContextoPlanner {
  proyectoId: string;
  rol: RolLevantamiento;
  /** Nombre del cliente para el banner del buscador. */
  nombreCliente?: string;
}

export const ETIQUETA_ROL: Record<RolLevantamiento, string> = {
  poi_propio: "POI propios",
  competencia: "Competencia",
  proximidad: "Proximidad",
  ooh: "OOH",
};

/** Espectros de color por ROL (consistentes con la semántica de la
 * app: propios en cian/azules, competencia en magenta/cálidos). */
export const PALETAS_ROL: Record<RolLevantamiento, string[]> = {
  poi_propio: ["#2fb9e8", "#7fd4f2", "#1e8ab4", "#a5e3f7", "#17607f", "#60a5fa"],
  competencia: ["#f4368a", "#ff8c42", "#f7d154", "#c0399f", "#ff6b6b", "#f79ac0"],
  proximidad: ["#9d5cf0", "#c9a8f7", "#7a3fd1", "#b57ef5", "#d8b4fe", "#8b5cf6"],
  ooh: ["#ff8c42", "#f7d154", "#fdba74", "#fb923c", "#fde68a", "#f59e0b"],
};

export function colorSurvey(rol: RolLevantamiento, indice: number): string {
  const paleta = PALETAS_ROL[rol];
  return paleta[indice % paleta.length];
}

/** Un run activo del Planner: surveys por etiqueta de capa (null =
 * capa única) y los place_ids ya persistidos (dedupe del autosave). */
export interface RunPlanner {
  runId: string;
  /** etiqueta de capa → survey id. */
  surveys: Map<string | null, string>;
  guardados: Set<string>;
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Crea los surveys del run (uno por capa; sin capas, uno solo). La
 * configuración completa se guarda en cada survey con el runId que
 * hermana a las capas de una misma ejecución (re-correr las reemplaza
 * juntas) y `nombre` visible (etiqueta de la capa o nombre del run).
 */
export async function crearSurveysPlanner(
  ctx: ContextoPlanner,
  etiquetas: (string | null)[],
  configuracion: Record<string, unknown>,
  fuente: string
): Promise<RunPlanner> {
  const supabase = createClient();
  const runId = uuid();
  const lista = etiquetas.length > 0 ? etiquetas : [null];
  const filas = lista.map((etiqueta) => ({
    project_id: ctx.proyectoId,
    rol: ctx.rol,
    fuente,
    status: "en_progreso",
    configuracion: {
      ...configuracion,
      runId,
      nombre: etiqueta ?? (configuracion.nombre as string | undefined) ?? "Levantamiento",
      etiqueta,
    },
  }));
  const { data, error } = await supabase
    .from("surveys")
    .insert(filas)
    .select("id, configuracion");
  if (error || !data) {
    throw new Error(`No se pudo crear el levantamiento: ${error?.message}`);
  }
  const surveys = new Map<string | null, string>();
  (data as { id: string; configuracion: { etiqueta?: string | null } }[]).forEach(
    (f) => surveys.set(f.configuracion?.etiqueta ?? null, f.id)
  );
  return { runId, surveys, guardados: new Set() };
}

const LOTE_PUNTOS = 500;

/** Survey destino de un POI: por su capa/categoría/término; si no
 * matchea ninguna etiqueta, va al primer survey del run. */
function surveyDe(run: RunPlanner, p: Poi): string {
  const candidatos = [p.capa, p.categoria, p.termino];
  for (const c of candidatos) {
    if (c && run.surveys.has(c)) return run.surveys.get(c)!;
  }
  return run.surveys.values().next().value!;
}

/**
 * AUTOSAVE de puntos: inserta solo los POIs que aún no se han
 * persistido en este run (dedupe por place_id), en lotes de 500.
 * Nunca lanza — un fallo de autosave no debe tirar la búsqueda.
 */
export async function guardarPuntosPlanner(
  run: RunPlanner,
  pois: Poi[]
): Promise<number> {
  const nuevos = pois.filter((p) => !run.guardados.has(p.placeId));
  if (nuevos.length === 0) return 0;
  const supabase = createClient();
  let insertados = 0;
  for (let i = 0; i < nuevos.length; i += LOTE_PUNTOS) {
    const lote = nuevos.slice(i, i + LOTE_PUNTOS);
    const { error } = await supabase.from("survey_points").insert(
      lote.map((p) => ({
        survey_id: surveyDe(run, p),
        place_id: p.placeId,
        nombre: p.nombre,
        direccion: p.direccion || null,
        lat: p.lat,
        lng: p.lng,
        cp: p.cp ?? null,
        categoria: p.categoria ?? p.termino ?? null,
        metadata: {
          fuente: p.fuente,
          estrato: p.estrato ?? null,
          termino: p.termino ?? null,
          capa: p.capa ?? null,
          distancia_m: p.distancia,
          origen_idx: p.origenIdx,
        },
      }))
    );
    if (error) {
      console.error("Autosave de puntos falló:", error.message);
      return insertados;
    }
    lote.forEach((p) => run.guardados.add(p.placeId));
    insertados += lote.length;
  }
  return insertados;
}

/**
 * REESCRITURA final al completar: el autosave incremental guarda los
 * puntos con datos provisionales (distancia/origen del lote, sin CP en
 * modo por CP); al terminar se reemplazan por la lista FINAL limpia
 * (distancias reasignadas, CP resuelto, capa/término definitivos).
 */
export async function reescribirPuntosPlanner(
  run: RunPlanner,
  lista: Poi[]
): Promise<void> {
  try {
    const supabase = createClient();
    await supabase
      .from("survey_points")
      .delete()
      .in("survey_id", Array.from(run.surveys.values()));
    run.guardados = new Set();
    await guardarPuntosPlanner(run, lista);
  } catch (e) {
    console.error("No se pudieron reescribir los puntos finales:", e);
  }
}

/** Actualiza progreso/status de TODOS los surveys del run (cualquiera
 * de las capas hermanas puede reanudar la ejecución completa). */
export async function actualizarRunPlanner(
  run: RunPlanner,
  campos: {
    status?: "en_progreso" | "completado" | "interrumpido";
    progreso?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    const supabase = createClient();
    await supabase
      .from("surveys")
      .update(campos)
      .in("id", Array.from(run.surveys.values()));
  } catch (e) {
    console.error("No se pudo actualizar el progreso del levantamiento:", e);
  }
}

/** Guarda los universos calculados en cada survey del run (el universo
 * es del territorio del run; la consolidación multi-survey llega en F4). */
export async function guardarUniversosPlanner(
  run: RunPlanner,
  universos: Universos
): Promise<void> {
  try {
    const supabase = createClient();
    const ids = Array.from(run.surveys.values());
    // reemplaza cualquier universo previo del run (re-cálculos)
    await supabase.from("survey_universes").delete().in("survey_id", ids);
    await supabase.from("survey_universes").insert(
      ids.map((survey_id) => ({
        survey_id,
        resultados: { ...universos, porAgeb: undefined, agebsGeo: undefined },
      }))
    );
  } catch (e) {
    console.error("No se pudieron guardar los universos del levantamiento:", e);
  }
}

/** Puntos de un survey convertidos de vuelta a Poi (semilla de
 * reanudación y mapa del proyecto). */
export interface PuntoSurvey {
  place_id: string;
  nombre: string;
  direccion: string | null;
  lat: number;
  lng: number;
  cp: string | null;
  categoria: string | null;
  metadata: {
    fuente?: string;
    estrato?: string | null;
    termino?: string | null;
    capa?: string | null;
    distancia_m?: number;
    origen_idx?: number;
    /** Campos a la medida (p. ej. el cruce OOH: tipo, medio,
     * impresiones y las relaciones pdvs[]). */
    [extra: string]: unknown;
  } | null;
}

export function puntoAPoi(r: PuntoSurvey): Poi {
  return {
    placeId: r.place_id,
    nombre: r.nombre,
    direccion: r.direccion ?? "",
    lat: r.lat,
    lng: r.lng,
    types: [],
    distancia: r.metadata?.distancia_m ?? 0,
    origenIdx: r.metadata?.origen_idx ?? 0,
    fuente: (r.metadata?.fuente as Poi["fuente"]) ?? "google",
    estrato: r.metadata?.estrato ?? null,
    cp: r.cp,
    capa: r.metadata?.capa ?? null,
    termino: r.metadata?.termino ?? null,
    categoria: r.categoria,
  };
}

/** Inserta filas de puntos CRUDAS (metadata a la medida — p. ej. el
 * cruce OOH guarda por pantalla sus PDVs apoyados con distancias). */
export async function insertarPuntosCrudos(
  run: RunPlanner,
  filas: {
    place_id: string;
    nombre: string;
    direccion?: string | null;
    lat: number;
    lng: number;
    cp?: string | null;
    categoria?: string | null;
    metadata?: Record<string, unknown> | null;
  }[]
): Promise<void> {
  const supabase = createClient();
  const surveyId = run.surveys.values().next().value!;
  for (let i = 0; i < filas.length; i += LOTE_PUNTOS) {
    const { error } = await supabase.from("survey_points").insert(
      filas.slice(i, i + LOTE_PUNTOS).map((f) => ({ survey_id: surveyId, ...f }))
    );
    if (error) throw new Error(`No se pudieron guardar los puntos: ${error.message}`);
  }
}

/** Puntos CRUDOS de un survey (con metadata completa — p. ej. las
 * relaciones pantalla→PDV de un cruce OOH), paginado. */
export async function cargarPuntosCrudosSurvey(
  surveyId: string
): Promise<PuntoSurvey[]> {
  const supabase = createClient();
  const filas: PuntoSurvey[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("survey_points")
      .select("place_id, nombre, direccion, lat, lng, cp, categoria, metadata")
      .eq("survey_id", surveyId)
      .order("id")
      .range(desde, desde + 999);
    if (error) break;
    filas.push(...((data ?? []) as unknown as PuntoSurvey[]));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

/** Carga TODOS los puntos de una lista de surveys (paginado 1000). */
export async function cargarPuntosSurveys(
  surveyIds: string[]
): Promise<Map<string, Poi[]>> {
  const supabase = createClient();
  const salida = new Map<string, Poi[]>();
  for (const id of surveyIds) {
    const puntos: Poi[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase
        .from("survey_points")
        .select("place_id, nombre, direccion, lat, lng, cp, categoria, metadata, survey_id")
        .eq("survey_id", id)
        .order("id")
        .range(desde, desde + 999);
      if (error) break;
      (data as unknown as PuntoSurvey[]).forEach((r) => puntos.push(puntoAPoi(r)));
      if (!data || data.length < 1000) break;
    }
    salida.set(id, puntos);
  }
  return salida;
}

/** Carga un run COMPLETO para reanudar/re-correr: el survey pedido,
 * sus capas hermanas (mismo runId) y todos sus puntos. */
export async function cargarRunParaReanudar(surveyId: string): Promise<{
  configuracion: Record<string, unknown>;
  progreso: Record<string, unknown> | null;
  status: string;
  rol: RolLevantamiento;
  run: RunPlanner;
  puntos: Poi[];
} | null> {
  const supabase = createClient();
  const { data: s, error } = await supabase
    .from("surveys")
    .select("id, project_id, rol, configuracion, progreso, status")
    .eq("id", surveyId)
    .maybeSingle();
  if (error || !s) return null;
  const config = (s.configuracion ?? {}) as Record<string, unknown>;
  const runId = (config.runId as string) ?? s.id;
  // capas hermanas del mismo run
  const { data: hermanos } = await supabase
    .from("surveys")
    .select("id, configuracion")
    .eq("project_id", s.project_id)
    .eq("rol", s.rol)
    .eq("configuracion->>runId", runId);
  const surveys = new Map<string | null, string>();
  ((hermanos ?? []) as { id: string; configuracion: { etiqueta?: string | null } }[]).forEach(
    (h) => surveys.set(h.configuracion?.etiqueta ?? null, h.id)
  );
  if (surveys.size === 0) surveys.set(null, s.id);
  const porSurvey = await cargarPuntosSurveys(Array.from(surveys.values()));
  const puntos: Poi[] = [];
  const guardados = new Set<string>();
  porSurvey.forEach((lista) => {
    for (const p of lista) {
      if (!guardados.has(p.placeId)) {
        guardados.add(p.placeId);
        puntos.push(p);
      }
    }
  });
  return {
    configuracion: config,
    progreso: (s.progreso as Record<string, unknown>) ?? null,
    status: s.status,
    rol: s.rol as RolLevantamiento,
    run: { runId, surveys, guardados },
    puntos,
  };
}
