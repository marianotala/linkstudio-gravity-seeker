"use client";

// SELECTOR del mapa OOH: Google Maps (estilo claro, el principal) con
// fallback automático a Leaflet/OSM claro si el script de Google no
// carga. SOLO se importa con dynamic ssr:false.

import OohMapGoogle from "./OohMapGoogle";
import OohMapLeaflet, { type OohMapProps } from "./OohMapLeaflet";
import { useGoogleMaps } from "@/lib/gmaps";

export type { OohMapProps };

export default function OohMap(props: OohMapProps) {
  const estado = useGoogleMaps();
  if (estado === "listo") return <OohMapGoogle {...props} />;
  if (estado === "fallo") return <OohMapLeaflet {...props} />;
  return (
    <div className="flex h-full w-full items-center justify-center bg-fondo font-mono text-xs text-texto-terciario">
      Cargando el mapa…
    </div>
  );
}
