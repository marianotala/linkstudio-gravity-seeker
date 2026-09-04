import { NextResponse } from "next/server";
import { z } from "zod";
import { autocompleteLugares, detalleLugar, GoogleError } from "@/lib/google";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Buscar un lugar por nombre (estilo Google Maps) para fijarlo como
// ORIGEN: autocompletado en vivo + detalle del lugar elegido. Usa
// SESIONES de Places Autocomplete (sessionToken generado en el
// cliente): todas las teclas + el detalle se facturan como una sesión
// barata — no cuenta contra el saldo de celdas del usuario.

const BodySchema = z
  .object({
    /** Texto a autocompletar (mín 3 caracteres). */
    q: z.string().trim().min(3).max(120).optional(),
    /** Lugar elegido (cierra la sesión). */
    placeId: z.string().trim().min(5).max(300).optional(),
    /** Token de sesión de autocomplete (UUID del cliente). */
    session: z.string().trim().min(8).max(64),
  })
  .refine((b) => Boolean(b.q) !== Boolean(b.placeId), {
    message: "Manda q (sugerencias) O placeId (detalle), no ambos",
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

  try {
    if (parsed.data.q) {
      const sugerencias = await autocompleteLugares(
        parsed.data.q,
        parsed.data.session
      );
      return NextResponse.json({ sugerencias });
    }
    const lugar = await detalleLugar(parsed.data.placeId!, parsed.data.session);
    return NextResponse.json({ lugar });
  } catch (e) {
    const mensaje =
      e instanceof GoogleError ? e.message : "Error al buscar el lugar";
    const codigo = e instanceof GoogleError ? e.codigo : undefined;
    return NextResponse.json(
      { error: mensaje, ...(codigo ? { codigo } : {}) },
      { status: codigo ? 429 : 502 }
    );
  }
}
