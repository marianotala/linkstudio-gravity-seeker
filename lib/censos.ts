// Frescura de censos (solo aplica a censos de fuente Google).
// Umbrales configurables por variables de entorno públicas.

export const DIAS_VERDE =
  parseInt(process.env.NEXT_PUBLIC_CENSO_VERDE_DIAS ?? "", 10) || 30;
export const DIAS_AMARILLO =
  parseInt(process.env.NEXT_PUBLIC_CENSO_AMARILLO_DIAS ?? "", 10) || 90;

export type Frescura = "verde" | "amarillo" | "rojo";

export function diasDesde(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/** Semáforo de frescura para censos Google: verde <30d, amarillo 30-90d, rojo >90d. */
export function frescuraCenso(iso: string): Frescura {
  const dias = diasDesde(iso);
  if (dias < DIAS_VERDE) return "verde";
  if (dias <= DIAS_AMARILLO) return "amarillo";
  return "rojo";
}

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    dateStyle: "medium",
  });
}
