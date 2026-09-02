// OOH — cruce pantallas × puntos de venta (réplica evolucionada de
// Plot Matrix, la planeación de la táctica Geo-PDOOH). Todo el cruce
// corre EN EL CLIENTE con Haversine sobre un hash espacial: cero
// llamadas a Google (salvo geocodificar direcciones nuevas al cargar).

import { haversine, normalizar } from "./geo";
import type {
  CrucePantalla,
  Origin,
  Pantalla,
  TipoPantalla,
} from "./types";

// ------------------------------------------------------------------
// Catálogo de tipos de pantalla (color = simbología del mapa y el PDF)
// ------------------------------------------------------------------

export const TIPOS_PANTALLA: Record<
  TipoPantalla,
  { etiqueta: string; color: string }
> = {
  espectacular: { etiqueta: "Espectacular", color: "#f4368a" },
  muro_digital: { etiqueta: "Muro digital", color: "#9d5cf0" },
  mall: { etiqueta: "Mall / centro comercial", color: "#ff8c42" },
  urbano: { etiqueta: "Urbano / mupis", color: "#f7d154" },
  aeropuerto: { etiqueta: "Aeropuerto", color: "#34d399" },
  transporte: { etiqueta: "Transporte", color: "#f87171" },
  otro: { etiqueta: "Otro", color: "#a1a1aa" },
};

export const CLAVES_TIPO_PANTALLA = Object.keys(
  TIPOS_PANTALLA
) as TipoPantalla[];

export function etiquetaTipoPantalla(tipo: string): string {
  return TIPOS_PANTALLA[tipo as TipoPantalla]?.etiqueta ?? tipo;
}

export function colorTipoPantalla(tipo: string): string {
  return TIPOS_PANTALLA[tipo as TipoPantalla]?.color ?? TIPOS_PANTALLA.otro.color;
}

/** Normaliza el texto libre del inventario a un tipo canónico:
 * "billboard", "cartelera", "unipolar" → espectacular; "muro", "wall"
 * → muro digital; "centro comercial", "plaza" → mall; "mupi",
 * "parabús", "tótem", "valla" → urbano; "metro", "autobús", "tren",
 * "estación" → transporte; "airport" → aeropuerto; resto → otro. */
export function normalizarTipoPantalla(v: unknown): TipoPantalla {
  const s = normalizar(String(v ?? ""));
  if (!s) return "otro";
  if (/espectacular|billboard|cartelera|unipolar|azotea/.test(s))
    return "espectacular";
  if (/muro|wall/.test(s)) return "muro_digital";
  if (/mall|centro comercial|plaza|shopping/.test(s)) return "mall";
  if (/urbano|mupi|parabus|totem|valla|puente|kiosco|street/.test(s))
    return "urbano";
  if (/aeropuerto|airport/.test(s)) return "aeropuerto";
  if (/transporte|metro|autobus|bus|tren|suburbano|estacion|transit/.test(s))
    return "transporte";
  return "otro";
}

// ------------------------------------------------------------------
// Radio urbano / foráneo (como el prototipo: 6 km ZMVM, 15 km resto)
// ------------------------------------------------------------------

/** ¿La coordenada cae en la Zona Metropolitana del Valle de México?
 * (CDMX + municipios conurbados del Edomex, por caja geográfica —
 * suficiente para decidir radio urbano vs foráneo). */
export function esZmvm(lat: number, lng: number): boolean {
  return lat >= 19.0 && lat <= 19.95 && lng >= -99.45 && lng <= -98.7;
}

// ------------------------------------------------------------------
// Cruce por proximidad (hash espacial + Haversine)
// ------------------------------------------------------------------

/**
 * Para cada pantalla, encuentra los PDVs dentro de su radio. El radio
 * es POR PANTALLA (`radioDe`) para soportar el radio diferenciado
 * urbano/foráneo. Los PDVs van a un hash de celdas del tamaño del
 * radio máximo: cada pantalla solo revisa sus 9 celdas vecinas.
 */
export function cruzarPantallasPdvs(
  pantallas: Pantalla[],
  pdvs: Origin[],
  radioDe: (p: Pantalla) => number
): CrucePantalla[] {
  if (pantallas.length === 0 || pdvs.length === 0) {
    return pantallas.map((p) => ({ pantalla: p, radioM: radioDe(p), pdvs: [] }));
  }
  const radioMax = Math.max(...pantallas.map(radioDe), 1);
  // grados por celda ≈ radio máximo (lat); en lng se corrige por cos φ
  const dLat = radioMax / 111320;
  const latMedia =
    (pdvs.reduce((s, o) => s + o.lat, 0) / pdvs.length) * (Math.PI / 180);
  const dLng = radioMax / (111320 * Math.max(0.2, Math.cos(latMedia)));

  const celdas = new Map<string, number[]>();
  const claveDe = (lat: number, lng: number) =>
    `${Math.floor(lat / dLat)}:${Math.floor(lng / dLng)}`;
  pdvs.forEach((o, i) => {
    const k = claveDe(o.lat, o.lng);
    const lista = celdas.get(k);
    if (lista) lista.push(i);
    else celdas.set(k, [i]);
  });

  return pantallas.map((p) => {
    const radioM = radioDe(p);
    const cy = Math.floor(p.lat / dLat);
    const cx = Math.floor(p.lng / dLng);
    const cerca: { idx: number; distancia: number }[] = [];
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        for (const idx of celdas.get(`${y}:${x}`) ?? []) {
          const d = haversine(p, pdvs[idx]);
          if (d <= radioM) cerca.push({ idx, distancia: Math.round(d) });
        }
      }
    }
    cerca.sort((a, b) => a.distancia - b.distancia);
    return { pantalla: p, radioM, pdvs: cerca };
  });
}

/** Índices de PDVs cubiertos por al menos una pantalla del cruce. */
export function pdvsCubiertos(cruces: CrucePantalla[]): Set<number> {
  const s = new Set<number>();
  for (const c of cruces) for (const p of c.pdvs) s.add(p.idx);
  return s;
}

// ------------------------------------------------------------------
// Export data: CSV del cruce pantalla ↔ PDV (como el prototipo)
// ------------------------------------------------------------------

function csvCampo(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Arma el CSV del cruce: una fila por relación pantalla↔PDV con la
 * distancia; las pantallas del plan sin PDV no aparecen y los PDVs
 * SIN COBERTURA van en una sección final (el dato accionable).
 */
export function csvCruce(
  cruces: CrucePantalla[],
  pdvs: Origin[],
  etiquetaPdv: (o: Origin, idx: number) => string
): string {
  const filas: string[] = [
    [
      "pantalla_clave",
      "pantalla_nombre",
      "tipo",
      "medio",
      "ciudad",
      "digital",
      "impresiones_mensuales",
      "pantalla_lat",
      "pantalla_lng",
      "radio_m",
      "pdv_nombre",
      "pdv_lat",
      "pdv_lng",
      "distancia_m",
    ].join(","),
  ];
  for (const c of cruces) {
    for (const rel of c.pdvs) {
      const pdv = pdvs[rel.idx];
      filas.push(
        [
          csvCampo(c.pantalla.clave),
          csvCampo(c.pantalla.nombre ?? ""),
          csvCampo(etiquetaTipoPantalla(c.pantalla.tipo)),
          csvCampo(c.pantalla.medio ?? ""),
          csvCampo(c.pantalla.ciudad ?? ""),
          c.pantalla.digital === null ? "" : c.pantalla.digital ? "digital" : "estatica",
          c.pantalla.impresiones ?? "",
          c.pantalla.lat,
          c.pantalla.lng,
          c.radioM,
          csvCampo(etiquetaPdv(pdv, rel.idx)),
          pdv.lat,
          pdv.lng,
          rel.distancia,
        ].join(",")
      );
    }
  }
  const cubiertos = pdvsCubiertos(cruces);
  const sinCobertura = pdvs
    .map((o, i) => ({ o, i }))
    .filter(({ i }) => !cubiertos.has(i));
  if (sinCobertura.length > 0) {
    filas.push("", "— PDVs SIN COBERTURA (sin pantalla dentro del radio) —");
    filas.push("pdv_nombre,pdv_lat,pdv_lng");
    for (const { o, i } of sinCobertura) {
      filas.push([csvCampo(etiquetaPdv(o, i)), o.lat, o.lng].join(","));
    }
  }
  return filas.join("\n");
}
