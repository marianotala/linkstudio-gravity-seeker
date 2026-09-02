import { NextResponse } from "next/server";
import { z } from "zod";
import { denueBuscar, DenueError, DENUE_RADIO_MAX_M } from "@/lib/denue";
import { CATEGORIA_LIBRE, getCategoria } from "@/lib/categories";
import { haversine } from "@/lib/geo";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Una llamada = una consulta Buscar de DENUE (una celda del censo
// territorial). Cuenta contra la cuota diaria de celdas.

const BodySchema = z.object({
  category: z.string().min(1, "Falta la categoría"),
  /** Búsqueda LIBRE: palabra clave de actividad para DENUE. */
  freeQuery: z.string().trim().max(80).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z
    .number()
    .min(100, "El radio mínimo de DENUE es 100 m")
    .max(DENUE_RADIO_MAX_M, `El radio máximo de DENUE es ${DENUE_RADIO_MAX_M} m`),
});

const LIMITE_BUSQUEDAS = parseInt(process.env.DAILY_SEARCH_LIMIT ?? "", 10) || 50;
// Respaldo si app_config no tiene tope (consumir_cuota lee la base).
const LIMITE_CELDAS = parseInt(process.env.DAILY_CELL_LIMIT ?? "", 10) || 2500;

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "No autorizado. Inicia sesión." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "El body no es JSON válido" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Input inválido" },
      { status: 400 }
    );
  }

  const { category, lat, lng, radius } = parsed.data;
  const categoria = getCategoria(category);
  // búsqueda libre: el texto va directo como palabra clave de
  // actividad/nombre a DENUE (sin mapeo curado)
  const condicion =
    categoria?.denue ??
    (category === CATEGORIA_LIBRE ? (parsed.data.freeQuery ?? "").trim() : "");
  if (!condicion) {
    return NextResponse.json({ error: "Categoría desconocida" }, { status: 400 });
  }

  // Cuota diaria compartida con las celdas del censo de marca.
  try {
    const { data: cuota, error: errorCuota } = await supabase.rpc(
      "consumir_cuota",
      {
        p_tipo: "celda",
        p_max_busquedas: LIMITE_BUSQUEDAS,
        p_max_celdas: LIMITE_CELDAS,
      }
    );
    if (errorCuota) {
      console.error("No se pudo verificar la cuota:", errorCuota.message);
    } else if (cuota && (cuota as { permitido?: boolean }).permitido === false) {
      const tope =
        (cuota as { tope_celdas?: number }).tope_celdas ?? LIMITE_CELDAS;
      return NextResponse.json(
        {
          codigo: "limite_diario",
          error: `Alcanzaste tu límite diario de celdas de censo (${tope} por día). El avance queda guardado y el tope se reinicia mañana; un admin puede subirlo en Admin.`,
        },
        { status: 429 }
      );
    }
  } catch (e) {
    console.error("No se pudo verificar la cuota:", e);
  }

  try {
    const crudos = await denueBuscar(condicion, lat, lng, radius);
    // DENUE a veces regresa establecimientos apenas fuera del radio:
    // recorte duro a radio + 50 m, igual que Google.
    const centro = { lat, lng };
    const pois = crudos.filter((p) => haversine(centro, p) <= radius + 50);
    return NextResponse.json({ pois });
  } catch (e) {
    const mensaje =
      e instanceof DenueError ? e.message : "Error inesperado al consultar DENUE";
    return NextResponse.json({ error: mensaje }, { status: 502 });
  }
}
