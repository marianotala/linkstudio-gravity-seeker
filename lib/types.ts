// Tipos compartidos entre cliente y servidor.

export type SearchMode = "origins" | "zone";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Un origen (PDV) o el centro de la zona. */
export interface Origin extends LatLng {
  nombre?: string;
  direccion?: string;
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
}

export interface SearchResponse {
  pois: Poi[];
  /** POIs eliminados por exclusiones de marca. */
  excluidos: number;
  /** POIs eliminados por el filtro estricto de nombre. */
  descartadosPorNombre: number;
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
  error?: string;
}

export interface GeocodeResponse {
  resultados: GeocodeResult[];
}

export interface ApiError {
  error: string;
}
