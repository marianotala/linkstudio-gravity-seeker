import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Callback del OAuth de Google: intercambia el código por la sesión y
// regresa al buscador. Si Supabase rechazó el alta (dominio no
// autorizado, candado en handle_new_user), regresa a /login con el
// mensaje correspondiente.

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorDescription = searchParams.get("error_description");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  const mensaje = /database error|dominio no autorizado/i.test(
    errorDescription ?? ""
  )
    ? "Tu cuenta de Google no pertenece a un dominio autorizado. Pide acceso al equipo de Gravity."
    : (errorDescription ?? "No se pudo completar el acceso con Google");
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(mensaje)}`
  );
}
