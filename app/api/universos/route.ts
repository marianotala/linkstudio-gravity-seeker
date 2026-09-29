import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { calcularUniversos } from "@/lib/universos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Red de seguridad de plataforma: el diseño NO depende de esto — cada
// request procesa un chunk corto que cabe holgado en el limite base.
export const maxDuration = 60;

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
  /** Recorte con círculo (celda ∩ círculo): subdivisión exacta de
   * radios grandes — solo lo usa el camino por lotes (crudo). */
  clip: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radio_m: z.number().min(10).max(100000),
    })
    .optional(),
  /** Recorte con VARIOS círculos (celda de malla global ∩ unión de
   * buffers): geometría disjunta entre lotes — sin doble conteo. */
  clips: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radio_m: z.number().min(10).max(100000),
      })
    )
    .max(60)
    .optional(),
});

const BodySchema = z
  .object({
    geocercas: z
      .array(GeocercaSchema)
      .max(2000, "Máximo 2000 geocercas")
      .optional(),
    incluirAgebs: z.boolean().default(false),
    /** Modo LOTE: regresa las sumas crudas del RPC calcular_universos_crudo
     * (máx 500 geocercas por lote); el cliente agrega lotes al final. */
    crudo: z.boolean().default(false),
    /** VALIDACIÓN DE SANIDAD: regresa el techo (población 18+ de los
     * AGEBs que intersectan esta envolvente) en vez de calcular. */
    techo: z
      .object({
        north: z.number().min(-90).max(90),
        south: z.number().min(-90).max(90),
        east: z.number().min(-180).max(180),
        west: z.number().min(-180).max(180),
      })
      .optional(),
  })
  .refine((b) => (b.geocercas?.length ?? 0) > 0 || b.techo, {
    message: "Manda al menos una geocerca (o un techo a validar)",
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

  // VALIDACIÓN DE SANIDAD: techo de la envolvente (cota superior)
  if (parsed.data.techo) {
    const { data, error } = await supabase.rpc("techo_universo", {
      p_bbox: parsed.data.techo,
    });
    if (error) {
      console.error("techo_universo falló:", error.message);
      return NextResponse.json(
        { error: `La validación del techo falló: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ techo: data });
  }

  const geocercas = parsed.data.geocercas ?? [];
  if (parsed.data.crudo) {
    if (geocercas.length > 500) {
      return NextResponse.json(
        { error: "Máximo 500 geocercas por lote crudo" },
        { status: 400 }
      );
    }
    const { data, error } = await supabase.rpc("calcular_universos_crudo", {
      p_geocercas: geocercas,
    });
    if (error) {
      console.error("calcular_universos_crudo falló:", error.message);
      return NextResponse.json(
        { error: `El lote de universos falló: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ crudo: data });
  }

  const universos = await calcularUniversos(supabase, geocercas, {
    incluirAgebs: parsed.data.incluirAgebs,
  });
  return NextResponse.json({ universos });
}
