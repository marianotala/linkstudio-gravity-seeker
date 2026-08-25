import { redirect } from "next/navigation";
import AdminView from "@/components/AdminView";
import { createClient } from "@/lib/supabase/server";
import type { PerfilUsuario } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("profiles")
    .select("id, email, nombre, rol")
    .eq("id", user.id)
    .single();
  const perfil = data as PerfilUsuario | null;

  // Solo administradores; los vendedores regresan al buscador.
  if (perfil?.rol !== "admin") redirect("/");

  return <AdminView usuario={perfil} />;
}
