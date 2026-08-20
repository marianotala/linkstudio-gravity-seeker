// Tipos compartidos entre cliente y servidor.

export type SearchMode = "origins" | "zone" | "census";

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
  created_at: string;
  mode: SearchMode;
  params: SearchRequest;
  result_count: number;
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
