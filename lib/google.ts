// Cliente de Google del lado SERVIDOR. La key nunca sale de aquí.
// Se usa únicamente desde los route handlers en /app/api/*.

import "server-only";
import type { GeocodeResult, LatLng, Viewport } from "./types";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types";

/** Tipo de límite de Google: rate limit por minuto (pausa breve y se
 * reanuda solo) vs cuota DIARIA agotada (se reinicia a medianoche,
 * hora del Pacífico). El cliente decide el backoff con este código. */
export type CodigoErrorGoogle = "rate" | "cuota_diaria";

/** Error de Google ya traducido a un mensaje claro en español. */
export class GoogleError extends Error {
  codigo?: CodigoErrorGoogle;
  constructor(mensaje: string, codigo?: CodigoErrorGoogle) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// ------------------------------------------------------------------
// PACING: espaciar las consultas a Google para respetar el límite por
// minuto — mejor lento y completo que rápido y muerto. Configurable
// con GOOGLE_MAX_QPS (consultas/segundo, default 8). El limitador es
// por instancia del servidor (suficiente: los lotes del cliente corren
// en secuencia, así que casi todo el tráfico pasa por una instancia).
// ------------------------------------------------------------------
const QPS =
  Number(process.env.GOOGLE_MAX_QPS) > 0
    ? Number(process.env.GOOGLE_MAX_QPS)
    : 8;
const INTERVALO_MS = 1000 / QPS;
let proximoTurno = 0;

/** Reserva un turno en la fila del limitador y espera hasta que toque. */
async function turnoGoogle(): Promise<void> {
  const ahora = Date.now();
  const mio = Math.max(ahora, proximoTurno);
  proximoTurno = mio + INTERVALO_MS;
  if (mio > ahora) {
    await new Promise((r) => setTimeout(r, mio - ahora));
  }
}

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
    // distinguir el TIPO de límite: por minuto (se reanuda solo con
    // backoff) vs cuota diaria (se reinicia a medianoche del Pacífico)
    if (/per day|perday|daily/i.test(mensaje)) {
      return new GoogleError(
        "La cuota DIARIA de la API de Google se agotó — se reinicia a la medianoche, hora del Pacífico (≈ 1-2 a.m. CDMX). El avance queda guardado: reanuda mañana o aumenta la cuota en Google Cloud Console.",
        "cuota_diaria"
      );
    }
    return new GoogleError(
      "Google limitó el ritmo de consultas (límite por minuto) — pausa breve y se reanuda solo.",
      "rate"
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
  await turnoGoogle();
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

// ------------------------------------------------------------------
// Buscar un lugar por nombre (estilo Google Maps): Autocomplete (New)
// con SESIONES (sessionToken) — todas las teclas de una búsqueda + el
// detalle final se facturan como UNA sesión barata, no por request.
// ------------------------------------------------------------------

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETALLE_URL = "https://places.googleapis.com/v1/places/";

export interface SugerenciaLugar {
  placeId: string;
  /** Nombre principal ("Midtown Jalisco"). */
  texto: string;
  /** Contexto ("Av. Adolfo López Mateos Nte., Guadalajara"). */
  secundario: string;
}

/** Sugerencias en vivo para el input (sesgadas a México). */
export async function autocompleteLugares(
  input: string,
  sessionToken: string
): Promise<SugerenciaLugar[]> {
  await turnoGoogle();
  const res = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getKey(),
    },
    body: JSON.stringify({
      input,
      sessionToken,
      languageCode: "es",
      regionCode: "MX",
      // sesgo suave al territorio nacional (no excluye resultados)
      locationBias: {
        rectangle: {
          low: { latitude: 14.3, longitude: -118.5 },
          high: { latitude: 33.0, longitude: -86.5 },
        },
      },
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }[];
  };
  if (!res.ok) throw traducirErrorPlaces(res.status, data);
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => ({
      placeId: p!.placeId ?? "",
      texto: p!.structuredFormat?.mainText?.text ?? p!.text?.text ?? "",
      secundario: p!.structuredFormat?.secondaryText?.text ?? "",
    }))
    .filter((s) => s.placeId && s.texto);
}

/** Detalle del lugar elegido (cierra la sesión de autocomplete). */
export async function detalleLugar(
  placeId: string,
  sessionToken: string
): Promise<{
  nombre: string;
  direccion: string;
  lat: number;
  lng: number;
  viewport?: Viewport;
}> {
  await turnoGoogle();
  const params = new URLSearchParams({
    languageCode: "es",
    regionCode: "MX",
    sessionToken,
  });
  const res = await fetch(
    `${DETALLE_URL}${encodeURIComponent(placeId)}?${params}`,
    {
      headers: {
        "X-Goog-Api-Key": getKey(),
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location,viewport",
      },
      cache: "no-store",
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    viewport?: {
      high?: { latitude?: number; longitude?: number };
      low?: { latitude?: number; longitude?: number };
    };
  };
  if (!res.ok) throw traducirErrorPlaces(res.status, data);
  const loc = data.location;
  if (loc?.latitude === undefined || loc?.longitude === undefined) {
    throw new GoogleError("El lugar no trae coordenadas");
  }
  const vp = data.viewport;
  return {
    nombre: data.displayName?.text ?? "(sin nombre)",
    direccion: data.formattedAddress ?? "",
    lat: loc.latitude,
    lng: loc.longitude,
    viewport:
      vp?.high?.latitude !== undefined && vp?.low?.latitude !== undefined
        ? {
            north: vp.high.latitude!,
            south: vp.low.latitude!,
            east: vp.high!.longitude!,
            west: vp.low!.longitude!,
          }
        : undefined,
  };
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
  await turnoGoogle();
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
    case "OVER_DAILY_LIMIT":
      throw new GoogleError(
        "La cuota DIARIA de la API de Geocoding se agotó — se reinicia a la medianoche, hora del Pacífico (≈ 1-2 a.m. CDMX).",
        "cuota_diaria"
      );
    case "OVER_QUERY_LIMIT":
      throw new GoogleError(
        "Google limitó el ritmo de geocodificación (límite por minuto) — pausa breve y se reanuda solo.",
        "rate"
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
