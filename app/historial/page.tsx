import HistorialView from "@/components/HistorialView";
import { createClient } from "@/lib/supabase/server";
import type { PerfilUsuario } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HistorialPage() {
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

  return <HistorialView usuario={perfil} />;
}
