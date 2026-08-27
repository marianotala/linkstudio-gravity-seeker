// Tipos compartidos entre cliente y servidor.

export type SearchMode = "origins" | "zone" | "census" | "territorial";

/** Fuente de un POI: Google Places, DENUE (INEGI) o ambas (match cruzado). */
export type Fuente = "google" | "denue" | "ambas";

/** Metadata del censo de marca (modo "census"). */
export interface CensoInfo {
  ciudad: string;
  tipo: "hex" | "square";
  radioCelda: number;
  alcance: number;
  celdas: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Rectángulo geográfico (viewport de Google Geocoding). */
export interface Viewport {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Un origen (PDV), una zona o el centro del censo. */
export interface Origin extends LatLng {
  nombre?: string;
  direccion?: string;
  /** Solo zonas: límites reales de la zona; la búsqueda se restringe a ellos. */
  viewport?: Viewport;
}

/** Un punto de interés ya procesado por el servidor. */
export interface Poi {
  /** place_id de Google o "d:{Id}" de DENUE. */
  placeId: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
  types: string[];
  /** Distancia en metros al centro más cercano. */
  distancia: number;
  /** Índice del centro más cercano dentro de centers[]. */
  origenIdx: number;
  /** Fuente del dato. Obligatorio en todo el sistema. */
  fuente: Fuente;
  /** Solo DENUE: estrato de personal ocupado (p. ej. "0 a 5 personas"). */
  estrato?: string | null;
  /** Solo DENUE: razón social y clase de actividad SCIAN. */
  razonSocial?: string | null;
  actividad?: string | null;
}

/** Establecimiento crudo que regresa /api/denue. */
export interface DenuePoi {
  placeId: string; // "d:{Id}"
  nombre: string;
  razonSocial: string;
  actividad: string;
  estrato: string;
  direccion: string;
  lat: number;
  lng: number;
}

/** Fila de public.censuses (biblioteca de censos). */
export interface Censo {
  id: string;
  user_id: string;
  created_at: string;
  tipo: "marca" | "territorial";
  marca_o_categoria: string;
  alcance_descripcion: string;
  fuente: Fuente;
  poi_count: number;
  params: Record<string, unknown>;
  universos?: Universos | null;
  /** Embebido vía FK cuando se consulta con join a profiles. */
  profiles?: { email: string; nombre: string | null } | null;
}

/** Fila de public.census_pois. */
export interface CensoPoi {
  id: string;
  census_id: string;
  place_key: string;
  fuente: Fuente;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  estrato: string | null;
  extra: Record<string, unknown> | null;
}

/** Resumen del delta al re-correr un censo. */
export interface DeltaCenso {
  nuevos: number;
  perdidos: number;
  sinCambio: number;
}

// ------------------------------------------------------------------
// Universos demográficos (Censo 2020 INEGI, AGEB urbana)
// ------------------------------------------------------------------

/** Geocerca para calcular universos: círculo o rectángulo (viewport). */
export interface GeocercaUniverso {
  id: string;
  lat?: number;
  lng?: number;
  radio_m?: number;
  viewport?: Viewport;
}

export interface UniversoPorGeocerca {
  id: string;
  poblacion: number;
  adultos18: number;
  nse_proxy: number | null;
}

/** AGEB para el choropleth de la capa demográfica. */
export interface AgebGeo {
  cvegeo: string;
  pobtot: number | null;
  nse_proxy: number | null;
  geometria: Record<string, unknown>; // GeoJSON geometry
}

export interface Universos {
  disponible: boolean;
  /** Cuando disponible=false: explicación en español. */
  mensaje?: string;
  /** Etiqueta de fuente y método — siempre presente cuando disponible. */
  fuente?: string;
  /** Criterio de área usado, p. ej. "población a 500 m de los puntos censados". */
  criterio?: string;
  agebs?: number;
  residencial?: {
    poblacion: number;
    adultos18: number;
    viviendas: number;
    /** Población por sexo (interpolada); null si la entidad se cargó sin estas variables. */
    pobfem?: number | null;
    pobmas?: number | null;
  };
  /** Estimado: 18+ × factor smartphone × factor match. */
  direccionable?: {
    dispositivos: number;
    factorSmartphone: number;
    factorMatch: number;
  };
  perfil?: {
    /** Índice socioeconómico aproximado (proxy censal), 0-100. NO es NSE AMAI. */
    nseProxy: number | null;
    pct18a24: number | null;
    pct60ymas: number | null;
    /**
     * Rangos de edad como % del universo 18+. INEGI no publica cortes
     * adultos 25-34/35-44/45-54/55-64 a nivel AGEB: los rangos reales
     * son 18-24, 25-59 (derivado), 60-64 y 65+ (con POB65_MAS);
     * pct60ymas es el respaldo cuando la entidad no trae POB65_MAS.
     */
    edades?: {
      pct18a24: number;
      pct25a59: number;
      pct60a64: number | null;
      pct65ymas: number | null;
      pct60ymas: number;
    } | null;
    /** Distribución % por nivel tipo NSE (proxy censal, NO AMAI), ponderada por población. Cortes en lib/nse.ts. */
    nseDist?: {
      ab: number;
      c_mas: number;
      c: number;
      c_menos: number;
      d_mas: number;
      de: number;
    } | null;
  };
  porGeocerca?: UniversoPorGeocerca[];
  /** Detalle por AGEB (población interpolada dentro de la zona, máx 300). */
  porAgeb?: { cvegeo: string; poblacion: number; nse_proxy: number | null }[];
  /** Solo cuando se pide la capa demográfica. */
  agebsGeo?: AgebGeo[];
}

export interface SearchRequest {
  mode: SearchMode;
  centers: Origin[];
  radius: number;
  /** Key de categoría de lib/categories.ts, o "solo_nombre". */
  category: string;
  nameFilter: string;
  excludes: string[];
  /**
   * Si guardar la búsqueda en el historial. Default: true, excepto en
   * modo census (las celdas individuales no se guardan; el censo
   * completo se guarda al final vía POST /api/searches).
   */
  persist?: boolean;
  /** Solo en búsquedas census guardadas: metadata de la cuadrícula. */
  censo?: CensoInfo;
}

export interface SearchResponse {
  pois: Poi[];
  /** POIs eliminados por exclusiones de marca. */
  excluidos: number;
  /** POIs eliminados por el filtro estricto de nombre. */
  descartadosPorNombre: number;
  /** Nombres de los eliminados, para inspección en la UI (máx 300 c/u). */
  detalleExcluidos: string[];
  detalleDescartados: string[];
  /** Universos demográficos sobre las geocercas de la búsqueda. */
  universos?: Universos;
  /** id de la búsqueda guardada en el historial (null si falló el guardado). */
  searchId: string | null;
}

export interface PerfilUsuario {
  id: string;
  email: string;
  nombre: string | null;
  rol: "admin" | "vendedor";
}

/** Fila de public.searches tal como la lee el historial. */
export interface BusquedaGuardada {
  id: string;
  user_id: string;
  created_at: string;
  mode: SearchMode;
  params: SearchRequest;
  result_count: number;
  /** Embebido vía FK (para que un admin vea las del equipo). */
  profiles?: { email: string; nombre: string | null } | null;
}

/** Fila de public.search_results. */
export interface ResultadoGuardado {
  id: string;
  search_id: string;
  name: string;
  category: string | null;
  lat: number;
  lng: number;
  address: string | null;
  origin_name: string | null;
  distance_m: number | null;
  place_id: string | null;
}

export interface GeocodeRequest {
  direcciones: string[];
}

/** Resultado de geocodificación alineado por índice con la dirección enviada. */
export interface GeocodeResult {
  ok: boolean;
  lat?: number;
  lng?: number;
  formatted?: string;
  /** Límites de la zona/ciudad geocodificada (para búsqueda por zona). */
  viewport?: Viewport;
  error?: string;
}

export interface GeocodeResponse {
  resultados: GeocodeResult[];
}

export interface ApiError {
  error: string;
}
