"use client";

// GOOGLE MAPS JS API — loader único para todas las vistas de mapa.
// El mapa principal de Seeker es Google Maps con estilo claro (brand
// V2); si el script no carga (sin key, bloqueado, timeout), cada vista
// cae automáticamente al mapa Leaflet/OSM claro de respaldo.
//
// KEY: NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY — una key DE NAVEGADOR
// restringida por referer HTTP y limitada al SKU Maps JavaScript (capa
// gratuita mensual amplia). NO es la key de servidor GOOGLE_MAPS_KEY:
// esa vive SOLO en el servidor y sigue sin llegar al cliente (regla
// innegociable del proyecto — aplica a Places/Geocoding, no al mapa).

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const KEY_NAVEGADOR = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
const TIMEOUT_MS = 8000;

let promesaCarga: Promise<boolean> | null = null;
let cargaRegistrada = false;

declare global {
  interface Window {
    google?: typeof google;
    __seekerGmapsListo?: () => void;
  }
}

/** Registra la carga del mapa en el panel de consumo como un método
 * más (costo 0: capa gratuita mensual de Maps JS). Una vez por sesión
 * de página; nunca bloquea ni truena el mapa. */
function registrarCargaMapa() {
  if (cargaRegistrada) return;
  cargaRegistrada = true;
  try {
    const supabase = createClient();
    void supabase.rpc("registrar_consumo_api", {
      p_metodo: "maps_js",
      p_contexto: "carga del mapa (Google Maps JS API, estilo claro)",
      p_consultas: 1,
      p_de_cache: 0,
      p_costo_mxn: 0,
    });
  } catch {
    // el log de consumo jamás tira el mapa
  }
}

/** Carga el script de Google Maps una sola vez. Resuelve true cuando
 * window.google.maps está disponible; false si no hay key, el script
 * falla o pasa el timeout (→ la vista usa el Leaflet de respaldo). */
export function cargarGoogleMaps(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.google?.maps?.Map) return Promise.resolve(true);
  if (!KEY_NAVEGADOR) return Promise.resolve(false);
  if (promesaCarga) return promesaCarga;

  promesaCarga = new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), TIMEOUT_MS);
    const listo = () => {
      clearTimeout(timeout);
      if (window.google?.maps?.Map) {
        registrarCargaMapa();
        resolve(true);
      } else {
        resolve(false);
      }
    };
    window.__seekerGmapsListo = listo;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      KEY_NAVEGADOR
    )}&v=weekly&language=es-419&region=MX&callback=__seekerGmapsListo`;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return promesaCarga;
}

export type EstadoGmaps = "cargando" | "listo" | "fallo";

/** Estado de carga para los selectores de mapa (Google → Leaflet). */
export function useGoogleMaps(): EstadoGmaps {
  const [estado, setEstado] = useState<EstadoGmaps>(
    KEY_NAVEGADOR ? "cargando" : "fallo"
  );
  useEffect(() => {
    let vivo = true;
    cargarGoogleMaps().then((ok) => {
      if (vivo) setEstado(ok ? "listo" : "fallo");
    });
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}

/** Estilo claro neutro: markers y polígonos de Seeker protagonizan.
 * Sin POIs de negocio ni transit; geometría ligeramente desaturada. */
export const ESTILO_MAPA_CLARO: google.maps.MapTypeStyle[] = [
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "geometry", stylers: [{ saturation: -30 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ saturation: -20, lightness: 10 }] },
];

/** Escapa texto que va dentro del HTML de popups/labels del mapa. */
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
