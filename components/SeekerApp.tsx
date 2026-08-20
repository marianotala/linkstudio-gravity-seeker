"use client";

// Página principal de Seeker: header con estatus animado, panel lateral
// de 360px con los pasos, mapa y tabla de resultados. Toda la key de
// Google vive en el servidor; aquí solo se llama a /api/*.

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import AppHeader, { type StatusTipo } from "./AppHeader";
import ResultsTable from "./ResultsTable";
import { CATEGORIAS, SOLO_NOMBRE } from "@/lib/categories";
import { haversine } from "@/lib/geo";
import { createClient } from "@/lib/supabase/client";
import {
  parsearArchivo,
  parsearCoordenadas,
  parsearDirecciones,
  type ArchivoParseado,
} from "@/lib/parse";
import {
  exportarCsv,
  exportarGeoJsonPuntos,
  exportarGeoJsonGeocercas,
  exportarGeoJsonRadiosOrigen,
} from "@/lib/exports";
import type {
  ApiError,
  GeocodeResponse,
  Origin,
  PerfilUsuario,
  Poi,
  ResultadoGuardado,
  SearchMode,
  SearchRequest,
  SearchResponse,
} from "@/lib/types";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-fondo font-mono text-xs text-zinc-600">
      Cargando mapa…
    </div>
  ),
});

type InputTab = "direcciones" | "coordenadas" | "archivo";

const RADIOS = [
  { m: 250, label: "250 m" },
  { m: 500, label: "500 m" },
  { m: 1000, label: "1 km" },
  { m: 2000, label: "2 km" },
  { m: 3000, label: "3 km" },
  { m: 5000, label: "5 km" },
];

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as ApiError).error ?? `Error ${res.status}`);
  }
  return data as T;
}

export default function SeekerApp({
  usuario,
}: {
  usuario: PerfilUsuario | null;
}) {
  // ---- estado de configuración
  const [mode, setMode] = useState<SearchMode>("origins");
  const [tab, setTab] = useState<InputTab>("direcciones");
  const [textDirecciones, setTextDirecciones] = useState("");
  const [textCoords, setTextCoords] = useState("");
  const [archivo, setArchivo] = useState<ArchivoParseado | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [origenes, setOrigenes] = useState<Origin[]>([]);
  const [zonaQuery, setZonaQuery] = useState("");
  const [zona, setZona] = useState<Origin | null>(null);
  const [radio, setRadio] = useState(1000);
  const [categoria, setCategoria] = useState(CATEGORIAS[0].key);
  const [nameFilter, setNameFilter] = useState("");
  const [excludes, setExcludes] = useState<string[]>([]);
  const [excludeInput, setExcludeInput] = useState("");

  // ---- estado de resultados
  const [pois, setPois] = useState<Poi[]>([]);
  const [contadores, setContadores] = useState({
    excluidos: 0,
    descartadosPorNombre: 0,
  });
  const [status, setStatus] = useState<{ tipo: StatusTipo; texto: string }>({
    tipo: "idle",
    texto: "Listo para buscar",
  });
  const [ocupado, setOcupado] = useState(false);
  const [tablaColapsada, setTablaColapsada] = useState(false);
  const [foco, setFoco] = useState<Poi | null>(null);

  // ---- configuración de exports
  const [radioGeocerca, setRadioGeocerca] = useState(50);
  const [vertices, setVertices] = useState(12);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const centrosActivos = useMemo<Origin[]>(
    () => (mode === "origins" ? origenes : zona ? [zona] : []),
    [mode, origenes, zona]
  );

  function reportar(tipo: StatusTipo, texto: string) {
    setStatus({ tipo, texto });
  }

  // ---- cargar (?cargar=id) o duplicar (?duplicar=id) desde el historial
  const searchParams = useSearchParams();
  const historialRef = useRef(false);
  useEffect(() => {
    if (historialRef.current) return;
    const idCargar = searchParams.get("cargar");
    const idDuplicar = searchParams.get("duplicar");
    const id = idCargar ?? idDuplicar;
    if (!id) return;
    historialRef.current = true;

    (async () => {
      setStatus({ tipo: "busy", texto: "Cargando búsqueda del historial…" });
      const supabase = createClient();
      const { data: busqueda, error } = await supabase
        .from("searches")
        .select("id, mode, params, result_count")
        .eq("id", id)
        .single();
      if (error || !busqueda) {
        setStatus({
          tipo: "error",
          texto: "No encontré esa búsqueda en tu historial",
        });
        return;
      }

      // Precargar los parámetros originales.
      const p = busqueda.params as SearchRequest;
      setMode(p.mode);
      setRadio(p.radius);
      setCategoria(p.category);
      setNameFilter(p.nameFilter ?? "");
      setExcludes(p.excludes ?? []);
      if (p.mode === "origins") {
        setOrigenes(p.centers);
        setTab("coordenadas");
      } else {
        setZona(p.centers[0] ?? null);
        setZonaQuery(p.centers[0]?.nombre ?? "");
      }

      if (!idCargar) {
        setStatus({
          tipo: "ok",
          texto: "Parámetros duplicados del historial: ajusta y vuelve a buscar",
        });
        return;
      }

      // Cargar también los POIs guardados — sin llamar a Google.
      const { data: filas, error: errorFilas } = await supabase
        .from("search_results")
        .select("*")
        .eq("search_id", id);
      if (errorFilas || !filas) {
        setStatus({
          tipo: "error",
          texto: "No pude cargar los POIs de esa búsqueda",
        });
        return;
      }
      const cargados: Poi[] = (filas as ResultadoGuardado[]).map((r) => {
        let mejorIdx = 0;
        let mejorDist = Infinity;
        p.centers.forEach((c, i) => {
          const d = haversine(c, { lat: r.lat, lng: r.lng });
          if (d < mejorDist) {
            mejorDist = d;
            mejorIdx = i;
          }
        });
        return {
          placeId: r.place_id ?? r.id,
          nombre: r.name,
          direccion: r.address ?? "",
          lat: r.lat,
          lng: r.lng,
          types: [],
          distancia: r.distance_m ?? Math.round(mejorDist),
          origenIdx: mejorIdx,
        };
      });
      cargados.sort((a, b) => a.distancia - b.distancia);
      setPois(cargados);
      setTablaColapsada(false);
      setStatus({
        tipo: "ok",
        texto: `Búsqueda del historial: ${cargados.length} POIs cargados sin llamar a Google`,
      });
    })();
  }, [searchParams]);

  // ---- paso 2: procesar orígenes (direcciones / coordenadas / archivo)
  async function procesarOrigenes() {
    setFoco(null);
    try {
      if (tab === "coordenadas") {
        const parsed = parsearCoordenadas(textCoords);
        if (parsed.length === 0) {
          reportar("error", "No encontré coordenadas válidas (formato: lat, lng, nombre)");
          return;
        }
        setOrigenes(parsed);
        reportar("ok", `${parsed.length} orígenes listos`);
        return;
      }

      let direcciones: { direccion: string; nombre?: string }[] = [];
      if (tab === "direcciones") {
        direcciones = parsearDirecciones(textDirecciones).map((d) => ({
          direccion: d,
        }));
        if (direcciones.length === 0) {
          reportar("error", "Escribe al menos una dirección (una por línea)");
          return;
        }
      } else {
        if (!archivo) {
          reportar("error", "Primero sube un archivo Excel o CSV");
          return;
        }
        if (archivo.origenes.length > 0) {
          setOrigenes(archivo.origenes);
          reportar("ok", `${archivo.origenes.length} orígenes listos (desde archivo)`);
          return;
        }
        direcciones = archivo.direcciones;
        if (direcciones.length === 0) {
          reportar("error", archivo.deteccion);
          return;
        }
      }

      setOcupado(true);
      reportar("busy", `Geocodificando ${direcciones.length} direcciones…`);
      const { resultados } = await postJson<GeocodeResponse>("/api/geocode", {
        direcciones: direcciones.map((d) => d.direccion),
      });

      const listos: Origin[] = [];
      let fallidas = 0;
      resultados.forEach((r, i) => {
        if (r.ok && r.lat !== undefined && r.lng !== undefined) {
          listos.push({
            lat: r.lat,
            lng: r.lng,
            nombre: direcciones[i].nombre,
            direccion: r.formatted ?? direcciones[i].direccion,
          });
        } else {
          fallidas++;
        }
      });

      if (listos.length === 0) {
        reportar("error", "Ninguna dirección se pudo geocodificar");
        return;
      }
      setOrigenes(listos);
      reportar(
        "ok",
        fallidas > 0
          ? `${listos.length} orígenes listos · ${fallidas} direcciones fallaron`
          : `${listos.length} orígenes listos`
      );
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al procesar orígenes");
    } finally {
      setOcupado(false);
    }
  }

  async function onArchivo(file: File | undefined) {
    if (!file) return;
    setNombreArchivo(file.name);
    try {
      const parsed = await parsearArchivo(file);
      setArchivo(parsed);
      const total = parsed.origenes.length + parsed.direcciones.length;
      reportar(
        total > 0 ? "ok" : "error",
        total > 0 ? `${total} filas detectadas · ${parsed.deteccion}` : parsed.deteccion
      );
    } catch {
      setArchivo(null);
      reportar("error", "No pude leer el archivo. ¿Es un .xlsx o .csv válido?");
    }
  }

  // ---- paso 2 (modo zona): ubicar la zona
  async function ubicarZona() {
    const query = zonaQuery.trim();
    if (!query) {
      reportar("error", "Escribe una ciudad o zona, p. ej. Polanco, CDMX");
      return;
    }
    setOcupado(true);
    setFoco(null);
    reportar("busy", `Ubicando "${query}"…`);
    try {
      const { resultados } = await postJson<GeocodeResponse>("/api/geocode", {
        direcciones: [query],
      });
      const r = resultados[0];
      if (!r?.ok || r.lat === undefined || r.lng === undefined) {
        reportar("error", r?.error ?? "No encontré esa zona");
        return;
      }
      setZona({ lat: r.lat, lng: r.lng, nombre: r.formatted ?? query });
      reportar("ok", `Zona ubicada: ${r.formatted ?? query}`);
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al ubicar la zona");
    } finally {
      setOcupado(false);
    }
  }

  // ---- paso 4: buscar POIs
  async function buscar() {
    if (centrosActivos.length === 0) {
      reportar(
        "error",
        mode === "origins"
          ? "Primero procesa tus orígenes (paso 02)"
          : "Primero ubica la zona (paso 02)"
      );
      return;
    }
    if (categoria === SOLO_NOMBRE && !nameFilter.trim()) {
      reportar("error", 'Para buscar "solo por nombre" escribe un nombre en el filtro');
      return;
    }

    setOcupado(true);
    setFoco(null);
    reportar(
      "busy",
      mode === "origins"
        ? `Buscando POIs alrededor de ${centrosActivos.length} orígenes…`
        : "Buscando POIs en la zona…"
    );
    try {
      const body: SearchRequest = {
        mode,
        centers: centrosActivos,
        radius: radio,
        category: categoria,
        nameFilter: nameFilter.trim(),
        excludes,
      };
      const data = await postJson<SearchResponse>("/api/search", body);
      setPois(data.pois);
      setContadores({
        excluidos: data.excluidos,
        descartadosPorNombre: data.descartadosPorNombre,
      });
      setTablaColapsada(false);
      const extras: string[] = [];
      if (data.excluidos > 0) extras.push(`${data.excluidos} excluidos`);
      if (data.descartadosPorNombre > 0)
        extras.push(`${data.descartadosPorNombre} descartados por nombre`);
      reportar(
        data.pois.length > 0 ? "ok" : "error",
        data.pois.length > 0
          ? `${data.pois.length} POIs encontrados${extras.length ? " · " + extras.join(" · ") : ""}`
          : `Sin resultados${extras.length ? " · " + extras.join(" · ") : ""}`
      );
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al buscar POIs");
    } finally {
      setOcupado(false);
    }
  }

  // ---- exclusiones tipo tag
  function agregarExclusion() {
    const valor = excludeInput.trim().toLowerCase();
    if (!valor) return;
    if (!excludes.includes(valor)) setExcludes([...excludes, valor]);
    setExcludeInput("");
  }

  // ---- estilos compartidos
  const inputCls =
    "w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cian focus:outline-none";
  const labelCls =
    "mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500";
  const pasoCls = "border-b border-linea px-5 py-4";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <AppHeader usuario={usuario} status={status} />

      <div className="flex min-h-0 flex-1">
        {/* ---------- panel lateral ---------- */}
        <aside className="w-[360px] shrink-0 overflow-y-auto border-r border-linea bg-panel">
          {/* 01 · modo */}
          <section className={pasoCls}>
            <label className={labelCls}>01 · Modo de búsqueda</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode("origins")}
                className={`rounded-md border px-3 py-2 font-mono text-xs transition-colors ${
                  mode === "origins"
                    ? "border-cian bg-cian/10 text-cian"
                    : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                Por orígenes
              </button>
              <button
                onClick={() => setMode("zone")}
                className={`rounded-md border px-3 py-2 font-mono text-xs transition-colors ${
                  mode === "zone"
                    ? "border-violeta bg-violeta/10 text-violeta"
                    : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                Por zona
              </button>
            </div>
          </section>

          {/* 02 · orígenes o zona */}
          {mode === "origins" ? (
            <section className={pasoCls}>
              <label className={labelCls}>02 · Tus orígenes (PDVs)</label>
              <div className="mb-3 flex gap-1 rounded-md border border-linea bg-panel2 p-1">
                {(
                  [
                    ["direcciones", "Direcciones"],
                    ["coordenadas", "Coordenadas"],
                    ["archivo", "Excel/CSV"],
                  ] as [InputTab, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`flex-1 rounded px-2 py-1.5 font-mono text-[11px] transition-colors ${
                      tab === key
                        ? "bg-cian/15 text-cian"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "direcciones" && (
                <textarea
                  value={textDirecciones}
                  onChange={(e) => setTextDirecciones(e.target.value)}
                  rows={5}
                  placeholder={
                    "Una dirección por línea:\nAv. Reforma 222, CDMX\nAv. Chapultepec 480, Guadalajara"
                  }
                  className={`${inputCls} resize-y`}
                />
              )}

              {tab === "coordenadas" && (
                <textarea
                  value={textCoords}
                  onChange={(e) => setTextCoords(e.target.value)}
                  rows={5}
                  placeholder={
                    "lat, lng, nombre (opcional):\n19.4326, -99.1332, Sucursal Centro\n20.6597, -103.3496"
                  }
                  className={`${inputCls} resize-y`}
                />
              )}

              {tab === "archivo" && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.txt"
                    className="hidden"
                    onChange={(e) => onArchivo(e.target.files?.[0])}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-md border border-dashed border-linea bg-panel2 px-3 py-5 font-mono text-xs text-zinc-500 transition-colors hover:border-cian hover:text-cian"
                  >
                    {nombreArchivo || "Subir .xlsx o .csv"}
                  </button>
                  {archivo && (
                    <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
                      {archivo.deteccion}
                    </p>
                  )}
                  <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-600">
                    Detecto columnas automáticamente: lat/lng, direccion,
                    nombre y variantes.
                  </p>
                </div>
              )}

              <button
                onClick={procesarOrigenes}
                disabled={ocupado}
                className="mt-3 w-full rounded-md border border-cian bg-cian/10 px-3 py-2 font-mono text-xs font-medium text-cian transition-colors hover:bg-cian/20 disabled:opacity-40"
              >
                Procesar orígenes
              </button>
              {origenes.length > 0 && (
                <p className="mt-2 font-mono text-[11px] text-cian">
                  ● {origenes.length} orígenes listos
                </p>
              )}
            </section>
          ) : (
            <section className={pasoCls}>
              <label className={labelCls}>02 · Tu zona</label>
              <input
                value={zonaQuery}
                onChange={(e) => setZonaQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ubicarZona()}
                placeholder="p. ej. Polanco, CDMX"
                className={inputCls}
              />
              <button
                onClick={ubicarZona}
                disabled={ocupado}
                className="mt-3 w-full rounded-md border border-violeta bg-violeta/10 px-3 py-2 font-mono text-xs font-medium text-violeta transition-colors hover:bg-violeta/20 disabled:opacity-40"
              >
                Ubicar zona
              </button>
              {zona && (
                <p className="mt-2 truncate font-mono text-[11px] text-violeta">
                  ● {zona.nombre}
                </p>
              )}
            </section>
          )}

          {/* 03 · radio */}
          <section className={pasoCls}>
            <label className={labelCls}>03 · Radio de búsqueda</label>
            <div className="flex flex-wrap gap-2">
              {RADIOS.map((r) => (
                <button
                  key={r.m}
                  onClick={() => setRadio(r.m)}
                  className={`rounded-full border px-3 py-1 font-mono text-[11px] transition-colors ${
                    radio === r.m
                      ? "border-cian bg-cian/10 text-cian"
                      : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="number"
                min={50}
                max={50000}
                value={radio}
                onChange={(e) => setRadio(Number(e.target.value) || 50)}
                className={`${inputCls} w-28`}
              />
              <span className="font-mono text-[11px] text-zinc-500">
                metros (personalizado)
              </span>
            </div>
          </section>

          {/* 04 · qué buscar */}
          <section className={pasoCls}>
            <label className={labelCls}>04 · Qué buscar</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className={inputCls}
            >
              {CATEGORIAS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
              <option value={SOLO_NOMBRE}>Solo por nombre</option>
            </select>

            <input
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Filtro de nombre · p. ej. oxxo"
              className={`${inputCls} mt-3`}
            />
            <p className="mt-1 font-mono text-[10px] text-zinc-600">
              Filtro estricto: sin acentos ni mayúsculas, todas las palabras
              deben aparecer en el nombre.
            </p>

            <div className="mt-3">
              <input
                value={excludeInput}
                onChange={(e) => setExcludeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    agregarExclusion();
                  }
                }}
                placeholder="Excluir marcas · Enter para agregar"
                className={inputCls}
              />
              {excludes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {excludes.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setExcludes(excludes.filter((x) => x !== ex))}
                      className="group flex items-center gap-1 rounded-full border border-magenta/50 bg-magenta/10 px-2.5 py-0.5 font-mono text-[11px] text-magenta"
                      title="Quitar exclusión"
                    >
                      {ex}
                      <span className="text-magenta/60 group-hover:text-magenta">×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={buscar}
              disabled={ocupado}
              className="mt-4 w-full rounded-md bg-magenta px-3 py-2.5 font-display text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {ocupado ? "Buscando…" : "Buscar POIs"}
            </button>

            {(pois.length > 0 ||
              contadores.excluidos > 0 ||
              contadores.descartadosPorNombre > 0) && (
              <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px]">
                <span className="rounded-full border border-magenta/50 px-2 py-0.5 text-magenta">
                  {pois.length} POIs
                </span>
                <span className="rounded-full border border-linea px-2 py-0.5 text-zinc-500">
                  {contadores.excluidos} excluidos
                </span>
                <span className="rounded-full border border-linea px-2 py-0.5 text-zinc-500">
                  {contadores.descartadosPorNombre} descartados por nombre
                </span>
              </div>
            )}
          </section>

          {/* 05 · exportar */}
          <section className={pasoCls}>
            <label className={labelCls}>05 · Exportar</label>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <span className="mb-1 block font-mono text-[10px] text-zinc-600">
                  Radio geocerca (m)
                </span>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  value={radioGeocerca}
                  onChange={(e) => setRadioGeocerca(Number(e.target.value) || 10)}
                  className={inputCls}
                />
              </div>
              <div>
                <span className="mb-1 block font-mono text-[10px] text-zinc-600">
                  Vértices
                </span>
                <input
                  type="number"
                  min={4}
                  max={64}
                  value={vertices}
                  onChange={(e) => setVertices(Number(e.target.value) || 4)}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => exportarCsv(pois)}
                disabled={pois.length === 0}
                className="rounded-md border border-linea bg-panel2 px-3 py-2 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:border-cian hover:text-cian disabled:opacity-30"
              >
                ↓ CSV de POIs <span className="text-zinc-600">seeker_pois.csv</span>
              </button>
              <button
                onClick={() => exportarGeoJsonPuntos(pois)}
                disabled={pois.length === 0}
                className="rounded-md border border-linea bg-panel2 px-3 py-2 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:border-cian hover:text-cian disabled:opacity-30"
              >
                ↓ GeoJSON puntos{" "}
                <span className="text-zinc-600">seeker_pois_puntos.geojson</span>
              </button>
              <button
                onClick={() => exportarGeoJsonGeocercas(pois, radioGeocerca, vertices)}
                disabled={pois.length === 0}
                className="rounded-md border border-linea bg-panel2 px-3 py-2 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:border-magenta hover:text-magenta disabled:opacity-30"
              >
                ↓ GeoJSON geocercas por POI{" "}
                <span className="text-zinc-600">seeker_geocercas_pois.geojson</span>
              </button>
              <button
                onClick={() =>
                  exportarGeoJsonRadiosOrigen(centrosActivos, radio, vertices)
                }
                disabled={centrosActivos.length === 0}
                className="rounded-md border border-linea bg-panel2 px-3 py-2 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:border-violeta hover:text-violeta disabled:opacity-30"
              >
                ↓ GeoJSON radios de origen{" "}
                <span className="text-zinc-600">seeker_radios_origen.geojson</span>
              </button>
            </div>
          </section>

          <footer className="px-5 py-4 font-mono text-[10px] text-zinc-700">
            Gravity · Link Studio — geocercas listas para Simpli.fi, Eskimi y
            DV360.
          </footer>
        </aside>

        {/* ---------- mapa + tabla ---------- */}
        <main className="relative min-w-0 flex-1">
          <MapView
            mode={mode}
            origenes={origenes}
            zona={zona}
            radio={radio}
            pois={pois}
            foco={foco}
          />
          <ResultsTable
            pois={pois}
            origenes={centrosActivos}
            colapsada={tablaColapsada}
            onToggle={() => setTablaColapsada(!tablaColapsada)}
            onSeleccionar={(p) => setFoco(p)}
            seleccionado={foco}
          />
        </main>
      </div>
    </div>
  );
}
