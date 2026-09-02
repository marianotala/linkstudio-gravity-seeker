"use client";

// Mapa del cruce OOH (pantallas × PDVs), estilo Plot Matrix con la
// simbología de Seeker: pantallas con color por tipo, PDVs en cian
// (huecos en magenta cuando quedan SIN cobertura), líneas de conexión
// pantalla→PDV con etiqueta de distancia en km y círculos de radio —
// líneas y radios con toggle. SOLO se importa con dynamic ssr:false.

import { Fragment, useEffect, useMemo } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { useState } from "react";
import "leaflet/dist/leaflet.css";
import { TILES, TILES_OSM_OSCURO, USA_CARTO } from "@/lib/basemap";
import { etiquetaOrigen } from "@/lib/geo";
import { colorTipoPantalla, etiquetaTipoPantalla } from "@/lib/ooh";
import type { CrucePantalla, LatLng, Origin } from "@/lib/types";

const CIAN = "#2fb9e8";
const MAGENTA = "#f4368a";

const CENTRO_INICIAL: [number, number] = [19.4326, -99.1332];
/** Con más líneas que esto, la etiqueta de km pasa de fija a hover. */
const MAX_ETIQUETAS_FIJAS = 80;

export interface OohMapProps {
  pdvs: Origin[];
  /** Cruce ya ejecutado (null = solo PDVs cargados). */
  cruces: CrucePantalla[] | null;
  cubiertos: Set<number>;
  verLineas: boolean;
  verRadios: boolean;
  /** Punto al que volar (clic en la tabla). */
  foco: (LatLng & { zoom?: number }) | null;
}

/** Encuadre: ajusta la vista a PDVs + pantallas, y vuela al foco. */
function Encuadre({
  pdvs,
  cruces,
  foco,
}: {
  pdvs: Origin[];
  cruces: CrucePantalla[] | null;
  foco: (LatLng & { zoom?: number }) | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (foco) map.flyTo([foco.lat, foco.lng], foco.zoom ?? 14, { duration: 0.6 });
  }, [foco, map]);

  useEffect(() => {
    if (foco) return;
    const puntos: [number, number][] = pdvs.map((o) => [o.lat, o.lng]);
    (cruces ?? []).forEach((c) => puntos.push([c.pantalla.lat, c.pantalla.lng]));
    if (puntos.length === 0) return;
    map.fitBounds(L.latLngBounds(puntos).pad(0.15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdvs, cruces, map]);

  return null;
}

export default function OohMap({
  pdvs,
  cruces,
  cubiertos,
  verLineas,
  verRadios,
  foco,
}: OohMapProps) {
  const [tilesCaidos, setTilesCaidos] = useState(false);
  const tiles = tilesCaidos ? TILES_OSM_OSCURO : TILES;

  // relaciones pantalla→PDV aplanadas para las líneas
  const lineas = useMemo(() => {
    if (!cruces) return [];
    return cruces.flatMap((c) =>
      c.pdvs.map((rel) => ({
        a: { lat: c.pantalla.lat, lng: c.pantalla.lng },
        b: pdvs[rel.idx],
        km: rel.distancia / 1000,
        color: colorTipoPantalla(c.pantalla.tipo),
      }))
    );
  }, [cruces, pdvs]);
  const etiquetasFijas = lineas.length <= MAX_ETIQUETAS_FIJAS;

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

      {/* líneas de conexión pantalla→PDV con distancia en km */}
      {verLineas &&
        lineas.map((l, i) => (
          <Polyline
            key={`l-${i}`}
            positions={[
              [l.a.lat, l.a.lng],
              [l.b.lat, l.b.lng],
            ]}
            pathOptions={{ color: l.color, weight: 1.4, opacity: 0.55, dashArray: "4 5" }}
          >
            <Tooltip
              permanent={etiquetasFijas}
              direction="center"
              className="etiqueta-linea-ooh"
            >
              {l.km.toLocaleString("es-MX", { maximumFractionDigits: 1 })} km
            </Tooltip>
          </Polyline>
        ))}

      {/* pantallas: color por tipo, radio de cruce opcional */}
      {(cruces ?? []).map((c) => {
        const color = colorTipoPantalla(c.pantalla.tipo);
        return (
          <Fragment key={`p-${c.pantalla.clave}`}>
            {verRadios && (
              <Circle
                center={[c.pantalla.lat, c.pantalla.lng]}
                radius={c.radioM}
                pathOptions={{
                  color,
                  weight: 1,
                  opacity: 0.4,
                  fillColor: color,
                  fillOpacity: 0.04,
                }}
              />
            )}
            <CircleMarker
              center={[c.pantalla.lat, c.pantalla.lng]}
              radius={7}
              pathOptions={{
                color: "#0a0a0c",
                weight: 1.5,
                fillColor: color,
                fillOpacity: 1,
              }}
            >
              <Popup>
                <div className="font-mono text-xs">
                  <strong>{c.pantalla.nombre ?? c.pantalla.clave}</strong>
                  <div>
                    {etiquetaTipoPantalla(c.pantalla.tipo)}
                    {c.pantalla.digital !== null &&
                      ` · ${c.pantalla.digital ? "digital" : "estática"}`}
                  </div>
                  {c.pantalla.medio && <div>Medio: {c.pantalla.medio}</div>}
                  {c.pantalla.ciudad && <div>{c.pantalla.ciudad}</div>}
                  {c.pantalla.impresiones != null && (
                    <div>
                      {c.pantalla.impresiones.toLocaleString("es-MX")}{" "}
                      impresiones/mes
                    </div>
                  )}
                  <div>
                    Apoya {c.pdvs.length}{" "}
                    {c.pdvs.length === 1 ? "PDV" : "PDVs"} en{" "}
                    {(c.radioM / 1000).toLocaleString("es-MX")} km
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          </Fragment>
        );
      })}

      {/* PDVs del cliente: cian; SIN cobertura = hueco magenta */}
      {pdvs.map((o, i) => {
        const sinCobertura = cruces !== null && !cubiertos.has(i);
        return (
          <CircleMarker
            key={`pdv-${i}`}
            center={[o.lat, o.lng]}
            radius={5.5}
            pathOptions={
              sinCobertura
                ? { color: MAGENTA, weight: 2, fillColor: "#0a0a0c", fillOpacity: 1 }
                : { color: CIAN, weight: 2, fillColor: "#0a0a0c", fillOpacity: 1 }
            }
          >
            <Popup>
              <div className="font-mono text-xs">
                <strong>{etiquetaOrigen(o, i)}</strong>
                {o.direccion && <div>{o.direccion}</div>}
                {sinCobertura && (
                  <div style={{ color: MAGENTA }}>
                    SIN cobertura: ninguna pantalla dentro del radio
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      <Encuadre pdvs={pdvs} cruces={cruces} foco={foco} />
    </MapContainer>
  );
}
