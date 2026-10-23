"use client";

// Mapa del BUSCADOR sobre Google Maps (estilo claro, brand V2): misma
// simbología y comportamiento que el MapViewLeaflet de respaldo —
// orígenes en azul con radio, zonas en morado, POIs magenta/naranja
// por fuente, celdas de censo, polígonos de CP interactivos, AGEBs y
// clustering reactivo al zoom. SOLO se importa con dynamic ssr:false.

import { useMemo, useState } from "react";
import MapaGoogleEscena, { type EscenaGoogle } from "./MapaGoogleEscena";
import { escaparHtml } from "@/lib/gmaps";
import { etiquetaOrigen } from "@/lib/geo";
import type { MapViewProps } from "./MapViewLeaflet";
import type { CpPoligono, Origin, Poi } from "@/lib/types";

const CIAN = "#27b5e2";
const MAGENTA = "#f52d87";
const VIOLETA = "#9966f2";
const NARANJA = "#e2711d"; // POIs de DENUE (INEGI)

const UMBRAL_CLUSTER = 300;
const UMBRAL_CLUSTER_POIS = 800;

function colorPoi(fuente: string): { color: string; fillColor: string } {
  if (fuente === "denue") return { color: NARANJA, fillColor: NARANJA };
  if (fuente === "ambas") return { color: NARANJA, fillColor: MAGENTA };
  return { color: MAGENTA, fillColor: MAGENTA };
}

/** Clustering por retícula (misma fórmula del mapa Leaflet). */
function agrupar<T extends { lat: number; lng: number }>(
  puntos: T[],
  zoom: number
): { lat: number; lng: number; n: number; uno: T; idx: number }[] {
  const celda = 360 / (Math.pow(2, zoom) * 2.85);
  const bins = new Map<
    string,
    { sumLat: number; sumLng: number; n: number; uno: T; idx: number }
  >();
  puntos.forEach((p, idx) => {
    const llave = `${Math.floor(p.lat / celda)}:${Math.floor(p.lng / celda)}`;
    const b = bins.get(llave);
    if (b) {
      b.sumLat += p.lat;
      b.sumLng += p.lng;
      b.n++;
    } else {
      bins.set(llave, { sumLat: p.lat, sumLng: p.lng, n: 1, uno: p, idx });
    }
  });
  return Array.from(bins.values()).map((b) => ({
    lat: b.sumLat / b.n,
    lng: b.sumLng / b.n,
    n: b.n,
    uno: b.uno,
    idx: b.idx,
  }));
}

const htmlOrigen = (o: Origin, i: number) =>
  `<div style="font-family:monospace;font-size:12px"><strong>${escaparHtml(etiquetaOrigen(o, i))}</strong>${o.direccion ? `<div>${escaparHtml(o.direccion)}</div>` : ""}<div>${o.lat.toFixed(6)}, ${o.lng.toFixed(6)}</div></div>`;

const htmlPoi = (p: Poi) =>
  `<div style="font-family:monospace;font-size:12px;max-width:220px"><strong>${escaparHtml(p.nombre)}</strong><div>${escaparHtml(p.direccion)}</div><div>${p.lat.toFixed(6)}, ${p.lng.toFixed(6)} · ${p.distancia} m</div><div>fuente: ${escaparHtml(p.fuente.toUpperCase())}${p.estrato ? ` · ${escaparHtml(p.estrato)}` : ""}</div>${p.capa ? `<div>capa: ${escaparHtml(p.capa)}</div>` : ""}${p.actividad ? `<div>${escaparHtml(p.actividad)}</div>` : ""}</div>`;

/** Popup del polígono de CP (mismo contenido que el Leaflet). */
function popupCp(c: CpPoligono, poblacion?: number): string {
  const colonias = (c.colonias ?? []).slice(0, 5);
  const total = c.total_colonias ?? colonias.length;
  const extra = total - colonias.length;
  const partes = [
    `<div style="font-family:monospace;font-size:12px;min-width:170px;max-width:230px">`,
    `<div style="font-size:20px;font-weight:800;letter-spacing:0.04em">${escaparHtml(c.codigo_postal)}</div>`,
  ];
  if (colonias.length > 0) {
    partes.push(
      `<div style="margin-top:4px;line-height:1.5">${colonias.map(escaparHtml).join(", ")}${extra > 0 ? ` <span style="opacity:0.6">+${extra} más</span>` : ""}</div>`
    );
  }
  if (c.municipio || c.estado) {
    partes.push(
      `<div style="margin-top:4px;opacity:0.75">${escaparHtml([c.municipio, c.estado].filter(Boolean).join(" · "))}</div>`
    );
  }
  if (poblacion !== undefined) {
    partes.push(
      `<div style="margin-top:4px;color:#9966f2">población: ${poblacion.toLocaleString("es-MX")}</div>`
    );
  }
  partes.push(`</div>`);
  return partes.join("");
}

export default function MapViewGoogle(props: MapViewProps) {
  const {
    mode,
    origenes,
    zona,
    zonas,
    radio,
    pois,
    foco,
    celdas,
    radioCelda,
    agebs,
    cps,
    etiquetasCp,
    poblacionCp,
    colorPorCapa,
  } = props;
  const [zoom, setZoom] = useState(11);

  const escena = useMemo<EscenaGoogle>(() => {
    const e: Required<
      Pick<
        EscenaGoogle,
        "circulos" | "rects" | "markers" | "clusters" | "poligonos" | "lineas"
      >
    > &
      EscenaGoogle = {
      circulos: [],
      rects: [],
      markers: [],
      clusters: [],
      poligonos: [],
      lineas: [],
      encuadre: [],
      encuadreKey: "",
    };

    // ---- orígenes (con clustering sobre el umbral)
    if (mode === "origins") {
      if (origenes.length <= UMBRAL_CLUSTER) {
        origenes.forEach((o, i) => {
          e.circulos.push({
            id: `or-${i}`,
            lat: o.lat,
            lng: o.lng,
            radioM: radio,
            color: CIAN,
            opacidad: 0.55,
            weight: 1,
            fillOpacity: 0.06,
          });
          e.markers.push({
            id: `o-${i}`,
            lat: o.lat,
            lng: o.lng,
            stroke: CIAN,
            strokeWeight: 2,
            fill: "#ffffff",
            fillOpacity: 1,
            radioPx: 6,
            popupHtml: htmlOrigen(o, i),
          });
        });
      } else {
        for (const c of agrupar(origenes, zoom)) {
          if (c.n === 1) {
            e.markers.push({
              id: `o-${c.idx}`,
              lat: c.lat,
              lng: c.lng,
              stroke: CIAN,
              strokeWeight: 2,
              fill: "#ffffff",
              fillOpacity: 1,
              radioPx: 5,
              popupHtml: htmlOrigen(c.uno, c.idx),
            });
          } else {
            e.clusters.push({
              id: `oc-${c.lat}-${c.lng}`,
              lat: c.lat,
              lng: c.lng,
              n: c.n,
              tipo: "origenes",
            });
          }
        }
      }
    }

    // ---- capa demográfica: choropleth morado por AGEB
    (agebs ?? []).forEach((a) => {
      e.poligonos.push({
        id: `ageb-${a.cvegeo}`,
        geojson: a.geometria,
        estilo: {
          stroke: VIOLETA,
          strokeOpacity: 0.5,
          weight: 0.7,
          fill: VIOLETA,
          fillOpacity: 0.08 + 0.45 * ((a.nse_proxy ?? 30) / 100),
        },
        tooltipHtml: `<div style="font-family:monospace;font-size:11px">AGEB ${escaparHtml(a.cvegeo)}<br/>población: ${a.pobtot?.toLocaleString("es-MX") ?? "—"}<br/>NSE proxy: ${a.nse_proxy ?? "—"}</div>`,
      });
    });

    // ---- modo CP: polígonos interactivos con selección y hover
    if (mode === "cp") {
      (cps ?? []).forEach((c) => {
        if (!c.geometria) return;
        const centro = {
          lat: (c.bbox.north + c.bbox.south) / 2,
          lng: (c.bbox.east + c.bbox.west) / 2,
        };
        e.poligonos.push({
          id: `cp-${c.codigo_postal}`,
          geojson: c.geometria,
          estilo: {
            stroke: VIOLETA,
            strokeOpacity: 0.9,
            weight: 2,
            fill: VIOLETA,
            fillOpacity: 0.16,
          },
          estiloSel: {
            stroke: CIAN,
            strokeOpacity: 1,
            weight: 3,
            fill: VIOLETA,
            fillOpacity: 0.3,
          },
          estiloAtenuado: {
            stroke: VIOLETA,
            strokeOpacity: 0.45,
            weight: 1.5,
            fill: VIOLETA,
            fillOpacity: 0.06,
          },
          hoverFillOpacity: 0.24,
          seleccionable: true,
          popupHtml: popupCp(c, poblacionCp?.[c.codigo_postal]),
          etiquetaCentro: etiquetasCp ? c.codigo_postal : undefined,
          centro,
        });
      });
    }

    // ---- celdas del censo (marca/territorial)
    if (mode === "census" || mode === "territorial") {
      (celdas ?? []).forEach((c, i) => {
        e.circulos.push({
          id: `celda-${i}`,
          lat: c.lat,
          lng: c.lng,
          radioM: radioCelda ?? 2000,
          color: CIAN,
          opacidad: 0.35,
          weight: 0.8,
          fillOpacity: 0.03,
        });
      });
    }

    // ---- zonas por límites reales
    if (mode === "zone") {
      (zonas ?? []).forEach((z, i) => {
        if (z.viewport) {
          e.rects.push({
            id: `z-${i}`,
            norte: z.viewport.north,
            sur: z.viewport.south,
            este: z.viewport.east,
            oeste: z.viewport.west,
            color: VIOLETA,
            weight: 1.5,
            opacidad: 0.7,
            fill: VIOLETA,
            fillOpacity: 0.06,
            punteado: true,
          });
        }
        e.markers.push({
          id: `zm-${i}`,
          lat: z.lat,
          lng: z.lng,
          stroke: VIOLETA,
          strokeWeight: 2,
          fill: "#ffffff",
          fillOpacity: 1,
          radioPx: 7,
          popupHtml: `<div style="font-family:monospace;font-size:12px"><strong>${escaparHtml(z.nombre ?? `Zona ${i + 1}`)}</strong><div>${z.lat.toFixed(6)}, ${z.lng.toFixed(6)}</div></div>`,
        });
      });
    }

    // ---- centro del censo de marca/territorial
    if ((mode === "census" || mode === "territorial") && zona) {
      if (radio > 0) {
        e.circulos.push({
          id: "zona-radio",
          lat: zona.lat,
          lng: zona.lng,
          radioM: radio,
          color: VIOLETA,
          opacidad: 0.7,
          weight: 1.5,
          fillOpacity: 0.07,
        });
      }
      e.markers.push({
        id: "zona-centro",
        lat: zona.lat,
        lng: zona.lng,
        stroke: VIOLETA,
        strokeWeight: 2,
        fill: "#ffffff",
        fillOpacity: 1,
        radioPx: 7,
        popupHtml: `<div style="font-family:monospace;font-size:12px"><strong>${escaparHtml(zona.nombre ?? "Zona")}</strong><div>${zona.lat.toFixed(6)}, ${zona.lng.toFixed(6)}</div></div>`,
      });
    }

    // ---- POIs (clustering sobre el umbral)
    const marcarPoi = (p: Poi) => {
      const colorCapa = p.capa ? colorPorCapa?.[p.capa] : undefined;
      const c = colorCapa
        ? { color: colorCapa, fillColor: colorCapa }
        : colorPoi(p.fuente);
      e.markers.push({
        id: `poi-${p.capa ?? ""}:${p.placeId}`,
        lat: p.lat,
        lng: p.lng,
        stroke: c.color,
        strokeWeight: p.fuente === "ambas" ? 2 : 1.5,
        fill: c.fillColor,
        fillOpacity: 0.75,
        radioPx: 5,
        popupHtml: htmlPoi(p),
      });
    };
    if (pois.length <= UMBRAL_CLUSTER_POIS) {
      pois.forEach(marcarPoi);
    } else {
      for (const c of agrupar(pois, zoom)) {
        if (c.n === 1) marcarPoi(c.uno);
        else {
          e.clusters.push({
            id: `pc-${c.lat}-${c.lng}`,
            lat: c.lat,
            lng: c.lng,
            n: c.n,
            tipo: "pois",
          });
        }
      }
    }

    // ---- encuadre (misma lógica que el Leaflet)
    const puntos: { lat: number; lng: number }[] = [];
    if (mode === "origins") {
      origenes.forEach((o) => puntos.push(o));
    } else if (mode === "zone") {
      (zonas ?? []).forEach((z) => {
        if (z.viewport) {
          puntos.push(
            { lat: z.viewport.south, lng: z.viewport.west },
            { lat: z.viewport.north, lng: z.viewport.east }
          );
        } else puntos.push(z);
      });
    } else if (mode === "cp") {
      (cps ?? []).forEach((c) => {
        puntos.push(
          { lat: c.bbox.south, lng: c.bbox.west },
          { lat: c.bbox.north, lng: c.bbox.east }
        );
      });
    } else if (zona) {
      puntos.push(zona);
    }
    (celdas ?? []).forEach((c) => puntos.push(c));
    pois.forEach((p) => puntos.push(p));
    e.encuadre = puntos;
    e.encuadreKey = [
      mode,
      origenes.length,
      zonas?.length ?? 0,
      pois.length,
      celdas?.length ?? 0,
      cps?.length ?? 0,
      zona ? `${zona.lat},${zona.lng}` : "",
      puntos[0] ? `${puntos[0].lat},${puntos[0].lng}` : "",
    ].join("|");
    e.zoomPuntoUnico = radio >= 5000 ? 12 : radio >= 2000 ? 13 : 14;
    e.foco = foco ? { ...foco, zoom: 17 } : null;
    e.onZoom = setZoom; // setState es estable: no rompe el memo
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    origenes,
    zona,
    zonas,
    radio,
    pois,
    foco,
    celdas,
    radioCelda,
    agebs,
    cps,
    etiquetasCp,
    poblacionCp,
    colorPorCapa,
    zoom,
  ]);

  return <MapaGoogleEscena escena={escena} />;
}
