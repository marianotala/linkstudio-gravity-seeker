// Tipos compartidos entre cliente y servidor.

export type SearchMode = "origins" | "zone" | "census" | "territorial" | "cp";

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
  /** Solo modo CP: código postal (polígono) que contiene al POI. */
  cp?: string | null;
  /** Capa de categoría a la que pertenece (multi-búsqueda en la misma
   * geografía); null/ausente en búsquedas de una sola capa. */
  capa?: string | null;
  /** Término del filtro de nombre múltiple que capturó este POI
   * (columna "término/marca" en resultados y exports). */
  termino?: string | null;
  /** Con categorías múltiples: etiqueta de la categoría (curada o
   * libre) cuya pasada capturó este POI. */
  categoria?: string | null;
}

/** Una búsqueda de POIs acumulada sobre la geografía activa (capa de
 * categoría). Vive en la sesión; el Planner la heredará como survey. */
export interface CapaBusqueda {
  id: string;
  /** Término/categoría buscada (nombre visible de la capa). */
  nombre: string;
  color: string;
  pois: Poi[];
  visible: boolean;
  excluidos: number;
  descartadosPorNombre: number;
}

/** Polígono de código postal, tal como lo regresa /api/cps. */
export interface CpPoligono {
  codigo_postal: string;
  entidad: string;
  bbox: Viewport;
  /** GeoJSON geometry (MultiPolygon), para dibujar en el mapa. */
  geometria: Record<string, unknown> | null;
  /** Del catálogo de Correos (cp_colonias); null si no está cargado. */
  colonias?: string[] | null;
  total_colonias?: number | null;
  municipio?: string | null;
  estado?: string | null;
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

/** Geocerca para calcular universos: círculo, rectángulo (viewport)
 * o polígono real de código postal ({cp: "11560"}). */
export interface GeocercaUniverso {
  id: string;
  lat?: number;
  lng?: number;
  radio_m?: number;
  viewport?: Viewport;
  cp?: string;
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
  /** Localidades rurales (ITER 2020) sumadas dentro de la geometría. */
  rurales?: number;
  residencial?: {
    poblacion: number;
    adultos18: number;
    viviendas: number;
    /** Población por sexo (interpolada); null si la entidad se cargó sin estas variables. */
    pobfem?: number | null;
    pobmas?: number | null;
    /** Componente rural (ITER 2020, localidades <2,500 hab) ya incluido
     * en poblacion/adultos18; la parte urbana es la resta. */
    pobRural?: number;
    adultos18Rural?: number;
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
  /** Compatibilidad: términos unidos por coma (se guarda en historial). */
  nameFilter: string;
  /** Filtro de nombre MÚLTIPLE: OR entre términos, filtro estricto
   * dentro de cada término. Si viene, manda sobre nameFilter. */
  nameFilters?: string[];
  /** Búsqueda LIBRE (category === CATEGORIA_LIBRE): el texto exacto
   * que corre como query en Google y palabra clave en DENUE. */
  freeQuery?: string;
  /** Categorías MÚLTIPLES (OR): keys curadas y/o "libre:<texto>". Si
   * viene, manda sobre category/freeQuery (que quedan de compat). */
  categories?: string[];
  excludes: string[];
  /**
   * Si guardar la búsqueda en el historial. Default: true, excepto en
   * modo census (las celdas individuales no se guardan; el censo
   * completo se guarda al final vía POST /api/searches).
   */
  persist?: boolean;
  /** Solo en búsquedas census guardadas: metadata de la cuadrícula. */
  censo?: CensoInfo;
  /** Solo modo cp: códigos postales de 5 dígitos (centers va vacío). */
  cps?: string[];
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

// ------------------------------------------------------------------
// OOH — inventario de pantallas y cruce pantalla ↔ PDV (Geo-PDOOH)
// ------------------------------------------------------------------

export type TipoPantalla =
  | "espectacular"
  | "muro_digital"
  | "mall"
  | "urbano"
  | "aeropuerto"
  | "transporte"
  | "otro";

/** Fila de public.screens (inventario de pantallas de la agencia). */
export interface Pantalla {
  clave: string;
  nombre: string | null;
  tipo: TipoPantalla;
  /** Vendor / propietario de la pantalla. */
  medio: string | null;
  ciudad: string | null;
  /** true digital, false estática, null sin dato. */
  digital: boolean | null;
  /** Impresiones mensuales (opcional en el inventario). */
  impresiones: number | null;
  costo: number | null;
  direccion: string | null;
  /** Nombre del lote de carga (listar/borrar en Admin). */
  lote: string;
  lat: number;
  lng: number;
}

/** Un renglón del cruce: la pantalla y los PDVs que apoya (índices en
 * la lista de PDVs del cliente + distancia en metros). */
export interface CrucePantalla {
  pantalla: Pantalla;
  radioM: number;
  pdvs: { idx: number; distancia: number }[];
}

/** Renglón de screens_resumen() para Admin. */
export interface ResumenLotePantallas {
  lote: string;
  total: number;
  digitales: number;
  impresiones: number;
  ciudades: number;
  tipos: Record<string, number>;
  cargado: string;
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
