"use client";

// Pestaña OOH — cruce pantallas × puntos de venta (réplica evolucionada
// de Plot Matrix como parte de Seeker): carga los PDVs del cliente
// (mismo cargador de orígenes), filtra el inventario de pantallas por
// tipo/ciudad/medio/digital, cruza por proximidad (Haversine, local —
// cero llamadas a Google salvo geocodificar direcciones) y responde
// "¿qué pantallas apoyan a qué puntos de venta?" — la planeación de la
// táctica Geo-PDOOH, con universos, CSV del cruce y Export plan (PDF).

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader, { type StatusTipo } from "./AppHeader";
import OverlayProgreso, { type ProcesoLargo } from "./OverlayProgreso";
import UniversosPanel from "./UniversosPanel";
import { etiquetaOrigen } from "@/lib/geo";
import {
  CLAVES_TIPO_PANTALLA,
  TIPOS_PANTALLA,
  colorTipoPantalla,
  csvCruce,
  cruzarPantallasPdvs,
  esZmvm,
  etiquetaTipoPantalla,
  pdvsCubiertos,
} from "@/lib/ooh";
import { descargarPlantillaOrigenes, parsearArchivo } from "@/lib/parse";
import { createClient } from "@/lib/supabase/client";
import {
  LOTE_UNIVERSOS,
  UMBRAL_UNIVERSOS_LOTES,
  agregarUniversosCrudos,
  agruparGeocercasPorProximidad,
  type UniversosCrudo,
} from "@/lib/universos-lotes";
import type {
  CrucePantalla,
  GeocercaUniverso,
  GeocodeResponse,
  LatLng,
  Origin,
  Pantalla,
  PerfilUsuario,
  Universos,
} from "@/lib/types";

const OohMap = dynamic(() => import("./OohMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-600">
      Cargando mapa…
    </div>
  ),
});

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await resp.json()) as T & { error?: string };
  if (!resp.ok) throw new Error(data.error ?? `Error ${resp.status}`);
  return data;
}

function descargarArchivo(nombre: string, contenido: string, mime: string) {
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

const PRESETS_KM = [3, 5, 6, 10, 15];
/** Máximo de filas visibles en la tabla del cruce (el CSV trae todo). */
const MAX_FILAS_TABLA = 400;

export default function OohView({ usuario }: { usuario: PerfilUsuario | null }) {
  const [status, setStatus] = useState<{ tipo: StatusTipo; texto: string }>({
    tipo: "idle",
    texto: "Carga los PDVs del cliente y ejecuta el cruce",
  });
  const reportar = (tipo: StatusTipo, texto: string) => setStatus({ tipo, texto });
  const [proceso, setProceso] = useState<ProcesoLargo | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // ---- inventario de pantallas (Supabase, paginado)
  const [pantallas, setPantallas] = useState<Pantalla[]>([]);
  const [inventarioCargado, setInventarioCargado] = useState(false);
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const todas: Pantalla[] = [];
      const PAGINA = 1000;
      for (let desde = 0; ; desde += PAGINA) {
        const { data, error } = await supabase
          .from("screens")
          .select(
            "clave, nombre, tipo, medio, ciudad, digital, impresiones, costo, direccion, lote, lat, lng"
          )
          .order("clave")
          .range(desde, desde + PAGINA - 1);
        if (error) {
          reportar("error", `No pude leer el inventario: ${error.message}`);
          break;
        }
        todas.push(...((data ?? []) as Pantalla[]));
        if (!data || data.length < PAGINA) break;
      }
      setPantallas(todas);
      setInventarioCargado(true);
    })();
  }, []);

  // ---- PDVs del cliente
  const [pdvs, setPdvs] = useState<Origin[]>([]);
  const [notaCarga, setNotaCarga] = useState("");
  const inputPdvsRef = useRef<HTMLInputElement>(null);

  // ---- radio de cruce
  const [radioKm, setRadioKm] = useState(6);
  const [radioDiferenciado, setRadioDiferenciado] = useState(false);
  const [radioUrbanoKm, setRadioUrbanoKm] = useState(6);
  const [radioForaneoKm, setRadioForaneoKm] = useState(15);

  // ---- filtros de pantallas (chips múltiples; vacío = todas)
  const [fTipos, setFTipos] = useState<Set<string>>(new Set());
  const [fCiudades, setFCiudades] = useState<Set<string>>(new Set());
  const [fMedios, setFMedios] = useState<Set<string>>(new Set());
  const [fDigital, setFDigital] = useState<"todas" | "digital" | "estatica">("todas");

  // ---- resultado del cruce
  const [cruces, setCruces] = useState<CrucePantalla[] | null>(null);
  const [verLineas, setVerLineas] = useState(true);
  const [verRadios, setVerRadios] = useState(true);
  const [vistaTabla, setVistaTabla] = useState<"pantallas" | "pdvs">("pantallas");
  const [tablaColapsada, setTablaColapsada] = useState(false);
  const [foco, setFoco] = useState<(LatLng & { zoom?: number }) | null>(null);
  const [universos, setUniversos] = useState<Universos | null>(null);
  const [tituloPlan, setTituloPlan] = useState("");

  // valores distintos del inventario para los chips
  const tiposDisponibles = useMemo(
    () =>
      CLAVES_TIPO_PANTALLA.filter((t) => pantallas.some((p) => p.tipo === t)),
    [pantallas]
  );
  const ciudadesDisponibles = useMemo(
    () =>
      Array.from(
        new Set(pantallas.map((p) => p.ciudad?.trim()).filter(Boolean))
      ).sort() as string[],
    [pantallas]
  );
  const mediosDisponibles = useMemo(
    () =>
      Array.from(
        new Set(pantallas.map((p) => p.medio?.trim()).filter(Boolean))
      ).sort() as string[],
    [pantallas]
  );

  const pantallasFiltradas = useMemo(
    () =>
      pantallas.filter(
        (p) =>
          (fTipos.size === 0 || fTipos.has(p.tipo)) &&
          (fCiudades.size === 0 || fCiudades.has(p.ciudad?.trim() ?? "")) &&
          (fMedios.size === 0 || fMedios.has(p.medio?.trim() ?? "")) &&
          (fDigital === "todas" ||
            (fDigital === "digital" ? p.digital === true : p.digital === false))
      ),
    [pantallas, fTipos, fCiudades, fMedios, fDigital]
  );

  const radioDe = useMemo(() => {
    if (radioDiferenciado) {
      return (p: Pantalla) =>
        (esZmvm(p.lat, p.lng) ? radioUrbanoKm : radioForaneoKm) * 1000;
    }
    return () => radioKm * 1000;
  }, [radioDiferenciado, radioKm, radioUrbanoKm, radioForaneoKm]);
  const radioTexto = radioDiferenciado
    ? `${radioUrbanoKm} km ZMVM · ${radioForaneoKm} km foráneo`
    : `${radioKm} km`;

  // cambiar PDVs, filtros o radio invalida el cruce en pantalla
  useEffect(() => {
    setCruces(null);
    setUniversos(null);
  }, [pdvs, pantallasFiltradas, radioDe]);

  // ---- derivados del cruce
  const crucesPlan = useMemo(
    () => (cruces ?? []).filter((c) => c.pdvs.length > 0),
    [cruces]
  );
  const cubiertos = useMemo(
    () => pdvsCubiertos(cruces ?? []),
    [cruces]
  );
  const sinCobertura = useMemo(
    () =>
      cruces === null
        ? []
        : pdvs
            .map((o, i) => ({ o, i }))
            .filter(({ i }) => !cubiertos.has(i)),
    [cruces, pdvs, cubiertos]
  );
  const impresionesPlan = useMemo(() => {
    const conDato = crucesPlan.filter((c) => c.pantalla.impresiones != null);
    if (conDato.length === 0) return null;
    return conDato.reduce((s, c) => s + (c.pantalla.impresiones ?? 0), 0);
  }, [crucesPlan]);

  // vista inversa: por PDV, qué pantallas lo apoyan
  const porPdv = useMemo(() => {
    const mapa = new Map<number, { pantalla: Pantalla; distancia: number }[]>();
    for (const c of crucesPlan) {
      for (const rel of c.pdvs) {
        const lista = mapa.get(rel.idx) ?? [];
        lista.push({ pantalla: c.pantalla, distancia: rel.distancia });
        mapa.set(rel.idx, lista);
      }
    }
    mapa.forEach((lista) => lista.sort((a, b) => a.distancia - b.distancia));
    return mapa;
  }, [crucesPlan]);

  // ---- carga de PDVs (Excel/CSV; direcciones se geocodifican)
  async function cargarPdvs(file: File | undefined) {
    if (!file) return;
    setOcupado(true);
    setNotaCarga("");
    try {
      const { origenes, direcciones, deteccion, correcciones } =
        await parsearArchivo(file);
      const acumulados: Origin[] = [...origenes];
      let sinGeo = 0;
      if (direcciones.length > 0) {
        const LOTE_GEO = 100;
        for (let i = 0; i < direcciones.length; i += LOTE_GEO) {
          const grupo = direcciones.slice(i, i + LOTE_GEO);
          setProceso({
            etapa: "Geocodificando PDVs",
            detalle: `${Math.min(i + LOTE_GEO, direcciones.length)} de ${direcciones.length} direcciones`,
            actual: i,
            total: direcciones.length,
          });
          const data = await postJson<GeocodeResponse>("/api/geocode", {
            direcciones: grupo.map((d) => d.direccion),
          });
          data.resultados.forEach((r, j) => {
            if (r.ok && r.lat !== undefined && r.lng !== undefined) {
              acumulados.push({
                lat: r.lat,
                lng: r.lng,
                nombre: grupo[j].nombre,
                direccion: r.formatted ?? grupo[j].direccion,
              });
            } else {
              sinGeo++;
            }
          });
        }
      }
      setProceso(null);
      if (acumulados.length === 0) {
        reportar("error", deteccion);
        return;
      }
      setPdvs(acumulados);
      const avisos = [
        correcciones.lngCorregidas > 0
          ? `${correcciones.lngCorregidas} longitudes corregidas a oeste`
          : null,
        correcciones.coordsSeparadas > 0
          ? `${correcciones.coordsSeparadas} pares lat,lng separados`
          : null,
        correcciones.descartadas > 0
          ? `${correcciones.descartadas} filas descartadas`
          : null,
        sinGeo > 0 ? `${sinGeo} direcciones no geocodificadas` : null,
      ].filter(Boolean);
      setNotaCarga(
        `${deteccion}${avisos.length > 0 ? ` · ${avisos.join(" · ")}` : ""}`
      );
      reportar(
        "ok",
        `${acumulados.length.toLocaleString("es-MX")} PDVs cargados — ajusta radio y filtros y ejecuta el cruce`
      );
    } catch (e) {
      setProceso(null);
      reportar("error", e instanceof Error ? e.message : "Error al cargar PDVs");
    } finally {
      setOcupado(false);
      if (inputPdvsRef.current) inputPdvsRef.current.value = "";
    }
  }

  // ---- ejecutar cruce (local: Haversine con hash espacial)
  function ejecutarCruce() {
    if (pdvs.length === 0) {
      reportar("error", "Primero carga los PDVs del cliente");
      return;
    }
    if (pantallasFiltradas.length === 0) {
      reportar(
        "error",
        pantallas.length === 0
          ? "No hay inventario de pantallas — cárgalo en Admin"
          : "Los filtros dejan 0 pantallas — quita alguno"
      );
      return;
    }
    const resultado = cruzarPantallasPdvs(pantallasFiltradas, pdvs, radioDe);
    setCruces(resultado);
    setUniversos(null);
    setTablaColapsada(false);
    setFoco(null);
    const enPlan = resultado.filter((c) => c.pdvs.length > 0);
    const cub = pdvsCubiertos(resultado).size;
    reportar(
      "ok",
      `Cruce listo: ${enPlan.length.toLocaleString("es-MX")} pantallas apoyan ${cub.toLocaleString("es-MX")} de ${pdvs.length.toLocaleString("es-MX")} PDVs (radio ${radioTexto}) · 0 llamadas a Google`
    );
  }

  // ---- universos del territorio cubierto por las pantallas del plan
  async function calcularUniversos() {
    if (crucesPlan.length === 0) {
      reportar("error", "Ejecuta el cruce primero");
      return;
    }
    setOcupado(true);
    try {
      const geocercas: GeocercaUniverso[] = crucesPlan.map((c) => ({
        id: c.pantalla.clave,
        lat: c.pantalla.lat,
        lng: c.pantalla.lng,
        radio_m: c.radioM,
      }));
      const criterio = `población alrededor de las ${crucesPlan.length.toLocaleString("es-MX")} pantallas del plan (radio ${radioTexto})`;
      let u: Universos;
      if (geocercas.length <= UMBRAL_UNIVERSOS_LOTES) {
        const { universos: sencillo } = await postJson<{ universos: Universos }>(
          "/api/universos",
          { geocercas }
        );
        u = sencillo?.disponible ? { ...sencillo, criterio } : sencillo;
      } else {
        const lotes = agruparGeocercasPorProximidad(geocercas, LOTE_UNIVERSOS);
        const crudos: UniversosCrudo[] = [];
        let fallidos = 0;
        for (let i = 0; i < lotes.length; i++) {
          setProceso({
            etapa: "Calculando universos",
            detalle: `lote ${i + 1} de ${lotes.length}`,
            actual: i,
            total: lotes.length,
          });
          let logrado = false;
          for (let intento = 0; intento < 3 && !logrado; intento++) {
            try {
              const { crudo } = await postJson<{ crudo: UniversosCrudo }>(
                "/api/universos",
                { geocercas: lotes[i], crudo: true }
              );
              if (crudo?.ok) crudos.push(crudo);
              logrado = true;
            } catch {
              await new Promise((r) => setTimeout(r, 800 * (intento + 1)));
            }
          }
          if (!logrado) fallidos++;
        }
        setProceso(null);
        u = agregarUniversosCrudos(
          crudos,
          `${criterio}${fallidos > 0 ? ` · ${fallidos} de ${lotes.length} lotes fallaron y quedaron fuera` : ""}`
        );
      }
      setUniversos(u);
      reportar(
        u?.disponible ? "ok" : "error",
        u?.disponible
          ? "Universos del plan de pantallas listos"
          : (u?.mensaje ?? "Universos no disponibles")
      );
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al calcular universos");
    } finally {
      setOcupado(false);
      setProceso(null);
    }
  }

  // ---- exports
  function exportarCruceCsv() {
    if (!cruces) {
      reportar("error", "Ejecuta el cruce primero");
      return;
    }
    descargarArchivo(
      "seeker_ooh_cruce.csv",
      csvCruce(crucesPlan, pdvs, etiquetaOrigen),
      "text/csv;charset=utf-8"
    );
    reportar("ok", "Export data (CSV del cruce) descargado");
  }

  async function exportarPlanOoh() {
    if (crucesPlan.length === 0) {
      reportar("error", "Ejecuta el cruce primero");
      return;
    }
    setOcupado(true);
    setProceso({
      etapa: "Generando Export plan",
      detalle: "capturando el mapa · etapa 1 de 2",
      actual: 0,
      total: 2,
    });
    try {
      const [{ generarPlanOohPdf, nombreArchivoPlanOoh }, { capturarMapaPlan }] =
        await Promise.all([import("@/lib/ooh-pdf"), import("@/lib/plan-mapa")]);

      const lineas = crucesPlan.flatMap((c) =>
        c.pdvs.map((rel) => ({
          a: { lat: c.pantalla.lat, lng: c.pantalla.lng },
          b: { lat: pdvs[rel.idx].lat, lng: pdvs[rel.idx].lng },
          color: colorTipoPantalla(c.pantalla.tipo),
        }))
      );
      const mapaDataUrl = await capturarMapaPlan({
        pois: [],
        pantallas: crucesPlan.map((c) => ({
          lat: c.pantalla.lat,
          lng: c.pantalla.lng,
          color: colorTipoPantalla(c.pantalla.tipo),
          radioM: c.radioM,
        })),
        lineas,
        puntos: pdvs.map((o, i) => ({
          lat: o.lat,
          lng: o.lng,
          color: cubiertos.has(i) ? "#2fb9e8" : "#f4368a",
          hueco: !cubiertos.has(i),
        })),
      });

      setProceso({
        etapa: "Generando Export plan",
        detalle: "armando el PDF · etapa 2 de 2",
        actual: 1,
        total: 2,
      });
      const alcance = `${pdvs.length.toLocaleString("es-MX")} PDVs · ${crucesPlan.length.toLocaleString("es-MX")} pantallas`;
      const fecha = new Date();
      const fuentes = [
        `Inventario de pantallas OOH/DOOH de Gravity (${pantallas.length.toLocaleString("es-MX")} pantallas)`,
        "PDVs del cliente (carga propia)",
        ...(universos?.disponible
          ? ["Censo de Población y Vivienda 2020, INEGI — demografía por AGEB urbana"]
          : []),
        ...(universos?.disponible && (universos.rurales ?? 0) > 0
          ? ["ITER 2020, INEGI — población rural por localidad (<2,500 hab)"]
          : []),
      ];
      const blob = await generarPlanOohPdf({
        titulo: tituloPlan.trim() || null,
        alcance,
        usuario: usuario?.nombre ?? usuario?.email ?? "Seeker",
        fecha,
        cruces: [...crucesPlan].sort((a, b) => b.pdvs.length - a.pdvs.length),
        totalPdvs: pdvs.length,
        cubiertos: cubiertos.size,
        nombresPdv: pdvs.map((o, i) => etiquetaOrigen(o, i)),
        sinCobertura: sinCobertura.map(({ o, i }) => etiquetaOrigen(o, i)),
        impresiones: impresionesPlan,
        radioTexto,
        universos,
        mapaDataUrl,
        fuentes,
      });
      const titulo = tituloPlan.trim() || `Plan OOH ${alcance}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivoPlanOoh(titulo, fecha);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // dos entregables, un clic: el Export data acompaña al plan
      exportarCruceCsv();
      setProceso(null);
      reportar("ok", "Export plan (PDF) + Export data (CSV) descargados");
    } catch (e) {
      console.error(e);
      setProceso({
        etapa: "Generando Export plan",
        detalle: "",
        actual: 0,
        total: 1,
        error:
          e instanceof Error
            ? `No se pudo generar el plan: ${e.message}`
            : "No se pudo generar el plan",
        onReintentar: () => {
          setProceso(null);
          exportarPlanOoh();
        },
        onCerrar: () => setProceso(null),
      });
    } finally {
      setOcupado(false);
    }
  }

  // ---- helpers de UI
  const inputCls =
    "w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cian focus:outline-none";
  const labelCls =
    "mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500";
  const pasoCls = "border-b border-linea px-5 py-4";

  const chip = (activo: boolean, color = "cian") =>
    `rounded-full border px-2.5 py-0.5 font-mono text-[10px] transition-colors ${
      activo
        ? color === "violeta"
          ? "border-violeta bg-violeta/15 text-violeta"
          : "border-cian bg-cian/15 text-cian"
        : "border-linea bg-panel2 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
    }`;
  const toggleEn = (set: Set<string>, v: string): Set<string> => {
    const nuevo = new Set(set);
    if (nuevo.has(v)) nuevo.delete(v);
    else nuevo.add(v);
    return nuevo;
  };

  const filasTabla =
    vistaTabla === "pantallas"
      ? [...crucesPlan].sort((a, b) => b.pdvs.length - a.pdvs.length)
      : [];

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-fondo p-3">
      <AppHeader usuario={usuario} status={status} />

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ---------- panel lateral ---------- */}
        <aside className="tarjeta w-[360px] shrink-0 overflow-y-auto">
          {/* 01 · PDVs del cliente */}
          <section className={pasoCls}>
            <label className={labelCls}>01 · PDVs del cliente</label>
            <input
              ref={inputPdvsRef}
              type="file"
              accept=".csv,.txt,.xls,.xlsx"
              disabled={ocupado}
              onChange={(e) => cargarPdvs(e.target.files?.[0])}
              className={`${inputCls} file:mr-3 file:rounded file:border-0 file:bg-cian/20 file:px-3 file:py-1 file:font-mono file:text-[11px] file:text-cian`}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                onClick={descargarPlantillaOrigenes}
                className="font-mono text-[10px] text-zinc-500 underline decoration-dotted underline-offset-2 hover:text-cian"
              >
                ⬇ Descargar plantilla (nombre, lat/lng o dirección)
              </button>
              {pdvs.length > 0 && (
                <span className="shrink-0 rounded-full border border-cian/50 bg-cian/10 px-2.5 py-0.5 font-mono text-[10px] text-cian">
                  {pdvs.length.toLocaleString("es-MX")} PDVs
                </span>
              )}
            </div>
            {notaCarga && (
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
                {notaCarga}
              </p>
            )}
          </section>

          {/* 02 · radio de cruce */}
          <section className={pasoCls}>
            <label className={labelCls}>02 · Radio de cruce</label>
            {!radioDiferenciado && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS_KM.map((km) => (
                    <button
                      key={km}
                      onClick={() => setRadioKm(km)}
                      className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                        radioKm === km
                          ? "border-cian bg-cian/10 text-cian"
                          : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      {km} km
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={0.5}
                    max={100}
                    step={0.5}
                    value={radioKm}
                    onChange={(e) => setRadioKm(Number(e.target.value) || 1)}
                    className={`${inputCls} w-24`}
                  />
                  <span className="font-mono text-[11px] text-zinc-500">
                    km (personalizado)
                  </span>
                </div>
              </>
            )}
            <label className="mt-3 flex cursor-pointer items-center gap-2 font-mono text-[11px] text-zinc-400">
              <input
                type="checkbox"
                checked={radioDiferenciado}
                onChange={(e) => setRadioDiferenciado(e.target.checked)}
                className="accent-cian"
              />
              Radio diferenciado por zona (urbano / foráneo)
            </label>
            {radioDiferenciado && (
              <div className="mt-2 flex items-center gap-3 font-mono text-[11px] text-zinc-400">
                <span>ZMVM</span>
                <input
                  type="number"
                  min={0.5}
                  max={100}
                  step={0.5}
                  value={radioUrbanoKm}
                  onChange={(e) => setRadioUrbanoKm(Number(e.target.value) || 1)}
                  className={`${inputCls} w-20`}
                />
                <span>km · resto</span>
                <input
                  type="number"
                  min={0.5}
                  max={100}
                  step={0.5}
                  value={radioForaneoKm}
                  onChange={(e) => setRadioForaneoKm(Number(e.target.value) || 1)}
                  className={`${inputCls} w-20`}
                />
                <span>km</span>
              </div>
            )}
            {radioDiferenciado && (
              <p className="mt-1.5 font-mono text-[10px] text-zinc-600">
                La zona se detecta por la ubicación de cada pantalla (Valle de
                México = radio urbano).
              </p>
            )}
          </section>

          {/* 03 · filtros de pantallas */}
          <section className={pasoCls}>
            <label className={labelCls}>
              03 · Pantallas del inventario
              <span className="ml-2 normal-case tracking-normal text-zinc-400">
                {inventarioCargado
                  ? `${pantallasFiltradas.length.toLocaleString("es-MX")} de ${pantallas.length.toLocaleString("es-MX")}`
                  : "cargando…"}
              </span>
            </label>
            {inventarioCargado && pantallas.length === 0 && (
              <p className="font-mono text-[11px] leading-relaxed text-zinc-500">
                No hay inventario cargado.{" "}
                {usuario?.rol === "admin"
                  ? "Cárgalo en Admin → Cargar inventario de pantallas (OOH)."
                  : "Pide a un admin cargarlo en Admin."}
              </p>
            )}
            {tiposDisponibles.length > 0 && (
              <div className="mb-2">
                <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                  Tipo
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tiposDisponibles.map((t) => (
                    <button
                      key={t}
                      onClick={() => setFTipos(toggleEn(fTipos, t))}
                      className={chip(fTipos.has(t))}
                      style={
                        fTipos.has(t)
                          ? { borderColor: TIPOS_PANTALLA[t].color, color: TIPOS_PANTALLA[t].color, backgroundColor: `${TIPOS_PANTALLA[t].color}1f` }
                          : undefined
                      }
                    >
                      {TIPOS_PANTALLA[t].etiqueta}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {ciudadesDisponibles.length > 1 && (
              <div className="mb-2">
                <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                  Ciudad
                </p>
                <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                  {ciudadesDisponibles.map((c) => (
                    <button
                      key={c}
                      onClick={() => setFCiudades(toggleEn(fCiudades, c))}
                      className={chip(fCiudades.has(c))}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mediosDisponibles.length > 1 && (
              <div className="mb-2">
                <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                  Medio / vendor
                </p>
                <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
                  {mediosDisponibles.map((m) => (
                    <button
                      key={m}
                      onClick={() => setFMedios(toggleEn(fMedios, m))}
                      className={chip(fMedios.has(m), "violeta")}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {pantallas.some((p) => p.digital !== null) && (
              <div>
                <p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">
                  Tecnología
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["todas", "Todas"],
                      ["digital", "Digital"],
                      ["estatica", "Estática"],
                    ] as const
                  ).map(([v, etiqueta]) => (
                    <button
                      key={v}
                      onClick={() => setFDigital(v)}
                      className={chip(fDigital === v)}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-2 font-mono text-[10px] text-zinc-600">
              Sin chips seleccionados se usan todas. Los filtros son
              multiselección (OR dentro de cada grupo).
            </p>
          </section>

          {/* 04 · ejecutar */}
          <section className={pasoCls}>
            <button
              onClick={ejecutarCruce}
              disabled={ocupado || pdvs.length === 0 || pantallasFiltradas.length === 0}
              className="w-full rounded-md bg-cian px-3 py-2.5 font-display text-sm font-extrabold text-fondo transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Ejecutar cruce pantallas × PDVs
            </button>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-600">
              El cruce corre local (Haversine sobre el inventario): 0 llamadas
              a Google.
            </p>
          </section>

          {/* 05 · universos + exports */}
          {cruces && (
            <section className={pasoCls}>
              <label className={labelCls}>05 · Universos y exports</label>
              <button
                onClick={calcularUniversos}
                disabled={ocupado || crucesPlan.length === 0}
                className="w-full rounded-md border border-violeta bg-violeta/10 px-3 py-2 font-mono text-xs text-violeta transition-colors hover:bg-violeta/20 disabled:opacity-40"
              >
                Calcular universos del plan de pantallas
              </button>
              <input
                value={tituloPlan}
                onChange={(e) => setTituloPlan(e.target.value)}
                placeholder="Título del plan (opcional)"
                className={`${inputCls} mt-3`}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={exportarCruceCsv}
                  disabled={ocupado || crucesPlan.length === 0}
                  className="rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-300 transition-colors hover:border-cian hover:text-cian disabled:opacity-40"
                >
                  Export data (CSV)
                </button>
                <button
                  onClick={exportarPlanOoh}
                  disabled={ocupado || crucesPlan.length === 0}
                  className="rounded-md bg-magenta px-3 py-2 font-display text-xs font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Export plan (PDF)
                </button>
              </div>
            </section>
          )}
        </aside>

        {/* ---------- mapa + tarjetas + tabla ---------- */}
        <main className="tarjeta flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
            <div className="min-w-0">
              <h2 className="font-display text-base font-extrabold tracking-tight text-white">
                OOH · Cruce pantallas × puntos de venta
              </h2>
              <p className="truncate font-mono text-[10px] text-zinc-500">
                Geo-PDOOH: qué pantallas apoyan a qué puntos de venta · radio{" "}
                {radioTexto}
              </p>
            </div>
            {cruces && (
              <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-400">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={verLineas}
                    onChange={(e) => setVerLineas(e.target.checked)}
                    className="accent-cian"
                  />
                  Líneas
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={verRadios}
                    onChange={(e) => setVerRadios(e.target.checked)}
                    className="accent-cian"
                  />
                  Radios
                </label>
              </div>
            )}
          </div>

          {/* tarjetas de resumen */}
          {cruces && (
            <div className="flex shrink-0 flex-wrap gap-2 px-5 pb-3">
              {[
                {
                  etiqueta: "Pantallas en el plan",
                  valor: crucesPlan.length,
                  color: "text-violeta",
                  extra:
                    cruces.length - crucesPlan.length > 0
                      ? `${(cruces.length - crucesPlan.length).toLocaleString("es-MX")} del filtro sin PDV cerca`
                      : null,
                },
                {
                  etiqueta: "PDVs cubiertos",
                  valor: cubiertos.size,
                  color: "text-cian",
                  extra: `de ${pdvs.length.toLocaleString("es-MX")}`,
                },
                {
                  etiqueta: "PDVs sin cobertura",
                  valor: sinCobertura.length,
                  color: sinCobertura.length > 0 ? "text-magenta" : "text-emerald-400",
                  extra: sinCobertura.length > 0 ? "falta inventario ahí" : "cobertura total",
                },
                ...(impresionesPlan != null
                  ? [
                      {
                        etiqueta: "Impresiones/mes del plan",
                        valor: impresionesPlan,
                        color: "text-zinc-200",
                        extra: null as string | null,
                      },
                    ]
                  : []),
              ].map((t) => (
                <div
                  key={t.etiqueta}
                  className="min-w-[150px] flex-1 rounded-lg border border-linea bg-panel2 px-4 py-2"
                >
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                    {t.etiqueta}
                  </p>
                  <p className={`font-display text-xl font-extrabold ${t.color}`}>
                    {t.valor.toLocaleString("es-MX")}
                  </p>
                  {t.extra && (
                    <p className="font-mono text-[9px] text-zinc-600">{t.extra}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {universos && (
            <div className="shrink-0 px-5 pb-3">
              <UniversosPanel universos={universos} notaTerritorio />
            </div>
          )}

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <OohMap
              pdvs={pdvs}
              cruces={cruces ? crucesPlan : null}
              cubiertos={cubiertos}
              verLineas={verLineas}
              verRadios={verRadios}
              foco={foco}
            />
            <OverlayProgreso proceso={proceso} />

            {/* leyenda por tipo */}
            {cruces && crucesPlan.length > 0 && (
              <div className="absolute right-3 top-3 z-[800] rounded-lg border border-linea bg-panel/90 px-3 py-2 backdrop-blur">
                {Array.from(new Set(crucesPlan.map((c) => c.pantalla.tipo))).map(
                  (t) => (
                    <div key={t} className="flex items-center gap-2 font-mono text-[10px] text-zinc-300">
                      <span
                        className="inline-block h-2.5 w-2.5"
                        style={{ backgroundColor: colorTipoPantalla(t) }}
                      />
                      {etiquetaTipoPantalla(t)}{" "}
                      <span className="text-zinc-500">
                        {crucesPlan.filter((c) => c.pantalla.tipo === t).length}
                      </span>
                    </div>
                  )
                )}
                <div className="mt-1 flex items-center gap-2 border-t border-linea pt-1 font-mono text-[10px] text-zinc-300">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-cian" />
                  PDV cubierto
                </div>
                {sinCobertura.length > 0 && (
                  <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-300">
                    <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-magenta" />
                    PDV sin cobertura
                  </div>
                )}
              </div>
            )}

            {/* tabla del cruce */}
            {cruces && crucesPlan.length > 0 && (
              <div className="absolute bottom-0 left-0 right-0 z-[1000] border-t border-linea bg-panel/95 backdrop-blur">
                <div className="flex w-full items-center justify-between px-4 py-2">
                  <button
                    onClick={() => setTablaColapsada(!tablaColapsada)}
                    className="text-left font-mono text-xs uppercase tracking-widest text-zinc-400"
                  >
                    Cruce{" "}
                    <span className="text-violeta">
                      {crucesPlan.length} pantallas
                    </span>{" "}
                    · <span className="text-cian">{cubiertos.size} PDVs</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 rounded-full border border-linea bg-panel2 p-0.5">
                      {(
                        [
                          ["pantallas", "Por pantalla"],
                          ["pdvs", "Por PDV"],
                        ] as const
                      ).map(([v, etiqueta]) => (
                        <button
                          key={v}
                          onClick={() => setVistaTabla(v)}
                          className={`rounded-full px-3 py-1 font-mono text-[10px] transition-colors ${
                            vistaTabla === v
                              ? "bg-cian/15 text-cian"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          {etiqueta}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setTablaColapsada(!tablaColapsada)}
                      className="font-mono text-xs text-zinc-500"
                    >
                      {tablaColapsada ? "▲ mostrar" : "▼ ocultar"}
                    </button>
                  </div>
                </div>

                {!tablaColapsada && vistaTabla === "pantallas" && (
                  <div className="max-h-56 overflow-y-auto border-t border-linea">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="sticky top-0 bg-panel2 text-zinc-500">
                        <tr>
                          <th className="px-4 py-2 font-medium">Pantalla</th>
                          <th className="px-2 py-2 font-medium">Tipo</th>
                          <th className="px-2 py-2 font-medium">Medio</th>
                          <th className="px-2 py-2 font-medium">Ciudad</th>
                          <th className="px-2 py-2 text-right font-medium">PDVs</th>
                          <th className="px-2 py-2 font-medium">Apoya a</th>
                          <th className="px-4 py-2 text-right font-medium">Impr./mes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filasTabla.slice(0, MAX_FILAS_TABLA).map((c) => (
                          <tr
                            key={c.pantalla.clave}
                            onClick={() =>
                              setFoco({
                                lat: c.pantalla.lat,
                                lng: c.pantalla.lng,
                                zoom: 14,
                              })
                            }
                            className="cursor-pointer border-t border-linea/60 text-zinc-300 transition-colors hover:bg-panel2"
                            title="Clic para hacer zoom en el mapa"
                          >
                            <td className="max-w-[200px] truncate px-4 py-1.5">
                              <span
                                className="mr-1.5 inline-block h-2 w-2 shrink-0"
                                style={{
                                  backgroundColor: colorTipoPantalla(c.pantalla.tipo),
                                }}
                              />
                              {c.pantalla.nombre ?? c.pantalla.clave}
                            </td>
                            <td
                              className="px-2 py-1.5"
                              style={{ color: colorTipoPantalla(c.pantalla.tipo) }}
                            >
                              {etiquetaTipoPantalla(c.pantalla.tipo).split(" / ")[0]}
                              {c.pantalla.digital !== null && (
                                <span className="ml-1 text-zinc-600">
                                  {c.pantalla.digital ? "· dig" : "· est"}
                                </span>
                              )}
                            </td>
                            <td className="max-w-[110px] truncate px-2 py-1.5 text-zinc-500">
                              {c.pantalla.medio ?? "—"}
                            </td>
                            <td className="max-w-[110px] truncate px-2 py-1.5 text-zinc-500">
                              {c.pantalla.ciudad ?? "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right text-cian">
                              {c.pdvs.length}
                            </td>
                            <td
                              className="max-w-[340px] truncate px-2 py-1.5 text-zinc-400"
                              title={c.pdvs
                                .map(
                                  (rel) =>
                                    `${etiquetaOrigen(pdvs[rel.idx], rel.idx)} (${(rel.distancia / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} km)`
                                )
                                .join(" · ")}
                            >
                              {c.pdvs
                                .slice(0, 4)
                                .map(
                                  (rel) =>
                                    `${etiquetaOrigen(pdvs[rel.idx], rel.idx)} (${(rel.distancia / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} km)`
                                )
                                .join(" · ")}
                              {c.pdvs.length > 4 && ` +${c.pdvs.length - 4}`}
                            </td>
                            <td className="px-4 py-1.5 text-right text-zinc-400">
                              {c.pantalla.impresiones != null
                                ? c.pantalla.impresiones.toLocaleString("es-MX")
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filasTabla.length > MAX_FILAS_TABLA && (
                      <p className="border-t border-linea/60 px-4 py-1.5 font-mono text-[10px] text-zinc-600">
                        Mostrando {MAX_FILAS_TABLA} de {filasTabla.length} — el
                        detalle completo va en el CSV del cruce.
                      </p>
                    )}
                  </div>
                )}

                {!tablaColapsada && vistaTabla === "pdvs" && (
                  <div className="max-h-56 overflow-y-auto border-t border-linea">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="sticky top-0 bg-panel2 text-zinc-500">
                        <tr>
                          <th className="px-4 py-2 font-medium">PDV</th>
                          <th className="px-2 py-2 text-right font-medium">Pantallas</th>
                          <th className="px-2 py-2 font-medium">Lo apoyan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pdvs.slice(0, MAX_FILAS_TABLA).map((o, i) => {
                          const apoyos = porPdv.get(i) ?? [];
                          const sinCob = apoyos.length === 0;
                          return (
                            <tr
                              key={`pdv-${i}`}
                              onClick={() => setFoco({ lat: o.lat, lng: o.lng, zoom: 14 })}
                              className="cursor-pointer border-t border-linea/60 text-zinc-300 transition-colors hover:bg-panel2"
                              title="Clic para hacer zoom en el mapa"
                            >
                              <td className="max-w-[240px] truncate px-4 py-1.5">
                                <span
                                  className={`mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full border-2 ${
                                    sinCob ? "border-magenta" : "border-cian"
                                  }`}
                                />
                                {etiquetaOrigen(o, i)}
                              </td>
                              <td
                                className={`px-2 py-1.5 text-right ${sinCob ? "text-magenta" : "text-cian"}`}
                              >
                                {apoyos.length}
                              </td>
                              <td
                                className="max-w-[420px] truncate px-2 py-1.5 text-zinc-400"
                                title={apoyos
                                  .map(
                                    (a) =>
                                      `${a.pantalla.nombre ?? a.pantalla.clave} (${(a.distancia / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} km)`
                                  )
                                  .join(" · ")}
                              >
                                {sinCob
                                  ? "SIN COBERTURA — ninguna pantalla dentro del radio"
                                  : apoyos
                                      .slice(0, 4)
                                      .map(
                                        (a) =>
                                          `${a.pantalla.nombre ?? a.pantalla.clave} (${(a.distancia / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} km)`
                                      )
                                      .join(" · ") +
                                    (apoyos.length > 4 ? ` +${apoyos.length - 4}` : "")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {pdvs.length > MAX_FILAS_TABLA && (
                      <p className="border-t border-linea/60 px-4 py-1.5 font-mono text-[10px] text-zinc-600">
                        Mostrando {MAX_FILAS_TABLA} de {pdvs.length} — el detalle
                        completo va en el CSV del cruce.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
