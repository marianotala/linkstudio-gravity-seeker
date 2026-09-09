"use client";

// Mapa del PROYECTO (Planner F2): pinta todos los levantamientos
// visibles con color por ROL (propios en espectro cian, competencia en
// magenta/cálidos). SOLO se importa con dynamic ssr:false.

import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { useState } from "react";
import "leaflet/dist/leaflet.css";
import { TILES, TILES_OSM_OSCURO, USA_CARTO } from "@/lib/basemap";
import type { LatLng } from "@/lib/types";

const CENTRO_INICIAL: [number, number] = [19.4326, -99.1332];
/** Tope de markers por capa (el detalle completo vive en los exports). */
const MAX_PUNTOS_CAPA = 1500;

export interface CapaProyecto {
  id: string;
  nombre: string;
  color: string;
  puntos: { lat: number; lng: number; nombre: string; direccion?: string | null }[];
}

function Encuadre({
  capas,
  foco,
}: {
  capas: CapaProyecto[];
  foco: LatLng | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (foco) map.flyTo([foco.lat, foco.lng], 13, { duration: 0.6 });
  }, [foco, map]);
  useEffect(() => {
    if (foco) return;
    const puntos: [number, number][] = [];
    capas.forEach((c) =>
      c.puntos.slice(0, 500).forEach((p) => puntos.push([p.lat, p.lng]))
    );
    if (puntos.length === 0) return;
    map.fitBounds(L.latLngBounds(puntos).pad(0.15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capas.map((c) => c.id).join(","), map]);
  return null;
}

export default function PlannerMapa({
  capas,
  foco,
}: {
  capas: CapaProyecto[];
  foco: LatLng | null;
}) {
  const [tilesCaidos, setTilesCaidos] = useState(false);
  const tiles = tilesCaidos ? TILES_OSM_OSCURO : TILES;

  const visibles = useMemo(
    () =>
      capas.map((c) => ({
        ...c,
        puntos: c.puntos.slice(0, MAX_PUNTOS_CAPA),
        recortados: Math.max(0, c.puntos.length - MAX_PUNTOS_CAPA),
      })),
    [capas]
  );

  return (
    <MapContainer
      center={CENTRO_INICIAL}
      zoom={11}
      className="h-full w-full"
      zoomControl={true}
      attributionControl={true}
    >
      <TileLayer
        key={tiles.url}
        url={tiles.url}
        attribution={tiles.attribution}
        subdomains={tiles.subdomains}
        maxZoom={tiles.maxZoom}
        className={tiles.className}
        eventHandlers={{
          tileerror: () => {
            if (USA_CARTO && !tilesCaidos) setTilesCaidos(true);
          },
        }}
      />
      {visibles.map((c) =>
        c.puntos.map((p, i) => (
          <CircleMarker
            key={`${c.id}-${i}`}
            center={[p.lat, p.lng]}
            radius={5}
            pathOptions={{
              color: "#0a0a0c",
              weight: 1,
              fillColor: c.color,
              fillOpacity: 0.9,
            }}
          >
            <Popup>
              <div className="font-mono text-xs">
                <strong>{p.nombre}</strong>
                {p.direccion && <div>{p.direccion}</div>}
                <div style={{ color: c.color }}>{c.nombre}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))
      )}
      <Encuadre capas={visibles} foco={foco} />
    </MapContainer>
  );
}
