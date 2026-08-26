declare module "shpjs" {
  // v6: parseShp/parseDbf/combine son exports NOMBRADOS; el default es
  // getShapefile. parseShp recibe un conversor de proj4 (usa .inverse
  // para reproyectar a WGS84), no el string del .prj.
  export function parseShp(buffer: ArrayBuffer, trans?: unknown): unknown[];
  export function parseDbf(
    buffer: ArrayBuffer,
    encoding?: string
  ): Record<string, unknown>[];
  export function combine(
    partes: [unknown[], Record<string, unknown>[]]
  ): GeoJSON.FeatureCollection;
  export function parseZip(buffer: ArrayBuffer): Promise<GeoJSON.FeatureCollection>;
  const getShapefile: (buffer: ArrayBuffer) => Promise<GeoJSON.FeatureCollection>;
  export default getShapefile;
}

declare module "proj4" {
  interface Proj4Converter {
    forward(coords: [number, number]): [number, number];
    inverse(coords: [number, number]): [number, number];
  }
  function proj4(fromProjection: string, toProjection?: string): Proj4Converter;
  export default proj4;
}
