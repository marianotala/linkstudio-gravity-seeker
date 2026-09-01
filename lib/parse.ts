// Parseo del lado CLIENTE: textareas, Excel y CSV con detección
// automática de columnas. Nada de esto toca el servidor.

import * as XLSX from "xlsx";
import Papa from "papaparse";
import { normalizar } from "./geo";
import type { Origin } from "./types";

/** Filas crudas de un archivo, como objetos header→valor. */
type Fila = Record<string, unknown>;

export interface CorreccionesCarga {
  /** Longitudes positivas corregidas a oeste (México). */
  lngCorregidas: number;
  /** Celdas "lat, lng" en una sola columna, separadas automáticamente. */
  coordsSeparadas: number;
  /** Filas sin nombre, sin coordenadas y sin dirección, descartadas. */
  descartadas: number;
}

export interface ArchivoParseado {
  /** Orígenes que ya traían lat/lng. */
  origenes: Origin[];
  /** Direcciones pendientes de geocodificar (con su nombre si venía). */
  direcciones: { direccion: string; nombre?: string }[];
  /** Columnas que se detectaron, para mostrarlas al usuario. */
  deteccion: string;
  /** Correcciones y descartes aplicados al cargar. */
  correcciones: CorreccionesCarga;
}

const KEYS_LAT = ["lat", "latitud", "latitude", "y"];
const KEYS_LNG = ["lng", "lon", "long", "longitud", "longitude", "x"];
const KEYS_DIR = ["direccion", "address", "domicilio", "ubicacion", "calle"];
const KEYS_NOMBRE = ["nombre", "name", "sucursal", "pdv", "punto", "tienda", "sitio"];

function detectarColumna(headers: string[], candidatos: string[]): string | undefined {
  const normalizados = headers.map((h) => ({ original: h, norm: normalizar(h) }));
  // primero match exacto, luego por prefijo/contención
  for (const c of candidatos) {
    const exacto = normalizados.find((h) => h.norm === c);
    if (exacto) return exacto.original;
  }
  for (const c of candidatos) {
    const parcial = normalizados.find((h) => h.norm.includes(c));
    if (parcial) return parcial.original;
  }
  return undefined;
}

function aNumero(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.replace(",", ".").trim();
    if (!s) return undefined; // Number("") sería 0: una celda vacía NO es coordenada
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Celda "19.30, -99.19" (par de coordenadas en UNA columna) → [lat, lng]. */
function separarParCoordenadas(v: unknown): [number, number] | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(-?\d{1,3}(?:\.\d+)?)[,;\s]+(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

/** ¿La coordenada cae en México con la longitud VOLTEADA a este?
 * (México es oeste: -99.19; una longitud positiva ahí cae en Asia.) */
function esLongitudVolteadaMx(lat: number, lng: number): boolean {
  return lat >= 14 && lat <= 33.5 && lng >= 86 && lng <= 118;
}

const SIN_CORRECCIONES: CorreccionesCarga = {
  lngCorregidas: 0,
  coordsSeparadas: 0,
  descartadas: 0,
};

function filasAResultado(filas: Fila[]): ArchivoParseado {
  if (filas.length === 0) {
    return {
      origenes: [],
      direcciones: [],
      deteccion: "Archivo vacío",
      correcciones: SIN_CORRECCIONES,
    };
  }
  const headers = Object.keys(filas[0]);
  const colLat = detectarColumna(headers, KEYS_LAT);
  const colLng = detectarColumna(headers, KEYS_LNG);
  const colDir = detectarColumna(headers, KEYS_DIR);
  const colNombre = detectarColumna(headers, KEYS_NOMBRE);

  const origenes: Origin[] = [];
  const direcciones: { direccion: string; nombre?: string }[] = [];
  const correcciones: CorreccionesCarga = { ...SIN_CORRECCIONES };

  const nombreDe = (fila: Fila) =>
    colNombre ? String(fila[colNombre] ?? "").trim() || undefined : undefined;
  const direccionDe = (fila: Fila) =>
    colDir ? String(fila[colDir] ?? "").trim() || undefined : undefined;

  if (colLat) {
    for (const fila of filas) {
      let lat = aNumero(fila[colLat]);
      let lng = colLng ? aNumero(fila[colLng]) : undefined;
      // par "19.30, -99.19" en una sola celda → separarlo
      if (lat === undefined || lng === undefined) {
        const par = separarParCoordenadas(fila[colLat]);
        if (par) {
          [lat, lng] = par;
          correcciones.coordsSeparadas++;
        }
      }
      const dir = direccionDe(fila);
      const nombre = nombreDe(fila);
      if (
        lat === undefined ||
        lng === undefined ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180 ||
        (lat === 0 && lng === 0)
      ) {
        // sin coordenadas útiles: la dirección salva la fila (la
        // plantilla trae filas con coordenadas Y filas con dirección)
        if (dir) {
          direcciones.push({ direccion: dir, nombre });
        } else if (nombre || dir || lat !== undefined || lng !== undefined) {
          correcciones.descartadas++;
        }
        continue;
      }
      // longitud positiva en México → corregir a oeste y avisar
      if (esLongitudVolteadaMx(lat, lng)) {
        lng = -lng;
        correcciones.lngCorregidas++;
      }
      origenes.push({ lat, lng, nombre, direccion: dir });
    }
    if (origenes.length > 0 || direcciones.length > 0) {
      return {
        origenes,
        direcciones,
        deteccion: `Coordenadas: "${colLat}"${colLng ? ` / "${colLng}"` : ""}${colNombre ? ` · nombre: "${colNombre}"` : ""}${colDir ? ` · dirección: "${colDir}"` : ""}`,
        correcciones,
      };
    }
  }

  if (colDir) {
    for (const fila of filas) {
      const dir = String(fila[colDir] ?? "").trim();
      if (!dir) {
        if (nombreDe(fila)) correcciones.descartadas++;
        continue;
      }
      direcciones.push({ direccion: dir, nombre: nombreDe(fila) });
    }
    return {
      origenes,
      direcciones,
      deteccion: `Direcciones: "${colDir}"${colNombre ? ` · nombre: "${colNombre}"` : ""}`,
      correcciones,
    };
  }

  return {
    origenes: [],
    direcciones: [],
    deteccion:
      "No encontré columnas de lat/lng ni de dirección. Usa headers como nombre, latitud, longitud, direccion — o descarga la plantilla.",
    correcciones: SIN_CORRECCIONES,
  };
}

/** Parsea un .xlsx/.xls/.csv y detecta columnas automáticamente. */
export async function parsearArchivo(file: File): Promise<ArchivoParseado> {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) {
    const texto = await file.text();
    const res = Papa.parse<Fila>(texto, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    return filasAResultado(res.data);
  }
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<Fila>(hoja, { defval: "" });
  return filasAResultado(filas);
}

/** Parsea el textarea de coordenadas: "lat, lng" o "lat, lng, nombre"
 * por línea. Corrige longitudes positivas en México (a oeste). */
export function parsearCoordenadas(texto: string): {
  origenes: Origin[];
  lngCorregidas: number;
} {
  const origenes: Origin[] = [];
  let lngCorregidas = 0;
  for (const linea of texto.split("\n")) {
    const limpia = linea.trim();
    if (!limpia) continue;
    const partes = limpia.split(/[,;\t]/).map((p) => p.trim());
    if (partes.length < 2) continue;
    const lat = aNumero(partes[0]);
    let lng = aNumero(partes[1]);
    if (lat === undefined || lng === undefined) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (esLongitudVolteadaMx(lat, lng)) {
      lng = -lng;
      lngCorregidas++;
    }
    origenes.push({ lat, lng, nombre: partes.slice(2).join(", ") || undefined });
  }
  return { origenes, lngCorregidas };
}

/** Parsea el textarea de direcciones: una por línea, con nombre
 * opcional al frente ("Nombre | dirección"). */
export function parsearDirecciones(
  texto: string
): { direccion: string; nombre?: string }[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const barra = l.indexOf("|");
      if (barra > 0 && barra < l.length - 1) {
        return {
          nombre: l.slice(0, barra).trim() || undefined,
          direccion: l.slice(barra + 1).trim(),
        };
      }
      return { direccion: l };
    })
    .filter((d) => d.direccion);
}

/**
 * Genera y descarga la plantilla Excel para la carga de orígenes:
 * hoja "Orígenes" (nombre | latitud | longitud | direccion, con filas
 * de ejemplo) + hoja "Instrucciones" con las reglas en corto.
 */
export function descargarPlantillaOrigenes() {
  const wb = XLSX.utils.book_new();

  const datos = XLSX.utils.aoa_to_sheet([
    ["nombre", "latitud", "longitud", "direccion"],
    ["OXXO Perisur", 19.30345, -99.19023, ""],
    ["Sucursal Centro", "", "", "Av. Juárez 100, Centro, Ciudad de México"],
    ["Farmacia San Pablo Nápoles", 19.39871, -99.17093, ""],
  ]);
  datos["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 44 }];
  XLSX.utils.book_append_sheet(wb, datos, "Orígenes");

  const instrucciones = XLSX.utils.aoa_to_sheet([
    ["PLANTILLA DE ORÍGENES — SEEKER (Gravity)"],
    [""],
    ["· Coordenadas en formato DECIMAL (19.30345), no grados-minutos."],
    ["· LONGITUD NEGATIVA: México es oeste (-99.19023). Una longitud positiva cae en Asia"],
    ["  (si se te va, Seeker la corrige y te avisa)."],
    ["· Si tienes coordenadas, la dirección es opcional — las coordenadas son más"],
    ["  precisas y no consumen geocodificación."],
    ["· Si solo tienes direcciones: lo más completas posible (calle, número, colonia, ciudad)."],
    ["· Primera fila = encabezados. Sin filas de título arriba, sin celdas combinadas,"],
    ["  y los datos en la primera hoja."],
    [""],
    ["El nombre de cada tienda aparece como origen en resultados, mapa y exports."],
  ]);
  instrucciones["!cols"] = [{ wch: 95 }];
  XLSX.utils.book_append_sheet(wb, instrucciones, "Instrucciones");

  XLSX.writeFile(wb, "Seeker_plantilla_origenes.xlsx");
}

// ------------------------------------------------------------------
// Códigos postales (modo "Por código postal")
// ------------------------------------------------------------------

/** Normaliza un valor de celda/token a CP de 5 dígitos, o null.
 * Acepta 4 dígitos (celdas numéricas de Excel que perdieron el cero
 * inicial: 1000 → "01000") y re-rellena con ceros a la izquierda. */
function aCp(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s =
    typeof v === "number" && Number.isInteger(v)
      ? String(v)
      : String(v).trim();
  return /^\d{4,5}$/.test(s) ? s.padStart(5, "0") : null;
}

/** Extrae CPs de texto libre: separados por comas, punto y coma,
 * espacios o saltos de línea. Únicos, en orden de aparición. */
export function extraerCps(texto: string): string[] {
  const vistos = new Set<string>();
  for (const token of texto.split(/[\s,;]+/)) {
    const cp = aCp(token);
    if (cp) vistos.add(cp);
  }
  return Array.from(vistos);
}

/** Extrae CPs de un Excel/CSV de una columna. Tolera encabezado
 * presente o ausente (las celdas que no son códigos de 4-5 dígitos se
 * ignoran) y celdas numéricas que perdieron el cero inicial. */
export async function parsearArchivoCps(file: File): Promise<string[]> {
  const nombre = file.name.toLowerCase();
  const vistos = new Set<string>();
  const registrar = (celda: unknown) => {
    const cp = aCp(celda);
    if (cp) vistos.add(cp);
  };
  if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) {
    const res = Papa.parse<string[]>(await file.text(), {
      header: false,
      skipEmptyLines: true,
    });
    for (const fila of res.data) for (const celda of fila) registrar(celda);
  } else {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const filas = XLSX.utils.sheet_to_json<unknown[]>(
      wb.Sheets[wb.SheetNames[0]],
      { header: 1, defval: "" }
    );
    for (const fila of filas) for (const celda of fila) registrar(celda);
  }
  return Array.from(vistos);
}
