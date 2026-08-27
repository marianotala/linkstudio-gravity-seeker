// Export plan (PDF) — documento comercial 16:9 con el sistema de
// diseño del pitch deck de Gravity: fondo #0a0a0f, paleta
// magenta/violeta/cian, encabezados con etiqueta magenta + tres
// puntos, cifras gigantes, divisores de gradiente y pills de
// tácticas. Renderizado con @react-pdf/renderer EN EL CLIENTE
// (PDF vectorial, sin headless browser, la key de Google nunca
// participa); las fuentes TTF viven en /public/fonts.

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

// ------------------------------------------------------------------
// Datos que el plan necesita del análisis activo
// ------------------------------------------------------------------

export interface PlanDatos {
  modo: SearchMode;
  /** Marca / término / categoría buscada (para título y textos). */
  termino: string;
  /** Ciudad, zonas o lista de CPs (para título). */
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

const PAGINA: [number, number] = [960, 540];
const MARGEN = 48;

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
  // sin cortes de palabra: los títulos del deck no se parten
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
function Divisor({ width = PAGINA[0] - MARGEN * 2, height = 2.5 }) {
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

/** Lockup chico de páginas interiores: "Gravity ✕ linkstudio". */
function LockupChico() {
  return (
    <View
      style={{
        position: "absolute",
        top: 22,
        right: MARGEN,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Marca size={16} />
      <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 9, color: BLANCO, marginLeft: 5 }}>
        Gravity
      </Text>
      <Text style={{ fontFamily: "DMMono", fontSize: 8, color: GRIS_OSCURO, marginLeft: 5 }}>
        ✕ linkstudio
      </Text>
    </View>
  );
}

/** Encabezado de sección estilo deck: etiqueta magenta en mayúsculas,
 * tres puntos de color y título grande en blanco. */
function Encabezado({ etiqueta, titulo }: { etiqueta: string; titulo: string }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text
        style={{
          fontFamily: "DMMono",
          fontWeight: 500,
          fontSize: 10,
          letterSpacing: 3,
          color: MAGENTA,
        }}
      >
        {etiqueta.toUpperCase()}
      </Text>
      <View style={{ flexDirection: "row", marginTop: 6, marginBottom: 8 }}>
        {[MAGENTA, VIOLETA, CIAN].map((c) => (
          <View
            key={c}
            style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: c, marginRight: 5 }}
          />
        ))}
      </View>
      <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 26, color: BLANCO }}>
        {titulo}
      </Text>
    </View>
  );
}

/** Footer de tres columnas con línea divisoria arriba (portada/cierre). */
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
    <View style={{ position: "absolute", bottom: 26, left: MARGEN, right: MARGEN }}>
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
    </View>
  );
}

/** Trazos de neón sutiles (solo portada y cierre). El Svg debe ser
 * MÁS CHICO que el área de contenido (página menos padding): react-pdf
 * no puede partir un Svg entre páginas y uno de página completa
 * empuja una hoja extra aunque esté posicionado absoluto. Se dibuja el
 * viewBox completo comprimido al área disponible (curvas abstractas:
 * la compresión no se nota). */
const NEON_W = PAGINA[0] - MARGEN * 2;
const NEON_H = PAGINA[1] - MARGEN * 2 - 4;
function Neon() {
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: NEON_W,
        height: NEON_H,
      }}
    >
      <Svg
        width={NEON_W}
        height={NEON_H}
        viewBox={`0 0 ${PAGINA[0]} ${PAGINA[1]}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="neon" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={MAGENTA} />
            <Stop offset="0.5" stopColor={VIOLETA} />
            <Stop offset="1" stopColor={CIAN} />
          </LinearGradient>
        </Defs>
        <Path
          d="M-40 470 C 240 380, 560 560, 1000 430"
          stroke="url(#neon)"
          strokeWidth={1.4}
          opacity={0.55}
        />
        <Path
          d="M-40 500 C 280 420, 620 590, 1000 470"
          stroke="url(#neon)"
          strokeWidth={0.9}
          opacity={0.32}
        />
        <Path
          d="M560 -20 C 700 120, 900 60, 1000 160"
          stroke="url(#neon)"
          strokeWidth={0.9}
          opacity={0.25}
        />
      </Svg>
    </View>
  );
}

/** Cifra protagonista estilo deck (patrón 58% / 82%). */
function Cifra({ valor, descriptor }: { valor: string; descriptor: string }) {
  return (
    <View style={{ flex: 1, paddingRight: 14 }}>
      <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 40, color: BLANCO }}>
        {valor}
      </Text>
      <Text
        style={{
          fontFamily: "DMMono",
          fontWeight: 400,
          fontSize: 8,
          letterSpacing: 1.6,
          color: GRIS,
          marginTop: 4,
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
          fontSize: 8,
          letterSpacing: 2,
          color: GRIS,
          marginBottom: 6,
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
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
        {segmentos.map((s, i) => (
          <View key={s.etiqueta} style={{ flexDirection: "row", marginRight: 8 }}>
            {i > 0 && <Text style={{ fontFamily: "DMMono", fontSize: 8, color: GRIS_OSCURO, marginRight: 8 }}>·</Text>}
            <Text style={{ fontFamily: "DMMono", fontSize: 8, color: s.color }}>{s.etiqueta}</Text>
            <Text style={{ fontFamily: "DMMono", fontSize: 8, color: "#c9c9d1", marginLeft: 3 }}>
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
  const W = (PAGINA[0] - MARGEN * 2 - 20) / 2;
  const H = 74;
  return (
    <View style={{ width: W, height: H, marginBottom: 20 }}>
      <Svg width={W} height={H} style={{ position: "absolute", top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id="pill" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={MAGENTA} />
            <Stop offset="0.5" stopColor={VIOLETA} />
            <Stop offset="1" stopColor={CIAN} />
          </LinearGradient>
        </Defs>
        <Rect x={0.8} y={0.8} width={W - 1.6} height={H - 1.6} rx={14} fill={PANEL} stroke="url(#pill)" strokeWidth={1.2} />
      </Svg>
      <View style={{ paddingTop: 15, paddingLeft: 20, paddingRight: 20 }}>
        <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 14, color: BLANCO }}>
          {nombre}
        </Text>
        <Text style={{ fontFamily: "Inter", fontSize: 9.5, color: GRIS, marginTop: 5 }}>
          {descriptor}
        </Text>
      </View>
    </View>
  );
}

/** Página interior estándar: fondo, lockup y número de página. */
function Pagina({ children }: { children: React.ReactNode }) {
  return (
    <Page size={PAGINA} style={{ backgroundColor: FONDO, padding: MARGEN, paddingTop: 52 }}>
      <LockupChico />
      {children}
    </Page>
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
export function tacticasParaModo(modo: SearchMode, esCompetencia: boolean) {
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

/** Zona/CP con más POIs: [nombre, conteo]. */
function zonaConMasPois(d: PlanDatos): [string, number] | null {
  if (d.pois.length === 0) return null;
  const conteo = new Map<string, number>();
  for (const p of d.pois) {
    const zona = p.cp ? `CP ${p.cp}` : (d.nombresOrigen[p.origenIdx] ?? "—");
    conteo.set(zona, (conteo.get(zona) ?? 0) + 1);
  }
  return Array.from(conteo.entries()).sort((a, b) => b[1] - a[1])[0];
}

/** 2-3 hallazgos con reglas simples sobre los datos. Redacción sobria. */
function hallazgos(d: PlanDatos): string[] {
  const salida: string[] = [];
  const nse = segmentosNse(d.universos);
  if (nse) {
    const top = [...nse].sort((a, b) => b.pct - a.pct)[0];
    salida.push(
      `Nivel socioeconómico dominante: ${top.etiqueta}, con ${top.pct.toLocaleString("es-MX")}% de la población del territorio (índice proxy censal).`
    );
  }
  const zona = zonaConMasPois(d);
  if (zona && d.pois.length > 1 && d.nombresOrigen.length > 1) {
    salida.push(
      `La mayor concentración de puntos está en ${zona[0]}: ${fmt(zona[1])} de ${fmt(d.pois.length)} (${Math.round((100 * zona[1]) / d.pois.length)}%).`
    );
  }
  const edades = segmentosEdades(d.universos);
  if (edades) {
    const top = [...edades].sort((a, b) => b.pct - a.pct)[0];
    salida.push(
      `El rango de edad con más peso es ${top.etiqueta}: ${top.pct.toLocaleString("es-MX")}% del universo 18+.`
    );
  }
  return salida.slice(0, 3);
}

// ------------------------------------------------------------------
// Documento
// ------------------------------------------------------------------

function PlanDocumento({ d }: { d: PlanDatos }) {
  const fechaLarga = d.fecha.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const u = d.universos?.disponible ? d.universos : null;
  const nse = segmentosNse(u);
  const edades = segmentosEdades(u);
  const tacticas = tacticasParaModo(d.modo, d.esCompetencia ?? false);
  // 16 filas + la nota "+N más" caben en la página 16:9 sin partirse
  const topPois = d.pois.slice(0, 16);
  const zonaTop = zonaConMasPois(d);
  const porGeocerca = (u?.porGeocerca ?? [])
    .filter((g) => g.poblacion > 0)
    .sort((a, b) => b.poblacion - a.poblacion)
    .slice(0, 9);
  const maxPob = porGeocerca[0]?.poblacion ?? 1;
  const listaHallazgos = hallazgos(d);

  const celdaTh = {
    fontFamily: "DMMono" as const,
    fontWeight: 500 as const,
    fontSize: 7.5,
    letterSpacing: 1.5,
    color: GRIS_OSCURO,
  };
  const celdaTd = { fontFamily: "Inter" as const, fontSize: 8.5, color: "#c9c9d1" };

  return (
    <Document
      title={`Plan territorial — ${d.termino} — ${d.alcance}`}
      author="Gravity · Link Studio"
      creator="Seeker"
    >
      {/* ---------- 1 · PORTADA ---------- */}
      <Page size={PAGINA} style={{ backgroundColor: FONDO, padding: MARGEN }}>
        <Neon />
        <Text
          style={{
            position: "absolute",
            top: 24,
            right: MARGEN,
            fontFamily: "DMMono",
            fontSize: 8.5,
            letterSpacing: 1.5,
            color: GRIS,
          }}
        >
          powered by linkstudio
        </Text>

        <View style={{ marginTop: 64, flexDirection: "row", alignItems: "center" }}>
          <Marca size={64} />
          <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 40, color: BLANCO, marginLeft: 16 }}>
            Gravity
          </Text>
        </View>

        <View style={{ marginTop: 46, width: 700 }}>
          <Text
            style={{
              fontFamily: "DMMono",
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: 3,
              color: MAGENTA,
            }}
          >
            PLAN TERRITORIAL
          </Text>
          <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 34, color: BLANCO, marginTop: 10 }}>
            {d.termino} — {d.alcance}
          </Text>
          <Text style={{ fontFamily: "Inter", fontSize: 12, color: GRIS, marginTop: 14 }}>
            El dinero va al clic. La vida ocurre en el mundo físico.
          </Text>
          <Text style={{ fontFamily: "DMMono", fontSize: 9, color: GRIS_OSCURO, marginTop: 22 }}>
            {fechaLarga} · Generado por {d.usuario}
          </Text>
        </View>

        <FooterTresCol fecha={fechaLarga} />
      </Page>

      {/* ---------- 2 · RESUMEN EJECUTIVO ---------- */}
      <Pagina>
        <Encabezado etiqueta="Resumen ejecutivo" titulo="El territorio en números" />
        <View style={{ flexDirection: "row", marginTop: 10 }}>
          <Cifra
            valor={u ? fmt(u.residencial!.adultos18) : "—"}
            descriptor="Universo · adultos 18+"
          />
          <Cifra
            valor={u ? fmt(u.direccionable!.dispositivos) : "—"}
            descriptor="Universo alcanzable · publicidad digital"
          />
          <Cifra valor={fmt(d.pois.length)} descriptor="POIs censados" />
          <Cifra valor={u ? fmt(u.agebs ?? 0) : "—"} descriptor="Zonas censales analizadas" />
        </View>

        <View style={{ marginTop: 30 }}>
          <Divisor />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 26 }}>
          {nse && <BarraApilada titulo="Nivel socioeconómico (proxy censal, no AMAI)" segmentos={nse} width={420} />}
          {edades && <BarraApilada titulo="Edades · % del universo 18+" segmentos={edades} width={420} />}
        </View>

        <Text
          style={{
            position: "absolute",
            bottom: 28,
            left: MARGEN,
            fontFamily: "DMMono",
            fontSize: 8,
            color: GRIS_OSCURO,
          }}
        >
          {u
            ? `Censo 2020 INEGI · ${fmt(u.agebs ?? 0)} zonas censales${d.criterio ? ` · ${d.criterio}` : ""}`
            : "Universos demográficos no disponibles para esta zona"}
        </Text>
      </Pagina>

      {/* ---------- 3 · MAPA GENERAL ---------- */}
      {d.mapaDataUrl && (
        <Page size={PAGINA} style={{ backgroundColor: FONDO }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image
            src={d.mapaDataUrl}
            style={{ position: "absolute", top: 0, left: 0, width: PAGINA[0], height: PAGINA[1], objectFit: "cover" }}
          />
          <View
            style={{
              position: "absolute",
              top: 22,
              left: MARGEN,
              backgroundColor: FONDO,
              opacity: 0.92,
              paddingTop: 8,
              paddingBottom: 8,
              paddingLeft: 12,
              paddingRight: 12,
              borderRadius: 6,
            }}
          >
            <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 9, letterSpacing: 2.5, color: MAGENTA }}>
              MAPA GENERAL
            </Text>
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 14, color: BLANCO, marginTop: 3 }}>
              {d.termino} — {d.alcance}
            </Text>
          </View>
          <View
            style={{
              position: "absolute",
              bottom: 20,
              left: MARGEN,
              backgroundColor: FONDO,
              opacity: 0.92,
              paddingTop: 6,
              paddingBottom: 6,
              paddingLeft: 12,
              paddingRight: 12,
              borderRadius: 6,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: MAGENTA, marginRight: 5 }} />
            <Text style={{ fontFamily: "DMMono", fontSize: 8, color: "#c9c9d1", marginRight: 12 }}>POIs</Text>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: d.modo === "cp" ? VIOLETA : CIAN, marginRight: 5 }} />
            <Text style={{ fontFamily: "DMMono", fontSize: 8, color: "#c9c9d1" }}>
              {d.modo === "cp" ? "Polígonos de CP" : d.modo === "zone" ? "Zonas" : "Área de análisis"}
            </Text>
          </View>
        </Page>
      )}

      {/* ---------- 4 · RESULTADOS ---------- */}
      {topPois.length > 0 && (
        <Pagina>
          <Encabezado etiqueta="Resultados" titulo={`Top ${topPois.length} puntos censados`} />
          {zonaTop && d.nombresOrigen.length > 1 && (
            <Text style={{ fontFamily: "Inter", fontSize: 9.5, color: GRIS, marginTop: -8, marginBottom: 10 }}>
              Los puntos se concentran en {zonaTop[0]} ({fmt(zonaTop[1])} de {fmt(d.pois.length)}).
            </Text>
          )}
          <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: LINEA, paddingBottom: 5 }}>
            <Text style={[celdaTh, { width: 200 }]}>NOMBRE</Text>
            <Text style={[celdaTh, { flex: 1 }]}>DIRECCIÓN</Text>
            <Text style={[celdaTh, { width: 150 }]}>ZONA / CP</Text>
            <Text style={[celdaTh, { width: 62, textAlign: "right" }]}>DIST. M</Text>
          </View>
          {topPois.map((p, i) => (
            <View
              key={p.placeId}
              style={{
                flexDirection: "row",
                paddingTop: 3.2,
                paddingBottom: 3.2,
                backgroundColor: i % 2 === 1 ? PANEL : undefined,
              }}
            >
              <Text style={[celdaTd, { width: 200, color: BLANCO }]}>
                {p.nombre.length > 34 ? p.nombre.slice(0, 33) + "…" : p.nombre}
              </Text>
              <Text style={[celdaTd, { flex: 1, color: GRIS }]}>
                {p.direccion.length > 52 ? p.direccion.slice(0, 51) + "…" : p.direccion}
              </Text>
              <Text style={[celdaTd, { width: 150, color: GRIS }]}>
                {(p.cp ? `CP ${p.cp}` : (d.nombresOrigen[p.origenIdx] ?? "—")).slice(0, 24)}
              </Text>
              <Text style={[celdaTd, { width: 62, textAlign: "right", fontFamily: "DMMono", color: CIAN }]}>
                {fmt(p.distancia)}
              </Text>
            </View>
          ))}
          {d.pois.length > topPois.length && (
            <Text style={{ fontFamily: "DMMono", fontSize: 8, color: GRIS_OSCURO, marginTop: 8 }}>
              +{fmt(d.pois.length - topPois.length)} registros más — detalle completo en el Export data (CSV).
            </Text>
          )}
        </Pagina>
      )}

      {/* ---------- 5 · INTELIGENCIA TERRITORIAL ---------- */}
      {u && (porGeocerca.length > 0 || listaHallazgos.length > 0) && (
        <Pagina>
          <Encabezado etiqueta="Inteligencia territorial" titulo="Dónde vive el universo" />
          <View style={{ flexDirection: "row" }}>
            <View style={{ width: 470 }}>
              {porGeocerca.length > 1 && (
                <View>
                  <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 8, letterSpacing: 2, color: GRIS, marginBottom: 8 }}>
                    POBLACIÓN POR {d.modo === "cp" ? "CÓDIGO POSTAL" : "ZONA"}
                  </Text>
                  {porGeocerca.map((g) => (
                    <View key={g.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5.5 }}>
                      <Text style={{ fontFamily: "DMMono", fontSize: 8, color: "#c9c9d1", width: 118 }}>
                        {(d.modo === "cp" ? `CP ${g.id}` : g.id).slice(0, 18)}
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
                      <Text style={{ fontFamily: "DMMono", fontSize: 8, color: BLANCO, width: 66, textAlign: "right" }}>
                        {fmt(g.poblacion)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {nse && (
                <View style={{ marginTop: porGeocerca.length > 1 ? 16 : 0 }}>
                  <BarraApilada titulo="Distribución NSE (proxy censal)" segmentos={nse} width={470} />
                </View>
              )}
            </View>

            <View style={{ flex: 1, marginLeft: 34 }}>
              <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 8, letterSpacing: 2, color: GRIS, marginBottom: 10 }}>
                HALLAZGOS
              </Text>
              {listaHallazgos.map((h, i) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: PANEL,
                    borderLeftWidth: 2,
                    borderLeftColor: [MAGENTA, VIOLETA, CIAN][i % 3],
                    borderRadius: 6,
                    paddingTop: 9,
                    paddingBottom: 9,
                    paddingLeft: 12,
                    paddingRight: 12,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontFamily: "Inter", fontSize: 9.5, color: "#c9c9d1", lineHeight: 1.5 }}>{h}</Text>
                </View>
              ))}
            </View>
          </View>
        </Pagina>
      )}

      {/* ---------- 6 · METODOLOGÍA ---------- */}
      <Pagina>
        <Encabezado etiqueta="Metodología" titulo="Cómo se construyó este análisis" />
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, paddingRight: 30 }}>
            <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 8, letterSpacing: 2, color: GRIS, marginBottom: 8 }}>
              FUENTES DE DATOS
            </Text>
            {d.fuentes.map((f) => (
              <Text key={f} style={{ fontFamily: "Inter", fontSize: 9.5, color: "#c9c9d1", marginBottom: 5 }}>
                · {f}
              </Text>
            ))}
            <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 8, letterSpacing: 2, color: GRIS, marginTop: 16, marginBottom: 8 }}>
              LEVANTAMIENTO
            </Text>
            <Text style={{ fontFamily: "Inter", fontSize: 9.5, color: "#c9c9d1", lineHeight: 1.6 }}>
              Georreferenciación de puntos en lat/long WGS84 (EPSG:4326).
              Levantamiento realizado el {fechaLarga} con Seeker.
              Deduplicación por identificador de lugar{d.exclusiones.length > 0 ? ` y exclusiones aplicadas: ${d.exclusiones.join(", ")}` : ""}.
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 8, letterSpacing: 2, color: GRIS, marginBottom: 8 }}>
              UNIVERSOS DEMOGRÁFICOS
            </Text>
            <Text style={{ fontFamily: "Inter", fontSize: 9.5, color: "#c9c9d1", lineHeight: 1.6 }}>
              Población calculada por interpolación areal sobre AGEBs urbanas
              del Censo de Población y Vivienda 2020 (INEGI), contra la unión
              de geometrías del análisis{d.criterio ? ` (${d.criterio})` : ""}
              {d.radioM ? `, con radio de ${d.radioM >= 1000 ? `${d.radioM / 1000} km` : `${d.radioM} m`}` : ""}.
              El universo alcanzable estima adultos 18+ con smartphone y
              alcanzables por publicidad digital (factores documentados en la
              plataforma).
            </Text>
            <Text style={{ fontFamily: "Inter", fontSize: 9.5, color: GRIS, lineHeight: 1.6, marginTop: 10 }}>
              El índice socioeconómico es un proxy censal construido con
              escolaridad, vehículos e internet por vivienda. No es NSE AMAI.
              Los rangos de edad 25-64 se estiman con estructura nacional del
              Censo 2020 sobre los bloques censales reales de la zona.
            </Text>
          </View>
        </View>
        <View style={{ position: "absolute", bottom: 30, left: MARGEN }}>
          <Divisor width={PAGINA[0] - MARGEN * 2} />
        </View>
      </Pagina>

      {/* ---------- 7 · SIGUIENTES PASOS ---------- */}
      <Pagina>
        <Encabezado etiqueta="Siguientes pasos" titulo="Qué se puede activar sobre este territorio" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 8 }}>
          {tacticas.map((t) => (
            <PillTactica key={t.nombre} nombre={t.nombre} descriptor={t.descriptor} />
          ))}
        </View>
        <Text style={{ position: "absolute", bottom: 30, left: MARGEN, fontFamily: "Inter", fontSize: 9, color: GRIS_OSCURO }}>
          Tácticas seleccionadas según el tipo de análisis. El equipo de Gravity arma el plan de medios sobre este territorio.
        </Text>
      </Pagina>

      {/* ---------- 8 · CIERRE ---------- */}
      <Page size={PAGINA} style={{ backgroundColor: FONDO, padding: MARGEN }}>
        <Neon />
        <View style={{ marginTop: 130, alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Marca size={46} />
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 30, color: BLANCO, marginLeft: 12 }}>
              Gravity
            </Text>
          </View>
          <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 20, color: BLANCO, marginTop: 30 }}>
            Hagamos del mundo físico tu mejor canal digital.
          </Text>
          <View style={{ flexDirection: "row", marginTop: 14 }}>
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 12, color: MAGENTA }}>
              Real Audiences.{" "}
            </Text>
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 12, color: CIAN }}>
              Real Visits.{" "}
            </Text>
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 12, color: VIOLETA }}>
              Real Gravity.
            </Text>
          </View>
        </View>
        <FooterTresCol fecha={fechaLarga} />
      </Page>
    </Document>
  );
}

/** Nombre de archivo: Gravity_Plan_[término]_[fecha].pdf */
export function nombreArchivoPlan(termino: string, fecha: Date): string {
  const limpio = termino
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "analisis";
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
