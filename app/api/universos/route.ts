import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { calcularUniversos } from "@/lib/universos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Calcula universos demográficos sobre un conjunto de geocercas.
// Lo usan: los censos al completarse (geocercas por POI) y el toggle
// de capa demográfica (incluirAgebs=true para el choropleth).

const ViewportSchema = z.object({
  north: z.number().min(-90).max(90),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  west: z.number().min(-180).max(180),
});

const GeocercaSchema = z.object({
  id: z.string().min(1).max(200),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  radio_m: z.number().min(10).max(100000).optional(),
  viewport: ViewportSchema.optional(),
  /** Polígono real de un código postal cargado en cp_poligonos. */
  cp: z.string().regex(/^\d{5}$/).optional(),
});

const BodySchema = z.object({
  geocercas: z
    .array(GeocercaSchema)
    .min(1, "Manda al menos una geocerca")
    .max(2000, "Máximo 2000 geocercas"),
  incluirAgebs: z.boolean().default(false),
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

  const universos = await calcularUniversos(supabase, parsed.data.geocercas, {
    incluirAgebs: parsed.data.incluirAgebs,
  });
  return NextResponse.json({ universos });
}
