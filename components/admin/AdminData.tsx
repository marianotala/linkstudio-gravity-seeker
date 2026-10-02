"use client";

// MÓDULO "DATA DE GEOLOCALIZACIÓN" (/admin/data): todas las cargas de
// datos territoriales con su estado — demografía INEGI (AGEBs),
// polígonos de CPs, catálogo de colonias y localidades rurales (ITER).
// Arriba, el RESUMEN DE SALUD: de un vistazo se ve si algo falta.
// La lógica de parseo/carga es la misma de siempre (lib/ingesta-cliente
// + RPCs admin_upsert_*), movida aquí sin reescribirse.

import { useEffect, useRef, useState } from "react";
import { Semaforo, TOTAL_ENTIDADES } from "./AdminHub";
import { createClient } from "@/lib/supabase/client";
import {
  construirAgebs,
  construirCps,
  parsearCatalogoColonias,
  parsearCensoInegi,
  parsearLocalidadesRurales,
  parsearShapefileInegi,
} from "@/lib/ingesta-cliente";

interface ResumenEntidad {
  entidad: string;
  agebs: number;
  poblacion: number | null;
  /** AGEBs cargados sin datos censales (solo geometría). */
  sin_censo?: number;
}

interface ResumenCps {
  entidad: string;
  cps: number;
}

export const NOMBRES_ENTIDAD: Record<string, string> = {
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
const fmt = (n: number) => n.toLocaleString("es-MX");

type Mensaje = { tipo: "ok" | "error" | "info"; texto: string } | null;

/** Nota de estado de una carga (ok/avance/error) con tokens. */
export function NotaCarga({ mensaje }: { mensaje: Mensaje }) {
  if (!mensaje) return null;
  return (
    <p
      className={`mt-3 font-body text-xs leading-relaxed ${
        mensaje.tipo === "ok"
          ? "text-exito"
          : mensaje.tipo === "error"
            ? "text-error"
            : "text-texto-secundario"
      }`}
    >
      {mensaje.texto}
    </p>
  );
}

export function BarraProgreso({
  progreso,
  colorCls,
}: {
  progreso: { hecho: number; total: number } | null;
  colorCls: string;
}) {
  if (!progreso) return null;
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-chip bg-fondo">
      <div
        className={`h-full rounded-chip transition-all ${colorCls}`}
        style={{
          width: `${Math.round((progreso.hecho / progreso.total) * 100)}%`,
        }}
      />
    </div>
  );
}

export default function AdminData() {
  const [resumen, setResumen] = useState<ResumenEntidad[]>([]);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- carga de polígonos de códigos postales
  const [resumenCps, setResumenCps] = useState<ResumenCps[]>([]);
  const [archivosCp, setArchivosCp] = useState<File[]>([]);
  const [entidadCp, setEntidadCp] = useState("");
  const [cargandoCp, setCargandoCp] = useState(false);
  const [progresoCp, setProgresoCp] = useState<{ hecho: number; total: number } | null>(null);
  const [mensajeCp, setMensajeCp] = useState<Mensaje>(null);
  const inputCpRef = useRef<HTMLInputElement>(null);

  // ---- localidades rurales (ITER 2020)
  const [resumenRural, setResumenRural] = useState<{
    total: number;
    poblacion: number;
    entidades: number;
  } | null>(null);
  const [cargandoRural, setCargandoRural] = useState(false);
  const [progresoRural, setProgresoRural] = useState<{ hecho: number; total: number } | null>(null);
  const [mensajeRural, setMensajeRural] = useState<Mensaje>(null);
  const inputRuralRef = useRef<HTMLInputElement>(null);

  // ---- catálogo CP → colonias (Correos de México)
  const [totalColonias, setTotalColonias] = useState<number | null>(null);
  const [cargandoColonias, setCargandoColonias] = useState(false);
  const [progresoColonias, setProgresoColonias] = useState<{ hecho: number; total: number } | null>(null);
  const [mensajeColonias, setMensajeColonias] = useState<Mensaje>(null);
  const inputColoniasRef = useRef<HTMLInputElement>(null);

  async function cargarResumen() {
    const supabase = createClient();
    const { data } = await supabase.rpc("agebs_resumen");
    setResumen(((data ?? []) as ResumenEntidad[]) ?? []);
    const { data: cps } = await supabase.rpc("cps_resumen");
    setResumenCps(((cps ?? []) as ResumenCps[]) ?? []);
    const { count } = await supabase
      .from("cp_colonias")
      .select("codigo_postal", { count: "exact", head: true });
    setTotalColonias(count ?? 0);
    const { data: rural } = await supabase.rpc("localidades_resumen");
    setResumenRural(
      (rural as { total: number; poblacion: number; entidades: number } | null) ??
        null
    );
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
        texto: `${fmt(censo.size)} AGEBs censales · leyendo shapefile (esto puede tardar ~1 min)…`,
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

      // Si el cruce por CVEGEO falla en masa (headers con BOM, archivo
      // censal de otra entidad, formato inesperado) es mejor no cargar
      // nada que llenar la base de geometrías sin datos demográficos.
      if (sinCenso / registros.length > 0.8) {
        setMensaje({
          tipo: "error",
          texto: `El cruce por CVEGEO falló: solo ${fmt(registros.length - sinCenso)} de ${fmt(registros.length)} AGEBs tienen datos censales — no se cargó nada. Verifica que el RESAGEBURB sea de la misma entidad que el shapefile.`,
        });
        return;
      }

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
          texto: `Cargando: ${fmt(hecho)} de ${fmt(registros.length)} AGEBs…`,
        });
      }

      setMensaje({
        tipo: "ok",
        texto: `Listo: ${fmt(registros.length)} AGEBs cargados${sinCenso > 0 ? ` · ${sinCenso} sin datos censales (solo geometría)` : ""}${saltados > 0 ? ` · ${saltados} saltados` : ""}. Los universos ya están disponibles en esta entidad.`,
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

  // ---- polígonos de códigos postales (shapefile de Correos de México)
  const porExtensionCp = (ext: string) =>
    archivosCp.find((f) => f.name.toLowerCase().endsWith(ext));
  const shpCp = porExtensionCp(".shp");
  const dbfCp = porExtensionCp(".dbf");
  const prjCp = porExtensionCp(".prj");
  const listoParaCargarCp = Boolean(shpCp && dbfCp && entidadCp);

  async function cargarCps() {
    if (!shpCp || !dbfCp || !entidadCp) return;
    setCargandoCp(true);
    setMensajeCp(null);
    setProgresoCp(null);
    try {
      setMensajeCp({ tipo: "info", texto: "Leyendo shapefile de CPs…" });
      const fc = await parsearShapefileInegi(shpCp, dbfCp, prjCp);
      const { registros, sinCp, campoCp } = construirCps(fc);
      if (registros.length === 0) {
        setMensajeCp({
          tipo: "error",
          texto: campoCp
            ? "El shapefile no trae códigos postales válidos de 4-5 dígitos."
            : "No encontré la columna de código postal en el .dbf (busqué D_CP, CP, COD_POST y similares, y ninguna columna trae códigos de 5 dígitos).",
        });
        return;
      }

      const supabase = createClient();
      let hecho = 0;
      for (let i = 0; i < registros.length; i += LOTE) {
        const lote = registros.slice(i, i + LOTE);
        const { error } = await supabase.rpc("admin_upsert_cps", {
          p_entidad: entidadCp,
          p_cps: lote,
        });
        if (error) {
          throw new Error(
            /row-level security/i.test(error.message)
              ? "Tu usuario no tiene rol admin: no puede cargar datos."
              : error.message
          );
        }
        hecho += lote.length;
        setProgresoCp({ hecho, total: registros.length });
        setMensajeCp({
          tipo: "info",
          texto: `Cargando: ${fmt(hecho)} de ${fmt(registros.length)} CPs…`,
        });
      }

      setMensajeCp({
        tipo: "ok",
        texto: `Listo: ${fmt(registros.length)} códigos postales cargados (columna ${campoCp})${sinCp > 0 ? ` · ${sinCp} geometrías saltadas` : ""}. Ya puedes buscarlos en el modo "Por código postal".`,
      });
      setArchivosCp([]);
      if (inputCpRef.current) inputCpRef.current.value = "";
      await cargarResumen();
    } catch (e) {
      setMensajeCp({
        tipo: "error",
        texto: e instanceof Error ? e.message : "Error al cargar los archivos",
      });
    } finally {
      setCargandoCp(false);
      setProgresoCp(null);
    }
  }

  // ---- catálogo CP → colonias: txt/csv oficial de Correos de México
  async function cargarCatalogoColonias(file: File | undefined) {
    if (!file) return;
    setCargandoColonias(true);
    setMensajeColonias(null);
    setProgresoColonias(null);
    try {
      setMensajeColonias({ tipo: "info", texto: "Leyendo el catálogo…" });
      const registros = await parsearCatalogoColonias(file);
      if (registros.length === 0) {
        setMensajeColonias({
          tipo: "error",
          texto: "El archivo no trae filas válidas (d_codigo + d_asenta).",
        });
        return;
      }
      const supabase = createClient();
      const LOTE_COL = 2000;
      let hecho = 0;
      for (let i = 0; i < registros.length; i += LOTE_COL) {
        const lote = registros.slice(i, i + LOTE_COL);
        const { error } = await supabase.rpc("admin_upsert_colonias", {
          p_colonias: lote,
        });
        if (error) {
          throw new Error(
            /row-level security/i.test(error.message)
              ? "Tu usuario no tiene rol admin: no puede cargar datos."
              : error.message
          );
        }
        hecho += lote.length;
        setProgresoColonias({ hecho, total: registros.length });
        setMensajeColonias({
          tipo: "info",
          texto: `Cargando colonias: ${fmt(hecho)} de ${fmt(registros.length)}…`,
        });
      }
      setMensajeColonias({
        tipo: "ok",
        texto: `Listo: ${fmt(registros.length)} colonias cargadas. Los popups del mapa ya muestran colonia, municipio y estado.`,
      });
      if (inputColoniasRef.current) inputColoniasRef.current.value = "";
      await cargarResumen();
    } catch (e) {
      setMensajeColonias({
        tipo: "error",
        texto: e instanceof Error ? e.message : "Error al cargar el catálogo",
      });
    } finally {
      setCargandoColonias(false);
      setProgresoColonias(null);
    }
  }

  // ---- localidades rurales: CSV nacional procesado del ITER 2020
  async function cargarLocalidadesRurales(file: File | undefined) {
    if (!file) return;
    setCargandoRural(true);
    setMensajeRural(null);
    setProgresoRural(null);
    try {
      setMensajeRural({ tipo: "info", texto: "Leyendo el CSV del ITER…" });
      const { registros, saltados } = await parsearLocalidadesRurales(file);
      if (registros.length === 0) {
        setMensajeRural({
          tipo: "error",
          texto:
            "El archivo no trae localidades válidas (claves entidad/mun/loc + lng/lat en grados decimales).",
        });
        return;
      }
      const supabase = createClient();
      // lotes grandes: son puntos, no polígonos (185 mil filas ≈ 75 lotes)
      const LOTE_RURAL = 2500;
      let hecho = 0;
      for (let i = 0; i < registros.length; i += LOTE_RURAL) {
        const lote = registros.slice(i, i + LOTE_RURAL);
        const { error } = await supabase.rpc("admin_upsert_localidades", {
          p_localidades: lote,
        });
        if (error) {
          throw new Error(
            /row-level security/i.test(error.message)
              ? "Tu usuario no tiene rol admin: no puede cargar datos."
              : error.message
          );
        }
        hecho += lote.length;
        setProgresoRural({ hecho, total: registros.length });
        setMensajeRural({
          tipo: "info",
          texto: `Cargando localidades: ${fmt(hecho)} de ${fmt(registros.length)}…`,
        });
      }
      setMensajeRural({
        tipo: "ok",
        texto: `Listo: ${fmt(registros.length)} localidades rurales cargadas${saltados > 0 ? ` · ${fmt(saltados)} filas saltadas (sin clave o sin coordenadas)` : ""}. Los universos ya suman población rural en todos los modos.`,
      });
      if (inputRuralRef.current) inputRuralRef.current.value = "";
      await cargarResumen();
    } catch (e) {
      setMensajeRural({
        tipo: "error",
        texto: e instanceof Error ? e.message : "Error al cargar el CSV",
      });
    } finally {
      setCargandoRural(false);
      setProgresoRural(null);
    }
  }

  async function borrarLocalidadesRurales() {
    const supabase = createClient();
    // borra todo el nacional (la carga siempre es el CSV completo)
    const { error } = await supabase
      .from("localidades_rurales")
      .delete()
      .neq("cvegeo", "");
    if (error) {
      setMensajeRural({ tipo: "error", texto: `No se pudo borrar: ${error.message}` });
    } else {
      setMensajeRural({ tipo: "ok", texto: "Localidades rurales eliminadas de la base" });
      await cargarResumen();
    }
  }

  async function borrarEntidadCp(entidad: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("cp_poligonos")
      .delete()
      .eq("entidad", entidad);
    if (error) {
      setMensajeCp({ tipo: "error", texto: `No se pudo borrar: ${error.message}` });
    } else {
      setMensajeCp({ tipo: "ok", texto: `CPs de la entidad ${entidad} eliminados` });
      await cargarResumen();
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

  const inputFileCls =
    "campo file:mr-3 file:rounded file:border-0 file:px-3 file:py-1 file:font-body file:text-[11px]";

  return (
    <>
      {/* ---------- RESUMEN DE SALUD de la data ---------- */}
      <div className="tarjeta glow-violeta px-6 py-5">
        <h1 className="font-display text-xl font-bold tracking-tight text-texto-primario">
          Data de geolocalización
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-body text-xs text-texto-secundario">
          <span className="flex items-center gap-2">
            <Semaforo valor={resumen.length} total={TOTAL_ENTIDADES} />
            <span className="font-mono text-texto-primario">
              {resumen.length}/{TOTAL_ENTIDADES}
            </span>
            entidades demográficas
          </span>
          <span className="flex items-center gap-2">
            <Semaforo valor={resumenCps.length} total={TOTAL_ENTIDADES} />
            <span className="font-mono text-texto-primario">
              {resumenCps.length}/{TOTAL_ENTIDADES}
            </span>
            entidades con CPs
          </span>
          <span className="flex items-center gap-2">
            <Semaforo valor={totalColonias ?? 0} total={1} />
            <span className="font-mono text-texto-primario">
              {fmt(totalColonias ?? 0)}
            </span>
            colonias
          </span>
          <span className="flex items-center gap-2">
            <Semaforo valor={resumenRural?.total ?? 0} total={1} />
            <span className="font-mono text-texto-primario">
              {fmt(resumenRural?.total ?? 0)}
            </span>
            localidades rurales
          </span>
        </div>
      </div>

      {/* ---------- demografía INEGI (AGEBs) ---------- */}
      <div className="tarjeta px-6 py-6">
        <h2 className="font-display text-base font-bold tracking-tight text-texto-primario">
          Demografía INEGI (AGEBs)
        </h2>
        <p className="mt-1 font-body text-xs leading-relaxed text-texto-secundario">
          Sube los 4 archivos de una entidad y se cargan directo a la base —
          sin terminal ni deploys. Necesitas: el shapefile de AGEB urbana del
          Marco Geoestadístico 2020 (
          <span className="font-mono text-texto-primario">EEa.shp + EEa.dbf + EEa.prj</span>
          , p. ej. 09a para CDMX) y el archivo censal{" "}
          <span className="font-mono text-texto-primario">RESAGEBURB (.csv o .xls)</span>{" "}
          del Censo 2020. Instrucciones en scripts/ingesta-ageb/README.md.
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".shp,.dbf,.prj,.shx,.csv,.xls,.xlsx"
          onChange={(e) => setArchivos(Array.from(e.target.files ?? []))}
          className={`${inputFileCls} mt-4 file:bg-violeta/20 file:text-violeta`}
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
              className={`rounded-chip border px-2.5 py-0.5 ${
                archivo
                  ? "border-exito/50 text-exito"
                  : "border-linea text-texto-terciario"
              }`}
            >
              {archivo ? "✓" : "○"} {etiqueta as string}
            </span>
          ))}
        </div>

        <button
          onClick={cargar}
          disabled={!listoParaCargar || cargando}
          className="btn-primario mt-4 w-full !bg-violeta hover:!bg-violeta/85"
        >
          {cargando ? "Cargando…" : "Cargar a la base demográfica"}
        </button>

        <BarraProgreso progreso={progreso} colorCls="bg-violeta" />
        <NotaCarga mensaje={mensaje} />

        {/* entidades cargadas */}
        {resumen.length === 0 ? (
          <p className="mt-4 font-body text-xs text-texto-terciario">
            Ninguna entidad todavía. Los universos demográficos estarán
            disponibles en cuanto cargues la primera.
          </p>
        ) : (
          <table className="mt-4 w-full text-left font-body text-xs">
            <thead className="text-texto-terciario">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Entidades cargadas</th>
                <th className="py-1.5 pr-3 text-right font-medium">AGEBs</th>
                <th className="py-1.5 pr-3 text-right font-medium">Población</th>
                <th className="py-1.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="text-texto-primario">
              {resumen.map((r) => (
                <tr key={r.entidad} className="border-t border-linea/60">
                  <td className="py-2 pr-3">
                    <span className="font-mono">{r.entidad}</span> ·{" "}
                    {NOMBRES_ENTIDAD[r.entidad] ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-cian">
                    {fmt(r.agebs)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-texto-secundario">
                    {r.poblacion?.toLocaleString("es-MX") ?? "—"}
                    {(r.sin_censo ?? 0) > 0 && (
                      <span
                        className="ml-2 text-alerta"
                        title="AGEBs sin datos censales (solo geometría): vuelve a subir el RESAGEBURB de esta entidad"
                      >
                        ⚠ {fmt(r.sin_censo!)} sin censo
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => borrarEntidad(r.entidad)}
                      disabled={cargando}
                      className="btn-fantasma !text-[11px] hover:!text-error"
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

      {/* ---------- polígonos de códigos postales ---------- */}
      <div className="tarjeta px-6 py-6">
        <h2 className="font-display text-base font-bold tracking-tight text-texto-primario">
          Polígonos de códigos postales
        </h2>
        <p className="mt-1 font-body text-xs leading-relaxed text-texto-secundario">
          Sube el shapefile de CPs de una entidad (
          <span className="font-mono text-texto-primario">.shp + .dbf + .prj</span>) del
          dataset oficial de Correos de México en datos.gob.mx (&quot;códigos
          postales, coordenadas y colonias&quot;): campo{" "}
          <span className="font-mono text-texto-primario">d_codigo</span>, proyección
          Mexico_ITRF2008_LCC — la reproyección a WGS84 es automática. La
          carga es acumulativa por entidad y habilita el modo &quot;Por código
          postal&quot;.
        </p>

        <div className="mt-4 flex gap-2">
          <select
            value={entidadCp}
            onChange={(e) => setEntidadCp(e.target.value)}
            className="campo w-56"
          >
            <option value="">Entidad…</option>
            {Object.entries(NOMBRES_ENTIDAD).map(([clave, nombre]) => (
              <option key={clave} value={clave}>
                {clave} · {nombre}
              </option>
            ))}
          </select>
          <input
            ref={inputCpRef}
            type="file"
            multiple
            accept=".shp,.dbf,.prj,.shx"
            onChange={(e) => setArchivosCp(Array.from(e.target.files ?? []))}
            className={`${inputFileCls} file:bg-cian/20 file:text-cian`}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[10px]">
          {[
            [".shp (geometrías)", shpCp],
            [".dbf (atributos)", dbfCp],
            [".prj (proyección)", prjCp],
          ].map(([etiqueta, archivo]) => (
            <span
              key={etiqueta as string}
              className={`rounded-chip border px-2.5 py-0.5 ${
                archivo
                  ? "border-exito/50 text-exito"
                  : "border-linea text-texto-terciario"
              }`}
            >
              {archivo ? "✓" : "○"} {etiqueta as string}
            </span>
          ))}
          <span
            className={`rounded-chip border px-2.5 py-0.5 ${
              entidadCp
                ? "border-exito/50 text-exito"
                : "border-linea text-texto-terciario"
            }`}
          >
            {entidadCp ? "✓" : "○"} entidad
          </span>
        </div>

        <button
          onClick={cargarCps}
          disabled={!listoParaCargarCp || cargandoCp}
          className="btn-secundario mt-4 w-full"
        >
          {cargandoCp ? "Cargando…" : "Cargar polígonos de CP"}
        </button>

        <BarraProgreso progreso={progresoCp} colorCls="bg-cian" />
        <NotaCarga mensaje={mensajeCp} />

        {resumenCps.length > 0 && (
          <table className="mt-4 w-full text-left font-body text-xs">
            <thead className="text-texto-terciario">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Entidades con CPs cargados</th>
                <th className="py-1.5 pr-3 text-right font-medium">CPs</th>
                <th className="py-1.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="text-texto-primario">
              {resumenCps.map((r) => (
                <tr key={r.entidad} className="border-t border-linea/60">
                  <td className="py-2 pr-3">
                    <span className="font-mono">{r.entidad}</span> ·{" "}
                    {NOMBRES_ENTIDAD[r.entidad] ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-cian">
                    {fmt(r.cps)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => borrarEntidadCp(r.entidad)}
                      disabled={cargandoCp}
                      className="btn-fantasma !text-[11px] hover:!text-error"
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

      {/* ---------- catálogo CP → colonias ---------- */}
      <div className="tarjeta px-6 py-6">
        <h2 className="font-display text-base font-bold tracking-tight text-texto-primario">
          Catálogo de colonias (CP → colonia)
        </h2>
        <p className="mt-1 font-body text-xs leading-relaxed text-texto-secundario">
          Sube el txt/csv del Catálogo Nacional de Códigos Postales de Correos
          de México (columnas d_codigo, d_asenta, D_mnpio, d_estado; nacional
          o por entidad). Alimenta el popup del mapa y las columnas
          colonia/municipio del Export data.
          {totalColonias !== null && (
            <span className="text-texto-primario">
              {" "}
              Hoy: <span className="font-mono">{fmt(totalColonias)}</span> colonias.
            </span>
          )}
        </p>
        <input
          ref={inputColoniasRef}
          type="file"
          accept=".txt,.csv"
          disabled={cargandoColonias}
          onChange={(e) => cargarCatalogoColonias(e.target.files?.[0])}
          className={`${inputFileCls} mt-3 file:bg-cian/20 file:text-cian`}
        />
        <BarraProgreso progreso={progresoColonias} colorCls="bg-cian" />
        <NotaCarga mensaje={mensajeColonias} />
      </div>

      {/* ---------- localidades rurales (ITER) ---------- */}
      <div className="tarjeta px-6 py-6">
        <h2 className="font-display text-base font-bold tracking-tight text-texto-primario">
          Localidades rurales (ITER)
        </h2>
        <p className="mt-1 font-body text-xs leading-relaxed text-texto-secundario">
          Sube el CSV nacional procesado del ITER 2020 (INEGI): localidades
          rurales <span className="font-mono text-texto-primario">&lt;2,500 hab</span> como
          puntos con población — complementan a los AGEBs urbanos en el
          cálculo de universos. Columnas:{" "}
          <span className="font-mono text-texto-primario">
            entidad, nom_ent, mun, nom_mun, loc, nom_loc, lng, lat, pobtot,
            pobfem, pobmas, p_18ymas, p_18a24, p_60ymas, vivtot, tvivhab
          </span>{" "}
          (lng/lat en grados decimales WGS84; confidenciales de INEGI como
          celda vacía). No hay doble conteo: las urbanas ya están en los
          AGEBs.
          {resumenRural && resumenRural.total > 0 && (
            <span className="text-texto-primario">
              {" "}
              Hoy: <span className="font-mono">{fmt(resumenRural.total)}</span>{" "}
              localidades de {resumenRural.entidades} entidades ·{" "}
              <span className="font-mono">{fmt(resumenRural.poblacion)}</span>{" "}
              habitantes.
            </span>
          )}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            ref={inputRuralRef}
            type="file"
            accept=".csv,.txt"
            disabled={cargandoRural}
            onChange={(e) => cargarLocalidadesRurales(e.target.files?.[0])}
            className={`${inputFileCls} file:bg-magenta/20 file:text-magenta`}
          />
          {resumenRural && resumenRural.total > 0 && (
            <button
              onClick={borrarLocalidadesRurales}
              disabled={cargandoRural}
              className="btn-secundario shrink-0 !px-3 !text-xs hover:!text-error"
            >
              Eliminar todas
            </button>
          )}
        </div>
        <BarraProgreso progreso={progresoRural} colorCls="bg-magenta" />
        <NotaCarga mensaje={mensajeRural} />
      </div>
    </>
  );
}
