import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Un bulk de 500 keywords con el modelo económico responde en <1 min.
export const maxDuration = 60;

// GENERADOR DE KEYWORDS (Geo-Targeting): bulk de keywords en español
// de México clasificado en TRES grupos (marca / industria /
// competencia), con el contexto del plan. La API key de Anthropic vive
// SOLO en variables de entorno del servidor (ANTHROPIC_API_KEY) — el
// cliente NUNCA la recibe, igual que la de Google. Es una PROPUESTA
// EDITABLE generada por IA, no data de volumen de búsqueda.

const BodySchema = z.object({
  marca: z.string().min(1).max(120),
  industria: z.string().min(1).max(160),
  competidores: z.array(z.string().min(1).max(120)).max(15),
  cantidad: z.union([z.literal(100), z.literal(300), z.literal(500)]),
  ciudades: z.array(z.string().max(80)).max(10).optional(),
});

// mismo modelo económico de la depuración (configurable por env)
const MODELO = process.env.DEPURACION_MODEL || "claude-haiku-4-5";

/** Normaliza para dedupe: sin acentos, minúsculas, espacios colapsados. */
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Genéricas inútiles que no sirven solas como keyword de campaña. */
const INUTILES = new Set([
  "cerca", "cerca de mi", "promocion", "promociones", "barato", "precio",
  "precios", "mexico", "comprar", "tienda", "local", "negocio", "sucursal",
  "abierto", "delivery", "domicilio", "menu",
]);

function limpiarGrupo(crudo: unknown, limite: number): string[] {
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const k of Array.isArray(crudo) ? crudo : []) {
    if (typeof k !== "string") continue;
    const limpio = k.toLowerCase().replace(/\s+/g, " ").trim();
    const clave = normalizar(limpio);
    // sin duplicados, sin keywords de 1-2 caracteres, sin genéricas solas
    if (limpio.length < 3 || limpio.length > 80) continue;
    if (INUTILES.has(clave)) continue;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(limpio);
    if (salida.length >= limite) break;
  }
  return salida;
}

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
          "El generador de keywords no está configurado (falta ANTHROPIC_API_KEY en el servidor) — avisa al admin.",
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
  const { marca, industria, competidores, cantidad, ciudades } = parsed.data;

  // reparto: ~30% marca, ~35% industria, ~35% competencia; SIN
  // competidores el bulk se redistribuye 50/50 entre marca e industria
  // (nada de grupos fantasma en el entregable)
  const hayCompetencia = competidores.length > 0;
  const nMarca = Math.round(cantidad * (hayCompetencia ? 0.3 : 0.5));
  const nCompetencia = hayCompetencia
    ? cantidad - nMarca - Math.round(cantidad * 0.35)
    : 0;
  const nIndustria = cantidad - nMarca - nCompetencia;

  const prompt = `Eres un trafficker experto en keyword/contextual targeting para DSPs (Simpli.fi, Eskimi) en México. Genera un bulk de keywords en ESPAÑOL DE MÉXICO para una campaña geolocalizada.

Contexto del plan:
- Marca del cliente: ${marca}
- Categoría/industria: ${industria}
- Competidores: ${competidores.join(", ") || "(ninguno)"}
${ciudades && ciudades.length > 0 ? `- Plazas de la campaña: ${ciudades.join(", ")}` : ""}

Genera EXACTAMENTE estos grupos:
1. "marca" (~${nMarca} keywords): la marca, variantes y abreviaciones, misspellings comunes en México, y marca + intención (ciudad/plaza, "cerca de mí", "sucursal", "promociones", "menú", "precios", "a domicilio"...).
2. "industria" (~${nIndustria} keywords): categoría genérica, productos y servicios del giro, intents transaccionales ("<producto> a domicilio", "<giro> cerca", "promociones de <producto>") y long-tail local${ciudades && ciudades.length > 0 ? " con las plazas" : ""}.
${hayCompetencia ? `3. "competencia" (~${nCompetencia} keywords repartidas entre TODOS los competidores listados): cada competidor con el mismo tratamiento que la marca (nombre, variantes, misspellings, + términos de intención). Sin inventar competidores: SOLO los listados.` : `NO hay competidores en este plan: el grupo "competencia" debe ser un arreglo VACÍO ([]) — no inventes competidores.`}

Reglas estrictas:
- Todas en minúsculas, de 1 o más palabras, sin keywords de una sola letra ni genéricas inútiles sueltas ("barato", "tienda").
- Sin duplicados dentro ni entre grupos.
- Sin comillas ni signos; solo letras, números y espacios (acentos permitidos).

Responde ÚNICAMENTE un objeto JSON, sin texto adicional:
{"marca":["..."],"industria":["..."],"competencia":["..."]}`;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODELO,
      max_tokens: 12000,
      messages: [{ role: "user", content: prompt }],
    });
    let texto = "";
    for (const block of response.content) {
      if (block.type === "text") texto += block.text;
    }
    const inicio = texto.indexOf("{");
    const fin = texto.lastIndexOf("}");
    if (inicio === -1 || fin === -1) {
      return NextResponse.json(
        { error: "La IA no regresó un bulk legible — reintenta" },
        { status: 502 }
      );
    }
    const crudo = JSON.parse(texto.slice(inicio, fin + 1)) as {
      marca?: unknown;
      industria?: unknown;
      competencia?: unknown;
    };

    // dedupe GLOBAL entre grupos (marca gana, luego industria)
    const marcaKw = limpiarGrupo(crudo.marca, nMarca + 40);
    const enMarca = new Set(marcaKw.map(normalizar));
    const industriaKw = limpiarGrupo(crudo.industria, nIndustria + 40).filter(
      (k) => !enMarca.has(normalizar(k))
    );
    const enPrevios = new Set([
      ...Array.from(enMarca),
      ...industriaKw.map(normalizar),
    ]);
    const competenciaKw = limpiarGrupo(
      crudo.competencia,
      nCompetencia + 60
    ).filter((k) => !enPrevios.has(normalizar(k)));

    return NextResponse.json({
      keywords: {
        marca: marcaKw,
        industria: industriaKw,
        competencia: competenciaKw,
      },
      modelo: MODELO,
    });
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
        { error: `El generador de keywords falló (${e.status}): ${e.message}` },
        { status: 502 }
      );
    }
    if (e instanceof SyntaxError) {
      return NextResponse.json(
        { error: "La IA regresó un bulk ilegible — reintenta" },
        { status: 502 }
      );
    }
    console.error("Generador de keywords falló:", e);
    return NextResponse.json(
      { error: "El generador de keywords falló — reintenta" },
      { status: 502 }
    );
  }
}
