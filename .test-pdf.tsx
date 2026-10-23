import { renderToBuffer } from "@react-pdf/renderer";
import fs from "fs";
import { registrarFuentes } from "@/lib/plan-pdf";
import { documentoPlanProyecto } from "@/lib/proyecto-pdf";
import type { Universos } from "@/lib/types";

const uni = {
  disponible: true,
  fuente: "Censo 2020 INEGI",
  criterio: "unión deduplicada de 2 levantamientos",
  agebs: 320,
  residencial: { poblacion: 512000, adultos18: 380000, viviendas: 140000 },
  perfil: {
    nseProxy: 54,
    nseDist: { ab: 12, c_mas: 18, c: 24, c_menos: 20, d_mas: 16, de: 10 },
    pct18a24: 14,
    pct60ymas: 12,
  },
} as unknown as Universos;

const poi = (i: number) => ({
  placeId: `p${i}`,
  nombre: `Suburbia ${i}`,
  direccion: `Av. Siempre Viva ${i}, Guadalajara`,
  lat: 20.67 + i * 0.01,
  lng: -103.35,
  distancia: 120,
  fuente: "google",
  cp: "44100",
});

(async () => {
  registrarFuentes(`${process.cwd()}/public`);
  const datos = {
    cliente: "Suburbia",
    titulo: "Plan de prueba V2",
    usuario: "Seeker",
    fecha: new Date("2026-10-23"),
    consolidado: uni,
    sumaSimple: 420000,
    nLevantamientos: 2,
    capas: [
      {
        id: "a",
        nombre: "Tiendas Suburbia",
        rol: "poi_propio",
        color: "#27b5e2",
        pois: Array.from({ length: 8 }, (_, i) => poi(i)),
        universo: uni,
      },
    ],
    ooh: null,
    traslapes: [],
    mapaDataUrl: null,
    tacticas: ["poi", "targeting"],
    fuentes: ["Google Places API (New) — establecimientos"],
    universoRol: {},
    mapasRol: {},
    detallePuntos: {},
    geoTargeting: { cps: 485, keywords: 300 },
    geoSeccion: null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = await renderToBuffer(documentoPlanProyecto(datos as any) as any);
  fs.writeFileSync(".test-salida.pdf", buf);
  const cabecera = buf.subarray(0, 5).toString();
  console.log("PDF:", cabecera, "·", (buf.length / 1024).toFixed(0), "KB");
  if (cabecera !== "%PDF-") process.exit(1);
  console.log("TODO OK");
})().catch((e) => {
  console.error("FALLA:", e instanceof Error ? e.message : e);
  process.exit(1);
});
