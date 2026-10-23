"use client";

// SELECTOR del mapa del proyecto: Google Maps (estilo claro, el
// principal) con fallback automático a Leaflet/OSM claro si el script
// de Google no carga. SOLO se importa con dynamic ssr:false.

import PlannerMapaGoogle from "./PlannerMapaGoogle";
import PlannerMapaLeaflet, { type CapaProyecto } from "./PlannerMapaLeaflet";
import { useGoogleMaps } from "@/lib/gmaps";
import type { LatLng } from "@/lib/types";

export type { CapaProyecto };

export default function PlannerMapa(props: {
  capas: CapaProyecto[];
  foco: LatLng | null;
}) {
  const estado = useGoogleMaps();
  if (estado === "listo") return <PlannerMapaGoogle {...props} />;
  if (estado === "fallo") return <PlannerMapaLeaflet {...props} />;
  return (
    <div className="flex h-full w-full items-center justify-center bg-fondo font-mono text-xs text-texto-terciario">
      Cargando el mapa…
    </div>
  );
}
