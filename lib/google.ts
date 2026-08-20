// Cliente de Google del lado SERVIDOR. La key nunca sale de aquí.
// Se usa únicamente desde los route handlers en /app/api/*.

import "server-only";
import type { GeocodeResult, LatLng, Viewport } from "./types";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types";

/** Error de Google ya traducido a un mensaje claro en español. */
export class GoogleError extends Error {}

function getKey(): string {
  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key || key === "REEMPLAZA_CON_TU_API_KEY") {
    throw new GoogleError(
      "Falta configurar GOOGLE_MAPS_KEY en el servidor (.env.local)."
    );
  }
  return key;
}

/** Traduce errores de Places API (New) a mensajes claros en español. */
function traducirErrorPlaces(status: number, data: unknown): GoogleError {
  const err = (data as { error?: { status?: string; message?: string } })?.error;
  const mensaje = err?.message ?? "";
  const estado = err?.status ?? "";
  if (/api key not valid|api_key_invalid/i.test(mensaje)) {
    return new GoogleError(
      "La API key de Google no es válida. Revisa GOOGLE_MAPS_KEY."
    );
  }
  if (
    estado === "PERMISSION_DENIED" ||
    /has not been used|is disabled|serviceusage/i.test(mensaje)
  ) {
    return new GoogleError(
      "La API de Places (New) no está habilitada para esta key en Google Cloud."
    );
  }
  if (status === 429 || estado === "RESOURCE_EXHAUSTED") {
    return new GoogleError(
      "Se agotó la cuota de la API de Google. Espera un momento e intenta de nuevo."
    );
  }
  return new GoogleError(
    `Google respondió con un error (${status}${estado ? " " + estado : ""})${
      mensaje ? ": " + mensaje : "."
    }`
  );
}

interface PlaceRaw {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
}

export interface PlaceResult {
  placeId: string;
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
  types: string[];
}

function mapPlaces(places: PlaceRaw[] | undefined): PlaceResult[] {
  return (places ?? [])
    .filter((p) => p.id && p.location)
    .map((p) => ({
      placeId: p.id,
      nombre: p.displayName?.text ?? "(sin nombre)",
      direccion: p.formattedAddress ?? "",
      lat: p.location!.latitude,
      lng: p.location!.longitude,
      types: p.types ?? [],
    }));
}

async function postPlaces(
  url: string,
  body: Record<string, unknown>,
  fieldMask: string
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getKey(),
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw traducirErrorPlaces(res.status, data);
  return data;
}

/**
 * searchNearby: hasta 20 resultados ordenados por distancia,
 * restringidos al círculo centro+radio. (Modo orígenes con categoría.)
 */
export async function searchNearby(
  center: LatLng,
  radiusM: number,
  includedTypes: string[]
): Promise<PlaceResult[]> {
  const data = (await postPlaces(
    NEARBY_URL,
    {
      includedTypes,
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      languageCode: "es",
      regionCode: "MX",
      locationRestriction: {
        circle: {
          center: { latitude: center.lat, longitude: center.lng },
          radius: Math.min(radiusM, 50000),
        },
      },
    },
    FIELD_MASK
  )) as { places?: PlaceRaw[] };
  return mapPlaces(data.places);
}

/** Dónde buscar con searchText: círculo (sesgo) o rectángulo (restricción dura). */
export type AreaBusqueda =
  | { circle: { center: LatLng; radius: number } }
  | { rectangle: Viewport };

/**
 * searchText: textQuery en español con paginación hasta 60 resultados.
 * Con círculo es un sesgo (locationBias); con rectángulo es una
 * restricción dura (locationRestriction) a los límites de la zona.
 * (Modo zona, censo y búsqueda por nombre.)
 */
export async function searchText(
  textQuery: string,
  area: AreaBusqueda
): Promise<PlaceResult[]> {
  const resultados: PlaceResult[] = [];
  let pageToken: string | undefined;
  do {
    const body: Record<string, unknown> = {
      textQuery,
      pageSize: 20,
      languageCode: "es",
      regionCode: "MX",
    };
    if ("rectangle" in area) {
      body.locationRestriction = {
        rectangle: {
          low: { latitude: area.rectangle.south, longitude: area.rectangle.west },
          high: { latitude: area.rectangle.north, longitude: area.rectangle.east },
        },
      };
    } else {
      body.locationBias = {
        circle: {
          center: {
            latitude: area.circle.center.lat,
            longitude: area.circle.center.lng,
          },
          radius: Math.min(area.circle.radius, 50000),
        },
      };
    }
    if (pageToken) body.pageToken = pageToken;
    const data = (await postPlaces(
      TEXT_URL,
      body,
      `${FIELD_MASK},nextPageToken`
    )) as { places?: PlaceRaw[]; nextPageToken?: string };
    resultados.push(...mapPlaces(data.places));
    pageToken = data.nextPageToken;
  } while (pageToken && resultados.length < 60);
  return resultados.slice(0, 60);
}

/** Geocodifica UNA dirección con region=mx y language=es. */
export async function geocodeDireccion(
  direccion: string
): Promise<GeocodeResult> {
  const params = new URLSearchParams({
    address: direccion,
    region: "mx",
    language: "es",
    key: getKey(),
  });
  const res = await fetch(`${GEOCODE_URL}?${params}`, { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    error_message?: string;
    results?: {
      formatted_address?: string;
      geometry?: {
        location?: { lat: number; lng: number };
        viewport?: {
          northeast?: { lat: number; lng: number };
          southwest?: { lat: number; lng: number };
        };
      };
    }[];
  };

  switch (data.status) {
    case "OK": {
      const r = data.results?.[0];
      const loc = r?.geometry?.location;
      if (!loc) return { ok: false, error: "Respuesta sin coordenadas" };
      const vp = r?.geometry?.viewport;
      return {
        ok: true,
        lat: loc.lat,
        lng: loc.lng,
        formatted: r?.formatted_address,
        viewport:
          vp?.northeast && vp?.southwest
            ? {
                north: vp.northeast.lat,
                south: vp.southwest.lat,
                east: vp.northeast.lng,
                west: vp.southwest.lng,
              }
            : undefined,
      };
    }
    case "ZERO_RESULTS":
      return { ok: false, error: "Sin resultados para esta dirección" };
    case "OVER_QUERY_LIMIT":
    case "OVER_DAILY_LIMIT":
      throw new GoogleError(
        "Se agotó la cuota de la API de Geocoding. Espera un momento e intenta de nuevo."
      );
    case "REQUEST_DENIED":
      if (/api key/i.test(data.error_message ?? "")) {
        throw new GoogleError(
          "La API key de Google no es válida. Revisa GOOGLE_MAPS_KEY."
        );
      }
      throw new GoogleError(
        "Google rechazó la petición: la API de Geocoding no está habilitada para esta key."
      );
    case "INVALID_REQUEST":
      return { ok: false, error: "Dirección inválida" };
    default:
      throw new GoogleError(
        `Error de Geocoding (${data.status ?? "desconocido"})${
          data.error_message ? ": " + data.error_message : ""
        }`
      );
  }
}
