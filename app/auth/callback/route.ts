import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Callback del OAuth de Google (patrón SSR oficial de Supabase para
// Next.js): intercambia el code por la sesión — las cookies las
// escribe el cliente de @supabase/ssr vía cookies().set() — y redirige
// al home. En Vercel, request.url puede traer el host INTERNO del
// deployment: si redirigimos ahí, las cookies (host-only del dominio
// público) no viajan y el usuario rebota a /login sin sesión. Por eso
// el redirect usa x-forwarded-host (el host público real).

function urlPublica(request: Request, path: string): string {
  const { origin } = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (process.env.NODE_ENV === "development" || !forwardedHost) {
    return `${origin}${path}`;
  }
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${forwardedHost}${path}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const errorDescription = searchParams.get("error_description");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // sesión creada: al buscador, por el host público
      return NextResponse.redirect(urlPublica(request, next));
    }
    return NextResponse.redirect(
      urlPublica(
        request,
        `/login?error=${encodeURIComponent(`No se pudo completar la sesión: ${error.message}`)}`
      )
    );
  }

  const mensaje = /database error|dominio no autorizado/i.test(
    errorDescription ?? ""
  )
    ? "Tu cuenta de Google no pertenece a un dominio autorizado. Pide acceso al equipo de Gravity."
    : (errorDescription ??
      "No llegó el código de Google al callback. Revisa las Redirect URLs en Supabase.");
  return NextResponse.redirect(
    urlPublica(request, `/login?error=${encodeURIComponent(mensaje)}`)
  );
}
