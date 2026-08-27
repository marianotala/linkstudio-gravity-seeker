// Parseo del lado CLIENTE: textareas, Excel y CSV con detección
// automática de columnas. Nada de esto toca el servidor.

import * as XLSX from "xlsx";
import Papa from "papaparse";
import { normalizar } from "./geo";
import type { Origin } from "./types";

/** Filas crudas de un archivo, como objetos header→valor. */
type Fila = Record<string, unknown>;

export interface ArchivoParseado {
  /** Orígenes que ya traían lat/lng. */
  origenes: Origin[];
  /** Direcciones pendientes de geocodificar (con su nombre si venía). */
  direcciones: { direccion: string; nombre?: string }[];
  /** Columnas que se detectaron, para mostrarlas al usuario. */
  deteccion: string;
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
    const n = Number(v.replace(",", ".").trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function filasAResultado(filas: Fila[]): ArchivoParseado {
  if (filas.length === 0) {
    return { origenes: [], direcciones: [], deteccion: "Archivo vacío" };
  }
  const headers = Object.keys(filas[0]);
  const colLat = detectarColumna(headers, KEYS_LAT);
  const colLng = detectarColumna(headers, KEYS_LNG);
  const colDir = detectarColumna(headers, KEYS_DIR);
  const colNombre = detectarColumna(headers, KEYS_NOMBRE);

  const origenes: Origin[] = [];
  const direcciones: { direccion: string; nombre?: string }[] = [];

  if (colLat && colLng) {
    for (const fila of filas) {
      const lat = aNumero(fila[colLat]);
      const lng = aNumero(fila[colLng]);
      if (lat === undefined || lng === undefined) continue;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      origenes.push({
        lat,
        lng,
        nombre: colNombre ? String(fila[colNombre] ?? "").trim() || undefined : undefined,
        direccion: colDir ? String(fila[colDir] ?? "").trim() || undefined : undefined,
      });
    }
    return {
      origenes,
      direcciones,
      deteccion: `Coordenadas: "${colLat}" / "${colLng}"${colNombre ? ` · nombre: "${colNombre}"` : ""}`,
    };
  }

  if (colDir) {
    for (const fila of filas) {
      const dir = String(fila[colDir] ?? "").trim();
      if (!dir) continue;
      direcciones.push({
        direccion: dir,
        nombre: colNombre ? String(fila[colNombre] ?? "").trim() || undefined : undefined,
      });
    }
    return {
      origenes,
      direcciones,
      deteccion: `Direcciones: "${colDir}"${colNombre ? ` · nombre: "${colNombre}"` : ""}`,
    };
  }

  return {
    origenes: [],
    direcciones: [],
    deteccion:
      "No encontré columnas de lat/lng ni de dirección. Usa headers como lat, lng, direccion, nombre.",
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

/** Parsea el textarea de coordenadas: "lat, lng" o "lat, lng, nombre" por línea. */
export function parsearCoordenadas(texto: string): Origin[] {
  const origenes: Origin[] = [];
  for (const linea of texto.split("\n")) {
    const limpia = linea.trim();
    if (!limpia) continue;
    const partes = limpia.split(/[,;\t]/).map((p) => p.trim());
    if (partes.length < 2) continue;
    const lat = aNumero(partes[0]);
    const lng = aNumero(partes[1]);
    if (lat === undefined || lng === undefined) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    origenes.push({ lat, lng, nombre: partes.slice(2).join(", ") || undefined });
  }
  return origenes;
}

/** Parsea el textarea de direcciones: una por línea. */
export function parsearDirecciones(texto: string): string[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
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
