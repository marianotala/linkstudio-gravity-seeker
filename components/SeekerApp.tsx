"use client";

// Página principal de Seeker: header con estatus animado, panel lateral
// de 360px con los pasos, mapa y tabla de resultados. Toda la key de
// Google vive en el servidor; aquí solo se llama a /api/*.

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import AppHeader, { type StatusTipo } from "./AppHeader";
import ResultsTable from "./ResultsTable";
import { CATEGORIAS, getCategoria, SOLO_NOMBRE } from "@/lib/categories";
import {
  esMismoEstablecimiento,
  generarCuadricula,
  haversine,
  normalizarComparable,
} from "@/lib/geo";
import { createClient } from "@/lib/supabase/client";
import { DIAS_AMARILLO, frescuraCenso } from "@/lib/censos";
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
  Censo,
  CensoPoi,
  DeltaCenso,
  DenuePoi,
  Fuente,
  GeocodeResponse,
  LatLng,
  Origin,
  PerfilUsuario,
  Poi,
  ResultadoGuardado,
  SearchMode,
  SearchRequest,
  SearchResponse,
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
  const [nameFilter, setNameFilter] = useState("");
  const [excludes, setExcludes] = useState<string[]>([]);
  const [excludeInput, setExcludeInput] = useState("");

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

  // ---- configuración de exports
  const [radioGeocerca, setRadioGeocerca] = useState(50);
  const [vertices, setVertices] = useState(12);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const centrosActivos = useMemo<Origin[]>(
    () =>
      mode === "origins"
        ? origenes
        : mode === "zone"
          ? zonas
          : mode === "territorial"
            ? terCentro
              ? [terCentro]
              : []
            : zona
              ? [zona]
              : [],
    [mode, origenes, zonas, zona, terCentro]
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
      setNameFilter(p.nameFilter ?? "");
      setExcludes(p.excludes ?? []);
      if (p.mode === "origins") {
        setOrigenes(p.centers);
        setTab("coordenadas");
      } else if (p.mode === "zone") {
        setZonas(p.centers);
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
    const objetivo =
      categoria === SOLO_NOMBRE
        ? nameFilter.trim()
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
  }, [mode, origenes.length, categoria, nameFilter]);

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

  // ---- nueva búsqueda: limpia todo y regresa al estado inicial
  function nuevaBusqueda() {
    detenerCensoRef.current = true;
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
    setNameFilter("");
    setExcludes([]);
    setExcludeInput("");
    setMarca("");
    setCiudadQuery("");
    setCeldas(null);
    setProgresoCenso(null);
    setTerLugarQuery("");
    setTerCentro(null);
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
    setFoco(null);
    setTablaColapsada(false);
    reportar("idle", "Listo para buscar");
  }

  // ---- guardar un censo en la biblioteca y calcular delta si es actualización
  async function guardarCensoEnBiblioteca(args: {
    tipo: "marca" | "territorial";
    marcaOCategoria: string;
    alcanceDescripcion: string;
    fuente: Fuente;
    params: Record<string, unknown>;
    lista: Poi[];
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

    // Guardar el censo completo en la biblioteca de censos.
    let guardado = false;
    let delta: DeltaCenso | null = null;
    if (lista.length > 0 || celdasCorridas > 0) {
      const r = await guardarCensoEnBiblioteca({
        tipo: "marca",
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
    setContadores({ excluidos: 0, descartadosPorNombre: 0 });
    setTablaColapsada(false);

    let guardado = false;
    let delta: DeltaCenso | null = null;
    if (lista.length > 0 || celdasCorridas > 0) {
      const lugarCorto = (terCentro.nombre ?? terLugarQuery).split(",")[0];
      const r = await guardarCensoEnBiblioteca({
        tipo: "territorial",
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
  }

  // ---- paso 4: buscar POIs
  async function buscar() {
    if (centrosActivos.length === 0) {
      reportar(
        "error",
        mode === "origins"
          ? "Primero procesa tus orígenes (paso 02)"
          : "Primero agrega al menos una zona (paso 02)"
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
        : `Buscando POIs en ${centrosActivos.length} ${centrosActivos.length === 1 ? "zona" : "zonas"}…`
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
      setDetalles({
        excluidos: data.detalleExcluidos ?? [],
        descartados: data.detalleDescartados ?? [],
      });
      setVerLista(null);
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

  // ---- estilos compartidos
  const inputCls =
    "w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cian focus:outline-none";
  const labelCls =
    "mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500";
  const pasoCls = "border-b border-linea px-5 py-4";

  // ---- datos derivados para la barra de resumen y los KPIs
  const etiquetaCategoria =
    categoria === SOLO_NOMBRE
      ? nameFilter.trim()
        ? `Nombre: "${nameFilter.trim()}"`
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
                : mode === "census"
                  ? "Censo de marca"
                  : "Censo territorial"
          }
          color={
            mode === "origins"
              ? "text-cian"
              : mode === "zone"
                ? "text-violeta"
                : mode === "census"
                  ? "text-magenta"
                  : "text-[#ff8c42]"
          }
        />
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
        {mode !== "zone" && mode !== "territorial" && (
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
          valor={String(poisVisibles.length)}
          caption={
            mode === "census"
              ? progresoCenso
                ? `censo: celda ${progresoCenso.actual} de ${progresoCenso.total}`
                : "censo de marca por cuadrícula"
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
              <select
                value={terCategoria}
                onChange={(e) => setTerCategoria(e.target.value)}
                className={inputCls}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
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
          <section className={pasoCls}>
            <label className={labelCls}>
              {mode === "census"
                ? "03 · Exclusiones"
                : mode === "zone"
                  ? "03 · Qué buscar"
                  : "04 · Qué buscar"}
            </label>
            {mode !== "census" && (
            <>
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
              {ocupado ? "Buscando…" : "Buscar POIs"}
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
              <button
                onClick={() => exportarCsv(poisVisibles, centrosActivos)}
                disabled={poisVisibles.length === 0}
                className="rounded-md border border-linea bg-panel2 px-3 py-2 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:border-cian hover:text-cian disabled:opacity-30"
              >
                ↓ CSV de POIs <span className="text-zinc-600">seeker_pois.csv</span>
              </button>
              <button
                onClick={() => exportarGeoJsonPuntos(poisVisibles)}
                disabled={poisVisibles.length === 0}
                className="rounded-md border border-linea bg-panel2 px-3 py-2 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:border-cian hover:text-cian disabled:opacity-30"
              >
                ↓ GeoJSON puntos{" "}
                <span className="text-zinc-600">seeker_pois_puntos.geojson</span>
              </button>
              <button
                onClick={() => exportarGeoJsonGeocercas(poisVisibles, radioGeocerca, vertices)}
                disabled={poisVisibles.length === 0}
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
                    vertices
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
              pois={poisVisibles}
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
            />
            <ResultsTable
              pois={poisVisibles}
              origenes={centrosActivos}
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
