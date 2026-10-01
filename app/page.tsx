import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * v2 F1 — todo vive en planes: "/" (el modo consulta viejo) redirige a
 * Mis planes. Los links legados que reabrían una búsqueda o un censo
 * (?cargar / ?duplicar / ?censo) siguen funcionando: van al Buscador
 * del plan personal de Exploración del usuario (creado automático),
 * con los mismos parámetros — nada se pierde.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const legados = ["cargar", "duplicar", "censo"].filter(
    (k) => typeof searchParams[k] === "string" && searchParams[k] !== ""
  );
  if (legados.length === 0) {
    redirect("/planes");
  }

  // plan personal de exploración (uno por usuario, tipo 'exploracion')
  const { data: existente } = await supabase
    .from("projects")
    .select("id")
    .eq("creado_por", user.id)
    .eq("tipo", "exploracion")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  let planId = (existente?.id as string | undefined) ?? null;
  if (!planId) {
    const { data: nuevo } = await supabase
      .from("projects")
      .insert({
        nombre_cliente: "Exploración",
        titulo: "Búsquedas libres — tu espacio personal",
        creado_por: user.id,
        tipo: "exploracion",
      })
      .select("id")
      .single();
    planId = (nuevo?.id as string | undefined) ?? null;
  }
  if (!planId) {
    redirect("/planes");
  }

  const qs = new URLSearchParams({ seccion: "buscador" });
  for (const k of legados) {
    qs.set(k, searchParams[k] as string);
  }
  if (searchParams.actualizar === "1") {
    qs.set("actualizar", "1");
  }
  redirect(`/planner/${planId}?${qs.toString()}`);
}
