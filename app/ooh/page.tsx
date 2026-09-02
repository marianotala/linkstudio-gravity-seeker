import OohView from "@/components/OohView";
import { createClient } from "@/lib/supabase/server";
import type { PerfilUsuario } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OohPage() {
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

  return <OohView usuario={perfil} />;
}
