"use client";

// Login de Seeker (réplica del login-card de gravity-seeker.html):
// logo de ondas, "Gravity", subtítulo Seeker. Sin registro público —
// los usuarios se dan de alta desde el dashboard de Supabase.

import { useState } from "react";
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
