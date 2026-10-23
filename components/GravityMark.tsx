/* eslint-disable @next/next/no-img-element */
// Símbolo de Gravity (brand book V2): las dos medialunas en degradado
// magenta→morado→azul. Se usa el ASSET MAESTRO de /public/brand — el
// brand book prohíbe reconstruir las formas (no redondear puntas ni
// alterar el degradado), así que nada de SVG redibujado.

export default function GravityMark({ size = 30 }: { size?: number }) {
  return (
    <img
      src="/brand/gravity-simbolo.png"
      width={size}
      height={Math.round(size * 0.887)}
      alt="Gravity"
      style={{ display: "block", width: size, height: "auto" }}
    />
  );
}

/** Firma horizontal (símbolo + GRAVITY en negro) — para fondos claros,
 * la versión principal del brand book V2. */
export function GravityFirma({ height = 26 }: { height?: number }) {
  return (
    <img
      src="/brand/gravity-firma-negra.png"
      height={height}
      alt="Gravity"
      style={{ display: "block", height, width: "auto" }}
    />
  );
}
