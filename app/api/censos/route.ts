import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Guarda un censo terminado (de marca o territorial) en la biblioteca.
// No consume cuota: las celdas ya la consumieron una por una.

const PoiSchema = z.object({
  place_key: z.string().min(1),
  fuente: z.enum(["google", "denue", "ambas"]),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().nullish(),
  estrato: z.string().nullish(),
  extra: z.record(z.unknown()).nullish(),
});

const BodySchema = z.object({
  tipo: z.enum(["marca", "territorial"]),
  marca_o_categoria: z.string().min(1),
  alcance_descripcion: z.string().min(1),
  fuente: z.enum(["google", "denue", "ambas"]),
  params: z.record(z.unknown()),
  pois: z.array(PoiSchema).max(20000, "Máximo 20,000 POIs por censo"),
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

  const {
    tipo,
    marca_o_categoria,
    alcance_descripcion,
    fuente,
    params,
    pois,
    universos,
  } = parsed.data;

  const { data: censusId, error } = await supabase.rpc("guardar_censo", {
    p_tipo: tipo,
    p_marca_o_categoria: marca_o_categoria,
    p_alcance_descripcion: alcance_descripcion,
    p_fuente: fuente,
    p_params: params,
    p_pois: pois,
    // sin detalle por AGEB ni geometrías en la biblioteca
    p_universos: universos
      ? { ...universos, porAgeb: undefined, agebsGeo: undefined }
      : null,
  });
  if (error) {
    console.error("No se pudo guardar el censo:", error.message);
    return NextResponse.json(
      { error: "No se pudo guardar el censo en la biblioteca" },
      { status: 502 }
    );
  }
  return NextResponse.json({ censusId });
}
