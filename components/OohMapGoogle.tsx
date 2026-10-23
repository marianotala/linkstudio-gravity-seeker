"use client";

// Mapa del cruce OOH sobre Google Maps (estilo claro): pantallas con
// color por tipo, PDVs en azul (huecos magenta SIN cobertura), líneas
// pantalla→PDV con distancia en km y radios opcionales — mismo
// comportamiento que OohMapLeaflet (el respaldo).

import { useMemo } from "react";
import MapaGoogleEscena, { type EscenaGoogle } from "./MapaGoogleEscena";
import { escaparHtml } from "@/lib/gmaps";
import { etiquetaOrigen } from "@/lib/geo";
import { colorTipoPantalla, etiquetaTipoPantalla } from "@/lib/ooh";
import type { OohMapProps } from "./OohMapLeaflet";
import type { CrucePantalla } from "@/lib/types";

const CIAN = "#27b5e2";
const MAGENTA = "#f52d87";
const MAX_ETIQUETAS_FIJAS = 80;

const htmlPantalla = (c: CrucePantalla) => {
  const p = c.pantalla;
  const partes = [
    `<div style="font-family:monospace;font-size:12px"><strong>${escaparHtml(p.nombre ?? p.clave)}</strong>`,
    `<div>${escaparHtml(etiquetaTipoPantalla(p.tipo))}${p.digital !== null ? ` · ${p.digital ? "digital" : "estática"}` : ""}</div>`,
  ];
  if (p.medio) partes.push(`<div>Medio: ${escaparHtml(p.medio)}</div>`);
  if (p.ciudad) partes.push(`<div>${escaparHtml(p.ciudad)}</div>`);
  if (p.impresiones != null) {
    partes.push(`<div>${p.impresiones.toLocaleString("es-MX")} impresiones/mes</div>`);
  }
  partes.push(
    `<div>Apoya ${c.pdvs.length} ${c.pdvs.length === 1 ? "PDV" : "PDVs"} en ${(c.radioM / 1000).toLocaleString("es-MX")} km</div></div>`
  );
  return partes.join("");
};

export default function OohMapGoogle({
  pdvs,
  cruces,
  cubiertos,
  verLineas,
  verRadios,
  foco,
}: OohMapProps) {
  const escena = useMemo<EscenaGoogle>(() => {
    const e: Required<Pick<EscenaGoogle, "markers" | "lineas" | "circulos">> &
      EscenaGoogle = {
      markers: [],
      lineas: [],
      circulos: [],
      encuadre: [],
      encuadreKey: "",
    };

    // líneas de conexión pantalla→PDV con distancia en km
    const lineas = (cruces ?? []).flatMap((c) =>
      c.pdvs.map((rel) => ({
        a: { lat: c.pantalla.lat, lng: c.pantalla.lng },
        b: pdvs[rel.idx],
        km: rel.distancia / 1000,
        color: colorTipoPantalla(c.pantalla.tipo),
      }))
    );
    const etiquetasFijas = lineas.length <= MAX_ETIQUETAS_FIJAS;
    if (verLineas) {
      lineas.forEach((l, i) => {
        e.lineas.push({
          id: `l-${i}`,
          a: l.a,
          b: l.b,
          color: l.color,
          weight: 1.4,
          opacidad: 0.55,
          etiqueta: `${l.km.toLocaleString("es-MX", { maximumFractionDigits: 1 })} km`,
          etiquetaFija: etiquetasFijas,
        });
      });
    }

    // pantallas: color por tipo, radio de cruce opcional
    (cruces ?? []).forEach((c) => {
      const color = colorTipoPantalla(c.pantalla.tipo);
      if (verRadios) {
        e.circulos.push({
          id: `r-${c.pantalla.clave}`,
          lat: c.pantalla.lat,
          lng: c.pantalla.lng,
          radioM: c.radioM,
          color,
          opacidad: 0.4,
          weight: 1,
          fillOpacity: 0.04,
        });
      }
      e.markers.push({
        id: `p-${c.pantalla.clave}`,
        lat: c.pantalla.lat,
        lng: c.pantalla.lng,
        stroke: "#ffffff",
        strokeWeight: 1.5,
        fill: color,
        fillOpacity: 1,
        radioPx: 7,
        popupHtml: htmlPantalla(c),
        zIndex: 300,
      });
    });

    // PDVs del cliente: azul; SIN cobertura = hueco magenta
    pdvs.forEach((o, i) => {
      const sinCobertura = cruces !== null && !cubiertos.has(i);
      e.markers.push({
        id: `pdv-${i}`,
        lat: o.lat,
        lng: o.lng,
        stroke: sinCobertura ? MAGENTA : CIAN,
        strokeWeight: 2,
        fill: "#ffffff",
        fillOpacity: 1,
        radioPx: 5.5,
        popupHtml: `<div style="font-family:monospace;font-size:12px"><strong>${escaparHtml(etiquetaOrigen(o, i))}</strong>${o.direccion ? `<div>${escaparHtml(o.direccion)}</div>` : ""}${sinCobertura ? `<div style="color:${MAGENTA}">SIN cobertura: ninguna pantalla dentro del radio</div>` : ""}</div>`,
        zIndex: 200,
      });
    });

    const encuadre = pdvs.map((o) => ({ lat: o.lat, lng: o.lng }));
    (cruces ?? []).forEach((c) =>
      encuadre.push({ lat: c.pantalla.lat, lng: c.pantalla.lng })
    );
    e.encuadre = encuadre;
    e.encuadreKey = `${pdvs.length}|${cruces?.length ?? "s"}`;
    e.foco = foco ? { ...foco, zoom: foco.zoom ?? 14 } : null;
    return e;
  }, [pdvs, cruces, cubiertos, verLineas, verRadios, foco]);

  return <MapaGoogleEscena escena={escena} />;
}
