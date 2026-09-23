import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Un lote de ~50 POIs con Haiku responde en segundos; red de seguridad.
export const maxDuration = 60;

// DEPURACIÓN CON IA (Capa 2): juicio de pertenencia de cada POI a la
// marca censada, con Claude (modelo económico). La API key de
// Anthropic vive SOLO en variables de entorno del servidor
// (ANTHROPIC_API_KEY) — el cliente NUNCA la recibe, igual que la de
// Google. Procesa UN lote corto por request (≤50 POIs): el cliente
// orquesta los lotes.

const BodySchema = z.object({
  marca: z.string().min(1).max(120),
  /** Giro inferido/declarado del censo (perfil de types), opcional. */
  giro: z.string().max(200).optional(),
  pois: z
    .array(
      z.object({
        id: z.string().min(1).max(300),
        nombre: z.string().max(200),
        direccion: z.string().max(300),
        types: z.array(z.string().max(60)).max(10),
      })
    )
    .min(1)
    .max(50, "Máximo 50 POIs por lote"),
});

const MODELO = process.env.DEPURACION_MODEL || "claude-haiku-4-5";

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
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "La depuración con IA no está configurada (falta ANTHROPIC_API_KEY en el servidor) — avisa al admin.",
      },
      { status: 501 }
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
  const { marca, giro, pois } = parsed.data;

  const lista = pois
    .map(
      (p, i) =>
        `${i + 1}. id=${p.id}\n   nombre: ${p.nombre}\n   direccion: ${p.direccion}\n   types_google: ${p.types.join(", ") || "(sin datos)"}`
    )
    .join("\n");

  const prompt = `Censo comercial de la marca "${marca}"${giro ? ` (giro del censo: ${giro})` : ""} en México. Para CADA punto de la lista, juzga si es realmente un establecimiento de esa marca/cadena:
- "pertenece": es un local de la marca.
- "no_pertenece": es otro negocio que solo coincide en el nombre (otro giro: barbería, taller, papelería…) o es un negocio DENTRO de un local de la marca sin ser la tienda.
- "dudoso": no hay señal suficiente para decidir.

Responde ÚNICAMENTE un arreglo JSON, sin texto adicional, con un objeto por punto:
[{"id":"<id>","v":"pertenece|no_pertenece|dudoso","r":"razón breve en español (máx 12 palabras; vacía si pertenece)"}]

Puntos:
${lista}`;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODELO,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });
    let texto = "";
    for (const block of response.content) {
      if (block.type === "text") texto += block.text;
    }
    // parse robusto: el contrato es JSON puro, pero se tolera texto
    // alrededor extrayendo el primer arreglo
    const inicio = texto.indexOf("[");
    const fin = texto.lastIndexOf("]");
    if (inicio === -1 || fin === -1) {
      return NextResponse.json(
        { error: "La IA no regresó un veredicto legible — reintenta" },
        { status: 502 }
      );
    }
    const crudo = JSON.parse(texto.slice(inicio, fin + 1)) as unknown;
    const idsValidos = new Set(pois.map((p) => p.id));
    const veredictos = (Array.isArray(crudo) ? crudo : [])
      .filter(
        (v): v is { id: string; v: string; r?: string } =>
          !!v &&
          typeof (v as { id?: unknown }).id === "string" &&
          idsValidos.has((v as { id: string }).id) &&
          ["pertenece", "no_pertenece", "dudoso"].includes(
            (v as { v?: string }).v ?? ""
          )
      )
      .map((v) => ({
        id: v.id,
        v: v.v as "pertenece" | "no_pertenece" | "dudoso",
        r: String(v.r ?? "").slice(0, 160),
      }));
    return NextResponse.json({ veredictos, modelo: MODELO });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "La IA está saturada — reintenta en unos segundos", codigo: "rate" },
        { status: 429 }
      );
    }
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "La API key de Anthropic del servidor es inválida — avisa al admin" },
        { status: 502 }
      );
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `La depuración con IA falló (${e.status}): ${e.message}` },
        { status: 502 }
      );
    }
    if (e instanceof SyntaxError) {
      return NextResponse.json(
        { error: "La IA regresó un veredicto ilegible — reintenta" },
        { status: 502 }
      );
    }
    console.error("Depuración IA falló:", e);
    return NextResponse.json(
      { error: "La depuración con IA falló — reintenta" },
      { status: 502 }
    );
  }
}
