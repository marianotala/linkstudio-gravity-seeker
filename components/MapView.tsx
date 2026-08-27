"use client";

// Mapa Leaflet oscuro con la simbología de Seeker:
// orígenes en cian con su radio, zona en violeta, POIs en magenta.
// Este componente SOLO se importa con dynamic(..., { ssr: false }).

import { Fragment, useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  CircleMarker,
  GeoJSON,
  Popup,
  Rectangle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type {
  AgebGeo,
  CpPoligono,
  LatLng,
  Origin,
  Poi,
  SearchMode,
} from "@/lib/types";

const CIAN = "#2fb9e8";
const MAGENTA = "#f4368a";
const VIOLETA = "#9d5cf0";
const NARANJA = "#ff8c42"; // POIs de DENUE (INEGI)

/** Color del POI según su fuente: Google magenta, DENUE naranja,
 * "ambas" (match cruzado) magenta con borde naranja. */
function colorPoi(fuente: string): { color: string; fillColor: string } {
  if (fuente === "denue") return { color: NARANJA, fillColor: NARANJA };
  if (fuente === "ambas") return { color: NARANJA, fillColor: MAGENTA };
  return { color: MAGENTA, fillColor: MAGENTA };
}

// Centro inicial: CDMX
const CENTRO_INICIAL: [number, number] = [19.4326, -99.1332];

// El proveedor de tiles vive en UN solo lugar (lib/basemap.ts) para
// que TODAS las vistas de mapa usen el mismo basemap oscuro. Si los
// tiles de CARTO fallan en runtime (key inválida = placeholders
// CLAROS), se cae automáticamente a OSM oscurecido.
import { TILES, TILES_OSM_OSCURO, USA_CARTO } from "@/lib/basemap";

function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Popup del polígono de CP: código grande, colonias (máx 5 + "+N
 * más"), municipio/estado del catálogo y población si ya hay universos. */
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
      `<div style="margin-top:4px;color:#9d5cf0">población: ${poblacion.toLocaleString("es-MX")}</div>`
    );
  }
  partes.push(`</div>`);
  return partes.join("");
}

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
  /** Capa demográfica: AGEBs que intersectan las geocercas. */
  agebs?: AgebGeo[] | null;
  /** Modo CP: polígonos reales de los códigos postales. */
  cps?: CpPoligono[];
  /** Mostrar la etiqueta de CP fija sobre cada polígono (default: no). */
  etiquetasCp?: boolean;
  /** Población por CP (de universos.porGeocerca), para el popup. */
  poblacionCp?: Record<string, number>;
  /** Color por nombre de capa (multi-búsqueda sobre la misma geografía). */
  colorPorCapa?: Record<string, string>;
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
  cps,
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
    } else if (mode === "cp") {
      (cps ?? []).forEach((c) => {
        puntos.push([c.bbox.south, c.bbox.west]);
        puntos.push([c.bbox.north, c.bbox.east]);
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
  }, [mode, origenes, zona, zonas, pois, celdas, cps, map]);

  return null;
}

export default function MapView(props: MapViewProps) {
  const {
    mode,
    origenes,
    zona,
    zonas,
    radio,
    pois,
    celdas,
    radioCelda,
    agebs,
    cps,
    etiquetasCp,
    poblacionCp,
  } = props;

  // Fallback de basemap en runtime: si CARTO rechaza la key, sus
  // placeholders son claros — al primer tileerror cambiamos a OSM
  // oscurecido para mantener el fondo oscuro en todas las vistas.
  const [tilesCaidos, setTilesCaidos] = useState(false);
  const tiles = tilesCaidos ? TILES_OSM_OSCURO : TILES;

  // Selección/hover de polígonos de CP, manejados imperativamente
  // sobre las capas de Leaflet (react-leaflet no re-aplica `style`).
  const capasCpRef = useRef<globalThis.Map<string, L.Path>>(new globalThis.Map());
  const cpSeleccionadoRef = useRef<string | null>(null);
  const estiloCp = (cp: string): L.PathOptions => {
    const sel = cpSeleccionadoRef.current;
    if (sel === cp)
      // seleccionado: borde más grueso y relleno más intenso
      return { color: CIAN, weight: 3, opacity: 1, fillColor: VIOLETA, fillOpacity: 0.3 };
    if (sel)
      // los demás se atenúan ligeramente mientras hay selección
      return { color: VIOLETA, weight: 1.5, opacity: 0.45, fillColor: VIOLETA, fillOpacity: 0.06 };
    return { color: VIOLETA, weight: 2, opacity: 0.9, fillColor: VIOLETA, fillOpacity: 0.16 };
  };
  const aplicarEstilosCp = () => {
    capasCpRef.current.forEach((capa, cp) => capa.setStyle(estiloCp(cp)));
  };

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

      {/* capa demográfica: choropleth violeta por AGEB (opacidad ∝ NSE proxy) */}
      {(agebs ?? []).map((a) => (
        <GeoJSON
          key={a.cvegeo}
          data={a.geometria as unknown as GeoJSON.GeoJsonObject}
          style={{
            color: VIOLETA,
            weight: 0.7,
            opacity: 0.5,
            fillColor: VIOLETA,
            fillOpacity: 0.08 + 0.45 * ((a.nse_proxy ?? 30) / 100),
          }}
          onEachFeature={(_f, layer) => {
            layer.bindTooltip(
              `<div style="font-family:monospace;font-size:11px">AGEB ${a.cvegeo}<br/>población: ${a.pobtot?.toLocaleString("es-MX") ?? "—"}<br/>NSE proxy: ${a.nse_proxy ?? "—"}</div>`,
              { sticky: true }
            );
          }}
        />
      ))}

      {/* modo CP: polígonos reales interactivos — clic abre el popup
          (CP, colonias, municipio/estado, población) y resalta el
          polígono; hover solo cambia la opacidad como affordance; las
          etiquetas fijas van apagadas por default (toggle en la UI) */}
      {mode === "cp" &&
        (cps ?? []).map(
          (c) =>
            c.geometria && (
              <GeoJSON
                key={`cp-${c.codigo_postal}-${etiquetasCp ? 1 : 0}-${poblacionCp?.[c.codigo_postal] ?? "s"}`}
                data={c.geometria as unknown as GeoJSON.GeoJsonObject}
                style={() => estiloCp(c.codigo_postal)}
                onEachFeature={(_f, layer) => {
                  const capa = layer as L.Path;
                  capasCpRef.current.set(c.codigo_postal, capa);
                  layer.bindPopup(popupCp(c, poblacionCp?.[c.codigo_postal]), {
                    maxWidth: 260,
                  });
                  if (etiquetasCp) {
                    layer.bindTooltip(
                      `<span style="font-family:monospace;font-size:11px;font-weight:700">${c.codigo_postal}</span>`,
                      {
                        permanent: true,
                        direction: "center",
                        className: "etiqueta-cp",
                      }
                    );
                  }
                  layer.on("click", () => {
                    cpSeleccionadoRef.current = c.codigo_postal;
                    aplicarEstilosCp();
                  });
                  layer.on("popupclose", () => {
                    if (cpSeleccionadoRef.current === c.codigo_postal) {
                      cpSeleccionadoRef.current = null;
                      aplicarEstilosCp();
                    }
                  });
                  layer.on("mouseover", () => {
                    if (cpSeleccionadoRef.current !== c.codigo_postal) {
                      capa.setStyle({
                        fillOpacity: cpSeleccionadoRef.current ? 0.12 : 0.24,
                      });
                    }
                  });
                  layer.on("mouseout", () => {
                    capa.setStyle(estiloCp(c.codigo_postal));
                  });
                }}
              />
            )
        )}

      {(mode === "census" || mode === "territorial") &&
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

      {(mode === "census" || mode === "territorial") && zona && (
        <Fragment>
          {radio > 0 && (
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
          )}
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

      {pois.map((p) => {
        // con capas activas el color identifica a la CAPA; sin capas,
        // a la fuente (google/denue/ambas) como siempre
        const colorCapa = p.capa ? props.colorPorCapa?.[p.capa] : undefined;
        const c = colorCapa
          ? { color: colorCapa, fillColor: colorCapa }
          : colorPoi(p.fuente);
        return (
          <CircleMarker
            key={`${p.capa ?? ""}:${p.placeId}`}
            center={[p.lat, p.lng]}
            radius={5}
            pathOptions={{
              color: c.color,
              weight: p.fuente === "ambas" ? 2 : 1.5,
              fillColor: c.fillColor,
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
                <div>
                  fuente: {p.fuente.toUpperCase()}
                  {p.estrato ? ` · ${p.estrato}` : ""}
                </div>
                {p.capa && <div>capa: {p.capa}</div>}
                {p.actividad && <div>{p.actividad}</div>}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      <Encuadre {...props} />
    </MapContainer>
  );
}
