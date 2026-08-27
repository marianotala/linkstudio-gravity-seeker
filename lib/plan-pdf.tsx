// Export plan (PDF) — one-pager VERTICAL continuo (ancho carta 816pt,
// alto dinámico según contenido: documento para scroll en celular y
// laptop, no para proyectar por láminas) con el sistema de diseño del
// pitch deck de Gravity: fondo #0a0a0f, paleta magenta/violeta/cian,
// encabezados con etiqueta magenta + tres puntos, cifras gigantes,
// divisores de gradiente y pills de tácticas. Renderizado con
// @react-pdf/renderer EN EL CLIENTE con los datos del análisis ACTIVO
// (POIs, universos y mapa reales llegan desde el estado de Seeker);
// las fuentes TTF viven en /public/fonts.

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Svg,
  Path,
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Font,
  pdf,
} from "@react-pdf/renderer";
import type { Poi, SearchMode, Universos } from "./types";
import { NIVELES_NSE } from "./nse";
import { rangosEdadEstandar } from "./edades";
import { normalizarComparable } from "./geo";

// ------------------------------------------------------------------
// Datos que el plan necesita del análisis activo
// ------------------------------------------------------------------

export interface PlanDatos {
  modo: SearchMode;
  /** Título definido por el vendedor; si va vacío se usa el default. */
  titulo?: string | null;
  /** Marca / término / categoría buscada (default de título y textos). */
  termino: string;
  /** Ciudad, zonas o lista de CPs (default de título). */
  alcance: string;
  usuario: string;
  fecha: Date;
  pois: Poi[];
  /** Nombre de la zona/origen/CP por índice (origenIdx). */
  nombresOrigen: string[];
  universos: Universos | null;
  /** Línea de fuente/criterio del panel demográfico. */
  criterio?: string | null;
  /** Fuentes de datos usadas (Google Places, DENUE...). */
  fuentes: string[];
  /** Radio de búsqueda o de influencia usado, en metros (si aplica). */
  radioM?: number | null;
  /** Captura del mapa (dataURL) o null si no se pudo generar. */
  mapaDataUrl?: string | null;
  exclusiones: string[];
  /** Censo de competencia (activa Geo-Fence Conquista). */
  esCompetencia?: boolean;
  /**
   * Capas de categoría (multi-búsqueda sobre la misma geografía).
   * Con 2+, el plan muestra el universo UNA vez (es del territorio) y
   * una sección de resultados por capa. `pois` debe traer la unión.
   */
  capas?: { nombre: string; color: string; pois: Poi[] }[] | null;
}

// ------------------------------------------------------------------
// Tokens del deck
// ------------------------------------------------------------------

const FONDO = "#0a0a0f";
const PANEL = "#12121a";
const LINEA = "#26262e";
const MAGENTA = "#f4368a";
const VIOLETA = "#9d5cf0";
const CIAN = "#2fb9e8";
const BLANCO = "#ffffff";
const GRIS = "#8b8b96";
const GRIS_OSCURO = "#5c5c66";
const TINTA = "#c9c9d1";

const ANCHO_PAG = 816;
const MARGEN = 44;
const CONT = ANCHO_PAG - MARGEN * 2; // 728

let fuentesRegistradas = false;
/** Registra las fuentes una vez. `base` = "" en el navegador
 * (rutas /fonts/*) o la carpeta public en Node (pruebas). */
export function registrarFuentes(base = "") {
  if (fuentesRegistradas) return;
  fuentesRegistradas = true;
  Font.register({
    family: "Manrope",
    fonts: [
      { src: `${base}/fonts/Manrope-600.ttf`, fontWeight: 600 },
      { src: `${base}/fonts/Manrope-800.ttf`, fontWeight: 800 },
    ],
  });
  Font.register({
    family: "Inter",
    fonts: [
      { src: `${base}/fonts/Inter-400.ttf`, fontWeight: 400 },
      { src: `${base}/fonts/Inter-600.ttf`, fontWeight: 600 },
    ],
  });
  Font.register({
    family: "DMMono",
    fonts: [
      { src: `${base}/fonts/DMMono-400.ttf`, fontWeight: 400 },
      { src: `${base}/fonts/DMMono-500.ttf`, fontWeight: 500 },
    ],
  });
  Font.registerHyphenationCallback((palabra) => [palabra]);
}

const fmt = (n: number) => n.toLocaleString("es-MX");

// ------------------------------------------------------------------
// Componentes del sistema (réplicas del deck)
// ------------------------------------------------------------------

/** Isotipo de ondas Gravity (misma geometría que GravityMark de la app). */
function Marca({ size = 40 }: { size?: number }) {
  const trazos: [string, string, number][] = [
    ["M7 19.5 Q4.8 24 7 28.5", "#17607f", 2.6],
    ["M12.5 14.5 Q9.2 24 12.5 33.5", "#1e8ab4", 3],
    ["M19 9 Q14.6 24 19 39", CIAN, 3.6],
    ["M28.5 9 Q32.9 24 28.5 39", MAGENTA, 3.6],
    ["M35.5 14.5 Q38.8 24 35.5 33.5", "#c0399f", 3],
    ["M41 19.5 Q43.2 24 41 28.5", VIOLETA, 2.6],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {trazos.map(([d, color, w], i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={w} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

/** Divisor horizontal con el gradiente firma magenta → violeta → cian. */
function Divisor({ width = CONT, height = 2.5 }) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={MAGENTA} />
          <Stop offset="0.5" stopColor={VIOLETA} />
          <Stop offset="1" stopColor={CIAN} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#grad)" rx={height / 2} />
    </Svg>
  );
}

/** Encabezado de sección estilo deck: etiqueta magenta en mayúsculas,
 * tres puntos de color y título en blanco. */
function Seccion({ etiqueta, titulo }: { etiqueta: string; titulo: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text
          style={{
            fontFamily: "DMMono",
            fontWeight: 500,
            fontSize: 9,
            letterSpacing: 2.6,
            color: MAGENTA,
          }}
        >
          {etiqueta.toUpperCase()}
        </Text>
        <View style={{ flexDirection: "row", marginLeft: 10 }}>
          {[MAGENTA, VIOLETA, CIAN].map((c) => (
            <View
              key={c}
              style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c, marginRight: 4 }}
            />
          ))}
        </View>
      </View>
      <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 19, color: BLANCO, marginTop: 7 }}>
        {titulo}
      </Text>
    </View>
  );
}

/** Footer de tres columnas con línea divisoria arriba. */
function FooterTresCol({ fecha }: { fecha: string }) {
  const col = { flex: 1 } as const;
  const label = {
    fontFamily: "DMMono" as const,
    fontWeight: 500 as const,
    fontSize: 7,
    letterSpacing: 2,
    color: GRIS_OSCURO,
    marginBottom: 3,
  };
  const valor = { fontFamily: "Inter" as const, fontSize: 9, color: GRIS };
  return (
    <View style={{ borderTopWidth: 0.8, borderTopColor: LINEA, paddingTop: 12, flexDirection: "row" }}>
      <View style={col}>
        <Text style={label}>DATE</Text>
        <Text style={valor}>{fecha}</Text>
      </View>
      <View style={col}>
        <Text style={label}>WEBSITE</Text>
        <Text style={valor}>www.linkstudio.mx</Text>
      </View>
      <View style={col}>
        <Text style={label}>E-MAIL</Text>
        <Text style={valor}>hello@linkstudio.mx</Text>
      </View>
    </View>
  );
}

/** Trazos de neón sutiles para el encabezado y el cierre. */
function Neon({ height = 120 }: { height?: number }) {
  return (
    <View style={{ position: "absolute", top: 0, left: 0, width: CONT, height }}>
      <Svg width={CONT} height={height} viewBox={`0 0 ${CONT} ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="neon" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={MAGENTA} />
            <Stop offset="0.5" stopColor={VIOLETA} />
            <Stop offset="1" stopColor={CIAN} />
          </LinearGradient>
        </Defs>
        <Path
          d={`M-20 ${height * 0.75} C ${CONT * 0.25} ${height * 0.35}, ${CONT * 0.6} ${height * 1.05}, ${CONT + 20} ${height * 0.55}`}
          stroke="url(#neon)"
          strokeWidth={1.3}
          opacity={0.5}
        />
        <Path
          d={`M-20 ${height * 0.9} C ${CONT * 0.3} ${height * 0.55}, ${CONT * 0.65} ${height * 1.15}, ${CONT + 20} ${height * 0.75}`}
          stroke="url(#neon)"
          strokeWidth={0.9}
          opacity={0.28}
        />
      </Svg>
    </View>
  );
}

/** Cifra protagonista estilo deck (patrón 58% / 82%). */
function Cifra({ valor, descriptor }: { valor: string; descriptor: string }) {
  return (
    <View style={{ flex: 1, paddingRight: 12 }}>
      <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 30, color: BLANCO }}>
        {valor}
      </Text>
      <Text
        style={{
          fontFamily: "DMMono",
          fontWeight: 400,
          fontSize: 7.2,
          letterSpacing: 1.3,
          color: GRIS,
          marginTop: 3,
          lineHeight: 1.5,
        }}
      >
        {descriptor.toUpperCase()}
      </Text>
    </View>
  );
}

interface Segmento {
  etiqueta: string;
  pct: number;
  color: string;
}

/** Barra apilada + leyenda, idéntica a la del panel de la app. */
function BarraApilada({ titulo, segmentos, width }: { titulo: string; segmentos: Segmento[]; width: number }) {
  return (
    <View style={{ width }}>
      <Text
        style={{
          fontFamily: "DMMono",
          fontWeight: 500,
          fontSize: 7.5,
          letterSpacing: 1.8,
          color: GRIS,
          marginBottom: 5,
        }}
      >
        {titulo.toUpperCase()}
      </Text>
      <View
        style={{
          flexDirection: "row",
          height: 9,
          borderRadius: 4.5,
          overflow: "hidden",
          backgroundColor: PANEL,
        }}
      >
        {segmentos.map(
          (s) =>
            s.pct > 0 && (
              <View key={s.etiqueta} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
            )
        )}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 5 }}>
        {segmentos.map((s, i) => (
          <View key={s.etiqueta} style={{ flexDirection: "row", marginRight: 8 }}>
            {i > 0 && <Text style={{ fontFamily: "DMMono", fontSize: 8, color: GRIS_OSCURO, marginRight: 8 }}>·</Text>}
            <Text style={{ fontFamily: "DMMono", fontSize: 8, color: s.color }}>{s.etiqueta}</Text>
            <Text style={{ fontFamily: "DMMono", fontSize: 8, color: TINTA, marginLeft: 3 }}>
              {s.pct.toLocaleString("es-MX")}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Pill de táctica con borde de gradiente (lámina de tácticas del deck). */
function PillTactica({ nombre, descriptor }: { nombre: string; descriptor: string }) {
  const W = (CONT - 16) / 2;
  const H = 66;
  return (
    <View style={{ width: W, height: H, marginBottom: 16 }}>
      <Svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="pill" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={MAGENTA} />
            <Stop offset="0.5" stopColor={VIOLETA} />
            <Stop offset="1" stopColor={CIAN} />
          </LinearGradient>
        </Defs>
        <Rect x={0.8} y={0.8} width={W - 1.6} height={H - 1.6} rx={12} fill={PANEL} stroke="url(#pill)" strokeWidth={1.2} />
      </Svg>
      <View style={{ paddingTop: 13, paddingLeft: 18, paddingRight: 18 }}>
        <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 13, color: BLANCO }}>
          {nombre}
        </Text>
        <Text style={{ fontFamily: "Inter", fontSize: 9, color: GRIS, marginTop: 4 }}>
          {descriptor}
        </Text>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------
// Lógica de contenido
// ------------------------------------------------------------------

const TACTICAS = {
  poi: { nombre: "Geo-Fence POI", descriptor: "Quién visita lugares clave" },
  conquista: { nombre: "Geo-Fence Conquista", descriptor: "Quién visita a tu competencia" },
  proximidad: { nombre: "Geo-Fence Proximidad", descriptor: "Quién está cerca ahora" },
  trade: { nombre: "Geo-Trade Area", descriptor: "Dónde están tus próximos clientes" },
  targeting: { nombre: "Geo-Targeting", descriptor: "Quién vive y busca en el territorio" },
  pdooh: { nombre: "Geo-PDOOH", descriptor: "El exterior, ahora medible" },
  audiencias: { nombre: "Geo-Audiencias", descriptor: "Marcas sin punto de venta" },
};

/** Tácticas según el modo del análisis (3-4 máximo, las más relevantes). */
export function tacticasParaModo(
  modo: SearchMode,
  esCompetencia: boolean,
  multiCapa = false
) {
  // varias categorías censadas → activación multi-categoría del
  // territorio: Geo-Fence POI + Geo-Targeting encabezan el set
  if (multiCapa) {
    return modo === "cp"
      ? [TACTICAS.poi, TACTICAS.targeting, TACTICAS.pdooh]
      : [TACTICAS.poi, TACTICAS.targeting, TACTICAS.trade];
  }
  switch (modo) {
    case "census":
      return esCompetencia
        ? [TACTICAS.conquista, TACTICAS.poi, TACTICAS.trade, TACTICAS.proximidad]
        : [TACTICAS.poi, TACTICAS.trade, TACTICAS.proximidad];
    case "cp":
      return [TACTICAS.targeting, TACTICAS.pdooh, TACTICAS.poi];
    case "territorial":
      return [TACTICAS.audiencias, TACTICAS.poi, TACTICAS.targeting];
    case "zone":
      return [TACTICAS.targeting, TACTICAS.poi, TACTICAS.trade];
    default:
      return [TACTICAS.poi, TACTICAS.proximidad, TACTICAS.trade];
  }
}

function segmentosNse(u: Universos | null): Segmento[] | null {
  const dist = u?.perfil?.nseDist;
  if (!dist) return null;
  return NIVELES_NSE.map((n) => ({ etiqueta: n.etiqueta, pct: dist[n.clave], color: n.color }));
}

function segmentosEdades(u: Universos | null): Segmento[] | null {
  const rangos = rangosEdadEstandar(u?.perfil?.edades);
  return rangos
    ? rangos.map((r) => ({ etiqueta: r.etiqueta, pct: r.pct, color: r.color }))
    : null;
}

interface MarcaRank {
  marca: string;
  n: number;
  pct: number;
  zonaTop: string | null;
  zonaTopN: number;
}

/**
 * Relevancia de marca para análisis TERRITORIALES: en un territorio
 * amplio la distancia al centroide no significa nada; lo que importa
 * es qué cadenas dominan. Agrupa por nombre normalizado y fusiona
 * variantes con sufijo de sucursal ("OXXO Reforma 222" suma a "OXXO"
 * cuando la marca a secas existe en el territorio).
 */
function rankingMarcas(pois: Poi[], nombresOrigen: string[], max: number): MarcaRank[] {
  interface Grupo {
    n: number;
    nombres: Map<string, number>;
    zonas: Map<string, number>;
  }
  const grupos = new Map<string, Grupo>();
  for (const p of pois) {
    const clave = normalizarComparable(p.nombre);
    if (!clave) continue;
    let g = grupos.get(clave);
    if (!g) {
      g = { n: 0, nombres: new Map(), zonas: new Map() };
      grupos.set(clave, g);
    }
    g.n++;
    const nombre = p.nombre.trim();
    g.nombres.set(nombre, (g.nombres.get(nombre) ?? 0) + 1);
    const z = p.cp ? `CP ${p.cp}` : (nombresOrigen[p.origenIdx] ?? "—");
    g.zonas.set(z, (g.zonas.get(z) ?? 0) + 1);
  }
  // fusión de sufijos de sucursal, de la clave más corta hacia arriba
  const claves = Array.from(grupos.keys()).sort((a, b) => a.length - b.length);
  for (const corta of claves) {
    if (corta.length < 4 || !grupos.has(corta)) continue;
    const base = grupos.get(corta)!;
    for (const larga of claves) {
      if (larga.length <= corta.length || !grupos.has(larga)) continue;
      if (!larga.startsWith(corta + " ")) continue;
      const g = grupos.get(larga)!;
      base.n += g.n;
      g.nombres.forEach((v, k) => base.nombres.set(k, (base.nombres.get(k) ?? 0) + v));
      g.zonas.forEach((v, k) => base.zonas.set(k, (base.zonas.get(k) ?? 0) + v));
      grupos.delete(larga);
    }
  }
  const total = pois.length || 1;
  return Array.from(grupos.values())
    .map((g) => {
      const marca = Array.from(g.nombres.entries()).sort((a, b) => b[1] - a[1])[0][0];
      const zt = Array.from(g.zonas.entries()).sort((a, b) => b[1] - a[1])[0];
      return {
        marca,
        n: g.n,
        pct: Math.round((100 * g.n) / total),
        zonaTop: zt?.[0] ?? null,
        zonaTopN: zt?.[1] ?? 0,
      };
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, max);
}

/** Orden para listas individuales territoriales: por zona/CP y nombre
 * (la distancia al centroide no aporta en esos modos). */
function ordenarPorZona(pois: Poi[], nombresOrigen: string[]): Poi[] {
  const zonaDe = (p: Poi) => (p.cp ? `CP ${p.cp}` : (nombresOrigen[p.origenIdx] ?? ""));
  return [...pois].sort(
    (a, b) => zonaDe(a).localeCompare(zonaDe(b)) || a.nombre.localeCompare(b.nombre)
  );
}

/** Conteo de POIs por zona/CP de una lista. */
function conteoPorZona(pois: Poi[], nombresOrigen: string[]): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const p of pois) {
    const zona = p.cp ? `CP ${p.cp}` : (nombresOrigen[p.origenIdx] ?? "—");
    conteo.set(zona, (conteo.get(zona) ?? 0) + 1);
  }
  return conteo;
}

/** Zona/CP con más POIs de una lista: [nombre, conteo]. */
function zonaTop(pois: Poi[], nombresOrigen: string[]): [string, number] | null {
  if (pois.length === 0) return null;
  return Array.from(conteoPorZona(pois, nombresOrigen).entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];
}

function zonaConMasPois(d: PlanDatos): [string, number] | null {
  return zonaTop(d.pois, d.nombresOrigen);
}

/** 2-3 hallazgos con reglas simples sobre los datos. Redacción sobria.
 * Con capas, prioriza el comparativo entre categorías cuando aporta. */
function hallazgos(d: PlanDatos): string[] {
  const salida: string[] = [];
  const capas = d.capas && d.capas.length > 1 ? d.capas : null;

  // comparativo entre capas: la zona líder de una categoría vs el peso
  // de la otra en esa misma zona (solo si el contraste es real)
  if (capas) {
    const conPois = capas.filter((c) => c.pois.length > 2);
    bucle: for (const a of conPois) {
      const topA = zonaTop(a.pois, d.nombresOrigen);
      if (!topA) continue;
      const pctA = (100 * topA[1]) / a.pois.length;
      for (const b of conPois) {
        if (b === a) continue;
        const enZona = conteoPorZona(b.pois, d.nombresOrigen).get(topA[0]) ?? 0;
        const pctB = (100 * enZona) / b.pois.length;
        if (pctA - pctB >= 15) {
          salida.push(
            `${topA[0]} concentra ${Math.round(pctA)}% de ${a.nombre.toLowerCase()} pero solo ${Math.round(pctB)}% de ${b.nombre.toLowerCase()}.`
          );
          break bucle;
        }
      }
    }
  }

  const nse = segmentosNse(d.universos?.disponible ? d.universos : null);
  if (nse) {
    const top = [...nse].sort((a, b) => b.pct - a.pct)[0];
    salida.push(
      `Nivel socioeconómico dominante: ${top.etiqueta}, con ${top.pct.toLocaleString("es-MX")}% de la población del territorio (índice proxy censal).`
    );
  }
  const zona = zonaConMasPois(d);
  if (!capas && zona && d.pois.length > 1 && d.nombresOrigen.length > 1) {
    salida.push(
      `La mayor concentración de puntos está en ${zona[0]}: ${fmt(zona[1])} de ${fmt(d.pois.length)} (${Math.round((100 * zona[1]) / d.pois.length)}%).`
    );
  }
  const edades = segmentosEdades(d.universos?.disponible ? d.universos : null);
  if (edades) {
    const top = [...edades].sort((a, b) => b.pct - a.pct)[0];
    salida.push(
      `El rango de edad con más peso es ${top.etiqueta}: ${top.pct.toLocaleString("es-MX")}% del universo 18+.`
    );
  }
  return salida.slice(0, 3);
}

const FILAS_TABLA = 12;
const FILAS_POR_CAPA = 8;
const EJEMPLOS_RANKING = 5;
const ALTO_MAPA = Math.round((CONT * 9) / 16); // 16:9 dentro del ancho

type ModoTabla = "distancia" | "porZona" | "ranking";

/** Criterio de la tabla de resultados según el modo del análisis:
 * - orígenes/radio: la distancia al origen sí significa algo → tabla
 *   individual con DIST. M.
 * - censo de marca: lista individual (una sola marca), pero ordenada
 *   por zona/CP — la distancia al centroide del territorio no aporta.
 * - territoriales (CP, zona amplia, censo territorial): relevancia de
 *   marca — qué cadenas dominan el territorio, con conteos. */
function modoTablaDe(modo: SearchMode): ModoTabla {
  if (modo === "origins") return "distancia";
  if (modo === "census") return "porZona";
  return "ranking";
}

/** Alto del lienzo calculado por bloques (una sola página vertical:
 * @react-pdf necesita el tamaño por adelantado, y el contenido es
 * determinista, así que se suma bloque por bloque + margen de
 * seguridad; el sobrante queda como respiro antes del cierre). */
function estimarAltura(d: PlanDatos, titulo: string): number {
  const u = d.universos?.disponible ? d.universos : null;
  const nse = segmentosNse(u);
  const edades = segmentosEdades(u);
  const capas = d.capas && d.capas.length > 1 ? d.capas : null;
  const nHallazgos = hallazgos(d).length;
  const porGeocerca = (u?.porGeocerca ?? []).filter((g) => g.poblacion > 0).slice(0, 8);
  const tacticas = tacticasParaModo(d.modo, d.esCompetencia ?? false, !!capas);

  const lineasTitulo = Math.max(1, Math.ceil(titulo.length / 42));
  let h = MARGEN; // padding superior
  h += 56 + lineasTitulo * 34 + 78; // bloque 1: logo + título + slogan/fecha + divisor
  h += 96; // cifras
  if (capas) h += 26; // fila de conteos por capa
  if (nse) h += 62;
  if (edades) h += 62;
  h += 46; // línea fuente + divisor + aire
  if (d.mapaDataUrl) h += 44 + ALTO_MAPA + (capas ? 20 : 0) + 26; // bloque 3
  const modoTabla = modoTablaDe(d.modo);
  if (capas) {
    // bloque 4a: una sección de resultados por capa
    for (const c of capas) {
      const filasCapa =
        modoTabla === "ranking"
          ? rankingMarcas(c.pois, d.nombresOrigen, FILAS_POR_CAPA).length
          : Math.min(c.pois.length, FILAS_POR_CAPA);
      h += 52 + 16 + 16 + filasCapa * 15.5 + 22;
    }
  } else {
    const filas =
      modoTabla === "ranking"
        ? rankingMarcas(d.pois, d.nombresOrigen, FILAS_TABLA).length
        : Math.min(d.pois.length, FILAS_TABLA);
    if (filas > 0) h += 66 + 18 + 16 + filas * 15.5 + 22; // bloque 4a tabla
    if (modoTabla === "ranking" && filas > 0) {
      // bloque de ejemplos individuales bajo el ranking
      h += 20 + Math.min(d.pois.length, EJEMPLOS_RANKING) * 15 + 8;
    }
  }
  const colIzq = porGeocerca.length > 1 ? 26 + porGeocerca.length * 17 : 0;
  const colDer = nHallazgos > 0 ? 26 + nHallazgos * 52 : 0;
  if (colIzq || colDer) h += Math.max(colIzq, colDer) + 26; // bloque 4b
  h += 66 + Math.max(120, 30 + d.fuentes.length * 14) + 20; // bloque 5a metodología
  h += 52 + Math.ceil(tacticas.length / 2) * 82 + 10; // bloque 5b tácticas
  h += 200 + 66; // bloque 6 cierre + footer
  return Math.ceil(h + 70); // margen de seguridad
}

// ------------------------------------------------------------------
// Documento (una sola página vertical)
// ------------------------------------------------------------------

function PlanDocumento({ d }: { d: PlanDatos }) {
  const titulo = d.titulo?.trim() || `${d.termino} — ${d.alcance}`;
  const fechaLarga = d.fecha.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const u = d.universos?.disponible ? d.universos : null;
  const nse = segmentosNse(u);
  const edades = segmentosEdades(u);
  const capasDoc = d.capas && d.capas.length > 1 ? d.capas : null;
  const tacticas = tacticasParaModo(d.modo, d.esCompetencia ?? false, !!capasDoc);
  // una sección de resultados por capa; sin capas, una sola tabla
  const seccionesResultados = capasDoc
    ? capasDoc.map((c) => ({
        nombre: c.nombre as string | null,
        color: c.color as string | null,
        pois: c.pois,
        filasMax: FILAS_POR_CAPA,
      }))
    : d.pois.length > 0
      ? [
          {
            nombre: null as string | null,
            color: null as string | null,
            pois: d.pois,
            filasMax: FILAS_TABLA,
          },
        ]
      : [];
  const modoTabla = modoTablaDe(d.modo);
  const zonaTopGeneral = zonaConMasPois(d);
  const porGeocerca = (u?.porGeocerca ?? [])
    .filter((g) => g.poblacion > 0)
    .sort((a, b) => b.poblacion - a.poblacion)
    .slice(0, 8);
  const maxPob = porGeocerca[0]?.poblacion ?? 1;
  const listaHallazgos = hallazgos(d);
  const altura = estimarAltura(d, titulo);

  const celdaTh = {
    fontFamily: "DMMono" as const,
    fontWeight: 500 as const,
    fontSize: 7,
    letterSpacing: 1.3,
    color: GRIS_OSCURO,
  };
  const celdaTd = { fontFamily: "Inter" as const, fontSize: 8, color: TINTA };
  const labelCol = {
    fontFamily: "DMMono" as const,
    fontWeight: 500 as const,
    fontSize: 7.5,
    letterSpacing: 1.8,
    color: GRIS,
    marginBottom: 8,
  };

  return (
    <Document title={titulo} author="Gravity · Link Studio" creator="Seeker">
      <Page size={[ANCHO_PAG, altura]} style={{ backgroundColor: FONDO, padding: MARGEN }}>
        {/* ---------- bloque 1 · encabezado compacto ---------- */}
        <Neon height={150} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Marca size={38} />
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 24, color: BLANCO, marginLeft: 10 }}>
              Gravity
            </Text>
          </View>
          <Text style={{ fontFamily: "DMMono", fontSize: 8, letterSpacing: 1.4, color: GRIS }}>
            powered by linkstudio
          </Text>
        </View>

        <View style={{ marginTop: 26 }}>
          <Text
            style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 9.5, letterSpacing: 3, color: MAGENTA }}
          >
            PLAN TERRITORIAL
          </Text>
          <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 28, color: BLANCO, marginTop: 8 }}>
            {titulo}
          </Text>
          <Text style={{ fontFamily: "Inter", fontSize: 11, color: GRIS, marginTop: 8 }}>
            Where physical meets digital.
          </Text>
          <Text style={{ fontFamily: "DMMono", fontSize: 8.5, color: GRIS_OSCURO, marginTop: 10 }}>
            {fechaLarga} · Generado por {d.usuario}
          </Text>
        </View>
        <View style={{ marginTop: 22, marginBottom: 26 }}>
          <Divisor />
        </View>

        {/* ---------- bloque 2 · cifras + barras ---------- */}
        <View style={{ flexDirection: "row" }}>
          <Cifra valor={u ? fmt(u.residencial!.adultos18) : "—"} descriptor="Universo · adultos 18+" />
          <Cifra
            valor={u ? fmt(u.direccionable!.dispositivos) : "—"}
            descriptor="Universo alcanzable · publicidad digital"
          />
          <Cifra valor={fmt(d.pois.length)} descriptor="POIs censados" />
          <Cifra valor={u ? fmt(u.agebs ?? 0) : "—"} descriptor="Zonas censales analizadas" />
        </View>

        {/* conteos por capa: el universo es UNO (del territorio); las
            categorías censadas se listan con su color */}
        {capasDoc && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
            {capasDoc.map((c, i) => (
              <View key={c.nombre} style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}>
                {i > 0 && (
                  <Text style={{ fontFamily: "DMMono", fontSize: 9, color: GRIS_OSCURO, marginRight: 10 }}>·</Text>
                )}
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color, marginRight: 5 }} />
                <Text style={{ fontFamily: "DMMono", fontSize: 9, color: TINTA }}>
                  {c.nombre}: <Text style={{ color: BLANCO }}>{fmt(c.pois.length)}</Text>
                </Text>
              </View>
            ))}
          </View>
        )}

        {nse && (
          <View style={{ marginTop: 20 }}>
            <BarraApilada titulo="Nivel socioeconómico (proxy censal, no AMAI)" segmentos={nse} width={CONT} />
          </View>
        )}
        {edades && (
          <View style={{ marginTop: 14 }}>
            <BarraApilada titulo="Edades · % del universo 18+" segmentos={edades} width={CONT} />
          </View>
        )}
        <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 12 }}>
          {u
            ? `Censo 2020 INEGI · ${fmt(u.agebs ?? 0)} zonas censales${d.criterio ? ` · ${d.criterio}` : ""}`
            : "Universos demográficos no disponibles para esta zona"}
        </Text>
        <View style={{ marginTop: 18, marginBottom: 24 }}>
          <Divisor />
        </View>

        {/* ---------- bloque 3 · mapa real ---------- */}
        {d.mapaDataUrl && (
          <View style={{ marginBottom: 26 }}>
            <Seccion etiqueta="Mapa general" titulo="El territorio" />
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image
              src={d.mapaDataUrl}
              style={{ width: CONT, height: ALTO_MAPA, borderRadius: 8, objectFit: "cover" }}
            />
            {capasDoc && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
                {capasDoc.map((c, i) => (
                  <View key={c.nombre} style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color, marginRight: 4 }} />
                    <Text style={{ fontFamily: "DMMono", fontSize: 8, color: GRIS }}>{c.nombre}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ---------- bloque 4 · resultados + inteligencia ----------
            con capas: UNA sección por capa, cada una con su top de
            puntos y su línea de concentración */}
        {seccionesResultados.length > 0 && (
          <View>
            <Seccion
              etiqueta="Resultados"
              titulo={
                capasDoc
                  ? `${capasDoc.length} categorías sobre el territorio`
                  : modoTabla === "ranking"
                    ? `Marcas dominantes del territorio (${fmt(d.pois.length)} puntos)`
                    : `Top ${Math.min(d.pois.length, FILAS_TABLA)} puntos censados`
              }
            />
            {!capasDoc && zonaTopGeneral && d.nombresOrigen.length > 1 && (
              <Text style={{ fontFamily: "Inter", fontSize: 9, color: GRIS, marginTop: -6, marginBottom: 8 }}>
                Los puntos se concentran en {zonaTopGeneral[0]} ({fmt(zonaTopGeneral[1])} de {fmt(d.pois.length)}).
              </Text>
            )}
            {seccionesResultados.map((sec) => {
              const topZonaSec = zonaTop(sec.pois, d.nombresOrigen);
              // ranking: marcas agrupadas; porZona/distancia: filas individuales
              const rankingCompleto =
                modoTabla === "ranking" ? rankingMarcas(sec.pois, d.nombresOrigen, 1000) : [];
              const filasRank = rankingCompleto.slice(0, sec.filasMax);
              const filas =
                modoTabla === "porZona"
                  ? ordenarPorZona(sec.pois, d.nombresOrigen).slice(0, sec.filasMax)
                  : sec.pois.slice(0, sec.filasMax);
              // ejemplos individuales bajo el ranking: uno por marca para
              // que no se repita cinco veces la misma cadena
              const ejemplos: Poi[] = [];
              if (modoTabla === "ranking" && !capasDoc) {
                const marcasVistas = new Set<string>();
                for (const p of ordenarPorZona(sec.pois, d.nombresOrigen)) {
                  const clave = normalizarComparable(p.nombre);
                  if (marcasVistas.has(clave)) continue;
                  marcasVistas.add(clave);
                  ejemplos.push(p);
                  if (ejemplos.length >= EJEMPLOS_RANKING) break;
                }
              }
              const etiquetaZona = (p: Poi) =>
                (p.cp ? `CP ${p.cp}` : (d.nombresOrigen[p.origenIdx] ?? "—")).slice(0, 19);
              return (
                <View key={sec.nombre ?? "unica"} style={{ marginBottom: capasDoc ? 16 : 0 }}>
                  {sec.nombre && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: sec.color ?? MAGENTA, marginRight: 6 }} />
                      <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 12.5, color: BLANCO }}>
                        {sec.nombre}
                      </Text>
                      <Text style={{ fontFamily: "DMMono", fontSize: 8.5, color: GRIS, marginLeft: 8 }}>
                        {fmt(sec.pois.length)} puntos
                        {topZonaSec && d.nombresOrigen.length > 1
                          ? ` · concentrados en ${topZonaSec[0]} (${Math.round((100 * topZonaSec[1]) / sec.pois.length)}%)`
                          : ""}
                      </Text>
                    </View>
                  )}
                  {modoTabla === "ranking" ? (
                    <View>
                      <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: LINEA, paddingBottom: 4 }}>
                        <Text style={[celdaTh, { width: 250 }]}>MARCA</Text>
                        <Text style={[celdaTh, { width: 58, textAlign: "right" }]}>PUNTOS</Text>
                        <Text style={[celdaTh, { width: 46, textAlign: "right" }]}>%</Text>
                        <Text style={[celdaTh, { flex: 1, paddingLeft: 18 }]}>MAYOR CONCENTRACIÓN</Text>
                      </View>
                      {filasRank.map((m, i) => (
                        <View
                          key={`${sec.nombre ?? ""}:${m.marca}`}
                          style={{
                            flexDirection: "row",
                            paddingTop: 3,
                            paddingBottom: 3,
                            backgroundColor: i % 2 === 1 ? PANEL : undefined,
                          }}
                        >
                          <Text style={[celdaTd, { width: 250, color: BLANCO }]}>
                            {m.marca.length > 42 ? m.marca.slice(0, 41) + "…" : m.marca}
                          </Text>
                          <Text style={[celdaTd, { width: 58, textAlign: "right", fontFamily: "DMMono", color: CIAN }]}>
                            {fmt(m.n)}
                          </Text>
                          <Text style={[celdaTd, { width: 46, textAlign: "right", fontFamily: "DMMono", color: GRIS }]}>
                            {m.pct}%
                          </Text>
                          <Text style={[celdaTd, { flex: 1, paddingLeft: 18, color: GRIS }]}>
                            {m.zonaTop ? `${m.zonaTop.slice(0, 26)} (${fmt(m.zonaTopN)})` : "—"}
                          </Text>
                        </View>
                      ))}
                      {rankingCompleto.length > filasRank.length && (
                        <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 6 }}>
                          +{fmt(rankingCompleto.length - filasRank.length)} marcas más — detalle completo en el Export data (CSV).
                        </Text>
                      )}
                      {ejemplos.length > 0 && (
                        <View style={{ marginTop: 12 }}>
                          <Text style={[celdaTh, { marginBottom: 4 }]}>EJEMPLOS DE PUNTOS</Text>
                          {ejemplos.map((p) => (
                            <Text
                              key={`ej:${p.placeId}`}
                              style={{ fontFamily: "Inter", fontSize: 8, color: GRIS, marginBottom: 3 }}
                            >
                              <Text style={{ color: TINTA }}>
                                {p.nombre.length > 33 ? p.nombre.slice(0, 32) + "…" : p.nombre}
                              </Text>
                              {" — "}
                              {p.direccion.length > 52 ? p.direccion.slice(0, 51) + "…" : p.direccion}
                              {" · "}
                              {etiquetaZona(p)}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>
                  ) : (
                    <View>
                      <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: LINEA, paddingBottom: 4 }}>
                        <Text style={[celdaTh, { width: 190 }]}>NOMBRE</Text>
                        <Text style={[celdaTh, { flex: 1 }]}>DIRECCIÓN</Text>
                        <Text style={[celdaTh, { width: modoTabla === "distancia" ? 118 : 140 }]}>ZONA / CP</Text>
                        {modoTabla === "distancia" && (
                          <Text style={[celdaTh, { width: 48, textAlign: "right" }]}>DIST. M</Text>
                        )}
                      </View>
                      {filas.map((p, i) => (
                        <View
                          key={`${sec.nombre ?? ""}:${p.placeId}`}
                          style={{
                            flexDirection: "row",
                            paddingTop: 3,
                            paddingBottom: 3,
                            backgroundColor: i % 2 === 1 ? PANEL : undefined,
                          }}
                        >
                          <Text style={[celdaTd, { width: 190, color: BLANCO }]}>
                            {p.nombre.length > 33 ? p.nombre.slice(0, 32) + "…" : p.nombre}
                          </Text>
                          <Text style={[celdaTd, { flex: 1, color: GRIS }]}>
                            {p.direccion.length > 46 ? p.direccion.slice(0, 45) + "…" : p.direccion}
                          </Text>
                          <Text style={[celdaTd, { width: modoTabla === "distancia" ? 118 : 140, color: GRIS }]}>
                            {etiquetaZona(p)}
                          </Text>
                          {modoTabla === "distancia" && (
                            <Text style={[celdaTd, { width: 48, textAlign: "right", fontFamily: "DMMono", color: CIAN }]}>
                              {fmt(p.distancia)}
                            </Text>
                          )}
                        </View>
                      ))}
                      {sec.pois.length > filas.length && (
                        <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 6 }}>
                          +{fmt(sec.pois.length - filas.length)} registros más — detalle completo en el Export data (CSV).
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {(porGeocerca.length > 1 || listaHallazgos.length > 0) && (
          <View style={{ flexDirection: "row", marginTop: 24 }}>
            {porGeocerca.length > 1 && (
              <View style={{ width: 360, marginRight: 28 }}>
                <Text style={labelCol}>
                  POBLACIÓN POR {d.modo === "cp" ? "CÓDIGO POSTAL" : "ZONA"}
                </Text>
                {porGeocerca.map((g) => (
                  <View key={g.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                    <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: TINTA, width: 94 }}>
                      {(d.modo === "cp" ? `CP ${g.id}` : g.id).slice(0, 15)}
                    </Text>
                    <View style={{ flex: 1, height: 8, backgroundColor: PANEL, borderRadius: 4 }}>
                      <View
                        style={{
                          width: `${Math.max(2, (100 * g.poblacion) / maxPob)}%`,
                          height: 8,
                          backgroundColor: VIOLETA,
                          borderRadius: 4,
                        }}
                      />
                    </View>
                    <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: BLANCO, width: 56, textAlign: "right" }}>
                      {fmt(g.poblacion)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {listaHallazgos.length > 0 && (
              <View style={{ flex: 1 }}>
                <Text style={labelCol}>HALLAZGOS</Text>
                {listaHallazgos.map((h, i) => (
                  <View
                    key={i}
                    style={{
                      backgroundColor: PANEL,
                      borderLeftWidth: 2,
                      borderLeftColor: [MAGENTA, VIOLETA, CIAN][i % 3],
                      borderRadius: 6,
                      paddingTop: 7,
                      paddingBottom: 7,
                      paddingLeft: 11,
                      paddingRight: 11,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ fontFamily: "Inter", fontSize: 8.5, color: TINTA, lineHeight: 1.45 }}>{h}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={{ marginTop: 24, marginBottom: 24 }}>
          <Divisor />
        </View>

        {/* ---------- bloque 5 · metodología + tácticas ---------- */}
        <Seccion etiqueta="Metodología" titulo="Cómo se construyó este análisis" />
        <View style={{ flexDirection: "row", marginBottom: 22 }}>
          <View style={{ flex: 1, paddingRight: 24 }}>
            <Text style={labelCol}>FUENTES DE DATOS</Text>
            {d.fuentes.map((f) => (
              <Text key={f} style={{ fontFamily: "Inter", fontSize: 8.5, color: TINTA, marginBottom: 4, lineHeight: 1.4 }}>
                · {f}
              </Text>
            ))}
            <Text style={{ fontFamily: "Inter", fontSize: 8.5, color: GRIS, lineHeight: 1.5, marginTop: 8 }}>
              Georreferenciación en lat/long WGS84 (EPSG:4326). Levantamiento
              del {fechaLarga} con Seeker. Deduplicación por identificador de
              lugar{d.exclusiones.length > 0 ? `; exclusiones: ${d.exclusiones.join(", ")}` : ""}.
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={labelCol}>UNIVERSOS DEMOGRÁFICOS</Text>
            <Text style={{ fontFamily: "Inter", fontSize: 8.5, color: TINTA, lineHeight: 1.5 }}>
              Población por interpolación areal sobre AGEBs urbanas del Censo
              2020 (INEGI), contra la unión de geometrías del análisis
              {d.criterio ? ` (${d.criterio})` : ""}
              {d.radioM ? `, radio de ${d.radioM >= 1000 ? `${d.radioM / 1000} km` : `${d.radioM} m`}` : ""}.
              Universo alcanzable: adultos 18+ con smartphone alcanzables por
              publicidad digital.
            </Text>
            <Text style={{ fontFamily: "Inter", fontSize: 8.5, color: GRIS, lineHeight: 1.5, marginTop: 8 }}>
              El índice socioeconómico es un proxy censal (escolaridad,
              vehículos e internet por vivienda); no es NSE AMAI. Los rangos
              de edad 25-64 se estiman con estructura nacional del Censo 2020.
            </Text>
          </View>
        </View>

        <Seccion etiqueta="Siguientes pasos" titulo="Qué se puede activar sobre este territorio" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          {tacticas.map((t) => (
            <PillTactica key={t.nombre} nombre={t.nombre} descriptor={t.descriptor} />
          ))}
        </View>

        {/* ---------- bloque 6 · cierre ---------- */}
        <View style={{ position: "absolute", bottom: MARGEN, left: MARGEN, width: CONT }}>
          <View style={{ alignItems: "center", marginBottom: 26, position: "relative" }}>
            <Neon height={110} />
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
              <Marca size={30} />
              <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 19, color: BLANCO, marginLeft: 8 }}>
                Gravity
              </Text>
            </View>
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 14, color: BLANCO, marginTop: 14 }}>
              Hagamos del mundo físico tu mejor canal digital.
            </Text>
            <View style={{ flexDirection: "row", marginTop: 8 }}>
              <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 10, color: MAGENTA }}>
                Real Audiences.{" "}
              </Text>
              <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 10, color: CIAN }}>
                Real Visits.{" "}
              </Text>
              <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 10, color: VIOLETA }}>
                Real Gravity.
              </Text>
            </View>
          </View>
          <FooterTresCol fecha={fechaLarga} />
        </View>
      </Page>
    </Document>
  );
}

/** Nombre de archivo: Gravity_Plan_[título]_[fecha].pdf */
export function nombreArchivoPlan(titulo: string, fecha: Date): string {
  const limpio =
    titulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "analisis";
  const f = fecha.toISOString().slice(0, 10);
  return `Gravity_Plan_${limpio}_${f}.pdf`;
}

/** Genera el PDF del plan. `baseFuentes` solo se usa en pruebas Node. */
export async function generarPlanPdf(
  datos: PlanDatos,
  baseFuentes = ""
): Promise<Blob> {
  registrarFuentes(baseFuentes);
  return pdf(<PlanDocumento d={datos} />).toBlob();
}

/** Variante Node para pruebas (buffer en vez de Blob). */
export function documentoPlan(datos: PlanDatos) {
  return <PlanDocumento d={datos} />;
}
