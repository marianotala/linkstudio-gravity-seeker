import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { CpPoligono } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resuelve una lista de códigos postales a sus polígonos reales
// (tabla cp_poligonos, cargada por entidad desde /admin). Un CP
// inexistente no bloquea a los demás: regresa en noEncontrados con
// una sugerencia de qué entidad cargar.

const BodySchema = z.object({
  cps: z
    .array(z.string().regex(/^\d{5}$/, "CP inválido: usa 5 dígitos"))
    .min(1, "Manda al menos un código postal")
    .max(100, "Máximo 100 códigos postales"),
});

// Rangos de prefijo postal (2 dígitos) por entidad — SOLO para
// sugerir qué entidad cargar en /admin cuando un CP no está en la
// base; la búsqueda real siempre va contra cp_poligonos.
const RANGOS_ENTIDAD: [number, number, string][] = [
  [1, 16, "Ciudad de México"],
  [20, 20, "Aguascalientes"],
  [21, 22, "Baja California"],
  [23, 23, "Baja California Sur"],
  [24, 24, "Campeche"],
  [25, 27, "Coahuila"],
  [28, 28, "Colima"],
  [29, 30, "Chiapas"],
  [31, 33, "Chihuahua"],
  [34, 35, "Durango"],
  [36, 38, "Guanajuato"],
  [39, 41, "Guerrero"],
  [42, 43, "Hidalgo"],
  [44, 49, "Jalisco"],
  [50, 57, "Estado de México"],
  [58, 61, "Michoacán"],
  [62, 62, "Morelos"],
  [63, 63, "Nayarit"],
  [64, 67, "Nuevo León"],
  [68, 71, "Oaxaca"],
  [72, 75, "Puebla"],
  [76, 76, "Querétaro"],
  [77, 77, "Quintana Roo"],
  [78, 79, "San Luis Potosí"],
  [80, 82, "Sinaloa"],
  [83, 85, "Sonora"],
  [86, 86, "Tabasco"],
  [87, 89, "Tamaulipas"],
  [90, 90, "Tlaxcala"],
  [91, 96, "Veracruz"],
  [97, 97, "Yucatán"],
  [98, 99, "Zacatecas"],
];

function entidadProbable(cp: string): string | null {
  const prefijo = parseInt(cp.slice(0, 2), 10);
  const rango = RANGOS_ENTIDAD.find(([a, b]) => prefijo >= a && prefijo <= b);
  return rango ? rango[2] : null;
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
  const cps = Array.from(new Set(parsed.data.cps));

  const { data, error } = await supabase.rpc("buscar_cps", {
    p_cps: cps,
    p_incluir_geometria: true,
  });
  if (error) {
    console.error("buscar_cps falló:", error.message);
    return NextResponse.json(
      { error: "No se pudieron consultar los códigos postales" },
      { status: 502 }
    );
  }

  const r = data as {
    encontrados: CpPoligono[];
    no_encontrados: string[];
  };
  return NextResponse.json({
    encontrados: r.encontrados ?? [],
    noEncontrados: (r.no_encontrados ?? []).map((cp) => ({
      cp,
      sugerencia: entidadProbable(cp)
        ? `carga los polígonos de ${entidadProbable(cp)} en Admin`
        : "verifica el código postal",
    })),
  });
}
