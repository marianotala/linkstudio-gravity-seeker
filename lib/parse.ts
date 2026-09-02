// Parseo del lado CLIENTE: textareas, Excel y CSV con detección
// automática de columnas. Nada de esto toca el servidor.

import * as XLSX from "xlsx";
import Papa from "papaparse";
import { normalizar } from "./geo";
import { normalizarTipoPantalla } from "./ooh";
import type { Origin, TipoPantalla } from "./types";

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

/** Lee un .xlsx/.xls/.csv como filas header→valor (primera hoja). */
async function filasDeArchivo(file: File): Promise<Fila[]> {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) {
    const texto = await file.text();
    const res = Papa.parse<Fila>(texto, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    return res.data;
  }
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Fila>(hoja, { defval: "" });
}

/** Parsea un .xlsx/.xls/.csv y detecta columnas automáticamente. */
export async function parsearArchivo(file: File): Promise<ArchivoParseado> {
  return filasAResultado(await filasDeArchivo(file));
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
// Inventario de pantallas OOH (carga en /admin)
// ------------------------------------------------------------------

/** Pantalla lista para el upsert (espejo de admin_upsert_screens). */
export interface PantallaCarga {
  clave: string;
  nombre?: string;
  tipo: TipoPantalla;
  medio?: string;
  ciudad?: string;
  digital?: boolean | null;
  impresiones?: number;
  costo?: number;
  direccion?: string;
  lat?: number;
  lng?: number;
}

export interface ArchivoPantallas {
  /** Pantallas que ya traían coordenadas. */
  pantallas: PantallaCarga[];
  /** Pantallas con dirección pero sin coordenadas (a geocodificar). */
  pendientes: PantallaCarga[];
  deteccion: string;
  correcciones: CorreccionesCarga & { sinClave: number };
}

const KEYS_CLAVE = ["clave", "id", "codigo", "key", "sku"];
const KEYS_TIPO = ["tipo", "type", "formato", "categoria"];
const KEYS_MEDIO = ["medio", "vendor", "proveedor", "propietario", "empresa"];
const KEYS_CIUDAD = ["ciudad", "city", "plaza", "municipio"];
const KEYS_DIGITAL = ["digital", "estatica", "tecnologia"];
const KEYS_IMPRESIONES = ["impresiones", "impactos", "audiencia"];
const KEYS_COSTO = ["costo", "precio", "tarifa", "renta"];

/** Interpreta la celda de digital/estática con tolerancia: palabras
 * ("digital", "LED", "estática", "impresa", "lona") o sí/no relativo
 * al encabezado de la columna. */
function aDigital(v: unknown, colNorm: string): boolean | null {
  const s = normalizar(String(v ?? ""));
  if (!s) return null;
  if (/digital|led|dooh|pantalla/.test(s)) return true;
  if (/estatic|impres|fija|lona|tradicional/.test(s)) return false;
  const afirma = /^(si|s|true|1|x|yes)$/.test(s);
  const niega = /^(no|n|false|0)$/.test(s);
  if (!afirma && !niega) return null;
  // columna "estática": sí = estática (digital false)
  const colEstatica = colNorm.includes("estatic");
  return afirma ? !colEstatica : colEstatica;
}

/**
 * Parsea el CSV/Excel del inventario de pantallas con detección
 * automática de columnas (clave/nombre, lat/lng o dirección, tipo,
 * medio, ciudad, digital, impresiones, costo). Sin clave, la clave se
 * deriva del nombre; sin ninguno de los dos, la fila se descarta.
 */
export async function parsearArchivoPantallas(
  file: File
): Promise<ArchivoPantallas> {
  const filas = await filasDeArchivo(file);
  const vacio = {
    pantallas: [],
    pendientes: [],
    correcciones: { ...SIN_CORRECCIONES, sinClave: 0 },
  };
  if (filas.length === 0) return { ...vacio, deteccion: "Archivo vacío" };

  const headers = Object.keys(filas[0]);
  const colClave = detectarColumna(headers, KEYS_CLAVE);
  const colNombre = detectarColumna(headers, KEYS_NOMBRE);
  const colLat = detectarColumna(headers, KEYS_LAT);
  const colLng = detectarColumna(headers, KEYS_LNG);
  const colDir = detectarColumna(headers, KEYS_DIR);
  const colTipo = detectarColumna(headers, KEYS_TIPO);
  const colMedio = detectarColumna(headers, KEYS_MEDIO);
  const colCiudad = detectarColumna(headers, KEYS_CIUDAD);
  const colDigital = detectarColumna(headers, KEYS_DIGITAL);
  const colImpresiones = detectarColumna(headers, KEYS_IMPRESIONES);
  const colCosto = detectarColumna(headers, KEYS_COSTO);

  if (!colClave && !colNombre) {
    return {
      ...vacio,
      deteccion:
        "No encontré columna de clave ni de nombre. Usa headers como clave, nombre, latitud, longitud, tipo, medio — o descarga la plantilla.",
    };
  }

  const texto = (col: string | undefined, fila: Fila) =>
    col ? String(fila[col] ?? "").trim() || undefined : undefined;
  const pantallas: PantallaCarga[] = [];
  const pendientes: PantallaCarga[] = [];
  const correcciones = { ...SIN_CORRECCIONES, sinClave: 0 };
  const clavesVistas = new Set<string>();

  for (const fila of filas) {
    const nombre = texto(colNombre, fila);
    let clave = texto(colClave, fila) ?? nombre;
    if (!clave) {
      // fila sin identidad: solo cuenta si traía algo más
      if (texto(colDir, fila) || (colLat && aNumero(fila[colLat]) !== undefined)) {
        correcciones.sinClave++;
      }
      continue;
    }
    // clave repetida en el archivo: sufijo para no perder pantallas
    // (el upsert en la base es por clave)
    if (clavesVistas.has(clave)) {
      let n = 2;
      while (clavesVistas.has(`${clave}-${n}`)) n++;
      clave = `${clave}-${n}`;
    }
    clavesVistas.add(clave);

    const base: PantallaCarga = {
      clave,
      nombre,
      tipo: normalizarTipoPantalla(colTipo ? fila[colTipo] : ""),
      medio: texto(colMedio, fila),
      ciudad: texto(colCiudad, fila),
      digital: colDigital
        ? aDigital(fila[colDigital], normalizar(colDigital))
        : null,
      impresiones: colImpresiones ? aNumero(fila[colImpresiones]) : undefined,
      costo: colCosto ? aNumero(fila[colCosto]) : undefined,
      direccion: texto(colDir, fila),
    };

    let lat = colLat ? aNumero(fila[colLat]) : undefined;
    let lng = colLng ? aNumero(fila[colLng]) : undefined;
    if ((lat === undefined || lng === undefined) && colLat) {
      const par = separarParCoordenadas(fila[colLat]);
      if (par) {
        [lat, lng] = par;
        correcciones.coordsSeparadas++;
      }
    }
    if (
      lat !== undefined &&
      lng !== undefined &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0)
    ) {
      if (esLongitudVolteadaMx(lat, lng)) {
        lng = -lng;
        correcciones.lngCorregidas++;
      }
      pantallas.push({ ...base, lat, lng });
    } else if (base.direccion) {
      pendientes.push(base);
    } else {
      correcciones.descartadas++;
    }
  }

  const partes = [
    colClave ? `clave: "${colClave}"` : `clave: nombre ("${colNombre}")`,
    colLat ? `coords: "${colLat}"${colLng ? `/"${colLng}"` : ""}` : null,
    colDir ? `dirección: "${colDir}"` : null,
    colTipo ? `tipo: "${colTipo}"` : null,
    colMedio ? `medio: "${colMedio}"` : null,
    colImpresiones ? `impresiones: "${colImpresiones}"` : null,
  ].filter(Boolean);
  return {
    pantallas,
    pendientes,
    deteccion: partes.join(" · "),
    correcciones,
  };
}

/**
 * Plantilla Excel del inventario de pantallas: hoja "Pantallas" con
 * ejemplos + hoja "Instrucciones" (tipos válidos y reglas), como la
 * plantilla de orígenes.
 */
export function descargarPlantillaPantallas() {
  const wb = XLSX.utils.book_new();

  const datos = XLSX.utils.aoa_to_sheet([
    [
      "clave",
      "nombre",
      "latitud",
      "longitud",
      "direccion",
      "tipo",
      "medio",
      "ciudad",
      "digital",
      "impresiones_mensuales",
      "costo_mensual",
    ],
    [
      "MX-CDMX-001",
      "Muro Reforma 222",
      19.4275,
      -99.168,
      "",
      "muro digital",
      "IMU",
      "CDMX",
      "digital",
      1500000,
      85000,
    ],
    [
      "MX-CDMX-002",
      "Espectacular Periférico Sur",
      19.361,
      -99.262,
      "",
      "espectacular",
      "Rentable",
      "CDMX",
      "estática",
      900000,
      "",
    ],
    [
      "MX-GDL-001",
      "Mall Andares acceso norte",
      "",
      "",
      "Blvd. Puerta de Hierro 4965, Zapopan, Jalisco",
      "mall",
      "GDL Media",
      "Guadalajara",
      "digital",
      "",
      "",
    ],
  ]);
  datos["!cols"] = [
    { wch: 14 },
    { wch: 30 },
    { wch: 10 },
    { wch: 10 },
    { wch: 42 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 9 },
    { wch: 20 },
    { wch: 13 },
  ];
  XLSX.utils.book_append_sheet(wb, datos, "Pantallas");

  const instrucciones = XLSX.utils.aoa_to_sheet([
    ["PLANTILLA DE INVENTARIO DE PANTALLAS — SEEKER OOH (Gravity)"],
    [""],
    ["· clave: identificador ÚNICO de la pantalla. Re-subir la misma clave ACTUALIZA sus datos."],
    ["· tipo: espectacular (billboard), muro digital, mall (centro comercial), urbano (mupis),"],
    ["  aeropuerto, transporte u otro. Se detectan variantes comunes."],
    ["· medio: vendor / propietario de la pantalla (IMU, Rentable, Global…)."],
    ["· digital: digital / estática (o sí / no)."],
    ["· Coordenadas en formato DECIMAL y LONGITUD NEGATIVA (México es oeste: -99.16)."],
    ["  Si la pantalla no tiene coordenadas, llena la dirección: se geocodifica al cargar."],
    ["· impresiones_mensuales y costo_mensual son opcionales (suman al resumen del plan)."],
    ["· Primera fila = encabezados, datos en la primera hoja, sin celdas combinadas."],
  ]);
  instrucciones["!cols"] = [{ wch: 95 }];
  XLSX.utils.book_append_sheet(wb, instrucciones, "Instrucciones");

  XLSX.writeFile(wb, "Seeker_plantilla_pantallas.xlsx");
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
