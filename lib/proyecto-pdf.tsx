// Export plan de PROYECTO (Planner F5) — la versión mayor del Export
// plan: UN solo PDF vertical con la historia completa del territorio
// del cliente. Reutiliza el sistema del deck (plan-pdf.tsx presta
// tokens y componentes): portada, resumen ejecutivo con el universo
// CONSOLIDADO deduplicado, mapa general multi-capa, una sección por
// rol (POIs / competencia con el traslape / proximidad / plan OOH),
// cada una con SU PROPIO bloque demográfico consolidado,
// inteligencia territorial comparando capas, tácticas con su sustento
// y metodología consolidada al final.

import React from "react";
import { Document, Image, Page, Text, View, pdf } from "@react-pdf/renderer";
import {
  ALTO_MAPA,
  ALTO_PILL,
  ANCHO_PAG,
  BLANCO,
  BarraApilada,
  CIAN,
  CONT,
  Cifra,
  Divisor,
  FONDO,
  FooterTresCol,
  GRIS,
  GRIS_OSCURO,
  LINEA,
  MAGENTA,
  MARGEN,
  Marca,
  Neon,
  PANEL,
  PillTactica,
  Seccion,
  TINTA,
  VIOLETA,
  fmt,
  ordenarTacticas,
  registrarFuentes,
  segmentosEdades,
  segmentosNse,
} from "./plan-pdf";
import { CLAVES_TACTICAS, TACTICAS, type TacticaClave } from "./tacticas";
import type { Poi, RolLevantamiento, Universos } from "./types";

// ------------------------------------------------------------------
// Datos que el plan de proyecto necesita
// ------------------------------------------------------------------

export interface CapaPlanProyecto {
  id: string;
  nombre: string;
  rol: RolLevantamiento;
  color: string;
  pois: Poi[];
  /** Universo individual guardado del levantamiento (survey_universes). */
  universo: Universos | null;
}

export interface TraslapeProyecto {
  etiquetaA: string;
  etiquetaB: string;
  poblacion: number;
  pctBase: number;
  poblacionBase: number;
  /** true cuando es el par propios × competencia (el dato estrella). */
  esConquista: boolean;
}

export interface PantallaProyecto {
  nombre: string;
  tipo: string | null;
  medio: string | null;
  impresiones: number | null;
  /** PDVs que apoya, con distancia en metros. */
  pdvs: { nombre: string; distancia_m: number }[];
}

export interface OohProyecto {
  nombre: string;
  pantallas: PantallaProyecto[];
  totalPdvs: number;
  cubiertos: number;
  impresiones: number | null;
  radioTexto: string;
  /** Nombres de PDVs sin cobertura ([] si no se pudieron resolver). */
  sinCobertura: string[];
  /** Mini-mapa de líneas pantalla→PDV (dataURL) o null. */
  mapaDataUrl?: string | null;
}

export interface PlanProyectoDatos {
  cliente: string;
  /** Título del plan; vacío = "Plan territorial — [Cliente]". */
  titulo?: string | null;
  usuario: string;
  fecha: Date;
  /** Universo CONSOLIDADO deduplicado (F4) — obligatorio para exportar. */
  consolidado: Universos;
  /** Suma simple de los universos individuales (para la nota de dedupe). */
  sumaSimple: number;
  nLevantamientos: number;
  /** Capas NO-OOH del plan (propios, competencia, proximidad). */
  capas: CapaPlanProyecto[];
  /** Cruce OOH del proyecto (null si el plan no tiene). */
  ooh: OohProyecto | null;
  traslapes: TraslapeProyecto[];
  mapaDataUrl?: string | null;
  tacticas: TacticaClave[];
  fuentes: string[];
  /** Universo consolidado POR ROL (unión de las geometrías de las
   * capas de esa táctica) — el bloque demográfico de cada sección. */
  universoRol?: Partial<Record<RolLevantamiento, Universos>>;
  /** Mapa POR TÁCTICA (solo las capas de ese rol) — lo usa el formato
   * presentación 16:9 en su layout mapa-izquierda / datos-derecha. */
  mapasRol?: Partial<Record<RolLevantamiento, string | null>>;
}

const ETIQUETA_SECCION_ROL: Record<RolLevantamiento, [string, string]> = {
  poi_propio: ["POIs", "Los puntos de interés del plan"],
  competencia: ["Competencia", "Dónde está la competencia y cuánta gente comparte territorio"],
  proximidad: ["Proximidad", "El universo cerca de tus puntos de venta"],
  ooh: ["Plan OOH", "Pantallas que apoyan a los puntos de venta"],
};

export const NOMBRE_ROL: Record<RolLevantamiento, string> = {
  poi_propio: "POIs",
  competencia: "Competencia",
  proximidad: "Proximidad",
  ooh: "Pantallas",
};

const ORDEN_ROLES: RolLevantamiento[] = ["poi_propio", "competencia", "proximidad"];
const FILAS_PROPIOS = 12;
const FILAS_PANTALLAS = 12;
const MAX_SIN_COBERTURA = 12;
const EJEMPLOS_PROXIMIDAD = 6;
const ALTO_MAPA_OOH = Math.round((CONT * 7) / 16);

// ------------------------------------------------------------------
// Lecturas automáticas
// ------------------------------------------------------------------

const adultos = (u: Universos | null) =>
  u?.disponible ? (u.residencial?.adultos18 ?? 0) : 0;

/** CP con más puntos de una lista (si al menos la mitad trae CP). */
function cpTop(pois: Poi[]): [string, number] | null {
  const conCp = pois.filter((p) => p.cp);
  if (conCp.length < pois.length / 2 || conCp.length === 0) return null;
  const conteo = new Map<string, number>();
  conCp.forEach((p) => conteo.set(p.cp!, (conteo.get(p.cp!) ?? 0) + 1));
  return Array.from(conteo.entries()).sort((a, b) => b[1] - a[1])[0];
}

/** % del universo 18+ en los dos niveles altos de NSE (AB + C+). */
function pctNseAlto(u: Universos | null): number | null {
  const dist = u?.disponible ? u.perfil?.nseDist : null;
  if (!dist) return null;
  return (dist.ab ?? 0) + (dist.c_mas ?? 0);
}

/** 2-3 hallazgos cruzando capas — redacción sobria, solo contrastes reales. */
export function hallazgosProyecto(d: PlanProyectoDatos): string[] {
  const salida: string[] = [];
  const propios = d.capas.filter((c) => c.rol === "poi_propio");
  const competencia = d.capas.filter((c) => c.rol === "competencia");
  const proximidad = d.capas.filter((c) => c.rol === "proximidad");

  // 1) concentración de la competencia donde la cobertura propia es menor
  const poisComp = competencia.flatMap((c) => c.pois);
  const poisProp = propios.flatMap((c) => c.pois);
  const topComp = cpTop(poisComp);
  if (topComp && poisProp.length > 0) {
    const propiosAhi = poisProp.filter((p) => p.cp === topComp[0]).length;
    const pctComp = Math.round((100 * topComp[1]) / poisComp.length);
    const pctProp = Math.round((100 * propiosAhi) / poisProp.length);
    if (pctComp - pctProp >= 10) {
      salida.push(
        `La competencia se concentra en CP ${topComp[0]} (${fmt(topComp[1])} puntos, ${pctComp}%) donde tu cobertura es menor (${fmt(propiosAhi)} puntos propios, ${pctProp}%).`
      );
    }
  }

  // 2) NSE del territorio de proximidad vs el de tus puntos
  const nseProx = pctNseAlto(proximidad[0]?.universo ?? null);
  const nseProp = pctNseAlto(propios[0]?.universo ?? null);
  if (nseProx !== null && nseProp !== null && Math.abs(nseProx - nseProp) >= 5) {
    salida.push(
      nseProx > nseProp
        ? `El NSE del territorio de proximidad supera al de tus puntos: ${nseProx.toLocaleString("es-MX")}% en niveles AB/C+ contra ${nseProp.toLocaleString("es-MX")}%.`
        : `Tus puntos están en territorio de mejor NSE que el de proximidad: ${nseProp.toLocaleString("es-MX")}% en AB/C+ contra ${nseProx.toLocaleString("es-MX")}%.`
    );
  }

  // 3) el traslape de conquista, en una línea
  const conquista = d.traslapes.find((t) => t.esConquista);
  if (conquista && conquista.poblacion > 0) {
    salida.push(
      `${fmt(conquista.poblacion)} personas (${conquista.pctBase.toLocaleString("es-MX")}%) de tu territorio también están en zona de competencia — audiencia directa de conquista.`
    );
  }

  // 4) dominante del consolidado como respaldo si falta contraste
  if (salida.length < 2) {
    const nse = segmentosNse(d.consolidado);
    if (nse) {
      const top = [...nse].sort((a, b) => b.pct - a.pct)[0];
      salida.push(
        `Nivel socioeconómico dominante del territorio consolidado: ${top.etiqueta}, con ${top.pct.toLocaleString("es-MX")}% (índice proxy censal).`
      );
    }
  }
  return salida.slice(0, 3);
}

/** Sustento de cada táctica destacada, desde las capas del proyecto. */
export function sustentoTactica(
  clave: TacticaClave,
  d: PlanProyectoDatos
): string | null {
  const puntosDe = (rol: RolLevantamiento) =>
    d.capas.filter((c) => c.rol === rol).reduce((t, c) => t + c.pois.length, 0);
  switch (clave) {
    case "poi": {
      const n = puntosDe("poi_propio");
      return n > 0 ? `sobre los ${fmt(n)} puntos propios del proyecto` : null;
    }
    case "conquista": {
      const n = puntosDe("competencia");
      return n > 0 ? `sobre los ${fmt(n)} puntos de competencia censados` : null;
    }
    case "proximidad": {
      const n = puntosDe("proximidad");
      return n > 0 ? `sobre los ${fmt(n)} puntos de proximidad` : null;
    }
    case "pdooh":
      return d.ooh
        ? `con las ${fmt(d.ooh.pantallas.length)} pantallas del cruce OOH`
        : null;
    case "targeting":
      return `sobre el universo consolidado de ${fmt(adultos(d.consolidado))} adultos 18+`;
    case "trade": {
      const n = puntosDe("poi_propio");
      return n > 0
        ? `para expandir el territorio desde tus ${fmt(n)} puntos`
        : null;
    }
    default:
      return null;
  }
}

/** Lista de PDVs de una pantalla en una línea: "A (1.2 km) · B +2". */
function lineaPdvsProyecto(p: PantallaProyecto, maxChars = 62): string {
  const partes: string[] = [];
  let usados = 0;
  let n = 0;
  for (const rel of p.pdvs) {
    const km = (rel.distancia_m / 1000).toLocaleString("es-MX", {
      maximumFractionDigits: 1,
    });
    const parte = `${rel.nombre} (${km} km)`;
    if (usados + parte.length > maxChars && n > 0) break;
    partes.push(parte);
    usados += parte.length + 3;
    n++;
  }
  const resto = p.pdvs.length - n;
  return partes.join(" · ") + (resto > 0 ? `  +${resto}` : "");
}

/** Universo de la SECCIÓN de un rol: el calculado sobre la unión de
 * sus capas si viene en universoRol; si el rol tiene UNA capa, el
 * universo propio de esa capa. */
export function universoDeRol(
  d: PlanProyectoDatos,
  rol: RolLevantamiento
): Universos | null {
  const calculado = d.universoRol?.[rol];
  if (calculado?.disponible) return calculado;
  const capasRol = d.capas.filter((c) => c.rol === rol);
  if (capasRol.length === 1 && capasRol[0].universo?.disponible) {
    return capasRol[0].universo;
  }
  return null;
}

/** Alto estimado del bloque demográfico de una sección. */
function altoBloqueDemografico(u: Universos | null): number {
  if (!u?.disponible || !u.residencial) return 0;
  return (
    28 + // padding del panel
    64 + // fila de cifras
    (segmentosNse(u) ? 62 : 0) +
    (segmentosEdades(u) ? 62 : 0) +
    (u.criterio ? 16 : 0) +
    16 // margen inferior
  );
}

/** Bloque demográfico de UNA sección/táctica: universo de la unión de
 * las geometrías de esa capa + urbano/rural + NSE + edades — el mismo
 * formato del resumen general, por sección. */
function BloqueDemografico({ u }: { u: Universos | null }) {
  if (!u?.disponible || !u.residencial) return null;
  const nse = segmentosNse(u);
  const edades = segmentosEdades(u);
  const pobRural = u.residencial.pobRural ?? 0;
  const pob = u.residencial.poblacion || 1;
  const pctRural = Math.round((100 * pobRural) / pob);
  return (
    <View
      style={{
        backgroundColor: PANEL,
        borderRadius: 8,
        paddingTop: 14,
        paddingBottom: 14,
        paddingLeft: 14,
        paddingRight: 14,
        marginTop: 2,
        marginBottom: 16,
      }}
    >
      <View style={{ flexDirection: "row" }}>
        <Cifra
          valor={fmt(u.residencial.adultos18)}
          descriptor="Universo de la táctica · adultos 18+"
        />
        <Cifra
          valor={pobRural > 0 ? `${100 - pctRural}% / ${pctRural}%` : "100%"}
          descriptor={
            pobRural > 0 ? "urbano / rural (ITER 2020)" : "población urbana"
          }
        />
        <Cifra valor={fmt(u.agebs ?? 0)} descriptor="Zonas censales" />
      </View>
      {nse && (
        <View style={{ marginTop: 12 }}>
          <BarraApilada
            titulo="NSE de la táctica (proxy censal, no AMAI)"
            segmentos={nse}
            width={CONT - 28}
          />
        </View>
      )}
      {edades && (
        <View style={{ marginTop: 10 }}>
          <BarraApilada
            titulo="Edades · % del universo 18+"
            segmentos={edades}
            width={CONT - 28}
          />
        </View>
      )}
      {u.criterio && (
        <Text style={{ fontFamily: "DMMono", fontSize: 7, color: GRIS_OSCURO, marginTop: 8 }}>
          {u.criterio}
        </Text>
      )}
    </View>
  );
}

/** Separación visual FUERTE entre secciones de táctica. */
function SeparadorSeccion() {
  return (
    <View style={{ marginTop: 2, marginBottom: 22 }}>
      <Divisor />
    </View>
  );
}

// ------------------------------------------------------------------
// Altura del lienzo (una sola página vertical; contenido determinista)
// ------------------------------------------------------------------

function estimarAltura(d: PlanProyectoDatos, titulo: string): number {
  const u = d.consolidado.disponible ? d.consolidado : null;
  const lineasTitulo = Math.max(1, Math.ceil(titulo.length / 42));
  let h = MARGEN;
  h += 56 + lineasTitulo * 34 + 78; // encabezado
  h += 96; // cifras
  h += 34; // nota dedupe (2 líneas)
  h += 24 + 18 * Math.max(1, Math.ceil((d.capas.length + (d.ooh ? 1 : 0)) / 3)); // conteos por capa
  if (segmentosNse(u)) h += 62;
  if (segmentosEdades(u)) h += 62;
  h += 46; // nota fuente + divisor
  if (d.mapaDataUrl) h += 44 + ALTO_MAPA + 22 + 26; // mapa + leyenda

  // sección por rol/táctica: separador + encabezado + bloque
  // demográfico propio + contenido
  const propios = d.capas.filter((c) => c.rol === "poi_propio");
  const competencia = d.capas.filter((c) => c.rol === "competencia");
  const proximidad = d.capas.filter((c) => c.rol === "proximidad");
  if (propios.length > 0) {
    const filas = Math.min(
      propios.reduce((t, c) => t + c.pois.length, 0),
      FILAS_PROPIOS
    );
    h += 26 + 60 + altoBloqueDemografico(universoDeRol(d, "poi_propio"));
    h += 20 + 16 + filas * 15.5 + 26;
  }
  if (competencia.length > 0) {
    h += 26 + 60 + altoBloqueDemografico(universoDeRol(d, "competencia"));
    h += competencia.length * 20 + 14;
    if (d.traslapes.some((t) => t.esConquista)) h += 78; // tarjeta estrella
    h += d.traslapes.filter((t) => !t.esConquista).length * 20 + 14;
  }
  if (proximidad.length > 0) {
    h += 26 + 60 + altoBloqueDemografico(universoDeRol(d, "proximidad"));
    h += proximidad.length * 20 + 34; // filas por capa + línea de ejemplos
  }
  if (d.ooh) {
    h += 26 + 60 + 78; // separador + sección + cifras del cruce
    h += altoBloqueDemografico(universoDeRol(d, "ooh"));
    if (d.ooh.mapaDataUrl) h += ALTO_MAPA_OOH + 18;
    const filas = Math.min(d.ooh.pantallas.length, FILAS_PANTALLAS);
    h += 20 + filas * 15.5 + 22;
    if (d.ooh.sinCobertura.length > 0)
      h += 26 + Math.min(d.ooh.sinCobertura.length, MAX_SIN_COBERTURA) * 13 + 18;
  }

  // inteligencia territorial: comparativo por capa (filas con aire) +
  // hallazgos a lo ancho
  const comparables = d.capas.filter(
    (c) => c.universo?.disponible && c.universo.perfil?.nseDist
  );
  h += 26 + 60; // separador + encabezado
  if (comparables.length >= 2) h += 18 + comparables.length * 48 + 12;
  h += hallazgosProyecto(d).length * 52 + 26;

  // tácticas + sustentos
  h += 52 + Math.ceil(CLAVES_TACTICAS.length / 2) * (ALTO_PILL + 16) + 30;
  h += d.tacticas.filter((t) => sustentoTactica(t, d)).length * 15 + 12;

  h += 200; // cierre comercial + footer
  h += 46 + Math.max(150, 26 + d.fuentes.length * 13 + 60) + 2; // metodología
  return Math.ceil(h + 130); // margen de seguridad
}

// ------------------------------------------------------------------
// Documento
// ------------------------------------------------------------------

function ProyectoDocumento({ d }: { d: PlanProyectoDatos }) {
  const titulo = d.titulo?.trim() || `Plan territorial — ${d.cliente}`;
  const fechaLarga = d.fecha.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const u = d.consolidado.disponible ? d.consolidado : null;
  const hayRural = (u?.rurales ?? 0) > 0 || (u?.residencial?.pobRural ?? 0) > 0;
  const nse = segmentosNse(u);
  const edades = segmentosEdades(u);
  const tacticas = ordenarTacticas(d.tacticas);
  const sustentos = d.tacticas
    .map((clave) => ({ clave, texto: sustentoTactica(clave, d) }))
    .filter((s): s is { clave: TacticaClave; texto: string } => !!s.texto);
  const totalPuntos =
    d.capas.reduce((t, c) => t + c.pois.length, 0) +
    (d.ooh?.pantallas.length ?? 0);
  const listaHallazgos = hallazgosProyecto(d);
  const altura = estimarAltura(d, titulo);
  const traslapeEstrella = d.traslapes.find((t) => t.esConquista) ?? null;
  const otrosTraslapes = d.traslapes.filter((t) => !t.esConquista);

  // conteos por rol para el resumen ejecutivo: "Competencia: 105 (BYD 31 · ...)"
  const conteosRol = ORDEN_ROLES.filter((rol) =>
    d.capas.some((c) => c.rol === rol)
  ).map((rol) => {
    const capasRol = d.capas.filter((c) => c.rol === rol);
    const total = capasRol.reduce((t, c) => t + c.pois.length, 0);
    const detalle =
      capasRol.length > 1
        ? ` (${capasRol.map((c) => `${c.nombre} ${fmt(c.pois.length)}`).join(" · ")})`
        : "";
    return { rol, texto: `${NOMBRE_ROL[rol]}: ${fmt(total)}${detalle}` };
  });
  if (d.ooh) {
    conteosRol.push({
      rol: "ooh",
      texto: `${NOMBRE_ROL.ooh}: ${fmt(d.ooh.pantallas.length)}`,
    });
  }

  const propios = d.capas.filter((c) => c.rol === "poi_propio");
  const competencia = d.capas.filter((c) => c.rol === "competencia");
  const proximidad = d.capas.filter((c) => c.rol === "proximidad");
  const poisPropios = propios.flatMap((c) => c.pois);
  const filasPropios = [...poisPropios]
    .sort((a, b) => (a.cp ?? "").localeCompare(b.cp ?? "") || a.nombre.localeCompare(b.nombre))
    .slice(0, FILAS_PROPIOS);
  const comparables = d.capas.filter(
    (c) => c.universo?.disponible && c.universo.perfil?.nseDist
  );
  const filasOoh = d.ooh
    ? [...d.ooh.pantallas].sort((a, b) => b.pdvs.length - a.pdvs.length).slice(0, FILAS_PANTALLAS)
    : [];
  const sinCob = d.ooh?.sinCobertura.slice(0, MAX_SIN_COBERTURA) ?? [];

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
  const lectura = {
    fontFamily: "Inter" as const,
    fontSize: 9,
    color: GRIS,
    marginTop: -6,
    marginBottom: 8,
  };
  const puntoCapa = (color: string) => ({
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: color,
    marginRight: 6,
  });

  return (
    <Document title={titulo} author="Gravity · Link Studio" creator="Seeker">
      <Page size={[ANCHO_PAG, altura]} style={{ backgroundColor: FONDO, padding: MARGEN }}>
        {/* ---------- 1 · portada ---------- */}
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
          <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 9.5, letterSpacing: 3, color: MAGENTA }}>
            PLAN TERRITORIAL — {d.cliente.toUpperCase()}
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

        {/* ---------- 2 · resumen ejecutivo del proyecto ---------- */}
        <View style={{ flexDirection: "row" }}>
          <Cifra
            valor={u ? fmt(u.residencial!.adultos18) : "—"}
            descriptor="Universo consolidado · adultos 18+"
          />
          <Cifra valor={fmt(totalPuntos)} descriptor="Puntos en el proyecto" />
          <Cifra
            valor={fmt(d.nLevantamientos)}
            descriptor="Levantamientos consolidados"
          />
          <Cifra
            valor={u ? fmt(u.agebs ?? 0) : "—"}
            descriptor="Zonas censales analizadas"
          />
        </View>

        <Text style={{ fontFamily: "Inter", fontSize: 9, color: GRIS, marginTop: 12, lineHeight: 1.5 }}>
          Universo de la unión de los territorios seleccionados, deduplicando
          traslapes entre capas
          {d.sumaSimple > adultos(u) && u
            ? `: la suma simple de los universos individuales daría ${fmt(d.sumaSimple)} adultos 18+; el consolidado real es ${fmt(adultos(u))} (−${fmt(d.sumaSimple - adultos(u))} por traslapes).`
            : "."}
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
          {conteosRol.map((c, i) => (
            <View key={c.rol} style={{ flexDirection: "row", alignItems: "center", marginRight: 10, marginBottom: 4 }}>
              {i > 0 && (
                <Text style={{ fontFamily: "DMMono", fontSize: 9, color: GRIS_OSCURO, marginRight: 10 }}>·</Text>
              )}
              <Text style={{ fontFamily: "DMMono", fontSize: 9, color: TINTA }}>{c.texto}</Text>
            </View>
          ))}
        </View>

        {nse && (
          <View style={{ marginTop: 16 }}>
            <BarraApilada titulo="Nivel socioeconómico del consolidado (proxy censal, no AMAI)" segmentos={nse} width={CONT} />
          </View>
        )}
        {edades && (
          <View style={{ marginTop: 14 }}>
            <BarraApilada titulo="Edades · % del universo 18+ consolidado" segmentos={edades} width={CONT} />
          </View>
        )}
        <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 12 }}>
          {u
            ? `Censo 2020 INEGI · ${fmt(u.agebs ?? 0)} zonas censales${(u.rurales ?? 0) > 0 ? ` · ${fmt(u.rurales!)} localidades rurales (ITER)` : ""}${u.criterio ? ` · ${u.criterio}` : ""}`
            : "Universo consolidado no disponible"}
        </Text>
        <View style={{ marginTop: 18, marginBottom: 24 }}>
          <Divisor />
        </View>

        {/* ---------- 3 · mapa general del proyecto ---------- */}
        {d.mapaDataUrl && (
          <View style={{ marginBottom: 26 }}>
            <Seccion etiqueta="Mapa general" titulo="Todas las capas del proyecto" />
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image
              src={d.mapaDataUrl}
              style={{ width: CONT, height: ALTO_MAPA, borderRadius: 8, objectFit: "cover" }}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
              {d.capas.map((c) => (
                <View key={c.id} style={{ flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 3 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color, marginRight: 4 }} />
                  <Text style={{ fontFamily: "DMMono", fontSize: 8, color: GRIS }}>
                    {c.nombre} · {NOMBRE_ROL[c.rol]}
                  </Text>
                </View>
              ))}
              {d.ooh && (
                <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 3 }}>
                  <View style={{ width: 6, height: 6, backgroundColor: "#ff8c42", marginRight: 4 }} />
                  <Text style={{ fontFamily: "DMMono", fontSize: 8, color: GRIS }}>
                    Pantallas OOH (líneas = a qué PDV apoyan)
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ---------- 4a · POIs (una sección por táctica, cada una con
            su propio bloque demográfico) ---------- */}
        {propios.length > 0 && (
          <View style={{ marginBottom: 26 }}>
            <SeparadorSeccion />
            <Seccion
              etiqueta={ETIQUETA_SECCION_ROL.poi_propio[0]}
              titulo={ETIQUETA_SECCION_ROL.poi_propio[1]}
            />
            <Text style={lectura}>
              {fmt(poisPropios.length)} puntos de interés
              {cpTop(poisPropios)
                ? ` · mayor concentración en CP ${cpTop(poisPropios)![0]} (${fmt(cpTop(poisPropios)![1])})`
                : ""}
              .
            </Text>
            <BloqueDemografico u={universoDeRol(d, "poi_propio")} />
            <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: LINEA, paddingBottom: 4 }}>
              <Text style={[celdaTh, { width: 210 }]}>NOMBRE</Text>
              <Text style={[celdaTh, { flex: 1 }]}>DIRECCIÓN</Text>
              <Text style={[celdaTh, { width: 60 }]}>CP</Text>
            </View>
            {filasPropios.map((p, i) => (
              <View
                key={p.placeId}
                style={{
                  flexDirection: "row",
                  paddingTop: 3,
                  paddingBottom: 3,
                  backgroundColor: i % 2 === 1 ? PANEL : undefined,
                }}
              >
                <Text style={[celdaTd, { width: 210, color: BLANCO }]}>
                  {p.nombre.length > 36 ? p.nombre.slice(0, 35) + "…" : p.nombre}
                </Text>
                <Text style={[celdaTd, { flex: 1, color: GRIS }]}>
                  {p.direccion.length > 58 ? p.direccion.slice(0, 57) + "…" : p.direccion}
                </Text>
                <Text style={[celdaTd, { width: 60, fontFamily: "DMMono", color: CIAN }]}>
                  {p.cp ?? "—"}
                </Text>
              </View>
            ))}
            {poisPropios.length > filasPropios.length && (
              <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 6 }}>
                +{fmt(poisPropios.length - filasPropios.length)} puntos más — detalle completo en el Export data (Excel).
              </Text>
            )}
          </View>
        )}

        {/* ---------- 4b · competencia (+ el traslape estrella) ---------- */}
        {competencia.length > 0 && (
          <View style={{ marginBottom: 26 }}>
            <SeparadorSeccion />
            <Seccion
              etiqueta={ETIQUETA_SECCION_ROL.competencia[0]}
              titulo={ETIQUETA_SECCION_ROL.competencia[1]}
            />
            <BloqueDemografico u={universoDeRol(d, "competencia")} />
            {competencia.map((c) => {
              const top = cpTop(c.pois);
              return (
                <View key={c.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                  <View style={puntoCapa(c.color)} />
                  <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 11, color: BLANCO, width: 190 }}>
                    {c.nombre}
                  </Text>
                  <Text style={{ fontFamily: "DMMono", fontSize: 9, color: MAGENTA, width: 84 }}>
                    {fmt(c.pois.length)} puntos
                  </Text>
                  <Text style={{ fontFamily: "Inter", fontSize: 8.5, color: GRIS, flex: 1 }}>
                    {adultos(c.universo) > 0
                      ? `universo ${fmt(adultos(c.universo))} · `
                      : ""}
                    {top
                      ? `mayor concentración en CP ${top[0]} (${fmt(top[1])})`
                      : "distribuida en el territorio"}
                  </Text>
                </View>
              );
            })}
            {traslapeEstrella && (
              <View
                style={{
                  backgroundColor: PANEL,
                  borderLeftWidth: 3,
                  borderLeftColor: MAGENTA,
                  borderRadius: 6,
                  paddingTop: 10,
                  paddingBottom: 10,
                  paddingLeft: 14,
                  paddingRight: 14,
                  marginTop: 8,
                }}
              >
                <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 7, letterSpacing: 1.8, color: MAGENTA, marginBottom: 5 }}>
                  TRASLAPE PROPIOS × COMPETENCIA — LA AUDIENCIA DE CONQUISTA
                </Text>
                <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 15, color: BLANCO }}>
                  {fmt(traslapeEstrella.poblacion)} personas ({traslapeEstrella.pctBase.toLocaleString("es-MX")}%) de tu territorio también están en zona de competencia.
                </Text>
                <Text style={{ fontFamily: "Inter", fontSize: 8, color: GRIS, marginTop: 4 }}>
                  Base: universo de {traslapeEstrella.etiquetaA} ({fmt(traslapeEstrella.poblacionBase)} personas). Cálculo por inclusión-exclusión sobre el censo.
                </Text>
              </View>
            )}
            {otrosTraslapes.map((t, i) => (
              <Text key={i} style={{ fontFamily: "Inter", fontSize: 8.5, color: GRIS, marginTop: 6 }}>
                Traslape {t.etiquetaA} × {t.etiquetaB}:{" "}
                <Text style={{ color: TINTA }}>{fmt(t.poblacion)} personas</Text>{" "}
                ({t.pctBase.toLocaleString("es-MX")}% del universo de {t.etiquetaA}).
              </Text>
            ))}
          </View>
        )}

        {/* ---------- 4c · proximidad ---------- */}
        {proximidad.length > 0 && (
          <View style={{ marginBottom: 26 }}>
            <SeparadorSeccion />
            <Seccion
              etiqueta={ETIQUETA_SECCION_ROL.proximidad[0]}
              titulo={ETIQUETA_SECCION_ROL.proximidad[1]}
            />
            <BloqueDemografico u={universoDeRol(d, "proximidad")} />
            {proximidad.map((c) => (
              <View key={c.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <View style={puntoCapa(c.color)} />
                <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 11, color: BLANCO, width: 190 }}>
                  {c.nombre}
                </Text>
                <Text style={{ fontFamily: "DMMono", fontSize: 9, color: VIOLETA, width: 84 }}>
                  {fmt(c.pois.length)} puntos
                </Text>
                <Text style={{ fontFamily: "Inter", fontSize: 8.5, color: GRIS, flex: 1 }}>
                  {adultos(c.universo) > 0
                    ? `universo ${fmt(adultos(c.universo))} adultos 18+ en su zona`
                    : "puntos de venta / lugares de referencia"}
                </Text>
              </View>
            ))}
            <Text style={{ fontFamily: "Inter", fontSize: 8.5, color: GRIS, marginTop: 4, lineHeight: 1.5 }}>
              Ejemplos:{" "}
              {proximidad
                .flatMap((c) => c.pois)
                .slice(0, EJEMPLOS_PROXIMIDAD)
                .map((p) => p.nombre)
                .join(" · ")}
              .
            </Text>
          </View>
        )}

        {/* ---------- 4d · plan OOH ---------- */}
        {d.ooh && (
          <View style={{ marginBottom: 26 }}>
            <SeparadorSeccion />
            <Seccion
              etiqueta={ETIQUETA_SECCION_ROL.ooh[0]}
              titulo={ETIQUETA_SECCION_ROL.ooh[1]}
            />
            <BloqueDemografico u={universoDeRol(d, "ooh")} />
            <View style={{ flexDirection: "row", marginBottom: 12 }}>
              <Cifra valor={fmt(d.ooh.pantallas.length)} descriptor="Pantallas en el plan" />
              <Cifra
                valor={`${fmt(d.ooh.cubiertos)} de ${fmt(d.ooh.totalPdvs)}`}
                descriptor="PDVs cubiertos"
              />
              <Cifra
                valor={fmt(Math.max(0, d.ooh.totalPdvs - d.ooh.cubiertos))}
                descriptor="PDVs sin cobertura"
              />
              <Cifra
                valor={d.ooh.impresiones != null && d.ooh.impresiones > 0 ? fmt(d.ooh.impresiones) : "—"}
                descriptor="Impresiones mensuales"
              />
            </View>
            {d.ooh.mapaDataUrl && (
              /* eslint-disable-next-line jsx-a11y/alt-text */
              <Image
                src={d.ooh.mapaDataUrl}
                style={{ width: CONT, height: ALTO_MAPA_OOH, borderRadius: 8, objectFit: "cover", marginBottom: 12 }}
              />
            )}
            <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: LINEA, paddingBottom: 4 }}>
              <Text style={[celdaTh, { width: 170 }]}>PANTALLA</Text>
              <Text style={[celdaTh, { width: 78 }]}>TIPO</Text>
              <Text style={[celdaTh, { width: 36, textAlign: "right" }]}>PDVS</Text>
              <Text style={[celdaTh, { flex: 1, paddingLeft: 14 }]}>APOYA A</Text>
              <Text style={[celdaTh, { width: 58, textAlign: "right" }]}>IMPR./MES</Text>
            </View>
            {filasOoh.map((p, i) => (
              <View
                key={`${p.nombre}-${i}`}
                style={{
                  flexDirection: "row",
                  paddingTop: 3,
                  paddingBottom: 3,
                  backgroundColor: i % 2 === 1 ? PANEL : undefined,
                }}
              >
                <Text style={[celdaTd, { width: 170, color: BLANCO }]}>
                  {p.nombre.length > 30 ? p.nombre.slice(0, 29) + "…" : p.nombre}
                </Text>
                <Text style={[celdaTd, { width: 78, color: "#ff8c42" }]}>
                  {(p.tipo ?? "—").slice(0, 14)}
                </Text>
                <Text style={[celdaTd, { width: 36, textAlign: "right", fontFamily: "DMMono", color: CIAN }]}>
                  {p.pdvs.length}
                </Text>
                <Text style={[celdaTd, { flex: 1, paddingLeft: 14, color: GRIS }]}>
                  {lineaPdvsProyecto(p)}
                </Text>
                <Text style={[celdaTd, { width: 58, textAlign: "right", fontFamily: "DMMono", color: GRIS }]}>
                  {p.impresiones != null ? fmt(p.impresiones) : "—"}
                </Text>
              </View>
            ))}
            {d.ooh.pantallas.length > filasOoh.length && (
              <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 6 }}>
                +{fmt(d.ooh.pantallas.length - filasOoh.length)} pantallas más — detalle completo en el Export data (Excel).
              </Text>
            )}
            {sinCob.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Text style={labelCol}>
                  PDVS SIN COBERTURA — DÓNDE FALTA INVENTARIO ({fmt(d.ooh.sinCobertura.length)})
                </Text>
                <View
                  style={{
                    backgroundColor: PANEL,
                    borderLeftWidth: 2,
                    borderLeftColor: MAGENTA,
                    borderRadius: 6,
                    paddingTop: 8,
                    paddingBottom: 8,
                    paddingLeft: 11,
                    paddingRight: 11,
                  }}
                >
                  {sinCob.map((n) => (
                    <Text key={n} style={{ fontFamily: "Inter", fontSize: 8.5, color: TINTA, marginBottom: 3 }}>
                      · {n}
                    </Text>
                  ))}
                  {d.ooh.sinCobertura.length > sinCob.length && (
                    <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO }}>
                      +{fmt(d.ooh.sinCobertura.length - sinCob.length)} más en el Export data (Excel).
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>
        )}

        {/* ---------- 5 · inteligencia territorial: una fila por capa
            bien diferenciada (nombre + rol + color) con su universo
            REAL y sus barras alineadas para comparación vertical ---------- */}
        {(comparables.length >= 2 || listaHallazgos.length > 0) && (
          <View style={{ marginBottom: 4 }}>
            <SeparadorSeccion />
            <Seccion
              etiqueta="Inteligencia territorial"
              titulo="Cómo se comparan las capas del proyecto"
            />
            {comparables.length >= 2 && (
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", marginBottom: 6 }}>
                  <Text style={[celdaTh, { width: 226 }]}>CAPA · UNIVERSO 18+ PROPIO</Text>
                  <Text style={[celdaTh, { width: (CONT - 226 - 16 - 20) / 2, marginRight: 20 }]}>
                    NSE (PROXY CENSAL)
                  </Text>
                  <Text style={[celdaTh, { width: (CONT - 226 - 16 - 20) / 2 }]}>
                    EDADES · % DEL UNIVERSO 18+
                  </Text>
                </View>
                {comparables.map((c) => {
                  const nseCapa = segmentosNse(c.universo);
                  const edadesCapa = segmentosEdades(c.universo);
                  const wBarra = (CONT - 226 - 16 - 20) / 2;
                  return (
                    <View
                      key={c.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: PANEL,
                        borderLeftWidth: 3,
                        borderLeftColor: c.color,
                        borderRadius: 6,
                        paddingTop: 8,
                        paddingBottom: 8,
                        paddingLeft: 10,
                        paddingRight: 6,
                        marginBottom: 7,
                      }}
                    >
                      <View style={{ width: 216 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <View style={puntoCapa(c.color)} />
                          <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 10, color: BLANCO }}>
                            {c.nombre.length > 26 ? c.nombre.slice(0, 25) + "…" : c.nombre}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: GRIS, marginTop: 3 }}>
                          {NOMBRE_ROL[c.rol]} ·{" "}
                          <Text style={{ color: CIAN }}>
                            {fmt(adultos(c.universo))}
                          </Text>{" "}
                          adultos 18+ · {fmt(c.pois.length)} puntos
                        </Text>
                      </View>
                      <View style={{ width: wBarra, marginRight: 20 }}>
                        <View style={{ flexDirection: "row", height: 9, borderRadius: 4.5, overflow: "hidden", backgroundColor: FONDO }}>
                          {(nseCapa ?? []).map(
                            (s) =>
                              s.pct > 0 && (
                                <View key={s.etiqueta} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                              )
                          )}
                        </View>
                      </View>
                      <View style={{ width: wBarra }}>
                        <View style={{ flexDirection: "row", height: 9, borderRadius: 4.5, overflow: "hidden", backgroundColor: FONDO }}>
                          {(edadesCapa ?? []).map(
                            (s) =>
                              s.pct > 0 && (
                                <View key={s.etiqueta} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                              )
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            <View style={{ flexDirection: "row" }}>
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
          </View>
        )}

        <View style={{ marginTop: 20, marginBottom: 24 }}>
          <Divisor />
        </View>

        {/* ---------- 6 · siguientes pasos con sustento ---------- */}
        <Seccion etiqueta="Siguientes pasos" titulo="Qué se puede activar sobre este territorio" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          {tacticas.map((t) => (
            <PillTactica
              key={t.clave}
              clave={`proy-${t.clave}`}
              nombre={t.nombre}
              descriptor={t.descriptor}
              destacada={t.destacada}
            />
          ))}
        </View>
        {sustentos.map((s) => (
          <Text key={s.clave} style={{ fontFamily: "Inter", fontSize: 8.5, color: GRIS, marginBottom: 4 }}>
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, color: TINTA }}>
              {TACTICAS[s.clave].nombre}
            </Text>{" "}
            — {s.texto}.
          </Text>
        ))}
        <Text style={{ fontFamily: "Inter", fontSize: 10, color: TINTA, marginTop: 6 }}>
          El equipo de Gravity arma el plan de medios sobre este territorio.
        </Text>

        {/* ---------- 7 · cierre comercial ---------- */}
        <View style={{ width: CONT, marginTop: 34 }}>
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

        {/* ---------- 8 · metodología consolidada (al final) ---------- */}
        <View style={{ marginTop: 26, marginBottom: 12 }}>
          <Divisor />
        </View>
        <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 7.5, letterSpacing: 2.2, color: GRIS_OSCURO, marginBottom: 10 }}>
          METODOLOGÍA · RESPALDO TÉCNICO DEL PROYECTO
        </Text>
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, paddingRight: 24 }}>
            <Text style={[labelCol, { fontSize: 6.5, marginBottom: 6 }]}>FUENTES DE DATOS (TODOS LOS LEVANTAMIENTOS)</Text>
            {d.fuentes.map((f) => (
              <Text key={f} style={{ fontFamily: "Inter", fontSize: 7.5, color: GRIS, marginBottom: 3, lineHeight: 1.4 }}>
                · {f}
              </Text>
            ))}
            <Text style={{ fontFamily: "Inter", fontSize: 7.5, color: GRIS_OSCURO, lineHeight: 1.5, marginTop: 6 }}>
              Georreferenciación en lat/long WGS84 (EPSG:4326). Proyecto
              consolidado el {fechaLarga} con Seeker Planner, sobre{" "}
              {fmt(d.nLevantamientos)} levantamientos. Deduplicación por
              identificador de lugar dentro de cada levantamiento.
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[labelCol, { fontSize: 6.5, marginBottom: 6 }]}>UNIVERSOS Y TRASLAPES</Text>
            <Text style={{ fontFamily: "Inter", fontSize: 7.5, color: GRIS, lineHeight: 1.5 }}>
              {hayRural
                ? "Población urbana por interpolación areal de AGEBs (Censo 2020 INEGI) + población rural por localidad puntual (ITER 2020, localidades <2,500 hab)"
                : "Población por interpolación areal sobre AGEBs urbanas del Censo 2020 (INEGI)"}
              , contra la UNIÓN deduplicada de las geometrías de los
              levantamientos seleccionados: dos capas sobre la misma zona no
              cuentan a su población dos veces.
            </Text>
            <Text style={{ fontFamily: "Inter", fontSize: 7.5, color: GRIS_OSCURO, lineHeight: 1.5, marginTop: 6 }}>
              Los traslapes entre capas se calculan por inclusión-exclusión
              — pob(A∩B) = pob(A) + pob(B) − pob(A∪B) — con las mismas sumas
              censales. El índice socioeconómico es un proxy censal
              (escolaridad, vehículos e internet por vivienda); no es NSE AMAI
              {hayRural ? " y considera solo la población urbana" : ""}. Los
              rangos de edad 25-64 se estiman con estructura nacional del
              Censo 2020.
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Nombre de archivo: Gravity_Plan_[Cliente]_[titulo]_[fecha].pdf */
export function nombreArchivoPlanProyecto(
  cliente: string,
  titulo: string,
  fecha: Date
): string {
  const limpiar = (s: string, max: number) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, max);
  const c = limpiar(cliente, 30) || "Cliente";
  const t = limpiar(titulo, 40);
  const f = fecha.toISOString().slice(0, 10);
  return `Gravity_Plan_${c}${t ? `_${t}` : ""}_${f}.pdf`;
}

/** Genera el PDF del plan de proyecto. `baseFuentes` solo en pruebas Node. */
export async function generarPlanProyectoPdf(
  datos: PlanProyectoDatos,
  baseFuentes = ""
): Promise<Blob> {
  registrarFuentes(baseFuentes);
  return pdf(<ProyectoDocumento d={datos} />).toBlob();
}

/** Variante Node para pruebas (elemento en vez de Blob). */
export function documentoPlanProyecto(datos: PlanProyectoDatos) {
  return <ProyectoDocumento d={datos} />;
}
