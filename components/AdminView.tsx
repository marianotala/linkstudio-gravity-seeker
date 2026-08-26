"use client";

// Panel de administración: carga de datos demográficos de INEGI sin
// tocar Vercel ni terminal. El navegador parsea shapefile + censo y
// sube por lotes vía RPC admin_upsert_agebs (RLS: solo rol admin).

import { useEffect, useRef, useState } from "react";
import AppHeader from "./AppHeader";
import { createClient } from "@/lib/supabase/client";
import {
  construirAgebs,
  parsearCensoInegi,
  parsearShapefileInegi,
} from "@/lib/ingesta-cliente";
import type { PerfilUsuario } from "@/lib/types";

interface ResumenEntidad {
  entidad: string;
  agebs: number;
  poblacion: number | null;
}

const NOMBRES_ENTIDAD: Record<string, string> = {
  "01": "Aguascalientes", "02": "Baja California", "03": "Baja California Sur",
  "04": "Campeche", "05": "Coahuila", "06": "Colima", "07": "Chiapas",
  "08": "Chihuahua", "09": "Ciudad de México", "10": "Durango",
  "11": "Guanajuato", "12": "Guerrero", "13": "Hidalgo", "14": "Jalisco",
  "15": "Estado de México", "16": "Michoacán", "17": "Morelos",
  "18": "Nayarit", "19": "Nuevo León", "20": "Oaxaca", "21": "Puebla",
  "22": "Querétaro", "23": "Quintana Roo", "24": "San Luis Potosí",
  "25": "Sinaloa", "26": "Sonora", "27": "Tabasco", "28": "Tamaulipas",
  "29": "Tlaxcala", "30": "Veracruz", "31": "Yucatán", "32": "Zacatecas",
};

const LOTE = 100;

export default function AdminView({
  usuario,
}: {
  usuario: PerfilUsuario | null;
}) {
  const [resumen, setResumen] = useState<ResumenEntidad[]>([]);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error" | "info"; texto: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargarResumen() {
    const supabase = createClient();
    const { data } = await supabase.rpc("agebs_resumen");
    setResumen(((data ?? []) as ResumenEntidad[]) ?? []);
  }
  useEffect(() => {
    cargarResumen();
  }, []);

  const porExtension = (ext: string) =>
    archivos.find((f) => f.name.toLowerCase().endsWith(ext));
  const shpFile = porExtension(".shp");
  const dbfFile = porExtension(".dbf");
  const prjFile = porExtension(".prj");
  const censoFile =
    porExtension(".csv") ?? porExtension(".xlsx") ?? porExtension(".xls");
  const listoParaCargar = Boolean(shpFile && dbfFile && censoFile);

  async function cargar() {
    if (!shpFile || !dbfFile || !censoFile) return;
    setCargando(true);
    setMensaje(null);
    setProgreso(null);
    try {
      setMensaje({ tipo: "info", texto: "Leyendo archivo censal…" });
      const censo = await parsearCensoInegi(censoFile);
      if (censo.size === 0) {
        setMensaje({
          tipo: "error",
          texto:
            'El archivo censal no trae filas "Total AGEB urbana". ¿Es el RESAGEBURB correcto?',
        });
        return;
      }

      setMensaje({
        tipo: "info",
        texto: `${censo.size.toLocaleString("es-MX")} AGEBs censales · leyendo shapefile (esto puede tardar ~1 min)…`,
      });
      const fc = await parsearShapefileInegi(shpFile, dbfFile, prjFile);
      const { registros, sinCenso, saltados } = construirAgebs(fc, censo);
      if (registros.length === 0) {
        setMensaje({
          tipo: "error",
          texto:
            "El shapefile no trae AGEBs con CVEGEO válido. ¿Es la capa de AGEB urbana (EEa.shp)?",
        });
        return;
      }

      // la reproyección y su verificación de sanidad (rango de México)
      // viven en parsearShapefileInegi; si algo falla, lanza un error
      // claro que se muestra abajo
      const supabase = createClient();
      let hecho = 0;
      for (let i = 0; i < registros.length; i += LOTE) {
        const lote = registros.slice(i, i + LOTE);
        const { error } = await supabase.rpc("admin_upsert_agebs", {
          p_agebs: lote,
        });
        if (error) {
          throw new Error(
            /row-level security/i.test(error.message)
              ? "Tu usuario no tiene rol admin: no puede cargar datos."
              : error.message
          );
        }
        hecho += lote.length;
        setProgreso({ hecho, total: registros.length });
        setMensaje({
          tipo: "info",
          texto: `Cargando: ${hecho.toLocaleString("es-MX")} de ${registros.length.toLocaleString("es-MX")} AGEBs…`,
        });
      }

      setMensaje({
        tipo: "ok",
        texto: `Listo: ${registros.length.toLocaleString("es-MX")} AGEBs cargados${sinCenso > 0 ? ` · ${sinCenso} sin datos censales (solo geometría)` : ""}${saltados > 0 ? ` · ${saltados} saltados` : ""}. Los universos ya están disponibles en esta entidad.`,
      });
      setArchivos([]);
      if (inputRef.current) inputRef.current.value = "";
      await cargarResumen();
    } catch (e) {
      setMensaje({
        tipo: "error",
        texto: e instanceof Error ? e.message : "Error al cargar los archivos",
      });
    } finally {
      setCargando(false);
      setProgreso(null);
    }
  }

  async function borrarEntidad(entidad: string) {
    const supabase = createClient();
    const { error } = await supabase.from("agebs").delete().eq("entidad", entidad);
    if (error) {
      setMensaje({ tipo: "error", texto: `No se pudo borrar: ${error.message}` });
    } else {
      setMensaje({ tipo: "ok", texto: `Entidad ${entidad} eliminada de la base demográfica` });
      await cargarResumen();
    }
  }

  const inputCls =
    "w-full rounded-md border border-linea bg-panel2 px-3 py-2 font-mono text-xs text-zinc-200";

  return (
    <div className="flex h-screen flex-col gap-3 overflow-hidden bg-fondo p-3">
      <AppHeader usuario={usuario} />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          {/* carga de archivos */}
          <div className="tarjeta glow-violeta px-6 py-6">
            <h1 className="font-display text-xl font-extrabold tracking-tight text-white">
              Cargar datos demográficos (INEGI)
            </h1>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
              Sube los 4 archivos de una entidad y se cargan directo a la
              base — sin terminal ni deploys. Necesitas: el shapefile de
              AGEB urbana del Marco Geoestadístico 2020 (
              <span className="text-zinc-300">EEa.shp + EEa.dbf + EEa.prj</span>
              , p. ej. 09a para CDMX) y el archivo censal{" "}
              <span className="text-zinc-300">RESAGEBURB (.csv o .xls)</span>{" "}
              del Censo 2020. Instrucciones de descarga en
              scripts/ingesta-ageb/README.md.
            </p>

            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".shp,.dbf,.prj,.shx,.csv,.xls,.xlsx"
              onChange={(e) => setArchivos(Array.from(e.target.files ?? []))}
              className={`${inputCls} mt-4 file:mr-3 file:rounded file:border-0 file:bg-violeta/20 file:px-3 file:py-1 file:font-mono file:text-[11px] file:text-violeta`}
            />

            <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px]">
              {[
                [".shp (geometrías)", shpFile],
                [".dbf (atributos)", dbfFile],
                [".prj (proyección)", prjFile],
                ["censo .csv/.xls", censoFile],
              ].map(([etiqueta, archivo]) => (
                <span
                  key={etiqueta as string}
                  className={`rounded-full border px-2.5 py-0.5 ${
                    archivo
                      ? "border-emerald-400/50 text-emerald-400"
                      : "border-linea text-zinc-600"
                  }`}
                >
                  {archivo ? "✓" : "○"} {etiqueta as string}
                </span>
              ))}
            </div>

            <button
              onClick={cargar}
              disabled={!listoParaCargar || cargando}
              className="mt-4 w-full rounded-md bg-violeta px-3 py-2.5 font-display text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {cargando ? "Cargando…" : "Cargar a la base demográfica"}
            </button>

            {progreso && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fondo">
                <div
                  className="h-full rounded-full bg-violeta transition-all"
                  style={{ width: `${Math.round((progreso.hecho / progreso.total) * 100)}%` }}
                />
              </div>
            )}
            {mensaje && (
              <p
                className={`mt-3 font-mono text-[11px] leading-relaxed ${
                  mensaje.tipo === "ok"
                    ? "text-emerald-400"
                    : mensaje.tipo === "error"
                      ? "text-magenta"
                      : "text-zinc-400"
                }`}
              >
                {mensaje.texto}
              </p>
            )}
          </div>

          {/* entidades cargadas */}
          <div className="tarjeta px-6 py-5">
            <h2 className="font-display text-base font-extrabold text-white">
              Entidades cargadas
            </h2>
            {resumen.length === 0 ? (
              <p className="mt-2 font-mono text-[11px] text-zinc-500">
                Ninguna todavía. Los universos demográficos estarán
                disponibles en cuanto cargues la primera entidad.
              </p>
            ) : (
              <table className="mt-3 w-full text-left font-mono text-xs">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Entidad</th>
                    <th className="py-1.5 pr-3 text-right font-medium">AGEBs</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Población</th>
                    <th className="py-1.5 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {resumen.map((r) => (
                    <tr key={r.entidad} className="border-t border-linea/60">
                      <td className="py-2 pr-3">
                        {r.entidad} · {NOMBRES_ENTIDAD[r.entidad] ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right text-cian">
                        {r.agebs.toLocaleString("es-MX")}
                      </td>
                      <td className="py-2 pr-3 text-right text-zinc-400">
                        {r.poblacion?.toLocaleString("es-MX") ?? "—"}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => borrarEntidad(r.entidad)}
                          disabled={cargando}
                          className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:border-magenta hover:text-magenta disabled:opacity-40"
                          title="Eliminar esta entidad de la base"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
