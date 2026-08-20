"use client";

// Mapa Leaflet oscuro con la simbología de Seeker:
// orígenes en cian con su radio, zona en violeta, POIs en magenta.
// Este componente SOLO se importa con dynamic(..., { ssr: false }).

import { Fragment, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  CircleMarker,
  Popup,
  Rectangle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng, Origin, Poi, SearchMode } from "@/lib/types";

const CIAN = "#2fb9e8";
const MAGENTA = "#f4368a";
const VIOLETA = "#9d5cf0";

// Centro inicial: CDMX
const CENTRO_INICIAL: [number, number] = [19.4326, -99.1332];

interface MapViewProps {
  mode: SearchMode;
  origenes: Origin[];
  /** Centro del censo de marca (modo census). */
  zona: Origin | null;
  /** Zonas del modo zona: se dibujan por sus límites reales (viewport). */
  zonas?: Origin[];
  radio: number;
  pois: Poi[];
  /** POI al que hay que volar (clic en la tabla). */
  foco: Poi | null;
  /** Centros de celda del censo de marca (modo census). */
  celdas?: LatLng[];
  /** Radio de cada celda del censo, en metros. */
  radioCelda?: number;
}

/** Ajusta la vista cuando cambian orígenes/zona/POIs, y vuela al foco. */
function Encuadre({
  mode,
  origenes,
  zona,
  zonas,
  pois,
  foco,
  radio,
  celdas,
}: MapViewProps) {
  const map = useMap();

  useEffect(() => {
    if (foco) {
      map.flyTo([foco.lat, foco.lng], 17, { duration: 0.6 });
    }
  }, [foco, map]);

  useEffect(() => {
    if (foco) return;
    const puntos: [number, number][] = [];
    if (mode === "origins") {
      origenes.forEach((o) => puntos.push([o.lat, o.lng]));
    } else if (mode === "zone") {
      (zonas ?? []).forEach((z) => {
        if (z.viewport) {
          puntos.push([z.viewport.south, z.viewport.west]);
          puntos.push([z.viewport.north, z.viewport.east]);
        } else {
          puntos.push([z.lat, z.lng]);
        }
      });
    } else if (zona) {
      puntos.push([zona.lat, zona.lng]);
    }
    (celdas ?? []).forEach((c) => puntos.push([c.lat, c.lng]));
    pois.forEach((p) => puntos.push([p.lat, p.lng]));
    if (puntos.length === 0) return;
    if (puntos.length === 1) {
      const zoom = radio >= 5000 ? 12 : radio >= 2000 ? 13 : 14;
      map.setView(puntos[0], zoom);
      return;
    }
    map.fitBounds(L.latLngBounds(puntos).pad(0.15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, origenes, zona, zonas, pois, celdas, map]);

  return null;
}

export default function MapView(props: MapViewProps) {
  const { mode, origenes, zona, zonas, radio, pois, celdas, radioCelda } =
    props;

  return (
    <MapContainer
      center={CENTRO_INICIAL}
      zoom={11}
      className="h-full w-full"
      zoomControl={true}
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
      />

      {mode === "origins" &&
        origenes.map((o, i) => (
          <Fragment key={`o-${i}`}>
            <Circle
              center={[o.lat, o.lng]}
              radius={radio}
              pathOptions={{
                color: CIAN,
                weight: 1,
                opacity: 0.55,
                fillColor: CIAN,
                fillOpacity: 0.06,
              }}
            />
            <CircleMarker
              center={[o.lat, o.lng]}
              radius={6}
              pathOptions={{
                color: CIAN,
                weight: 2,
                fillColor: "#0a0a0c",
                fillOpacity: 1,
              }}
            >
              <Popup>
                <div className="font-mono text-xs">
                  <strong>{o.nombre ?? `Origen ${i + 1}`}</strong>
                  {o.direccion && <div>{o.direccion}</div>}
                  <div>
                    {o.lat.toFixed(6)}, {o.lng.toFixed(6)}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          </Fragment>
        ))}

      {mode === "census" &&
        (celdas ?? []).map((c, i) => (
          <Circle
            key={`celda-${i}`}
            center={[c.lat, c.lng]}
            radius={radioCelda ?? 2000}
            pathOptions={{
              color: CIAN,
              weight: 0.8,
              opacity: 0.35,
              fillColor: CIAN,
              fillOpacity: 0.03,
            }}
          />
        ))}

      {mode === "zone" &&
        (zonas ?? []).map((z, i) => (
          <Fragment key={`z-${i}`}>
            {z.viewport && (
              <Rectangle
                bounds={[
                  [z.viewport.south, z.viewport.west],
                  [z.viewport.north, z.viewport.east],
                ]}
                pathOptions={{
                  color: VIOLETA,
                  weight: 1.5,
                  opacity: 0.7,
                  fillColor: VIOLETA,
                  fillOpacity: 0.06,
                  dashArray: "6 6",
                }}
              />
            )}
            <CircleMarker
              center={[z.lat, z.lng]}
              radius={7}
              pathOptions={{
                color: VIOLETA,
                weight: 2,
                fillColor: "#0a0a0c",
                fillOpacity: 1,
              }}
            >
              <Popup>
                <div className="font-mono text-xs">
                  <strong>{z.nombre ?? `Zona ${i + 1}`}</strong>
                  <div>
                    {z.lat.toFixed(6)}, {z.lng.toFixed(6)}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          </Fragment>
        ))}

      {mode === "census" && zona && (
        <Fragment>
          <Circle
            center={[zona.lat, zona.lng]}
            radius={radio}
            pathOptions={{
              color: VIOLETA,
              weight: 1.5,
              opacity: 0.7,
              fillColor: VIOLETA,
              fillOpacity: 0.07,
              dashArray: "6 6",
            }}
          />
          <CircleMarker
            center={[zona.lat, zona.lng]}
            radius={7}
            pathOptions={{
              color: VIOLETA,
              weight: 2,
              fillColor: "#0a0a0c",
              fillOpacity: 1,
            }}
          >
            <Popup>
              <div className="font-mono text-xs">
                <strong>{zona.nombre ?? "Zona"}</strong>
                <div>
                  {zona.lat.toFixed(6)}, {zona.lng.toFixed(6)}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        </Fragment>
      )}

      {pois.map((p) => (
        <CircleMarker
          key={p.placeId}
          center={[p.lat, p.lng]}
          radius={5}
          pathOptions={{
            color: MAGENTA,
            weight: 1.5,
            fillColor: MAGENTA,
            fillOpacity: 0.75,
          }}
        >
          <Popup>
            <div className="font-mono text-xs max-w-[220px]">
              <strong>{p.nombre}</strong>
              <div>{p.direccion}</div>
              <div>
                {p.lat.toFixed(6)}, {p.lng.toFixed(6)} · {p.distancia} m
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      <Encuadre {...props} />
    </MapContainer>
  );
}
