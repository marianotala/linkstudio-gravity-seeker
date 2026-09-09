import { redirect } from "next/navigation";
import { Suspense } from "react";
import SeekerApp from "@/components/SeekerApp";
import { createClient } from "@/lib/supabase/server";
import type { PerfilUsuario, RolLevantamiento } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES_F2: RolLevantamiento[] = ["poi_propio", "competencia", "proximidad"];

/** Levantamiento dentro de un plan: el MISMO buscador del modo
 * consulta, con contexto de Planner — los resultados se persisten al
 * proyecto como surveys con el rol de la sección. */
export default async function LevantarPage({
  params,
}: {
  params: { id: string; rol: string };
}) {
  if (!ROLES_F2.includes(params.rol as RolLevantamiento)) {
    redirect(`/planner/${params.id}`);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let perfil: PerfilUsuario | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, nombre, rol")
      .eq("id", user.id)
      .single();
    perfil = (data as PerfilUsuario | null) ?? {
      id: user.id,
      email: user.email ?? "",
      nombre: null,
      rol: "vendedor",
    };
  }

  const { data: proyecto } = await supabase
    .from("projects")
    .select("id, nombre_cliente")
    .eq("id", params.id)
    .maybeSingle();
  if (!proyecto) {
    redirect("/planes");
  }

  return (
    <Suspense>
      <SeekerApp
        usuario={perfil}
        planner={{
          proyectoId: params.id,
          rol: params.rol as RolLevantamiento,
          nombreCliente: proyecto.nombre_cliente,
        }}
      />
    </Suspense>
  );
}
