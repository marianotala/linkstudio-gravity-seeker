"use client";

// Mapa del PROYECTO sobre Google Maps (estilo claro): pinta los
// levantamientos visibles con color por capa — puntos, pantallas OOH
// cuadradas, líneas pantalla→PDV y polígonos de CP (Geo-Targeting).
// Mismo comportamiento que PlannerMapaLeaflet (el respaldo).

import { useMemo } from "react";
import MapaGoogleEscena, { type EscenaGoogle } from "./MapaGoogleEscena";
import { escaparHtml } from "@/lib/gmaps";
import type { CapaProyecto } from "./PlannerMapaLeaflet";
import type { LatLng } from "@/lib/types";

const MAX_PUNTOS_CAPA = 1500;

const htmlPunto = (
  nombre: string,
  direccion: string | null | undefined,
  capa: string,
  color: string
) =>
  `<div style="font-family:monospace;font-size:12px"><strong>${escaparHtml(nombre)}</strong>${direccion ? `<div>${escaparHtml(direccion)}</div>` : ""}<div style="color:${color}">${escaparHtml(capa)}</div></div>`;

export default function PlannerMapaGoogle({
  capas,
  foco,
}: {
  capas: CapaProyecto[];
  foco: LatLng | null;
}) {
  const escena = useMemo<EscenaGoogle>(() => {
    const e: Required<
      Pick<EscenaGoogle, "markers" | "lineas" | "poligonos" | "rects">
    > &
      EscenaGoogle = {
      markers: [],
      lineas: [],
      poligonos: [],
      rects: [],
      encuadre: [],
      encuadreKey: "",
    };
    const encuadre: LatLng[] = [];

    capas.forEach((c) => {
      // polígonos (CPs de cobertura del Geo-Targeting) al fondo
      (c.poligonos ?? []).slice(0, 600).forEach((pg, i) => {
        e.poligonos.push({
          id: `${c.id}-pg-${i}`,
          geojson: pg.geometria,
          estilo: {
            stroke: c.color,
            strokeOpacity: 0.9,
            weight: 1.5,
            fill: c.color,
            fillOpacity: 0.12,
          },
          popupHtml: htmlPunto(pg.nombre, pg.detalle, c.nombre, c.color),
        });
        if (pg.bbox) {
          encuadre.push(
            { lat: pg.bbox.south, lng: pg.bbox.west },
            { lat: pg.bbox.north, lng: pg.bbox.east }
          );
        }
      });
      // líneas pantalla→PDV (cruce OOH)
      (c.lineas ?? []).slice(0, 2000).forEach((l, i) => {
        e.lineas.push({
          id: `${c.id}-l-${i}`,
          a: l.a,
          b: l.b,
          color: c.color,
          weight: 1.2,
          opacidad: 0.5,
        });
      });
      // puntos (tope por capa; el detalle completo vive en los exports)
      c.puntos.slice(0, MAX_PUNTOS_CAPA).forEach((p, i) => {
        if (c.cuadrados) {
          // pantalla OOH: cuadrito (≈100 m de lado, legible al zoom)
          const d = 0.0006;
          e.rects.push({
            id: `${c.id}-${i}`,
            norte: p.lat + d,
            sur: p.lat - d,
            este: p.lng + d,
            oeste: p.lng - d,
            color: "#ffffff",
            weight: 1,
            opacidad: 1,
            fill: c.color,
            fillOpacity: 1,
            popupHtml: htmlPunto(p.nombre, p.direccion, c.nombre, c.color),
          });
        } else {
          e.markers.push({
            id: `${c.id}-${i}`,
            lat: p.lat,
            lng: p.lng,
            stroke: "#ffffff",
            strokeWeight: 1,
            fill: c.color,
            fillOpacity: 0.9,
            radioPx: 5,
            popupHtml: htmlPunto(p.nombre, p.direccion, c.nombre, c.color),
          });
        }
      });
      c.puntos.slice(0, 500).forEach((p) => encuadre.push(p));
    });

    e.encuadre = encuadre;
    e.encuadreKey = capas.map((c) => c.id).join(",");
    e.foco = foco ? { ...foco, zoom: 13 } : null;
    return e;
  }, [capas, foco]);

  return <MapaGoogleEscena escena={escena} />;
}
