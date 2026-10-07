// PLANNER F2 — persistencia de levantamientos. El motor de búsqueda es
// el MISMO del modo consulta (SeekerApp): cuando corre con contexto de
// Planner, estas funciones guardan los resultados al proyecto como
// surveys con rol — creación por capa (una capa = un survey), puntos
// por lote conforme llegan (autosave), universos y progreso para
// reanudar sin repagar consultas. Todo vía Supabase con RLS de equipo.

import { matchersDe, terminoQueCaptura } from "./filtro-nombre";
import { marcaNormalizada, masEspecifica } from "./marcas";
import { createClient } from "./supabase/client";
import { calcularUniversosCliente } from "./universos-lotes";
import type {
  DescartePoi,
  GeocercaUniverso,
  Origin,
  Poi,
  RolLevantamiento,
  Universos,
  Viewport,
} from "./types";

export interface ContextoPlanner {
  proyectoId: string;
  rol: RolLevantamiento;
  /** Nombre del cliente para el banner del buscador. */
  nombreCliente?: string;
  /** true cuando el buscador vive EMBEBIDO dentro del plan (sección
   * Buscador, v2 F1): sin header global ni link "volver al plan". */
  embebido?: boolean;
  /** Aviso al plan contenedor cuando un run se persiste/finaliza, para
   * refrescar su lista de levantamientos. */
  alGuardar?: () => void;
}

export const ETIQUETA_ROL: Record<RolLevantamiento, string> = {
  // en BD el rol sigue siendo 'poi_propio'; en UI siempre la semántica
  // correcta: puntos de interés (los del plan, no solo "propios")
  poi_propio: "Puntos de interés",
  competencia: "Competencia",
  proximidad: "Proximidad",
  ooh: "OOH",
  exploracion: "Exploración",
  geotargeting: "Geo-Targeting",
};

/** Espectros de color por ROL (consistentes con la semántica de la
 * app: propios en cian/azules, competencia en magenta/cálidos). */
export const PALETAS_ROL: Record<RolLevantamiento, string[]> = {
  poi_propio: ["#2fb9e8", "#7fd4f2", "#1e8ab4", "#a5e3f7", "#17607f", "#60a5fa"],
  competencia: ["#f4368a", "#ff8c42", "#f7d154", "#c0399f", "#ff6b6b", "#f79ac0"],
  proximidad: ["#9d5cf0", "#c9a8f7", "#7a3fd1", "#b57ef5", "#d8b4fe", "#8b5cf6"],
  ooh: ["#ff8c42", "#f7d154", "#fdba74", "#fb923c", "#fde68a", "#f59e0b"],
  // exploración: teales/esmeralda — neutral, distinto de las tácticas
  exploracion: ["#2dd4bf", "#5eead4", "#14b8a6", "#99f6e4", "#0d9488", "#34d399"],
  geotargeting: ["#2dd4bf", "#5eead4", "#14b8a6", "#99f6e4", "#0d9488", "#34d399"],
};

export function colorSurvey(rol: RolLevantamiento, indice: number): string {
  const paleta = PALETAS_ROL[rol];
  return paleta[indice % paleta.length];
}

/** Color ESTABLE por capa: hash del nombre normalizado sobre la paleta
 * del rol. La misma marca recibe el MISMO color en todas las plazas,
 * mapas y exports del proyecto — los mapas de Monterrey y Cancún son
 * comparables entre sí (auditoría 30-sep). */
export function colorCapaEstable(rol: RolLevantamiento, nombre: string): string {
  const paleta = PALETAS_ROL[rol];
  const clave = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  let h = 5381;
  for (let i = 0; i < clave.length; i++) {
    h = ((h << 5) + h + clave.charCodeAt(i)) | 0; // djb2
  }
  return paleta[Math.abs(h) % paleta.length];
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
          // giro de Google: materia prima de la depuración por
          // coherencia de tipos y de futuros análisis
          types: (p.types ?? []).slice(0, 8),
          // agrupador de marca + estatus del negocio (auditoría 30-sep)
          marca: marcaNormalizada(p.nombre, p.termino),
          business_status: p.businessStatus ?? null,
          // trazabilidad del rescate manual (panel de descartados)
          ...(p.rescatado ? { origen: "rescatado_manual" } : {}),
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

/**
 * Universos POR CAPA: el universo de cada survey del run se calcula
 * sobre la unión de buffers de SUS PROPIOS puntos (los 44 de JAC → los
 * buffers de esos 44; los 69 de BYD → los suyos), con el radio del
 * análisis. Los orígenes de la búsqueda solo definen DÓNDE buscar, no
 * el territorio de la capa — por eso cada marca reporta un universo
 * DISTINTO y proporcional a la cantidad/dispersión de sus puntos.
 * Nunca lanza: un fallo de universos no debe tirar el guardado.
 */
export async function guardarUniversosPorCapa(
  run: RunPlanner,
  puntos: Poi[],
  radioM: number,
  onEstado?: (texto: string) => void
): Promise<void> {
  try {
    // influencia por punto ACOTADA: el radio de búsqueda/cercanía no es
    // radio de buffer (ver RADIO_MAX_CAPA_M)
    const radioCapa = Math.min(radioM, RADIO_MAX_CAPA_M);
    const supabase = createClient();
    const entradas = Array.from(run.surveys.entries());
    for (let i = 0; i < entradas.length; i++) {
      const [etiqueta, surveyId] = entradas[i];
      const propios =
        etiqueta === null
          ? puntos
          : puntos.filter(
              (p) =>
                p.capa === etiqueta ||
                p.categoria === etiqueta ||
                p.termino === etiqueta
            );
      // recálculos: el universo previo del survey se reemplaza
      await supabase.from("survey_universes").delete().eq("survey_id", surveyId);
      if (propios.length === 0) continue;
      const nombreCapa = etiqueta ?? "la capa";
      onEstado?.(
        `Universo de ${nombreCapa} (${i + 1} de ${entradas.length}) · ${propios.length.toLocaleString("es-MX")} puntos…`
      );
      const geocercas: GeocercaUniverso[] = propios.map((p, j) => ({
        id: `${surveyId.slice(0, 8)}:${j}`,
        lat: p.lat,
        lng: p.lng,
        radio_m: radioCapa,
      }));
      const u = await calcularUniversosCliente(
        geocercas,
        `población a ${radioCapa} m de los ${propios.length.toLocaleString("es-MX")} puntos de la capa`,
        {
          onProgreso: (lote, total) =>
            onEstado?.(
              `Universo de ${nombreCapa} (${i + 1} de ${entradas.length}) · lote ${lote + 1} de ${total}…`
            ),
        }
      );
      if (!u.disponible) continue;
      await supabase.from("survey_universes").insert({
        survey_id: surveyId,
        resultados: { ...u, porAgeb: undefined, agebsGeo: undefined },
      });
    }
  } catch (e) {
    console.error("No se pudieron guardar los universos por capa:", e);
  }
}

/**
 * DEPURACIÓN de un run YA PERSISTIDO: borra los puntos excluidos de
 * survey_points y marca cada survey afectado en su configuración con
 * `depurados` (acumulado), `depurado_en` (vuelve desactualizado al
 * consolidado del proyecto) y `universos_desactualizados` (badge ⚠ y
 * botón ⟳ Universo en ámbar) — ningún número viejo pasa por bueno.
 * Si el flujo recalcula los universos ahí mismo, que limpie la marca
 * con marcarUniversosActualizados.
 */
export async function depurarRunPersistido(
  run: RunPlanner,
  excluidos: Poi[]
): Promise<void> {
  const supabase = createClient();
  const surveyIds = Array.from(run.surveys.values());
  const ids = excluidos.map((p) => p.placeId);
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase
      .from("survey_points")
      .delete()
      .in("survey_id", surveyIds)
      .in("place_id", ids.slice(i, i + 100));
    if (error) {
      throw new Error(`No se pudieron excluir los puntos: ${error.message}`);
    }
  }
  // conteo por survey con la misma regla de asignación del guardado
  // (capa/categoría/término → survey de esa etiqueta; si no, el primero)
  const porSurvey = new Map<string, number>();
  for (const p of excluidos) {
    const etiqueta = [p.capa, p.categoria, p.termino].find(
      (c) => c && run.surveys.has(c)
    );
    const id = etiqueta ? run.surveys.get(etiqueta)! : surveyIds[0];
    porSurvey.set(id, (porSurvey.get(id) ?? 0) + 1);
  }
  const { data } = await supabase
    .from("surveys")
    .select("id, configuracion")
    .in("id", surveyIds);
  const ahora = new Date().toISOString();
  for (const s of (data ?? []) as {
    id: string;
    configuracion: Record<string, unknown> | null;
  }[]) {
    const n = porSurvey.get(s.id) ?? 0;
    if (n === 0) continue;
    await supabase
      .from("surveys")
      .update({
        configuracion: {
          ...(s.configuracion ?? {}),
          depurados: (Number(s.configuracion?.depurados) || 0) + n,
          depurado_en: ahora,
          universos_desactualizados: true,
        },
      })
      .eq("id", s.id);
  }
}

/** Quita la marca `universos_desactualizados` de los surveys cuyos
 * universos acaban de recalcularse. Nunca lanza. */
export async function marcarUniversosActualizados(
  surveyIds: string[]
): Promise<void> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("surveys")
      .select("id, configuracion")
      .in("id", surveyIds);
    for (const s of (data ?? []) as {
      id: string;
      configuracion: Record<string, unknown> | null;
    }[]) {
      if (!s.configuracion?.universos_desactualizados) continue;
      const cfg = { ...s.configuracion };
      delete cfg.universos_desactualizados;
      await supabase.from("surveys").update({ configuracion: cfg }).eq("id", s.id);
    }
  } catch (e) {
    console.error("No se pudo limpiar la marca de universos:", e);
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
  /** FASE 18 — detalle por punto: adultos 18+ del buffer INDIVIDUAL
   * del punto (radio del análisis) y NSE dominante de su zona. Se
   * calculan al primer export y quedan persistidos. */
  universo_individual?: number | null;
  nse_dominante?: string | null;
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
    types: (r.metadata?.types as string[] | undefined) ?? [],
    businessStatus: (r.metadata?.business_status as string | null) ?? null,
    rescatado: r.metadata?.origen === "rescatado_manual" || undefined,
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
      .select("place_id, nombre, direccion, lat, lng, cp, categoria, metadata, universo_individual, nse_dominante")
      .eq("survey_id", surveyId)
      .order("id")
      .range(desde, desde + 999);
    if (error) break;
    filas.push(...((data ?? []) as unknown as PuntoSurvey[]));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

/** NOTA METODOLÓGICA del detalle por punto (tabla, exports y PDF). */
export const NOTA_DETALLE_PUNTO =
  "Universo del radio individual de cada punto; los radios cercanos comparten población (la suma de individuales excede al consolidado deduplicado) — para presupuesto son PESOS RELATIVOS de cada punto, no poblaciones exclusivas.";

/** Radio del detalle por punto de un levantamiento: el radio del
 * análisis (modo orígenes) o el radio de influencia (recolección). */
export function radioDetalleDe(cfg: Record<string, unknown> | null): number {
  const r = Number(cfg?.radius);
  if (Number.isFinite(r) && r > 0) return r;
  const ri = Number(cfg?.radioInfluencia);
  if (Number.isFinite(ri) && ri > 0) return ri;
  return 500;
}

/**
 * DETALLE POR PUNTO de un levantamiento: universo 18+ y NSE dominante
 * del buffer INDIVIDUAL de cada punto, calculado con la maquinaria por
 * lotes (PostGIS propio — 0 consultas a APIs externas) y persistido en
 * survey_points. Corre al Calcular de las secciones (Proximidad es su
 * caso de uso: asignación de presupuesto por PDV) y retroactivamente
 * con el botón "Detalle por punto" — sin re-pagar nada.
 */
export async function calcularDetallePorPuntoSurvey(
  surveyId: string,
  radioM: number,
  onEstado?: (texto: string) => void,
  opciones?: { incluirExistentes?: boolean }
): Promise<{ calculados: number; pendientes: number; total: number }> {
  const { calcularUniversosPorGeocerca } = await import("./universos-lotes");
  const { clasificarNse } = await import("./nse");
  const crudos = await cargarPuntosCrudosSurvey(surveyId);
  const pendientes = opciones?.incluirExistentes
    ? crudos
    : crudos.filter((p) => p.universo_individual == null);
  if (pendientes.length === 0) {
    return { calculados: 0, pendientes: 0, total: crudos.length };
  }
  onEstado?.(
    `Detalle por punto · ${pendientes.length.toLocaleString("es-MX")} puntos…`
  );
  const porId = await calcularUniversosPorGeocerca(
    pendientes.map((p, i) => ({
      id: `${i}`,
      lat: p.lat,
      lng: p.lng,
      radio_m: radioM,
    })),
    {
      onProgreso: (lote, total) =>
        onEstado?.(`Detalle por punto · lote ${lote + 1} de ${total}…`),
    }
  );
  const nuevos = new Map<string, { universo: number; nse: string | null }>();
  pendientes.forEach((p, i) => {
    const g = porId.get(`${i}`);
    if (!g) return;
    nuevos.set(p.place_id, {
      universo: Math.round(g.adultos18),
      nse: clasificarNse(g.nse_proxy)?.etiqueta ?? null,
    });
  });
  if (nuevos.size > 0) await guardarDetallePuntos(surveyId, nuevos);
  return {
    calculados: nuevos.size,
    pendientes: pendientes.length,
    total: crudos.length,
  };
}

/**
 * FASE 18 — persiste el detalle por punto (universo 18+ del buffer
 * individual + NSE dominante) en survey_points, para no recalcular en
 * cada export. Updates por place_id en tandas concurrentes acotadas.
 * Nunca lanza: sin detalle guardado, el export lo recalcula.
 */
export async function guardarDetallePuntos(
  surveyId: string,
  detalles: Map<string, { universo: number; nse: string | null }>
): Promise<void> {
  try {
    const supabase = createClient();
    const entradas = Array.from(detalles.entries());
    const TANDA = 12;
    for (let i = 0; i < entradas.length; i += TANDA) {
      await Promise.all(
        entradas.slice(i, i + TANDA).map(([placeId, d]) =>
          supabase
            .from("survey_points")
            .update({
              universo_individual: d.universo,
              nse_dominante: d.nse,
            })
            .eq("survey_id", surveyId)
            .eq("place_id", placeId)
        )
      );
    }
  } catch (e) {
    console.error("No se pudo guardar el detalle por punto:", e);
  }
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

// ------------------------------------------------------------------
// F4 — geometría de un survey para el universo CONSOLIDADO del
// proyecto: cada levantamiento aporta sus geocercas y la pieza única
// de universos calcula sobre la UNIÓN deduplicada (ST_Union por lotes).
// ------------------------------------------------------------------

/** Buffer alrededor de los puntos censados (censo de marca y
 * territorial) para el consolidado — el mismo criterio de "población a
 * 500 m de los puntos" del panel individual. */
export const RADIO_INFLUENCIA_CONSOLIDADO = 500;

/** TOPE del buffer de INFLUENCIA por punto en capas de COMPETENCIA: el
 * radio de cercanía (5-20 km) define DÓNDE BUSCAR rivales, no cuánta
 * población "pertenece" a cada rival — usarlo como buffer inflaba el
 * universo de la capa a metrópolis completas (bug Domino's GDL). La
 * influencia de un punto de competencia se acota a 2 km. */
export const RADIO_MAX_CAPA_M = 2000;

/**
 * Geocercas de un survey según su modo:
 * - cp → polígonos reales de los códigos postales
 * - zone → viewports de las zonas
 * - origins (búsqueda o carga directa) → círculos radio configurado
 *   alrededor de los orígenes
 * - census/territorial → buffers de 500 m alrededor de los puntos
 * - ooh → círculos del radio de cruce alrededor de las pantallas
 * Los ids van prefijados con el survey para no chocar entre surveys.
 */
export function geocercasDeSurvey(
  survey: { id: string; rol: RolLevantamiento; configuracion: Record<string, unknown> },
  puntos: PuntoSurvey[]
): GeocercaUniverso[] {
  const cfg = survey.configuracion ?? {};
  const modo = (cfg.mode as string) ?? "census";
  const pref = survey.id.slice(0, 8);

  if (modo === "cp") {
    return ((cfg.cps as string[]) ?? []).map((cp) => ({
      id: `${pref}:${cp}`,
      cp,
    }));
  }
  if (modo === "zone") {
    return (((cfg.centers as Origin[]) ?? []) as Origin[]).map((c, i) =>
      c.viewport
        ? { id: `${pref}:z${i}`, viewport: c.viewport as Viewport }
        : { id: `${pref}:z${i}`, lat: c.lat, lng: c.lng, radio_m: 1000 }
    );
  }
  if (modo === "origins") {
    const radio = typeof cfg.radius === "number" ? cfg.radius : 1000;
    // COMPETENCIA: los orígenes de la búsqueda solo definen DÓNDE
    // buscar; el territorio de la capa son SUS PROPIOS puntos, con la
    // influencia ACOTADA (el radio de cercanía no es radio de buffer)
    if (survey.rol === "competencia" && puntos.length > 0) {
      return puntos.map((p, i) => ({
        id: `${pref}:p${i}`,
        lat: p.lat,
        lng: p.lng,
        radio_m: Math.min(radio, RADIO_MAX_CAPA_M),
      }));
    }
    const origenes = (cfg.origenes as Origin[]) ?? (cfg.centers as Origin[]) ?? [];
    if (origenes.length > 0) {
      return origenes.map((o, i) => ({
        id: `${pref}:o${i}`,
        lat: o.lat,
        lng: o.lng,
        radio_m: radio,
      }));
    }
    return puntos.map((p, i) => ({
      id: `${pref}:p${i}`,
      lat: p.lat,
      lng: p.lng,
      radio_m: radio,
    }));
  }
  if (modo === "ooh") {
    return puntos.map((p, i) => ({
      id: `${pref}:s${i}`,
      lat: p.lat,
      lng: p.lng,
      radio_m:
        typeof p.metadata?.radio_m === "number"
          ? (p.metadata.radio_m as number)
          : 6000,
    }));
  }
  // census / territorial: buffers alrededor de los puntos censados
  return puntos.map((p, i) => ({
    id: `${pref}:c${i}`,
    lat: p.lat,
    lng: p.lng,
    radio_m: RADIO_INFLUENCIA_CONSOLIDADO,
  }));
}

// ------------------------------------------------------------------
// DESCARTADOS — los puntos que los filtros tiraron YA SE PAGARON: se
// persisten asociados al levantamiento (retención 30 días) para el
// panel de rescate y el re-filtrado sin volver a pagar.
// ------------------------------------------------------------------

/** Fila persistida de un descartado (con su id para rescatar/borrar). */
export interface DescarteGuardado extends DescartePoi {
  id: number;
  survey_id: string;
  run_id: string | null;
}

/** Marca surveys como MODIFICADOS: universos desactualizados (⚠ + ⟳
 * en ámbar) y el consolidado del proyecto por recalcular. Nunca lanza. */
export async function marcarSurveysModificados(
  surveyIds: string[]
): Promise<void> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from("surveys")
      .select("id, configuracion")
      .in("id", surveyIds);
    const ahora = new Date().toISOString();
    for (const s of (data ?? []) as {
      id: string;
      configuracion: Record<string, unknown> | null;
    }[]) {
      await supabase
        .from("surveys")
        .update({
          configuracion: {
            ...(s.configuracion ?? {}),
            // depurado_en = última modificación de los PUNTOS (rescate,
            // re-filtrado o depuración): vuelve desactualizado al
            // consolidado, que compara contra esta fecha
            depurado_en: ahora,
            universos_desactualizados: true,
          },
        })
        .eq("id", s.id);
    }
  } catch (e) {
    console.error("No se pudieron marcar los surveys modificados:", e);
  }
}

/** Persiste los descartados de una corrida, ruteados al survey de su
 * término (sin término → el primero). Reemplaza los del run (re-
 * corridas) y hace limpieza oportunista de +30 días. Nunca lanza. */
export async function guardarDescartados(
  run: RunPlanner,
  descartes: DescartePoi[]
): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.from("discarded_points").delete().eq("run_id", run.runId);
    if (descartes.length === 0) return;
    const primero = run.surveys.values().next().value!;
    const filas = descartes.map((d) => ({
      survey_id: (d.termino && run.surveys.get(d.termino)) || primero,
      run_id: run.runId,
      place_id: d.placeId,
      nombre: d.nombre.slice(0, 200),
      direccion: d.direccion?.slice(0, 300) || null,
      lat: d.lat,
      lng: d.lng,
      types: (d.types ?? []).slice(0, 8),
      termino: d.termino,
      motivo: d.motivo,
    }));
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await supabase
        .from("discarded_points")
        .insert(filas.slice(i, i + 500));
      if (error) {
        console.error("No se pudieron guardar los descartados:", error.message);
        return;
      }
    }
    // retención 30 días: limpieza oportunista
    if (Math.random() < 0.05) {
      const corte = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
      await supabase.from("discarded_points").delete().lt("created_at", corte);
    }
  } catch (e) {
    console.error("No se pudieron guardar los descartados:", e);
  }
}

function filaADescarte(r: Record<string, unknown>): DescarteGuardado {
  return {
    id: r.id as number,
    survey_id: r.survey_id as string,
    run_id: (r.run_id as string) ?? null,
    placeId: r.place_id as string,
    nombre: r.nombre as string,
    direccion: (r.direccion as string) ?? "",
    lat: r.lat as number,
    lng: r.lng as number,
    types: (r.types as string[]) ?? [],
    termino: (r.termino as string) ?? null,
    motivo: r.motivo as DescartePoi["motivo"],
  };
}

/** Descartados persistidos de un run o de surveys sueltos (paginado). */
export async function cargarDescartados(filtro: {
  runId?: string;
  surveyIds?: string[];
}): Promise<DescarteGuardado[]> {
  const supabase = createClient();
  const salida: DescarteGuardado[] = [];
  for (let desde = 0; ; desde += 1000) {
    let q = supabase
      .from("discarded_points")
      .select("id, survey_id, run_id, place_id, nombre, direccion, lat, lng, types, termino, motivo")
      .order("id")
      .range(desde, desde + 999);
    if (filtro.runId) q = q.eq("run_id", filtro.runId);
    else if (filtro.surveyIds?.length) q = q.in("survey_id", filtro.surveyIds);
    else return salida;
    const { data, error } = await q;
    if (error) break;
    (data ?? []).forEach((r) => salida.push(filaADescarte(r as Record<string, unknown>)));
    if (!data || data.length < 1000) break;
  }
  return salida;
}

/** Borra descartados de un run por place_id (tras un rescate hecho
 * desde el estado en memoria del modo consulta). Nunca lanza. */
export async function eliminarDescartadosDeRun(
  runId: string,
  placeIds: string[]
): Promise<void> {
  try {
    const supabase = createClient();
    for (let i = 0; i < placeIds.length; i += 150) {
      await supabase
        .from("discarded_points")
        .delete()
        .eq("run_id", runId)
        .in("place_id", placeIds.slice(i, i + 150));
    }
  } catch (e) {
    console.error("No se pudieron borrar los descartados rescatados:", e);
  }
}

/** Conteo de descartados por survey (badge del Planner). */
export async function contarDescartados(
  surveyIds: string[]
): Promise<Record<string, number>> {
  try {
    const supabase = createClient();
    const { data } = await supabase.rpc("descartados_conteo", {
      p_survey_ids: surveyIds,
    });
    return (data as Record<string, number>) ?? {};
  } catch {
    return {};
  }
}

/**
 * RESCATE MANUAL: los descartados seleccionados entran al survey
 * indicado como puntos (metadata.origen = "rescatado_manual" para
 * trazabilidad), salen de discarded_points y el survey queda marcado
 * para recalcular universos. Cero consultas a Google.
 */
export async function rescatarDescartados(
  asignaciones: { surveyId: string; filas: DescarteGuardado[] }[]
): Promise<number> {
  const supabase = createClient();
  let total = 0;
  const surveysTocados: string[] = [];
  for (const { surveyId, filas } of asignaciones) {
    if (filas.length === 0) continue;
    surveysTocados.push(surveyId);
    for (let i = 0; i < filas.length; i += 500) {
      const lote = filas.slice(i, i + 500);
      const { error } = await supabase.from("survey_points").insert(
        lote.map((d) => ({
          survey_id: surveyId,
          place_id: d.placeId,
          nombre: d.nombre,
          direccion: d.direccion || null,
          lat: d.lat,
          lng: d.lng,
          categoria: d.termino,
          metadata: {
            fuente: "google",
            termino: d.termino,
            distancia_m: 0,
            origen_idx: 0,
            types: (d.types ?? []).slice(0, 8),
            origen: "rescatado_manual",
          },
        }))
      );
      if (error) {
        throw new Error(`No se pudieron rescatar los puntos: ${error.message}`);
      }
      const ids = lote.map((d) => d.id);
      await supabase.from("discarded_points").delete().in("id", ids);
      total += lote.length;
    }
  }
  if (surveysTocados.length > 0) {
    await marcarSurveysModificados(surveysTocados);
  }
  return total;
}

// ------------------------------------------------------------------
// DEDUPE ENTRE CAPAS — el dedupe por place_id existe DENTRO de cada
// corrida; entre capas del mismo proyecto un punto podía vivir dos
// veces (capa "pizza" y capa "little caesars"). Regla: el punto se
// queda en la capa de marca MÁS ESPECÍFICA (etiqueta que coincide con
// su marca > etiqueta más específica > la primera) y sale de las demás.
// ------------------------------------------------------------------

export async function deduplicarEntreSurveys(
  surveys: { id: string; nombre: string; etiqueta: string | null }[],
  onEstado?: (texto: string) => void
): Promise<{ eliminados: number; detalle: string[] }> {
  if (surveys.length < 2) {
    throw new Error("Se necesitan al menos 2 capas para deduplicar");
  }
  const supabase = createClient();
  onEstado?.("Cargando los puntos de las capas…");
  interface Ocurrencia {
    surveyId: string;
    etiqueta: string | null;
    placeId: string;
    marca: string;
  }
  const porClave = new Map<string, Ocurrencia[]>();
  const registrar = (clave: string, o: Ocurrencia) => {
    porClave.set(clave, [...(porClave.get(clave) ?? []), o]);
  };
  for (const s of surveys) {
    const crudos = await cargarPuntosCrudosSurvey(s.id);
    for (const p of crudos) {
      const o: Ocurrencia = {
        surveyId: s.id,
        etiqueta: s.etiqueta,
        placeId: p.place_id,
        marca:
          (p.metadata?.marca as string) ||
          marcaNormalizada(p.nombre, (p.metadata?.termino as string) || null),
      };
      registrar(`id:${p.place_id}`, o);
      registrar(`c:${p.lat.toFixed(4)},${p.lng.toFixed(4)}`, o);
    }
  }

  // ganador por clave: etiqueta == marca del punto > etiqueta más
  // específica > la primera capa
  const eliminarDe = new Map<string, Set<string>>(); // surveyId → placeIds
  let eliminados = 0;
  porClave.forEach((lista) => {
    const distintos = new Set(lista.map((o) => `${o.surveyId}:${o.placeId}`));
    if (distintos.size < 2) return;
    const surveysInvolucrados = new Set(lista.map((o) => o.surveyId));
    if (surveysInvolucrados.size < 2) return; // duplicado interno: no es de aquí
    const puntaje = (o: Ocurrencia) => {
      const et = normalizarComparableSeguro(o.etiqueta ?? "");
      if (et && et === o.marca) return 3;
      if (et && (o.marca.startsWith(et) || et.startsWith(o.marca))) return 2;
      return 1;
    };
    const ganador = [...lista].sort((a, b) => {
      const d = puntaje(b) - puntaje(a);
      if (d !== 0) return d;
      const ea = a.etiqueta ?? "";
      const eb = b.etiqueta ?? "";
      if (ea !== eb) return masEspecifica(ea, eb) ? -1 : 1;
      return 0;
    })[0];
    for (const o of lista) {
      if (o.surveyId === ganador.surveyId) continue;
      const set = eliminarDe.get(o.surveyId) ?? new Set<string>();
      if (!set.has(o.placeId)) {
        set.add(o.placeId);
        eliminados++;
      }
      eliminarDe.set(o.surveyId, set);
    }
  });

  if (eliminados === 0) return { eliminados: 0, detalle: [] };
  const detalle: string[] = [];
  const nombreDe = new Map(surveys.map((s) => [s.id, s.nombre]));
  for (const [surveyId, placeIds] of Array.from(eliminarDe.entries())) {
    onEstado?.(
      `Quitando ${placeIds.size.toLocaleString("es-MX")} duplicados de "${nombreDe.get(surveyId)}"…`
    );
    const ids = Array.from(placeIds);
    for (let i = 0; i < ids.length; i += 150) {
      const { error } = await supabase
        .from("survey_points")
        .delete()
        .eq("survey_id", surveyId)
        .in("place_id", ids.slice(i, i + 150));
      if (error) {
        throw new Error(`No se pudieron quitar duplicados: ${error.message}`);
      }
    }
    detalle.push(`${nombreDe.get(surveyId)}: −${placeIds.size}`);
  }
  await marcarSurveysModificados(Array.from(eliminarDe.keys()));
  return { eliminados, detalle };
}

/** normalizarComparable tolerante a vacío (para etiquetas null). */
function normalizarComparableSeguro(s: string): string {
  return s ? marcaNormalizada(s) : "";
}

// ------------------------------------------------------------------
// DIVIDIR EN CAPAS POR MARCA — reparación de un survey MEZCLADO (varios
// términos en un solo levantamiento, p. ej. corrido con "separar en
// capas" apagado): crea un survey por término, REASIGNA los puntos ya
// guardados (cero consultas a Google — el término que capturó cada POI
// está en metadata.termino) y recalcula el universo de cada capa nueva
// con la maquinaria corregida. Los puntos sin término se infieren por
// matching de nombre (mismas reglas del filtro estricto del servidor) y
// los que no matchean van a una capa "Revisar" para ojo humano.
// ------------------------------------------------------------------

/** Etiqueta de la capa de puntos sin marca inferible. */
export const ETIQUETA_REVISAR = "Revisar (sin marca)";

export interface ResultadoDivision {
  capas: { etiqueta: string; puntos: number }[];
  /** Puntos sin término registrado NI inferible (capa "Revisar"). */
  ambiguos: number;
}

export async function dividirSurveyEnCapas(
  surveyId: string,
  onEstado?: (texto: string) => void
): Promise<ResultadoDivision> {
  const supabase = createClient();
  const { data: s, error: errS } = await supabase
    .from("surveys")
    .select("id, project_id, rol, fuente, configuracion")
    .eq("id", surveyId)
    .maybeSingle();
  if (errS || !s) {
    throw new Error("No pude leer el levantamiento a dividir");
  }
  const cfg = (s.configuracion ?? {}) as Record<string, unknown>;

  onEstado?.("Cargando los puntos del levantamiento…");
  const crudos = await cargarPuntosCrudosSurvey(surveyId);
  if (crudos.length === 0) {
    throw new Error("El levantamiento no tiene puntos que dividir");
  }

  // matchers de respaldo, espejo del filtro estricto del servidor
  // (lib/filtro-nombre: la misma pieza del re-filtrado)
  const matchers = matchersDe((cfg.nameFilters as string[]) ?? []);
  const inferir = (nombre: string): string | null =>
    terminoQueCaptura(nombre, matchers);

  // agrupar por término (registrado > inferido > Revisar)
  let grupos = new Map<string, PuntoSurvey[]>();
  let ambiguos = 0;
  for (const p of crudos) {
    let termino = (p.metadata?.termino as string | null) || null;
    if (!termino) termino = inferir(p.nombre);
    if (!termino) {
      termino = ETIQUETA_REVISAR;
      ambiguos++;
    }
    grupos.set(termino, [...(grupos.get(termino) ?? []), p]);
  }
  // sin términos que separen (capa de categoría, o capa "pizza" con
  // varias cadenas adentro): agrupar por MARCA NORMALIZADA — marcas
  // con menos de 3 puntos caen a "Otros"
  if (grupos.size < 2) {
    const porMarca = new Map<string, PuntoSurvey[]>();
    for (const p of crudos) {
      const m = marcaNormalizada(p.nombre, (p.metadata?.termino as string) || null);
      porMarca.set(m, [...(porMarca.get(m) ?? []), p]);
    }
    const nuevas = new Map<string, PuntoSurvey[]>();
    const otros: PuntoSurvey[] = [];
    porMarca.forEach((lista, m) => {
      if (lista.length >= 3) nuevas.set(m, lista);
      else otros.push(...lista);
    });
    if (nuevas.size >= 2) {
      ambiguos = 0;
      if (otros.length > 0) nuevas.set("Otros", otros);
      grupos = nuevas;
    }
  }
  if (grupos.size < 2) {
    throw new Error(
      "Todos los puntos son de la misma marca/término — no hay nada que dividir"
    );
  }

  // un survey COMPLETADO por término, hermanados con un runId nuevo
  const runId = uuid();
  const entradas = Array.from(grupos.entries());
  const capas: ResultadoDivision["capas"] = [];
  for (let i = 0; i < entradas.length; i++) {
    const [etiqueta, puntos] = entradas[i];
    onEstado?.(
      `Creando la capa "${etiqueta}" (${i + 1} de ${entradas.length}) · ${puntos.length.toLocaleString("es-MX")} puntos…`
    );
    const cfgNueva = {
      ...cfg,
      runId,
      nombre: etiqueta,
      etiqueta,
      dividido_de: surveyId,
    };
    const { data: nuevo, error: errN } = await supabase
      .from("surveys")
      .insert({
        project_id: s.project_id,
        rol: s.rol,
        fuente: s.fuente ?? "division",
        status: "completado",
        configuracion: cfgNueva,
      })
      .select("id")
      .single();
    if (errN || !nuevo) {
      throw new Error(`No se pudo crear la capa "${etiqueta}": ${errN?.message}`);
    }
    // REASIGNAR los puntos ya pagados (por place_id, en tandas)
    const ids = puntos.map((p) => p.place_id);
    for (let j = 0; j < ids.length; j += 150) {
      const { error: errM } = await supabase
        .from("survey_points")
        .update({ survey_id: nuevo.id })
        .eq("survey_id", surveyId)
        .in("place_id", ids.slice(j, j + 150));
      if (errM) {
        throw new Error(
          `No se pudieron mover los puntos de "${etiqueta}": ${errM.message}`
        );
      }
    }
    // universo PROPIO de la capa (gratis, PostGIS): buffers de SUS
    // puntos con la influencia acotada (geocercasDeSurvey ya la aplica)
    onEstado?.(
      `Universo de "${etiqueta}" (${i + 1} de ${entradas.length})…`
    );
    const geocercas = geocercasDeSurvey(
      { id: nuevo.id, rol: s.rol as RolLevantamiento, configuracion: cfgNueva },
      puntos
    );
    const u = await calcularUniversosCliente(
      geocercas,
      `población alrededor de los ${puntos.length.toLocaleString("es-MX")} puntos de la capa`,
      {
        onProgreso: (lote, total) =>
          onEstado?.(
            `Universo de "${etiqueta}" · lote ${lote + 1} de ${total}…`
          ),
      }
    );
    if (u.disponible) {
      await supabase.from("survey_universes").insert({
        survey_id: nuevo.id,
        resultados: { ...u, porAgeb: undefined, agebsGeo: undefined },
      });
    }
    capas.push({ etiqueta, puntos: puntos.length });
  }

  // el survey original queda vacío: fuera (cascade limpia sus universos)
  onEstado?.("Retirando el levantamiento mezclado…");
  await supabase.from("surveys").delete().eq("id", surveyId);

  return { capas, ambiguos };
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

// ------------------------------------------------------------------
// v2 F1 — Buscador dentro del plan: promoción y plan de exploración
// ------------------------------------------------------------------

/**
 * PROMUEVE un levantamiento de exploración (o de cualquier sección) a
 * otra sección del plan reasignando su ROL — los puntos, descartados y
 * universos ya pagados se conservan tal cual: 0 consultas a Google.
 */
export async function moverSurveyARol(
  surveyId: string,
  nuevoRol: RolLevantamiento
): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("surveys")
    .select("rol, configuracion")
    .eq("id", surveyId)
    .single();
  if (error || !data) {
    throw new Error(`No se pudo leer el levantamiento: ${error?.message}`);
  }
  const config = (data.configuracion as Record<string, unknown>) ?? {};
  const { error: errorUpd } = await supabase
    .from("surveys")
    .update({
      rol: nuevoRol,
      configuracion: {
        ...config,
        promovido_de: data.rol,
        promovido_en: new Date().toISOString(),
      },
    })
    .eq("id", surveyId);
  if (errorUpd) {
    throw new Error(`No se pudo mover el levantamiento: ${errorUpd.message}`);
  }
}

/**
 * Plan personal de EXPLORACIÓN del usuario (tipo 'exploracion'): el
 * espacio de búsquedas libres que reemplaza al modo consulta viejo.
 * Se crea automático la primera vez que se necesita; regresa su id.
 */
export async function asegurarPlanExploracion(
  usuarioId: string
): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("creado_por", usuarioId)
    .eq("tipo", "exploracion")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id as string;
  const { data: nuevo, error } = await supabase
    .from("projects")
    .insert({
      nombre_cliente: "Exploración",
      titulo: "Búsquedas libres — tu espacio personal",
      creado_por: usuarioId,
      tipo: "exploracion",
    })
    .select("id")
    .single();
  if (error || !nuevo) {
    throw new Error(`No se pudo crear el plan de exploración: ${error?.message}`);
  }
  return nuevo.id as string;
}
