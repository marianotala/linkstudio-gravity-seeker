"use client";

// Panel de universos demográficos — SIEMPRE visible junto a los
// resultados. Fuente: Censo 2020 INEGI por AGEB urbana; el índice
// socioeconómico es un proxy censal aproximado, no NSE AMAI.

import type { Universos } from "@/lib/types";

const fmt = (n: number) => n.toLocaleString("es-MX");

function Mini({
  etiqueta,
  valor,
  detalle,
  color,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  color: string;
}) {
  return (
    <div className="min-w-0 border-r border-linea px-4 py-1 last:border-r-0">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
        {etiqueta}
      </p>
      <p className={`mt-0.5 font-display text-lg font-extrabold leading-none ${color}`}>
        {valor}
      </p>
      {detalle && (
        <p className="mt-0.5 truncate font-mono text-[9px] text-zinc-600">
          {detalle}
        </p>
      )}
    </div>
  );
}

export default function UniversosPanel({
  universos,
}: {
  universos: Universos | null;
}) {
  return (
    <div className="shrink-0 border-b border-linea bg-panel2/50">
      {!universos ? (
        <p className="px-5 py-2 font-mono text-[10px] text-zinc-600">
          Universos demográficos: corre una búsqueda para calcular la
          población cubierta por tus geocercas (Censo 2020 INEGI).
        </p>
      ) : !universos.disponible ? (
        <p className="px-5 py-2 font-mono text-[10px] text-amber-400/80">
          {universos.mensaje ?? "Universos no disponibles para esta zona."}
        </p>
      ) : (
        <div>
          <div className="flex items-stretch overflow-x-auto px-1 py-1.5">
            <Mini
              etiqueta="Universo residencial"
              valor={fmt(universos.residencial!.poblacion)}
              detalle={`${fmt(universos.residencial!.adultos18)} de 18+`}
              color="text-white"
            />
            <Mini
              etiqueta="Direccionable estimado"
              valor={fmt(universos.direccionable!.dispositivos)}
              detalle={`18+ × ${universos.direccionable!.factorSmartphone} × ${universos.direccionable!.factorMatch}`}
              color="text-cian"
            />
            <Mini
              etiqueta="NSE proxy prom."
              valor={
                universos.perfil!.nseProxy !== null
                  ? String(universos.perfil!.nseProxy)
                  : "—"
              }
              detalle="proxy censal, no AMAI"
              color="text-violeta"
            />
            <Mini
              etiqueta="Edades"
              valor={`${universos.perfil!.pct18a24 ?? "—"}% · ${universos.perfil!.pct60ymas ?? "—"}%`}
              detalle="18-24 · 60+"
              color="text-emerald-400"
            />
            <Mini
              etiqueta="Viviendas"
              valor={fmt(universos.residencial!.viviendas)}
              detalle={`${universos.agebs} AGEBs`}
              color="text-amber-400"
            />
          </div>
          <p className="border-t border-linea/50 px-5 py-1 font-mono text-[9px] text-zinc-600">
            {universos.fuente}
          </p>
        </div>
      )}
    </div>
  );
}
