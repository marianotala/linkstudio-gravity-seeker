// Export plan de proyecto — FORMATO PRESENTACIÓN (láminas 16:9).
// Mismo sistema visual del deck (plan-pdf.tsx presta tokens y
// componentes) y mismos datos que el one-pager (PlanProyectoDatos),
// pero paginado para PROYECTAR: portada · resumen del proyecto · UNA
// lámina por táctica ejecutada con layout fijo mapa-izquierda /
// datos-derecha (títulos con el nombre de táctica Gravity; Conquista
// con muchas capas se parte en dos láminas) · comparativo · traslapes
// · siguientes pasos · cierre · metodología. Tipografía fija: si el
// contenido no cabe, se recorta la lista — nunca se encoge la letra.

import React from "react";
import {
  Defs,
  Document,
  Image,
  LinearGradient,
  Page,
  Rect,
  Stop,
  Svg,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import {
  BLANCO,
  BarraApilada,
  CIAN,
  Cifra,
  Divisor,
  FONDO,
  GRIS,
  GRIS_OSCURO,
  LINEA,
  MAGENTA,
  Marca,
  Neon,
  PANEL,
  TINTA,
  VIOLETA,
  fmt,
  ordenarTacticas,
  registrarFuentes,
  segmentosEdades,
  segmentosNse,
} from "./plan-pdf";
import {
  NOMBRE_ROL,
  universoDeRol,
  sustentoTactica,
  type CapaPlanProyecto,
  type PlanProyectoDatos,
} from "./proyecto-pdf";
import { TACTICAS, type TacticaClave } from "./tacticas";
import type { RolLevantamiento, Universos } from "./types";

// ------------------------------------------------------------------
// Geometría de lámina (plantilla FIJA: misma en todas las tácticas)
// ------------------------------------------------------------------

export const SLIDE_W = 960;
export const SLIDE_H = 540;
const M = 40;
/** Slot del mapa (mitad izquierda ≈53% del ancho). */
export const MAPA_SLOT_W = Math.round((SLIDE_W - M * 2) * 0.53); // ≈466
export const MAPA_SLOT_H = SLIDE_H - M * 2 - 22; // deja aire al pie
const DER_X = 24; // separación mapa→datos
const DER_W = SLIDE_W - M * 2 - MAPA_SLOT_W - DER_X; // ≈390

const MAX_MARCAS_LAMINA = 4; // más capas → segunda lámina con desglose
const MAX_FILAS_DESGLOSE = 9;
const MAX_TOP_PUNTOS = 5;
const MAX_FILAS_COMPARATIVO = 6;

/** Título de lámina por táctica: NOMBRE GRAVITY, no el rol técnico. */
const TITULO_TACTICA: Record<RolLevantamiento, [string, string]> = {
  poi_propio: ["GEO-FENCE POI", "Tus puntos"],
  competencia: ["GEO-FENCE CONQUISTA", "Conquista"],
  proximidad: ["GEO-FENCE PROXIMIDAD", "Proximidad"],
  ooh: ["GEO-PDOOH · PANTALLAS × PDVS", "Geo-PDOOH"],
};

const adultos = (u: Universos | null | undefined) =>
  u?.disponible ? (u.residencial?.adultos18 ?? 0) : 0;

// ------------------------------------------------------------------
// Piezas de lámina
// ------------------------------------------------------------------

/** Encabezado de lámina estilo deck (etiqueta magenta + título). */
function TituloLamina({ etiqueta, titulo }: { etiqueta: string; titulo: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 9, letterSpacing: 2.6, color: MAGENTA }}>
          {etiqueta.toUpperCase()}
        </Text>
        <View style={{ flexDirection: "row", marginLeft: 10 }}>
          {[MAGENTA, VIOLETA, CIAN].map((c) => (
            <View key={c} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c, marginRight: 4 }} />
          ))}
        </View>
      </View>
      <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 24, color: BLANCO, marginTop: 6 }}>
        {titulo}
      </Text>
    </View>
  );
}

/** Pie de lámina: cliente + folio (consistente en todas). */
function PieLamina({ cliente, n, total }: { cliente: string; n: number; total: number }) {
  return (
    <View
      style={{
        position: "absolute",
        bottom: 14,
        left: M,
        right: M,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontFamily: "DMMono", fontSize: 7, letterSpacing: 1.4, color: GRIS_OSCURO }}>
        GRAVITY · PLAN TERRITORIAL — {cliente.toUpperCase()}
      </Text>
      <Text style={{ fontFamily: "DMMono", fontSize: 7, color: GRIS_OSCURO }}>
        {n} / {total}
      </Text>
    </View>
  );
}

function Lamina({
  children,
  cliente,
  n,
  total,
}: {
  children: React.ReactNode;
  cliente: string;
  n: number;
  total: number;
}) {
  return (
    <Page size={[SLIDE_W, SLIDE_H]} style={{ backgroundColor: FONDO, padding: M }}>
      {children}
      <PieLamina cliente={cliente} n={n} total={total} />
    </Page>
  );
}

/** Pill de táctica de la plantilla 16:9 (misma semántica que la del
 * one-pager, con la geometría de lámina: 3 columnas compactas). */
const PILL_W = 272;
const PILL_H = 58;
function PillLamina({
  clave,
  nombre,
  descriptor,
  destacada,
}: {
  clave: string;
  nombre: string;
  descriptor: string;
  destacada: boolean;
}) {
  const gradId = `sl-pill-${clave}`;
  return (
    <View style={{ width: PILL_W, height: PILL_H, marginBottom: 12, marginRight: 16 }}>
      <Svg width={PILL_W} height={PILL_H} style={{ position: "absolute", top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={MAGENTA} />
            <Stop offset="0.5" stopColor={VIOLETA} />
            <Stop offset="1" stopColor={CIAN} />
          </LinearGradient>
        </Defs>
        {destacada ? (
          <>
            <Rect x={0} y={0} width={PILL_W} height={PILL_H} rx={11} fill={`url(#${gradId})`} />
            <Rect x={2} y={2} width={PILL_W - 4} height={PILL_H - 4} rx={9} fill={PANEL} />
          </>
        ) : (
          <Rect x={0.6} y={0.6} width={PILL_W - 1.2} height={PILL_H - 1.2} rx={10} fill={PANEL} stroke={LINEA} strokeWidth={1} />
        )}
      </Svg>
      <View style={{ paddingTop: destacada ? 8 : 12, paddingLeft: 14, paddingRight: 14 }}>
        {destacada && (
          <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 5.8, letterSpacing: 1.2, color: MAGENTA, marginBottom: 3 }}>
            RECOMENDADA PARA ESTE TERRITORIO
          </Text>
        )}
        <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 11, color: destacada ? BLANCO : TINTA }}>
          {nombre}
        </Text>
        <Text style={{ fontFamily: "Inter", fontSize: 7.5, color: GRIS, marginTop: 2.5 }}>
          {descriptor}
        </Text>
      </View>
    </View>
  );
}

/** Cifra compacta para la columna derecha de las láminas de táctica. */
function CifraLamina({ valor, descriptor }: { valor: string; descriptor: string }) {
  return (
    <View style={{ flex: 1, paddingRight: 10 }}>
      <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 22, color: BLANCO }}>
        {valor}
      </Text>
      <Text style={{ fontFamily: "DMMono", fontSize: 6.6, letterSpacing: 1.1, color: GRIS, marginTop: 2, lineHeight: 1.4 }}>
        {descriptor.toUpperCase()}
      </Text>
    </View>
  );
}

/** Mapa de la táctica (mitad izquierda) o placeholder discreto. */
function MapaTactica({ dataUrl, leyenda }: { dataUrl: string | null | undefined; leyenda: { color: string; texto: string }[] }) {
  return (
    <View style={{ width: MAPA_SLOT_W }}>
      {dataUrl ? (
        /* eslint-disable-next-line jsx-a11y/alt-text */
        <Image
          src={dataUrl}
          style={{ width: MAPA_SLOT_W, height: MAPA_SLOT_H - 22, borderRadius: 10, objectFit: "cover" }}
        />
      ) : (
        <View
          style={{
            width: MAPA_SLOT_W,
            height: MAPA_SLOT_H - 22,
            borderRadius: 10,
            backgroundColor: PANEL,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: "DMMono", fontSize: 8, color: GRIS_OSCURO }}>
            mapa no disponible
          </Text>
        </View>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
        {leyenda.slice(0, 5).map((l) => (
          <View key={l.texto} style={{ flexDirection: "row", alignItems: "center", marginRight: 10 }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: l.color, marginRight: 3 }} />
            <Text style={{ fontFamily: "DMMono", fontSize: 6.5, color: GRIS }}>
              {l.texto.length > 24 ? l.texto.slice(0, 23) + "…" : l.texto}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------
// Documento
// ------------------------------------------------------------------

function SlidesDocumento({ d }: { d: PlanProyectoDatos }) {
  const titulo = d.titulo?.trim() || `Plan territorial — ${d.cliente}`;
  const fechaLarga = d.fecha.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const u = d.consolidado.disponible ? d.consolidado : null;
  const nseCons = segmentosNse(u);
  const edadesCons = segmentosEdades(u);
  const tacticas = ordenarTacticas(d.tacticas);
  const sustentos = d.tacticas
    .map((clave) => ({ clave, texto: sustentoTactica(clave, d) }))
    .filter((s): s is { clave: TacticaClave; texto: string } => !!s.texto);
  const comparables = d.capas.filter(
    (c) => c.universo?.disponible && c.universo.perfil?.nseDist
  );
  const traslapeEstrella = d.traslapes.find((t) => t.esConquista) ?? null;
  const otrosTraslapes = d.traslapes.filter((t) => !t.esConquista);
  const hayRural = (u?.rurales ?? 0) > 0 || (u?.residencial?.pobRural ?? 0) > 0;

  const conteosRol = (["poi_propio", "competencia", "proximidad"] as const)
    .filter((rol) => d.capas.some((c) => c.rol === rol))
    .map((rol) => {
      const capasRol = d.capas.filter((c) => c.rol === rol);
      const total = capasRol.reduce((t, c) => t + c.pois.length, 0);
      const detalle =
        capasRol.length > 1
          ? ` (${capasRol.map((c) => `${c.nombre} ${fmt(c.pois.length)}`).join(" · ")})`
          : "";
      return `${NOMBRE_ROL[rol]}: ${fmt(total)}${detalle}`;
    });
  if (d.ooh) conteosRol.push(`${NOMBRE_ROL.ooh}: ${fmt(d.ooh.pantallas.length)}`);

  // ---- plan de láminas de táctica (con split de capas numerosas)
  interface LaminaTactica {
    rol: RolLevantamiento;
    /** "desglose": segunda lámina de una táctica con muchas capas. */
    variante: "principal" | "desglose";
  }
  const laminasTactica: LaminaTactica[] = [];
  for (const rol of ["poi_propio", "competencia", "proximidad"] as const) {
    const capasRol = d.capas.filter((c) => c.rol === rol);
    if (capasRol.length === 0) continue;
    laminasTactica.push({ rol, variante: "principal" });
    if (capasRol.length > MAX_MARCAS_LAMINA) {
      laminasTactica.push({ rol, variante: "desglose" });
    }
  }
  if (d.ooh) laminasTactica.push({ rol: "ooh", variante: "principal" });

  // ---- folio total
  const totalLaminas =
    2 + // portada + resumen
    laminasTactica.length +
    (comparables.length >= 2 ? 1 : 0) +
    (d.traslapes.length > 0 ? 1 : 0) +
    1 + // siguientes pasos
    1 + // cierre
    1; // metodología
  let folio = 0;
  const n = () => ++folio;

  const celdaTh = {
    fontFamily: "DMMono" as const,
    fontWeight: 500 as const,
    fontSize: 6.5,
    letterSpacing: 1.2,
    color: GRIS_OSCURO,
  };
  const celdaTd = { fontFamily: "Inter" as const, fontSize: 8, color: TINTA };

  /** Columna derecha de una lámina de táctica. */
  function DatosTactica({ rol, variante }: LaminaTactica) {
    const capasRol = d.capas.filter((c) => c.rol === rol);
    const puntosRol = capasRol.reduce((t, c) => t + c.pois.length, 0);
    const uRol = universoDeRol(d, rol);
    const nse = segmentosNse(uRol);
    const edades = segmentosEdades(uRol);
    const pobRural = uRol?.residencial?.pobRural ?? 0;
    const pob = uRol?.residencial?.poblacion || 1;
    const pctRural = Math.round((100 * pobRural) / pob);
    const [etiqueta, tituloTac] = TITULO_TACTICA[rol];

    // lámina de DESGLOSE: mismo layout, la derecha lista capa por capa
    if (variante === "desglose") {
      return (
        <View style={{ width: DER_W, marginLeft: DER_X }}>
          <TituloLamina etiqueta={etiqueta} titulo={`${tituloTac} · desglose`} />
          <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: LINEA, paddingBottom: 4, marginBottom: 4 }}>
            <Text style={[celdaTh, { flex: 1 }]}>CAPA / MARCA</Text>
            <Text style={[celdaTh, { width: 54, textAlign: "right" }]}>PUNTOS</Text>
            <Text style={[celdaTh, { width: 92, textAlign: "right" }]}>UNIVERSO 18+</Text>
          </View>
          {capasRol.slice(0, MAX_FILAS_DESGLOSE).map((c) => (
            <View
              key={c.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: PANEL,
                borderLeftWidth: 2.5,
                borderLeftColor: c.color,
                borderRadius: 5,
                paddingTop: 6,
                paddingBottom: 6,
                paddingLeft: 8,
                paddingRight: 8,
                marginBottom: 5,
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color, marginRight: 6 }} />
              <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 10, color: BLANCO, flex: 1 }}>
                {c.nombre.length > 22 ? c.nombre.slice(0, 21) + "…" : c.nombre}
              </Text>
              <Text style={{ fontFamily: "DMMono", fontSize: 9, color: MAGENTA, width: 54, textAlign: "right" }}>
                {fmt(c.pois.length)}
              </Text>
              <Text style={{ fontFamily: "DMMono", fontSize: 9, color: CIAN, width: 92, textAlign: "right" }}>
                {adultos(c.universo) > 0 ? fmt(adultos(c.universo)) : "—"}
              </Text>
            </View>
          ))}
          {capasRol.length > MAX_FILAS_DESGLOSE && (
            <Text style={{ fontFamily: "DMMono", fontSize: 7, color: GRIS_OSCURO }}>
              +{capasRol.length - MAX_FILAS_DESGLOSE} capas más en el Export data (Excel).
            </Text>
          )}
        </View>
      );
    }

    // dato propio de la táctica
    const desgloseMarcas =
      rol === "competencia" && capasRol.length > 1
        ? capasRol.map((c) => `${c.nombre} ${fmt(c.pois.length)}`).join(" · ")
        : null;

    // mini-tabla top puntos SOLO si el espacio da respiración: una capa
    // y sin desglose de marcas (nunca se encoge la tipografía)
    const topPuntos =
      rol !== "ooh" && capasRol.length === 1 && !desgloseMarcas
        ? [...capasRol[0].pois]
            .sort((a, b) => (a.cp ?? "").localeCompare(b.cp ?? ""))
            .slice(0, MAX_TOP_PUNTOS)
        : [];

    return (
      <View style={{ width: DER_W, marginLeft: DER_X }}>
        <TituloLamina etiqueta={etiqueta} titulo={tituloTac} />

        {/* cifras clave */}
        {rol === "ooh" && d.ooh ? (
          <View style={{ flexDirection: "row", marginBottom: 12 }}>
            <CifraLamina valor={fmt(d.ooh.pantallas.length)} descriptor="Pantallas" />
            <CifraLamina
              valor={`${fmt(d.ooh.cubiertos)}/${fmt(d.ooh.totalPdvs)}`}
              descriptor="PDVs cubiertos"
            />
            <CifraLamina
              valor={
                d.ooh.impresiones != null && d.ooh.impresiones > 0
                  ? fmt(d.ooh.impresiones)
                  : "—"
              }
              descriptor="Impresiones/mes"
            />
          </View>
        ) : (
          <View style={{ flexDirection: "row", marginBottom: 12 }}>
            <CifraLamina valor={fmt(puntosRol)} descriptor="Puntos censados" />
            <CifraLamina
              valor={uRol ? fmt(adultos(uRol)) : "—"}
              descriptor="Universo 18+ de la capa"
            />
            <CifraLamina
              valor={
                uRol
                  ? pobRural > 0
                    ? `${100 - pctRural}%/${pctRural}%`
                    : "100%"
                  : "—"
              }
              descriptor={pobRural > 0 ? "urbano / rural" : "urbano"}
            />
          </View>
        )}

        {/* dato propio: desglose por marca (Conquista) */}
        {desgloseMarcas && (
          <View
            style={{
              backgroundColor: PANEL,
              borderRadius: 6,
              paddingTop: 7,
              paddingBottom: 7,
              paddingLeft: 10,
              paddingRight: 10,
              marginBottom: 12,
            }}
          >
            <Text style={[celdaTh, { marginBottom: 3 }]}>DESGLOSE POR MARCA</Text>
            <Text style={{ fontFamily: "DMMono", fontSize: 8.5, color: TINTA, lineHeight: 1.6 }}>
              {desgloseMarcas.length > 180
                ? desgloseMarcas.slice(0, 179) + "…"
                : desgloseMarcas}
            </Text>
          </View>
        )}
        {rol === "ooh" && d.ooh && (
          <Text style={{ fontFamily: "Inter", fontSize: 8.5, color: GRIS, marginBottom: 12 }}>
            Radio de cruce {d.ooh.radioTexto} ·{" "}
            {fmt(Math.max(0, d.ooh.totalPdvs - d.ooh.cubiertos))} PDVs sin
            cobertura
            {uRol ? ` · universo alrededor de las pantallas: ${fmt(adultos(uRol))} adultos 18+` : ""}
            .
          </Text>
        )}

        {/* demografía de la capa */}
        {nse && (
          <View style={{ marginBottom: 10 }}>
            <BarraApilada titulo="NSE (proxy censal, no AMAI)" segmentos={nse} width={DER_W} />
          </View>
        )}
        {edades && (
          <View style={{ marginBottom: 10 }}>
            <BarraApilada titulo="Edades · % del universo 18+" segmentos={edades} width={DER_W} />
          </View>
        )}

        {/* mini-tabla top puntos (solo con respiración) */}
        {topPuntos.length > 0 && (
          <View style={{ marginTop: 2 }}>
            <View style={{ flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: LINEA, paddingBottom: 3, marginBottom: 3 }}>
              <Text style={[celdaTh, { flex: 1 }]}>PUNTO</Text>
              <Text style={[celdaTh, { width: 54, textAlign: "right" }]}>CP</Text>
            </View>
            {topPuntos.map((p) => (
              <View key={p.placeId} style={{ flexDirection: "row", paddingTop: 2, paddingBottom: 2 }}>
                <Text style={[celdaTd, { flex: 1, color: TINTA }]}>
                  {p.nombre.length > 42 ? p.nombre.slice(0, 41) + "…" : p.nombre}
                </Text>
                <Text style={[celdaTd, { width: 54, textAlign: "right", fontFamily: "DMMono", color: CIAN }]}>
                  {p.cp ?? "—"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  function leyendaDe(rol: RolLevantamiento): { color: string; texto: string }[] {
    if (rol === "ooh") {
      return [
        { color: "#ff8c42", texto: "Pantallas (líneas = a qué PDV apoyan)" },
        { color: CIAN, texto: "PDVs" },
      ];
    }
    return d.capas.filter((c) => c.rol === rol).map((c) => ({ color: c.color, texto: c.nombre }));
  }

  return (
    <Document title={titulo} author="Gravity · Link Studio" creator="Seeker">
      {/* ============ L1 · PORTADA ============ */}
      <Page size={[SLIDE_W, SLIDE_H]} style={{ backgroundColor: FONDO, padding: M }}>
        <Neon height={200} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Marca size={40} />
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 26, color: BLANCO, marginLeft: 10 }}>
              Gravity
            </Text>
          </View>
          <Text style={{ fontFamily: "DMMono", fontSize: 8, letterSpacing: 1.4, color: GRIS }}>
            powered by linkstudio
          </Text>
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 10, letterSpacing: 3, color: MAGENTA }}>
            PLAN TERRITORIAL — {d.cliente.toUpperCase()}
          </Text>
          <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 34, color: BLANCO, marginTop: 10 }}>
            {titulo}
          </Text>
          <Text style={{ fontFamily: "Inter", fontSize: 12, color: GRIS, marginTop: 10 }}>
            Where physical meets digital.
          </Text>
          <View style={{ marginTop: 18, width: 320 }}>
            <Divisor width={320} />
          </View>
          <Text style={{ fontFamily: "DMMono", fontSize: 9, color: GRIS_OSCURO, marginTop: 14 }}>
            {fechaLarga} · Generado por {d.usuario}
          </Text>
        </View>
        <PieLamina cliente={d.cliente} n={n()} total={totalLaminas} />
      </Page>

      {/* ============ L2 · RESUMEN DEL PROYECTO ============ */}
      <Lamina cliente={d.cliente} n={n()} total={totalLaminas}>
        <TituloLamina etiqueta="Resumen del proyecto" titulo="El territorio completo" />
        <View style={{ flexDirection: "row", marginTop: 4 }}>
          <Cifra
            valor={u ? fmt(u.residencial!.adultos18) : "—"}
            descriptor="Universo consolidado · adultos 18+"
          />
          <Cifra
            valor={fmt(
              d.capas.reduce((t, c) => t + c.pois.length, 0) +
                (d.ooh?.pantallas.length ?? 0)
            )}
            descriptor="Puntos en el proyecto"
          />
          <Cifra valor={fmt(d.nLevantamientos)} descriptor="Levantamientos" />
          <Cifra valor={u ? fmt(u.agebs ?? 0) : "—"} descriptor="Zonas censales" />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 14 }}>
          {conteosRol.map((texto, i) => (
            <Text key={i} style={{ fontFamily: "DMMono", fontSize: 9, color: TINTA, marginRight: 10, marginBottom: 3 }}>
              {i > 0 ? "· " : ""}
              {texto}
            </Text>
          ))}
        </View>
        {nseCons && (
          <View style={{ marginTop: 16 }}>
            <BarraApilada
              titulo="Nivel socioeconómico del consolidado (proxy censal, no AMAI)"
              segmentos={nseCons}
              width={SLIDE_W - M * 2}
            />
          </View>
        )}
        {edadesCons && (
          <View style={{ marginTop: 12 }}>
            <BarraApilada
              titulo="Edades · % del universo 18+ consolidado"
              segmentos={edadesCons}
              width={SLIDE_W - M * 2}
            />
          </View>
        )}
        <Text style={{ fontFamily: "Inter", fontSize: 9, color: GRIS, marginTop: 14, lineHeight: 1.5 }}>
          Universo de la UNIÓN deduplicada de los territorios seleccionados
          {u && d.sumaSimple > adultos(u)
            ? `: la suma simple daría ${fmt(d.sumaSimple)} adultos 18+; el consolidado real es ${fmt(adultos(u))} (−${fmt(d.sumaSimple - adultos(u))} por traslapes entre capas).`
            : "."}
        </Text>
        <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 8 }}>
          {u
            ? `Censo 2020 INEGI · ${fmt(u.agebs ?? 0)} zonas censales${(u.rurales ?? 0) > 0 ? ` · ${fmt(u.rurales!)} localidades rurales (ITER)` : ""}${u.criterio ? ` · ${u.criterio}` : ""}`
            : "Universo consolidado no disponible"}
        </Text>
      </Lamina>

      {/* ============ L3+ · UNA LÁMINA POR TÁCTICA ============ */}
      {laminasTactica.map((lam) => (
        <Lamina
          key={`${lam.rol}-${lam.variante}`}
          cliente={d.cliente}
          n={n()}
          total={totalLaminas}
        >
          <View style={{ flexDirection: "row" }}>
            <MapaTactica
              dataUrl={
                lam.rol === "ooh"
                  ? (d.mapasRol?.ooh ?? d.ooh?.mapaDataUrl)
                  : d.mapasRol?.[lam.rol]
              }
              leyenda={leyendaDe(lam.rol)}
            />
            <DatosTactica rol={lam.rol} variante={lam.variante} />
          </View>
        </Lamina>
      ))}

      {/* ============ Ln · COMPARATIVO DE CAPAS ============ */}
      {comparables.length >= 2 && (
        <Lamina cliente={d.cliente} n={n()} total={totalLaminas}>
          <TituloLamina
            etiqueta="Inteligencia territorial"
            titulo="Cómo se comparan las capas"
          />
          <View style={{ flexDirection: "row", marginBottom: 5 }}>
            <Text style={[celdaTh, { width: 250 }]}>CAPA · UNIVERSO 18+ PROPIO</Text>
            <Text style={[celdaTh, { width: (SLIDE_W - M * 2 - 250 - 34) / 2, marginRight: 20 }]}>
              NSE (PROXY CENSAL)
            </Text>
            <Text style={[celdaTh, { width: (SLIDE_W - M * 2 - 250 - 34) / 2 }]}>
              EDADES · % DEL UNIVERSO 18+
            </Text>
          </View>
          {comparables.slice(0, MAX_FILAS_COMPARATIVO).map((c: CapaPlanProyecto) => {
            const nseCapa = segmentosNse(c.universo);
            const edadesCapa = segmentosEdades(c.universo);
            const wBarra = (SLIDE_W - M * 2 - 250 - 34) / 2;
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
                  paddingTop: 7,
                  paddingBottom: 7,
                  paddingLeft: 10,
                  paddingRight: 4,
                  marginBottom: 6,
                }}
              >
                <View style={{ width: 240 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.color, marginRight: 6 }} />
                    <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 10.5, color: BLANCO }}>
                      {c.nombre.length > 26 ? c.nombre.slice(0, 25) + "…" : c.nombre}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: "DMMono", fontSize: 7.5, color: GRIS, marginTop: 3 }}>
                    {NOMBRE_ROL[c.rol]} ·{" "}
                    <Text style={{ color: CIAN }}>{fmt(adultos(c.universo))}</Text>{" "}
                    adultos 18+ · {fmt(c.pois.length)} puntos
                  </Text>
                </View>
                <View style={{ width: wBarra, marginRight: 20 }}>
                  <View style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: FONDO }}>
                    {(nseCapa ?? []).map(
                      (s) =>
                        s.pct > 0 && (
                          <View key={s.etiqueta} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                        )
                    )}
                  </View>
                </View>
                <View style={{ width: wBarra }}>
                  <View style={{ flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: FONDO }}>
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
          {comparables.length > MAX_FILAS_COMPARATIVO && (
            <Text style={{ fontFamily: "DMMono", fontSize: 7, color: GRIS_OSCURO }}>
              +{comparables.length - MAX_FILAS_COMPARATIVO} capas más en el one-pager y el Export data.
            </Text>
          )}
        </Lamina>
      )}

      {/* ============ Ln+1 · TRASLAPES (el dato estrella) ============ */}
      {d.traslapes.length > 0 && (
        <Lamina cliente={d.cliente} n={n()} total={totalLaminas}>
          <TituloLamina
            etiqueta="Traslapes entre capas"
            titulo="Cuánta gente comparte territorio"
          />
          {traslapeEstrella ? (
            <View style={{ flex: 1, justifyContent: "center", marginBottom: 12 }}>
              <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 8.5, letterSpacing: 2.4, color: MAGENTA }}>
                TRASLAPE {traslapeEstrella.etiquetaA.toUpperCase()} × {traslapeEstrella.etiquetaB.toUpperCase()} — LA AUDIENCIA DE CONQUISTA
              </Text>
              <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 52, color: BLANCO, marginTop: 10 }}>
                {fmt(traslapeEstrella.poblacion)} personas
              </Text>
              <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 18, color: CIAN, marginTop: 6 }}>
                {traslapeEstrella.pctBase.toLocaleString("es-MX")}% de tu territorio también está en zona de competencia.
              </Text>
              <Text style={{ fontFamily: "Inter", fontSize: 9.5, color: GRIS, marginTop: 10 }}>
                Base: universo de {traslapeEstrella.etiquetaA} ({fmt(traslapeEstrella.poblacionBase)} personas) · cálculo por
                inclusión-exclusión sobre el censo, con las mismas sumas crudas.
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 8 }} />
          )}
          {otrosTraslapes.slice(0, 3).map((t, i) => (
            <Text key={i} style={{ fontFamily: "Inter", fontSize: 9.5, color: TINTA, marginBottom: 5 }}>
              Traslape {t.etiquetaA} × {t.etiquetaB}:{" "}
              <Text style={{ fontFamily: "Manrope", fontWeight: 800, color: BLANCO }}>
                {fmt(t.poblacion)} personas
              </Text>{" "}
              ({t.pctBase.toLocaleString("es-MX")}% del universo de {t.etiquetaA}).
            </Text>
          ))}
        </Lamina>
      )}

      {/* ============ Ln+2 · SIGUIENTES PASOS ============ */}
      <Lamina cliente={d.cliente} n={n()} total={totalLaminas}>
        <TituloLamina
          etiqueta="Siguientes pasos"
          titulo="Qué se puede activar sobre este territorio"
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {tacticas.map((t) => (
            <PillLamina
              key={t.clave}
              clave={t.clave}
              nombre={t.nombre}
              descriptor={t.descriptor}
              destacada={t.destacada}
            />
          ))}
        </View>
        <View style={{ marginTop: 8 }}>
          {sustentos.map((s) => (
            <Text key={s.clave} style={{ fontFamily: "Inter", fontSize: 8.5, color: GRIS, marginBottom: 5, lineHeight: 1.4 }}>
              <Text style={{ fontFamily: "Manrope", fontWeight: 800, color: TINTA }}>
                {TACTICAS[s.clave].nombre}
              </Text>{" "}
              — {s.texto}.
            </Text>
          ))}
          <Text style={{ fontFamily: "Inter", fontSize: 9, color: TINTA, marginTop: 4 }}>
            El equipo de Gravity arma el plan de medios sobre este territorio.
          </Text>
        </View>
      </Lamina>

      {/* ============ Ln+3 · CIERRE ============ */}
      <Page size={[SLIDE_W, SLIDE_H]} style={{ backgroundColor: FONDO, padding: M }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", position: "relative" }}>
          <Neon height={160} />
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Marca size={44} />
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 28, color: BLANCO, marginLeft: 10 }}>
              Gravity
            </Text>
          </View>
          <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 20, color: BLANCO, marginTop: 22 }}>
            Hagamos del mundo físico tu mejor canal digital.
          </Text>
          <View style={{ flexDirection: "row", marginTop: 10 }}>
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 13, color: MAGENTA }}>
              Real Audiences.{" "}
            </Text>
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 13, color: CIAN }}>
              Real Visits.{" "}
            </Text>
            <Text style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 13, color: VIOLETA }}>
              Real Gravity.
            </Text>
          </View>
          <Text style={{ fontFamily: "DMMono", fontSize: 9, color: GRIS, marginTop: 26 }}>
            www.linkstudio.mx · hello@linkstudio.mx · {fechaLarga}
          </Text>
        </View>
        <PieLamina cliente={d.cliente} n={n()} total={totalLaminas} />
      </Page>

      {/* ============ Ln+4 · METODOLOGÍA (discreta) ============ */}
      <Lamina cliente={d.cliente} n={n()} total={totalLaminas}>
        <Text style={{ fontFamily: "DMMono", fontWeight: 500, fontSize: 8, letterSpacing: 2.2, color: GRIS_OSCURO, marginBottom: 14 }}>
          METODOLOGÍA · RESPALDO TÉCNICO DEL PROYECTO
        </Text>
        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, paddingRight: 26 }}>
            <Text style={[celdaTh, { marginBottom: 6 }]}>FUENTES DE DATOS (TODOS LOS LEVANTAMIENTOS)</Text>
            {d.fuentes.map((f) => (
              <Text key={f} style={{ fontFamily: "Inter", fontSize: 8, color: GRIS, marginBottom: 4, lineHeight: 1.45 }}>
                · {f}
              </Text>
            ))}
            <Text style={{ fontFamily: "Inter", fontSize: 8, color: GRIS_OSCURO, lineHeight: 1.5, marginTop: 8 }}>
              Georreferenciación en lat/long WGS84 (EPSG:4326). Proyecto
              consolidado el {fechaLarga} con Seeker Planner, sobre{" "}
              {fmt(d.nLevantamientos)} levantamientos. Deduplicación por
              identificador de lugar dentro de cada levantamiento.
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[celdaTh, { marginBottom: 6 }]}>UNIVERSOS Y TRASLAPES</Text>
            <Text style={{ fontFamily: "Inter", fontSize: 8, color: GRIS, lineHeight: 1.5 }}>
              {hayRural
                ? "Población urbana por interpolación areal de AGEBs (Censo 2020 INEGI) + población rural por localidad puntual (ITER 2020, localidades <2,500 hab)"
                : "Población por interpolación areal sobre AGEBs urbanas del Censo 2020 (INEGI)"}
              , contra la UNIÓN deduplicada de las geometrías de los
              levantamientos seleccionados. El universo de cada táctica se
              calcula sobre la unión de buffers de SUS propios puntos.
            </Text>
            <Text style={{ fontFamily: "Inter", fontSize: 8, color: GRIS_OSCURO, lineHeight: 1.5, marginTop: 8 }}>
              Traslapes por inclusión-exclusión — pob(A∩B) = pob(A) + pob(B) −
              pob(A∪B) — con las mismas sumas censales. El índice
              socioeconómico es un proxy censal (escolaridad, vehículos e
              internet por vivienda); no es NSE AMAI. Los rangos de edad 25-64
              se estiman con estructura nacional del Censo 2020.
            </Text>
          </View>
        </View>
      </Lamina>
    </Document>
  );
}

/** Nombre de archivo: Gravity_Presentacion_[Cliente]_[titulo]_[fecha].pdf */
export function nombreArchivoPresentacion(
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
  return `Gravity_Presentacion_${c}${t ? `_${t}` : ""}_${f}.pdf`;
}

/** Genera el PDF de láminas 16:9. `baseFuentes` solo en pruebas Node. */
export async function generarPresentacionProyecto(
  datos: PlanProyectoDatos,
  baseFuentes = ""
): Promise<Blob> {
  registrarFuentes(baseFuentes);
  return pdf(<SlidesDocumento d={datos} />).toBlob();
}

/** Variante Node para pruebas (elemento en vez de Blob). */
export function documentoPresentacionProyecto(datos: PlanProyectoDatos) {
  return <SlidesDocumento d={datos} />;
}
