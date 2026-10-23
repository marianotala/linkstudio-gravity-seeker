"use client";

// RENDERER GENÉRICO de Google Maps para Seeker: recibe una ESCENA
// declarativa (círculos, rectángulos, líneas, markers, clusters y
// polígonos GeoJSON) y la pinta imperativamente sobre un mapa claro.
// Los tres mapas de la app (consulta, proyecto y OOH) traducen sus
// props a esta escena — así la simbología vive en un solo lugar y el
// fallback a Leaflet conserva sus componentes originales intactos.
// SOLO se importa con dynamic ssr:false (vía los selectores de mapa).

import { useEffect, useRef } from "react";
import { ESTILO_MAPA_CLARO } from "@/lib/gmaps";
import type { LatLng } from "@/lib/types";

const CENTRO_INICIAL = { lat: 19.4326, lng: -99.1332 }; // CDMX

export interface EstiloPoligono {
  stroke: string;
  strokeOpacity: number;
  weight: number;
  fill: string;
  fillOpacity: number;
}

export interface EscenaGoogle {
  /** Círculos geográficos (radios de origen/celdas/buffers). */
  circulos?: {
    id: string;
    lat: number;
    lng: number;
    radioM: number;
    color: string;
    opacidad: number;
    weight: number;
    fillOpacity: number;
  }[];
  /** Rectángulos (zonas por viewport, pantallas OOH cuadradas). */
  rects?: {
    id: string;
    norte: number;
    sur: number;
    este: number;
    oeste: number;
    color: string;
    weight: number;
    opacidad: number;
    fill: string;
    fillOpacity: number;
    punteado?: boolean;
    popupHtml?: string;
  }[];
  /** Líneas (cruce OOH pantalla→PDV), con etiqueta de km opcional. */
  lineas?: {
    id: string;
    a: LatLng;
    b: LatLng;
    color: string;
    weight: number;
    opacidad: number;
    etiqueta?: string;
    etiquetaFija?: boolean;
  }[];
  /** Markers circulares (o cuadrados) con popup. */
  markers?: {
    id: string;
    lat: number;
    lng: number;
    stroke: string;
    strokeWeight: number;
    fill: string;
    fillOpacity: number;
    radioPx: number;
    cuadrado?: boolean;
    popupHtml?: string;
    zIndex?: number;
  }[];
  /** Clusters (conteo agrupado): clic = acercar. */
  clusters?: {
    id: string;
    lat: number;
    lng: number;
    n: number;
    /** Paleta: "origenes" (azul) o "pois" (magenta). */
    tipo: "origenes" | "pois";
  }[];
  /** Polígonos GeoJSON (CPs, AGEBs, coberturas). */
  poligonos?: {
    id: string;
    geojson: Record<string, unknown>;
    estilo: EstiloPoligono;
    /** Popup al clic (si además es seleccionable, resalta). */
    popupHtml?: string;
    /** Tooltip que sigue al cursor (AGEBs). */
    tooltipHtml?: string;
    /** Etiqueta fija al centro (CPs con etiquetas encendidas). */
    etiquetaCentro?: string;
    centro?: LatLng;
    /** fillOpacity al pasar el mouse (affordance). */
    hoverFillOpacity?: number;
    /** Estilos de selección por clic (modo CP). */
    seleccionable?: boolean;
    estiloSel?: EstiloPoligono;
    estiloAtenuado?: EstiloPoligono;
  }[];
  /** Puntos que definen el encuadre (fitBounds con pad). */
  encuadre: LatLng[];
  /** Firma del encuadre: solo se re-encuadra cuando cambia. */
  encuadreKey: string;
  /** Zoom si el encuadre es UN solo punto. */
  zoomPuntoUnico?: number;
  /** Volar a este punto (clic en tabla); tiene prioridad. */
  foco?: (LatLng & { zoom?: number }) | null;
  /** Avisa el zoom actual (clustering reactivo del adaptador). */
  onZoom?: (zoom: number) => void;
}

const sym = (g: typeof google) => ({
  circulo: g.maps.SymbolPath.CIRCLE,
  cuadrado: "M -1 -1 L 1 -1 L 1 1 L -1 1 Z",
});

export default function MapaGoogleEscena({ escena }: { escena: EscenaGoogle }) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<google.maps.Map | null>(null);
  const objetosRef = useRef<{ setMap: (m: google.maps.Map | null) => void }[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const tooltipRef = useRef<google.maps.InfoWindow | null>(null);
  const encuadreHechoRef = useRef<string>("");
  const selRef = useRef<string | null>(null);

  // ---- crear el mapa una sola vez
  useEffect(() => {
    if (!divRef.current || mapaRef.current || !window.google?.maps) return;
    mapaRef.current = new google.maps.Map(divRef.current, {
      center: CENTRO_INICIAL,
      zoom: 11,
      styles: ESTILO_MAPA_CLARO,
      backgroundColor: "#f7f5ef",
      clickableIcons: false,
      fullscreenControl: false,
      streetViewControl: false,
      mapTypeControl: false,
      gestureHandling: "greedy",
      zoomControl: true,
    });
    infoRef.current = new google.maps.InfoWindow();
    tooltipRef.current = new google.maps.InfoWindow({ disableAutoPan: true });
  }, []);

  // ---- reportar zoom (clustering reactivo)
  const onZoom = escena.onZoom;
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !onZoom) return;
    const l = mapa.addListener("zoom_changed", () => {
      const z = mapa.getZoom();
      if (typeof z === "number") onZoom(z);
    });
    return () => l.remove();
  }, [onZoom]);

  // mapa local de estilos por polígono (selección/hover del modo CP)
  const estilosPoligono = useRef(
    new Map<
      string,
      {
        data: google.maps.Data;
        p: NonNullable<EscenaGoogle["poligonos"]>[number];
        aplicar: (e: EstiloPoligono) => void;
      }
    >()
  ).current;

  // ---- pintar la escena (reemplazo completo: las escenas ya vienen
  //      acotadas/clusterizadas por el adaptador)
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !window.google?.maps) return;
    const g = window.google!;
    const S = sym(g);

    // limpiar lo anterior
    objetosRef.current.forEach((o) => o.setMap(null));
    objetosRef.current = [];
    selRef.current = null;

    const abrirPopup = (html: string, pos: google.maps.LatLng | LatLng) => {
      const info = infoRef.current!;
      info.setContent(`<div class="gmap-popup">${html}</div>`);
      info.setPosition(pos as google.maps.LatLng);
      info.open({ map: mapa });
    };

    for (const c of escena.circulos ?? []) {
      const o = new g.maps.Circle({
        map: mapa,
        center: { lat: c.lat, lng: c.lng },
        radius: c.radioM,
        strokeColor: c.color,
        strokeOpacity: c.opacidad,
        strokeWeight: c.weight,
        fillColor: c.color,
        fillOpacity: c.fillOpacity,
        clickable: false,
      });
      objetosRef.current.push(o);
    }

    for (const r of escena.rects ?? []) {
      const o = new g.maps.Rectangle({
        map: mapa,
        bounds: { north: r.norte, south: r.sur, east: r.este, west: r.oeste },
        strokeColor: r.color,
        strokeOpacity: r.opacidad,
        strokeWeight: r.weight,
        fillColor: r.fill,
        fillOpacity: r.fillOpacity,
        clickable: Boolean(r.popupHtml),
      });
      if (r.popupHtml) {
        o.addListener("click", () =>
          abrirPopup(r.popupHtml!, {
            lat: (r.norte + r.sur) / 2,
            lng: (r.este + r.oeste) / 2,
          })
        );
      }
      objetosRef.current.push(o);
    }

    for (const l of escena.lineas ?? []) {
      const o = new g.maps.Polyline({
        map: mapa,
        path: [l.a, l.b],
        strokeOpacity: 0,
        icons: [
          {
            icon: {
              path: "M 0,-1 0,1",
              strokeOpacity: l.opacidad,
              strokeColor: l.color,
              strokeWeight: l.weight,
              scale: 2,
            },
            offset: "0",
            repeat: "10px",
          },
        ],
        clickable: Boolean(l.etiqueta),
      });
      objetosRef.current.push(o);
      if (l.etiqueta) {
        const medio = {
          lat: (l.a.lat + l.b.lat) / 2,
          lng: (l.a.lng + l.b.lng) / 2,
        };
        if (l.etiquetaFija) {
          const m = new g.maps.Marker({
            map: mapa,
            position: medio,
            icon: { path: S.circulo, scale: 0, fillOpacity: 0, strokeOpacity: 0 },
            label: {
              text: l.etiqueta,
              className: "gmap-etiqueta-linea",
            },
            clickable: false,
          });
          objetosRef.current.push(m);
        } else {
          o.addListener("click", () =>
            abrirPopup(
              `<span style="font-family:monospace;font-size:11px">${l.etiqueta}</span>`,
              medio
            )
          );
        }
      }
    }

    for (const p of escena.poligonos ?? []) {
      const data = new g.maps.Data({ map: mapa });
      try {
        const geo = p.geojson as { type?: string };
        data.addGeoJson(
          geo.type === "Feature" || geo.type === "FeatureCollection"
            ? p.geojson
            : { type: "Feature", geometry: p.geojson, properties: {} }
        );
      } catch {
        data.setMap(null);
        continue;
      }
      const aplicar = (e: EstiloPoligono) =>
        data.setStyle({
          strokeColor: e.stroke,
          strokeOpacity: e.strokeOpacity,
          strokeWeight: e.weight,
          fillColor: e.fill,
          fillOpacity: e.fillOpacity,
          clickable: Boolean(p.popupHtml || p.tooltipHtml || p.seleccionable),
        });
      aplicar(p.estilo);
      estilosPoligono.set(p.id, { data, p, aplicar });

      if (p.tooltipHtml) {
        data.addListener("mouseover", (ev: google.maps.Data.MouseEvent) => {
          const tip = tooltipRef.current!;
          tip.setContent(`<div class="gmap-popup">${p.tooltipHtml}</div>`);
          if (ev.latLng) tip.setPosition(ev.latLng);
          tip.open({ map: mapa });
        });
        data.addListener("mouseout", () => tooltipRef.current?.close());
      }
      if (p.hoverFillOpacity !== undefined) {
        data.addListener("mouseover", () => {
          if (selRef.current !== p.id) {
            data.setStyle({
              strokeColor: p.estilo.stroke,
              strokeOpacity: p.estilo.strokeOpacity,
              strokeWeight: p.estilo.weight,
              fillColor: p.estilo.fill,
              fillOpacity: p.hoverFillOpacity,
              clickable: true,
            });
          }
        });
        data.addListener("mouseout", () => reaplicarEstilos());
      }
      if (p.popupHtml) {
        data.addListener("click", (ev: google.maps.Data.MouseEvent) => {
          if (p.seleccionable) {
            selRef.current = p.id;
            reaplicarEstilos();
          }
          abrirPopup(p.popupHtml!, ev.latLng ?? p.centro ?? CENTRO_INICIAL);
        });
      }
      if (p.etiquetaCentro && p.centro) {
        const m = new g.maps.Marker({
          map: mapa,
          position: p.centro,
          icon: { path: S.circulo, scale: 0, fillOpacity: 0, strokeOpacity: 0 },
          label: { text: p.etiquetaCentro, className: "gmap-etiqueta-cp" },
          clickable: false,
        });
        objetosRef.current.push(m);
      }
      objetosRef.current.push(data);
    }

    for (const m of escena.markers ?? []) {
      const o = new g.maps.Marker({
        map: mapa,
        position: { lat: m.lat, lng: m.lng },
        icon: {
          path: m.cuadrado ? S.cuadrado : S.circulo,
          scale: m.radioPx,
          fillColor: m.fill,
          fillOpacity: m.fillOpacity,
          strokeColor: m.stroke,
          strokeWeight: m.strokeWeight,
        },
        zIndex: m.zIndex,
        clickable: Boolean(m.popupHtml),
      });
      if (m.popupHtml) {
        o.addListener("click", () =>
          abrirPopup(m.popupHtml!, { lat: m.lat, lng: m.lng })
        );
      }
      objetosRef.current.push(o);
    }

    for (const c of escena.clusters ?? []) {
      const diam = Math.min(56, 30 + Math.round(Math.log10(c.n) * 10));
      const o = new g.maps.Marker({
        map: mapa,
        position: { lat: c.lat, lng: c.lng },
        icon: {
          path: S.circulo,
          scale: diam / 2,
          fillColor: c.tipo === "pois" ? "#f52d87" : "#27b5e2",
          fillOpacity: 0.2,
          strokeColor: c.tipo === "pois" ? "#f52d87" : "#27b5e2",
          strokeWeight: 2,
        },
        label: {
          text: c.n.toLocaleString("es-MX"),
          className: "gmap-cluster-label",
        },
        zIndex: 500,
      });
      o.addListener("click", () => {
        const z = mapa.getZoom() ?? 11;
        mapa.panTo({ lat: c.lat, lng: c.lng });
        mapa.setZoom(Math.min(z + 2, 16));
      });
      objetosRef.current.push(o);
    }

    // selección por clic (modo CP): re-aplicar estilos de todos
    const estilosLocal = estilosPoligono;
    function reaplicarEstilos() {
      estilosLocal.forEach(({ data, p }) => {
        const sel = selRef.current;
        const estilo =
          sel === p.id && p.estiloSel
            ? p.estiloSel
            : sel && p.estiloAtenuado
              ? p.estiloAtenuado
              : p.estilo;
        data.setStyle({
          strokeColor: estilo.stroke,
          strokeOpacity: estilo.strokeOpacity,
          strokeWeight: estilo.weight,
          fillColor: estilo.fill,
          fillOpacity: estilo.fillOpacity,
          clickable: Boolean(p.popupHtml || p.tooltipHtml || p.seleccionable),
        });
      });
    }
    const cierre = infoRef.current?.addListener("closeclick", () => {
      if (selRef.current) {
        selRef.current = null;
        reaplicarEstilos();
      }
    });

    return () => {
      cierre?.remove();
      estilosLocal.clear();
    };
    // la escena viene memoizada por los adaptadores
  }, [escena, estilosPoligono]);

  // ---- encuadre y foco
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    if (escena.foco) {
      mapa.panTo({ lat: escena.foco.lat, lng: escena.foco.lng });
      mapa.setZoom(escena.foco.zoom ?? 14);
      return;
    }
    if (escena.encuadre.length === 0) return;
    if (encuadreHechoRef.current === escena.encuadreKey) return;
    encuadreHechoRef.current = escena.encuadreKey;
    if (escena.encuadre.length === 1) {
      mapa.setCenter(escena.encuadre[0]);
      mapa.setZoom(escena.zoomPuntoUnico ?? 14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    escena.encuadre.forEach((p) => bounds.extend(p));
    mapa.fitBounds(bounds, 36);
  }, [escena.foco, escena.encuadreKey, escena.encuadre, escena.zoomPuntoUnico]);

  return <div ref={divRef} className="h-full w-full" />;
}
