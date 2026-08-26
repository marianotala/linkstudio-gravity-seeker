"use client";

// Login de Seeker (réplica del login-card de gravity-seeker.html):
// logo de ondas, "Gravity", subtítulo Seeker. Sin registro público —
// los usuarios se dan de alta desde el dashboard de Supabase.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GravityMark from "@/components/GravityMark";
import { createClient } from "@/lib/supabase/client";

const SUPABASE_CONFIGURADO =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [entrando, setEntrando] = useState(false);

  // errores que regresan del callback de OAuth (?error=...)
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e) setError(e);
  }, []);

  async function entrarConGoogle() {
    setError("");
    setEntrando(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (authError) {
        setError(`No se pudo iniciar con Google: ${authError.message}`);
        setEntrando(false);
      }
      // si no hay error, el navegador redirige a Google
    } catch {
      setError("Error de conexión con Supabase. Intenta de nuevo.");
      setEntrando(false);
    }
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Escribe tu correo y tu contraseña");
      return;
    }
    setEntrando(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) {
        setError(
          authError.message === "Invalid login credentials"
            ? "Correo o contraseña incorrectos"
            : `No se pudo iniciar sesión: ${authError.message}`
        );
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Error de conexión con Supabase. Intenta de nuevo.");
    } finally {
      setEntrando(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-linea bg-panel2 px-3 py-2.5 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-cian focus:outline-none";

  return (
    <main className="flex min-h-screen items-center justify-center bg-fondo px-4">
      <div className="tarjeta glow-cian w-full max-w-sm p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <GravityMark size={56} />
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-white">
            Gravity
          </h1>
          <p className="mt-1 font-mono text-[11px] tracking-wide text-zinc-500">
            Seeker — point of interest intelligence
          </p>
        </div>

        {!SUPABASE_CONFIGURADO ? (
          <p className="rounded-md border border-magenta/40 bg-magenta/10 px-3 py-2 font-mono text-xs leading-relaxed text-magenta">
            Falta configurar NEXT_PUBLIC_SUPABASE_URL y
            NEXT_PUBLIC_SUPABASE_ANON_KEY en las variables de entorno.
          </p>
        ) : (
          <form onSubmit={entrar} className="space-y-3">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500"
              >
                Correo
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@linkstudio.mx"
                className={inputCls}
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputCls}
              />
            </div>

            {error && (
              <p className="font-mono text-xs text-magenta">{error}</p>
            )}

            <button
              type="submit"
              disabled={entrando}
              className="w-full rounded-md bg-cian px-3 py-2.5 font-display text-sm font-extrabold text-fondo transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {entrando ? "Entrando…" : "Entrar"}
            </button>

            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-linea" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                o
              </span>
              <span className="h-px flex-1 bg-linea" />
            </div>

            <button
              type="button"
              onClick={entrarConGoogle}
              disabled={entrando}
              className="flex w-full items-center justify-center gap-2.5 rounded-md border border-linea bg-panel2 px-3 py-2.5 font-mono text-sm text-zinc-200 transition-colors hover:border-zinc-500 disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#4285F4"
                  d="M23.5 12.27c0-.85-.08-1.67-.22-2.46H12v4.65h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.14-4.07 1.14-3.13 0-5.78-2.11-6.73-4.96H1.28v3.1A12 12 0 0 0 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.28a12 12 0 0 0 0 10.74l3.99-3.1z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.77c1.76 0 3.35.6 4.6 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.63l3.99 3.1C6.22 6.88 8.87 4.77 12 4.77z"
                />
              </svg>
              Continuar con Google
            </button>
            <p className="font-mono text-[10px] leading-relaxed text-zinc-600">
              Solo cuentas de Google de dominios autorizados del equipo.
            </p>
          </form>
        )}

        <p className="mt-6 text-center font-mono text-[10px] leading-relaxed text-zinc-600">
          Sin registro público. Pide tu acceso al equipo de Gravity ·
          powered by Link Studio
        </p>
      </div>
    </main>
  );
}
