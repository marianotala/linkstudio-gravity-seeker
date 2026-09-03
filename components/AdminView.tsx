"use client";

// Panel de administración: carga de datos demográficos de INEGI sin
// tocar Vercel ni terminal. El navegador parsea shapefile + censo y
// sube por lotes vía RPC admin_upsert_agebs (RLS: solo rol admin).

import { useEffect, useRef, useState } from "react";
import AppHeader from "./AppHeader";
import { createClient } from "@/lib/supabase/client";
import {
  construirAgebs,
  construirCps,
  parsearCatalogoColonias,
  parsearCensoInegi,
  parsearLocalidadesRurales,
  parsearShapefileInegi,
} from "@/lib/ingesta-cliente";
import { etiquetaTipoPantalla } from "@/lib/ooh";
import {
  descargarPlantillaPantallas,
  parsearArchivoPantallas,
  type PantallaCarga,
} from "@/lib/parse";
import type { GeocodeResponse, PerfilUsuario, ResumenLotePantallas } from "@/lib/types";

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

  // ---- carga de polígonos de códigos postales
  const [resumenCps, setResumenCps] = useState<ResumenCps[]>([]);
  const [archivosCp, setArchivosCp] = useState<File[]>([]);
  const [entidadCp, setEntidadCp] = useState("");
  const [cargandoCp, setCargandoCp] = useState(false);
  const [progresoCp, setProgresoCp] = useState<{ hecho: number; total: number } | null>(null);
  const [mensajeCp, setMensajeCp] = useState<{ tipo: "ok" | "error" | "info"; texto: string } | null>(null);
  const inputCpRef = useRef<HTMLInputElement>(null);

  // ---- localidades rurales (ITER 2020)
  const [resumenRural, setResumenRural] = useState<{
    total: number;
    poblacion: number;
    entidades: number;
  } | null>(null);
  const [cargandoRural, setCargandoRural] = useState(false);
  const [progresoRural, setProgresoRural] = useState<{ hecho: number; total: number } | null>(null);
  const [mensajeRural, setMensajeRural] = useState<{ tipo: "ok" | "error" | "info"; texto: string } | null>(null);
  const inputRuralRef = useRef<HTMLInputElement>(null);

  // ---- inventario de pantallas OOH
  const [resumenPantallas, setResumenPantallas] = useState<ResumenLotePantallas[]>([]);
  const [lotePantallas, setLotePantallas] = useState("");
  const [cargandoPantallas, setCargandoPantallas] = useState(false);
  const [progresoPantallas, setProgresoPantallas] = useState<{ hecho: number; total: number } | null>(null);
  const [mensajePantallas, setMensajePantallas] = useState<{ tipo: "ok" | "error" | "info"; texto: string } | null>(null);
  const inputPantallasRef = useRef<HTMLInputElement>(null);

  // ---- consumo de la API y tope diario de celdas (configurable)
  interface ConsumoUsuario {
    user_id: string;
    email: string;
    nombre: string | null;
    rol: string;
    celdas_hoy: number;
    busquedas_hoy: number;
    celdas_mes: number;
    busquedas_mes: number;
  }
  const [consumo, setConsumo] = useState<ConsumoUsuario[]>([]);
  const [topeCeldas, setTopeCeldas] = useState<string>("");
  const [guardandoTope, setGuardandoTope] = useState(false);
  const [mensajeTope, setMensajeTope] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  // ---- catálogo CP → colonias (Correos de México)
  const [totalColonias, setTotalColonias] = useState<number | null>(null);
  const [cargandoColonias, setCargandoColonias] = useState(false);
  const [progresoColonias, setProgresoColonias] = useState<{ hecho: number; total: number } | null>(null);
  const [mensajeColonias, setMensajeColonias] = useState<{ tipo: "ok" | "error" | "info"; texto: string } | null>(null);
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
    const { data: pantallas } = await supabase.rpc("screens_resumen");
    setResumenPantallas(((pantallas ?? []) as ResumenLotePantallas[]) ?? []);
    const { data: consumoApi } = await supabase.rpc("admin_consumo_api");
    setConsumo(((consumoApi ?? []) as ConsumoUsuario[]) ?? []);
    const { data: config } = await supabase
      .from("app_config")
      .select("valor")
      .eq("clave", "cuotas")
      .maybeSingle();
    const tope = (config?.valor as { tope_celdas_dia?: number } | null)
      ?.tope_celdas_dia;
    if (tope) setTopeCeldas(String(tope));
  }
  useEffect(() => {
    cargarResumen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Si el cruce por CVEGEO falla en masa (headers con BOM, archivo
      // censal de otra entidad, formato inesperado) es mejor no cargar
      // nada que llenar la base de geometrías sin datos demográficos.
      if (sinCenso / registros.length > 0.8) {
        setMensaje({
          tipo: "error",
          texto: `El cruce por CVEGEO falló: solo ${(registros.length - sinCenso).toLocaleString("es-MX")} de ${registros.length.toLocaleString("es-MX")} AGEBs tienen datos censales — no se cargó nada. Verifica que el RESAGEBURB sea de la misma entidad que el shapefile.`,
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
          texto: `Cargando: ${hecho.toLocaleString("es-MX")} de ${registros.length.toLocaleString("es-MX")} CPs…`,
        });
      }

      setMensajeCp({
        tipo: "ok",
        texto: `Listo: ${registros.length.toLocaleString("es-MX")} códigos postales cargados (columna ${campoCp})${sinCp > 0 ? ` · ${sinCp} geometrías saltadas` : ""}. Ya puedes buscarlos en el modo "Por código postal".`,
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
          texto: `Cargando colonias: ${hecho.toLocaleString("es-MX")} de ${registros.length.toLocaleString("es-MX")}…`,
        });
      }
      setMensajeColonias({
        tipo: "ok",
        texto: `Listo: ${registros.length.toLocaleString("es-MX")} colonias cargadas. Los popups del mapa ya muestran colonia, municipio y estado.`,
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
          texto: `Cargando localidades: ${hecho.toLocaleString("es-MX")} de ${registros.length.toLocaleString("es-MX")}…`,
        });
      }
      setMensajeRural({
        tipo: "ok",
        texto: `Listo: ${registros.length.toLocaleString("es-MX")} localidades rurales cargadas${saltados > 0 ? ` · ${saltados.toLocaleString("es-MX")} filas saltadas (sin clave o sin coordenadas)` : ""}. Los universos ya suman población rural en todos los modos.`,
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

  // ---- inventario de pantallas OOH: CSV/Excel con detección de
  //      columnas; las filas con dirección y sin coordenadas se
  //      geocodifican; upsert por clave en lotes.
  async function cargarPantallas(file: File | undefined) {
    if (!file) return;
    setCargandoPantallas(true);
    setMensajePantallas(null);
    setProgresoPantallas(null);
    try {
      setMensajePantallas({ tipo: "info", texto: "Leyendo el inventario…" });
      const { pantallas, pendientes, deteccion, correcciones } =
        await parsearArchivoPantallas(file);
      if (pantallas.length === 0 && pendientes.length === 0) {
        setMensajePantallas({ tipo: "error", texto: deteccion });
        return;
      }
      const lote =
        lotePantallas.trim() ||
        file.name.replace(/\.(csv|txt|xlsx?|xlsm)$/i, "").trim() ||
        "inventario";

      // geocodificar pendientes (dirección sin coordenadas)
      const listas: PantallaCarga[] = [...pantallas];
      let sinGeo = 0;
      if (pendientes.length > 0) {
        const LOTE_GEO = 100;
        for (let i = 0; i < pendientes.length; i += LOTE_GEO) {
          const grupo = pendientes.slice(i, i + LOTE_GEO);
          setMensajePantallas({
            tipo: "info",
            texto: `Geocodificando direcciones: ${Math.min(i + LOTE_GEO, pendientes.length)} de ${pendientes.length}…`,
          });
          const resp = await fetch("/api/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ direcciones: grupo.map((p) => p.direccion!) }),
          });
          const data = (await resp.json()) as GeocodeResponse & { error?: string };
          if (!resp.ok) throw new Error(data.error ?? "Error al geocodificar");
          data.resultados.forEach((r, j) => {
            if (r.ok && r.lat !== undefined && r.lng !== undefined) {
              listas.push({ ...grupo[j], lat: r.lat, lng: r.lng });
            } else {
              sinGeo++;
            }
          });
        }
      }
      if (listas.length === 0) {
        setMensajePantallas({
          tipo: "error",
          texto: "Ninguna pantalla quedó con coordenadas (geocodificación fallida).",
        });
        return;
      }

      const supabase = createClient();
      const LOTE_UP = 500;
      let hecho = 0;
      for (let i = 0; i < listas.length; i += LOTE_UP) {
        const grupo = listas.slice(i, i + LOTE_UP).map((p) => ({ ...p, lote }));
        const { error } = await supabase.rpc("admin_upsert_screens", {
          p_pantallas: grupo,
        });
        if (error) {
          throw new Error(
            /row-level security/i.test(error.message)
              ? "Tu usuario no tiene rol admin: no puede cargar datos."
              : error.message
          );
        }
        hecho += grupo.length;
        setProgresoPantallas({ hecho, total: listas.length });
        setMensajePantallas({
          tipo: "info",
          texto: `Cargando pantallas: ${hecho.toLocaleString("es-MX")} de ${listas.length.toLocaleString("es-MX")}…`,
        });
      }

      const avisos = [
        correcciones.lngCorregidas > 0
          ? `${correcciones.lngCorregidas} longitudes corregidas a oeste`
          : null,
        correcciones.coordsSeparadas > 0
          ? `${correcciones.coordsSeparadas} pares lat,lng separados`
          : null,
        correcciones.descartadas + correcciones.sinClave > 0
          ? `${correcciones.descartadas + correcciones.sinClave} filas descartadas`
          : null,
        sinGeo > 0 ? `${sinGeo} direcciones no geocodificadas` : null,
      ].filter(Boolean);
      setMensajePantallas({
        tipo: "ok",
        texto: `Listo: ${listas.length.toLocaleString("es-MX")} pantallas en el lote "${lote}" (${deteccion})${avisos.length > 0 ? ` · ${avisos.join(" · ")}` : ""}. Ya aparecen en la pestaña OOH.`,
      });
      setLotePantallas("");
      if (inputPantallasRef.current) inputPantallasRef.current.value = "";
      await cargarResumen();
    } catch (e) {
      setMensajePantallas({
        tipo: "error",
        texto: e instanceof Error ? e.message : "Error al cargar el inventario",
      });
    } finally {
      setCargandoPantallas(false);
      setProgresoPantallas(null);
    }
  }

  // ---- tope diario de celdas: editable, vive en app_config (la RPC
  //      consumir_cuota lo lee de ahí en cada consulta)
  async function guardarTopeCeldas() {
    const tope = parseInt(topeCeldas, 10);
    if (!Number.isFinite(tope) || tope < 1 || tope > 1000000) {
      setMensajeTope({ tipo: "error", texto: "Escribe un tope válido (1 a 1,000,000)." });
      return;
    }
    setGuardandoTope(true);
    setMensajeTope(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("app_config")
      .upsert({ clave: "cuotas", valor: { tope_celdas_dia: tope }, updated_at: new Date().toISOString() });
    if (error) {
      setMensajeTope({
        tipo: "error",
        texto: /row-level security/i.test(error.message)
          ? "Tu usuario no tiene rol admin."
          : error.message,
      });
    } else {
      setMensajeTope({
        tipo: "ok",
        texto: `Tope guardado: ${tope.toLocaleString("es-MX")} celdas/día por usuario (aplica de inmediato; los admin siguen sin límite).`,
      });
    }
    setGuardandoTope(false);
  }

  async function borrarLotePantallas(lote: string) {
    const supabase = createClient();
    const { error } = await supabase.from("screens").delete().eq("lote", lote);
    if (error) {
      setMensajePantallas({ tipo: "error", texto: `No se pudo borrar: ${error.message}` });
    } else {
      setMensajePantallas({ tipo: "ok", texto: `Lote "${lote}" eliminado del inventario` });
      await cargarResumen();
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
      setMensajeCp({
        tipo: "ok",
        texto: `CPs de la entidad ${entidad} eliminados`,
      });
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

          {/* carga de polígonos de códigos postales */}
          <div className="tarjeta glow-cian px-6 py-6">
            <h2 className="font-display text-xl font-extrabold tracking-tight text-white">
              Cargar polígonos de códigos postales
            </h2>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
              Sube el shapefile de CPs de una entidad (
              <span className="text-zinc-300">.shp + .dbf + .prj</span>) del
              dataset oficial de Correos de México en datos.gob.mx
              (&quot;códigos postales, coordenadas y colonias&quot;): campo{" "}
              <span className="text-zinc-300">d_codigo</span>, proyección
              Mexico_ITRF2008_LCC — la reproyección a WGS84 es automática.
              La carga es acumulativa por entidad y habilita el modo de
              búsqueda &quot;Por código postal&quot;.
            </p>

            <div className="mt-4 flex gap-2">
              <select
                value={entidadCp}
                onChange={(e) => setEntidadCp(e.target.value)}
                className={`${inputCls} w-56`}
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
                className={`${inputCls} file:mr-3 file:rounded file:border-0 file:bg-cian/20 file:px-3 file:py-1 file:font-mono file:text-[11px] file:text-cian`}
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
                  className={`rounded-full border px-2.5 py-0.5 ${
                    archivo
                      ? "border-emerald-400/50 text-emerald-400"
                      : "border-linea text-zinc-600"
                  }`}
                >
                  {archivo ? "✓" : "○"} {etiqueta as string}
                </span>
              ))}
              <span
                className={`rounded-full border px-2.5 py-0.5 ${
                  entidadCp
                    ? "border-emerald-400/50 text-emerald-400"
                    : "border-linea text-zinc-600"
                }`}
              >
                {entidadCp ? "✓" : "○"} entidad
              </span>
            </div>

            <button
              onClick={cargarCps}
              disabled={!listoParaCargarCp || cargandoCp}
              className="mt-4 w-full rounded-md bg-cian px-3 py-2.5 font-display text-sm font-extrabold text-fondo transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {cargandoCp ? "Cargando…" : "Cargar polígonos de CP"}
            </button>

            {progresoCp && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fondo">
                <div
                  className="h-full rounded-full bg-cian transition-all"
                  style={{ width: `${Math.round((progresoCp.hecho / progresoCp.total) * 100)}%` }}
                />
              </div>
            )}
            {mensajeCp && (
              <p
                className={`mt-3 font-mono text-[11px] leading-relaxed ${
                  mensajeCp.tipo === "ok"
                    ? "text-emerald-400"
                    : mensajeCp.tipo === "error"
                      ? "text-magenta"
                      : "text-zinc-400"
                }`}
              >
                {mensajeCp.texto}
              </p>
            )}

            {resumenCps.length > 0 && (
              <table className="mt-4 w-full text-left font-mono text-xs">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Entidades con CPs cargados</th>
                    <th className="py-1.5 pr-3 text-right font-medium">CPs</th>
                    <th className="py-1.5 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {resumenCps.map((r) => (
                    <tr key={r.entidad} className="border-t border-linea/60">
                      <td className="py-2 pr-3">
                        {r.entidad} · {NOMBRES_ENTIDAD[r.entidad] ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right text-cian">
                        {r.cps.toLocaleString("es-MX")}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => borrarEntidadCp(r.entidad)}
                          disabled={cargandoCp}
                          className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:border-magenta hover:text-magenta disabled:opacity-40"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* catálogo CP → colonias */}
            <div className="mt-5 border-t border-linea pt-4">
              <h3 className="font-display text-sm font-extrabold text-white">
                Catálogo de colonias (CP → colonia)
              </h3>
              <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
                Sube el txt/csv del Catálogo Nacional de Códigos Postales de
                Correos de México (columnas d_codigo, d_asenta, D_mnpio,
                d_estado; nacional o por entidad). Alimenta el popup del mapa
                con colonias, municipio y estado.
                {totalColonias !== null && (
                  <span className="text-zinc-300">
                    {" "}
                    Hoy: {totalColonias.toLocaleString("es-MX")} colonias.
                  </span>
                )}
              </p>
              <input
                ref={inputColoniasRef}
                type="file"
                accept=".txt,.csv"
                disabled={cargandoColonias}
                onChange={(e) => cargarCatalogoColonias(e.target.files?.[0])}
                className={`${inputCls} mt-3 file:mr-3 file:rounded file:border-0 file:bg-cian/20 file:px-3 file:py-1 file:font-mono file:text-[11px] file:text-cian`}
              />
              {progresoColonias && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fondo">
                  <div
                    className="h-full rounded-full bg-cian transition-all"
                    style={{ width: `${Math.round((progresoColonias.hecho / progresoColonias.total) * 100)}%` }}
                  />
                </div>
              )}
              {mensajeColonias && (
                <p
                  className={`mt-3 font-mono text-[11px] leading-relaxed ${
                    mensajeColonias.tipo === "ok"
                      ? "text-emerald-400"
                      : mensajeColonias.tipo === "error"
                        ? "text-magenta"
                        : "text-zinc-400"
                  }`}
                >
                  {mensajeColonias.texto}
                </p>
              )}
            </div>
          </div>

          {/* localidades rurales (ITER 2020) */}
          <div className="tarjeta glow-magenta px-6 py-6">
            <h2 className="font-display text-xl font-extrabold tracking-tight text-white">
              Cargar localidades rurales (ITER)
            </h2>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
              Sube el CSV nacional procesado del ITER 2020 (INEGI):
              localidades rurales <span className="text-zinc-300">&lt;2,500 hab</span>{" "}
              como puntos con población — complementan a los AGEBs urbanos
              en el cálculo de universos (pueblos, barrancas, localidades
              pequeñas). Columnas:{" "}
              <span className="text-zinc-300">
                entidad, nom_ent, mun, nom_mun, loc, nom_loc, lng, lat,
                pobtot, pobfem, pobmas, p_18ymas, p_18a24, p_60ymas, vivtot,
                tvivhab
              </span>{" "}
              (lng/lat en grados decimales WGS84; confidenciales de INEGI
              como celda vacía). No hay doble conteo: las urbanas ya están
              en los AGEBs.
              {resumenRural && resumenRural.total > 0 && (
                <span className="text-zinc-300">
                  {" "}
                  Hoy: {resumenRural.total.toLocaleString("es-MX")} localidades
                  de {resumenRural.entidades} entidades ·{" "}
                  {resumenRural.poblacion.toLocaleString("es-MX")} habitantes.
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
                className={`${inputCls} file:mr-3 file:rounded file:border-0 file:bg-magenta/20 file:px-3 file:py-1 file:font-mono file:text-[11px] file:text-magenta`}
              />
              {resumenRural && resumenRural.total > 0 && (
                <button
                  onClick={borrarLocalidadesRurales}
                  disabled={cargandoRural}
                  className="shrink-0 rounded border border-linea bg-panel2 px-3 py-1 font-mono text-[11px] text-zinc-500 transition-colors hover:border-magenta hover:text-magenta disabled:opacity-40"
                >
                  Eliminar todas
                </button>
              )}
            </div>
            {progresoRural && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fondo">
                <div
                  className="h-full rounded-full bg-magenta transition-all"
                  style={{ width: `${Math.round((progresoRural.hecho / progresoRural.total) * 100)}%` }}
                />
              </div>
            )}
            {mensajeRural && (
              <p
                className={`mt-3 font-mono text-[11px] leading-relaxed ${
                  mensajeRural.tipo === "ok"
                    ? "text-emerald-400"
                    : mensajeRural.tipo === "error"
                      ? "text-magenta"
                      : "text-zinc-400"
                }`}
              >
                {mensajeRural.texto}
              </p>
            )}
          </div>

          {/* inventario de pantallas OOH */}
          <div className="tarjeta glow-violeta px-6 py-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-extrabold tracking-tight text-white">
                  Cargar inventario de pantallas (OOH)
                </h2>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
                  Sube el CSV/Excel del inventario de pantallas — columnas
                  detectadas automáticamente:{" "}
                  <span className="text-zinc-300">
                    clave, nombre, latitud/longitud (o dirección a
                    geocodificar), tipo, medio/vendor, ciudad,
                    digital/estática, impresiones mensuales, costo
                  </span>
                  . También acepta el export de sitios DOOH tal cual (
                  <span className="text-zinc-300">
                    Site ID, Site name, Site location (city), Site
                    latitude/longitude, Screen network, Site max impressions
                    capacity
                  </span>
                  ). La carga es acumulativa con upsert por clave y alimenta
                  el cruce pantalla ↔ PDV de la pestaña OOH.
                </p>
              </div>
              <button
                onClick={descargarPlantillaPantallas}
                className="shrink-0 rounded-md border border-linea bg-panel2 px-3 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-violeta hover:text-violeta"
              >
                ⬇ Descargar plantilla de pantallas
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={lotePantallas}
                onChange={(e) => setLotePantallas(e.target.value)}
                placeholder="Nombre del lote (default: nombre del archivo)"
                className={`${inputCls} w-72`}
                disabled={cargandoPantallas}
              />
              <input
                ref={inputPantallasRef}
                type="file"
                accept=".csv,.txt,.xls,.xlsx"
                disabled={cargandoPantallas}
                onChange={(e) => cargarPantallas(e.target.files?.[0])}
                className={`${inputCls} file:mr-3 file:rounded file:border-0 file:bg-violeta/20 file:px-3 file:py-1 file:font-mono file:text-[11px] file:text-violeta`}
              />
            </div>
            {progresoPantallas && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fondo">
                <div
                  className="h-full rounded-full bg-violeta transition-all"
                  style={{ width: `${Math.round((progresoPantallas.hecho / progresoPantallas.total) * 100)}%` }}
                />
              </div>
            )}
            {mensajePantallas && (
              <p
                className={`mt-3 font-mono text-[11px] leading-relaxed ${
                  mensajePantallas.tipo === "ok"
                    ? "text-emerald-400"
                    : mensajePantallas.tipo === "error"
                      ? "text-magenta"
                      : "text-zinc-400"
                }`}
              >
                {mensajePantallas.texto}
              </p>
            )}

            {resumenPantallas.length > 0 && (
              <table className="mt-4 w-full text-left font-mono text-xs">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Lote</th>
                    <th className="py-1.5 pr-3 font-medium">Por tipo</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Pantallas</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Ciudades</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Impresiones/mes</th>
                    <th className="py-1.5 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {resumenPantallas.map((r) => (
                    <tr key={r.lote} className="border-t border-linea/60">
                      <td className="max-w-[180px] truncate py-2 pr-3" title={r.lote}>
                        {r.lote}
                      </td>
                      <td className="py-2 pr-3 text-zinc-400">
                        {Object.entries(r.tipos ?? {})
                          .sort((a, b) => b[1] - a[1])
                          .map(([t, n]) => `${etiquetaTipoPantalla(t)} ${n}`)
                          .join(" · ")}
                      </td>
                      <td className="py-2 pr-3 text-right text-violeta">
                        {r.total.toLocaleString("es-MX")}
                        {r.digitales > 0 && (
                          <span className="ml-1 text-zinc-500">
                            ({r.digitales} dig)
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right text-zinc-400">
                        {r.ciudades}
                      </td>
                      <td className="py-2 pr-3 text-right text-zinc-400">
                        {r.impresiones > 0
                          ? Number(r.impresiones).toLocaleString("es-MX")
                          : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => borrarLotePantallas(r.lote)}
                          disabled={cargandoPantallas}
                          className="rounded border border-linea bg-panel2 px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:border-magenta hover:text-magenta disabled:opacity-40"
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

          {/* consumo de la API + tope diario de celdas */}
          <div className="tarjeta glow-cian px-6 py-6">
            <h2 className="font-display text-xl font-extrabold tracking-tight text-white">
              Consumo de la API y tope diario
            </h2>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
              Cada celda de censo/lote es una consulta a Google. El tope
              diario por usuario protege la cuota — edítalo aquí con datos
              reales del consumo (los admin no tienen límite). Los usuarios
              ven su saldo antes de ejecutar y, al toparlo, el avance queda
              guardado y se reanuda al día siguiente.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <label className="font-mono text-[11px] text-zinc-400">
                Tope de celdas/día por usuario
              </label>
              <input
                type="number"
                min={1}
                value={topeCeldas}
                onChange={(e) => setTopeCeldas(e.target.value)}
                placeholder="2500"
                className={`${inputCls} w-32`}
              />
              <button
                onClick={guardarTopeCeldas}
                disabled={guardandoTope}
                className="shrink-0 rounded-md bg-cian px-4 py-2 font-display text-xs font-extrabold text-fondo transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {guardandoTope ? "Guardando…" : "Guardar tope"}
              </button>
            </div>
            {mensajeTope && (
              <p
                className={`mt-2 font-mono text-[11px] ${
                  mensajeTope.tipo === "ok" ? "text-emerald-400" : "text-magenta"
                }`}
              >
                {mensajeTope.texto}
              </p>
            )}

            {consumo.length > 0 && (
              <table className="mt-4 w-full text-left font-mono text-xs">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Usuario</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Celdas hoy</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Búsq. hoy</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Celdas mes</th>
                    <th className="py-1.5 text-right font-medium">Búsq. mes</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {consumo.map((c) => (
                    <tr key={c.user_id} className="border-t border-linea/60">
                      <td className="max-w-[220px] truncate py-2 pr-3" title={c.email}>
                        {c.nombre ?? c.email}
                        {c.rol === "admin" && (
                          <span className="ml-1.5 text-violeta">· admin (sin límite)</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right text-cian">
                        {c.celdas_hoy.toLocaleString("es-MX")}
                      </td>
                      <td className="py-2 pr-3 text-right text-zinc-400">
                        {c.busquedas_hoy.toLocaleString("es-MX")}
                      </td>
                      <td className="py-2 pr-3 text-right text-violeta">
                        {c.celdas_mes.toLocaleString("es-MX")}
                      </td>
                      <td className="py-2 text-right text-zinc-400">
                        {c.busquedas_mes.toLocaleString("es-MX")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {consumo.length === 0 && (
              <p className="mt-3 font-mono text-[11px] text-zinc-600">
                Sin consumo registrado todavía (el consumo de los admin no se
                contabiliza).
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
                        {(r.sin_censo ?? 0) > 0 && (
                          <span
                            className="ml-2 text-amber-400"
                            title="AGEBs sin datos censales (solo geometría): vuelve a subir el RESAGEBURB de esta entidad"
                          >
                            ⚠ {r.sin_censo!.toLocaleString("es-MX")} sin censo
                          </span>
                        )}
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
