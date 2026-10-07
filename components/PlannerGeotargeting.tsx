"use client";

// SECCIÓN GEO-TARGETING del plan: automatiza la táctica de campaña
// geolocalizada por CPs + keyword targeting en el DSP. Dos insumos:
// (1) la lista de CPs cuyo polígono intersecta los radios de los PDVs
//     (PostGIS local, 0 consultas a APIs externas), y
// (2) el bulk de keywords clasificado en marca/industria/competencia
//     (IA con el contexto del plan — PROPUESTA EDITABLE, no data de
//     volumen de búsqueda).
// El resultado se guarda como survey rol 'geotargeting' (reabrible y
// re-ejecutable) y se exporta a xlsx/CSV listos para Simpli.fi/Eskimi.

import { useMemo, useState } from "react";
import RecolectorPuntos, { type PuntoRecolectado } from "./RecolectorPuntos";
import { Ayuda, Boton, Chip, MensajeError } from "./ui";
import {
  calcularCpsPorRadios,
  CANTIDADES_KEYWORDS,
  costoEstimadoKeywordsUsd,
  exportarBloqueCsv,
  exportarGeotargetingXlsx,
  generarBulkKeywords,
  guardarSurveyGeotargeting,
  MAX_CENTROS_GEO,
  RADIOS_GEOTARGETING,
  type BulkKeywords,
  type ConfigGeotargeting,
  type CpCobertura,
  type GrupoKeywords,
} from "@/lib/geotargeting";
import { cargarPuntosSurveys } from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";

const fmt = (n: number) => n.toLocaleString("es-MX");

export interface SurveyFuenteGeo {
  id: string;
  nombre: string;
  puntos: number;
}

export interface SurveyGeoGuardado {
  id: string;
  nombre: string;
  created_at: string;
  config: ConfigGeotargeting;
}

const ETIQUETA_GRUPO: Record<GrupoKeywords, string> = {
  marca: "Marca",
  industria: "Industria",
  competencia: "Competencia",
};

export default function PlannerGeotargeting({
  proyectoId,
  cliente,
  surveysFuente,
  surveysGeo,
  marcaSugerida,
  industriaSugerida,
  competidoresSugeridos,
  alGuardar,
  onCobertura,
}: {
  proyectoId: string;
  cliente: string;
  /** Levantamientos con puntos, usables como orígenes. */
  surveysFuente: SurveyFuenteGeo[];
  /** Geo-targetings guardados en el plan (reabrir / eliminar). */
  surveysGeo: SurveyGeoGuardado[];
  marcaSugerida: string;
  industriaSugerida: string;
  /** Pre-cargados de las marcas censadas en Competencia (editables). */
  competidoresSugeridos: string[];
  alGuardar: () => void | Promise<void>;
  /** Pinta los polígonos de cobertura en el mapa del plan. */
  onCobertura: (cps: CpCobertura[] | null, color?: string) => void;
}) {
  // ---- a) orígenes + b) radio
  const [fuente, setFuente] = useState<string>(
    surveysFuente[0]?.id ?? "manual"
  );
  const [puntosManuales, setPuntosManuales] = useState<PuntoRecolectado[]>([]);
  const [radio, setRadio] = useState(3000);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState("");
  const [nota, setNota] = useState("");

  // ---- c) resultado
  const [cps, setCps] = useState<CpCobertura[] | null>(null);
  const [origenDesc, setOrigenDesc] = useState("");
  const [centrosUsados, setCentrosUsados] = useState<{ lat: number; lng: number }[]>([]);
  /** Survey reabierto: Guardar actualiza en vez de crear otro. */
  const [surveyAbierto, setSurveyAbierto] = useState<string | null>(null);

  // ---- 2) generador de keywords (IA)
  const [marca, setMarca] = useState(marcaSugerida);
  const [industria, setIndustria] = useState(industriaSugerida);
  const [competidores, setCompetidores] = useState<string[]>(competidoresSugeridos);
  const [compInput, setCompInput] = useState("");
  const [cantidad, setCantidad] = useState<number>(300);
  const [generando, setGenerando] = useState(false);
  const [keywords, setKeywords] = useState<BulkKeywords | null>(null);
  const [tab, setTab] = useState<GrupoKeywords>("marca");
  const [kwManual, setKwManual] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState<string | null>(null);

  const totalKeywords = keywords
    ? keywords.marca.length + keywords.industria.length + keywords.competencia.length
    : 0;

  /** Plazas para keywords locales: los municipios dominantes de la cobertura. */
  const ciudades = useMemo(() => {
    if (!cps) return [];
    const conteo = new Map<string, number>();
    for (const c of cps) {
      if (c.municipio) conteo.set(c.municipio, (conteo.get(c.municipio) ?? 0) + 1);
    }
    return Array.from(conteo.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([m]) => m);
  }, [cps]);

  async function calcular() {
    setCalculando(true);
    setError("");
    setNota("");
    try {
      let centros: { lat: number; lng: number }[];
      let desc: string;
      if (fuente === "manual") {
        centros = puntosManuales.map((p) => ({ lat: p.lat, lng: p.lng }));
        desc = `${centros.length} puntos recolectados`;
      } else {
        const mapa = await cargarPuntosSurveys([fuente]);
        const pts = mapa.get(fuente) ?? [];
        centros = pts.map((p) => ({ lat: p.lat, lng: p.lng }));
        desc = `${centros.length} puntos de "${surveysFuente.find((s) => s.id === fuente)?.nombre ?? "levantamiento"}"`;
      }
      if (centros.length === 0) {
        setError(
          fuente === "manual"
            ? "Recolecta al menos un punto (buscador o Excel/CSV)."
            : "Ese levantamiento no tiene puntos."
        );
        return;
      }
      if (centros.length > MAX_CENTROS_GEO) {
        setNota(
          `El levantamiento trae ${fmt(centros.length)} puntos; se usaron los primeros ${fmt(MAX_CENTROS_GEO)}.`
        );
        centros = centros.slice(0, MAX_CENTROS_GEO);
      }
      const resultado = await calcularCpsPorRadios(centros, radio);
      setCps(resultado);
      setCentrosUsados(centros);
      setOrigenDesc(desc);
      setSurveyAbierto(null);
      onCobertura(resultado);
      if (resultado.length === 0) {
        setError(
          "Ningún CP intersecta esos radios. Si la zona debería tener CPs, probablemente falta cargar los polígonos de esa entidad en Admin → Data de geolocalización."
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron calcular los CPs");
    } finally {
      setCalculando(false);
    }
  }

  async function generar() {
    if (!marca.trim() || !industria.trim()) {
      setError("El generador necesita la marca y la categoría/industria.");
      return;
    }
    setGenerando(true);
    setError("");
    try {
      const { keywords: kw } = await generarBulkKeywords({
        marca: marca.trim(),
        industria: industria.trim(),
        competidores,
        cantidad: cantidad as 100 | 300 | 500,
        ciudades,
      });
      setKeywords(kw);
      setTab("marca");
    } catch (e) {
      setError(e instanceof Error ? e.message : "El generador de keywords falló");
    } finally {
      setGenerando(false);
    }
  }

  async function guardar() {
    if (!cps) return;
    setGuardando(true);
    setError("");
    try {
      const config: ConfigGeotargeting = {
        nombre: `Geo-Targeting ${radio >= 1000 ? `${radio / 1000} km` : `${radio} m`} · ${cps.length} CPs`,
        radio,
        origen: origenDesc,
        origenSurveyId: fuente !== "manual" ? fuente : null,
        centros: fuente === "manual" ? centrosUsados : undefined,
        cps: cps.map((c) => ({ cp: c.codigo_postal, municipio: c.municipio })),
        keywords,
        kwParams: {
          marca: marca.trim(),
          industria: industria.trim(),
          competidores,
          ciudades,
          cantidad,
        },
        generado_en: new Date().toISOString(),
      };
      await guardarSurveyGeotargeting(proyectoId, config, surveyAbierto);
      setNota(
        surveyAbierto
          ? "Geo-Targeting actualizado en el plan."
          : "Geo-Targeting guardado al plan — reabrible y re-ejecutable."
      );
      await alGuardar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  /** Reabre un geo-targeting guardado: restaura el formulario y
   * re-consulta las geometrías (gratis) para pintar el mapa. */
  async function reabrir(s: SurveyGeoGuardado) {
    setError("");
    setNota("");
    const cfg = s.config;
    setRadio(cfg.radio ?? 3000);
    if (cfg.origenSurveyId) setFuente(cfg.origenSurveyId);
    if (cfg.kwParams) {
      setMarca(cfg.kwParams.marca ?? marcaSugerida);
      setIndustria(cfg.kwParams.industria ?? industriaSugerida);
      setCompetidores(cfg.kwParams.competidores ?? competidoresSugeridos);
      if (cfg.kwParams.cantidad) setCantidad(cfg.kwParams.cantidad);
    }
    setKeywords(cfg.keywords ?? null);
    setSurveyAbierto(s.id);
    setOrigenDesc(cfg.origen ?? "");
    setCalculando(true);
    try {
      let centros = cfg.centros ?? [];
      if (cfg.origenSurveyId) {
        const mapa = await cargarPuntosSurveys([cfg.origenSurveyId]);
        centros = (mapa.get(cfg.origenSurveyId) ?? []).map((p) => ({
          lat: p.lat,
          lng: p.lng,
        }));
      }
      if (centros.length > 0) {
        const resultado = await calcularCpsPorRadios(
          centros.slice(0, MAX_CENTROS_GEO),
          cfg.radio
        );
        setCps(resultado);
        setCentrosUsados(centros.slice(0, MAX_CENTROS_GEO));
        onCobertura(resultado);
      } else {
        setCps(null);
        setNota("El origen de este geo-targeting ya no existe: vuelve a calcular.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reabrir");
    } finally {
      setCalculando(false);
    }
  }

  async function eliminar(id: string) {
    const supabase = createClient();
    const { error: e } = await supabase.from("surveys").delete().eq("id", id);
    if (e) setError(`No se pudo eliminar: ${e.message}`);
    else {
      if (surveyAbierto === id) setSurveyAbierto(null);
      setEliminando(null);
      await alGuardar();
    }
  }

  function quitarKeyword(grupo: GrupoKeywords, k: string) {
    if (!keywords) return;
    setKeywords({ ...keywords, [grupo]: keywords[grupo].filter((x) => x !== k) });
  }

  function agregarKeyword() {
    const limpio = kwManual.toLowerCase().replace(/\s+/g, " ").trim();
    if (!limpio || limpio.length < 3) return;
    const base: BulkKeywords = keywords ?? { marca: [], industria: [], competencia: [] };
    if (base[tab].includes(limpio)) {
      setKwManual("");
      return;
    }
    setKeywords({ ...base, [tab]: [...base[tab], limpio] });
    setKwManual("");
  }

  const agregarCompetidor = () => {
    const limpio = compInput.trim();
    if (!limpio) return;
    if (!competidores.some((c) => c.toLowerCase() === limpio.toLowerCase())) {
      setCompetidores([...competidores, limpio]);
    }
    setCompInput("");
  };

  const costoUsd = costoEstimadoKeywordsUsd(cantidad);

  return (
    <div className="space-y-4">
      {error && <MensajeError mensaje={error} onCerrar={() => setError("")} />}
      {nota && (
        <p className="rounded-control border border-exito/50 bg-exito/10 px-3.5 py-2 font-body text-xs text-texto-primario">
          {nota}
        </p>
      )}

      {/* ---------- 1 · cobertura de CPs ---------- */}
      <div className="rounded-tarjeta border border-linea bg-panel2/40 p-4">
        <p className="font-body text-[13px] font-semibold text-texto-primario">
          1 · Cobertura de códigos postales
          <Ayuda>
            Todos los CPs cuyo polígono intersecta los radios de tus PDVs —
            consulta local sobre los polígonos de Correos de México, sin APIs
            externas (operación gratuita). La lista va directo al DSP.
          </Ayuda>
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-body text-[11px] font-medium text-texto-secundario">
              Orígenes (PDVs)
            </span>
            <select
              value={fuente}
              onChange={(e) => setFuente(e.target.value)}
              className="campo"
            >
              {surveysFuente.map((s) => (
                <option key={s.id} value={s.id}>
                  Usar puntos de “{s.nombre}” ({fmt(s.puntos)})
                </option>
              ))}
              <option value="manual">Recolectar nuevos (buscador / Excel)</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-body text-[11px] font-medium text-texto-secundario">
              Radio de cobertura
            </span>
            <span className="flex items-center gap-1.5">
              {RADIOS_GEOTARGETING.map((r) => (
                <button
                  key={r.m}
                  onClick={() => setRadio(r.m)}
                  className={`rounded-chip border px-2.5 py-1 font-body text-xs transition-colors duration-rapida ${
                    radio === r.m
                      ? "border-cian bg-cian/10 text-cian"
                      : "border-linea bg-panel2 text-texto-secundario hover:border-linea2"
                  }`}
                >
                  {r.label}
                </button>
              ))}
              <input
                type="number"
                min={100}
                max={20000}
                value={radio}
                onChange={(e) => setRadio(Number(e.target.value) || 100)}
                className="campo w-24"
                title="Metros (personalizado)"
              />
            </span>
          </label>
        </div>

        {fuente === "manual" && (
          <div className="mt-3">
            <RecolectorPuntos
              puntos={puntosManuales}
              onCambiar={setPuntosManuales}
              disabled={calculando}
            />
          </div>
        )}

        <Boton
          variante="primario"
          className="mt-3 w-full"
          onClick={calcular}
          disabled={calculando}
        >
          {calculando
            ? "Calculando…"
            : "Calcular CPs de cobertura · 0 consultas a Google"}
        </Boton>

        {cps && cps.length > 0 && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip variante="exito">
                <span className="font-mono">{fmt(cps.length)}</span>&nbsp;CPs de
                cobertura
              </Chip>
              <span className="font-body text-[11px] text-texto-terciario">
                {origenDesc} · radio{" "}
                {radio >= 1000 ? `${radio / 1000} km` : `${radio} m`} · los
                polígonos están pintados en el mapa
              </span>
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto rounded-control border border-linea">
              <table className="w-full text-left font-body text-xs">
                <thead className="sticky top-0 bg-panel2 text-texto-terciario">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">CP</th>
                    <th className="px-3 py-1.5 font-medium">Colonias principales</th>
                    <th className="px-3 py-1.5 font-medium">Municipio</th>
                  </tr>
                </thead>
                <tbody className="text-texto-primario">
                  {cps.map((c) => (
                    <tr key={c.codigo_postal} className="border-t border-linea/60">
                      <td className="px-3 py-1.5 font-mono text-cian">
                        {c.codigo_postal}
                      </td>
                      <td className="max-w-[360px] truncate px-3 py-1.5 text-texto-secundario">
                        {(c.colonias ?? []).join(" · ") || "—"}
                        {(c.total_colonias ?? 0) > 3 &&
                          ` +${(c.total_colonias ?? 0) - 3}`}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-1.5">
                        {c.municipio ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ---------- 2 · bulk de keywords (IA) ---------- */}
      <div className="rounded-tarjeta border border-linea bg-panel2/40 p-4">
        <p className="font-body text-[13px] font-semibold text-texto-primario">
          2 · Bulk de keywords (IA)
          <Ayuda>
            Keywords en español de México clasificadas en marca / industria /
            competencia, generadas por IA con el contexto del plan. Son una
            PROPUESTA EDITABLE — no data de volumen de búsqueda (la
            validación con Keyword Planner/Semrush es fase futura). Los
            competidores vienen pre-cargados de las marcas censadas en la
            capa Competencia del plan.
          </Ayuda>
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-body text-[11px] font-medium text-texto-secundario">
              Marca del cliente
            </span>
            <input value={marca} onChange={(e) => setMarca(e.target.value)} className="campo" />
          </label>
          <label className="block">
            <span className="mb-1 block font-body text-[11px] font-medium text-texto-secundario">
              Categoría / industria
            </span>
            <input
              value={industria}
              onChange={(e) => setIndustria(e.target.value)}
              placeholder="p. ej. pizzerías / comida rápida"
              className="campo"
            />
          </label>
        </div>

        <div className="mt-2">
          <span className="mb-1 block font-body text-[11px] font-medium text-texto-secundario">
            Competidores (de la capa Competencia del plan — editables)
          </span>
          <div className="flex gap-2">
            <input
              value={compInput}
              onChange={(e) => setCompInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarCompetidor();
                }
              }}
              placeholder="Agregar competidor…"
              className="campo"
            />
            <Boton variante="secundario" compacto onClick={agregarCompetidor}>
              +
            </Boton>
          </div>
          {competidores.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {competidores.map((c) => (
                <Chip
                  key={c}
                  variante="exclusion"
                  onRemover={() =>
                    setCompetidores(competidores.filter((x) => x !== c))
                  }
                >
                  {c}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-body text-[11px] text-texto-secundario">Cantidad</span>
          {CANTIDADES_KEYWORDS.map((n) => (
            <button
              key={n}
              onClick={() => setCantidad(n)}
              className={`rounded-chip border px-2.5 py-1 font-body text-xs transition-colors duration-rapida ${
                cantidad === n
                  ? "border-violeta bg-violeta/10 text-violeta"
                  : "border-linea bg-panel2 text-texto-secundario hover:border-linea2"
              }`}
            >
              {n}
            </button>
          ))}
          <span className="font-body text-[11px] text-texto-terciario">
            · costo estimado{" "}
            <span className="font-mono text-texto-secundario">
              ~${(costoUsd * 100).toLocaleString("es-MX", { maximumFractionDigits: 1 })}¢ USD
            </span>{" "}
            (modelo económico)
          </span>
        </div>

        <Boton
          variante="secundario"
          className="mt-3 w-full"
          onClick={generar}
          disabled={generando}
        >
          {generando
            ? "Generando bulk…"
            : keywords
              ? "Volver a generar (reemplaza el bulk)"
              : "Generar bulk de keywords"}
        </Boton>

        {keywords && (
          <div className="mt-3">
            <div className="flex gap-1.5">
              {(Object.keys(ETIQUETA_GRUPO) as GrupoKeywords[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setTab(g)}
                  className={`rounded-chip border px-3 py-1 font-body text-xs transition-colors duration-rapida ${
                    tab === g
                      ? "border-linea bg-panel2 text-texto-primario"
                      : "border-transparent text-texto-secundario hover:text-texto-primario"
                  }`}
                >
                  {ETIQUETA_GRUPO[g]}{" "}
                  <span className="font-mono text-texto-terciario">
                    {keywords[g].length}
                  </span>
                </button>
              ))}
              <span className="ml-auto self-center font-body text-[11px] text-texto-terciario">
                {fmt(totalKeywords)} en total · propuesta editable generada por IA
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={kwManual}
                onChange={(e) => setKwManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    agregarKeyword();
                  }
                }}
                placeholder={`Agregar keyword a ${ETIQUETA_GRUPO[tab]}…`}
                className="campo"
              />
              <Boton variante="secundario" compacto onClick={agregarKeyword}>
                +
              </Boton>
            </div>
            <div className="mt-2 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto rounded-control border border-linea bg-fondo/40 p-2">
              {keywords[tab].map((k) => (
                <Chip
                  key={k}
                  variante={
                    tab === "marca"
                      ? "marca"
                      : tab === "industria"
                        ? "categoria"
                        : "exclusion"
                  }
                  onRemover={() => quitarKeyword(tab, k)}
                >
                  {k}
                </Chip>
              ))}
              {keywords[tab].length === 0 && (
                <span className="font-body text-[11px] text-texto-terciario">
                  Sin keywords en este grupo.
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ---------- 3 · guardar + export ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Boton
          variante="secundario"
          onClick={guardar}
          disabled={!cps || cps.length === 0 || guardando}
        >
          {guardando
            ? "Guardando…"
            : surveyAbierto
              ? "Actualizar en el plan"
              : "Guardar Geo-Targeting al plan"}
        </Boton>
        <Boton
          variante="secundario"
          onClick={() => exportarGeotargetingXlsx(cps ?? [], keywords, cliente)}
          disabled={!cps || cps.length === 0}
          title="Un xlsx con hoja CPs (lista limpia para el DSP) + 3 hojas de keywords"
        >
          ⤓ Export Geo-Targeting (.xlsx)
        </Boton>
        {(["cps", "marca", "industria", "competencia"] as const).map((b) => (
          <Boton
            key={b}
            variante="fantasma"
            compacto
            onClick={() => exportarBloqueCsv(b, cps ?? [], keywords, cliente)}
            disabled={b === "cps" ? !cps || cps.length === 0 : !keywords}
          >
            ↓ CSV {b === "cps" ? "CPs" : ETIQUETA_GRUPO[b]}
          </Boton>
        ))}
      </div>

      {/* ---------- geo-targetings guardados ---------- */}
      {surveysGeo.length > 0 && (
        <div className="rounded-tarjeta border border-linea bg-panel2/40 p-4">
          <p className="font-body text-[13px] font-semibold text-texto-primario">
            Guardados en el plan
          </p>
          <table className="mt-2 w-full text-left font-body text-xs">
            <tbody className="text-texto-primario">
              {surveysGeo.map((s) => (
                <tr key={s.id} className="border-t border-linea/60 first:border-t-0">
                  <td className="py-2 pr-3">{s.nombre}</td>
                  <td className="py-2 pr-3 font-mono text-texto-secundario">
                    {new Date(s.created_at).toLocaleDateString("es-MX", {
                      dateStyle: "medium",
                    })}
                  </td>
                  <td className="py-2 pr-3 text-texto-secundario">
                    {fmt(s.config.cps?.length ?? 0)} CPs
                    {s.config.keywords
                      ? ` · ${fmt(
                          s.config.keywords.marca.length +
                            s.config.keywords.industria.length +
                            s.config.keywords.competencia.length
                        )} keywords`
                      : ""}
                  </td>
                  <td className="py-2 text-right">
                    {eliminando === s.id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-body text-[11px] text-error">¿Eliminar?</span>
                        <Boton variante="fantasma" compacto onClick={() => eliminar(s.id)}>
                          Sí
                        </Boton>
                        <Boton variante="fantasma" compacto onClick={() => setEliminando(null)}>
                          No
                        </Boton>
                      </span>
                    ) : (
                      <span className="inline-flex gap-1">
                        <Boton variante="secundario" compacto onClick={() => reabrir(s)}>
                          Reabrir
                        </Boton>
                        <Boton
                          variante="fantasma"
                          compacto
                          onClick={() => setEliminando(s.id)}
                        >
                          ×
                        </Boton>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
