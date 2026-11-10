"use client";

// VISTA "PUNTOS" de un levantamiento (dentro del plan): la tabla de
// PDVs con las columnas del Export data, ordenable, con buscador y
// paginada. Cada fila se puede BORRAR (✕ o selección múltiple): el
// punto deja de contar para todo el plan — internamente queda como
// `estado: excluido` con usuario y fecha, y vive en la pestaña
// "Borrados (N)" con "Restaurar". Las señales de revisión (cerrado
// según Google, posible duplicado a < 75 m, nombre sin la marca) solo
// marcan la fila. Borrar/restaurar dispara el recálculo automático del
// plan (lo orquesta PlannerView): 0 consultas a Google.

import { useEffect, useMemo, useRef, useState } from "react";
import { formatoCiudad } from "@/lib/geo";
import {
  cambiarEstadoPuntos,
  cargarPuntosCrudosSurvey,
  NOTA_DETALLE_PUNTO,
  type PuntoSurvey,
} from "@/lib/planner";
import {
  calcularSenales,
  estadoNegocio,
  ligaGoogleMaps,
  RADIO_DUPLICADO_M,
  terminosMarcaDe,
  type ClaveSenal,
  type SenalPunto,
} from "@/lib/senales-puntos";
import { createClient } from "@/lib/supabase/client";
import type { LatLng, PerfilUsuario, RolLevantamiento } from "@/lib/types";

export interface SurveyDePuntos {
  id: string;
  nombre: string;
  rol: RolLevantamiento;
  color: string;
  configuracion: Record<string, unknown>;
  activos: number;
  excluidos: number;
}

const POR_PAGINA = 100;
const fmt = (n: number) => n.toLocaleString("es-MX");

type Columna =
  | "nombre"
  | "direccion"
  | "ciudad"
  | "lat"
  | "lng"
  | "estado"
  | "tipos"
  | "universo"
  | "nse"
  | "pct";

const ORDEN_NSE = ["AB", "C+", "C", "C-", "D+", "DE"];

const ESTILO_SENAL: Record<ClaveSenal, string> = {
  cerrado: "border-magenta/50 bg-magenta/10 text-magenta",
  duplicado: "border-amber-500/50 bg-amber-500/10 text-amber-600",
  marca: "border-violeta/50 bg-violeta/10 text-violeta",
};

const tiposDe = (f: PuntoSurvey) =>
  ((f.metadata?.types as string[] | undefined) ?? []).join(", ");

export default function PuntosSurvey({
  surveys,
  surveyId,
  onSurvey,
  usuario,
  marcaCliente,
  recalculando,
  refresco,
  onCambio,
  onFoco,
  onDetalle,
  detallando,
}: {
  /** Levantamientos con puntos de la sección activa. */
  surveys: SurveyDePuntos[];
  surveyId: string;
  onSurvey: (id: string) => void;
  usuario: PerfilUsuario | null;
  /** Nombre del cliente: marca de respaldo de las listas cargadas. */
  marcaCliente: string | null;
  /** Recálculo automático del plan en curso (texto), o null. */
  recalculando: string | null;
  /** Sube cuando el detalle por punto se calculó fuera: recarga. */
  refresco: number;
  /** Se borraron/restauraron puntos de este survey. */
  onCambio: (surveyId: string) => void;
  onFoco: (p: LatLng) => void;
  /** Calcula el universo individual de los puntos que falten. */
  onDetalle: (surveyId: string) => void;
  detallando: string | null;
}) {
  const survey = surveys.find((s) => s.id === surveyId) ?? null;
  const [filas, setFilas] = useState<PuntoSurvey[] | null>(null);
  const [pestana, setPestana] = useState<"activos" | "borrados">("activos");
  const [busqueda, setBusqueda] = useState("");
  const [soloSenales, setSoloSenales] = useState(false);
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({
    col: "nombre",
    asc: true,
  });
  const [pagina, setPagina] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [nombres, setNombres] = useState<Record<string, string>>({});
  /** Cada borrado/restauración local sube la versión: una recarga que
   * empezó antes ya no pisa el estado optimista. */
  const version = useRef(0);

  useEffect(() => {
    let vivo = true;
    setFilas(null);
    setSeleccion(new Set());
    setPagina(0);
    setPestana("activos");
    setBusqueda("");
    setSoloSenales(false);
    setError("");
    (async () => {
      const todos = await cargarPuntosCrudosSurvey(surveyId, "todos");
      if (vivo) setFilas(todos);
    })();
    return () => {
      vivo = false;
    };
  }, [surveyId]);

  // recarga silenciosa (detalle por punto recién calculado)
  useEffect(() => {
    if (refresco === 0) return;
    let vivo = true;
    const v = version.current;
    (async () => {
      const todos = await cargarPuntosCrudosSurvey(surveyId, "todos");
      if (vivo && v === version.current) setFilas(todos);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresco]);

  // quién borró cada punto (pestaña Borrados)
  useEffect(() => {
    const faltan = Array.from(
      new Set(
        (filas ?? [])
          .map((f) => f.excluido_por)
          .filter((id): id is string => !!id && !(id in nombres))
      )
    );
    if (faltan.length === 0) return;
    let vivo = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, nombre, email")
        .in("id", faltan);
      if (!vivo) return;
      const nuevo: Record<string, string> = {};
      for (const id of faltan) nuevo[id] = "";
      for (const p of (data ?? []) as {
        id: string;
        nombre: string | null;
        email: string | null;
      }[]) {
        nuevo[p.id] = p.nombre ?? p.email ?? "";
      }
      setNombres((prev) => ({ ...prev, ...nuevo }));
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas]);

  const marca = useMemo(
    () =>
      terminosMarcaDe(
        survey?.configuracion ?? null,
        survey?.rol ?? "proximidad",
        marcaCliente
      ),
    [survey?.configuracion, survey?.rol, marcaCliente]
  );
  const senales = useMemo(
    () => calcularSenales(filas ?? [], marca),
    [filas, marca]
  );
  const senalesDe = (f: PuntoSurvey): SenalPunto[] =>
    senales.get(f.id ?? f.place_id) ?? [];

  const activos = useMemo(
    () => (filas ?? []).filter((f) => f.estado !== "excluido"),
    [filas]
  );
  const borrados = useMemo(
    () => (filas ?? []).filter((f) => f.estado === "excluido"),
    [filas]
  );
  /** % del universo: peso del punto sobre la suma de individuales de
   * los ACTIVOS — la misma base del Excel. */
  const sumaIndividual = useMemo(
    () => activos.reduce((t, f) => t + (f.universo_individual ?? 0), 0),
    [activos]
  );
  const pctDe = (f: PuntoSurvey): number | null =>
    f.estado !== "excluido" && f.universo_individual != null && sumaIndividual > 0
      ? (100 * f.universo_individual) / sumaIndividual
      : null;

  const base = pestana === "activos" ? activos : borrados;
  const conSenales = base.filter((f) => senalesDe(f).length > 0).length;
  const sinDetalle = activos.filter((f) => f.universo_individual == null).length;

  const visibles = useMemo(() => {
    const q = busqueda
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    const limpio = (t: string) =>
      t
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
    const filtradas = base.filter(
      (f) =>
        (!q || limpio(f.nombre).includes(q)) &&
        (!soloSenales || senalesDe(f).length > 0)
    );
    const valor = (f: PuntoSurvey): string | number | null => {
      switch (orden.col) {
        case "nombre":
          return limpio(f.nombre);
        case "direccion":
          return f.direccion ? limpio(f.direccion) : null;
        case "ciudad": {
          const c = formatoCiudad(f.municipio, f.entidad);
          return c === "—" ? null : limpio(c);
        }
        case "lat":
          return f.lat;
        case "lng":
          return f.lng;
        case "estado": {
          const e = estadoNegocio(f.metadata?.business_status).etiqueta;
          return e === "—" ? null : e;
        }
        case "tipos":
          return tiposDe(f) || null;
        case "universo":
          return f.universo_individual ?? null;
        case "nse": {
          const i = ORDEN_NSE.indexOf(f.nse_dominante ?? "");
          return i === -1 ? null : i;
        }
        case "pct":
          return pctDe(f);
      }
    };
    // los vacíos siempre al final, en cualquier dirección
    return [...filtradas].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      const d =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "es");
      return orden.asc ? d : -d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, busqueda, soloSenales, orden, senales, sumaIndividual]);

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, paginas - 1);
  const enPagina = visibles.slice(
    paginaActual * POR_PAGINA,
    (paginaActual + 1) * POR_PAGINA
  );
  const idsPagina = enPagina
    .map((f) => f.id)
    .filter((id): id is number => id != null);
  const todaLaPagina =
    idsPagina.length > 0 && idsPagina.every((id) => seleccion.has(id));

  /** Borrar (→ excluido) o restaurar (→ activo): optimista; si la base
   * lo rechaza, las filas regresan a como estaban. */
  async function cambiar(ids: number[], estado: "activo" | "excluido") {
    if (ids.length === 0) return;
    setError("");
    version.current++;
    const set = new Set(ids);
    const ahora = new Date().toISOString();
    setFilas((prev) =>
      (prev ?? []).map((f) =>
        f.id != null && set.has(f.id)
          ? {
              ...f,
              estado,
              excluido_en: estado === "excluido" ? ahora : null,
              excluido_por: estado === "excluido" ? (usuario?.id ?? null) : null,
            }
          : f
      )
    );
    setSeleccion((prev) => {
      const nuevo = new Set(prev);
      ids.forEach((id) => nuevo.delete(id));
      return nuevo;
    });
    try {
      await cambiarEstadoPuntos(surveyId, ids, estado, usuario?.id ?? null);
      onCambio(surveyId);
    } catch (e) {
      const vuelta = estado === "excluido" ? "activo" : "excluido";
      setFilas((prev) =>
        (prev ?? []).map((f) =>
          f.id != null && set.has(f.id) ? { ...f, estado: vuelta } : f
        )
      );
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el cambio"
      );
    }
  }

  const cambiarPestana = (p: "activos" | "borrados") => {
    setPestana(p);
    setSeleccion(new Set());
    setPagina(0);
    setSoloSenales(false);
  };

  const encabezado = (col: Columna, texto: string, derecha = false) => (
    <th
      className={`whitespace-nowrap px-2.5 py-2 font-medium ${derecha ? "text-right" : ""}`}
    >
      <button
        onClick={() => {
          setOrden((o) =>
            o.col === col ? { col, asc: !o.asc } : { col, asc: true }
          );
          setPagina(0);
        }}
        className={`transition-colors hover:text-texto-primario ${
          orden.col === col ? "text-texto-primario" : ""
        }`}
        title={`Ordenar por ${texto.toLowerCase()}`}
      >
        {texto}
        {orden.col === col ? (orden.asc ? " ▴" : " ▾") : ""}
      </button>
    </th>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* levantamiento (cuando la sección tiene varios) */}
      {surveys.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {surveys.map((s) => (
            <button
              key={s.id}
              onClick={() => onSurvey(s.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-body text-[11px] transition-colors ${
                s.id === surveyId
                  ? "border-linea2 bg-superficie-hover text-texto-primario"
                  : "border-linea bg-panel text-texto-terciario hover:text-texto-secundario"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="max-w-[200px] truncate">{s.nombre}</span>
              <span className="font-mono text-[10px] text-texto-terciario">
                {fmt(s.activos)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* pestañas + buscador + filtros + acción por lote */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-control border border-linea">
          <button
            onClick={() => cambiarPestana("activos")}
            className={`px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
              pestana === "activos"
                ? "bg-superficie-hover text-texto-primario"
                : "bg-panel text-texto-terciario hover:text-texto-secundario"
            }`}
          >
            Puntos ({fmt(activos.length)})
          </button>
          <button
            onClick={() => cambiarPestana("borrados")}
            className={`border-l border-linea px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
              pestana === "borrados"
                ? "bg-superficie-hover text-texto-primario"
                : "bg-panel text-texto-terciario hover:text-texto-secundario"
            }`}
          >
            Borrados ({fmt(borrados.length)})
          </button>
        </div>
        <input
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPagina(0);
          }}
          placeholder="Buscar por nombre…"
          className="w-56 rounded-control border border-linea bg-panel2 px-3 py-1.5 font-body text-xs text-texto-primario placeholder:text-texto-terciario focus:border-cian focus:outline-none"
        />
        <button
          onClick={() => {
            setSoloSenales((v) => !v);
            setPagina(0);
          }}
          disabled={conSenales === 0 && !soloSenales}
          className={`rounded-full border px-3 py-1 font-body text-[11px] transition-colors disabled:opacity-40 ${
            soloSenales
              ? "border-amber-500/60 bg-amber-500/10 text-amber-600"
              : "border-linea bg-panel2 text-texto-secundario hover:text-texto-primario"
          }`}
          title={`Solo las filas con señales de revisión: cerrado según Google, otro punto a menos de ${RADIO_DUPLICADO_M} m o nombre sin la marca buscada`}
        >
          Con señales ({fmt(conSenales)})
        </button>
        {seleccion.size > 0 &&
          (pestana === "activos" ? (
            <button
              onClick={() => cambiar(Array.from(seleccion), "excluido")}
              className="rounded-control border border-magenta bg-magenta/10 px-3 py-1.5 font-body text-xs font-semibold text-magenta transition-colors hover:bg-magenta/20"
            >
              Borrar seleccionados ({fmt(seleccion.size)})
            </button>
          ) : (
            <button
              onClick={() => cambiar(Array.from(seleccion), "activo")}
              className="rounded-control border border-exito bg-exito/10 px-3 py-1.5 font-body text-xs font-semibold text-exito transition-colors hover:bg-exito/20"
            >
              Restaurar seleccionados ({fmt(seleccion.size)})
            </button>
          ))}
        {recalculando && (
          <span className="font-mono text-[11px] text-violeta">
            ⟳ Recalculando… {recalculando}
          </span>
        )}
        {pestana === "activos" && sinDetalle > 0 && filas !== null && (
          <button
            onClick={() => onDetalle(surveyId)}
            disabled={detallando !== null}
            className="ml-auto rounded-control border border-linea bg-panel2 px-3 py-1.5 font-body text-[11px] text-texto-secundario transition-colors hover:border-cian hover:text-cian disabled:opacity-50"
            title="Universo 18+ y NSE del radio individual de los puntos que aún no lo tienen — PostGIS propio, gratis"
          >
            {detallando
              ? `⟳ ${detallando}`
              : `Calcular universo individual (${fmt(sinDetalle)} sin dato)`}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 font-mono text-[11px] text-magenta">{error}</p>
      )}

      {/* tabla */}
      <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-control border border-linea">
        {filas === null ? (
          <p className="px-3 py-6 text-center font-body text-xs text-texto-terciario">
            Cargando los puntos…
          </p>
        ) : visibles.length === 0 ? (
          <p className="px-3 py-6 text-center font-body text-xs text-texto-terciario">
            {base.length === 0
              ? pestana === "borrados"
                ? "No hay puntos borrados en este levantamiento."
                : "Este levantamiento no tiene puntos activos."
              : "Ningún punto coincide con el filtro."}
          </p>
        ) : (
          <table className="w-full text-left font-body text-xs">
            <thead className="sticky top-0 z-10 bg-panel2 text-texto-terciario">
              <tr>
                <th className="px-2.5 py-2">
                  <input
                    type="checkbox"
                    checked={todaLaPagina}
                    onChange={(e) =>
                      setSeleccion((prev) => {
                        const nuevo = new Set(prev);
                        idsPagina.forEach((id) =>
                          e.target.checked ? nuevo.add(id) : nuevo.delete(id)
                        );
                        return nuevo;
                      })
                    }
                    className="accent-magenta"
                    title="Seleccionar las filas de esta página"
                  />
                </th>
                {encabezado("nombre", "Nombre")}
                {encabezado("direccion", "Dirección")}
                {encabezado("ciudad", "Municipio / Entidad")}
                {encabezado("lat", "Lat", true)}
                {encabezado("lng", "Lng", true)}
                {encabezado("estado", "Estado (Google)")}
                {encabezado("tipos", "Tipos")}
                {encabezado("universo", "Universo 18+ individual", true)}
                {encabezado("nse", "NSE", true)}
                {encabezado("pct", "% del universo", true)}
                <th className="px-2.5 py-2 font-medium">Verificar</th>
                <th className="sticky right-0 bg-panel2 px-2.5 py-2 text-right font-medium shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)]">
                  {pestana === "activos" ? "Borrar" : "Borrado"}
                </th>
              </tr>
            </thead>
            <tbody className="bg-panel text-texto-primario">
              {enPagina.map((f) => {
                const estado = estadoNegocio(f.metadata?.business_status);
                const tipos = tiposDe(f);
                const ciudad = formatoCiudad(f.municipio, f.entidad);
                const pct = pctDe(f);
                const marcado = f.id != null && seleccion.has(f.id);
                return (
                  <tr
                    key={f.id ?? f.place_id}
                    onClick={() => onFoco({ lat: f.lat, lng: f.lng })}
                    className={`group cursor-pointer border-t border-linea/60 transition-colors ${
                      marcado ? "bg-superficie-hover" : "hover:bg-superficie-hover/60"
                    }`}
                    title="Clic para ubicarlo en el mapa"
                  >
                    <td className="px-2.5 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={marcado}
                        disabled={f.id == null}
                        onChange={(e) =>
                          setSeleccion((prev) => {
                            const nuevo = new Set(prev);
                            if (f.id == null) return nuevo;
                            if (e.target.checked) nuevo.add(f.id);
                            else nuevo.delete(f.id);
                            return nuevo;
                          })
                        }
                        className="accent-magenta"
                      />
                    </td>
                    <td className="max-w-[260px] px-2.5 py-1.5">
                      <span className="block truncate" title={f.nombre}>
                        {f.nombre}
                      </span>
                      {senalesDe(f).length > 0 && (
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {senalesDe(f).map((s) => (
                            <span
                              key={s.clave}
                              title={s.detalle}
                              className={`cursor-help rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${ESTILO_SENAL[s.clave]}`}
                            >
                              {s.etiqueta}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td
                      className="max-w-[240px] truncate px-2.5 py-1.5 text-texto-secundario"
                      title={f.direccion ?? ""}
                    >
                      {f.direccion || "—"}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-texto-secundario">
                      {ciudad}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono text-[11px] text-texto-secundario">
                      {f.lat.toFixed(5)}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono text-[11px] text-texto-secundario">
                      {f.lng.toFixed(5)}
                    </td>
                    <td
                      className={`whitespace-nowrap px-2.5 py-1.5 ${
                        estado.cerrado ? "text-magenta" : "text-texto-secundario"
                      }`}
                    >
                      {estado.etiqueta}
                    </td>
                    <td
                      className="max-w-[180px] truncate px-2.5 py-1.5 text-texto-terciario"
                      title={tipos}
                    >
                      {tipos || "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono text-cian">
                      {f.universo_individual != null
                        ? fmt(f.universo_individual)
                        : "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono text-violeta">
                      {f.nse_dominante ?? "—"}
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-mono text-texto-secundario">
                      {pct != null
                        ? `${pct.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`
                        : "—"}
                    </td>
                    <td
                      className="whitespace-nowrap px-2.5 py-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <a
                        href={ligaGoogleMaps(f)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cian underline-offset-2 hover:underline"
                      >
                        Ver en Google Maps ↗
                      </a>
                    </td>
                    <td
                      className={`sticky right-0 whitespace-nowrap px-2.5 py-1.5 text-right shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)] ${
                        marcado ? "bg-superficie-hover" : "bg-panel"
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {pestana === "activos" ? (
                        <button
                          onClick={() => f.id != null && cambiar([f.id], "excluido")}
                          disabled={f.id == null}
                          className="rounded border border-linea bg-panel2 px-2 py-0.5 text-texto-terciario transition-colors hover:border-magenta hover:text-magenta"
                          title="Borrar: el punto deja de contar para universos, consolidado, traslapes, mapa, PDF y Excel (se puede restaurar desde Borrados)"
                          aria-label={`Borrar ${f.nombre}`}
                        >
                          ✕
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[10px] text-texto-terciario">
                            {f.excluido_en
                              ? new Date(f.excluido_en).toLocaleDateString("es-MX", {
                                  dateStyle: "medium",
                                })
                              : ""}
                            {f.excluido_por
                              ? ` · ${
                                  f.excluido_por === usuario?.id
                                    ? "tú"
                                    : nombres[f.excluido_por] || "el equipo"
                                }`
                              : ""}
                          </span>
                          <button
                            onClick={() => f.id != null && cambiar([f.id], "activo")}
                            disabled={f.id == null}
                            className="rounded border border-exito/60 bg-exito/10 px-2 py-0.5 text-[11px] font-semibold text-exito transition-colors hover:bg-exito/20"
                            title="Restaurar: el punto vuelve a contar para todo el plan"
                          >
                            Restaurar
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* pie: paginación + nota */}
      <div className="mt-1.5 flex flex-wrap items-center gap-3 font-body text-[10px] text-texto-terciario">
        {visibles.length > POR_PAGINA && (
          <span className="inline-flex items-center gap-1.5">
            <button
              onClick={() => setPagina(Math.max(0, paginaActual - 1))}
              disabled={paginaActual === 0}
              className="rounded border border-linea bg-panel2 px-2 py-0.5 text-texto-secundario hover:text-texto-primario disabled:opacity-40"
            >
              ‹ Anterior
            </button>
            <span className="font-mono">
              {fmt(paginaActual * POR_PAGINA + 1)}–
              {fmt(Math.min(visibles.length, (paginaActual + 1) * POR_PAGINA))} de{" "}
              {fmt(visibles.length)}
            </span>
            <button
              onClick={() => setPagina(Math.min(paginas - 1, paginaActual + 1))}
              disabled={paginaActual >= paginas - 1}
              className="rounded border border-linea bg-panel2 px-2 py-0.5 text-texto-secundario hover:text-texto-primario disabled:opacity-40"
            >
              Siguiente ›
            </button>
          </span>
        )}
        <span className="min-w-0 flex-1 leading-relaxed">
          {pestana === "activos"
            ? `Borrar un punto lo saca de universos, consolidado, traslapes, NSE, edades, mapa, PDF y Excel — el plan recalcula solo, sin consultas a Google. ${
                sumaIndividual > 0 ? NOTA_DETALLE_PUNTO : ""
              }`
            : "Los borrados no cuentan para nada del plan. Restaurar los regresa tal cual y el plan recalcula solo."}
        </span>
      </div>
    </div>
  );
}
