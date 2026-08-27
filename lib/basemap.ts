// Proveedor de tiles del mapa — UN solo lugar para TODAS las vistas.
// - Con NEXT_PUBLIC_CARTO_API_KEY: CARTO dark_all (?key= según la
//   documentación de CartoDB/basemap-styles).
// - Sin key, o si los tiles de CARTO fallan en runtime (key inválida
//   regresa placeholders CLAROS de "API KEY REQUIRED"): OpenStreetMap
//   estándar oscurecido con CSS (.tiles-osm-oscuro en globals.css),
//   para que el mapa NUNCA quede claro ni rehén de una API key.

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
      url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
      className: "",
    }
  : TILES_OSM_OSCURO;

export const USA_CARTO = Boolean(CARTO_KEY);
