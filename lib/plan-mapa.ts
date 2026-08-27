// Captura estática del mapa para el Export plan, generada EN EL
// NAVEGADOR sin tocar Leaflet: se calculan los tiles de OSM que cubren
// el análisis, se dibujan en un canvas con el mismo filtro oscuro de
// la app (.tiles-osm-oscuro) y encima van los overlays (polígonos de
// CP, radios de origen, POIs). Sin APIs de mapas estáticos ni keys.

import type { CpPoligono, Origin, Poi } from "./types";

const MAGENTA = "#f4368a";
const VIOLETA = "#9d5cf0";
const CIAN = "#2fb9e8";
const NARANJA = "#ff8c42";

const ANCHO = 1440;
const ALTO = 810;
const TILE = 256;

interface OpcionesMapa {
  pois: Poi[];
  /** Círculos de origen (modo orígenes/censo) con su radio en metros. */
  origenes?: Origin[];
  radioM?: number;
  /** Polígonos de CP (modo cp). */
  cps?: CpPoligono[];
  /** Rectángulos de zona (modo zona). */
  zonas?: Origin[];
}

const lngAX = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z;
const latAY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};

function cargarTile(z: number, x: number, y: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  });
}

/** Oscurecimiento por píxel (respaldo si ctx.filter no existe: Safari). */
function oscurecerPixeles(ctx: CanvasRenderingContext2D) {
  const data = ctx.getImageData(0, 0, ANCHO, ALTO);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    // invert + desaturar + bajar brillo (aproxima el filtro CSS)
    const r = 255 - px[i];
    const g = 255 - px[i + 1];
    const b = 255 - px[i + 2];
    const gris = 0.299 * r + 0.587 * g + 0.114 * b;
    const s = 0.28;
    px[i] = (gris + (r - gris) * s) * 0.68;
    px[i + 1] = (gris + (g - gris) * s) * 0.68;
    px[i + 2] = (gris + (b - gris) * s) * 0.68;
  }
  ctx.putImageData(data, 0, 0);
}

/**
 * Genera un dataURL (JPEG) del mapa del análisis, o null si algo
 * falla (tiles bloqueados, canvas contaminado…): el PDF simplemente
 * omite la página de mapa.
 */
export async function capturarMapaPlan(o: OpcionesMapa): Promise<string | null> {
  try {
    // 1) bounds del análisis
    const lats: number[] = [];
    const lngs: number[] = [];
    o.pois.forEach((p) => {
      lats.push(p.lat);
      lngs.push(p.lng);
    });
    (o.origenes ?? []).forEach((c) => {
      lats.push(c.lat);
      lngs.push(c.lng);
    });
    (o.zonas ?? []).forEach((z) => {
      if (z.viewport) {
        lats.push(z.viewport.north, z.viewport.south);
        lngs.push(z.viewport.east, z.viewport.west);
      }
    });
    (o.cps ?? []).forEach((c) => {
      lats.push(c.bbox.north, c.bbox.south);
      lngs.push(c.bbox.east, c.bbox.west);
    });
    if (lats.length === 0) return null;
    const pad = 0.08;
    const dLat = Math.max(0.01, (Math.max(...lats) - Math.min(...lats)) * pad);
    const dLng = Math.max(0.01, (Math.max(...lngs) - Math.min(...lngs)) * pad);
    const norte = Math.max(...lats) + dLat;
    const sur = Math.min(...lats) - dLat;
    const este = Math.max(...lngs) + dLng;
    const oeste = Math.min(...lngs) - dLng;

    // 2) zoom que ajusta los bounds al canvas (máx 16)
    let z = 16;
    for (; z > 3; z--) {
      const w = (lngAX(este, z) - lngAX(oeste, z)) * TILE;
      const h = (latAY(sur, z) - latAY(norte, z)) * TILE;
      if (w <= ANCHO && h <= ALTO) break;
    }
    const cx = (lngAX(oeste, z) + lngAX(este, z)) / 2;
    const cy = (latAY(norte, z) + latAY(sur, z)) / 2;
    const x0 = cx - ANCHO / 2 / TILE;
    const y0 = cy - ALTO / 2 / TILE;
    const aPx = (lat: number, lng: number): [number, number] => [
      (lngAX(lng, z) - x0) * TILE,
      (latAY(lat, z) - y0) * TILE,
    ];

    // 3) tiles
    const canvas = document.createElement("canvas");
    canvas.width = ANCHO;
    canvas.height = ALTO;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = "#101018";
    ctx.fillRect(0, 0, ANCHO, ALTO);

    const soportaFiltro = typeof ctx.filter === "string";
    if (soportaFiltro) {
      ctx.filter =
        "invert(1) hue-rotate(180deg) brightness(0.68) contrast(1.12) saturate(0.28)";
    }
    const maxTile = 2 ** z;
    const tareas: Promise<void>[] = [];
    for (let tx = Math.floor(x0); tx * TILE < (x0 + ANCHO / TILE) * TILE + ANCHO; tx++) {
      if (tx < 0 || tx >= maxTile || (tx - x0) * TILE > ANCHO) continue;
      for (let ty = Math.floor(y0); ty < maxTile; ty++) {
        if (ty < 0 || (ty - y0) * TILE > ALTO) continue;
        tareas.push(
          cargarTile(z, tx, ty).then((img) => {
            if (img) ctx.drawImage(img, (tx - x0) * TILE, (ty - y0) * TILE, TILE, TILE);
          })
        );
      }
    }
    await Promise.all(tareas);
    if (soportaFiltro) {
      ctx.filter = "none";
    } else {
      oscurecerPixeles(ctx);
    }

    // 4) overlays con la simbología de la app
    // polígonos de CP
    for (const cp of o.cps ?? []) {
      const geom = cp.geometria as { type?: string; coordinates?: number[][][][] } | null;
      if (!geom?.coordinates) continue;
      const polys =
        geom.type === "Polygon"
          ? [geom.coordinates as unknown as number[][][]]
          : geom.coordinates;
      ctx.strokeStyle = VIOLETA;
      ctx.lineWidth = 2.5;
      ctx.fillStyle = "rgba(157, 92, 240, 0.14)";
      for (const anillos of polys) {
        ctx.beginPath();
        for (const anillo of anillos) {
          anillo.forEach(([lng, lat], i) => {
            const [px, py] = aPx(lat, lng);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.closePath();
        }
        ctx.fill("evenodd");
        ctx.stroke();
      }
    }
    // rectángulos de zona
    for (const zn of o.zonas ?? []) {
      if (!zn.viewport) continue;
      const [x1, y1] = aPx(zn.viewport.north, zn.viewport.west);
      const [x2, y2] = aPx(zn.viewport.south, zn.viewport.east);
      ctx.strokeStyle = VIOLETA;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.setLineDash([]);
    }
    // radios de origen
    if (o.origenes && o.radioM) {
      const mPorPx =
        (156543.03392 * Math.cos((((norte + sur) / 2) * Math.PI) / 180)) / 2 ** z;
      for (const c of o.origenes) {
        const [px, py] = aPx(c.lat, c.lng);
        ctx.beginPath();
        ctx.arc(px, py, o.radioM / mPorPx, 0, Math.PI * 2);
        ctx.strokeStyle = CIAN;
        ctx.lineWidth = 1.5;
        ctx.fillStyle = "rgba(47, 185, 232, 0.07)";
        ctx.fill();
        ctx.stroke();
      }
    }
    // POIs
    for (const p of o.pois) {
      const [px, py] = aPx(p.lat, p.lng);
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = p.fuente === "denue" ? NARANJA : MAGENTA;
      ctx.fill();
      ctx.strokeStyle = "#0a0a0f";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 5) atribución
    ctx.fillStyle = "rgba(10,10,15,0.75)";
    ctx.fillRect(ANCHO - 170, ALTO - 22, 170, 22);
    ctx.fillStyle = "#8b8b96";
    ctx.font = "11px monospace";
    ctx.fillText("© OpenStreetMap", ANCHO - 158, ALTO - 7);

    return canvas.toDataURL("image/jpeg", 0.85);
  } catch (e) {
    console.error("No se pudo capturar el mapa del plan:", e);
    return null;
  }
}
