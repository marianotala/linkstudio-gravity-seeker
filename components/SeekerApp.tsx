"use client";

// Página principal de Seeker: header con estatus animado, panel lateral
// de 360px con los pasos, mapa y tabla de resultados. Toda la key de
// Google vive en el servidor; aquí solo se llama a /api/*.

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import AppHeader, { type StatusTipo } from "./AppHeader";
import ResultsTable from "./ResultsTable";
import UniversosPanel from "./UniversosPanel";
import OverlayProgreso, { type ProcesoLargo } from "./OverlayProgreso";
import CategoriaSelect from "./CategoriaSelect";
import { CATEGORIAS, getCategoria, SOLO_NOMBRE } from "@/lib/categories";
import {
  ciudadDeDireccion,
  consolidarCentros,
  crearBuscadorCercano,
  esMismoEstablecimiento,
  etiquetaOrigen,
  esNombreBasura,
  generarCuadricula,
  haversine,
  normalizarComparable,
} from "@/lib/geo";
import {
  agregarUniversosCrudos,
  agruparGeocercasPorProximidad,
  UMBRAL_UNIVERSOS_LOTES,
  type UniversosCrudo,
} from "@/lib/universos-lotes";
import { createClient } from "@/lib/supabase/client";
import { DIAS_AMARILLO, frescuraCenso } from "@/lib/censos";
import {
  CLAVES_TACTICAS,
  TACTICAS,
  tacticasParaModo,
  type TacticaClave,
} from "@/lib/tacticas";
import {
  descargarPlantillaOrigenes,
  extraerCps,
  parsearArchivo,
  parsearArchivoCps,
  parsearCoordenadas,
  parsearDirecciones,
  type ArchivoParseado,
  type CorreccionesCarga,
} from "@/lib/parse";
import {
  exportarCsv,
  exportarGeoJsonPuntos,
  exportarGeoJsonGeocercas,
  exportarGeoJsonRadiosOrigen,
} from "@/lib/exports";
import type {
  AgebGeo,
  ApiError,
  CapaBusqueda,
  Censo,
  CensoPoi,
  CpPoligono,
  DeltaCenso,
  DenuePoi,
  Fuente,
  GeocercaUniverso,
  GeocodeResponse,
  LatLng,
  Origin,
  PerfilUsuario,
  Poi,
  ResultadoGuardado,
  SearchMode,
  SearchRequest,
  SearchResponse,
  Universos,
  Viewport,
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

const RADIOS_CELDA = [
  { m: 1000, label: "1 km" },
  { m: 1500, label: "1.5 km" },
  { m: 2000, label: "2 km" },
  { m: 2500, label: "2.5 km" },
  { m: 3000, label: "3 km" },
];

const ALCANCES = [
  { m: 5000, label: "5 km" },
  { m: 10000, label: "10 km" },
  { m: 15000, label: "15 km" },
  { m: 20000, label: "20 km" },
  { m: 30000, label: "30 km" },
];

const THROTTLE_CENSO_MS = 250;

/** Radio de celda al dividir un censo territorial (tope DENUE: 5 km). */
const TER_RADIO_CELDA = 4000;

const RADIOS_TERRITORIAL = [
  { m: 1000, label: "1 km" },
  { m: 2000, label: "2 km" },
  { m: 3000, label: "3 km" },
  { m: 5000, label: "5 km" },
  { m: 10000, label: "10 km" },
  { m: 20000, label: "20 km" },
];

const NARANJA = "#ff8c42";

/**
 * ¿El error de una celda debe abortar todo el censo? Solo cuota, auth
 * o configuración: una celda que falla por timeout/red se salta y el
 * censo continúa (hasta 5 fallas seguidas).
 */
function esErrorFatalDeCenso(mensaje: string): boolean {
  return /no autorizado|límite diario|token|DENUE_TOKEN|GOOGLE_MAPS_KEY|key de google|cuota/i.test(
    mensaje
  );
}

const MAX_FALLOS_SEGUIDOS = 5;

// Tope de celdas de búsqueda de POIs por censo en el modo por CP.
// Dibujar polígonos y universos no consume Google (hasta 500 CPs);
// este tope acota las llamadas del censo. Configurable por env.
const MAX_CELDAS_CP =
  Number(process.env.NEXT_PUBLIC_MAX_CELDAS_CP) > 0
    ? Number(process.env.NEXT_PUBLIC_MAX_CELDAS_CP)
    : 200;

// Capas de categoría: varias búsquedas de POIs sobre la MISMA
// geografía (CPs o zonas). El universo demográfico es del territorio,
// no de los POIs, así que se comparte entre capas.
const MAX_CAPAS = 6;
const PALETA_CAPAS = [
  "#f4368a", // magenta
  "#2fb9e8", // cian
  "#9d5cf0", // violeta
  "#34d399", // verde
  "#fbbf24", // ámbar
  "#ff8c42", // naranja
];

// Escalamiento del modo por orígenes (listas de hasta 10,000 PDVs):
// procesamiento y búsqueda POR LOTES con confirmación de costo.
const LOTE_GEOCODE = 500;
const LOTE_CENTROS_BUSQUEDA = 150;
/** Tope de consultas a Google por búsqueda (costo). Configurable. */
const MAX_CONSULTAS_BUSQUEDA =
  Number(process.env.NEXT_PUBLIC_MAX_CONSULTAS_BUSQUEDA) > 0
    ? Number(process.env.NEXT_PUBLIC_MAX_CONSULTAS_BUSQUEDA)
    : 5000;
/** Con más orígenes que esto, la búsqueda pide confirmación de costo
 * y corre por lotes (y los universos van por lotes espaciales). */
const UMBRAL_ORIGENES_GRANDES = 50;
/** Con más orígenes que esto, la búsqueda no se guarda en historial
 * (los parámetros serían megas de coordenadas). */
const MAX_ORIGENES_HISTORIAL = 500;

/** ¿El término del filtro es de modo exacto ("comillas")? */
function esTerminoExacto(t: string): boolean {
  return /^".*"$/.test(t);
}

/** Divide un texto en términos de filtro (comas), sin duplicados.
 * Los términos con "comillas" (modo exacto) conservan sus comillas y
 * no chocan con su versión sin comillas (son modos distintos). */
function dividirTerminos(texto: string, existentes: string[] = []): string[] {
  const clave = (t: string) =>
    (esTerminoExacto(t) ? '"' : "") + normalizarComparable(t);
  const vistos = new Set(existentes.map(clave));
  const salida: string[] = [];
  for (const t of texto.split(",").map((v) => v.trim()).filter(Boolean)) {
    const k = clave(t);
    if (k === '"' || k === "" || vistos.has(k)) continue;
    vistos.add(k);
    salida.push(t);
  }
  return salida;
}

/** Deduplica orígenes por coordenada repetida (6 decimales ≈ 11 cm). */
function dedupeOrigenes(lista: Origin[]): {
  unicos: Origin[];
  duplicados: number;
} {
  const vistos = new Set<string>();
  const unicos: Origin[] = [];
  for (const o of lista) {
    const llave = `${o.lat.toFixed(6)}:${o.lng.toFixed(6)}`;
    if (vistos.has(llave)) continue;
    vistos.add(llave);
    unicos.push(o);
  }
  return { unicos, duplicados: lista.length - unicos.length };
}

/** Nombres duplicados ("Sucursal Centro" dos veces): se conservan pero
 * se desambiguan con la ciudad de su dirección, o con un contador. */
function desambiguarNombres(lista: Origin[]): Origin[] {
  const conteo = new Map<string, number>();
  for (const o of lista) {
    if (o.nombre) conteo.set(o.nombre, (conteo.get(o.nombre) ?? 0) + 1);
  }
  const usados = new Set<string>();
  const corridos = new Map<string, number>();
  return lista.map((o) => {
    if (!o.nombre || (conteo.get(o.nombre) ?? 0) <= 1) return o;
    const ciudad = o.direccion ? ciudadDeDireccion(o.direccion) : "";
    let etiqueta = ciudad ? `${o.nombre} · ${ciudad}` : o.nombre;
    if (!ciudad || usados.has(etiqueta)) {
      const n = (corridos.get(o.nombre) ?? 0) + 1;
      corridos.set(o.nombre, n);
      etiqueta = `${ciudad ? etiqueta : o.nombre} · ${n}`;
    }
    usados.add(etiqueta);
    return { ...o, nombre: etiqueta };
  });
}

/** Celda de cobertura del modo por CP, ligada al CP que la generó. */
interface CeldaCp {
  lat: number;
  lng: number;
  radio_m: number;
  cpIdx: number;
}

function denuePoiAPoi(d: DenuePoi, centro: LatLng): Poi {
  return {
    placeId: d.placeId,
    nombre: d.nombre,
    direccion: d.direccion,
    lat: d.lat,
    lng: d.lng,
    types: [],
    distancia: Math.round(haversine(centro, d)),
    origenIdx: 0,
    fuente: "denue",
    estrato: d.estrato || null,
    razonSocial: d.razonSocial || null,
    actividad: d.actividad || null,
  };
}

/** Celdas que cubren el viewport de una ciudad completa. */
function celdasParaViewport(vp: Viewport, radioCeldaM: number): LatLng[] {
  const centro = {
    lat: (vp.north + vp.south) / 2,
    lng: (vp.east + vp.west) / 2,
  };
  const alcance = Math.max(
    haversine(centro, { lat: vp.north, lng: vp.east }),
    haversine(centro, { lat: vp.south, lng: vp.west })
  );
  // margen en grados para no tirar celdas que tocan la orilla del rect
  const mLat = radioCeldaM / 111320;
  const mLng = radioCeldaM / (111320 * Math.cos((centro.lat * Math.PI) / 180));
  return generarCuadricula(centro, alcance, radioCeldaM, "hex").filter(
    (c) =>
      c.lat <= vp.north + mLat &&
      c.lat >= vp.south - mLat &&
      c.lng <= vp.east + mLng &&
      c.lng >= vp.west - mLng
  );
}

/**
 * Mezcla Google + DENUE con la regla obligatoria de dedupe cruzado:
 * mismo establecimiento si distan <75 m y sus nombres normalizados
 * (sin sufijos legales) son similares. Prevalece Google, marcado
 * fuente "ambas" y conservando el estrato de DENUE.
 */
function mezclarFuentes(google: Poi[], denue: Poi[]): Poi[] {
  const resultado = google.map((g) => ({ ...g }));
  const soloDenue: Poi[] = [];
  for (const d of denue) {
    const match = resultado.find(
      (g) =>
        g.fuente !== "denue" &&
        esMismoEstablecimiento(
          { lat: g.lat, lng: g.lng, nombre: g.nombre },
          { lat: d.lat, lng: d.lng, nombre: d.nombre }
        )
    );
    if (match) {
      match.fuente = "ambas";
      match.estrato = match.estrato ?? d.estrato;
      match.actividad = match.actividad ?? d.actividad;
      match.razonSocial = match.razonSocial ?? d.razonSocial;
    } else {
      soloDenue.push(d);
    }
  }
  return [...resultado, ...soloDenue];
}

function fmtM(m: number): string {
  return m >= 1000 ? `${m / 1000} km` : `${m} m`;
}

/** Segmento de la barra de resumen: etiqueta mono arriba, valor abajo. */
function Segmento({
  etiqueta,
  valor,
  color,
}: {
  etiqueta: string;
  valor: string;
  color?: string;
}) {
  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-0.5 border-r border-linea px-4 py-0.5 last:border-r-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-500">
        {etiqueta}
      </span>
      <span
        className={`max-w-[300px] truncate text-sm font-semibold ${color ?? "text-white"}`}
      >
        {valor}
      </span>
    </div>
  );
}

/** Tarjeta KPI con glow de color y número grande. Con onClick se vuelve
 * interactiva (p. ej. ver la lista de excluidos/descartados). */
function Kpi({
  titulo,
  valor,
  caption,
  glow,
  colorValor,
  onClick,
  activo,
}: {
  titulo: string;
  valor: string;
  caption: string;
  glow: string;
  colorValor: string;
  onClick?: () => void;
  activo?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`tarjeta ${glow} px-5 py-4 text-left ${
        onClick
          ? `transition-colors ${activo ? "!border-zinc-500" : "hover:!border-zinc-600"}`
          : ""
      }`}
    >
      <p className="flex items-center justify-between text-xs text-zinc-400">
        {titulo}
        {onClick && (
          <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">
            {activo ? "ocultar" : "ver lista"}
          </span>
        )}
      </p>
      <p
        className={`mt-1.5 font-display text-3xl font-extrabold leading-none tracking-tight ${colorValor}`}
      >
        {valor}
      </p>
      <p className="mt-2 truncate font-mono text-[10px] text-zinc-500">{caption}</p>
    </Tag>
  );
}

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
  /** Zonas del modo zona (multi-zona, cada una con sus límites reales). */
  const [zonas, setZonas] = useState<Origin[]>([]);
  /** Centro de la ciudad del censo de marca. */
  const [zona, setZona] = useState<Origin | null>(null);
  const [radio, setRadio] = useState(1000);
  const [categoria, setCategoria] = useState(CATEGORIAS[0].key);
  /** Filtro de nombre MÚLTIPLE (chips): OR entre términos, filtro
   * estricto dentro de cada término. */
  const [nameFilters, setNameFilters] = useState<string[]>([]);
  const [nameFilterInput, setNameFilterInput] = useState("");
  /** Con 2+ términos: cada término como capa propia (default) o todos
   * los resultados juntos en una sola capa. */
  const [separarEnCapas, setSepararEnCapas] = useState(true);
  const [excludes, setExcludes] = useState<string[]>([]);
  const [excludeInput, setExcludeInput] = useState("");

  // ---- overlay de progreso sobre el mapa (procesos largos)
  const [proceso, setProceso] = useState<ProcesoLargo | null>(null);

  // ---- escalamiento del modo por orígenes
  const detenerOrigenesRef = useRef(false);
  /** Reanudación de geocodificación interrumpida (misma entrada). */
  const geocodePendienteRef = useRef<{
    firma: string;
    cola: { direccion: string; nombre?: string }[];
    listos: Origin[];
    fallidas: number;
  } | null>(null);
  /** Reanudación de la búsqueda de POIs por lotes. */
  const busquedaGrandeRef = useRef<{
    firma: string;
    indice: number;
    acumulados: Map<string, Poi>;
    excluidos: number;
    descartados: number;
    detExc: Set<string>;
    detDesc: Set<string>;
  } | null>(null);
  /** Confirmación de costo para búsquedas con muchos orígenes. */
  const [planOrigenes, setPlanOrigenes] = useState<{
    centros: Origin[];
    consultas: number;
  } | null>(null);

  // ---- estado de resultados
  const [pois, setPois] = useState<Poi[]>([]);
  const [contadores, setContadores] = useState({
    excluidos: 0,
    descartadosPorNombre: 0,
  });
  // nombres de los eliminados, para inspección desde los KPIs
  const [detalles, setDetalles] = useState<{
    excluidos: string[];
    descartados: string[];
  }>({ excluidos: [], descartados: [] });
  const [verLista, setVerLista] = useState<"excluidos" | "descartados" | null>(
    null
  );
  const [status, setStatus] = useState<{ tipo: StatusTipo; texto: string }>({
    tipo: "idle",
    texto: "Listo para buscar",
  });
  const [ocupado, setOcupado] = useState(false);
  const [tablaColapsada, setTablaColapsada] = useState(false);
  const [foco, setFoco] = useState<Poi | null>(null);

  // ---- estado del censo de marca
  const [marca, setMarca] = useState("");
  const [ciudadQuery, setCiudadQuery] = useState("");
  const [tipoCuadricula, setTipoCuadricula] = useState<"hex" | "square">("hex");
  const [radioCelda, setRadioCelda] = useState(2000);
  const [alcance, setAlcance] = useState(10000);
  const [celdas, setCeldas] = useState<LatLng[] | null>(null);
  const [progresoCenso, setProgresoCenso] = useState<{
    actual: number;
    total: number;
    pois: number;
  } | null>(null);
  const detenerCensoRef = useRef(false);

  // ---- estado del censo territorial (DENUE/INEGI)
  const [terCategoria, setTerCategoria] = useState("abarrotes");
  const [terLugarQuery, setTerLugarQuery] = useState("");
  const [terAlcanceTipo, setTerAlcanceTipo] = useState<"radio" | "ciudad">("radio");
  const [terRadio, setTerRadio] = useState(3000);
  const [terFuente, setTerFuente] = useState<Fuente>("denue");
  const [terCentro, setTerCentro] = useState<Origin | null>(null);

  // ---- biblioteca de censos: reutilización y delta
  const [censoSugerido, setCensoSugerido] = useState<Censo | null>(null);
  const [avisoDescartado, setAvisoDescartado] = useState(false);
  const [actualizarDe, setActualizarDe] = useState<{
    censusId: string;
    placeKeys: string[];
  } | null>(null);
  const [deltaInfo, setDeltaInfo] = useState<DeltaCenso | null>(null);
  const [fechaCensoUsado, setFechaCensoUsado] = useState<string | null>(null);

  // ---- filtro por estrato (DENUE)
  const [estratoFiltro, setEstratoFiltro] = useState("");

  // ---- modo por código postal: polígonos reales de cp_poligonos
  const [cpsInput, setCpsInput] = useState("");
  const [cpsGeo, setCpsGeo] = useState<CpPoligono[]>([]);
  const [cpsNoEncontrados, setCpsNoEncontrados] = useState<
    { cp: string; sugerencia: string }[]
  >([]);
  const [nombreArchivoCps, setNombreArchivoCps] = useState("");
  const cpFileRef = useRef<HTMLInputElement>(null);
  /** Cobertura calculada (paso de confirmación antes de gastar Google). */
  const [coberturaCp, setCoberturaCp] = useState<{
    celdas: CeldaCp[];
    factor: number;
  } | null>(null);
  /** Etiquetas fijas de CP sobre los polígonos (apagadas por default). */
  const [etiquetasCp, setEtiquetasCp] = useState(false);

  // ---- capas de categoría (multi-búsqueda sobre la misma geografía)
  const [capas, setCapas] = useState<CapaBusqueda[]>([]);
  /** true = la PRÓXIMA búsqueda se agrega como capa en vez de reemplazar.
   * El ref es la fuente de verdad para los flujos async; el estado
   * espejo maneja la UI (banner, resaltado del paso "Qué buscar"). */
  const agregarCapaRef = useRef(false);
  const [agregandoCapa, setAgregandoCapa] = useState(false);
  const seccionBuscarRef = useRef<HTMLElement>(null);

  function iniciarAgregarCapa() {
    agregarCapaRef.current = true;
    setAgregandoCapa(true);
    setNameFilters([]);
    setNameFilterInput("");
    seccionBuscarRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    reportar(
      "ok",
      "La geografía se mantiene: elige la nueva categoría o término y presiona Buscar"
    );
  }

  function cancelarAgregarCapa() {
    agregarCapaRef.current = false;
    setAgregandoCapa(false);
    reportar("idle", "Listo para buscar");
  }

  // ---- universos demográficos y capa AGEB
  const [universos, setUniversos] = useState<Universos | null>(null);
  const [capaDemografica, setCapaDemografica] = useState(false);
  const [agebsGeo, setAgebsGeo] = useState<AgebGeo[] | null>(null);
  const [cargandoCapa, setCargandoCapa] = useState(false);
  /**
   * Área de influencia alrededor de cada POI censado para el universo
   * demográfico (censos de marca/territoriales). NO es el radio de
   * exportación de geocercas (radioGeocerca): aquel es la geocerca
   * chica para DSPs; este define quién vive "cerca" del punto.
   */
  const [radioInfluencia, setRadioInfluencia] = useState(500);
  /** Geocercas de la última búsqueda, para el choropleth bajo demanda. */
  const geocercasRef = useRef<GeocercaUniverso[] | null>(null);

  // ---- configuración de exports
  const [radioGeocerca, setRadioGeocerca] = useState(50);
  const [vertices, setVertices] = useState(12);
  /** Título del Export plan definido por el vendedor (vacío = default). */
  const [tituloPlan, setTituloPlan] = useState("");
  /** Tácticas del Export plan elegidas por el vendedor. null = todavía
   * no toca el selector → default por modo. Se conserva durante la
   * sesión de análisis activa (re-exportar no la pierde). */
  const [tacticasPlan, setTacticasPlan] = useState<TacticaClave[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const centrosActivos = useMemo<Origin[]>(
    () =>
      mode === "origins"
        ? origenes
        : mode === "zone"
          ? zonas
          : mode === "cp"
            ? cpsGeo.map((c) => ({
                lat: (c.bbox.north + c.bbox.south) / 2,
                lng: (c.bbox.east + c.bbox.west) / 2,
                nombre: `CP ${c.codigo_postal}`,
                viewport: c.bbox,
              }))
            : mode === "territorial"
              ? terCentro
                ? [terCentro]
                : []
              : zona
                ? [zona]
                : [],
    [mode, origenes, zonas, zona, terCentro, cpsGeo]
  );

  // POIs visibles tras el filtro de estrato (afecta mapa, tabla y exports)
  const estratosDisponibles = useMemo(
    () =>
      Array.from(
        new Set(pois.map((p) => p.estrato).filter((e): e is string => !!e))
      ).sort(),
    [pois]
  );
  const poisVisibles = useMemo(
    () => (estratoFiltro ? pois.filter((p) => p.estrato === estratoFiltro) : pois),
    [pois, estratoFiltro]
  );

  // población por CP (de universos.porGeocerca: id = código postal),
  // para el popup de cada polígono en el mapa
  const poblacionPorCp = useMemo<Record<string, number>>(() => {
    if (mode !== "cp" || !universos?.disponible) return {};
    return Object.fromEntries(
      (universos.porGeocerca ?? []).map((g) => [g.id, g.poblacion])
    );
  }, [mode, universos]);

  // ---- capas: derivados y registro
  const hayCapas = capas.length > 0;
  const poisActivos = useMemo(
    () =>
      hayCapas
        ? capas.filter((c) => c.visible).flatMap((c) => c.pois)
        : poisVisibles,
    [hayCapas, capas, poisVisibles]
  );
  const colorPorCapa = useMemo(
    () => Object.fromEntries(capas.map((c) => [c.nombre, c.color])),
    [capas]
  );

  /** Términos del filtro unidos, para etiquetas y compatibilidad. */
  const filtroNombreTexto = nameFilters.join(", ");

  /** Nombre visible de la búsqueda actual (para la capa). */
  function nombreCapaActual(): string {
    return categoria === SOLO_NOMBRE
      ? filtroNombreTexto || "Búsqueda"
      : (CATEGORIAS.find((c) => c.key === categoria)?.label ?? categoria);
  }

  // límite práctico de términos: los mismos 6 de las capas
  const MAX_TERMINOS = MAX_CAPAS;
  function agregarFiltroNombre() {
    const nuevos = dividirTerminos(nameFilterInput, nameFilters);
    if (nuevos.length > 0) {
      setNameFilters([...nameFilters, ...nuevos].slice(0, MAX_TERMINOS));
    }
    setNameFilterInput("");
  }

  /** Registra la búsqueda recién terminada como capa. Sin el flag de
   * "agregar", reemplaza el set completo (comportamiento de siempre);
   * con el flag, se suma (o actualiza la capa del mismo nombre). */
  function registrarCapa(nombre: string, lista: Poi[], excluidos: number, descartados: number) {
    setCapas((prev) => {
      const base = agregarCapaRef.current ? prev.filter((c) => c.nombre !== nombre) : [];
      if (base.length >= MAX_CAPAS) return prev;
      const usados = new Set(base.map((c) => c.color));
      const color =
        PALETA_CAPAS.find((c) => !usados.has(c)) ??
        PALETA_CAPAS[base.length % PALETA_CAPAS.length];
      return [
        ...base,
        {
          id: `${nombre}-${lista.length}-${base.length}`,
          nombre,
          color,
          visible: true,
          excluidos,
          descartadosPorNombre: descartados,
          pois: lista.map((p) => ({ ...p, capa: nombre })),
        },
      ];
    });
    agregarCapaRef.current = false;
    setAgregandoCapa(false);
  }

  /**
   * Filtro múltiple + "separar en capas": convierte los resultados de
   * UNA búsqueda en una capa por término (el servidor etiqueta cada
   * POI con el término que lo capturó). En modo "agregar capa" se
   * suman a las existentes; si no, reemplazan el set.
   */
  function registrarCapasPorTermino(terminos: string[], lista: Poi[]) {
    setCapas((prev) => {
      const base = agregarCapaRef.current
        ? prev.filter((c) => !terminos.includes(c.nombre))
        : [];
      const usados = new Set(base.map((c) => c.color));
      const nuevas = terminos.map((t, i) => {
        const color =
          PALETA_CAPAS.find((c) => !usados.has(c)) ??
          PALETA_CAPAS[(base.length + i) % PALETA_CAPAS.length];
        usados.add(color);
        const propios = lista.filter((p) => p.termino === t);
        return {
          id: `${t}-${propios.length}-${base.length + i}`,
          nombre: t,
          color,
          visible: true,
          excluidos: 0,
          descartadosPorNombre: 0,
          pois: propios.map((p) => ({ ...p, capa: t })),
        };
      });
      return [...base, ...nuevas].slice(0, MAX_CAPAS);
    });
    agregarCapaRef.current = false;
    setAgregandoCapa(false);
  }

  // cambiar de modo cambia la geografía: las capas no sobreviven
  useEffect(() => {
    setCapas([]);
    agregarCapaRef.current = false;
    setAgregandoCapa(false);
    // el default de tácticas depende del modo: al cambiarlo se vuelve
    // al mapeo sugerido
    setTacticasPlan(null);
  }, [mode]);

  function reportar(tipo: StatusTipo, texto: string) {
    setStatus({ tipo, texto });
  }

  // Al cambiar de modo, limpiar el plan de celdas del censo anterior.
  useEffect(() => {
    setCeldas(null);
    setProgresoCenso(null);
  }, [mode]);

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
      setNameFilters(
        p.nameFilters?.length
          ? p.nameFilters
          : dividirTerminos(p.nameFilter ?? "")
      );
      setExcludes(p.excludes ?? []);
      if (p.mode === "origins") {
        setOrigenes(p.centers);
        setTab("coordenadas");
      } else if (p.mode === "zone") {
        setZonas(p.centers);
      } else if (p.mode === "cp") {
        // restaurar los CPs; los polígonos se recargan con "Ver polígonos"
        setCpsInput((p.cps ?? []).join(", "));
      } else {
        // census: restaurar marca, ciudad y configuración de cuadrícula
        setZona(p.centers[0] ?? null);
        setMarca(p.nameFilter ?? "");
        setCiudadQuery(p.censo?.ciudad ?? p.centers[0]?.nombre ?? "");
        if (p.censo) {
          setTipoCuadricula(p.censo.tipo);
          setRadioCelda(p.censo.radioCelda);
          setAlcance(p.censo.alcance);
        }
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
          fuente: "google" as const,
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

  // ---- abrir o actualizar un censo de la biblioteca (?censo=id[&actualizar=1])
  const censoRef = useRef(false);
  useEffect(() => {
    if (censoRef.current) return;
    const censoId = searchParams.get("censo");
    if (!censoId) return;
    const esActualizar = searchParams.get("actualizar") === "1";
    censoRef.current = true;

    (async () => {
      setStatus({ tipo: "busy", texto: "Cargando censo de la biblioteca…" });
      const supabase = createClient();
      const { data: censo, error } = await supabase
        .from("censuses")
        .select("*")
        .eq("id", censoId)
        .single();
      if (error || !censo) {
        setStatus({ tipo: "error", texto: "No encontré ese censo en la biblioteca" });
        return;
      }
      const c = censo as Censo;
      const p = c.params as unknown as {
        centro?: Origin;
        marca?: string;
        ciudad?: string;
        lugar?: string;
        categoria?: string;
        alcanceTipo?: "radio" | "ciudad";
        radio?: number;
        alcance?: number;
        tipoCuadricula?: "hex" | "square";
        radioCelda?: number;
        fuente?: Fuente;
      };

      // Restaurar la configuración según el tipo de censo.
      if (c.tipo === "marca") {
        setMode("census");
        setMarca(c.marca_o_categoria);
        setCiudadQuery(p.ciudad ?? "");
        if (p.centro) setZona(p.centro);
        if (p.tipoCuadricula) setTipoCuadricula(p.tipoCuadricula);
        if (p.radioCelda) setRadioCelda(p.radioCelda);
        if (p.alcance) setAlcance(p.alcance);
      } else {
        setMode("territorial");
        if (p.categoria) setTerCategoria(p.categoria);
        setTerLugarQuery(p.lugar ?? "");
        if (p.centro) setTerCentro(p.centro);
        if (p.alcanceTipo) setTerAlcanceTipo(p.alcanceTipo);
        if (p.radio) setTerRadio(p.radio);
        if (p.fuente) setTerFuente(p.fuente);
      }

      // Cargar los POIs guardados — cero llamadas externas.
      const { data: filas, error: e2 } = await supabase
        .from("census_pois")
        .select("*")
        .eq("census_id", censoId)
        .limit(20000);
      if (e2 || !filas) {
        setStatus({ tipo: "error", texto: "No pude cargar los POIs del censo" });
        return;
      }
      const centro = p.centro ?? null;
      const cargados: Poi[] = (filas as CensoPoi[]).map((r) => {
        const extra = (r.extra ?? {}) as {
          actividad?: string;
          razonSocial?: string;
        };
        return {
          placeId: r.place_key,
          nombre: r.name,
          direccion: r.address ?? "",
          lat: r.lat,
          lng: r.lng,
          types: [],
          distancia: centro ? Math.round(haversine(centro, r)) : 0,
          origenIdx: 0,
          fuente: r.fuente,
          estrato: r.estrato,
          actividad: extra.actividad ?? null,
          razonSocial: extra.razonSocial ?? null,
        };
      });
      cargados.sort((a, b) => a.distancia - b.distancia);

      if (esActualizar) {
        // Preparar el re-corrido: se compara contra esta versión.
        setActualizarDe({
          censusId: c.id,
          placeKeys: (filas as CensoPoi[]).map((r) => r.place_key),
        });
        setStatus({
          tipo: "ok",
          texto: `Censo "${c.marca_o_categoria}" listo para actualizar: ejecuta el censo y te reporto el delta contra la versión del ${new Date(c.created_at).toLocaleDateString("es-MX")}`,
        });
        return;
      }

      setPois(cargados);
      setFechaCensoUsado(c.created_at);
      setUniversos((c.universos as Universos | null) ?? null);
      setTablaColapsada(false);
      setStatus({
        tipo: "ok",
        texto: `Censo "${c.marca_o_categoria}" del ${new Date(c.created_at).toLocaleDateString("es-MX")}: ${cargados.length} POIs cargados sin llamadas externas`,
      });
    })();
  }, [searchParams]);

  // ---- aviso de censo disponible (modo orígenes): si la marca/categoría
  //      coincide con un censo guardado, ofrecer usarlo sin llamadas
  useEffect(() => {
    if (mode !== "origins" || origenes.length === 0) {
      setCensoSugerido(null);
      return;
    }
    // el censo guardado es de UNA marca: solo se sugiere con un término
    const objetivo =
      categoria === SOLO_NOMBRE
        ? nameFilters.length === 1
          ? nameFilters[0]
          : ""
        : (getCategoria(categoria)?.label ?? "");
    if (!objetivo) {
      setCensoSugerido(null);
      return;
    }
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("censuses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      const match = ((data ?? []) as Censo[]).find(
        (c) =>
          normalizarComparable(c.marca_o_categoria) ===
          normalizarComparable(objetivo)
      );
      setCensoSugerido(match ?? null);
      setAvisoDescartado(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [mode, origenes.length, categoria, nameFilters]);

  // ---- usar un censo guardado en lugar de buscar en vivo (cero llamadas)
  async function usarCensoGuardado() {
    if (!censoSugerido) return;
    setOcupado(true);
    setFoco(null);
    reportar("busy", "Filtrando el censo guardado contra tus orígenes…");
    try {
      const supabase = createClient();
      const { data: filas, error } = await supabase
        .from("census_pois")
        .select("*")
        .eq("census_id", censoSugerido.id)
        .limit(20000);
      if (error || !filas) {
        reportar("error", "No pude leer los POIs del censo guardado");
        return;
      }
      const dentro: Poi[] = [];
      for (const r of filas as CensoPoi[]) {
        let mejorDist = Infinity;
        let mejorIdx = 0;
        origenes.forEach((o, i) => {
          const d = haversine(o, r);
          if (d < mejorDist) {
            mejorDist = d;
            mejorIdx = i;
          }
        });
        if (mejorDist <= radio + 50) {
          const extra = (r.extra ?? {}) as { actividad?: string };
          dentro.push({
            placeId: r.place_key,
            nombre: r.name,
            direccion: r.address ?? "",
            lat: r.lat,
            lng: r.lng,
            types: [],
            distancia: Math.round(mejorDist),
            origenIdx: mejorIdx,
            fuente: r.fuente,
            estrato: r.estrato,
            actividad: extra.actividad ?? null,
          });
        }
      }
      dentro.sort((a, b) => a.distancia - b.distancia);
      setPois(dentro);
      setContadores({ excluidos: 0, descartadosPorNombre: 0 });
      setUniversos((censoSugerido.universos as Universos | null) ?? null);
      setFechaCensoUsado(censoSugerido.created_at);
      setTablaColapsada(false);
      reportar(
        "ok",
        `${dentro.length} POIs del censo del ${new Date(censoSugerido.created_at).toLocaleDateString("es-MX")} dentro de tus radios · 0 llamadas externas`
      );
    } finally {
      setOcupado(false);
    }
  }

  // ---- paso 2: procesar orígenes (direcciones / coordenadas / archivo)
  //      Listas grandes (hasta 10,000 PDVs): dedupe por coordenada,
  //      geocodificación POR LOTES con progreso y reanudación.
  function fijarOrigenes(
    lista: Origin[],
    sufijo = "",
    correcciones?: CorreccionesCarga
  ) {
    const { unicos, duplicados } = dedupeOrigenes(lista);
    const conNombre = desambiguarNombres(unicos);
    setOrigenes(conNombre);
    setPlanOrigenes(null);
    busquedaGrandeRef.current = null;
    const notas: string[] = [];
    const corregidos =
      (correcciones?.lngCorregidas ?? 0) + (correcciones?.coordsSeparadas ?? 0);
    if ((correcciones?.lngCorregidas ?? 0) > 0)
      notas.push(
        `${correcciones!.lngCorregidas} longitudes venían positivas; se corrigieron a oeste`
      );
    if ((correcciones?.coordsSeparadas ?? 0) > 0)
      notas.push(`${correcciones!.coordsSeparadas} celdas "lat, lng" separadas`);
    if (duplicados > 0)
      notas.push(
        `${duplicados.toLocaleString("es-MX")} coordenadas repetidas descartadas`
      );
    if ((correcciones?.descartadas ?? 0) > 0)
      notas.push(
        `${correcciones!.descartadas} filas sin nombre, coordenadas ni dirección descartadas`
      );
    reportar(
      "ok",
      `${conNombre.length.toLocaleString("es-MX")} orígenes listos${corregidos > 0 ? ` · ${corregidos} corregidos` : ""}${notas.length ? ` · ${notas.join(" · ")}` : ""}${sufijo}`
    );
  }

  async function procesarOrigenes() {
    setFoco(null);
    try {
      if (tab === "coordenadas") {
        const { origenes: parsed, lngCorregidas } = parsearCoordenadas(textCoords);
        if (parsed.length === 0) {
          reportar("error", "No encontré coordenadas válidas (formato: lat, lng, nombre)");
          return;
        }
        fijarOrigenes(parsed, "", {
          lngCorregidas,
          coordsSeparadas: 0,
          descartadas: 0,
        });
        return;
      }

      let direcciones: { direccion: string; nombre?: string }[] = [];
      let correccionesArchivo: CorreccionesCarga | undefined;
      if (tab === "direcciones") {
        direcciones = parsearDirecciones(textDirecciones);
        if (direcciones.length === 0) {
          reportar("error", "Escribe al menos una dirección (una por línea)");
          return;
        }
      } else {
        if (!archivo) {
          reportar("error", "Primero sube un archivo Excel o CSV");
          return;
        }
        correccionesArchivo = archivo.correcciones;
        // el archivo puede traer AMBAS: filas con coordenadas (listas)
        // y filas solo con dirección (a geocodificar)
        if (archivo.origenes.length > 0 && archivo.direcciones.length === 0) {
          fijarOrigenes(archivo.origenes, " (desde archivo)", correccionesArchivo);
          return;
        }
        direcciones = archivo.direcciones;
        if (archivo.origenes.length === 0 && direcciones.length === 0) {
          reportar("error", archivo.deteccion);
          return;
        }
      }

      // geocodificación por lotes con reanudación: si la entrada es la
      // misma que la interrumpida, continúa donde se quedó
      const firma = `${direcciones.length}:${direcciones[0]?.direccion ?? ""}`;
      const pendiente =
        geocodePendienteRef.current?.firma === firma
          ? geocodePendienteRef.current
          : null;
      const cola = pendiente ? pendiente.cola : direcciones;
      const listos: Origin[] = pendiente ? [...pendiente.listos] : [];
      let fallidas = pendiente ? pendiente.fallidas : 0;
      const totalGlobal = listos.length + fallidas + cola.length;

      setOcupado(true);
      detenerOrigenesRef.current = false;
      let procesadas = 0;
      try {
        for (let i = 0; i < cola.length; i += LOTE_GEOCODE) {
          if (detenerOrigenesRef.current) break;
          const lote = cola.slice(i, i + LOTE_GEOCODE);
          const hechas = listos.length + fallidas;
          setProceso({
            etapa: "Procesando orígenes",
            detalle: `${hechas.toLocaleString("es-MX")} de ${totalGlobal.toLocaleString("es-MX")}`,
            actual: hechas,
            total: totalGlobal,
            onDetener: () => {
              detenerOrigenesRef.current = true;
            },
          });
          reportar(
            "busy",
            `Procesando orígenes: ${hechas.toLocaleString("es-MX")} de ${totalGlobal.toLocaleString("es-MX")}…`
          );
          const { resultados } = await postJson<GeocodeResponse>("/api/geocode", {
            direcciones: lote.map((d) => d.direccion),
          });
          resultados.forEach((r, j) => {
            if (r.ok && r.lat !== undefined && r.lng !== undefined) {
              listos.push({
                lat: r.lat,
                lng: r.lng,
                nombre: lote[j].nombre,
                direccion: r.formatted ?? lote[j].direccion,
              });
            } else {
              fallidas++;
            }
          });
          procesadas = i + lote.length;
        }
      } catch (e) {
        // guarda el avance para reanudar y muestra el error en el overlay
        geocodePendienteRef.current = {
          firma,
          cola: cola.slice(procesadas),
          listos,
          fallidas,
        };
        setProceso({
          etapa: "Procesando orígenes",
          detalle: "",
          actual: 0,
          total: 1,
          error: `${e instanceof Error ? e.message : "Error al geocodificar"} — el avance quedó guardado (${listos.length.toLocaleString("es-MX")} listos).`,
          onReintentar: () => {
            setProceso(null);
            procesarOrigenes();
          },
          onCerrar: () => setProceso(null),
        });
        return;
      }
      setProceso(null);

      const restantes = cola.length - procesadas;
      if (restantes > 0) {
        geocodePendienteRef.current = {
          firma,
          cola: cola.slice(procesadas),
          listos,
          fallidas,
        };
      } else {
        geocodePendienteRef.current = null;
      }

      // filas del archivo que YA traían coordenadas + las geocodificadas
      const previos = tab === "archivo" ? (archivo?.origenes ?? []) : [];
      if (previos.length + listos.length === 0) {
        reportar("error", "Ninguna dirección se pudo geocodificar");
        return;
      }
      const notas = [
        ...(fallidas > 0
          ? [`${fallidas.toLocaleString("es-MX")} direcciones fallaron`]
          : []),
        ...(restantes > 0
          ? [
              `interrumpido: quedan ${restantes.toLocaleString("es-MX")} — presiona Procesar para continuar`,
            ]
          : []),
      ];
      fijarOrigenes(
        [...previos, ...listos],
        notas.length ? ` · ${notas.join(" · ")}` : "",
        correccionesArchivo
      );
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al procesar orígenes");
    } finally {
      setOcupado(false);
      setProceso((p) => (p?.error ? p : null));
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

  // ---- paso 2 (modo zona): agregar una zona (multi-zona, sin radio:
  //      la búsqueda se restringe a los límites reales de cada zona)
  async function agregarZona() {
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
      const nombre = r.formatted ?? query;
      if (zonas.some((z) => z.nombre === nombre)) {
        reportar("error", `"${nombre}" ya está en tus zonas`);
        return;
      }
      const nuevas = [
        ...zonas,
        { lat: r.lat, lng: r.lng, nombre, viewport: r.viewport },
      ];
      setZonas(nuevas);
      setZonaQuery("");
      reportar(
        "ok",
        `${nuevas.length} ${nuevas.length === 1 ? "zona lista" : "zonas listas"} · ${nombre}`
      );
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al ubicar la zona");
    } finally {
      setOcupado(false);
    }
  }

  // ---- paso 2 (modo CP): Excel/CSV de una columna con CPs
  async function onArchivoCps(file: File | undefined) {
    if (!file) return;
    setNombreArchivoCps(file.name);
    try {
      const cps = await parsearArchivoCps(file);
      if (cps.length === 0) {
        reportar("error", "El archivo no trae códigos postales de 5 dígitos");
        return;
      }
      // se suman a los del textarea, sin duplicar
      setCpsInput((prev) => {
        const todos = Array.from(new Set([...extraerCps(prev), ...cps]));
        return todos.join(", ");
      });
      reportar("ok", `${cps.length} CPs detectados en ${file.name}`);
    } catch {
      reportar("error", "No pude leer el archivo. ¿Es un .xlsx o .csv válido?");
    }
  }

  // ---- paso 2 (modo CP): resolver los CPs a sus polígonos reales
  async function cargarCpsPoligonos() {
    const cps = extraerCps(cpsInput);
    if (cps.length === 0) {
      reportar("error", "Escribe al menos un CP de 5 dígitos (p. ej. 11560, 11550)");
      return;
    }
    if (cps.length > 500) {
      reportar("error", "Máximo 500 códigos postales por consulta");
      return;
    }
    setOcupado(true);
    setFoco(null);
    reportar("busy", `Buscando los polígonos de ${cps.length} CPs…`);
    try {
      const data = await postJson<{
        encontrados: CpPoligono[];
        noEncontrados: { cp: string; sugerencia: string }[];
      }>("/api/cps", { cps });
      setCpsGeo(data.encontrados);
      setCpsNoEncontrados(data.noEncontrados);
      setCoberturaCp(null);
      if (data.encontrados.length === 0) {
        reportar(
          "error",
          `Ningún CP está en la base de polígonos: ${data.noEncontrados.map((n) => `${n.cp} — ${n.sugerencia}`).join(" · ")}`
        );
        return;
      }
      reportar(
        "ok",
        `${data.encontrados.length} ${data.encontrados.length === 1 ? "polígono listo" : "polígonos listos"}${data.noEncontrados.length > 0 ? ` · ${data.noEncontrados.length} no encontrados` : ""}`
      );
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al consultar los CPs");
    } finally {
      setOcupado(false);
    }
  }

  function quitarCp(cp: string) {
    const quedan = cpsGeo.filter((c) => c.codigo_postal !== cp);
    setCpsGeo(quedan);
    setCpsInput(quedan.map((c) => c.codigo_postal).join(", "));
    setCoberturaCp(null);
  }

  // ---- búsqueda por CP: cobertura por celdas (mismo mecanismo que el
  //      censo de marca). searchText con bias circular trae ~60 POIs
  //      por punto: un solo centro por CP deja fuera resultados, así
  //      que se cubre TODO el bbox con malla hexagonal, se descartan
  //      las celdas que no tocan el polígono real (PostGIS, sin gastar
  //      llamadas), se pagina por celda, se deduplica por place_id y
  //      el filtro espacial final recorta al polígono.
  //
  //      Límites por costo real: dibujar polígonos y calcular
  //      universos NO consume Google (hasta 500 CPs); el tope
  //      operativo son las CELDAS del censo de POIs (MAX_CELDAS_CP).
  //      Antes de ejecutar se muestra cuántas celdas usará y se pide
  //      confirmación; si excede el tope hay opciones: solo universos,
  //      celdas más grandes, o censar por partes.

  /** Malla hexagonal que cubre el bbox de un CP. Radio de celda
   * adaptado a su tamaño (CP urbano: 500-800 m; grandes: hasta 2 km),
   * multiplicado por `factor` para bajar la granularidad a voluntad. */
  function celdasParaCp(c: CpPoligono, cpIdx: number, factor: number): CeldaCp[] {
    const lat = (c.bbox.north + c.bbox.south) / 2;
    const lng = (c.bbox.east + c.bbox.west) / 2;
    const anchoM = haversine({ lat, lng: c.bbox.west }, { lat, lng: c.bbox.east });
    const altoM = haversine({ lat: c.bbox.south, lng }, { lat: c.bbox.north, lng });
    const maxDim = Math.max(anchoM, altoM, 1);
    const base = Math.min(2000, Math.max(500, Math.round(maxDim / 5 / 100) * 100));
    const radio = Math.min(5000, base * factor);
    const alcance = Math.hypot(anchoM, altoM) / 2 + radio;
    return generarCuadricula({ lat, lng }, alcance, radio, "hex").map((p) => ({
      lat: p.lat,
      lng: p.lng,
      radio_m: radio,
      cpIdx,
    }));
  }

  /** Dedupe de celdas entre CPs vecinos con hash espacial (~O(n)). */
  function dedupeCeldas(candidatas: CeldaCp[]): CeldaCp[] {
    const TAM = 0.01; // ~1.1 km por cubeta
    const cubetas = new Map<string, CeldaCp[]>();
    const salida: CeldaCp[] = [];
    for (const celda of candidatas) {
      const ci = Math.round(celda.lat / TAM);
      const cj = Math.round(celda.lng / TAM);
      let encimada = false;
      for (let di = -2; di <= 2 && !encimada; di++) {
        for (let dj = -2; dj <= 2 && !encimada; dj++) {
          for (const k of cubetas.get(`${ci + di},${cj + dj}`) ?? []) {
            if (haversine(k, celda) < Math.min(k.radio_m, celda.radio_m) * 0.8) {
              encimada = true;
              break;
            }
          }
        }
      }
      if (encimada) continue;
      salida.push(celda);
      const llave = `${ci},${cj}`;
      cubetas.set(llave, [...(cubetas.get(llave) ?? []), celda]);
    }
    return salida;
  }

  // Paso 1: calcular la cobertura y pedir confirmación ("esta búsqueda
  // usará ~N celdas, ¿continuar?").
  async function calcularCoberturaCp(factor: number = 1) {
    if (cpsGeo.length === 0) {
      reportar("error", "Primero carga tus códigos postales y sus polígonos (paso 02)");
      return;
    }
    if (categoria === SOLO_NOMBRE && nameFilters.length === 0) {
      reportar("error", 'Para buscar "solo por nombre" agrega al menos un término al filtro');
      return;
    }
    setOcupado(true);
    setFoco(null);
    setCoberturaCp(null);
    try {
      // malla candidata sobre el bbox de cada CP, deduplicada
      const candidatas = dedupeCeldas(
        cpsGeo.flatMap((c, i) => celdasParaCp(c, i, factor))
      );
      reportar("busy", `Calculando cobertura: ${candidatas.length} celdas candidatas…`);

      // descartar (en lotes) las celdas que NO tocan el polígono real
      const cpsCodigos = cpsGeo.map((c) => c.codigo_postal);
      const celdas: CeldaCp[] = [];
      const LOTE_CELDAS = 2000;
      for (let i = 0; i < candidatas.length; i += LOTE_CELDAS) {
        const lote = candidatas.slice(i, i + LOTE_CELDAS);
        const { indices } = await postJson<{ indices: number[] }>("/api/cps", {
          cps: cpsCodigos,
          celdas: lote.map(({ lat, lng, radio_m }) => ({ lat, lng, radio_m })),
        });
        celdas.push(...indices.map((j) => lote[j]));
      }
      if (celdas.length === 0) {
        reportar("error", "Ninguna celda toca los polígonos de tus CPs");
        return;
      }
      setCoberturaCp({ celdas, factor });
      reportar(
        celdas.length <= MAX_CELDAS_CP ? "ok" : "error",
        celdas.length <= MAX_CELDAS_CP
          ? `Esta búsqueda usará ~${celdas.length} celdas de Google${
              categoria === SOLO_NOMBRE && nameFilters.length > 1
                ? ` × ${nameFilters.length} términos = ${celdas.length * nameFilters.length} llamadas`
                : ""
            } (tope ${MAX_CELDAS_CP} celdas). Confirma para ejecutar.`
          : `La cobertura necesita ~${celdas.length} celdas y el tope es ${MAX_CELDAS_CP} por censo: elige una opción abajo.`
      );
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al calcular la cobertura");
    } finally {
      setOcupado(false);
    }
  }

  /** Cuántos CPs (prefijo de la lista) caben dentro del tope de celdas. */
  function prefijoCpsQueCabe(): { cps: number; celdas: number } {
    if (!coberturaCp) return { cps: 0, celdas: 0 };
    let acum = 0;
    let k = 0;
    for (let i = 0; i < cpsGeo.length; i++) {
      const deEste = coberturaCp.celdas.filter((c) => c.cpIdx === i).length;
      if (acum + deEste > MAX_CELDAS_CP) break;
      acum += deEste;
      k = i + 1;
    }
    return { cps: k, celdas: acum };
  }

  // Opción "solo universos": población/NSE/edades sobre TODOS los
  // polígonos, sin gastar una sola llamada a Google.
  async function soloUniversosCp() {
    if (cpsGeo.length === 0) return;
    setOcupado(true);
    reportar("busy", `Calculando universos de ${cpsGeo.length} CPs…`);
    try {
      const cpsCodigos = cpsGeo.map((c) => c.codigo_postal);
      const { universos: u } = await postJson<{ universos: Universos }>(
        "/api/universos",
        { geocercas: cpsCodigos.map((cp) => ({ id: cp, cp })) }
      );
      const mostrados = cpsCodigos.slice(0, 8).join(", ");
      setUniversos(
        u?.disponible
          ? {
              ...u,
              criterio: `población dentro de los CPs ${mostrados}${cpsCodigos.length > 8 ? ` y ${cpsCodigos.length - 8} más` : ""}`,
            }
          : u
      );
      setAgebsGeo(null);
      setCapaDemografica(false);
      geocercasRef.current = cpsCodigos.map((cp) => ({ id: cp, cp }));
      setCoberturaCp(null);
      reportar(
        u?.disponible ? "ok" : "error",
        u?.disponible
          ? `Universos listos para ${cpsCodigos.length} CPs (sin censo de POIs)`
          : (u?.mensaje ?? "Universos no disponibles para esos CPs")
      );
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al calcular universos");
    } finally {
      setOcupado(false);
    }
  }

  // Paso 2: ejecutar el censo de POIs sobre la cobertura confirmada.
  // `soloPrimerosCps` limita a los primeros k CPs de la lista (opción
  // "por partes" cuando la cobertura completa excede el tope).
  async function ejecutarCensoCp(soloPrimerosCps?: number) {
    if (!coberturaCp) return;
    const k = soloPrimerosCps ?? cpsGeo.length;
    const celdasCp = coberturaCp.celdas.filter((c) => c.cpIdx < k);
    const cpsCensados = cpsGeo.slice(0, k);
    const cpsCodigos = cpsCensados.map((c) => c.codigo_postal);
    if (celdasCp.length === 0 || celdasCp.length > MAX_CELDAS_CP) return;

    setOcupado(true);
    setFoco(null);
    detenerCensoRef.current = false;
    setPois([]);
    setProgresoCenso(null);

    try {
      // 1) buscar celda por celda (paginado a 60 por celda en el
      //    servidor), con el mismo loop resiliente del censo
      const acumulados = new Map<string, Poi>();
      const detExcluidos = new Set<string>();
      const detDescartados = new Set<string>();
      let excluidosTotal = 0;
      let descartadosTotal = 0;
      let errorFatal: string | null = null;
      let celdasFallidas = 0;
      let fallosSeguidos = 0;

      // Filtro múltiple: con "separar en capas" y "solo por nombre" se
      // corre UNA PASADA POR TÉRMINO sobre la misma malla (Google no
      // soporta OR en una query), con progreso por término. En los
      // demás casos, una sola pasada: el servidor aplica el OR (y hace
      // sus propias subconsultas por término cuando es solo-nombre).
      const pasadas =
        categoria === SOLO_NOMBRE && separarEnCapas && nameFilters.length >= 2
          ? nameFilters.map((t) => ({ etiqueta: `buscando ${t}`, filtros: [t] }))
          : [{ etiqueta: "CP", filtros: nameFilters }];
      const totalPasos = celdasCp.length * pasadas.length;

      bucle: for (let pi = 0; pi < pasadas.length; pi++) {
        const pasada = pasadas[pi];
        for (let i = 0; i < celdasCp.length; i++) {
          if (detenerCensoRef.current) break bucle;
          try {
            const data = await postJson<SearchResponse>("/api/search", {
              mode: "census",
              centers: [{ lat: celdasCp[i].lat, lng: celdasCp[i].lng }],
              radius: celdasCp[i].radio_m,
              category: categoria,
              nameFilter: pasada.filtros.join(", "),
              nameFilters: pasada.filtros,
              excludes,
              persist: false,
            } satisfies SearchRequest);
            fallosSeguidos = 0;
            excluidosTotal += data.excluidos;
            descartadosTotal += data.descartadosPorNombre;
            (data.detalleExcluidos ?? []).forEach((n) => {
              if (detExcluidos.size < 300) detExcluidos.add(n);
            });
            (data.detalleDescartados ?? []).forEach((n) => {
              if (detDescartados.size < 300) detDescartados.add(n);
            });
            for (const p of data.pois) {
              if (!acumulados.has(p.placeId)) acumulados.set(p.placeId, p);
            }
          } catch (e) {
            const mensaje = e instanceof Error ? e.message : "Error en la celda";
            if (esErrorFatalDeCenso(mensaje)) {
              errorFatal = mensaje;
              break bucle;
            }
            celdasFallidas++;
            fallosSeguidos++;
            if (fallosSeguidos >= MAX_FALLOS_SEGUIDOS) {
              errorFatal = `${MAX_FALLOS_SEGUIDOS} celdas seguidas fallaron (${mensaje})`;
              break bucle;
            }
          }
          setProgresoCenso({
            actual: pi * celdasCp.length + i + 1,
            total: totalPasos,
            pois: acumulados.size,
          });
          setProceso({
            etapa: "Buscando POIs",
            detalle: `${pasada.etiqueta}: celda ${i + 1} de ${celdasCp.length} · ${acumulados.size.toLocaleString("es-MX")} POIs`,
            actual: pi * celdasCp.length + i + 1,
            total: totalPasos,
            onDetener: () => {
              detenerCensoRef.current = true;
            },
          });
          reportar(
            "busy",
            `${pasada.etiqueta}: celda ${i + 1} de ${celdasCp.length} · ${acumulados.size} POIs acumulados`
          );
          if (pi * celdasCp.length + i + 1 < totalPasos) {
            await new Promise((r) => setTimeout(r, THROTTLE_CENSO_MS));
          }
        }
      }
      if (errorFatal) {
        const mensajeFatal = errorFatal;
        setProceso({
          etapa: "Buscando POIs",
          detalle: "",
          actual: 0,
          total: 1,
          error: mensajeFatal,
          onCerrar: () => setProceso(null),
        });
        reportar("error", mensajeFatal);
        return;
      }
      setProceso(null);

      // 2) filtro espacial final: solo lo que cae DENTRO del polígono
      //    real, etiquetado con su CP
      const candidatos = Array.from(acumulados.values());
      let lista: Poi[] = [];
      if (candidatos.length > 0) {
        reportar("busy", "Recortando al polígono real de los CPs…");
        const { dentro } = await postJson<{ dentro: { id: string; cp: string }[] }>(
          "/api/cps",
          {
            cps: cpsCodigos,
            puntos: candidatos
              .slice(0, 5000)
              .map((p) => ({ id: p.placeId, lat: p.lat, lng: p.lng })),
          }
        );
        const cpPorId = new Map(dentro.map((d) => [d.id, d.cp]));
        lista = candidatos
          .filter((p) => cpPorId.has(p.placeId))
          .map((p) => {
            const cp = cpPorId.get(p.placeId)!;
            const idx = Math.max(
              0,
              cpsGeo.findIndex((c) => c.codigo_postal === cp)
            );
            return {
              ...p,
              cp,
              origenIdx: idx,
              distancia: Math.round(haversine(centrosActivos[idx], p)),
            };
          })
          .sort((a, b) => a.distancia - b.distancia);
      }

      setPois(lista);
      // al AGREGAR capa el universo del territorio no cambia: se reusa
      const reutilizarUniversos =
        agregarCapaRef.current && (universos?.disponible ?? false);
      if (separarEnCapas && nameFilters.length >= 2) {
        // filtro múltiple: una capa por término (marca) con su color
        registrarCapasPorTermino(nameFilters, lista);
      } else {
        registrarCapa(nombreCapaActual(), lista, excluidosTotal, descartadosTotal);
      }
      setContadores({
        excluidos: excluidosTotal,
        descartadosPorNombre: descartadosTotal,
      });
      setDetalles({
        excluidos: Array.from(detExcluidos),
        descartados: Array.from(detDescartados),
      });
      setVerLista(null);
      setTablaColapsada(false);

      // 3) universos sobre la geometría real de los CPs censados
      //    (si se está agregando capa, el territorio es el mismo: se
      //    reusa el universo en pantalla sin recalcular)
      let universosCp: Universos | null = reutilizarUniversos ? universos : null;
      if (lista.length > 0 && !reutilizarUniversos) {
        try {
          const { universos: u } = await postJson<{ universos: Universos }>(
            "/api/universos",
            { geocercas: cpsCodigos.map((cp) => ({ id: cp, cp })) }
          );
          const mostrados = cpsCodigos.slice(0, 8).join(", ");
          universosCp = u?.disponible
            ? {
                ...u,
                criterio: `población dentro de los CPs ${mostrados}${cpsCodigos.length > 8 ? ` y ${cpsCodigos.length - 8} más` : ""}`,
              }
            : u;
        } catch (e) {
          console.error("No se pudieron calcular universos de los CPs:", e);
        }
      }
      if (!reutilizarUniversos) {
        setUniversos(universosCp);
        setAgebsGeo(null);
        setCapaDemografica(false);
        geocercasRef.current = cpsCodigos.map((cp) => ({ id: cp, cp }));
      }

      // 4) guardar en el historial como UNA búsqueda
      if (lista.length > 0) {
        try {
          await postJson<{ searchId: string }>("/api/searches", {
            mode: "cp",
            params: {
              mode: "cp",
              cps: cpsCodigos,
              category: categoria,
              nameFilter: filtroNombreTexto,
              nameFilters,
              excludes,
              radius: 0,
              centers: [],
            },
            universos: universosCp,
            results: lista.map((p) => ({
              name: p.nombre,
              category: etiquetaCategoria,
              lat: p.lat,
              lng: p.lng,
              address: p.direccion,
              origin_name: `CP ${p.cp}`,
              distance_m: p.distancia,
              place_id: p.placeId,
            })),
          });
        } catch (e) {
          console.error("No se pudo guardar la búsqueda por CP:", e);
        }
      }

      const restantes = cpsGeo.length - k;
      const extras: string[] = [];
      if (excluidosTotal > 0) extras.push(`${excluidosTotal} excluidos`);
      if (descartadosTotal > 0) extras.push(`${descartadosTotal} descartados por nombre`);
      if (candidatos.length - lista.length > 0)
        extras.push(`${candidatos.length - lista.length} fuera del polígono`);
      if (celdasFallidas > 0) extras.push(`${celdasFallidas} celdas fallaron`);
      if (restantes > 0)
        extras.push(
          `quedan ${restantes} CPs sin censar (desde ${cpsGeo[k].codigo_postal}): quita los censados y repite`
        );
      reportar(
        lista.length > 0 ? "ok" : "error",
        lista.length > 0
          ? `${lista.length} POIs dentro de ${cpsCodigos.length} ${cpsCodigos.length === 1 ? "CP" : "CPs"} (${celdasCp.length} celdas)${extras.length ? " · " + extras.join(" · ") : ""}`
          : `Sin resultados dentro de los CPs${extras.length ? " · " + extras.join(" · ") : ""}`
      );
      setCoberturaCp(null);
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al buscar por CP");
    } finally {
      setOcupado(false);
      setProgresoCenso(null);
      setProceso((p) => (p?.error ? p : null));
    }
  }

  // ---- nueva búsqueda: limpia todo y regresa al estado inicial
  function nuevaBusqueda() {
    detenerCensoRef.current = true;
    detenerOrigenesRef.current = true;
    geocodePendienteRef.current = null;
    busquedaGrandeRef.current = null;
    setPlanOrigenes(null);
    setProceso(null);
    setTextDirecciones("");
    setTextCoords("");
    setArchivo(null);
    setNombreArchivo("");
    setOrigenes([]);
    setZonaQuery("");
    setZonas([]);
    setZona(null);
    setRadio(1000);
    setCategoria(CATEGORIAS[0].key);
    setNameFilters([]);
    setNameFilterInput("");
    setSepararEnCapas(true);
    setExcludes([]);
    setExcludeInput("");
    setMarca("");
    setCiudadQuery("");
    setCeldas(null);
    setProgresoCenso(null);
    setTerLugarQuery("");
    setTerCentro(null);
    setCpsInput("");
    setCpsGeo([]);
    setCpsNoEncontrados([]);
    setNombreArchivoCps("");
    setCoberturaCp(null);
    setTituloPlan("");
    setTacticasPlan(null);
    setCapas([]);
    agregarCapaRef.current = false;
    setAgregandoCapa(false);
    setCensoSugerido(null);
    setAvisoDescartado(false);
    setActualizarDe(null);
    setDeltaInfo(null);
    setFechaCensoUsado(null);
    setEstratoFiltro("");
    setPois([]);
    setContadores({ excluidos: 0, descartadosPorNombre: 0 });
    setDetalles({ excluidos: [], descartados: [] });
    setVerLista(null);
    setUniversos(null);
    setCapaDemografica(false);
    setAgebsGeo(null);
    geocercasRef.current = null;
    setFoco(null);
    setTablaColapsada(false);
    reportar("idle", "Listo para buscar");
  }

  // ---- universos de un censo: área de influencia alrededor de cada POI.
  // Cada punto censado se convierte en un buffer de radioInfluencia; el
  // servidor los UNE (ST_Union, sin contar doble los traslapes) y corre
  // la interpolación areal de AGEBs contra esa geometría unificada —
  // igual que los radios del modo por orígenes.
  const etiquetaMetros = (m: number) =>
    m >= 1000 ? `${m / 1000} km` : `${m} m`;

  async function calcularUniversosDeCenso(
    lista: Poi[],
    radio: number = radioInfluencia
  ): Promise<Universos | null> {
    if (lista.length === 0) return null;
    try {
      const geocercas: GeocercaUniverso[] = lista.slice(0, 2000).map((p) => ({
        id: p.placeId,
        lat: p.lat,
        lng: p.lng,
        radio_m: radio,
      }));
      geocercasRef.current = geocercas;
      const { universos: u } = await postJson<{ universos: Universos }>(
        "/api/universos",
        { geocercas }
      );
      const conCriterio: Universos = u?.disponible
        ? {
            ...u,
            criterio: `población a ${etiquetaMetros(radio)} de los puntos censados`,
          }
        : u;
      setUniversos(conCriterio);
      setAgebsGeo(null);
      setCapaDemografica(false);
      return conCriterio;
    } catch (e) {
      console.error("No se pudieron calcular universos del censo:", e);
      return null;
    }
  }

  // Cambiar el radio de influencia recalcula los universos del censo
  // en pantalla (la capa demográfica se apaga: quedaría desfasada).
  async function cambiarRadioInfluencia(radio: number) {
    setRadioInfluencia(radio);
    if ((mode === "census" || mode === "territorial") && pois.length > 0) {
      await calcularUniversosDeCenso(pois, radio);
    }
  }

  // ---- guardar un censo en la biblioteca y calcular delta si es actualización
  async function guardarCensoEnBiblioteca(args: {
    tipo: "marca" | "territorial";
    marcaOCategoria: string;
    alcanceDescripcion: string;
    fuente: Fuente;
    params: Record<string, unknown>;
    lista: Poi[];
    universos?: Universos | null;
  }): Promise<{ guardado: boolean; delta: DeltaCenso | null }> {
    let guardado = false;
    let delta: DeltaCenso | null = null;
    try {
      await postJson<{ censusId: string }>("/api/censos", {
        tipo: args.tipo,
        marca_o_categoria: args.marcaOCategoria,
        alcance_descripcion: args.alcanceDescripcion,
        fuente: args.fuente,
        params: args.params,
        universos: args.universos ?? null,
        pois: args.lista.map((p) => ({
          place_key: p.placeId,
          fuente: p.fuente,
          name: p.nombre,
          lat: p.lat,
          lng: p.lng,
          address: p.direccion || null,
          estrato: p.estrato ?? null,
          extra: {
            actividad: p.actividad ?? null,
            razonSocial: p.razonSocial ?? null,
            distancia_m: p.distancia,
          },
        })),
      });
      guardado = true;
    } catch (e) {
      console.error("No se pudo guardar el censo:", e);
    }
    // Delta de actualización contra la versión anterior (por place_key).
    if (actualizarDe) {
      const viejos = new Set(actualizarDe.placeKeys);
      const nuevosKeys = new Set(args.lista.map((p) => p.placeId));
      let nuevos = 0;
      let sinCambio = 0;
      nuevosKeys.forEach((k) => (viejos.has(k) ? sinCambio++ : nuevos++));
      let perdidos = 0;
      viejos.forEach((k) => {
        if (!nuevosKeys.has(k)) perdidos++;
      });
      delta = { nuevos, perdidos, sinCambio };
      setDeltaInfo(delta);
      setActualizarDe(null);
    }
    return { guardado, delta };
  }

  // ---- censo de marca: 1) calcular la cuadrícula y pedir confirmación
  async function calcularCenso() {
    const m = marca.trim();
    const c = ciudadQuery.trim();
    if (!m) {
      reportar("error", "Escribe la marca a censar, p. ej. OXXO");
      return;
    }
    if (!c) {
      reportar("error", "Escribe la ciudad, p. ej. Guadalajara");
      return;
    }
    setOcupado(true);
    setFoco(null);
    setCeldas(null);
    setProgresoCenso(null);
    reportar("busy", `Ubicando "${c}"…`);
    try {
      const { resultados } = await postJson<GeocodeResponse>("/api/geocode", {
        direcciones: [c],
      });
      const r = resultados[0];
      if (!r?.ok || r.lat === undefined || r.lng === undefined) {
        reportar("error", r?.error ?? "No encontré esa ciudad");
        return;
      }
      const centro = { lat: r.lat, lng: r.lng, nombre: r.formatted ?? c };
      setZona(centro);
      const cuadricula = generarCuadricula(centro, alcance, radioCelda, tipoCuadricula);
      setCeldas(cuadricula);
      reportar(
        "ok",
        `Cuadrícula lista: ${cuadricula.length} celdas = ${cuadricula.length} llamadas a Google. Confirma para ejecutar.`
      );
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al calcular el censo");
    } finally {
      setOcupado(false);
    }
  }

  // ---- censo de marca: 2) ejecutar celda por celda con throttle
  async function ejecutarCenso() {
    if (!celdas || celdas.length === 0 || !zona) return;
    const m = marca.trim();
    setOcupado(true);
    setFoco(null);
    detenerCensoRef.current = false;
    setPois([]);

    const acumulados = new Map<string, Poi>();
    const detExcluidos = new Set<string>();
    const detDescartados = new Set<string>();
    let excluidosTotal = 0;
    let descartadosTotal = 0;
    let errorFatal: string | null = null;
    let celdasCorridas = 0;
    let celdasFallidas = 0;
    let fallosSeguidos = 0;

    for (let i = 0; i < celdas.length; i++) {
      if (detenerCensoRef.current) break;
      try {
        const data = await postJson<SearchResponse>("/api/search", {
          mode: "census",
          centers: [celdas[i]],
          radius: radioCelda,
          category: SOLO_NOMBRE,
          nameFilter: m,
          excludes,
          persist: false,
        } satisfies SearchRequest);
        celdasCorridas++;
        fallosSeguidos = 0;
        excluidosTotal += data.excluidos;
        descartadosTotal += data.descartadosPorNombre;
        (data.detalleExcluidos ?? []).forEach((n) => {
          if (detExcluidos.size < 300) detExcluidos.add(n);
        });
        (data.detalleDescartados ?? []).forEach((n) => {
          if (detDescartados.size < 300) detDescartados.add(n);
        });
        for (const p of data.pois) {
          if (!acumulados.has(p.placeId)) {
            acumulados.set(p.placeId, {
              ...p,
              // distancia y origen relativos al centro de la ciudad
              distancia: Math.round(haversine(zona, p)),
              origenIdx: 0,
            });
          }
        }
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : "Error en el censo";
        // Solo cuota/auth/configuración abortan; una celda con timeout
        // o error de red se salta y el censo sigue.
        if (esErrorFatalDeCenso(mensaje)) {
          errorFatal = mensaje;
          break;
        }
        celdasFallidas++;
        fallosSeguidos++;
        if (fallosSeguidos >= MAX_FALLOS_SEGUIDOS) {
          errorFatal = `${MAX_FALLOS_SEGUIDOS} celdas seguidas fallaron (${mensaje})`;
          break;
        }
      }
      setProgresoCenso({ actual: i + 1, total: celdas.length, pois: acumulados.size });
      setProceso({
        etapa: "Censando la marca",
        detalle: `celda ${i + 1} de ${celdas.length} · ${acumulados.size.toLocaleString("es-MX")} POIs`,
        actual: i + 1,
        total: celdas.length,
        onDetener: () => {
          detenerCensoRef.current = true;
        },
      });
      setPois(Array.from(acumulados.values()));
      reportar(
        "busy",
        `Censo: celda ${i + 1} de ${celdas.length} · ${acumulados.size} POIs acumulados`
      );
      if (i < celdas.length - 1) {
        await new Promise((r) => setTimeout(r, THROTTLE_CENSO_MS));
      }
    }

    const lista = Array.from(acumulados.values()).sort(
      (a, b) => a.distancia - b.distancia
    );
    setPois(lista);
    setContadores({
      excluidos: excluidosTotal,
      descartadosPorNombre: descartadosTotal,
    });
    setDetalles({
      excluidos: Array.from(detExcluidos),
      descartados: Array.from(detDescartados),
    });
    setVerLista(null);
    setTablaColapsada(false);

    // Universos sobre las geocercas por POI + guardado en la biblioteca.
    const universosCenso = await calcularUniversosDeCenso(lista);
    let guardado = false;
    let delta: DeltaCenso | null = null;
    if (lista.length > 0 || celdasCorridas > 0) {
      const r = await guardarCensoEnBiblioteca({
        tipo: "marca",
        universos: universosCenso,
        marcaOCategoria: m,
        alcanceDescripcion: `${(zona.nombre ?? ciudadQuery.trim()).split(",")[0]} · ${fmtM(alcance)} · ${celdasCorridas} celdas`,
        fuente: "google",
        params: {
          centro: zona,
          marca: m,
          ciudad: zona.nombre ?? ciudadQuery.trim(),
          tipoCuadricula,
          radioCelda,
          alcance,
          celdas: celdasCorridas,
          excludes,
        },
        lista,
      });
      guardado = r.guardado;
      delta = r.delta;
    }
    const notaDelta = delta
      ? ` · delta: ${delta.nuevos} nuevos, ${delta.perdidos} ya no encontrados, ${delta.sinCambio} sin cambio`
      : "";
    const notaFallidas =
      celdasFallidas > 0 ? ` · ${celdasFallidas} celdas fallaron (saltadas)` : "";

    if (errorFatal) {
      reportar(
        "error",
        `Censo detenido: ${errorFatal} · ${lista.length} POIs conservados${guardado ? " (guardados en la biblioteca)" : ""}`
      );
    } else if (detenerCensoRef.current) {
      reportar(
        "ok",
        `Censo detenido por ti: ${celdasCorridas} de ${celdas.length} celdas · ${lista.length} POIs${notaFallidas}${guardado ? " · guardado en la biblioteca" : ""}${notaDelta}`
      );
    } else {
      reportar(
        "ok",
        `Censo completo: ${lista.length} POIs de "${m}" en ${celdasCorridas} celdas${notaFallidas}${guardado ? " · guardado en la biblioteca" : ""}${notaDelta}`
      );
    }
    setOcupado(false);
    setProceso(null);
  }

  // ---- censo territorial (DENUE/INEGI): 1) calcular consultas
  async function calcularTerritorial() {
    const lugar = terLugarQuery.trim();
    if (!lugar) {
      reportar("error", "Escribe el lugar: un punto/dirección o una ciudad");
      return;
    }
    setOcupado(true);
    setFoco(null);
    setCeldas(null);
    setProgresoCenso(null);
    setDeltaInfo(null);
    reportar("busy", `Ubicando "${lugar}"…`);
    try {
      const { resultados } = await postJson<GeocodeResponse>("/api/geocode", {
        direcciones: [lugar],
      });
      const r = resultados[0];
      if (!r?.ok || r.lat === undefined || r.lng === undefined) {
        reportar("error", r?.error ?? "No encontré ese lugar");
        return;
      }
      const centro: Origin = {
        lat: r.lat,
        lng: r.lng,
        nombre: r.formatted ?? lugar,
        viewport: r.viewport,
      };
      setTerCentro(centro);

      let plan: LatLng[];
      if (terAlcanceTipo === "ciudad" && r.viewport) {
        plan = celdasParaViewport(r.viewport, TER_RADIO_CELDA);
      } else if (terRadio <= 5000) {
        plan = [centro];
      } else {
        plan = generarCuadricula(centro, terRadio, TER_RADIO_CELDA, "hex");
      }
      setCeldas(plan);
      const fuentes = terFuente === "ambas" ? 2 : 1;
      reportar(
        "ok",
        `Censo territorial listo: ${plan.length} ${plan.length === 1 ? "consulta" : "consultas"}${fuentes === 2 ? ` × 2 fuentes = ${plan.length * 2} llamadas` : ""}. Confirma para ejecutar.`
      );
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al calcular el censo");
    } finally {
      setOcupado(false);
    }
  }

  // ---- censo territorial: 2) ejecutar por celda con throttle
  async function ejecutarTerritorial() {
    if (!celdas || celdas.length === 0 || !terCentro) return;
    const cat = getCategoria(terCategoria);
    if (!cat) return;
    setOcupado(true);
    setFoco(null);
    detenerCensoRef.current = false;
    setPois([]);
    setDeltaInfo(null);

    const radioCeldaTer =
      celdas.length === 1 && terAlcanceTipo === "radio"
        ? Math.min(terRadio, 5000)
        : TER_RADIO_CELDA;

    const googleAcum = new Map<string, Poi>();
    const denueAcum = new Map<string, Poi>();
    let errorFatal: string | null = null;
    let celdasCorridas = 0;
    let celdasFallidas = 0;
    let fallosSeguidos = 0;
    // registros basura de DENUE (nombres vacíos/genéricos): se
    // descartan pero se REPORTAN en el contador, no en silencio
    let basuraDenue = 0;
    const detalleBasura = new Set<string>();

    for (let i = 0; i < celdas.length; i++) {
      if (detenerCensoRef.current) break;
      try {
        if (terFuente === "denue" || terFuente === "ambas") {
          const { pois: crudos } = await postJson<{ pois: DenuePoi[] }>(
            "/api/denue",
            {
              category: terCategoria,
              lat: celdas[i].lat,
              lng: celdas[i].lng,
              radius: radioCeldaTer,
            }
          );
          for (const d of crudos) {
            if (esNombreBasura(d.nombre)) {
              basuraDenue++;
              if (detalleBasura.size < 300) {
                detalleBasura.add(d.nombre.trim() || "(sin nombre)");
              }
              continue;
            }
            if (!denueAcum.has(d.placeId)) {
              denueAcum.set(d.placeId, denuePoiAPoi(d, terCentro));
            }
          }
        }
        if (terFuente === "google" || terFuente === "ambas") {
          const data = await postJson<SearchResponse>("/api/search", {
            mode: "census",
            centers: [celdas[i]],
            radius: radioCeldaTer,
            category: terCategoria,
            nameFilter: "",
            excludes: [],
            persist: false,
          } satisfies SearchRequest);
          for (const p of data.pois) {
            if (!googleAcum.has(p.placeId)) {
              googleAcum.set(p.placeId, {
                ...p,
                distancia: Math.round(haversine(terCentro, p)),
                origenIdx: 0,
              });
            }
          }
        }
        celdasCorridas++;
        fallosSeguidos = 0;
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : "Error en el censo";
        if (esErrorFatalDeCenso(mensaje)) {
          errorFatal = mensaje;
          break;
        }
        celdasFallidas++;
        fallosSeguidos++;
        if (fallosSeguidos >= MAX_FALLOS_SEGUIDOS) {
          errorFatal = `${MAX_FALLOS_SEGUIDOS} consultas seguidas fallaron (${mensaje})`;
          break;
        }
      }
      const acumTotal = googleAcum.size + denueAcum.size;
      setProgresoCenso({ actual: i + 1, total: celdas.length, pois: acumTotal });
      setProceso({
        etapa: "Censo territorial",
        detalle: `consulta ${i + 1} de ${celdas.length} · ${acumTotal.toLocaleString("es-MX")} establecimientos`,
        actual: i + 1,
        total: celdas.length,
        onDetener: () => {
          detenerCensoRef.current = true;
        },
      });
      setPois(
        mezclarFuentes(
          Array.from(googleAcum.values()),
          Array.from(denueAcum.values())
        )
      );
      reportar(
        "busy",
        `Censo territorial: consulta ${i + 1} de ${celdas.length} · ${acumTotal} establecimientos`
      );
      if (i < celdas.length - 1) {
        await new Promise((r) => setTimeout(r, THROTTLE_CENSO_MS));
      }
    }

    // Mezcla final con dedupe cruzado obligatorio (prevalece Google).
    const lista = mezclarFuentes(
      Array.from(googleAcum.values()),
      Array.from(denueAcum.values())
    ).sort((a, b) => a.distancia - b.distancia);
    setPois(lista);
    setContadores({ excluidos: 0, descartadosPorNombre: basuraDenue });
    setDetalles({ excluidos: [], descartados: Array.from(detalleBasura) });
    setTablaColapsada(false);

    const universosCenso = await calcularUniversosDeCenso(lista);
    let guardado = false;
    let delta: DeltaCenso | null = null;
    if (lista.length > 0 || celdasCorridas > 0) {
      const lugarCorto = (terCentro.nombre ?? terLugarQuery).split(",")[0];
      const r = await guardarCensoEnBiblioteca({
        tipo: "territorial",
        universos: universosCenso,
        marcaOCategoria: cat.label,
        alcanceDescripcion:
          terAlcanceTipo === "ciudad"
            ? `${lugarCorto} · ciudad completa`
            : `${lugarCorto} · radio ${fmtM(terRadio)}`,
        fuente: terFuente,
        params: {
          centro: terCentro,
          categoria: terCategoria,
          lugar: terCentro.nombre ?? terLugarQuery,
          alcanceTipo: terAlcanceTipo,
          radio: terRadio,
          fuente: terFuente,
          celdas: celdasCorridas,
        },
        lista,
      });
      guardado = r.guardado;
      delta = r.delta;
    }
    const cruzados = lista.filter((p) => p.fuente === "ambas").length;
    const notaDelta = delta
      ? ` · delta: ${delta.nuevos} nuevos, ${delta.perdidos} ya no encontrados, ${delta.sinCambio} sin cambio`
      : "";
    const notaFallidas =
      celdasFallidas > 0
        ? ` · ${celdasFallidas} consultas fallaron (saltadas)`
        : "";

    if (errorFatal) {
      reportar(
        "error",
        `Censo territorial detenido: ${errorFatal} · ${lista.length} establecimientos conservados${guardado ? " (guardados)" : ""}`
      );
    } else {
      reportar(
        "ok",
        `Censo territorial completo: ${lista.length} establecimientos en ${celdasCorridas} consultas${notaFallidas}${cruzados > 0 ? ` · ${cruzados} confirmados por ambas fuentes` : ""}${guardado ? " · guardado en la biblioteca" : ""}${notaDelta}`
      );
    }
    setOcupado(false);
    setProceso(null);
  }

  // ---- universos POR LOTES (listas grandes de geocercas): agrupa por
  //      proximidad, pide sumas CRUDAS por lote (cada unión es local y
  //      no excede el timeout) y agrega al final — las edades siguen
  //      sumando 100% porque se suman crudos, no porcentajes. Un lote
  //      fallido se reintenta 3 veces sin tirar el cálculo completo.
  async function calcularUniversosPorLotes(
    geocercas: GeocercaUniverso[],
    criterio: string
  ): Promise<Universos> {
    const lotes = agruparGeocercasPorProximidad(geocercas);
    const crudos: UniversosCrudo[] = [];
    const lotesFallidos: number[] = [];
    for (let i = 0; i < lotes.length; i++) {
      setProceso({
        etapa: "Calculando universos",
        detalle: `lote ${i + 1} de ${lotes.length}`,
        actual: i,
        total: lotes.length,
      });
      reportar("busy", `Calculando universos: lote ${i + 1} de ${lotes.length}…`);
      let logrado = false;
      let ultimoError = "";
      for (let intento = 0; intento < 3 && !logrado; intento++) {
        try {
          const { crudo } = await postJson<{ crudo: UniversosCrudo }>(
            "/api/universos",
            { geocercas: lotes[i], crudo: true }
          );
          if (crudo?.ok) crudos.push(crudo);
          logrado = true;
        } catch (e) {
          ultimoError = e instanceof Error ? e.message : "error de consulta";
          await new Promise((r) => setTimeout(r, 800 * (intento + 1)));
        }
      }
      if (!logrado) {
        lotesFallidos.push(i + 1);
        console.error(
          `Universos: el lote ${i + 1} de ${lotes.length} falló tras 3 intentos: ${ultimoError}`
        );
      }
    }
    setProceso(null);
    if (crudos.length === 0) {
      return {
        disponible: false,
        mensaje: `Los ${lotes.length} lotes de universos fallaron — reintenta; si persiste, avisa al admin.`,
      };
    }
    const nota =
      lotesFallidos.length > 0
        ? ` · ${lotesFallidos.length} de ${lotes.length} lotes fallaron (${lotesFallidos.slice(0, 5).join(", ")}${lotesFallidos.length > 5 ? "…" : ""}) y quedaron fuera del total`
        : "";
    if (lotesFallidos.length > 0) {
      reportar(
        "error",
        `Universos parciales: fallaron los lotes ${lotesFallidos.slice(0, 8).join(", ")} de ${lotes.length} — el total no los incluye.`
      );
    }
    return agregarUniversosCrudos(crudos, `${criterio}${nota}`);
  }

  // ---- opción "solo universos" (modo orígenes): demografía de las
  //      zonas del cliente SIN búsqueda de POIs — puro PostGIS, cero
  //      llamadas a Google.
  async function soloUniversosOrigenes() {
    if (origenes.length === 0) {
      reportar("error", "Primero procesa tus orígenes (paso 02)");
      return;
    }
    setOcupado(true);
    setFoco(null);
    try {
      const geocercas: GeocercaUniverso[] = origenes.map((o, i) => ({
        id: o.nombre ?? String(i),
        lat: o.lat,
        lng: o.lng,
        radio_m: radio,
      }));
      const criterio = `población a ${radio} m de ${origenes.length.toLocaleString("es-MX")} orígenes`;
      let u: Universos;
      if (geocercas.length <= UMBRAL_UNIVERSOS_LOTES) {
        const { universos: sencillo } = await postJson<{ universos: Universos }>(
          "/api/universos",
          { geocercas }
        );
        u = sencillo?.disponible ? { ...sencillo, criterio } : sencillo;
      } else {
        u = await calcularUniversosPorLotes(geocercas, criterio);
      }
      setUniversos(u);
      setAgebsGeo(null);
      setCapaDemografica(false);
      geocercasRef.current = geocercas.length <= 2000 ? geocercas : null;
      setPlanOrigenes(null);
      reportar(
        u?.disponible ? "ok" : "error",
        u?.disponible
          ? `Universos listos para ${origenes.length.toLocaleString("es-MX")} orígenes · 0 llamadas a Google`
          : (u?.mensaje ?? "Universos no disponibles")
      );
    } catch (e) {
      reportar("error", e instanceof Error ? e.message : "Error al calcular universos");
    } finally {
      setOcupado(false);
      setProceso((p) => (p?.error ? p : null));
    }
  }

  // ---- búsqueda de POIs por lotes (orígenes grandes, ya confirmada):
  //      centros CONSOLIDADOS en requests de ≤150, con progreso,
  //      detener y reanudación; al final cada POI se reasigna a su
  //      origen más cercano de la lista COMPLETA.
  async function ejecutarBusquedaOrigenes(centros: Origin[]) {
    setOcupado(true);
    setFoco(null);
    detenerOrigenesRef.current = false;
    const firma = `${centros.length}:${radio}:${categoria}:${filtroNombreTexto}:${excludes.join("|")}`;
    const previo =
      busquedaGrandeRef.current?.firma === firma
        ? busquedaGrandeRef.current
        : null;
    const acumulados = previo?.acumulados ?? new Map<string, Poi>();
    let excluidosTotal = previo?.excluidos ?? 0;
    let descartadosTotal = previo?.descartados ?? 0;
    const detExc = previo?.detExc ?? new Set<string>();
    const detDesc = previo?.detDesc ?? new Set<string>();
    // tamaño de lote adaptativo: "solo por nombre" pagina hasta 60
    // resultados por centro (y multiplica por término), así que los
    // lotes se encogen para no rozar el timeout del endpoint (60 s)
    const tamanoLote =
      categoria === SOLO_NOMBRE
        ? Math.max(30, Math.floor(120 / Math.max(1, nameFilters.length)))
        : LOTE_CENTROS_BUSQUEDA;
    const lotes: Origin[][] = [];
    for (let i = 0; i < centros.length; i += tamanoLote) {
      lotes.push(centros.slice(i, i + tamanoLote));
    }
    let li = previo?.indice ?? 0;

    try {
      for (; li < lotes.length; li++) {
        if (detenerOrigenesRef.current) break;
        setProceso({
          etapa: "Buscando POIs",
          detalle: `lote ${li + 1} de ${lotes.length} · ${acumulados.size.toLocaleString("es-MX")} POIs`,
          actual: li,
          total: lotes.length,
          onDetener: () => {
            detenerOrigenesRef.current = true;
          },
        });
        reportar(
          "busy",
          `Buscando POIs: lote ${li + 1} de ${lotes.length} · ${acumulados.size.toLocaleString("es-MX")} acumulados`
        );
        const data = await postJson<SearchResponse>("/api/search", {
          mode: "origins",
          centers: lotes[li],
          radius: radio,
          category: categoria,
          nameFilter: filtroNombreTexto,
          nameFilters,
          excludes,
          persist: false,
        } satisfies SearchRequest);
        excluidosTotal += data.excluidos;
        descartadosTotal += data.descartadosPorNombre;
        (data.detalleExcluidos ?? []).forEach((n) => {
          if (detExc.size < 300) detExc.add(n);
        });
        (data.detalleDescartados ?? []).forEach((n) => {
          if (detDesc.size < 300) detDesc.add(n);
        });
        for (const p of data.pois) {
          if (!acumulados.has(p.placeId)) acumulados.set(p.placeId, p);
        }
        busquedaGrandeRef.current = {
          firma,
          indice: li + 1,
          acumulados,
          excluidos: excluidosTotal,
          descartados: descartadosTotal,
          detExc,
          detDesc,
        };
      }
    } catch (e) {
      setProceso({
        etapa: "Buscando POIs",
        detalle: "",
        actual: 0,
        total: 1,
        error: `${e instanceof Error ? e.message : "Error al buscar"} — el avance quedó guardado (lote ${li + 1} de ${lotes.length}).`,
        onReintentar: () => {
          setProceso(null);
          ejecutarBusquedaOrigenes(centros);
        },
        onCerrar: () => setProceso(null),
      });
      setOcupado(false);
      return;
    }

    const interrumpida = li < lotes.length;
    // reasignación: cada POI a su origen más cercano de la lista
    // COMPLETA (la búsqueda corrió sobre centros consolidados)
    const buscador = crearBuscadorCercano(origenes, Math.max(radio * 1.5, 500));
    const lista = Array.from(acumulados.values())
      .map((p) => {
        const { idx, dist } = buscador(p);
        return { ...p, origenIdx: Math.max(idx, 0), distancia: Math.round(dist) };
      })
      .filter((p) => p.distancia <= radio + 50)
      .sort((a, b) => a.distancia - b.distancia);

    setPois(lista);
    if (separarEnCapas && nameFilters.length >= 2) {
      registrarCapasPorTermino(nameFilters, lista);
    } else {
      setCapas([]);
    }
    setContadores({
      excluidos: excluidosTotal,
      descartadosPorNombre: descartadosTotal,
    });
    setDetalles({
      excluidos: Array.from(detExc),
      descartados: Array.from(detDesc),
    });
    setVerLista(null);
    setTablaColapsada(false);
    setProceso(null);

    if (interrumpida) {
      reportar(
        "ok",
        `Búsqueda interrumpida en el lote ${li + 1} de ${lotes.length} (${lista.length.toLocaleString("es-MX")} POIs hasta ahora) — presiona Continuar para reanudar.`
      );
      setOcupado(false);
      return;
    }
    busquedaGrandeRef.current = null;
    setPlanOrigenes(null);

    // universos por lotes sobre TODOS los orígenes (no los consolidados)
    const geocercas: GeocercaUniverso[] = origenes.map((o, i) => ({
      id: o.nombre ?? String(i),
      lat: o.lat,
      lng: o.lng,
      radio_m: radio,
    }));
    const u = await calcularUniversosPorLotes(
      geocercas,
      `población a ${radio} m de ${origenes.length.toLocaleString("es-MX")} orígenes`
    );
    setUniversos(u);
    setAgebsGeo(null);
    setCapaDemografica(false);
    geocercasRef.current = geocercas.length <= 2000 ? geocercas : null;

    const extras: string[] = [];
    if (excluidosTotal > 0) extras.push(`${excluidosTotal} excluidos`);
    if (descartadosTotal > 0)
      extras.push(`${descartadosTotal} descartados por nombre`);
    if (origenes.length > MAX_ORIGENES_HISTORIAL)
      extras.push("no se guardó en historial (lista muy grande)");
    reportar(
      lista.length > 0 ? "ok" : "error",
      lista.length > 0
        ? `${lista.length.toLocaleString("es-MX")} POIs alrededor de ${origenes.length.toLocaleString("es-MX")} orígenes${extras.length ? " · " + extras.join(" · ") : ""}`
        : `Sin resultados${extras.length ? " · " + extras.join(" · ") : ""}`
    );
    setOcupado(false);
  }

  // ---- paso 4: buscar POIs
  async function buscar() {
    // el modo CP corre por cobertura de celdas, como el censo: primero
    // se calcula cuántas celdas usará y se confirma en el paso 02
    if (mode === "cp") {
      await calcularCoberturaCp(coberturaCp?.factor ?? 1);
      return;
    }
    if (centrosActivos.length === 0) {
      reportar(
        "error",
        mode === "origins"
          ? "Primero procesa tus orígenes (paso 02)"
          : "Primero agrega al menos una zona (paso 02)"
      );
      return;
    }
    if (categoria === SOLO_NOMBRE && nameFilters.length === 0) {
      reportar("error", 'Para buscar "solo por nombre" agrega al menos un término al filtro');
      return;
    }

    // Guardarraíl de costo (orígenes grandes): consolidar traslapes,
    // estimar consultas y CONFIRMAR antes de gastar; luego correr por
    // lotes con progreso y reanudación.
    if (mode === "origins" && centrosActivos.length > UMBRAL_ORIGENES_GRANDES) {
      if (planOrigenes) {
        await ejecutarBusquedaOrigenes(planOrigenes.centros);
        return;
      }
      const centros = consolidarCentros(centrosActivos, radio);
      const consultasPorCentro =
        categoria === SOLO_NOMBRE ? Math.max(1, nameFilters.length) : 1;
      const consultas = centros.length * consultasPorCentro;
      if (consultas > MAX_CONSULTAS_BUSQUEDA) {
        reportar(
          "error",
          `Esta búsqueda necesita ~${consultas.toLocaleString("es-MX")} consultas y el máximo es ${MAX_CONSULTAS_BUSQUEDA.toLocaleString("es-MX")} por búsqueda (NEXT_PUBLIC_MAX_CONSULTAS_BUSQUEDA). Sube el radio para consolidar más, divide la lista, o corre "solo universos" sin costo.`
        );
        return;
      }
      setPlanOrigenes({ centros, consultas });
      reportar(
        "ok",
        `Esta búsqueda usará ~${consultas.toLocaleString("es-MX")} consultas a Google (${centrosActivos.length.toLocaleString("es-MX")} orígenes${centros.length < centrosActivos.length ? ` consolidados en ${centros.length.toLocaleString("es-MX")} zonas por traslape` : ""} · tope ${MAX_CONSULTAS_BUSQUEDA.toLocaleString("es-MX")}). Confirma abajo — o corre "solo universos" sin costo.`
      );
      return;
    }

    setOcupado(true);
    setFoco(null);
    reportar(
      "busy",
      mode === "origins"
        ? `Buscando POIs alrededor de ${centrosActivos.length} orígenes…`
        : `Buscando POIs en ${centrosActivos.length} ${centrosActivos.length === 1 ? "zona" : "zonas"}…`
    );
    try {
      const body: SearchRequest = {
        mode,
        centers: centrosActivos,
        radius: radio,
        category: categoria,
        nameFilter: filtroNombreTexto,
        nameFilters,
        excludes,
      };
      const data = await postJson<SearchResponse>("/api/search", body);
      setPois(data.pois);
      // filtro múltiple + "separar en capas": una capa por término
      const multiCapas = separarEnCapas && nameFilters.length >= 2;
      // en modo zona la búsqueda se acumula como capa (misma geografía);
      // al AGREGAR capa, el universo del territorio no cambia: se reusa
      const reutilizarUniversos =
        mode === "zone" && agregarCapaRef.current && universos?.disponible;
      if (multiCapas) {
        registrarCapasPorTermino(nameFilters, data.pois);
      } else if (mode === "zone") {
        registrarCapa(
          nombreCapaActual(),
          data.pois,
          data.excluidos,
          data.descartadosPorNombre
        );
      } else {
        setCapas([]);
      }
      setContadores({
        excluidos: data.excluidos,
        descartadosPorNombre: data.descartadosPorNombre,
      });
      setDetalles({
        excluidos: data.detalleExcluidos ?? [],
        descartados: data.detalleDescartados ?? [],
      });
      setVerLista(null);
      // universos calculados por el servidor + geocercas para el choropleth
      if (!reutilizarUniversos) {
        setUniversos(data.universos ?? null);
        setAgebsGeo(null);
        setCapaDemografica(false);
        geocercasRef.current = centrosActivos.map((c, i) =>
          mode === "zone"
            ? { id: c.nombre ?? String(i), viewport: c.viewport }
            : { id: c.nombre ?? String(i), lat: c.lat, lng: c.lng, radio_m: radio }
        );
      }
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

  // ---- capa demográfica (choropleth de AGEBs, bajo demanda)
  async function toggleCapaDemografica() {
    if (capaDemografica) {
      setCapaDemografica(false);
      return;
    }
    if (!geocercasRef.current || geocercasRef.current.length === 0) {
      reportar("error", "Corre una búsqueda primero para ver la capa demográfica");
      return;
    }
    setCapaDemografica(true);
    if (!agebsGeo) {
      setCargandoCapa(true);
      try {
        const { universos: u } = await postJson<{ universos: Universos }>(
          "/api/universos",
          { geocercas: geocercasRef.current, incluirAgebs: true }
        );
        if (u.disponible && u.agebsGeo) {
          setAgebsGeo(u.agebsGeo);
        } else {
          setCapaDemografica(false);
          reportar("error", u.mensaje ?? "Capa demográfica no disponible");
        }
      } catch (e) {
        setCapaDemografica(false);
        reportar("error", e instanceof Error ? e.message : "Error al cargar la capa");
      } finally {
        setCargandoCapa(false);
      }
    }
  }

  // ---- exclusiones tipo tag: acepta varias separadas por coma
  function agregarExclusion() {
    const nuevos = excludeInput
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
      .filter((v) => !excludes.includes(v));
    if (nuevos.length > 0) setExcludes([...excludes, ...nuevos]);
    setExcludeInput("");
  }

  // ---- tácticas del Export plan: default por modo hasta que el
  //      vendedor toque el selector (0 a 7 marcables); la selección se
  //      conserva durante la sesión de análisis activa
  const esCompetenciaPlan = mode === "census" && excludes.length > 0;
  const tacticasSeleccionadas =
    tacticasPlan ?? tacticasParaModo(mode, esCompetenciaPlan, capas.length > 1);
  function alternarTactica(clave: TacticaClave) {
    setTacticasPlan(
      tacticasSeleccionadas.includes(clave)
        ? tacticasSeleccionadas.filter((c) => c !== clave)
        : [...tacticasSeleccionadas, clave]
    );
  }

  // ---- Export plan (PDF): documento comercial con branding Gravity a
  //      partir del análisis ACTIVO, más el Export data en el mismo
  //      clic. La generación es 100% client-side (@react-pdf/renderer,
  //      importado bajo demanda) y el mapa se captura en canvas.
  async function exportarPlan() {
    const poisPlan = hayCapas
      ? capas.flatMap((c) => c.pois)
      : poisVisibles;
    if (poisPlan.length === 0 && !universos?.disponible) {
      reportar("error", "Corre una búsqueda primero para exportar el plan");
      return;
    }
    setOcupado(true);
    reportar("busy", "Generando Export plan (PDF)…");
    setProceso({
      etapa: "Generando Export plan",
      detalle: "capturando el mapa · etapa 1 de 2",
      actual: 0,
      total: 2,
    });
    try {
      const [{ generarPlanPdf, nombreArchivoPlan }, { capturarMapaPlan }] =
        await Promise.all([import("@/lib/plan-pdf"), import("@/lib/plan-mapa")]);

      const mapaDataUrl = await capturarMapaPlan({
        pois: poisPlan,
        colorPorCapa,
        origenes: mode === "origins" ? origenes : undefined,
        radioM: mode === "origins" ? radio : undefined,
        cps: mode === "cp" ? cpsGeo : undefined,
        zonas: mode === "zone" ? zonas : undefined,
      });

      const termino =
        mode === "census"
          ? marca.trim() || "Censo de marca"
          : mode === "territorial"
            ? (getCategoria(terCategoria)?.label ?? terCategoria)
            : categoria === SOLO_NOMBRE
              ? filtroNombreTexto || "Búsqueda"
              : (CATEGORIAS.find((c) => c.key === categoria)?.label ?? categoria);
      const alcance =
        mode === "census"
          ? (zona?.nombre?.split(",")[0] ?? ciudadQuery.trim() ?? "")
          : mode === "territorial"
            ? (terCentro?.nombre?.split(",")[0] ?? terLugarQuery.trim())
            : mode === "zone"
              ? zonas
                  .map((z) => z.nombre?.split(",")[0] ?? "zona")
                  .slice(0, 3)
                  .join(", ") + (zonas.length > 3 ? ` +${zonas.length - 3}` : "")
              : mode === "cp"
                ? `CPs ${cpsGeo
                    .slice(0, 4)
                    .map((c) => c.codigo_postal)
                    .join(", ")}${cpsGeo.length > 4 ? ` +${cpsGeo.length - 4}` : ""}`
                : `${origenes.length} orígenes`;

      const hayDenue = poisPlan.some((p) => p.fuente !== "google");
      const hayGoogle =
        poisPlan.length === 0 || poisPlan.some((p) => p.fuente !== "denue");
      const fuentes = [
        ...(hayGoogle ? ["Google Places API (New) — establecimientos"] : []),
        ...(hayDenue ? ["DENUE, INEGI — establecimientos"] : []),
        ...(universos?.disponible
          ? ["Censo de Población y Vivienda 2020, INEGI — demografía por AGEB urbana"]
          : []),
        ...(universos?.disponible && (universos.rurales ?? 0) > 0
          ? ["ITER 2020, INEGI — población rural por localidad (<2,500 hab)"]
          : []),
        ...(mode === "cp"
          ? ["Catálogo Nacional de Códigos Postales, Correos de México — polígonos y colonias"]
          : []),
      ];

      const terminoPlan =
        capas.length > 1 ? capas.map((c) => c.nombre).join(" · ") : termino;
      const fecha = new Date();
      const tituloFinal = tituloPlan.trim() || `${terminoPlan} — ${alcance}`;
      setProceso({
        etapa: "Generando Export plan",
        detalle: "armando el PDF · etapa 2 de 2",
        actual: 1,
        total: 2,
      });
      const blob = await generarPlanPdf({
        modo: mode,
        titulo: tituloPlan.trim() || null,
        termino: terminoPlan,
        alcance,
        usuario: usuario?.nombre ?? usuario?.email ?? "Seeker",
        fecha,
        pois: poisPlan,
        capas:
          capas.length > 1
            ? capas.map((c) => ({ nombre: c.nombre, color: c.color, pois: c.pois }))
            : undefined,
        nombresOrigen: centrosActivos.map((c, i) => etiquetaOrigen(c, i)),
        universos,
        criterio: universos?.criterio ?? null,
        fuentes,
        radioM:
          mode === "origins"
            ? radio
            : mode === "census" || mode === "territorial"
              ? radioInfluencia
              : null,
        mapaDataUrl,
        exclusiones: excludes,
        esCompetencia: esCompetenciaPlan,
        tacticas: tacticasSeleccionadas,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivoPlan(tituloFinal, fecha);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // dos entregables, un clic: el Export data acompaña al plan
      if (poisPlan.length > 0) {
        exportarCsv(poisPlan, centrosActivos, universos);
      }
      reportar("ok", "Export plan (PDF) + Export data (CSV) descargados");
    } catch (e) {
      console.error(e);
      const mensaje =
        e instanceof Error
          ? `No se pudo generar el plan: ${e.message}`
          : "No se pudo generar el plan";
      setProceso({
        etapa: "Generando Export plan",
        detalle: "",
        actual: 0,
        total: 1,
        error: mensaje,
        onReintentar: () => {
          setProceso(null);
          exportarPlan();
        },
        onCerrar: () => setProceso(null),
      });
      reportar("error", mensaje);
    } finally {
      setOcupado(false);
      setProceso((p) => (p?.error ? p : null));
    }
  }

  // ---- estilos compartidos
  const inputCls =
    "w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cian focus:outline-none";
  const labelCls =
    "mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500";
  const pasoCls = "border-b border-linea px-5 py-4";

  // ---- datos derivados para la barra de resumen y los KPIs
  const etiquetaCategoria =
    categoria === SOLO_NOMBRE
      ? filtroNombreTexto
        ? `Nombre: "${filtroNombreTexto}"`
        : "Solo por nombre"
      : (CATEGORIAS.find((c) => c.key === categoria)?.label ?? categoria);
  const chipMapa =
    mode === "census"
      ? marca.trim()
        ? `Censo: ${marca.trim()}`
        : "Censo de marca"
      : mode === "territorial"
        ? `INEGI: ${getCategoria(terCategoria)?.label ?? terCategoria}`
        : etiquetaCategoria;
  const distanciaPromedio =
    pois.length > 0
      ? Math.round(pois.reduce((s, p) => s + p.distancia, 0) / pois.length)
      : null;
  // población por origen (solo aplica en orígenes/zona, donde el
  // desglose por geocerca corresponde 1:1 con los centros)
  const poblacionPorOrigen =
    (mode === "origins" || mode === "zone") && universos?.disponible
      ? (universos.porGeocerca ?? []).map((g) => g.poblacion)
      : undefined;

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-fondo p-3">
      <AppHeader usuario={usuario} status={status} onNueva={nuevaBusqueda} />

      {/* ---------- barra de resumen de la búsqueda ---------- */}
      <div className="tarjeta flex shrink-0 items-center overflow-x-auto px-2 py-2.5">
        <Segmento
          etiqueta="Modo"
          valor={
            mode === "origins"
              ? "Orígenes"
              : mode === "zone"
                ? "Zona"
                : mode === "cp"
                  ? "Código postal"
                  : mode === "census"
                    ? "Censo de marca"
                    : "Censo territorial"
          }
          color={
            mode === "origins"
              ? "text-cian"
              : mode === "zone"
                ? "text-violeta"
                : mode === "cp"
                  ? "text-emerald-400"
                  : mode === "census"
                    ? "text-magenta"
                    : "text-[#ff8c42]"
          }
        />
        {mode === "cp" && (
          <Segmento
            etiqueta="CPs"
            valor={
              cpsGeo.length > 0
                ? cpsGeo
                    .slice(0, 6)
                    .map((c) => c.codigo_postal)
                    .join(" · ") + (cpsGeo.length > 6 ? ` +${cpsGeo.length - 6}` : "")
                : "—"
            }
            color={cpsGeo.length > 0 ? "text-emerald-400" : "text-zinc-600"}
          />
        )}
        {mode === "origins" && (
          <Segmento
            etiqueta="Orígenes"
            valor={origenes.length > 0 ? `${origenes.length} listos` : "—"}
          />
        )}
        {mode === "zone" && (
          <Segmento
            etiqueta="Zonas"
            valor={
              zonas.length > 0
                ? zonas.map((z) => z.nombre?.split(",")[0] ?? "zona").join(" · ")
                : "—"
            }
            color={zonas.length > 0 ? "text-violeta" : "text-zinc-600"}
          />
        )}
        {mode === "census" && (
          <>
            <Segmento etiqueta="Marca" valor={marca.trim() || "—"} />
            <Segmento
              etiqueta="Ciudad"
              valor={zona?.nombre ?? (ciudadQuery.trim() || "—")}
            />
            <Segmento
              etiqueta="Cuadrícula"
              valor={`${tipoCuadricula === "hex" ? "Hexagonal" : "Cuadrada"} · celda ${fmtM(radioCelda)}`}
            />
          </>
        )}
        {mode === "territorial" && (
          <>
            <Segmento
              etiqueta="Categoría"
              valor={getCategoria(terCategoria)?.label ?? terCategoria}
            />
            <Segmento
              etiqueta="Lugar"
              valor={terCentro?.nombre ?? (terLugarQuery.trim() || "—")}
            />
            <Segmento
              etiqueta="Alcance"
              valor={
                terAlcanceTipo === "ciudad" ? "Ciudad completa" : fmtM(terRadio)
              }
            />
            <Segmento
              etiqueta="Fuente"
              valor={
                terFuente === "denue"
                  ? "DENUE"
                  : terFuente === "google"
                    ? "Google"
                    : "Ambas"
              }
              color={
                terFuente === "denue"
                  ? "text-[#ff8c42]"
                  : terFuente === "google"
                    ? "text-magenta"
                    : "text-emerald-400"
              }
            />
          </>
        )}
        {mode !== "zone" && mode !== "territorial" && mode !== "cp" && (
          <Segmento
            etiqueta={mode === "census" ? "Alcance" : "Radio"}
            valor={fmtM(mode === "census" ? alcance : radio)}
          />
        )}
        {mode !== "census" && mode !== "territorial" && (
          <Segmento etiqueta="Búsqueda" valor={etiquetaCategoria} />
        )}
        <Segmento
          etiqueta="Exclusiones"
          valor={excludes.length > 0 ? excludes.join(", ") : "—"}
          color={excludes.length > 0 ? "text-magenta" : "text-zinc-600"}
        />
      </div>

      {/* ---------- KPIs ---------- */}
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          titulo="POIs encontrados"
          valor={String(poisActivos.length)}
          caption={
            mode === "census"
              ? progresoCenso
                ? `censo: celda ${progresoCenso.actual} de ${progresoCenso.total}`
                : "censo de marca por cuadrícula"
              : mode === "cp"
                ? progresoCenso
                  ? `cobertura: celda ${progresoCenso.actual} de ${progresoCenso.total}`
                  : `dentro de ${cpsGeo.length} ${cpsGeo.length === 1 ? "CP" : "CPs"}`
                : `en ${centrosActivos.length} ${centrosActivos.length === 1 ? "centro activo" : "centros activos"}`
          }
          glow="glow-cian"
          colorValor="text-white"
        />
        <Kpi
          titulo="Distancia promedio"
          valor={distanciaPromedio !== null ? `${distanciaPromedio} m` : "—"}
          caption="al centro más cercano"
          glow="glow-verde"
          colorValor="text-emerald-400"
        />
        <Kpi
          titulo="Excluidos por marca"
          valor={String(contadores.excluidos)}
          caption={`${excludes.length} ${excludes.length === 1 ? "exclusión activa" : "exclusiones activas"}`}
          glow="glow-magenta"
          colorValor="text-magenta"
          onClick={
            detalles.excluidos.length > 0
              ? () =>
                  setVerLista(verLista === "excluidos" ? null : "excluidos")
              : undefined
          }
          activo={verLista === "excluidos"}
        />
        <Kpi
          titulo="Descartados por nombre"
          valor={String(contadores.descartadosPorNombre)}
          caption="no pasaron el filtro estricto"
          glow="glow-ambar"
          colorValor="text-amber-400"
          onClick={
            detalles.descartados.length > 0
              ? () =>
                  setVerLista(
                    verLista === "descartados" ? null : "descartados"
                  )
              : undefined
          }
          activo={verLista === "descartados"}
        />
      </div>

      {/* lista de excluidos / descartados (clic en el KPI para abrir) */}
      {verLista && (
        <div className="tarjeta shrink-0 px-4 py-2.5">
          <div className="flex items-center justify-between font-mono text-[11px]">
            <span className="uppercase tracking-[0.2em] text-zinc-500">
              {verLista === "excluidos"
                ? `Excluidos por marca (${detalles.excluidos.length}${contadores.excluidos > detalles.excluidos.length ? ` de ${contadores.excluidos}` : ""})`
                : `Descartados por nombre (${detalles.descartados.length}${contadores.descartadosPorNombre > detalles.descartados.length ? ` de ${contadores.descartadosPorNombre}` : ""})`}
            </span>
            <button
              onClick={() => setVerLista(null)}
              className="text-zinc-600 hover:text-zinc-300"
            >
              ×
            </button>
          </div>
          <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {(verLista === "excluidos"
              ? detalles.excluidos
              : detalles.descartados
            ).map((n, i) => (
              <span
                key={`${n}-${i}`}
                className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                  verLista === "excluidos"
                    ? "border-magenta/40 text-magenta/90"
                    : "border-amber-400/40 text-amber-400/90"
                }`}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* delta de actualización de censo */}
      {deltaInfo && (
        <div className="tarjeta flex shrink-0 items-center gap-4 px-4 py-2 font-mono text-[11px]">
          <span className="uppercase tracking-[0.2em] text-zinc-500">
            Delta del censo
          </span>
          <span className="text-emerald-400">{deltaInfo.nuevos} nuevos</span>
          <span className="text-magenta">
            {deltaInfo.perdidos} ya no encontrados
          </span>
          <span className="text-zinc-400">{deltaInfo.sinCambio} sin cambio</span>
          <button
            onClick={() => setDeltaInfo(null)}
            className="ml-auto text-zinc-600 hover:text-zinc-300"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ---------- panel lateral ---------- */}
        <aside className="tarjeta w-[360px] shrink-0 overflow-y-auto">
          {/* 01 · modo */}
          <section className={pasoCls}>
            <label className={labelCls}>01 · Modo de búsqueda</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode("origins")}
                className={`rounded-md border px-2 py-2 font-mono text-[11px] transition-colors ${
                  mode === "origins"
                    ? "border-cian bg-cian/10 text-cian"
                    : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                Por orígenes
              </button>
              <button
                onClick={() => setMode("zone")}
                className={`rounded-md border px-2 py-2 font-mono text-[11px] transition-colors ${
                  mode === "zone"
                    ? "border-violeta bg-violeta/10 text-violeta"
                    : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                Por zona
              </button>
              <button
                onClick={() => setMode("census")}
                className={`rounded-md border px-2 py-2 font-mono text-[11px] transition-colors ${
                  mode === "census"
                    ? "border-magenta bg-magenta/10 text-magenta"
                    : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                Censo de marca
              </button>
              <button
                onClick={() => setMode("territorial")}
                className={`rounded-md border px-2 py-2 font-mono text-[11px] transition-colors ${
                  mode === "territorial"
                    ? "border-[#ff8c42] bg-[#ff8c42]/10 text-[#ff8c42]"
                    : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                Censo territorial
              </button>
              <button
                onClick={() => setMode("cp")}
                className={`col-span-2 rounded-md border px-2 py-2 font-mono text-[11px] transition-colors ${
                  mode === "cp"
                    ? "border-emerald-400 bg-emerald-400/10 text-emerald-400"
                    : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                Por código postal
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
                    "Una dirección por línea, con nombre opcional al frente:\nSucursal Reforma | Av. Reforma 222, CDMX\nAv. Chapultepec 480, Guadalajara"
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
                    nombre y variantes. El nombre de cada tienda aparece como
                    origen en resultados, mapa y exports.{" "}
                    <button
                      onClick={descargarPlantillaOrigenes}
                      className="text-cian underline decoration-cian/40 underline-offset-2 transition-colors hover:decoration-cian"
                      title="Plantilla .xlsx con columnas nombre | latitud | longitud | direccion + hoja de instrucciones"
                    >
                      Descargar plantilla Excel
                    </button>
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
          ) : mode === "zone" ? (
            <section className={pasoCls}>
              <label className={labelCls}>02 · Tus zonas</label>
              <input
                value={zonaQuery}
                onChange={(e) => setZonaQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && agregarZona()}
                placeholder="p. ej. Polanco, CDMX · Enter para agregar"
                className={inputCls}
              />
              <button
                onClick={agregarZona}
                disabled={ocupado}
                className="mt-3 w-full rounded-md border border-violeta bg-violeta/10 px-3 py-2 font-mono text-xs font-medium text-violeta transition-colors hover:bg-violeta/20 disabled:opacity-40"
              >
                + Agregar zona
              </button>
              {zonas.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {zonas.map((z, i) => (
                    <button
                      key={`${z.nombre}-${i}`}
                      onClick={() => setZonas(zonas.filter((_, j) => j !== i))}
                      className="group flex max-w-full items-center gap-1 rounded-full border border-violeta/50 bg-violeta/10 px-2.5 py-0.5 font-mono text-[11px] text-violeta"
                      title="Quitar zona"
                    >
                      <span className="truncate">{z.nombre}</span>
                      <span className="text-violeta/60 group-hover:text-violeta">
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-600">
                Sin radio: la búsqueda se limita a los límites reales de cada
                zona (Polanco = solo Polanco; CDMX = toda la ciudad).
              </p>
            </section>
          ) : mode === "cp" ? (
            <section className={pasoCls}>
              <label className={labelCls}>02 · Tus códigos postales</label>
              <textarea
                value={cpsInput}
                onChange={(e) => setCpsInput(e.target.value)}
                rows={4}
                placeholder={"CPs separados por comas o saltos de línea:\n11560, 11550\n01000"}
                className={`${inputCls} resize-y`}
              />
              <input
                ref={cpFileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  onArchivoCps(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => cpFileRef.current?.click()}
                className="mt-2 w-full rounded-md border border-dashed border-linea bg-panel2 px-3 py-2.5 font-mono text-xs text-zinc-500 transition-colors hover:border-emerald-400 hover:text-emerald-400"
              >
                {nombreArchivoCps || "Subir Excel/CSV con una columna de CPs"}
              </button>
              <button
                onClick={cargarCpsPoligonos}
                disabled={ocupado}
                className="mt-3 w-full rounded-md border border-emerald-400 bg-emerald-400/10 px-3 py-2 font-mono text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-400/20 disabled:opacity-40"
              >
                Ver polígonos
              </button>
              {cpsGeo.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {cpsGeo.map((c) => (
                    <button
                      key={c.codigo_postal}
                      onClick={() => quitarCp(c.codigo_postal)}
                      className="group flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-400/10 px-2.5 py-0.5 font-mono text-[11px] text-emerald-400"
                      title="Quitar CP"
                    >
                      {c.codigo_postal}
                      <span className="text-emerald-400/60 group-hover:text-emerald-400">
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {cpsNoEncontrados.length > 0 && (
                <div className="mt-2 rounded-md border border-amber-400/40 bg-amber-400/5 px-2.5 py-1.5">
                  {cpsNoEncontrados.map((n) => (
                    <p
                      key={n.cp}
                      className="font-mono text-[10px] leading-relaxed text-amber-400/90"
                    >
                      {n.cp} no encontrado — {n.sugerencia}
                    </p>
                  ))}
                </div>
              )}

              {/* confirmación de cobertura antes de gastar Google */}
              {coberturaCp && (
                <div className="mt-3 rounded-md border border-linea bg-panel2 px-3 py-2.5">
                  <p className="font-mono text-[11px] leading-relaxed text-zinc-300">
                    Esta búsqueda usará ~
                    <span
                      className={
                        coberturaCp.celdas.length <= MAX_CELDAS_CP
                          ? "text-emerald-400"
                          : "text-amber-400"
                      }
                    >
                      {coberturaCp.celdas.length.toLocaleString("es-MX")} celdas
                    </span>{" "}
                    de Google
                    {coberturaCp.factor > 1 && ` (celdas ×${coberturaCp.factor})`}{" "}
                    · tope {MAX_CELDAS_CP.toLocaleString("es-MX")}
                  </p>
                  {coberturaCp.celdas.length <= MAX_CELDAS_CP ? (
                    <button
                      onClick={() => ejecutarCensoCp()}
                      disabled={ocupado}
                      className="mt-2 w-full rounded-md bg-emerald-400 px-3 py-2 font-display text-xs font-extrabold text-fondo transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      Continuar: censar POIs ({coberturaCp.celdas.length} celdas)
                    </button>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      <button
                        onClick={soloUniversosCp}
                        disabled={ocupado}
                        className="w-full rounded-md border border-violeta bg-violeta/10 px-3 py-2 font-mono text-[11px] text-violeta transition-colors hover:bg-violeta/20 disabled:opacity-40"
                      >
                        Solo universos demográficos (sin censo de POIs)
                      </button>
                      <button
                        onClick={() => calcularCoberturaCp(coberturaCp.factor + 1)}
                        disabled={ocupado}
                        className="w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 disabled:opacity-40"
                      >
                        Celdas más grandes ×{coberturaCp.factor + 1} (menos
                        granularidad, menos llamadas)
                      </button>
                      {(() => {
                        const parte = prefijoCpsQueCabe();
                        return parte.cps > 0 && parte.cps < cpsGeo.length ? (
                          <button
                            onClick={() => ejecutarCensoCp(parte.cps)}
                            disabled={ocupado}
                            className="w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 disabled:opacity-40"
                          >
                            Por partes: censar los primeros {parte.cps} CPs (~
                            {parte.celdas} celdas)
                          </button>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              )}

              <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-600">
                Polígonos y universos: hasta 500 CPs, sin costo de Google.
                Censo de POIs: máximo {MAX_CELDAS_CP.toLocaleString("es-MX")}{" "}
                celdas de búsqueda por censo — la búsqueda corre únicamente
                dentro del polígono real de cada CP.
              </p>
            </section>
          ) : mode === "census" ? (
            <section className={pasoCls}>
              <label className={labelCls}>02 · Censo de marca</label>
              <input
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                placeholder="Marca · p. ej. OXXO"
                className={inputCls}
              />
              <input
                value={ciudadQuery}
                onChange={(e) => setCiudadQuery(e.target.value)}
                placeholder="Ciudad · p. ej. Guadalajara"
                className={`${inputCls} mt-2`}
              />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTipoCuadricula("hex")}
                  className={`rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                    tipoCuadricula === "hex"
                      ? "border-cian bg-cian/10 text-cian"
                      : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  Hexagonal
                </button>
                <button
                  onClick={() => setTipoCuadricula("square")}
                  className={`rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                    tipoCuadricula === "square"
                      ? "border-cian bg-cian/10 text-cian"
                      : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  Cuadrada
                </button>
              </div>

              <span className="mb-1 mt-3 block font-mono text-[10px] text-zinc-600">
                Radio de celda
              </span>
              <div className="flex flex-wrap gap-1.5">
                {RADIOS_CELDA.map((r) => (
                  <button
                    key={r.m}
                    onClick={() => setRadioCelda(r.m)}
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
                      radioCelda === r.m
                        ? "border-cian bg-cian/10 text-cian"
                        : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <span className="mb-1 mt-3 block font-mono text-[10px] text-zinc-600">
                Alcance desde el centro de la ciudad
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ALCANCES.map((a) => (
                  <button
                    key={a.m}
                    onClick={() => setAlcance(a.m)}
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
                      alcance === a.m
                        ? "border-violeta bg-violeta/10 text-violeta"
                        : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              <button
                onClick={calcularCenso}
                disabled={ocupado}
                className="mt-4 w-full rounded-md border border-cian bg-cian/10 px-3 py-2 font-mono text-xs font-medium text-cian transition-colors hover:bg-cian/20 disabled:opacity-40"
              >
                Calcular celdas
              </button>

              {celdas && !progresoCenso && (
                <div className="mt-3 rounded-md border border-magenta/40 bg-magenta/5 p-3">
                  <p className="font-mono text-[11px] leading-relaxed text-zinc-300">
                    Serán <span className="text-magenta">{celdas.length} celdas</span> ={" "}
                    <span className="text-magenta">{celdas.length} llamadas</span> a
                    Google Places (searchText), en serie con pausa de 250 ms.
                  </p>
                  <button
                    onClick={ejecutarCenso}
                    disabled={ocupado}
                    className="mt-2 w-full rounded-md bg-magenta px-3 py-2 font-display text-xs font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Ejecutar censo ({celdas.length} llamadas)
                  </button>
                  <button
                    onClick={() => {
                      setCeldas(null);
                      reportar("idle", "Censo cancelado");
                    }}
                    disabled={ocupado}
                    className="mt-1.5 w-full rounded-md border border-linea bg-panel2 px-3 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {progresoCenso && (
                <div className="mt-3 rounded-md border border-linea bg-panel2 p-3">
                  <div className="flex justify-between font-mono text-[11px] text-zinc-400">
                    <span>
                      Celda {progresoCenso.actual} de {progresoCenso.total}
                    </span>
                    <span className="text-magenta">{progresoCenso.pois} POIs</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fondo">
                    <div
                      className="h-full rounded-full bg-magenta transition-all"
                      style={{
                        width: `${Math.round((progresoCenso.actual / progresoCenso.total) * 100)}%`,
                      }}
                    />
                  </div>
                  {ocupado && (
                    <button
                      onClick={() => (detenerCensoRef.current = true)}
                      className="mt-2 w-full rounded-md border border-magenta/50 bg-panel px-3 py-1.5 font-mono text-[11px] text-magenta transition-colors hover:bg-magenta/10"
                    >
                      Detener censo
                    </button>
                  )}
                </div>
              )}
            </section>
          ) : (
            <section className={pasoCls}>
              <label className={labelCls}>02 · Censo territorial (INEGI)</label>
              <CategoriaSelect value={terCategoria} onChange={setTerCategoria} />
              <input
                value={terLugarQuery}
                onChange={(e) => setTerLugarQuery(e.target.value)}
                placeholder="Punto o ciudad · p. ej. Guadalajara"
                className={`${inputCls} mt-2`}
              />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setTerAlcanceTipo("radio")}
                  className={`rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                    terAlcanceTipo === "radio"
                      ? "border-cian bg-cian/10 text-cian"
                      : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  Radio
                </button>
                <button
                  onClick={() => setTerAlcanceTipo("ciudad")}
                  className={`rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                    terAlcanceTipo === "ciudad"
                      ? "border-violeta bg-violeta/10 text-violeta"
                      : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  Ciudad completa
                </button>
              </div>

              {terAlcanceTipo === "radio" && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {RADIOS_TERRITORIAL.map((r) => (
                    <button
                      key={r.m}
                      onClick={() => setTerRadio(r.m)}
                      className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
                        terRadio === r.m
                          ? "border-cian bg-cian/10 text-cian"
                          : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}

              <span className="mb-1 mt-3 block font-mono text-[10px] text-zinc-600">
                Fuente de datos
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["denue", "DENUE", "border-[#ff8c42] bg-[#ff8c42]/10 text-[#ff8c42]"],
                    ["google", "Google", "border-magenta bg-magenta/10 text-magenta"],
                    ["ambas", "Ambas", "border-emerald-400 bg-emerald-400/10 text-emerald-400"],
                  ] as [Fuente, string, string][]
                ).map(([key, label, activo]) => (
                  <button
                    key={key}
                    onClick={() => setTerFuente(key)}
                    className={`rounded-md border px-2 py-1.5 font-mono text-[11px] transition-colors ${
                      terFuente === key
                        ? activo
                        : "border-linea bg-panel2 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-zinc-600">
                DENUE (INEGI) es gratis y cubre el canal tradicional. Con
                &quot;Ambas&quot; se cruzan fuentes con dedupe a &lt;75 m.
              </p>

              <button
                onClick={calcularTerritorial}
                disabled={ocupado}
                className="mt-4 w-full rounded-md border border-[#ff8c42] bg-[#ff8c42]/10 px-3 py-2 font-mono text-xs font-medium text-[#ff8c42] transition-colors hover:bg-[#ff8c42]/20 disabled:opacity-40"
              >
                Calcular consultas
              </button>

              {celdas && !progresoCenso && (
                <div className="mt-3 rounded-md border border-[#ff8c42]/40 bg-[#ff8c42]/5 p-3">
                  <p className="font-mono text-[11px] leading-relaxed text-zinc-300">
                    Serán{" "}
                    <span className="text-[#ff8c42]">
                      {celdas.length}{" "}
                      {celdas.length === 1 ? "consulta" : "consultas"}
                    </span>
                    {terFuente === "ambas" && (
                      <>
                        {" "}
                        × 2 fuentes ={" "}
                        <span className="text-[#ff8c42]">
                          {celdas.length * 2} llamadas
                        </span>
                      </>
                    )}
                    , en serie con pausa de 250 ms.
                  </p>
                  <button
                    onClick={ejecutarTerritorial}
                    disabled={ocupado}
                    className="mt-2 w-full rounded-md bg-[#ff8c42] px-3 py-2 font-display text-xs font-extrabold text-fondo transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Ejecutar censo territorial
                  </button>
                  <button
                    onClick={() => {
                      setCeldas(null);
                      reportar("idle", "Censo territorial cancelado");
                    }}
                    disabled={ocupado}
                    className="mt-1.5 w-full rounded-md border border-linea bg-panel2 px-3 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {progresoCenso && (
                <div className="mt-3 rounded-md border border-linea bg-panel2 p-3">
                  <div className="flex justify-between font-mono text-[11px] text-zinc-400">
                    <span>
                      Consulta {progresoCenso.actual} de {progresoCenso.total}
                    </span>
                    <span className="text-[#ff8c42]">
                      {progresoCenso.pois} establecimientos
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fondo">
                    <div
                      className="h-full rounded-full bg-[#ff8c42] transition-all"
                      style={{
                        width: `${Math.round((progresoCenso.actual / progresoCenso.total) * 100)}%`,
                      }}
                    />
                  </div>
                  {ocupado && (
                    <button
                      onClick={() => (detenerCensoRef.current = true)}
                      className="mt-2 w-full rounded-md border border-[#ff8c42]/50 bg-panel px-3 py-1.5 font-mono text-[11px] text-[#ff8c42] transition-colors hover:bg-[#ff8c42]/10"
                    >
                      Detener censo
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {/* capas de categoría: varias búsquedas sobre la misma
              geografía (solo zona y CP; el universo es del territorio) */}
          {(mode === "zone" || mode === "cp") && hayCapas && (
            <section className={pasoCls}>
              <label className={labelCls}>
                Capas de búsqueda · {capas.length}/{MAX_CAPAS}
              </label>
              {capas.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate font-mono text-[11px] ${c.visible ? "text-zinc-200" : "text-zinc-600 line-through"}`}
                  >
                    {c.nombre}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {c.pois.length.toLocaleString("es-MX")}
                  </span>
                  <button
                    onClick={() =>
                      setCapas((prev) =>
                        prev.map((x) =>
                          x.id === c.id ? { ...x, visible: !x.visible } : x
                        )
                      )
                    }
                    className="font-mono text-[11px] text-zinc-500 transition-colors hover:text-cian"
                    title={c.visible ? "Ocultar capa" : "Mostrar capa"}
                  >
                    {c.visible ? "●" : "○"}
                  </button>
                  <button
                    onClick={() =>
                      setCapas((prev) => prev.filter((x) => x.id !== c.id))
                    }
                    className="font-mono text-[12px] text-zinc-600 transition-colors hover:text-magenta"
                    title="Eliminar capa (no afecta a las demás ni a la geografía)"
                  >
                    ×
                  </button>
                </div>
              ))}
              {agregandoCapa ? (
                <div className="mt-2 rounded-md border border-emerald-400/60 bg-emerald-400/10 px-3 py-2.5">
                  <p className="font-mono text-[11px] leading-relaxed text-emerald-400">
                    Capa nueva ({capas.length + 1}/{MAX_CAPAS}): elige la
                    categoría o término en &quot;Qué buscar&quot; y presiona
                    Buscar. La geografía se mantiene.
                  </p>
                  <button
                    onClick={cancelarAgregarCapa}
                    className="mt-1.5 font-mono text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                capas.length < MAX_CAPAS && (
                  <button
                    onClick={iniciarAgregarCapa}
                    disabled={ocupado}
                    className="mt-2 w-full rounded-md border border-dashed border-linea bg-panel2 px-3 py-2 font-mono text-[11px] text-zinc-400 transition-colors hover:border-emerald-400 hover:text-emerald-400 disabled:opacity-40"
                  >
                    + Agregar otra búsqueda en esta zona
                  </button>
                )
              )}
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-600">
                El universo demográfico es del territorio y se comparte
                entre capas.
              </p>
            </section>
          )}

          {/* 03 · radio (solo orígenes: zona usa sus límites y el censo
              usa radio de celda + alcance del paso 02) */}
          {mode === "origins" && (
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
          )}

          {/* 04 · qué buscar (censo: solo exclusiones; territorial: nada,
              su categoría vive en el paso 02) */}
          {mode !== "territorial" && (
          <section
            ref={seccionBuscarRef}
            className={`${pasoCls} ${agregandoCapa ? "border-l-2 border-l-emerald-400 bg-emerald-400/5" : ""}`}
          >
            <label className={labelCls}>
              {mode === "census"
                ? "03 · Exclusiones"
                : mode === "zone"
                  ? "03 · Qué buscar"
                  : "04 · Qué buscar"}
              {agregandoCapa && (
                <span className="ml-2 normal-case tracking-normal text-emerald-400">
                  → capa nueva
                </span>
              )}
            </label>
            {mode !== "census" && (
            <>
            <CategoriaSelect
              value={categoria}
              onChange={setCategoria}
              incluirSoloNombre
            />

            <input
              value={nameFilterInput}
              onChange={(e) => setNameFilterInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  agregarFiltroNombre();
                }
              }}
              onBlur={agregarFiltroNombre}
              placeholder={
                nameFilters.length > 0
                  ? "Agrega otra marca · comas o Enter"
                  : "Filtro de nombre · p. ej. walmart, oxxo, chedraui"
              }
              className={`${inputCls} mt-3`}
            />
            {nameFilters.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {nameFilters.map((t) => {
                  const exacto = esTerminoExacto(t);
                  return (
                    <button
                      key={t}
                      onClick={() =>
                        setNameFilters(nameFilters.filter((x) => x !== t))
                      }
                      className={`group flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
                        exacto
                          ? "border-violeta/60 bg-violeta/10 text-violeta"
                          : "border-cian/50 bg-cian/10 text-cian"
                      }`}
                      title={
                        exacto
                          ? "Nombre exacto: debe EMPEZAR con el término · quitar"
                          : "Contiene todas las palabras · quitar"
                      }
                    >
                      {t}
                      <span
                        className={
                          exacto
                            ? "text-violeta/60 group-hover:text-violeta"
                            : "text-cian/60 group-hover:text-cian"
                        }
                      >
                        ×
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-1 font-mono text-[10px] text-zinc-600">
              Filtro estricto por término: sin acentos ni mayúsculas, todas
              sus palabras deben aparecer en el nombre. Con varios términos,
              un POI pasa si cumple CUALQUIERA (máx {MAX_CAPAS}). Usa{" "}
              <span className="text-zinc-400">&quot;comillas&quot;</span> para
              nombre exacto: el nombre debe EMPEZAR con el término.
            </p>
            {nameFilters.length >= 2 && (
              <label className="mt-2 flex cursor-pointer items-center gap-2 font-mono text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={separarEnCapas}
                  onChange={(e) => setSepararEnCapas(e.target.checked)}
                  className="accent-cian"
                />
                Separar en capas: cada término con su color y conteo en el
                mapa (ideal para comparar marcas)
              </label>
            )}
            </>
            )}

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
                placeholder="Excluir marcas · separa con comas y Enter"
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

            {/* aviso: hay un censo guardado que coincide con esta búsqueda */}
            {mode === "origins" && censoSugerido && !avisoDescartado && (
              <div className="mt-4 rounded-md border border-cian/40 bg-cian/5 p-3">
                <p className="font-mono text-[11px] leading-relaxed text-zinc-300">
                  Censo disponible:{" "}
                  <span className="text-cian">
                    {censoSugerido.marca_o_categoria}
                  </span>{" "}
                  · {censoSugerido.alcance_descripcion} ·{" "}
                  {new Date(censoSugerido.created_at).toLocaleDateString("es-MX")} ·{" "}
                  {censoSugerido.poi_count} puntos
                </p>
                {censoSugerido.fuente === "google" &&
                  frescuraCenso(censoSugerido.created_at) === "rojo" && (
                    <p className="mt-1 font-mono text-[10px] text-magenta">
                      Este censo tiene más de {DIAS_AMARILLO} días: se
                      recomienda actualizarlo primero.
                    </p>
                  )}
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button
                    onClick={usarCensoGuardado}
                    disabled={ocupado}
                    className="rounded-md border border-cian bg-cian/10 px-2 py-1.5 font-mono text-[11px] text-cian transition-colors hover:bg-cian/20 disabled:opacity-40"
                  >
                    Usar censo guardado
                  </button>
                  <button
                    onClick={() => setAvisoDescartado(true)}
                    className="rounded-md border border-linea bg-panel2 px-2 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    Buscar en vivo
                  </button>
                </div>
              </div>
            )}

            {mode !== "census" && (
            <button
              onClick={buscar}
              disabled={ocupado}
              className="mt-4 w-full rounded-md bg-magenta px-3 py-2.5 font-display text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {ocupado
                ? "Buscando…"
                : mode === "origins" && planOrigenes
                  ? `Continuar: buscar POIs (~${planOrigenes.consultas.toLocaleString("es-MX")} consultas)`
                  : "Buscar POIs"}
            </button>
            )}

            {/* guardarraíl de costo (orígenes grandes): confirmar o
                correr solo universos sin gastar una llamada a Google */}
            {mode === "origins" && planOrigenes && !ocupado && (
              <div className="mt-2 grid grid-cols-1 gap-1.5">
                <button
                  onClick={soloUniversosOrigenes}
                  className="rounded-md border border-violeta bg-violeta/10 px-3 py-2 text-left font-mono text-[11px] text-violeta transition-colors hover:bg-violeta/20"
                  title="Demografía de las zonas de tus PDVs, sin búsqueda de POIs — puro censo, cero llamadas a Google"
                >
                  Solo universos, sin búsqueda de POIs · 0 consultas
                </button>
                <button
                  onClick={() => {
                    setPlanOrigenes(null);
                    busquedaGrandeRef.current = null;
                    reportar("ok", "Búsqueda cancelada");
                  }}
                  className="rounded-md border border-linea bg-panel2 px-3 py-2 text-left font-mono text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  Cancelar
                </button>
              </div>
            )}
            {mode === "origins" &&
              centrosActivos.length > UMBRAL_ORIGENES_GRANDES &&
              !planOrigenes && (
                <button
                  onClick={soloUniversosOrigenes}
                  disabled={ocupado}
                  className="mt-2 w-full rounded-md border border-violeta bg-violeta/10 px-3 py-2 text-left font-mono text-[11px] text-violeta transition-colors hover:bg-violeta/20 disabled:opacity-40"
                  title="Demografía de las zonas de tus PDVs, sin búsqueda de POIs — puro censo, cero llamadas a Google"
                >
                  Solo universos, sin búsqueda de POIs · 0 consultas
                </button>
              )}

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
          )}

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
              <div>
                <p className="mb-1.5 font-mono text-[10px] leading-relaxed text-zinc-500">
                  Tácticas recomendadas para este plan (selecciona las que
                  destacarán en el PDF)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CLAVES_TACTICAS.map((clave) => {
                    const activa = tacticasSeleccionadas.includes(clave);
                    return (
                      <button
                        key={clave}
                        onClick={() => alternarTactica(clave)}
                        title={TACTICAS[clave].descriptor}
                        className={`rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors ${
                          activa
                            ? "border-magenta bg-magenta/10 text-magenta"
                            : "border-linea bg-panel2 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {activa ? "✓ " : ""}
                        {TACTICAS[clave].nombre}
                      </button>
                    );
                  })}
                </div>
              </div>
              <input
                value={tituloPlan}
                onChange={(e) => setTituloPlan(e.target.value)}
                placeholder={'Título del plan · p. ej. "Cafeterías Polanco — Cliente X"'}
                maxLength={90}
                className={inputCls}
                title="Título del PDF y del nombre de archivo; vacío = término + ciudad/CPs"
              />
              <button
                onClick={exportarPlan}
                disabled={
                  ocupado || (poisActivos.length === 0 && !universos?.disponible)
                }
                className="rounded-md border border-magenta bg-magenta/10 px-3 py-2 text-left font-mono text-[11px] font-medium text-magenta transition-colors hover:bg-magenta/20 disabled:opacity-30"
                title="PDF comercial con branding Gravity + CSV de datos, en un clic"
              >
                ⤓ Export plan (PDF){" "}
                <span className="text-magenta/60">+ Export data · Gravity_Plan_*.pdf</span>
              </button>
              <button
                onClick={() => exportarCsv(poisActivos, centrosActivos, universos)}
                disabled={poisActivos.length === 0}
                className="rounded-md border border-linea bg-panel2 px-3 py-2 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:border-cian hover:text-cian disabled:opacity-30"
              >
                ↓ CSV de POIs <span className="text-zinc-600">seeker_pois.csv</span>
              </button>
              <button
                onClick={() => exportarGeoJsonPuntos(poisActivos)}
                disabled={poisActivos.length === 0}
                className="rounded-md border border-linea bg-panel2 px-3 py-2 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:border-cian hover:text-cian disabled:opacity-30"
              >
                ↓ GeoJSON puntos{" "}
                <span className="text-zinc-600">seeker_pois_puntos.geojson</span>
              </button>
              <button
                onClick={() =>
                  exportarGeoJsonGeocercas(poisActivos, radioGeocerca, vertices, universos)
                }
                disabled={poisActivos.length === 0}
                className="rounded-md border border-linea bg-panel2 px-3 py-2 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:border-magenta hover:text-magenta disabled:opacity-30"
              >
                ↓ GeoJSON geocercas por POI{" "}
                <span className="text-zinc-600">seeker_geocercas_pois.geojson</span>
              </button>
              <button
                onClick={() =>
                  exportarGeoJsonRadiosOrigen(
                    centrosActivos,
                    mode === "census" ? alcance : radio,
                    vertices,
                    universos
                  )
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
        <main className="tarjeta flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div className="min-w-0">
              <h2 className="font-display text-base font-extrabold tracking-tight text-white">
                Mapa de resultados
              </h2>
              <p className="truncate font-mono text-[10px] text-zinc-500">
                orígenes en cian · zona en violeta · POIs en magenta · clic en
                una fila de la tabla para hacer zoom
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={toggleCapaDemografica}
                disabled={cargandoCapa}
                className={`rounded-full border px-3 py-1 font-mono text-[10px] transition-colors disabled:opacity-50 ${
                  capaDemografica
                    ? "border-violeta bg-violeta/15 text-violeta"
                    : "border-linea bg-panel2 text-zinc-400 hover:border-violeta hover:text-violeta"
                }`}
                title="Choropleth de AGEBs que intersectan tus geocercas (Censo 2020)"
              >
                {cargandoCapa ? "Cargando AGEBs…" : "◆ Capa demográfica"}
              </button>
              {mode === "cp" && cpsGeo.length > 0 && (
                <button
                  onClick={() => setEtiquetasCp((v) => !v)}
                  className={`rounded-full border px-3 py-1 font-mono text-[10px] transition-colors ${
                    etiquetasCp
                      ? "border-emerald-400 bg-emerald-400/15 text-emerald-400"
                      : "border-linea bg-panel2 text-zinc-400 hover:border-emerald-400 hover:text-emerald-400"
                  }`}
                  title="Mostrar u ocultar la etiqueta fija de cada CP (con muchos CPs se enciman)"
                >
                  {etiquetasCp ? "◈ Ocultar etiquetas" : "◈ Mostrar etiquetas"}
                </button>
              )}
              {(mode === "census" || mode === "territorial") && (
                <select
                  value={radioInfluencia}
                  onChange={(e) => cambiarRadioInfluencia(Number(e.target.value))}
                  className="rounded-full border border-linea bg-panel2 px-2.5 py-1 font-mono text-[10px] text-zinc-400 focus:border-violeta focus:outline-none"
                  title="Área de influencia alrededor de cada punto censado para el universo demográfico"
                >
                  {[300, 500, 1000, 2000].map((m) => (
                    <option key={m} value={m}>
                      Influencia {m >= 1000 ? `${m / 1000} km` : `${m} m`}
                    </option>
                  ))}
                </select>
              )}
              {fechaCensoUsado && (
                <span className="rounded-full border border-zinc-500/40 bg-zinc-500/10 px-3 py-1 font-mono text-[10px] text-[#9ca3af]">
                  censo del{" "}
                  {new Date(fechaCensoUsado).toLocaleDateString("es-MX")}
                </span>
              )}
              {estratosDisponibles.length > 0 && (
                <select
                  value={estratoFiltro}
                  onChange={(e) => setEstratoFiltro(e.target.value)}
                  className="rounded-full border border-linea bg-panel2 px-2.5 py-1 font-mono text-[10px] text-zinc-400 focus:border-cian focus:outline-none"
                  title="Filtrar por estrato de empleados (DENUE)"
                >
                  <option value="">Todos los estratos</option>
                  {estratosDisponibles.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              )}
              <span className="rounded-full border border-linea bg-panel2 px-3 py-1 font-mono text-[10px] text-zinc-400">
                {chipMapa}
              </span>
            </div>
          </div>

          {/* universos demográficos — siempre visibles junto a los resultados */}
          <UniversosPanel universos={universos} notaTerritorio={capas.length > 1} />

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <MapView
              mode={mode}
              origenes={origenes}
              zona={mode === "territorial" ? terCentro : zona}
              zonas={zonas}
              radio={
                mode === "census"
                  ? alcance
                  : mode === "territorial"
                    ? terAlcanceTipo === "radio"
                      ? terRadio
                      : 0
                    : radio
              }
              pois={poisActivos}
              foco={foco}
              celdas={
                mode === "census" || mode === "territorial"
                  ? (celdas ?? undefined)
                  : undefined
              }
              radioCelda={
                mode === "territorial"
                  ? celdas && celdas.length === 1 && terAlcanceTipo === "radio"
                    ? Math.min(terRadio, 5000)
                    : TER_RADIO_CELDA
                  : radioCelda
              }
              agebs={capaDemografica ? agebsGeo : null}
              cps={mode === "cp" ? cpsGeo : undefined}
              etiquetasCp={etiquetasCp}
              poblacionCp={poblacionPorCp}
              colorPorCapa={colorPorCapa}
            />
            {/* overlay de progreso para procesos largos (mapa atenuado;
                la tabla de resultados queda encima, z-1000) */}
            <OverlayProgreso proceso={proceso} />
            {/* leyenda de capas sobre el mapa (clic = mostrar/ocultar) */}
            {capas.length > 1 && (
              <div className="absolute bottom-3 left-3 z-[1000] flex flex-col gap-1 rounded-md border border-linea bg-fondo/90 px-2.5 py-2">
                {capas.map((c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      setCapas((prev) =>
                        prev.map((x) =>
                          x.id === c.id ? { ...x, visible: !x.visible } : x
                        )
                      )
                    }
                    className={`flex items-center gap-1.5 font-mono text-[10px] transition-opacity ${c.visible ? "text-zinc-300" : "text-zinc-600 opacity-60"}`}
                    title={c.visible ? "Ocultar capa" : "Mostrar capa"}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.nombre}
                    <span className="text-zinc-600">
                      {c.pois.length.toLocaleString("es-MX")}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <ResultsTable
              pois={poisActivos}
              origenes={centrosActivos}
              poblacionPorOrigen={poblacionPorOrigen}
              colapsada={tablaColapsada}
              onToggle={() => setTablaColapsada(!tablaColapsada)}
              onSeleccionar={(p) => setFoco(p)}
              seleccionado={foco}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
