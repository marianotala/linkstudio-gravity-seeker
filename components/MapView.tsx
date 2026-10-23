"use client";

// SELECTOR de mapa del buscador: Google Maps (estilo claro, el
// principal) con fallback automático a Leaflet/OSM claro si el script
// de Google no carga (sin key del navegador, bloqueado o timeout).
// SOLO se importa con dynamic ssr:false — igual que siempre.

import MapViewGoogle from "./MapViewGoogle";
import MapViewLeaflet, { type MapViewProps } from "./MapViewLeaflet";
import { useGoogleMaps } from "@/lib/gmaps";

export type { MapViewProps };

export default function MapView(props: MapViewProps) {
  const estado = useGoogleMaps();
  if (estado === "listo") return <MapViewGoogle {...props} />;
  if (estado === "fallo") return <MapViewLeaflet {...props} />;
  return (
    <div className="flex h-full w-full items-center justify-center bg-fondo font-mono text-xs text-texto-terciario">
      Cargando el mapa…
    </div>
  );
}
