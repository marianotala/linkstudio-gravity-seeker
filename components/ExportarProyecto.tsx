"use client";

// EXPORTAR (Planner F5): los dos entregables del proyecto completo.
// - "Export plan del proyecto": UN PDF con la historia del territorio
//   (consolidado deduplicado, mapa multi-capa, sección por rol con el
//   traslape de conquista, plan OOH con cobertura, inteligencia
//   territorial y tácticas con sustento). Usa las capas seleccionadas
//   en el consolidado de F4 — lo que el vendedor excluyó del Resumen
//   no protagoniza el PDF — y avisa si el consolidado quedó
//   desactualizado antes de exportar.
// - "Export data del proyecto": Excel con una hoja por levantamiento
//   (puntos completos) + hoja resumen — el respaldo del analista.

import { useEffect, useMemo, useState } from "react";
import {
  cargarPuntosCrudosSurvey,
  cargarPuntosSurveys,
  colorSurvey,
  ETIQUETA_ROL,
  geocercasDeSurvey,
  guardarDetallePuntos,
  puntoAPoi,
  type PuntoSurvey,
} from "@/lib/planner";
import {
  calcularUniversosCliente,
  calcularUniversosPorGeocerca,
} from "@/lib/universos-lotes";
import { clasificarNse } from "@/lib/nse";
import { ciudadDeDireccion } from "@/lib/geo";
import { CLAVES_TACTICAS, TACTICAS, type TacticaClave } from "@/lib/tacticas";
import { createClient } from "@/lib/supabase/client";
import type {
  Origin,
  PerfilUsuario,
  Poi,
  RolLevantamiento,
  Universos,
} from "@/lib/types";
import type {
  CapaPlanProyecto,
  FilaDetallePunto,
  OohProyecto,
  TraslapeProyecto,
} from "@/lib/proyecto-pdf";

interface SurveyExportar {
  id: string;
  rol: RolLevantamiento;
  fuente: string | null;
  configuracion: Record<string, unknown>;
  status: string;
  created_at: string;
  survey_points: { count: number }[];
  survey_universes: { resultados: Universos }[];
}

interface ConsolidadoGuardado {
  resultados: Universos;
  survey_ids: { id: string; nombre: string; rol: string }[];
  created_at: string;
}

interface TraslapeGuardado {
  roles: [RolLevantamiento, RolLevantamiento];
  poblacion: number;
  pctBase: number;
  base: RolLevantamiento;
  poblacionBase: number;
}

const fmt = (n: number) => n.toLocaleString("es-MX");
const COLOR_OOH = "#ff8c42";

/** Coordenada redondeada a ~10 cm: clave de match PDV↔relación. */
const claveCoord = (lat: number, lng: number) =>
  `${lat.toFixed(6)},${lng.toFixed(6)}`;

export default function ExportarProyecto({
  proyectoId,
  cliente,
  tituloProyecto,
  usuario,
  surveys,
  tacticas,
  onTacticas,
  irAResumen,
}: {
  proyectoId: string;
  cliente: string;
  tituloProyecto: string | null;
  usuario: PerfilUsuario | null;
  surveys: SurveyExportar[];
  tacticas: TacticaClave[] | null;
  onTacticas: (t: TacticaClave[]) => void;
  irAResumen: () => void;
}) {
  /** Formato del Export plan: one-pager vertical (WhatsApp/scroll) o
   * presentación en láminas 16:9 (para proyectar). */
  const [formato, setFormato] = useState<"onepager" | "slides">("onepager");
  const [consolidado, setConsolidado] = useState<ConsolidadoGuardado | null>(null);
  const [traslapes, setTraslapes] = useState<TraslapeGuardado[]>([]);
  const [cargado, setCargado] = useState(false);
  const [titulo, setTitulo] = useState(tituloProyecto ?? "");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmarDesactualizado, setConfirmarDesactualizado] = useState(false);

  const nombreDe = (s: SurveyExportar) =>
    (s.configuracion?.nombre as string) ?? ETIQUETA_ROL[s.rol];
  const puntosDe = (s: SurveyExportar) => s.survey_points?.[0]?.count ?? 0;
  const universoDe = (s: SurveyExportar): Universos | null =>
    s.survey_universes?.[0]?.resultados ?? null;
  /** Mismo color estable que el mapa del proyecto (índice dentro del rol). */
  const colorDe = (s: SurveyExportar) => {
    const delRol = surveys.filter((x) => x.rol === s.rol).reverse();
    return colorSurvey(s.rol, delRol.findIndex((x) => x.id === s.id));
  };

  // consolidado + traslapes guardados (F4)
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
          survey_ids: (cons.survey_ids as ConsolidadoGuardado["survey_ids"]) ?? [],
          created_at: cons.created_at,
        });
      }
      setTraslapes(
        filas
          .filter((f) => f.tipo === "traslape")
          .map((f) => f.resultados as unknown as TraslapeGuardado)
      );
      setCargado(true);
    })();
  }, [proyectoId]);

  /** Las capas del PDF = la composición del consolidado (F4). */
  const seleccionados = useMemo(() => {
    if (!consolidado) return [];
    const ids = new Set(consolidado.survey_ids.map((x) => x.id));
    return surveys.filter((s) => ids.has(s.id) && puntosDe(s) > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consolidado, surveys]);

  const desactualizado = useMemo(() => {
    if (!consolidado) return false;
    const guardados = consolidado.survey_ids.map((x) => x.id).sort().join(",");
    const actuales = seleccionados.map((s) => s.id).sort().join(",");
    if (guardados !== actuales) return true;
    // el último cambio real de un survey: su creación o, si su censo
    // fue DEPURADO después (puntos excluidos), esa depuración
    return seleccionados.some((s) => {
      const dep = s.configuracion?.depurado_en
        ? new Date(s.configuracion.depurado_en as string).getTime()
        : 0;
      return (
        Math.max(new Date(s.created_at).getTime(), dep) >
        new Date(consolidado.created_at).getTime()
      );
    });
  }, [consolidado, seleccionados]);

  // tácticas: default por las capas presentes en el proyecto, hasta que
  // el vendedor toque el selector (persistido en plan_state)
  const rolesPresentes = new Set(
    surveys.filter((s) => puntosDe(s) > 0).map((s) => s.rol)
  );
  const tacticasDefault: TacticaClave[] = [
    ...(rolesPresentes.has("poi_propio") ? (["poi"] as TacticaClave[]) : []),
    ...(rolesPresentes.has("competencia") ? (["conquista"] as TacticaClave[]) : []),
    ...(rolesPresentes.has("proximidad") ? (["proximidad"] as TacticaClave[]) : []),
    ...(rolesPresentes.has("ooh") ? (["pdooh"] as TacticaClave[]) : []),
  ];
  const tacticasSel = tacticas ?? tacticasDefault;
  const alternarTactica = (clave: TacticaClave) =>
    onTacticas(
      tacticasSel.includes(clave)
        ? tacticasSel.filter((c) => c !== clave)
        : [...tacticasSel, clave]
    );

  function descargarBlob(nombre: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Radio del cruce OOH en texto, desde su configuración. */
  function radioTextoOoh(cfg: Record<string, unknown>): string {
    if (cfg.radioDiferenciado) {
      return `${cfg.radioUrbanoKm ?? "?"} km ZMVM · ${cfg.radioForaneoKm ?? "?"} km foráneo`;
    }
    return `${cfg.radioKm ?? "?"} km`;
  }

  // ---------------- Export plan del proyecto (PDF) ----------------
  async function exportarPlanProyecto() {
    if (!consolidado?.resultados?.disponible || seleccionados.length === 0) return;
    if (desactualizado && !confirmarDesactualizado) {
      setConfirmarDesactualizado(true);
      return;
    }
    setConfirmarDesactualizado(false);
    setError("");
    setOcupado("Cargando los puntos del proyecto…");
    try {
      const normales = seleccionados.filter((s) => s.rol !== "ooh");
      const oohSurvey = seleccionados.find((s) => s.rol === "ooh") ?? null;

      // crudos: traen el detalle por punto persistido (FASE 18)
      const crudosPorSurvey = new Map<string, PuntoSurvey[]>();
      for (const s of normales) {
        crudosPorSurvey.set(s.id, await cargarPuntosCrudosSurvey(s.id));
      }
      const puntosPorSurvey = new Map<string, Poi[]>(
        Array.from(crudosPorSurvey.entries()).map(([id, crudos]) => [
          id,
          crudos.map(puntoAPoi),
        ])
      );
      const capas: CapaPlanProyecto[] = normales
        .map((s) => ({
          id: s.id,
          nombre: nombreDe(s),
          rol: s.rol,
          color: colorDe(s),
          pois: puntosPorSurvey.get(s.id) ?? [],
          universo: universoDe(s),
        }))
        .filter((c) => c.pois.length > 0)
        .sort(
          (a, b) =>
            ["poi_propio", "competencia", "proximidad"].indexOf(a.rol) -
            ["poi_propio", "competencia", "proximidad"].indexOf(b.rol)
        );

      // ---- cruce OOH del proyecto (crudos con relaciones pantalla→PDV)
      let ooh: OohProyecto | null = null;
      let crudosOoh: PuntoSurvey[] = [];
      if (oohSurvey) {
        crudosOoh = await cargarPuntosCrudosSurvey(oohSurvey.id);
        const cfg = oohSurvey.configuracion ?? {};
        // PDVs sin cobertura por match de coordenadas contra el survey fuente
        let sinCobertura: string[] = [];
        const fuenteId = cfg.pdvsSurveyId as string | undefined;
        if (fuenteId) {
          const fuente =
            puntosPorSurvey.get(fuenteId) ??
            (await cargarPuntosSurveys([fuenteId])).get(fuenteId) ??
            [];
          const cubiertas = new Set<string>();
          crudosOoh.forEach((p) =>
            (
              (p.metadata?.pdvs as { lat: number; lng: number }[] | undefined) ?? []
            ).forEach((rel) => cubiertas.add(claveCoord(rel.lat, rel.lng)))
          );
          sinCobertura = fuente
            .filter((p) => !cubiertas.has(claveCoord(p.lat, p.lng)))
            .map((p) => p.nombre);
        }
        ooh = {
          nombre: nombreDe(oohSurvey),
          pantallas: crudosOoh.map((p) => ({
            nombre: p.nombre,
            tipo: (p.metadata?.tipo as string) ?? p.categoria,
            medio: (p.metadata?.medio as string) ?? null,
            impresiones:
              typeof p.metadata?.impresiones === "number"
                ? (p.metadata.impresiones as number)
                : null,
            pdvs: (
              (p.metadata?.pdvs as
                | { nombre: string; distancia_m: number }[]
                | undefined) ?? []
            ).map((rel) => ({ nombre: rel.nombre, distancia_m: rel.distancia_m })),
          })),
          totalPdvs: (cfg.totalPdvs as number) ?? 0,
          cubiertos: (cfg.cubiertos as number) ?? 0,
          impresiones: (cfg.impresiones as number | null) ?? null,
          radioTexto: radioTextoOoh(cfg),
          sinCobertura,
        };
      }

      // FASE 18 — detalle POR PUNTO (solo presentación): universo 18+ y
      // NSE del buffer INDIVIDUAL de cada punto, con el radio del
      // análisis. Se calcula batched (PostGIS propio, costo cero de
      // APIs) SOLO para los puntos sin dato y se persiste en
      // survey_points para no recalcular en cada export.
      const detallePuntos: Record<string, FilaDetallePunto[]> = {};
      if (formato === "slides") {
        for (const s of normales) {
          const crudos = crudosPorSurvey.get(s.id) ?? [];
          if (crudos.length === 0) continue;
          const radioIndividual =
            typeof s.configuracion?.radius === "number"
              ? (s.configuracion.radius as number)
              : 500;
          const sinDato = crudos.filter((p) => p.universo_individual == null);
          if (sinDato.length > 0) {
            setOcupado(
              `Detalle por punto de ${nombreDe(s)} · ${fmt(sinDato.length)} puntos…`
            );
            const porId = await calcularUniversosPorGeocerca(
              sinDato.map((p, i) => ({
                id: `${i}`,
                lat: p.lat,
                lng: p.lng,
                radio_m: radioIndividual,
              })),
              {
                onProgreso: (lote, total) =>
                  setOcupado(
                    `Detalle por punto de ${nombreDe(s)} · lote ${lote + 1} de ${total}…`
                  ),
              }
            );
            const nuevos = new Map<string, { universo: number; nse: string | null }>();
            sinDato.forEach((p, i) => {
              const g = porId.get(`${i}`);
              if (!g) return;
              const nivel = clasificarNse(g.nse_proxy);
              p.universo_individual = Math.round(g.adultos18);
              p.nse_dominante = nivel?.etiqueta ?? null;
              nuevos.set(p.place_id, {
                universo: p.universo_individual,
                nse: p.nse_dominante,
              });
            });
            if (nuevos.size > 0) await guardarDetallePuntos(s.id, nuevos);
          }
          detallePuntos[s.id] = crudos.map((p) => ({
            nombre: p.nombre,
            ciudad:
              ciudadDeDireccion(p.direccion ?? "") ||
              (p.cp ? `CP ${p.cp}` : "—"),
            universo: p.universo_individual ?? null,
            nse: p.nse_dominante ?? null,
          }));
        }
      }

      // demografía POR TÁCTICA: el universo de cada sección del PDF es
      // la unión de las geometrías de SUS capas (con una sola capa se
      // reusa su universo guardado; con varias se calcula la unión)
      const universoRol: Partial<Record<RolLevantamiento, Universos>> = {};
      for (const rol of ["poi_propio", "competencia", "proximidad"] as const) {
        const surveysRol = normales.filter((s) => s.rol === rol);
        if (surveysRol.length === 0) continue;
        if (surveysRol.length === 1) {
          const u = universoDe(surveysRol[0]);
          if (u?.disponible) {
            universoRol[rol] = u;
            continue;
          }
        }
        const geocercasRol = surveysRol.flatMap((s) =>
          geocercasDeSurvey(s, crudosPorSurvey.get(s.id) ?? [])
        );
        if (geocercasRol.length === 0) continue;
        setOcupado(`Demografía de ${ETIQUETA_ROL[rol]}…`);
        const u = await calcularUniversosCliente(
          geocercasRol,
          `unión de las ${surveysRol.length} capas de la táctica`,
          {
            onProgreso: (lote, total) =>
              setOcupado(
                `Demografía de ${ETIQUETA_ROL[rol]} · lote ${lote + 1} de ${total}…`
              ),
          }
        );
        if (u.disponible) universoRol[rol] = u;
      }
      if (oohSurvey && crudosOoh.length > 0) {
        setOcupado("Demografía del plan OOH…");
        const u = await calcularUniversosCliente(
          geocercasDeSurvey(oohSurvey, crudosOoh),
          "radios de las pantallas del plan",
          {
            onProgreso: (lote, total) =>
              setOcupado(`Demografía del plan OOH · lote ${lote + 1} de ${total}…`),
          }
        );
        if (u.disponible) universoRol.ooh = u;
      }

      setOcupado("Capturando mapas…");
      const [
        { generarPlanProyectoPdf, nombreArchivoPlanProyecto },
        { generarPresentacionProyecto, nombreArchivoPresentacion },
        { capturarMapaPlan },
      ] = await Promise.all([
        import("@/lib/proyecto-pdf"),
        import("@/lib/proyecto-slides"),
        import("@/lib/plan-mapa"),
      ]);

      // mapa general: todas las capas con su color + pantallas y líneas OOH
      const colorPorCapa: Record<string, string> = {};
      capas.forEach((c) => (colorPorCapa[c.nombre] = c.color));
      const poisMapa: Poi[] = capas.flatMap((c) =>
        c.pois.map((p) => ({ ...p, capa: c.nombre }))
      );
      const pantallasMapa = crudosOoh.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        color: COLOR_OOH,
        radioM: 0,
      }));
      const lineasMapa = crudosOoh.flatMap((p) =>
        (
          (p.metadata?.pdvs as { lat: number; lng: number }[] | undefined) ?? []
        ).map((rel) => ({
          a: { lat: p.lat, lng: p.lng },
          b: { lat: rel.lat, lng: rel.lng },
          color: COLOR_OOH,
        }))
      );
      // el mapa general multi-capa solo vive en el one-pager (las
      // láminas llevan un mapa POR táctica)
      const mapaDataUrl =
        formato === "onepager"
          ? await capturarMapaPlan({
              pois: poisMapa,
              colorPorCapa,
              pantallas: pantallasMapa,
              lineas: lineasMapa,
            })
          : null;

      // mini-mapa OOH (pantallas, líneas y PDVs cubiertos); en formato
      // presentación se captura con el aspecto del slot de lámina
      const dimsSlot =
        formato === "slides" ? { ancho: 1000, alto: 900 } : {};
      if (ooh && crudosOoh.length > 0) {
        setOcupado("Capturando el mapa del plan OOH…");
        ooh.mapaDataUrl = await capturarMapaPlan({
          pois: [],
          pantallas: pantallasMapa,
          lineas: lineasMapa,
          puntos: crudosOoh.flatMap((p) =>
            (
              (p.metadata?.pdvs as { lat: number; lng: number }[] | undefined) ??
              []
            ).map((rel) => ({ lat: rel.lat, lng: rel.lng, color: "#2fb9e8" }))
          ),
          ...dimsSlot,
        });
      }

      // formato presentación: un mapa POR TÁCTICA con SOLO sus capas
      // (zoom automático al encuadre de esa capa)
      const mapasRol: Partial<Record<RolLevantamiento, string | null>> = {};
      if (formato === "slides") {
        for (const rol of ["poi_propio", "competencia", "proximidad"] as const) {
          const capasRol = capas.filter((c) => c.rol === rol);
          if (capasRol.length === 0) continue;
          setOcupado(`Capturando el mapa de ${ETIQUETA_ROL[rol]}…`);
          const colores: Record<string, string> = {};
          capasRol.forEach((c) => (colores[c.nombre] = c.color));
          mapasRol[rol] = await capturarMapaPlan({
            pois: capasRol.flatMap((c) =>
              c.pois.map((p) => ({ ...p, capa: c.nombre }))
            ),
            colorPorCapa: colores,
            ...dimsSlot,
          });
        }
        mapasRol.ooh = ooh?.mapaDataUrl ?? null;
      }

      // traslapes guardados → etiquetas legibles
      const traslapesPdf: TraslapeProyecto[] = traslapes.map((t) => ({
        etiquetaA: ETIQUETA_ROL[t.roles[0]],
        etiquetaB: ETIQUETA_ROL[t.roles[1]],
        poblacion: t.poblacion,
        pctBase: t.pctBase,
        poblacionBase: t.poblacionBase,
        esConquista:
          t.roles.includes("poi_propio") && t.roles.includes("competencia"),
      }));

      // fuentes consolidadas de TODOS los levantamientos del PDF
      const todosPois = capas.flatMap((c) => c.pois);
      const fuentes = [
        ...(todosPois.some((p) => p.fuente !== "denue")
          ? ["Google Places API (New) — establecimientos"]
          : []),
        ...(todosPois.some((p) => p.fuente === "denue")
          ? ["DENUE, INEGI — establecimientos"]
          : []),
        ...(seleccionados.some((s) => s.fuente === "archivo" || s.fuente === "carga")
          ? ["Puntos del cliente (carga propia)"]
          : []),
        ...(ooh ? ["Inventario de pantallas OOH/DOOH de Gravity"] : []),
        "Censo de Población y Vivienda 2020, INEGI — demografía por AGEB urbana",
        ...((consolidado.resultados.rurales ?? 0) > 0
          ? ["ITER 2020, INEGI — población rural por localidad (<2,500 hab)"]
          : []),
        ...(seleccionados.some((s) => (s.configuracion?.mode as string) === "cp")
          ? ["Catálogo Nacional de Códigos Postales, Correos de México — polígonos"]
          : []),
        ...(() => {
          // depuración inteligente: si algún levantamiento fue depurado
          // (falsos positivos de otro giro excluidos tras revisión), el
          // PDF lo declara en la metodología
          const depurados = seleccionados.reduce(
            (t, s) => t + (Number(s.configuracion?.depurados) || 0),
            0
          );
          return depurados > 0
            ? [
                `Censo depurado por coherencia de giro (${depurados.toLocaleString("es-MX")} ${depurados === 1 ? "punto excluido" : "puntos excluidos"} tras revisión)`,
              ]
            : [];
        })(),
      ];

      const sumaSimple = seleccionados.reduce(
        (t, s) => t + (universoDe(s)?.residencial?.adultos18 ?? 0),
        0
      );

      setOcupado(
        formato === "slides"
          ? "Armando las láminas 16:9…"
          : "Armando el PDF del proyecto…"
      );
      const fecha = new Date();
      const datos = {
        cliente,
        titulo: titulo.trim() || null,
        usuario: usuario?.nombre ?? usuario?.email ?? "Seeker",
        fecha,
        consolidado: consolidado.resultados,
        sumaSimple,
        nLevantamientos: seleccionados.length,
        capas,
        ooh,
        traslapes: traslapesPdf,
        mapaDataUrl,
        tacticas: tacticasSel,
        fuentes,
        universoRol,
        mapasRol,
        detallePuntos,
      };
      if (formato === "slides") {
        descargarBlob(
          nombreArchivoPresentacion(cliente, titulo.trim(), fecha),
          await generarPresentacionProyecto(datos)
        );
      } else {
        descargarBlob(
          nombreArchivoPlanProyecto(cliente, titulo.trim(), fecha),
          await generarPlanProyectoPdf(datos)
        );
      }
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? `No se pudo generar el plan: ${e.message}`
          : "No se pudo generar el plan del proyecto"
      );
    } finally {
      setOcupado(null);
    }
  }

  // ---------------- Export data del proyecto (Excel) ----------------
  async function exportarDataProyecto() {
    const conPuntos = surveys.filter((s) => puntosDe(s) > 0);
    if (conPuntos.length === 0) return;
    setError("");
    setOcupado("Armando el Excel del proyecto…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // hoja resumen: una fila por levantamiento
      const resumen = conPuntos.map((s) => ({
        Levantamiento: nombreDe(s),
        Rol: ETIQUETA_ROL[s.rol],
        Status: s.status,
        Puntos: puntosDe(s),
        "Universo 18+": universoDe(s)?.residencial?.adultos18 ?? null,
        Fecha: new Date(s.created_at).toLocaleDateString("es-MX"),
        "En el consolidado": consolidado?.survey_ids.some((x) => x.id === s.id)
          ? "sí"
          : "no",
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(resumen),
        "Resumen"
      );

      // una hoja por levantamiento
      const usados = new Set<string>(["Resumen"]);
      const nombreHoja = (base: string) => {
        const limpio = base.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Hoja";
        let nombre = limpio;
        let n = 2;
        while (usados.has(nombre)) nombre = `${limpio.slice(0, 25)} ${n++}`;
        usados.add(nombre);
        return nombre;
      };

      for (const s of conPuntos) {
        setOcupado(`Armando el Excel · ${nombreDe(s)}…`);
        if (s.rol === "ooh") {
          const crudos = await cargarPuntosCrudosSurvey(s.id);
          const filas = crudos.map((p) => ({
            Pantalla: p.nombre,
            Tipo: (p.metadata?.tipo as string) ?? p.categoria ?? "",
            Medio: (p.metadata?.medio as string) ?? "",
            Ciudad: (p.metadata?.ciudad as string) ?? "",
            Digital: p.metadata?.digital ? "sí" : "no",
            "Impresiones/mes":
              typeof p.metadata?.impresiones === "number"
                ? (p.metadata.impresiones as number)
                : null,
            Lat: p.lat,
            Lng: p.lng,
            "Radio del cruce (m)":
              typeof p.metadata?.radio_m === "number"
                ? (p.metadata.radio_m as number)
                : null,
            "PDVs apoyados": (
              (p.metadata?.pdvs as { nombre: string }[] | undefined) ?? []
            ).length,
            "Apoya a": (
              (p.metadata?.pdvs as
                | { nombre: string; distancia_m: number }[]
                | undefined) ?? []
            )
              .map(
                (rel) =>
                  `${rel.nombre} (${(rel.distancia_m / 1000).toFixed(1)} km)`
              )
              .join(" · "),
          }));
          XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.json_to_sheet(filas),
            nombreHoja(nombreDe(s))
          );
        } else {
          // crudos: traen el detalle por punto (FASE 18) si ya se
          // calculó en un export de presentación
          const crudos = await cargarPuntosCrudosSurvey(s.id);
          const origenes =
            ((s.configuracion?.origenes as Origin[]) ??
              (s.configuracion?.centers as Origin[]) ??
              []) as Origin[];
          const filas = crudos.map((r) => {
            const p = puntoAPoi(r);
            return {
              Nombre: p.nombre,
              Dirección: p.direccion,
              Lat: p.lat,
              Lng: p.lng,
              CP: p.cp ?? "",
              Categoría: p.categoria ?? "",
              Capa: p.capa ?? p.termino ?? "",
              Rol: ETIQUETA_ROL[s.rol],
              Fuente: p.fuente,
              "Distancia (m)": p.distancia || null,
              Origen: origenes[p.origenIdx]?.nombre ?? "",
              "Universo 18+ (radio individual)": r.universo_individual ?? null,
              "NSE dominante": r.nse_dominante ?? "",
            };
          });
          XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.json_to_sheet(filas),
            nombreHoja(nombreDe(s))
          );
        }
      }

      const limpio =
        cliente
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^a-zA-Z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 40) || "proyecto";
      XLSX.writeFile(
        wb,
        `Gravity_Data_${limpio}_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? `No se pudo generar el Excel: ${e.message}`
          : "No se pudo generar el Excel del proyecto"
      );
    } finally {
      setOcupado(null);
    }
  }

  const listoParaPdf =
    !!consolidado?.resultados?.disponible && seleccionados.length > 0;
  const totalPuntos = surveys.reduce((t, s) => t + puntosDe(s), 0);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <h2 className="font-display text-base font-extrabold tracking-tight text-white">
        Exportar el plan del proyecto
      </h2>
      <p className="font-mono text-[10px] leading-relaxed text-zinc-500">
        Un solo PDF que cuenta toda la historia del territorio de {cliente}:
        consolidado deduplicado, una sección por capa, el traslape de
        conquista, el plan de pantallas y las tácticas — listo para mandarse
        por WhatsApp sin retoques. El Excel es el respaldo del analista.
      </p>

      {/* título del plan */}
      <div className="mt-4">
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Título del plan (portada del PDF)
        </label>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder={`Plan territorial — ${cliente}`}
          className="w-full max-w-xl rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cian focus:outline-none"
        />
      </div>

      {/* formato del PDF */}
      <div className="mt-4">
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Formato del Export plan
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFormato("onepager")}
            className={`rounded-full border px-3 py-1 font-mono text-[10px] transition-colors ${
              formato === "onepager"
                ? "border-cian bg-cian/15 text-cian"
                : "border-linea bg-panel2 text-zinc-500 hover:text-zinc-300"
            }`}
            title="Una sola página vertical larga: para scroll en celular y WhatsApp"
          >
            One-pager vertical
          </button>
          <button
            onClick={() => setFormato("slides")}
            className={`rounded-full border px-3 py-1 font-mono text-[10px] transition-colors ${
              formato === "slides"
                ? "border-cian bg-cian/15 text-cian"
                : "border-linea bg-panel2 text-zinc-500 hover:text-zinc-300"
            }`}
            title="Láminas 16:9 para proyectar: portada, resumen, una lámina por táctica (mapa-izquierda / datos-derecha), comparativo, traslapes, tácticas, cierre y metodología"
          >
            Presentación (láminas 16:9)
          </button>
        </div>
      </div>

      {/* qué entra al PDF (la composición del consolidado F4) */}
      <div className="mt-4 rounded-lg border border-linea bg-panel2/50 p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Qué capas protagonizan el PDF
          <span className="ml-2 normal-case tracking-normal text-zinc-600">
            (las seleccionadas en el consolidado del Resumen — ahí se cambian)
          </span>
        </p>
        {cargado && !consolidado ? (
          <p className="font-mono text-[11px] text-amber-400">
            Aún no hay universo consolidado. Calcúlalo primero en{" "}
            <button onClick={irAResumen} className="underline hover:text-white">
              Resumen del proyecto
            </button>
            .
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {seleccionados.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-linea bg-fondo px-2.5 py-1 font-mono text-[10px] text-zinc-300"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: colorDe(s) }}
                />
                {nombreDe(s)}
                <span className="text-zinc-600">
                  {ETIQUETA_ROL[s.rol]} · {fmt(puntosDe(s))}
                </span>
              </span>
            ))}
          </div>
        )}
        {desactualizado && (
          <p className="mt-2 font-mono text-[10px] text-amber-400">
            ⚠ El consolidado está desactualizado: hay levantamientos más
            nuevos que el último cálculo.
          </p>
        )}
      </div>

      {/* tácticas destacadas */}
      <div className="mt-4 rounded-lg border border-linea bg-panel2/50 p-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Tácticas destacadas del proyecto
          <span className="ml-2 normal-case tracking-normal text-zinc-600">
            las 7 salen en el PDF; las marcadas van primero, con su sustento
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {CLAVES_TACTICAS.map((clave) => {
            const activa = tacticasSel.includes(clave);
            return (
              <button
                key={clave}
                onClick={() => alternarTactica(clave)}
                title={TACTICAS[clave].descriptor}
                className={`rounded-full border px-3 py-1 font-mono text-[10px] transition-colors ${
                  activa
                    ? "border-magenta bg-magenta/15 text-magenta"
                    : "border-linea bg-panel2 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {TACTICAS[clave].nombre}
              </button>
            );
          })}
        </div>
      </div>

      {/* aviso de desactualizado ANTES de exportar */}
      {confirmarDesactualizado && (
        <div className="mt-4 rounded-lg border border-amber-400/50 bg-amber-400/10 p-3 font-mono text-[11px] text-amber-400">
          El consolidado está desactualizado — el PDF saldría con cifras
          viejas. ¿Recalcular primero?
          <span className="ml-3 inline-flex gap-2">
            <button
              onClick={() => {
                setConfirmarDesactualizado(false);
                irAResumen();
              }}
              className="rounded border border-amber-400 bg-amber-400/10 px-2.5 py-1 hover:bg-amber-400/20"
            >
              Recalcular en el Resumen
            </button>
            <button
              onClick={() => {
                setConfirmarDesactualizado(false);
                exportarPlanProyecto();
              }}
              className="rounded border border-linea bg-panel2 px-2.5 py-1 text-zinc-400 hover:text-zinc-200"
            >
              Exportar así
            </button>
          </span>
        </div>
      )}

      {/* botones */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={exportarPlanProyecto}
          disabled={!listoParaPdf || ocupado !== null}
          title={
            listoParaPdf
              ? "PDF con branding Gravity: la historia completa del territorio"
              : "Calcula el consolidado en el Resumen del proyecto primero"
          }
          className="rounded-md bg-magenta px-5 py-2.5 font-display text-xs font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Export plan del proyecto (PDF)
        </button>
        <button
          onClick={exportarDataProyecto}
          disabled={totalPuntos === 0 || ocupado !== null}
          title="Excel con una hoja por levantamiento + hoja resumen"
          className="rounded-md border border-linea bg-panel2 px-5 py-2.5 font-display text-xs font-extrabold text-zinc-300 transition-colors hover:border-emerald-400 hover:text-emerald-400 disabled:opacity-40"
        >
          Export data del proyecto (Excel)
        </button>
        {ocupado && (
          <span className="font-mono text-[11px] text-cian">⟳ {ocupado}</span>
        )}
      </div>
      {error && <p className="mt-3 font-mono text-[11px] text-magenta">{error}</p>}

      <p className="mt-4 font-mono text-[10px] leading-relaxed text-zinc-600">
        Nombre del PDF: Gravity_Plan_
        {cliente.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 20)}
        {titulo.trim() ? "_…" : ""}_fecha.pdf · El Export plan de búsqueda
        individual del modo consulta sigue igual que siempre.
      </p>
    </div>
  );
}
