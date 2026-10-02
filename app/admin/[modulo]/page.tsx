import { redirect } from "next/navigation";
import AdminShell, { type ModuloAdmin } from "@/components/admin/AdminShell";
import { createClient } from "@/lib/supabase/server";
import type { PerfilUsuario } from "@/lib/types";

export const dynamic = "force-dynamic";

const MODULOS: ModuloAdmin[] = ["data", "ooh", "gasto", "usuarios"];

/** Deep-link por módulo: /admin/data · /admin/ooh · /admin/gasto ·
 * /admin/usuarios — para mandar ligas directas. */
export default async function AdminModuloPage({
  params,
}: {
  params: { modulo: string };
}) {
  if (!MODULOS.includes(params.modulo as ModuloAdmin)) {
    redirect("/admin");
  }

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

  if (perfil?.rol !== "admin") redirect("/planes");

  return <AdminShell usuario={perfil} modulo={params.modulo as ModuloAdmin} />;
}
