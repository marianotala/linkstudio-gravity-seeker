"use client";

// Modo PLANNER de un proyecto (F1 — fundación): menú lateral con el
// cliente como encabezado y las secciones POI propios / Competencia /
// Proximidad / OOH / Exportar. En esta fase cada sección es un
// placeholder ("Disponible en la siguiente fase"): la lógica de
// levantamientos llega en F2/F3. Breadcrumb para regresar a Mis planes
// y al modo consulta. El modo consulta actual queda 100% intacto.

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "./AppHeader";
import { createClient } from "@/lib/supabase/client";
import type {
  Levantamiento,
  PerfilUsuario,
  Proyecto,
  RolLevantamiento,
} from "@/lib/types";

type SeccionPlanner = RolLevantamiento | "exportar";

const SECCIONES: {
  clave: SeccionPlanner;
  nombre: string;
  descriptor: string;
  color: string;
  fase: string;
  detalle: string;
}[] = [
  {
    clave: "poi_propio",
    nombre: "POI (puntos propios)",
    descriptor: "Los PDVs del cliente",
    color: "#2fb9e8",
    fase: "F2",
    detalle:
      "Carga de los puntos de venta del cliente (Excel, direcciones o buscador de lugares) como levantamiento base del plan.",
  },
  {
    clave: "competencia",
    nombre: "Competencia",
    descriptor: "Censos de marcas rivales",
    color: "#f4368a",
    fase: "F2",
    detalle:
      "Censos de marca y categoría sobre el territorio del cliente, guardados automáticamente dentro del plan.",
  },
  {
    clave: "proximidad",
    nombre: "Proximidad",
    descriptor: "Qué hay alrededor de los PDVs",
    color: "#9d5cf0",
    fase: "F3",
    detalle:
      "Categorías y generadores de tráfico alrededor de los puntos propios (la táctica Geo-Fence Proximidad).",
  },
  {
    clave: "ooh",
    nombre: "OOH",
    descriptor: "Pantallas × puntos de venta",
    color: "#ff8c42",
    fase: "F2",
    detalle:
      "Cruce del inventario de pantallas contra los PDVs del cliente (Geo-PDOOH) como levantamiento del plan.",
  },
  {
    clave: "exportar",
    nombre: "Exportar",
    descriptor: "El plan completo",
    color: "#34d399",
    fase: "F5",
    detalle:
      "Export plan del proyecto: todos los levantamientos consolidados en un solo PDF con branding Gravity + exports de datos.",
  },
];

const ETIQUETA_ROL: Record<RolLevantamiento, string> = {
  poi_propio: "POI propios",
  competencia: "Competencia",
  proximidad: "Proximidad",
  ooh: "OOH",
};

export default function PlannerView({
  usuario,
  proyectoId,
}: {
  usuario: PerfilUsuario | null;
  proyectoId: string;
}) {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [levantamientos, setLevantamientos] = useState<Levantamiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [seccion, setSeccion] = useState<SeccionPlanner>("poi_propio");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error: e } = await supabase
        .from("projects")
        .select(
          "id, nombre_cliente, titulo, creado_por, status, created_at, updated_at, profiles(email, nombre)"
        )
        .eq("id", proyectoId)
        .maybeSingle();
      if (e || !data) {
        setError(e?.message ?? "Este plan no existe (¿fue eliminado?)");
        setCargando(false);
        return;
      }
      setProyecto(data as unknown as Proyecto);
      const { data: s } = await supabase
        .from("surveys")
        .select("id, project_id, rol, fuente, configuracion, status, progreso, created_at")
        .eq("project_id", proyectoId)
        .order("created_at");
      setLevantamientos(((s ?? []) as Levantamiento[]) ?? []);
      setCargando(false);
    })();
  }, [proyectoId]);

  const porRol = (rol: RolLevantamiento) =>
    levantamientos.filter((l) => l.rol === rol).length;
  const activa = SECCIONES.find((s) => s.clave === seccion)!;

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-fondo p-3">
      <AppHeader usuario={usuario} />

      {/* breadcrumb: regreso claro a Mis planes y al modo consulta */}
      <div className="tarjeta flex shrink-0 items-center gap-2 px-4 py-2 font-mono text-[11px]">
        <Link href="/planes" className="text-zinc-500 transition-colors hover:text-violeta">
          Mis planes
        </Link>
        <span className="text-zinc-700">/</span>
        <span className="text-violeta">
          {cargando ? "…" : (proyecto?.nombre_cliente ?? "Plan")}
        </span>
        {proyecto?.titulo && (
          <span className="truncate text-zinc-500">· {proyecto.titulo}</span>
        )}
        <Link
          href="/"
          className="ml-auto rounded-full border border-linea bg-panel2 px-3 py-1 text-zinc-400 transition-colors hover:border-cian hover:text-cian"
          title="El modo consulta sigue igual que siempre; este plan queda guardado"
        >
          ← Ir al modo consulta
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* ---------- menú lateral del Planner ---------- */}
        <aside className="tarjeta w-[300px] shrink-0 overflow-y-auto">
          <div className="border-b border-linea px-5 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-violeta">
              Planner
            </p>
            <h1 className="mt-1 truncate font-display text-lg font-extrabold tracking-tight text-white">
              {cargando ? "Cargando…" : (proyecto?.nombre_cliente ?? "Plan")}
            </h1>
            {proyecto && (
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-500">
                {proyecto.titulo ? `${proyecto.titulo} · ` : ""}
                creado por{" "}
                {proyecto.creado_por === usuario?.id
                  ? "ti"
                  : (proyecto.profiles?.nombre ??
                    proyecto.profiles?.email ??
                    "el equipo")}{" "}
                ·{" "}
                {new Date(proyecto.created_at).toLocaleDateString("es-MX", {
                  dateStyle: "medium",
                })}
                {proyecto.status === "archivado" && (
                  <span className="ml-1 text-amber-400">· archivado</span>
                )}
              </p>
            )}
          </div>

          <nav className="px-3 py-3">
            {SECCIONES.map((s) => (
              <button
                key={s.clave}
                onClick={() => setSeccion(s.clave)}
                className={`mb-1 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  seccion === s.clave
                    ? "border-linea bg-panel2"
                    : "border-transparent hover:bg-panel2/60"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block font-display text-sm font-extrabold ${
                      seccion === s.clave ? "text-white" : "text-zinc-300"
                    }`}
                  >
                    {s.nombre}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-zinc-500">
                    {s.descriptor}
                  </span>
                </span>
                {s.clave !== "exportar" && (
                  <span className="shrink-0 rounded-full border border-linea bg-fondo px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                    {porRol(s.clave as RolLevantamiento)}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {/* ---------- contenido de la sección (placeholder F1) ---------- */}
        <main className="tarjeta flex min-w-0 flex-1 flex-col overflow-y-auto">
          {error ? (
            <div className="m-auto max-w-md px-6 text-center">
              <p className="font-mono text-xs text-magenta">{error}</p>
              <Link
                href="/planes"
                className="mt-4 inline-block rounded-md border border-violeta bg-violeta/10 px-4 py-2 font-mono text-xs text-violeta transition-colors hover:bg-violeta/20"
              >
                Volver a Mis planes
              </Link>
            </div>
          ) : (
            <div className="m-auto max-w-lg px-6 py-10 text-center">
              <span
                className="mx-auto block h-3 w-3 rounded-full"
                style={{ backgroundColor: activa.color }}
              />
              <h2 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-white">
                {activa.nombre}
              </h2>
              <p className="mt-2 font-mono text-xs leading-relaxed text-zinc-400">
                {activa.detalle}
              </p>
              <div className="mt-6 inline-block rounded-full border border-dashed border-linea px-4 py-1.5 font-mono text-[11px] text-zinc-500">
                Disponible en la siguiente fase ({activa.fase})
              </div>
              {activa.clave !== "exportar" &&
                porRol(activa.clave as RolLevantamiento) > 0 && (
                  <p className="mt-4 font-mono text-[11px] text-zinc-500">
                    {porRol(activa.clave as RolLevantamiento)}{" "}
                    {porRol(activa.clave as RolLevantamiento) === 1
                      ? `levantamiento de ${ETIQUETA_ROL[activa.clave as RolLevantamiento]} guardado`
                      : `levantamientos de ${ETIQUETA_ROL[activa.clave as RolLevantamiento]} guardados`}{" "}
                    en este plan.
                  </p>
                )}
              <p className="mt-6 font-mono text-[10px] leading-relaxed text-zinc-600">
                Mientras tanto, el modo consulta funciona igual que siempre
                (Buscador, Censos, OOH) — este plan ya quedó guardado y todo
                el equipo puede verlo en Mis planes.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
