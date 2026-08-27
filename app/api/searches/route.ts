import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Guarda una búsqueda ya resuelta en el historial (la usa el censo de
// marca al terminar todas sus celdas: una sola entrada con todo).
// No consume cuota: las celdas ya la consumieron una por una.

const ResultadoSchema = z.object({
  name: z.string().min(1),
  category: z.string().nullish(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().nullish(),
  origin_name: z.string().nullish(),
  distance_m: z.number().int().nullish(),
  place_id: z.string().nullish(),
});

const BodySchema = z.object({
  mode: z.enum(["origins", "zone", "census", "cp"]),
  params: z.record(z.unknown()),
  results: z.array(ResultadoSchema).max(5000, "Máximo 5000 resultados"),
  universos: z.record(z.unknown()).nullish(),
});

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

  const { mode, params, results, universos } = parsed.data;
  const { data: searchId, error } = await supabase.rpc("guardar_busqueda", {
    p_mode: mode,
    p_params: params,
    p_results: results,
    // sin detalle por AGEB ni geometrías en el historial
    p_universos: universos
      ? { ...universos, porAgeb: undefined, agebsGeo: undefined }
      : null,
  });
  if (error) {
    console.error("No se pudo guardar la búsqueda:", error.message);
    return NextResponse.json(
      { error: "No se pudo guardar la búsqueda en el historial" },
      { status: 502 }
    );
  }
  return NextResponse.json({ searchId });
}
