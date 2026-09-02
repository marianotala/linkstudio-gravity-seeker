// Export plan (PDF) del cruce OOH — variante Geo-PDOOH del template
// Gravity: mismo sistema de diseño del pitch deck (plan-pdf.tsx presta
// tokens y componentes), con resumen del plan de pantallas, mapa con
// líneas pantalla→PDV, tabla del cruce, PDVs sin cobertura (el dato
// accionable), universos si se calcularon y la táctica Geo-PDOOH
// destacada en Siguientes pasos. Metodología discreta al final.

import React from "react";
import { Document, Image, Page, Text, View, pdf } from "@react-pdf/renderer";
import {
  ALTO_MAPA,
  ALTO_PILL,
  BLANCO,
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
  ANCHO_PAG,
  BarraApilada,
  fmt,
  ordenarTacticas,
  registrarFuentes,
  segmentosEdades,
  segmentosNse,
} from "./plan-pdf";
import { CLAVES_TACTICAS, type TacticaClave } from "./tacticas";
import { TIPOS_PANTALLA, etiquetaTipoPantalla, colorTipoPantalla } from "./ooh";
import type { CrucePantalla, Universos } from "./types";

export interface PlanOohDatos {
  /** Título definido por el vendedor; vacío = default. */
  titulo?: string | null;
  /** "116 PDVs · radio 6 km", nombre del cliente, etc. */
  alcance: string;
  usuario: string;
  fecha: Date;
  /** SOLO pantallas del plan (con ≥1 PDV), ordenadas por PDVs desc. */
  cruces: CrucePantalla[];
  totalPdvs: number;
  cubiertos: number;
  /** Etiqueta de cada PDV por índice. */
  nombresPdv: string[];
  /** Nombres de los PDVs SIN cobertura. */
  sinCobertura: string[];
  /** Suma de impresiones mensuales del plan (null = sin dato). */
  impresiones: number | null;
  /** "6 km" o "6 km ZMVM · 15 km foráneo". */
  radioTexto: string;
  universos: Universos | null;
  mapaDataUrl?: string | null;
  fuentes: string[];
  /** Tácticas destacadas; default ["pdooh"]. */
  tacticas?: TacticaClave[] | null;
}

const FILAS_CRUCE = 16;
const MAX_SIN_COBERTURA = 14;

/** Lista de PDVs de una pantalla en UNA línea: "A (1.2 km) · B (3 km) +2". */
function lineaPdvs(c: CrucePantalla, nombres: string[], maxChars = 66): string {
  const partes: string[] = [];
  let usados = 0;
  let n = 0;
  for (const rel of c.pdvs) {
    const nombre = nombres[rel.idx] ?? `PDV ${rel.idx + 1}`;
    const km = (rel.distancia / 1000).toLocaleString("es-MX", {
      maximumFractionDigits: 1,
    });
    const parte = `${nombre} (${km} km)`;
    if (usados + parte.length > maxChars && n > 0) break;
    partes.push(parte);
    usados += parte.length + 3;
    n++;
  }
  const resto = c.pdvs.length - n;
  return partes.join(" · ") + (resto > 0 ? `  +${resto}` : "");
}

function estimarAltura(d: PlanOohDatos, titulo: string): number {
  const u = d.universos?.disponible ? d.universos : null;
  const lineasTitulo = Math.max(1, Math.ceil(titulo.length / 42));
  let h = MARGEN;
  h += 56 + lineasTitulo * 34 + 78; // encabezado
  h += 96; // cifras
  if (segmentosNse(u)) h += 62;
  if (segmentosEdades(u)) h += 62;
  h += 46; // nota fuente + divisor
  if (d.mapaDataUrl) h += 44 + ALTO_MAPA + 20 + 26; // mapa + leyenda
  const filas = Math.min(d.cruces.length, FILAS_CRUCE);
  if (filas > 0) h += 66 + 18 + 16 + filas * 15.5 + 22; // tabla del cruce
  if (d.sinCobertura.length > 0)
    h += 26 + Math.min(d.sinCobertura.length, MAX_SIN_COBERTURA) * 13 + 18;
  h += 52 + Math.ceil(CLAVES_TACTICAS.length / 2) * (ALTO_PILL + 16) + 30;
  h += 200; // cierre comercial + footer
  // metodología: la columna del criterio del cruce (+ universos) es
  // más alta que la de fuentes — estimar con holgura
  h += 46 + Math.max(130, 26 + d.fuentes.length * 13 + 40) + 2;
  return Math.ceil(h + 110);
}

function OohDocumento({ d }: { d: PlanOohDatos }) {
  const titulo = d.titulo?.trim() || `Plan OOH — ${d.alcance}`;
  const fechaLarga = d.fecha.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const u = d.universos?.disponible ? d.universos : null;
  const hayRural = (u?.rurales ?? 0) > 0 || (u?.residencial?.pobRural ?? 0) > 0;
  const nse = segmentosNse(u);
  const edades = segmentosEdades(u);
  const tacticas = ordenarTacticas(d.tacticas ?? ["pdooh"]);
  const filas = d.cruces.slice(0, FILAS_CRUCE);
  const tiposPresentes = Array.from(
    new Set(d.cruces.map((c) => c.pantalla.tipo))
  );
  const altura = estimarAltura(d, titulo);
  const sinCob = d.sinCobertura.slice(0, MAX_SIN_COBERTURA);

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
        {/* ---------- encabezado ---------- */}
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
            PLAN GEO-PDOOH · PANTALLAS × PUNTOS DE VENTA
          </Text>
          <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 28, color: BLANCO, marginTop: 8 }}>
            {titulo}
          </Text>
          <Text style={{ fontFamily: "Inter", fontSize: 11, color: GRIS, marginTop: 8 }}>
            El exterior, ahora medible.
          </Text>
          <Text style={{ fontFamily: "DMMono", fontSize: 8.5, color: GRIS_OSCURO, marginTop: 10 }}>
            {fechaLarga} · Generado por {d.usuario}
          </Text>
        </View>
        <View style={{ marginTop: 22, marginBottom: 26 }}>
          <Divisor />
        </View>

        {/* ---------- cifras del plan ---------- */}
        <View style={{ flexDirection: "row" }}>
          <Cifra valor={fmt(d.cruces.length)} descriptor="Pantallas en el plan" />
          <Cifra
            valor={`${fmt(d.cubiertos)} de ${fmt(d.totalPdvs)}`}
            descriptor="PDVs cubiertos"
          />
          <Cifra
            valor={fmt(d.totalPdvs - d.cubiertos)}
            descriptor="PDVs sin cobertura"
          />
          <Cifra
            valor={d.impresiones != null && d.impresiones > 0 ? fmt(d.impresiones) : "—"}
            descriptor="Impresiones mensuales del plan"
          />
        </View>

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
            ? `Universo alrededor del plan de pantallas: ${fmt(u.residencial!.adultos18)} adultos 18+ · Censo 2020 INEGI · ${fmt(u.agebs ?? 0)} zonas censales${(u.rurales ?? 0) > 0 ? ` · ${fmt(u.rurales!)} localidades rurales (ITER)` : ""}`
            : `Cruce por proximidad: radio ${d.radioTexto} · ${d.alcance}`}
        </Text>
        <View style={{ marginTop: 18, marginBottom: 24 }}>
          <Divisor />
        </View>

        {/* ---------- mapa con líneas ---------- */}
        {d.mapaDataUrl && (
          <View style={{ marginBottom: 26 }}>
            <Seccion etiqueta="Mapa del cruce" titulo="Pantallas y puntos de venta" />
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image
              src={d.mapaDataUrl}
              style={{ width: CONT, height: ALTO_MAPA, borderRadius: 8, objectFit: "cover" }}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
              {tiposPresentes.map((t) => (
                <View key={t} style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
                  <View style={{ width: 6, height: 6, backgroundColor: colorTipoPantalla(t), marginRight: 4 }} />
                  <Text style={{ fontFamily: "DMMono", fontSize: 8, color: GRIS }}>
                    {etiquetaTipoPantalla(t)}
                  </Text>
                </View>
              ))}
              <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: CIAN, marginRight: 4 }} />
                <Text style={{ fontFamily: "DMMono", fontSize: 8, color: GRIS }}>PDV cubierto</Text>
              </View>
              {d.sinCobertura.length > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      borderWidth: 1.4,
                      borderColor: MAGENTA,
                      marginRight: 4,
                    }}
                  />
                  <Text style={{ fontFamily: "DMMono", fontSize: 8, color: GRIS }}>PDV sin cobertura</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ---------- tabla del cruce ---------- */}
        {filas.length > 0 && (
          <View>
            <Seccion
              etiqueta="Cruce pantalla × PDV"
              titulo={`Qué pantallas apoyan a qué puntos de venta (radio ${d.radioTexto})`}
            />
            <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: LINEA, paddingBottom: 4 }}>
              <Text style={[celdaTh, { width: 150 }]}>PANTALLA</Text>
              <Text style={[celdaTh, { width: 82 }]}>TIPO</Text>
              <Text style={[celdaTh, { width: 70 }]}>MEDIO</Text>
              <Text style={[celdaTh, { width: 36, textAlign: "right" }]}>PDVS</Text>
              <Text style={[celdaTh, { flex: 1, paddingLeft: 14 }]}>APOYA A</Text>
              <Text style={[celdaTh, { width: 58, textAlign: "right" }]}>IMPR./MES</Text>
            </View>
            {filas.map((c, i) => {
              const nombre = c.pantalla.nombre ?? c.pantalla.clave;
              return (
                <View
                  key={c.pantalla.clave}
                  style={{
                    flexDirection: "row",
                    paddingTop: 3,
                    paddingBottom: 3,
                    backgroundColor: i % 2 === 1 ? PANEL : undefined,
                  }}
                >
                  <Text style={[celdaTd, { width: 150, color: BLANCO }]}>
                    {nombre.length > 26 ? nombre.slice(0, 25) + "…" : nombre}
                  </Text>
                  <Text style={[celdaTd, { width: 82, color: colorTipoPantalla(c.pantalla.tipo) }]}>
                    {etiquetaTipoPantalla(c.pantalla.tipo).split(" / ")[0]}
                  </Text>
                  <Text style={[celdaTd, { width: 70, color: GRIS }]}>
                    {(c.pantalla.medio ?? "—").slice(0, 12)}
                  </Text>
                  <Text style={[celdaTd, { width: 36, textAlign: "right", fontFamily: "DMMono", color: CIAN }]}>
                    {c.pdvs.length}
                  </Text>
                  <Text style={[celdaTd, { flex: 1, paddingLeft: 14, color: GRIS }]}>
                    {lineaPdvs(c, d.nombresPdv)}
                  </Text>
                  <Text style={[celdaTd, { width: 58, textAlign: "right", fontFamily: "DMMono", color: GRIS }]}>
                    {c.pantalla.impresiones != null ? fmt(c.pantalla.impresiones) : "—"}
                  </Text>
                </View>
              );
            })}
            {d.cruces.length > filas.length && (
              <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 6 }}>
                +{fmt(d.cruces.length - filas.length)} pantallas más — detalle completo en el Export data (CSV).
              </Text>
            )}
          </View>
        )}

        {/* ---------- PDVs sin cobertura (el dato accionable) ---------- */}
        {d.sinCobertura.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <Text style={labelCol}>
              PDVS SIN COBERTURA — DÓNDE FALTA INVENTARIO ({fmt(d.sinCobertura.length)})
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
              {d.sinCobertura.length > sinCob.length && (
                <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO }}>
                  +{fmt(d.sinCobertura.length - sinCob.length)} más en el Export data (CSV).
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={{ marginTop: 24, marginBottom: 24 }}>
          <Divisor />
        </View>

        {/* ---------- siguientes pasos (Geo-PDOOH destacada) ---------- */}
        <Seccion etiqueta="Siguientes pasos" titulo="Qué se puede activar sobre este territorio" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          {tacticas.map((t) => (
            <PillTactica
              key={t.clave}
              clave={`ooh-${t.clave}`}
              nombre={t.nombre}
              descriptor={t.descriptor}
              destacada={t.destacada}
            />
          ))}
        </View>
        <Text style={{ fontFamily: "Inter", fontSize: 10, color: TINTA, marginTop: 2 }}>
          El equipo de Gravity arma el plan de medios sobre este territorio.
        </Text>

        {/* ---------- cierre comercial ---------- */}
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

        {/* ---------- metodología (anexo técnico, al final) ---------- */}
        <View style={{ marginTop: 26, marginBottom: 12 }}>
          <Divisor />
        </View>
        <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 7.5, letterSpacing: 2.2, color: GRIS_OSCURO, marginBottom: 10 }}>
          METODOLOGÍA · RESPALDO TÉCNICO
        </Text>
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, paddingRight: 24 }}>
            <Text style={[labelCol, { fontSize: 6.5, marginBottom: 6 }]}>FUENTES DE DATOS</Text>
            {d.fuentes.map((f) => (
              <Text key={f} style={{ fontFamily: "Inter", fontSize: 7.5, color: GRIS, marginBottom: 3, lineHeight: 1.4 }}>
                · {f}
              </Text>
            ))}
            <Text style={{ fontFamily: "Inter", fontSize: 7.5, color: GRIS_OSCURO, lineHeight: 1.5, marginTop: 6 }}>
              Georreferenciación en lat/long WGS84 (EPSG:4326). Cruce del{" "}
              {fechaLarga} con Seeker OOH.
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[labelCol, { fontSize: 6.5, marginBottom: 6 }]}>CRITERIO DEL CRUCE</Text>
            <Text style={{ fontFamily: "Inter", fontSize: 7.5, color: GRIS, lineHeight: 1.5 }}>
              Una pantalla apoya a un punto de venta cuando la distancia
              geodésica (Haversine) entre ambos es menor o igual al radio del
              plan ({d.radioTexto}). Tipos de pantalla del inventario:{" "}
              {tiposPresentes.map((t) => etiquetaTipoPantalla(t)).join(", ") ||
                Object.values(TIPOS_PANTALLA)[0].etiqueta}
              .
            </Text>
            {u && (
              <Text style={{ fontFamily: "Inter", fontSize: 7.5, color: GRIS_OSCURO, lineHeight: 1.5, marginTop: 6 }}>
                {hayRural
                  ? "Universos: población urbana por interpolación areal de AGEBs (Censo 2020 INEGI) + población rural por localidad puntual (ITER 2020)"
                  : "Universos: población por interpolación areal sobre AGEBs urbanas del Censo 2020 (INEGI)"}
                , sobre los radios de las pantallas del plan. El índice
                socioeconómico es un proxy censal; no es NSE AMAI.
              </Text>
            )}
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Nombre de archivo: Gravity_PlanOOH_[título]_[fecha].pdf */
export function nombreArchivoPlanOoh(titulo: string, fecha: Date): string {
  const limpio =
    titulo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "plan_ooh";
  const f = fecha.toISOString().slice(0, 10);
  return `Gravity_PlanOOH_${limpio}_${f}.pdf`;
}

/** Genera el PDF del plan OOH. `baseFuentes` solo se usa en pruebas Node. */
export async function generarPlanOohPdf(
  datos: PlanOohDatos,
  baseFuentes = ""
): Promise<Blob> {
  registrarFuentes(baseFuentes);
  return pdf(<OohDocumento d={datos} />).toBlob();
}

/** Variante Node para pruebas (elemento en vez de Blob). */
export function documentoPlanOoh(datos: PlanOohDatos) {
  return <OohDocumento d={datos} />;
}
