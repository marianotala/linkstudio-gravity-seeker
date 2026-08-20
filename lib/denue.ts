// Cliente de la API pública de DENUE (INEGI), lado SERVIDOR.
// Documentación: https://www.inegi.org.mx/servicios/api_denue.aspx
// Endpoint usado: Buscar/{condicion}/{lat},{lng}/{metros}/{token}
//  - busca la condición en nombre, razón social y actividad SCIAN
//  - el radio tiene tope de 5,000 m: para alcances mayores el cliente
//    divide el área en sub-consultas por radio (celdas)
// El token vive SOLO en DENUE_TOKEN del servidor.

import "server-only";
import type { DenuePoi } from "./types";

const DENUE_BASE = "https://www.inegi.org.mx/app/api/denue/v1/consulta";

/** Tope documentado del endpoint Buscar. */
export const DENUE_RADIO_MAX_M = 5000;

export class DenueError extends Error {}

function getToken(): string {
  const token = process.env.DENUE_TOKEN;
  if (!token) {
    throw new DenueError(
      "Falta configurar DENUE_TOKEN en el servidor (.env.local). Solicita tu token gratuito en inegi.org.mx."
    );
  }
  return token;
}

/** Campos crudos que regresa DENUE en Buscar. */
interface DenueRaw {
  CLEE?: string;
  Id?: string | number;
  Nombre?: string;
  Razon_social?: string;
  Clase_actividad?: string;
  Estrato?: string;
  Tipo_vialidad?: string;
  Calle?: string;
  Num_Exterior?: string;
  Num_Interior?: string;
  Colonia?: string;
  CP?: string;
  Ubicacion?: string;
  Longitud?: string | number;
  Latitud?: string | number;
}

function armarDireccion(r: DenueRaw): string {
  if (r.Ubicacion && String(r.Ubicacion).trim()) return String(r.Ubicacion).trim();
  const partes = [
    [r.Tipo_vialidad, r.Calle, r.Num_Exterior].filter(Boolean).join(" "),
    r.Colonia,
    r.CP ? `CP ${r.CP}` : "",
  ].filter(Boolean);
  return partes.join(", ");
}

/**
 * Buscar establecimientos alrededor de un punto (radio ≤ 5 km).
 * Regresa [] cuando no hay resultados.
 */
export async function denueBuscar(
  condicion: string,
  lat: number,
  lng: number,
  radioM: number
): Promise<DenuePoi[]> {
  const token = getToken();
  const cond = encodeURIComponent(condicion.trim() || "todos");
  const radio = Math.min(Math.max(Math.round(radioM), 100), DENUE_RADIO_MAX_M);
  const url = `${DENUE_BASE}/Buscar/${cond}/${lat.toFixed(6)},${lng.toFixed(6)}/${radio}/${token}`;

  // DENUE a veces tarda o corta la conexión: timeout de 15 s y un
  // reintento antes de reportar la celda como fallida.
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    await new Promise((r) => setTimeout(r, 500));
    try {
      res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new DenueError(
        "DENUE no respondió a tiempo en esta consulta (timeout)."
      );
    }
  }
  const texto = await res.text();

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new DenueError(
        "INEGI rechazó el token de DENUE. Revisa DENUE_TOKEN."
      );
    }
    // DENUE regresa 404 con "No se encontró información" cuando no hay
    // resultados dentro del radio: eso no es un error.
    if (res.status === 404 || /no se encontr/i.test(texto)) return [];
    throw new DenueError(
      `La API de DENUE respondió con un error (HTTP ${res.status}).`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(texto);
  } catch {
    if (/no se encontr/i.test(texto)) return [];
    throw new DenueError("La API de DENUE regresó una respuesta inesperada.");
  }
  if (!Array.isArray(data)) return [];

  return (data as DenueRaw[])
    .map((r): DenuePoi | null => {
      const lat = Number(r.Latitud);
      const lng = Number(r.Longitud);
      const id = r.Id ?? r.CLEE;
      if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      return {
        placeId: `d:${id}`,
        nombre: String(r.Nombre ?? "(sin nombre)").trim(),
        razonSocial: String(r.Razon_social ?? "").trim(),
        actividad: String(r.Clase_actividad ?? "").trim(),
        estrato: String(r.Estrato ?? "").trim(),
        direccion: armarDireccion(r),
        lat,
        lng,
      };
    })
    .filter((p): p is DenuePoi => p !== null);
}
