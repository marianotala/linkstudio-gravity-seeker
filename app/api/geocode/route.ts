import { NextResponse } from "next/server";
import { z } from "zod";
import { geocodeDireccion, GoogleError } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";
import type { GeocodeResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  direcciones: z
    .array(z.string().trim().min(1, "Dirección vacía"))
    .min(1, "Manda al menos una dirección")
    .max(500, "Máximo 500 direcciones por carga"),
});

const TAMANO_LOTE = 10;

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

  const { direcciones } = parsed.data;
  const resultados: GeocodeResult[] = new Array(direcciones.length);

  try {
    // Lotes de 10 en paralelo; los lotes corren en secuencia para no
    // reventar la cuota de QPS de Geocoding.
    for (let i = 0; i < direcciones.length; i += TAMANO_LOTE) {
      const lote = direcciones.slice(i, i + TAMANO_LOTE);
      const parciales = await Promise.all(
        lote.map(async (dir): Promise<GeocodeResult> => {
          try {
            return await geocodeDireccion(dir);
          } catch (e) {
            // Errores de configuración (key/cuota) tumban todo el batch;
            // cualquier otro fallo queda registrado solo en su índice.
            if (e instanceof GoogleError) throw e;
            return { ok: false, error: "Fallo de red al geocodificar" };
          }
        })
      );
      parciales.forEach((r, j) => (resultados[i + j] = r));
    }
  } catch (e) {
    const mensaje =
      e instanceof GoogleError ? e.message : "Error inesperado al geocodificar";
    const codigo = e instanceof GoogleError ? e.codigo : undefined;
    return NextResponse.json(
      { error: mensaje, ...(codigo ? { codigo } : {}) },
      { status: codigo ? 429 : 502 }
    );
  }

  return NextResponse.json({ resultados });
}
