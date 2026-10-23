// Proveedor de tiles del mapa de RESPALDO (Leaflet) — UN solo lugar
// para todas las vistas. TEMA CLARO (brand V2):
// - Con NEXT_PUBLIC_CARTO_API_KEY: CARTO light_all (estilo claro
//   neutro que deja protagonizar markers y polígonos).
// - Sin key, o si los tiles de CARTO fallan en runtime: OpenStreetMap
//   estándar desaturado con CSS (.tiles-osm-oscuro — nombre legado,
//   hoy solo baja saturación), para que el mapa NUNCA quede rehén de
//   una API key. El mapa PRINCIPAL es Google Maps (lib/gmaps.ts);
//   Leaflet queda como fallback si Google no carga.

export interface TilesConfig {
  url: string;
  attribution: string;
  subdomains: string;
  maxZoom: number;
  className: string;
}

const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY;

export const TILES_OSM_OSCURO: TilesConfig = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  subdomains: "",
  maxZoom: 19,
  className: "tiles-osm-oscuro",
};

export const TILES: TilesConfig = CARTO_KEY
  ? {
      url: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
      className: "",
    }
  : TILES_OSM_OSCURO;

export const USA_CARTO = Boolean(CARTO_KEY);
