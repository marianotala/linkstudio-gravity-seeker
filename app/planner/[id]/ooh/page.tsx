import { redirect } from "next/navigation";
import OohView from "@/components/OohView";
import { createClient } from "@/lib/supabase/server";
import type { PerfilUsuario } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Sección OOH de un plan: el MISMO cruce pantallas × PDVs de la
 * pestaña global, con los PDVs tomables de los surveys del proyecto y
 * el resultado guardado como survey rol "ooh". */
export default async function OohProyectoPage({
  params,
}: {
  params: { id: string };
}) {
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
  if (!proyecto) redirect("/planes");

  return (
    <OohView
      usuario={perfil}
      planner={{ proyectoId: params.id, nombreCliente: proyecto.nombre_cliente }}
    />
  );
}
