// RECÁLCULO DEL PLAN — una sola pieza para el universo de un
// levantamiento, el consolidado deduplicado y los traslapes entre
// roles. La usan el Resumen del proyecto (botones manuales) y el
// recálculo AUTOMÁTICO que corre al borrar/restaurar puntos en la
// vista Puntos. Todo con la maquinaria de universos existente
// (PostGIS propio, techo de sanidad incluido): 0 consultas a Google.

import {
  cargarPuntosCrudosSurvey,
  contarExcluidos,
  ETIQUETA_ROL,
  geocercasDeSurvey,
  type PuntoSurvey,
} from "./planner";
import { createClient } from "./supabase/client";
import { calcularUniversosCliente } from "./universos-lotes";
import type { GeocercaUniverso, RolLevantamiento, Universos } from "./types";

/** Lo mínimo de un survey para armar su geometría. */
export interface SurveyGeometria {
  id: string;
  rol: RolLevantamiento;
  configuracion: Record<string, unknown>;
}

export interface ComposicionConsolidado {
  id: string;
  nombre: string;
  rol: string;
}

export interface TraslapePlan {
  roles: [RolLevantamiento, RolLevantamiento];
  poblacion: number;
  /** % del universo BASE (el MENOR de los dos: una intersección jamás
   * puede exceder a ninguno de sus conjuntos). */
  pctBase: number;
  base: RolLevantamiento;
  poblacionBase: number;
  /** Validación: la intersección excedió al universo menor (doble
   * conteo) — visible y BLOQUEA el export hasta recalcular. */
  advertencia?: string;
}

const ORDEN_ROLES: RolLevantamiento[] = [
  "poi_propio",
  "competencia",
  "proximidad",
  "ooh",
];

const fmt = (n: number) => n.toLocaleString("es-MX");

export const nombreDeSurvey = (s: SurveyGeometria) =>
  (s.configuracion?.nombre as string) ?? ETIQUETA_ROL[s.rol];

/** Puntos ACTIVOS que la geometría del survey necesita. cp/zone/
 * orígenes-con-config no los usan (geotargeting tampoco: sus geocercas
 * salen de sus CPs); COMPETENCIA siempre (su territorio son SUS puntos,
 * no los orígenes donde se buscó). */
export async function puntosParaGeometria(
  s: SurveyGeometria,
  cache?: Map<string, PuntoSurvey[]>
): Promise<PuntoSurvey[]> {
  const enCache = cache?.get(s.id);
  if (enCache) return enCache;
  const modo = (s.configuracion?.mode as string) ?? "census";
  const necesitaPuntos =
    s.rol !== "geotargeting" &&
    (modo === "census" ||
      modo === "territorial" ||
      modo === "ooh" ||
      s.rol === "competencia" ||
      (modo === "origins" &&
        !((s.configuracion?.origenes as unknown[])?.length ?? 0) &&
        !((s.configuracion?.centers as unknown[])?.length ?? 0)));
  if (!necesitaPuntos) return [];
  const crudos = await cargarPuntosCrudosSurvey(s.id);
  cache?.set(s.id, crudos);
  return crudos;
}

export async function geocercasDeSurveys(
  lista: SurveyGeometria[],
  cache?: Map<string, PuntoSurvey[]>
): Promise<GeocercaUniverso[]> {
  const salida: GeocercaUniverso[] = [];
  for (const s of lista) {
    salida.push(...geocercasDeSurvey(s, await puntosParaGeometria(s, cache)));
  }
  return salida;
}

/** Universo de UN levantamiento sobre la geometría de sus puntos
 * activos; lo guarda y quita la marca de desactualizado. Sin geometría
 * (todos sus puntos borrados) el universo guardado se retira. */
export async function calcularYGuardarUniversoSurvey(
  s: SurveyGeometria,
  onEstado?: (texto: string) => void
): Promise<Universos> {
  const supabase = createClient();
  const crudos = await cargarPuntosCrudosSurvey(s.id);
  // sin puntos activos no hay capa (aunque su configuración conserve
  // los orígenes de la búsqueda): el universo se retira
  const geocercas =
    s.rol !== "geotargeting" && crudos.length === 0
      ? []
      : geocercasDeSurvey(s, crudos);
  if (geocercas.length === 0) {
    await supabase.from("survey_universes").delete().eq("survey_id", s.id);
    return {
      disponible: false,
      mensaje: "Este levantamiento no tiene geometría para calcular universos",
    };
  }
  const u = await calcularUniversosCliente(
    geocercas,
    `recalculado sobre ${fmt(geocercas.length)} geocercas propias de la capa`,
    {
      onProgreso: (lote, total) => onEstado?.(`lote ${lote + 1} de ${total}…`),
    }
  );
  if (!u.disponible) return u;
  await supabase.from("survey_universes").delete().eq("survey_id", s.id);
  await supabase.from("survey_universes").insert({
    survey_id: s.id,
    resultados: { ...u, porAgeb: undefined, agebsGeo: undefined },
  });
  // el universo ya corresponde a los puntos activos: se quita la marca
  // (se relee la configuración: pudo cambiar mientras corría el cálculo)
  const { data } = await supabase
    .from("surveys")
    .select("configuracion")
    .eq("id", s.id)
    .maybeSingle();
  const cfg = (data?.configuracion ?? null) as Record<string, unknown> | null;
  if (cfg?.universos_desactualizados) {
    const cfgLimpia = { ...cfg };
    delete cfgLimpia.universos_desactualizados;
    await supabase.from("surveys").update({ configuracion: cfgLimpia }).eq("id", s.id);
  }
  return u;
}

/** Consolidado deduplicado de los surveys dados: lo calcula y reemplaza
 * la fila guardada del proyecto. */
export async function calcularYGuardarConsolidado(
  proyectoId: string,
  seleccionados: SurveyGeometria[],
  onEstado?: (texto: string) => void,
  cache?: Map<string, PuntoSurvey[]>
): Promise<{
  universos: Universos;
  composicion: ComposicionConsolidado[];
  created_at: string;
}> {
  const geocercas = await geocercasDeSurveys(seleccionados, cache);
  const criterio = `unión deduplicada de ${seleccionados.length} ${seleccionados.length === 1 ? "levantamiento" : "levantamientos"} (${fmt(geocercas.length)} geocercas)`;
  const u = await calcularUniversosCliente(geocercas, criterio, {
    onProgreso: (lote, total) =>
      onEstado?.(`Calculando universo consolidado · lote ${lote + 1} de ${total}…`),
  });
  if (!u.disponible) {
    throw new Error(u.mensaje ?? "No se pudo calcular el consolidado");
  }
  const composicion = seleccionados.map((s) => ({
    id: s.id,
    nombre: nombreDeSurvey(s),
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
  return {
    universos: u,
    composicion,
    created_at: data?.created_at ?? new Date().toISOString(),
  };
}

/** Traslapes entre ROLES por inclusión-exclusión:
 * pob(A∩B) = pob(A) + pob(B) − pob(A∪B). Reemplaza los guardados. */
export async function calcularYGuardarTraslapes(
  proyectoId: string,
  seleccionados: SurveyGeometria[],
  onEstado?: (texto: string) => void,
  cache?: Map<string, PuntoSurvey[]>
): Promise<TraslapePlan[]> {
  const porRol = new Map<RolLevantamiento, SurveyGeometria[]>();
  for (const s of seleccionados) {
    porRol.set(s.rol, [...(porRol.get(s.rol) ?? []), s]);
  }
  const roles = ORDEN_ROLES.filter((r) => porRol.has(r));
  if (roles.length < 2) {
    throw new Error(
      "Se necesitan levantamientos de al menos 2 roles para calcular traslapes"
    );
  }
  // 1) universo por rol (unión de sus surveys)
  const geocercasRol = new Map<RolLevantamiento, GeocercaUniverso[]>();
  const universoRol = new Map<RolLevantamiento, number>();
  for (let i = 0; i < roles.length; i++) {
    const rol = roles[i];
    onEstado?.(`Universo de ${ETIQUETA_ROL[rol]} (${i + 1} de ${roles.length})…`);
    const g = await geocercasDeSurveys(porRol.get(rol)!, cache);
    geocercasRol.set(rol, g);
    const u = await calcularUniversosCliente(g, `rol ${rol}`, {
      onProgreso: (lote, total) =>
        onEstado?.(
          `Universo de ${ETIQUETA_ROL[rol]} · lote ${lote + 1} de ${total}…`
        ),
    });
    universoRol.set(rol, u.disponible ? u.residencial!.poblacion : 0);
  }
  // 2) pares: inclusión-exclusión con el universo de la UNIÓN
  const resultados: TraslapePlan[] = [];
  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      const a = roles[i];
      const b = roles[j];
      onEstado?.(`Traslape ${ETIQUETA_ROL[a]} × ${ETIQUETA_ROL[b]}…`);
      const union = await calcularUniversosCliente(
        [...geocercasRol.get(a)!, ...geocercasRol.get(b)!],
        `unión ${a}+${b}`,
        {
          onProgreso: (lote, total) =>
            onEstado?.(
              `Traslape ${ETIQUETA_ROL[a]} × ${ETIQUETA_ROL[b]} · lote ${lote + 1} de ${total}…`
            ),
        }
      );
      const pobA = universoRol.get(a) ?? 0;
      const pobB = universoRol.get(b) ?? 0;
      const pobU = union.disponible ? union.residencial!.poblacion : pobA + pobB;
      // inclusión-exclusión con piezas ya deduplicadas (geometría
      // disjunta): pob(A∩B) = pob(A) + pob(B) − pob(A∪B)
      const crudo = Math.max(0, Math.round(pobA + pobB - pobU));
      // el % se declara contra el universo MENOR del par: una
      // intersección no puede exceder a ninguno de sus conjuntos
      const base = pobA <= pobB ? a : b;
      const pobMenor = Math.min(pobA, pobB);
      // tolerancia de redondeo de la interpolación: se acota al menor
      const interseccion = Math.min(crudo, pobMenor);
      const advertencia =
        pobMenor > 0 && crudo > pobMenor * 1.005
          ? `VALIDACIÓN: el traslape crudo (${crudo.toLocaleString("es-MX")}) excede al universo de ${ETIQUETA_ROL[base]} (${pobMenor.toLocaleString("es-MX")}) — hay doble conteo en los universos por rol; recalcula consolidado y traslapes. Este traslape NO se puede exportar.`
          : undefined;
      if (advertencia) {
        console.error("[traslapes] validación:", advertencia);
      }
      resultados.push({
        roles: [a, b],
        poblacion: interseccion,
        pctBase:
          pobMenor > 0 ? Math.round((1000 * interseccion) / pobMenor) / 10 : 0,
        base,
        poblacionBase: pobMenor,
        ...(advertencia ? { advertencia } : {}),
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
  return resultados;
}

export interface ResultadoRecalculoPlan {
  universos: number;
  consolidado: boolean;
  traslapes: boolean;
  errores: string[];
}

/**
 * RECÁLCULO AUTOMÁTICO tras borrar/restaurar puntos: universo de cada
 * levantamiento tocado y, si lo incluyen, el consolidado deduplicado y
 * los traslapes ya guardados del proyecto — con la MISMA composición
 * que el usuario eligió en el Resumen. Lee todo fresco de la base.
 * Nunca lanza: lo que falle queda marcado como desactualizado (⚠) y se
 * reporta en `errores`.
 */
export async function recalcularPlanTrasCambios(
  proyectoId: string,
  surveyIdsTocados: string[],
  onEstado?: (texto: string) => void
): Promise<ResultadoRecalculoPlan> {
  const salida: ResultadoRecalculoPlan = {
    universos: 0,
    consolidado: false,
    traslapes: false,
    errores: [],
  };
  const tocados = new Set(surveyIdsTocados);
  if (tocados.size === 0) return salida;
  try {
    const supabase = createClient();
    const { data: filas, error } = await supabase
      .from("surveys")
      .select("id, rol, configuracion, survey_points(count)")
      .eq("project_id", proyectoId);
    if (error) throw new Error(error.message);
    const surveys = (filas ?? []) as unknown as (SurveyGeometria & {
      survey_points: { count: number }[];
    })[];
    const excluidos = await contarExcluidos(surveys.map((s) => s.id));
    const tamano = (s: (typeof surveys)[number]) =>
      s.rol === "geotargeting"
        ? ((s.configuracion?.cps as unknown[]) ?? []).length
        : (s.survey_points?.[0]?.count ?? 0) - (excluidos[s.id] ?? 0);
    const cache = new Map<string, PuntoSurvey[]>();

    // 1) universo de cada levantamiento tocado
    const aRecalcular = surveys.filter((s) => tocados.has(s.id));
    for (let i = 0; i < aRecalcular.length; i++) {
      const s = aRecalcular[i];
      const etiqueta = `Universo de “${nombreDeSurvey(s)}”${aRecalcular.length > 1 ? ` (${i + 1} de ${aRecalcular.length})` : ""}`;
      onEstado?.(`${etiqueta}…`);
      try {
        const u = await calcularYGuardarUniversoSurvey(s, (t) =>
          onEstado?.(`${etiqueta} · ${t}`)
        );
        if (u.disponible) salida.universos++;
        else if (tamano(s) > 0) {
          salida.errores.push(
            `${nombreDeSurvey(s)}: ${u.mensaje ?? "universo no disponible"}`
          );
        }
      } catch (e) {
        salida.errores.push(
          `${nombreDeSurvey(s)}: ${e instanceof Error ? e.message : "error al recalcular"}`
        );
      }
    }

    // 2) consolidado y traslapes guardados que incluyan lo tocado
    const { data: pu } = await supabase
      .from("project_universes")
      .select("tipo, survey_ids")
      .eq("project_id", proyectoId);
    const guardados = (pu ?? []) as { tipo: string; survey_ids: unknown }[];
    const porId = new Map(surveys.map((s) => [s.id, s]));
    const vivos = (ids: string[]) =>
      ids
        .map((id) => porId.get(id))
        .filter((s): s is (typeof surveys)[number] => !!s && tamano(s) > 0);

    const cons = guardados.find((f) => f.tipo === "consolidado");
    const idsCons = ((cons?.survey_ids as ComposicionConsolidado[]) ?? []).map(
      (x) => x.id
    );
    if (cons && idsCons.some((id) => tocados.has(id))) {
      const seleccion = vivos(idsCons);
      try {
        if (seleccion.length > 0) {
          onEstado?.("Consolidado deduplicado…");
          await calcularYGuardarConsolidado(proyectoId, seleccion, onEstado, cache);
          salida.consolidado = true;
        }
      } catch (e) {
        salida.errores.push(
          `Consolidado: ${e instanceof Error ? e.message : "error al recalcular"}`
        );
      }
    }

    const idsTras = Array.from(
      new Set(
        guardados
          .filter((f) => f.tipo === "traslape")
          .flatMap(
            (f) => ((f.survey_ids as { surveys?: string[] })?.surveys ?? [])
          )
      )
    );
    if (idsTras.some((id) => tocados.has(id))) {
      const seleccion = vivos(idsTras);
      try {
        if (new Set(seleccion.map((s) => s.rol)).size >= 2) {
          onEstado?.("Traslapes entre capas…");
          await calcularYGuardarTraslapes(proyectoId, seleccion, onEstado, cache);
          salida.traslapes = true;
        } else {
          // un rol se quedó sin puntos activos: ya no hay par que cruzar
          // y el traslape guardado dejó de ser cierto
          await supabase
            .from("project_universes")
            .delete()
            .eq("project_id", proyectoId)
            .eq("tipo", "traslape");
        }
      } catch (e) {
        salida.errores.push(
          `Traslapes: ${e instanceof Error ? e.message : "error al recalcular"}`
        );
      }
    }
  } catch (e) {
    salida.errores.push(
      e instanceof Error ? e.message : "No se pudo recalcular el plan"
    );
  }
  return salida;
}
