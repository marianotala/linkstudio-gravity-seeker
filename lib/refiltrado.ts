// RE-FILTRADO DE UN LEVANTAMIENTO — cero consultas a Google. Los
// resultados de una corrida ya están pagados: los conservados viven en
// survey_points y los descartados en discarded_points. Corregir un
// término ("cafateria" → "cafetería") o mover exclusiones re-aplica el
// filtro estricto LOCALMENTE sobre TODO lo guardado: entran los que
// ahora pasan, salen los que ya no, y los universos quedan marcados
// para recalcular (PostGIS, gratis). Para corridas anteriores a la
// persistencia de descartados solo hay conservados: el re-filtrado
// puede QUITAR, y el rescate masivo se hace re-corriendo (las
// consultas repetidas salen del caché de Google, $0 dentro del TTL).

import { aplicarFiltroNombre, matchersDe } from "./filtro-nombre";
import {
  cargarDescartados,
  cargarPuntosCrudosSurvey,
  marcarSurveysModificados,
  type DescarteGuardado,
  type PuntoSurvey,
} from "./planner";
import { createClient } from "./supabase/client";
import type { DescartePoi } from "./types";

export interface ResultadoReFiltrado {
  /** Descartados que ahora PASAN (entraron al levantamiento). */
  entraron: number;
  /** Conservados que ya NO pasan (salieron a descartados). */
  salieron: number;
  /** Conteo final por capa. */
  porCapa: { etiqueta: string; puntos: number }[];
  /** false = la corrida no tenía descartados persistidos (previa a
   * esta versión): solo se pudo quitar, no rescatar. */
  habiaDescartados: boolean;
}

interface SurveyRow {
  id: string;
  project_id: string;
  rol: string;
  configuracion: Record<string, unknown>;
}

/** Candidato unificado (conservado o descartado) del re-filtrado. */
interface Candidato {
  placeId: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
  types: string[];
  /** Metadata original (conservados) para no perder trazabilidad. */
  metadata: Record<string, unknown> | null;
  categoria: string | null;
  cp: string | null;
  deDescartado: DescarteGuardado | null;
}

/**
 * Re-aplica el filtro de nombre con términos/exclusiones NUEVOS sobre
 * todos los resultados guardados del run (conservados + descartados).
 * Los surveys del run actualizan su configuración; las capas por
 * término se re-mapean (renombrando las que cambiaron de término) y
 * las que quedan vacías se retiran.
 */
export async function reFiltrarRun(args: {
  surveyIds: string[];
  terminos: string[];
  exclusiones: string[];
  onEstado?: (texto: string) => void;
}): Promise<ResultadoReFiltrado> {
  const { surveyIds, onEstado } = args;
  const terminos = args.terminos.map((t) => t.trim()).filter(Boolean);
  const exclusiones = args.exclusiones.map((t) => t.trim()).filter(Boolean);
  if (terminos.length === 0 && exclusiones.length === 0) {
    throw new Error("Agrega al menos un término o una exclusión");
  }
  const supabase = createClient();
  const { data: filas, error: errS } = await supabase
    .from("surveys")
    .select("id, project_id, rol, configuracion")
    .in("id", surveyIds);
  if (errS || !filas || filas.length === 0) {
    throw new Error("No pude leer los levantamientos a re-filtrar");
  }
  const surveys = filas as SurveyRow[];
  const runId =
    (surveys[0].configuracion?.runId as string | undefined) ?? surveys[0].id;

  // 1) universo de candidatos: conservados + descartados persistidos
  onEstado?.("Cargando los resultados guardados…");
  const candidatos = new Map<string, Candidato>();
  for (const s of surveys) {
    const crudos = await cargarPuntosCrudosSurvey(s.id);
    for (const p of crudos) {
      if (candidatos.has(p.place_id)) continue;
      candidatos.set(p.place_id, {
        placeId: p.place_id,
        nombre: p.nombre,
        direccion: p.direccion ?? "",
        lat: p.lat,
        lng: p.lng,
        types: (p.metadata?.types as string[] | undefined) ?? [],
        metadata: p.metadata ?? null,
        categoria: p.categoria,
        cp: p.cp,
        deDescartado: null,
      });
    }
  }
  const descartados = await cargarDescartados({ runId });
  const habiaDescartados = descartados.length > 0;
  for (const d of descartados) {
    if (candidatos.has(d.placeId)) continue;
    // los descartes por CALIDAD (nombre basura) no re-entran nunca
    if (d.motivo === "calidad") continue;
    candidatos.set(d.placeId, {
      placeId: d.placeId,
      nombre: d.nombre,
      direccion: d.direccion,
      lat: d.lat,
      lng: d.lng,
      types: d.types,
      metadata: null,
      categoria: null,
      cp: null,
      deDescartado: d,
    });
  }

  // 2) re-aplicar el filtro (mismas reglas del servidor)
  onEstado?.(
    `Re-aplicando el filtro sobre ${candidatos.size.toLocaleString("es-MX")} resultados guardados…`
  );
  const matchers = matchersDe(terminos);
  const pasan: (Candidato & { termino: string | null })[] = [];
  const fuera: (Candidato & { motivo: DescartePoi["motivo"] })[] = [];
  candidatos.forEach((c) => {
    const v = aplicarFiltroNombre(c, matchers, exclusiones);
    if (v.pasa) pasan.push({ ...c, termino: v.termino });
    else fuera.push({ ...c, motivo: v.motivo ?? "nombre" });
  });
  const entraron = pasan.filter((p) => p.deDescartado).length;
  const salieron = fuera.filter((p) => !p.deDescartado).length;

  // 3) mapa de capas: etiqueta vieja → survey; términos nuevos sin capa
  //    renombran capas huérfanas o crean surveys nuevos
  const multiCapa = surveys.length > 1 || surveys.some((s) => s.configuracion?.etiqueta);
  const porEtiqueta = new Map<string, SurveyRow>();
  for (const s of surveys) {
    porEtiqueta.set((s.configuracion?.etiqueta as string) ?? "", s);
  }
  const destinoDe = new Map<string, SurveyRow>(); // término → survey
  if (multiCapa && terminos.length >= 2) {
    const sinCapa = terminos.filter((t) => !porEtiqueta.has(t));
    const huerfanas = surveys.filter(
      (s) =>
        s.configuracion?.etiqueta &&
        !terminos.includes(s.configuracion.etiqueta as string)
    );
    for (const t of terminos) {
      const existente = porEtiqueta.get(t);
      if (existente) {
        destinoDe.set(t, existente);
        continue;
      }
      const huerfana = huerfanas.shift();
      if (huerfana) {
        // renombrar la capa huérfana al término corregido (conserva su
        // id: el consolidado y las referencias siguen vivas)
        onEstado?.(`Renombrando la capa "${huerfana.configuracion.etiqueta}" → "${t}"…`);
        huerfana.configuracion = {
          ...huerfana.configuracion,
          etiqueta: t,
          nombre: t,
        };
        destinoDe.set(t, huerfana);
      } else {
        onEstado?.(`Creando la capa "${t}"…`);
        const cfgNueva = {
          ...surveys[0].configuracion,
          runId,
          etiqueta: t,
          nombre: t,
        };
        const { data: nuevo, error } = await supabase
          .from("surveys")
          .insert({
            project_id: surveys[0].project_id,
            rol: surveys[0].rol,
            fuente: "recoleccion",
            status: "completado",
            configuracion: cfgNueva,
          })
          .select("id, project_id, rol, configuracion")
          .single();
        if (error || !nuevo) {
          throw new Error(`No se pudo crear la capa "${t}": ${error?.message}`);
        }
        const fila = nuevo as SurveyRow;
        surveys.push(fila);
        destinoDe.set(t, fila);
      }
    }
    void sinCapa;
  }
  const principal = surveys[0];
  const surveyDeTermino = (t: string | null): SurveyRow =>
    (t && destinoDe.get(t)) || principal;

  // 4) REESCRITURA: puntos nuevos por survey + descartados nuevos
  onEstado?.("Reescribiendo los levantamientos…");
  const ids = surveys.map((s) => s.id);
  const { error: errDel } = await supabase
    .from("survey_points")
    .delete()
    .in("survey_id", ids);
  if (errDel) throw new Error(`No se pudieron reescribir los puntos: ${errDel.message}`);
  const filasPuntos = pasan.map((p) => ({
    survey_id: surveyDeTermino(p.termino).id,
    place_id: p.placeId,
    nombre: p.nombre,
    direccion: p.direccion || null,
    lat: p.lat,
    lng: p.lng,
    cp: p.cp,
    categoria: p.termino ?? p.categoria,
    metadata: {
      ...(p.metadata ?? { fuente: "google", distancia_m: 0, origen_idx: 0 }),
      termino: p.termino,
      types: p.types.slice(0, 8),
      ...(p.deDescartado ? { origen: "re-filtrado" } : {}),
    },
  }));
  for (let i = 0; i < filasPuntos.length; i += 500) {
    const { error } = await supabase
      .from("survey_points")
      .insert(filasPuntos.slice(i, i + 500));
    if (error) throw new Error(`No se pudieron guardar los puntos: ${error.message}`);
  }

  // 5) configuración nueva + universos por recalcular; capas vacías fuera
  const conteo = new Map<string, number>();
  for (const f of filasPuntos) {
    conteo.set(f.survey_id, (conteo.get(f.survey_id) ?? 0) + 1);
  }
  const vivos: SurveyRow[] = [];
  for (const s of surveys) {
    const n = conteo.get(s.id) ?? 0;
    if (n === 0 && multiCapa && s.configuracion?.etiqueta && surveys.length > 1) {
      await supabase.from("surveys").delete().eq("id", s.id);
      continue;
    }
    await supabase
      .from("surveys")
      .update({
        configuracion: {
          ...s.configuracion,
          nameFilters: terminos,
          nameFilter: terminos.join(", "),
          excludes: exclusiones,
        },
      })
      .eq("id", s.id);
    vivos.push(s);
  }
  await marcarSurveysModificados(vivos.map((s) => s.id));

  // 6) descartados del run con su motivo NUEVO, anclados a un survey
  //    que sobrevivió (insertar antes de borrar capas vacías perdería
  //    las filas por el cascade)
  await supabase.from("discarded_points").delete().eq("run_id", runId);
  const ancla =
    vivos.reduce<SurveyRow | null>(
      (mejor, s) =>
        !mejor || (conteo.get(s.id) ?? 0) > (conteo.get(mejor.id) ?? 0)
          ? s
          : mejor,
      null
    ) ?? principal;
  const filasDesc = fuera.map((p) => ({
    survey_id: ancla.id,
    run_id: runId,
    place_id: p.placeId,
    nombre: p.nombre.slice(0, 200),
    direccion: p.direccion?.slice(0, 300) || null,
    lat: p.lat,
    lng: p.lng,
    types: p.types.slice(0, 8),
    termino: null,
    motivo: p.motivo,
  }));
  for (let i = 0; i < filasDesc.length; i += 500) {
    await supabase.from("discarded_points").insert(filasDesc.slice(i, i + 500));
  }

  return {
    entraron,
    salieron,
    porCapa: vivos.map((s) => ({
      etiqueta:
        (s.configuracion?.etiqueta as string) ??
        (s.configuracion?.nombre as string) ??
        "Levantamiento",
      puntos: conteo.get(s.id) ?? 0,
    })),
    habiaDescartados,
  };
}
