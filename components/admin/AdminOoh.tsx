"use client";

// MÓDULO "INVENTARIO OOH" (/admin/ooh): carga de pantallas (con su
// plantilla), inventarios cargados por lote (conteos por tipo, ciudad
// y medio; eliminar por lote) y resumen total con desglose por tipo.
// Misma lógica de parseo/geocodificación/upsert de siempre, movida
// aquí sin reescribirse.

import { useEffect, useRef, useState } from "react";
import { BarraProgreso, NotaCarga } from "./AdminData";
import { CifraAnimada } from "../ui";
import { createClient } from "@/lib/supabase/client";
import { etiquetaTipoPantalla } from "@/lib/ooh";
import {
  descargarPlantillaPantallas,
  parsearArchivoPantallas,
  type PantallaCarga,
} from "@/lib/parse";
import type { GeocodeResponse, ResumenLotePantallas } from "@/lib/types";

const fmt = (n: number) => n.toLocaleString("es-MX");

export default function AdminOoh() {
  const [resumenPantallas, setResumenPantallas] = useState<ResumenLotePantallas[]>([]);
  const [lotePantallas, setLotePantallas] = useState("");
  const [cargandoPantallas, setCargandoPantallas] = useState(false);
  const [progresoPantallas, setProgresoPantallas] = useState<{ hecho: number; total: number } | null>(null);
  const [mensajePantallas, setMensajePantallas] = useState<{ tipo: "ok" | "error" | "info"; texto: string } | null>(null);
  const inputPantallasRef = useRef<HTMLInputElement>(null);

  async function cargarResumen() {
    const supabase = createClient();
    const { data: pantallas } = await supabase.rpc("screens_resumen");
    setResumenPantallas(((pantallas ?? []) as ResumenLotePantallas[]) ?? []);
  }
  useEffect(() => {
    cargarResumen();
  }, []);

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
          texto: `Cargando pantallas: ${fmt(hecho)} de ${fmt(listas.length)}…`,
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
        texto: `Listo: ${fmt(listas.length)} pantallas en el lote "${lote}" (${deteccion})${avisos.length > 0 ? ` · ${avisos.join(" · ")}` : ""}. Ya aparecen en la pestaña OOH.`,
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

  // resumen total + desglose por tipo (agregado de todos los lotes)
  const totalPantallas = resumenPantallas.reduce((t, r) => t + (r.total ?? 0), 0);
  const totalDigitales = resumenPantallas.reduce((t, r) => t + (r.digitales ?? 0), 0);
  const porTipo = new Map<string, number>();
  for (const r of resumenPantallas) {
    for (const [tipo, n] of Object.entries(r.tipos ?? {})) {
      porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + n);
    }
  }

  return (
    <>
      {/* ---------- resumen del inventario ---------- */}
      <div className="tarjeta glow-ambar px-6 py-5">
        <h1 className="font-display text-xl font-bold tracking-tight text-texto-primario">
          Inventario OOH
        </h1>
        <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-texto-terciario">
              Pantallas
            </p>
            <p className="font-display text-2xl font-bold leading-none text-texto-primario">
              <CifraAnimada valor={totalPantallas} />
            </p>
          </div>
          <div className="font-body text-xs text-texto-secundario">
            {resumenPantallas.length}{" "}
            {resumenPantallas.length === 1 ? "lote" : "lotes"}
            {totalDigitales > 0 && (
              <>
                {" "}
                · <span className="font-mono">{fmt(totalDigitales)}</span>{" "}
                digitales
              </>
            )}
          </div>
          {porTipo.size > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-body text-xs text-texto-secundario">
              {Array.from(porTipo.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([t, n]) => (
                  <span key={t}>
                    {etiquetaTipoPantalla(t)}{" "}
                    <span className="font-mono text-texto-primario">{fmt(n)}</span>
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------- carga de inventario ---------- */}
      <div className="tarjeta px-6 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold tracking-tight text-texto-primario">
              Cargar inventario de pantallas
            </h2>
            <p className="mt-1 font-body text-xs leading-relaxed text-texto-secundario">
              Sube el CSV/Excel del inventario — columnas detectadas
              automáticamente:{" "}
              <span className="font-mono text-texto-primario">
                clave, nombre, latitud/longitud (o dirección a geocodificar),
                tipo, medio/vendor, ciudad, digital/estática, impresiones
                mensuales, costo
              </span>
              . También acepta el export de sitios DOOH tal cual (
              <span className="font-mono text-texto-primario">
                Site ID, Site name, Site location (city), Site
                latitude/longitude, Screen network, Site max impressions
                capacity
              </span>
              ). La carga es acumulativa con upsert por clave y alimenta el
              cruce pantalla ↔ PDV de la pestaña OOH.
            </p>
          </div>
          <button
            onClick={descargarPlantillaPantallas}
            className="btn-secundario shrink-0 !px-3 !py-1.5 !text-xs"
          >
            ⬇ Descargar plantilla
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={lotePantallas}
            onChange={(e) => setLotePantallas(e.target.value)}
            placeholder="Nombre del lote (default: nombre del archivo)"
            className="campo w-72"
            disabled={cargandoPantallas}
          />
          <input
            ref={inputPantallasRef}
            type="file"
            accept=".csv,.txt,.xls,.xlsx"
            disabled={cargandoPantallas}
            onChange={(e) => cargarPantallas(e.target.files?.[0])}
            className="campo file:mr-3 file:rounded file:border-0 file:bg-alerta/20 file:px-3 file:py-1 file:font-body file:text-[11px] file:text-alerta"
          />
        </div>
        <BarraProgreso progreso={progresoPantallas} colorCls="bg-alerta" />
        <NotaCarga mensaje={mensajePantallas} />

        {/* ---------- inventarios cargados (por lote) ---------- */}
        {resumenPantallas.length > 0 && (
          <table className="mt-4 w-full text-left font-body text-xs">
            <thead className="text-texto-terciario">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Lote</th>
                <th className="py-1.5 pr-3 font-medium">Por tipo</th>
                <th className="py-1.5 pr-3 text-right font-medium">Pantallas</th>
                <th className="py-1.5 pr-3 text-right font-medium">Ciudades</th>
                <th className="py-1.5 pr-3 text-right font-medium">Impresiones/mes</th>
                <th className="py-1.5 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="text-texto-primario">
              {resumenPantallas.map((r) => (
                <tr key={r.lote} className="border-t border-linea/60">
                  <td className="max-w-[180px] truncate py-2 pr-3" title={r.lote}>
                    {r.lote}
                  </td>
                  <td className="py-2 pr-3 text-texto-secundario">
                    {Object.entries(r.tipos ?? {})
                      .sort((a, b) => b[1] - a[1])
                      .map(([t, n]) => `${etiquetaTipoPantalla(t)} ${n}`)
                      .join(" · ")}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-violeta">
                    {fmt(r.total)}
                    {r.digitales > 0 && (
                      <span className="ml-1 text-texto-terciario">
                        ({r.digitales} dig)
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-texto-secundario">
                    {r.ciudades}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-texto-secundario">
                    {r.impresiones > 0
                      ? Number(r.impresiones).toLocaleString("es-MX")
                      : "—"}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => borrarLotePantallas(r.lote)}
                      disabled={cargandoPantallas}
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
    </>
  );
}
