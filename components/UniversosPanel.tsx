"use client";

// Panel de universos demográficos — SIEMPRE visible junto a los
// resultados. Fuente: Censo 2020 INEGI por AGEB urbana; el índice
// socioeconómico es un proxy censal aproximado, no NSE AMAI.
//
// Tarjetas: Universo (adultos 18+), Universo alcanzable, NSE
// (distribución por nivel) y Edades (rangos reales del censo: INEGI
// no publica 25-34/35-44/45-54/55-64 a nivel AGEB, así que se
// muestran 18-24, 25-59, 60-64 y 65+). Hogares, sexo, ocupantes y la
// tabla por AGEB viven en el desglose "Ver detalle completo".

import { useState } from "react";
import type { Universos } from "@/lib/types";
import { clasificarNse, NIVELES_NSE } from "@/lib/nse";
import { rangosEdadEstandar } from "@/lib/edades";

const fmt = (n: number) => n.toLocaleString("es-MX");
const fmtPct = (n: number) => `${n.toLocaleString("es-MX")}%`;

function Tarjeta({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-[180px] flex-1 border-r border-linea px-4 py-2 last:border-r-0">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
        {etiqueta}
      </p>
      {children}
    </div>
  );
}

/**
 * Barra apilada horizontal + leyenda de porcentajes debajo. La usan
 * NSE y Edades para que ambas distribuciones se lean igual.
 */
function BarraApilada({
  segmentos,
}: {
  segmentos: { etiqueta: string; pct: number; color: string }[];
}) {
  return (
    <div className="mt-1.5">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-fondo">
        {segmentos.map(
          (s) =>
            s.pct > 0 && (
              <div
                key={s.etiqueta}
                style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                title={`${s.etiqueta} ${fmtPct(s.pct)}`}
              />
            )
        )}
      </div>
      <p className="mt-1 font-mono text-[9px] leading-relaxed text-zinc-400">
        {segmentos.map((s, i) => (
          <span key={s.etiqueta}>
            {i > 0 && <span className="text-zinc-700"> · </span>}
            <span style={{ color: s.color }}>{s.etiqueta}</span>{" "}
            {fmtPct(s.pct)}
          </span>
        ))}
      </p>
    </div>
  );
}

export default function UniversosPanel({
  universos,
  notaTerritorio = false,
}: {
  universos: Universos | null;
  /** Con capas activas: el universo es del TERRITORIO, no de los POIs. */
  notaTerritorio?: boolean;
}) {
  const [detalle, setDetalle] = useState(false);

  if (!universos) {
    return (
      <div className="shrink-0 border-b border-linea bg-panel2/50">
        <p className="px-5 py-2 font-mono text-[10px] text-zinc-600">
          Universos demográficos: corre una búsqueda para calcular la
          población cubierta por tus geocercas (Censo 2020 INEGI).
        </p>
      </div>
    );
  }
  if (!universos.disponible) {
    return (
      <div className="shrink-0 border-b border-linea bg-panel2/50">
        <p className="px-5 py-2 font-mono text-[10px] text-amber-400/80">
          {universos.mensaje ?? "Universos no disponibles para esta zona."}
        </p>
      </div>
    );
  }

  const residencial = universos.residencial!;
  const direccionable = universos.direccionable!;
  const perfil = universos.perfil!;
  // seis rangos estándar de medios; 25-64 estimado con estructura
  // nacional porque INEGI no publica quinquenios adultos por AGEB
  // (detalle en lib/edades.ts)
  const rangosEdad = rangosEdadEstandar(perfil.edades);
  const promOcupantes =
    residencial.viviendas > 0
      ? Math.round((residencial.poblacion / residencial.viviendas) * 10) / 10
      : null;
  const pctFem =
    residencial.pobfem != null && residencial.poblacion > 0
      ? Math.round((100 * residencial.pobfem) / residencial.poblacion)
      : null;
  const porAgeb = universos.porAgeb ?? [];

  return (
    <div className="shrink-0 border-b border-linea bg-panel2/50">
      <div className="flex items-stretch overflow-x-auto px-1 py-1.5">
        <Tarjeta etiqueta="Universo">
          <p className="mt-0.5 font-display text-xl font-extrabold leading-none text-white">
            {fmt(residencial.adultos18)}
          </p>
          <p className="mt-1 truncate font-mono text-[9px] text-zinc-500">
            Total con menores: {fmt(residencial.poblacion)}
          </p>
        </Tarjeta>

        <Tarjeta etiqueta="Universo alcanzable">
          <p className="mt-0.5 font-display text-xl font-extrabold leading-none text-cian">
            {fmt(direccionable.dispositivos)}
          </p>
          <p className="mt-1 truncate font-mono text-[9px] text-zinc-500">
            adultos con acceso a publicidad digital
          </p>
        </Tarjeta>

        <Tarjeta etiqueta="NSE">
          {perfil.nseDist ? (
            <BarraApilada
              segmentos={NIVELES_NSE.map((n) => ({
                etiqueta: n.etiqueta,
                pct: perfil.nseDist![n.clave],
                color: n.color,
              }))}
            />
          ) : (
            <p className="mt-0.5 font-display text-xl font-extrabold leading-none text-violeta">
              {perfil.nseProxy !== null ? perfil.nseProxy : "—"}
            </p>
          )}
          <p className="mt-0.5 font-mono text-[9px] text-zinc-600">
            proxy censal, no AMAI
          </p>
        </Tarjeta>

        <Tarjeta etiqueta="Edades">
          {rangosEdad ? (
            <BarraApilada segmentos={rangosEdad} />
          ) : (
            <p className="mt-0.5 font-display text-xl font-extrabold leading-none text-emerald-400">
              —
            </p>
          )}
          <p className="mt-0.5 font-mono text-[9px] text-zinc-600">
            % del universo 18+ · 25-64 estimado (estructura nacional)
          </p>
        </Tarjeta>
      </div>

      <div className="flex items-center justify-between border-t border-linea/50 px-5 py-1">
        <p className="font-mono text-[9px] text-zinc-600">
          Censo 2020 INEGI ·{" "}
          {fmt(universos.agebs ?? porAgeb.length)} zonas censales analizadas
          {universos.criterio && ` · ${universos.criterio}`}
          {notaTerritorio && (
            <span className="text-zinc-500">
              {" "}
              · universo del territorio, compartido por todas las capas
            </span>
          )}
        </p>
        <button
          onClick={() => setDetalle((d) => !d)}
          className="font-mono text-[9px] text-zinc-500 transition-colors hover:text-cian"
        >
          {detalle ? "Ocultar detalle ▴" : "Ver detalle completo ▾"}
        </button>
      </div>

      {detalle && (
        <div className="border-t border-linea/50 px-5 py-2.5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[10px] sm:grid-cols-4">
            <div>
              <p className="text-zinc-500">Hogares</p>
              <p className="text-zinc-200">{fmt(residencial.viviendas)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Mujeres</p>
              <p className="text-zinc-200">
                {residencial.pobfem != null
                  ? `${fmt(residencial.pobfem)}${pctFem !== null ? ` (${pctFem}%)` : ""}`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Hombres</p>
              <p className="text-zinc-200">
                {residencial.pobmas != null
                  ? `${fmt(residencial.pobmas)}${pctFem !== null ? ` (${100 - pctFem}%)` : ""}`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Ocupantes por vivienda</p>
              <p className="text-zinc-200">
                {promOcupantes !== null
                  ? promOcupantes.toLocaleString("es-MX")
                  : "—"}
              </p>
            </div>
          </div>
          {residencial.pobfem == null && (
            <p className="mt-1 font-mono text-[9px] text-zinc-600">
              Sexo y rango 65+ requieren recargar la entidad en /admin
              (variables POBFEM/POBMAS/POB65_MAS).
            </p>
          )}

          {porAgeb.length > 0 && (
            <div className="mt-2.5 max-h-48 overflow-y-auto rounded-md border border-linea/60">
              <table className="w-full text-left font-mono text-[10px]">
                <thead className="sticky top-0 bg-panel2 text-zinc-500">
                  <tr>
                    <th className="px-2.5 py-1.5 font-medium">Zona censal (AGEB)</th>
                    <th className="px-2.5 py-1.5 text-right font-medium">
                      Población en zona
                    </th>
                    <th className="px-2.5 py-1.5 text-right font-medium">NSE</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {porAgeb.map((a) => {
                    const nivel = clasificarNse(a.nse_proxy);
                    return (
                      <tr key={a.cvegeo} className="border-t border-linea/40">
                        <td className="px-2.5 py-1">{a.cvegeo}</td>
                        <td className="px-2.5 py-1 text-right">
                          {fmt(a.poblacion)}
                        </td>
                        <td className="px-2.5 py-1 text-right">
                          {nivel ? (
                            <span style={{ color: nivel.color }}>
                              {nivel.etiqueta}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {(universos.agebs ?? 0) > porAgeb.length && porAgeb.length > 0 && (
            <p className="mt-1 font-mono text-[9px] text-zinc-600">
              Mostrando las {fmt(porAgeb.length)} zonas con más población de{" "}
              {fmt(universos.agebs!)}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
