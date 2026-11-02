import { NextResponse } from "next/server";
import { z } from "zod";
import {
  cargarConfigCostos,
  claveTextoCircular,
  TTL_DIAS_CACHE,
} from "@/lib/google-cache";
import { costoLlamadaMxn } from "@/lib/costos";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ESTIMADOR CONSCIENTE DEL CACHÉ: antes de ejecutar un censo, el
// cliente manda sus celdas y términos y recibe el desglose "N celdas
// en caché ($0) · M nuevas (~$X)" + la antigüedad del caché, para que
// el usuario decida Usar caché / Refrescar todo ANTES de gastar.
// Solo LEE llaves de google_cache — 0 consultas a Google.

const BodySchema = z.object({
  terminos: z.array(z.string().trim().min(1).max(90)).min(1).max(20),
  celdas: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
    )
    .min(1)
    .max(800),
  radioM: z.number().min(50).max(50000),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Solicitud inválida" },
      { status: 400 }
    );
  }
  const { terminos, celdas, radioM } = parsed.data;

  // la MISMA llave que construirá el caché al ejecutar (término×celda)
  const claves: string[] = [];
  for (const t of terminos) {
    for (const c of celdas) {
      claves.push(claveTextoCircular(t, c, radioM));
    }
  }

  const desde = new Date(
    Date.now() - TTL_DIAS_CACHE * 24 * 3600_000
  ).toISOString();
  const vigentes = new Map<string, string>();
  try {
    for (let i = 0; i < claves.length; i += 200) {
      const { data } = await supabase
        .from("google_cache")
        .select("clave, created_at")
        .in("clave", claves.slice(i, i + 200))
        .gte("created_at", desde);
      for (const fila of (data ?? []) as { clave: string; created_at: string }[]) {
        vigentes.set(fila.clave, fila.created_at);
      }
    }
  } catch {
    // estimador caído = sin desglose; jamás bloquea el censo
  }

  const enCache = claves.filter((k) => vigentes.has(k)).length;
  const nuevas = claves.length - enCache;
  let antiguedadDias = 0;
  Array.from(vigentes.values()).forEach((creada) => {
    const dias = (Date.now() - new Date(creada).getTime()) / 86400_000;
    if (dias > antiguedadDias) antiguedadDias = dias;
  });

  // costo estimado con la misma config del resto de la plataforma
  // (searchText pagina: el factor promedio de llamadas por consulta)
  const cfg = await cargarConfigCostos(supabase);
  const porConsulta = costoLlamadaMxn("text", cfg) * cfg.factor_paginacion;
  const r2 = (v: number) => Math.round(v * 100) / 100;

  return NextResponse.json({
    total: claves.length,
    enCache,
    nuevas,
    /** Antigüedad de la entrada MÁS VIEJA que se usaría (días). */
    antiguedadDias: Math.round(antiguedadDias * 10) / 10,
    costoNuevasMxn: r2(nuevas * porConsulta),
    /** Costo de "Refrescar todo" (ignorar el caché y re-pagar). */
    costoRefrescoMxn: r2(claves.length * porConsulta),
    ttlDias: TTL_DIAS_CACHE,
  });
}
