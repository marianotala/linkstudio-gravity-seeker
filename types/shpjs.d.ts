declare module "shpjs" {
  const shp: {
    parseShp(buffer: ArrayBuffer, prj?: string): unknown[];
    parseDbf(buffer: ArrayBuffer, cpg?: ArrayBuffer): Record<string, unknown>[];
    combine(
      partes: [unknown[], Record<string, unknown>[]]
    ): GeoJSON.FeatureCollection;
    (buffer: ArrayBuffer): Promise<GeoJSON.FeatureCollection>;
  };
  export = shp;
}
