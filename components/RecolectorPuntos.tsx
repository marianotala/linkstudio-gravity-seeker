"use client";

// RECOLECTOR de puntos (Planner, patrón "recolectar → calcular"):
// pieza compartida por las cuatro secciones. Dos vías siempre
// disponibles — buscador tipo Google Maps (Places Autocomplete, la
// misma pieza del modo consulta) y carga CSV/Excel (mismo parser con
// detección de columnas + geocodificación de direcciones) — y una
// lista unificada con el origen visible de cada punto (manual / excel
// / censo), eliminable individual o por grupo. El estado vive en el
// padre (se persiste como borrador del proyecto en plan_state).

import { useRef, useState } from "react";
import BuscadorLugar from "./BuscadorLugar";
import { geocodificarDirecciones } from "@/lib/busqueda-cliente";
import { descargarPlantillaOrigenes, parsearArchivo } from "@/lib/parse";
import type { Origin, Poi } from "@/lib/types";

/** Cómo llegó cada punto a la lista (visible y filtrable en la UI). */
export type ViaRecoleccion = "manual" | "excel" | "censo" | "proyecto";

export interface PuntoRecolectado extends Poi {
  via: ViaRecoleccion;
}

export const ETIQUETA_VIA: Record<ViaRecoleccion, string> = {
  manual: "buscados a mano",
  excel: "de archivo",
  censo: "de censo",
  proyecto: "del proyecto",
};

const COLOR_VIA: Record<ViaRecoleccion, string> = {
  manual: "#2fb9e8",
  excel: "#34d399",
  censo: "#f4368a",
  proyecto: "#9d5cf0",
};

const claveCoord = (lat: number, lng: number) =>
  `${lat.toFixed(6)},${lng.toFixed(6)}`;

/** Origin (autocomplete / archivo) → punto recolectado tipo Poi. */
export function origenARecolectado(
  o: Origin,
  via: ViaRecoleccion
): PuntoRecolectado {
  return {
    placeId: `${via}:${claveCoord(o.lat, o.lng)}`,
    nombre: o.nombre ?? "Punto sin nombre",
    direccion: o.direccion ?? "",
    lat: o.lat,
    lng: o.lng,
    types: [],
    distancia: 0,
    origenIdx: 0,
    fuente: "google",
    estrato: null,
    cp: null,
    capa: null,
    termino: null,
    categoria: null,
    via,
  };
}

/** Suma puntos a la lista, deduplicando por coordenada (~11 cm). */
export function sumarPuntos(
  lista: PuntoRecolectado[],
  nuevos: PuntoRecolectado[]
): { lista: PuntoRecolectado[]; duplicados: number } {
  const vistos = new Set(lista.map((p) => claveCoord(p.lat, p.lng)));
  const salida = [...lista];
  let duplicados = 0;
  for (const p of nuevos) {
    const k = claveCoord(p.lat, p.lng);
    if (vistos.has(k)) {
      duplicados++;
      continue;
    }
    vistos.add(k);
    salida.push(p);
  }
  return { lista: salida, duplicados };
}

export default function RecolectorPuntos({
  puntos,
  onCambiar,
  etiquetaPunto = "punto",
  etiquetaPuntos = "puntos",
  disabled = false,
  extraVias,
}: {
  puntos: PuntoRecolectado[];
  onCambiar: (puntos: PuntoRecolectado[]) => void;
  etiquetaPunto?: string;
  etiquetaPuntos?: string;
  disabled?: boolean;
  /** Controles adicionales junto a la carga (p. ej. "usar puntos de un
   * levantamiento del proyecto" en OOH). */
  extraVias?: React.ReactNode;
}) {
  const [nota, setNota] = useState("");
  const [cargando, setCargando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function agregarLugar(o: Origin) {
    const { lista, duplicados } = sumarPuntos(puntos, [
      origenARecolectado(o, "manual"),
    ]);
    onCambiar(lista);
    setNota(
      duplicados > 0
        ? `"${o.nombre}" ya estaba en la lista`
        : `"${o.nombre}" agregado — busca otro o sigue con la carga`
    );
  }

  async function onArchivo(file: File | undefined) {
    if (!file) return;
    setCargando(true);
    setNota(`Leyendo ${file.name}…`);
    try {
      const parseado = await parsearArchivo(file);
      let origenes = parseado.origenes;
      let fallidas = 0;
      if (parseado.direcciones.length > 0) {
        setNota(
          `Geocodificando ${parseado.direcciones.length.toLocaleString("es-MX")} direcciones…`
        );
        const geo = await geocodificarDirecciones(
          parseado.direcciones,
          (hechas, total) =>
            setNota(
              `Geocodificando direcciones: ${hechas.toLocaleString("es-MX")} de ${total.toLocaleString("es-MX")}…`
            )
        );
        origenes = [...origenes, ...geo.origenes];
        fallidas = geo.fallidas;
      }
      if (origenes.length === 0) {
        setNota(parseado.deteccion);
        return;
      }
      const { lista, duplicados } = sumarPuntos(
        puntos,
        origenes.map((o) => origenARecolectado(o, "excel"))
      );
      onCambiar(lista);
      const notas = [
        `${origenes.length.toLocaleString("es-MX")} ${etiquetaPuntos} de ${file.name}`,
        ...(duplicados > 0 ? [`${duplicados} ya estaban`] : []),
        ...(fallidas > 0 ? [`${fallidas} direcciones fallaron`] : []),
        ...(parseado.correcciones.lngCorregidas > 0
          ? [`${parseado.correcciones.lngCorregidas} longitudes corregidas a oeste`]
          : []),
      ];
      setNota(notas.join(" · "));
    } catch (e) {
      setNota(e instanceof Error ? e.message : "No pude leer el archivo");
    } finally {
      setCargando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const porVia = (via: ViaRecoleccion) => puntos.filter((p) => p.via === via);
  const quitarVia = (via: ViaRecoleccion) =>
    onCambiar(puntos.filter((p) => p.via !== via));
  const quitar = (placeId: string) =>
    onCambiar(puntos.filter((p) => p.placeId !== placeId));

  return (
    <div>
      {/* vía 1: buscador tipo Google Maps */}
      <BuscadorLugar onAgregar={agregarLugar} disabled={disabled || cargando} />

      {/* vía 2: CSV/Excel (+ vías extra de la sección) */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.txt"
          className="hidden"
          onChange={(e) => onArchivo(e.target.files?.[0])}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={disabled || cargando}
          className="rounded-md border border-linea bg-panel2 px-3 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-cian hover:text-cian disabled:opacity-40"
        >
          {cargando ? "Cargando…" : "Subir Excel / CSV"}
        </button>
        <button
          onClick={descargarPlantillaOrigenes}
          className="font-mono text-[10px] text-zinc-500 underline decoration-dotted hover:text-zinc-300"
        >
          plantilla
        </button>
        {extraVias}
      </div>
      {nota && <p className="mt-1.5 font-mono text-[10px] text-zinc-500">{nota}</p>}

      {/* lista unificada */}
      {puntos.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              {puntos.length.toLocaleString("es-MX")}{" "}
              {puntos.length === 1 ? etiquetaPunto : etiquetaPuntos} recolectados
            </span>
            {(["manual", "excel", "censo", "proyecto"] as ViaRecoleccion[]).map((via) => {
              const n = porVia(via).length;
              if (n === 0) return null;
              return (
                <button
                  key={via}
                  onClick={() => quitarVia(via)}
                  title={`Quitar los ${n} ${ETIQUETA_VIA[via]}`}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-linea bg-panel2 px-2 py-0.5 font-mono text-[10px] text-zinc-400 hover:border-magenta hover:text-magenta"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: COLOR_VIA[via] }}
                  />
                  {n.toLocaleString("es-MX")} {ETIQUETA_VIA[via]}
                  <span className="text-zinc-600 group-hover:text-magenta">×</span>
                </button>
              );
            })}
            <button
              onClick={() => onCambiar([])}
              className="font-mono text-[10px] text-zinc-600 underline decoration-dotted hover:text-magenta"
            >
              vaciar
            </button>
          </div>
          <div className="max-h-44 overflow-y-auto rounded-lg border border-linea bg-panel">
            {puntos.slice(0, 400).map((p) => (
              <div
                key={p.placeId}
                className="flex items-center gap-2 border-b border-linea/40 px-2.5 py-1 font-mono text-[11px] text-zinc-300 last:border-b-0"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: COLOR_VIA[p.via] }}
                  title={ETIQUETA_VIA[p.via]}
                />
                <span className="min-w-0 flex-1 truncate">
                  {p.nombre}
                  {p.direccion && (
                    <span className="ml-1.5 text-[10px] text-zinc-600">
                      {p.direccion}
                    </span>
                  )}
                </span>
                {p.capa && (
                  <span className="shrink-0 text-[9px] text-zinc-600">{p.capa}</span>
                )}
                <button
                  onClick={() => quitar(p.placeId)}
                  className="shrink-0 px-1 text-zinc-600 hover:text-magenta"
                  title="Quitar de la lista"
                >
                  ×
                </button>
              </div>
            ))}
            {puntos.length > 400 && (
              <p className="px-2.5 py-1 font-mono text-[10px] text-zinc-600">
                +{(puntos.length - 400).toLocaleString("es-MX")} más (los grupos
                de arriba los quitan en bloque)
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
