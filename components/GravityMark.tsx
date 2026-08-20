// Isotipo de ondas de Gravity: seis arcos que irradian del centro
// hacia afuera — teal/cian a la izquierda, magenta/violeta a la derecha.

export default function GravityMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Gravity"
    >
      {/* ondas izquierdas (señal) */}
      <path
        d="M7 19.5 Q4.8 24 7 28.5"
        stroke="#17607f"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M12.5 14.5 Q9.2 24 12.5 33.5"
        stroke="#1e8ab4"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M19 9 Q14.6 24 19 39"
        stroke="#2fb9e8"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      {/* ondas derechas (POIs) */}
      <path
        d="M28.5 9 Q32.9 24 28.5 39"
        stroke="#f4368a"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <path
        d="M35 14.5 Q38.3 24 35 33.5"
        stroke="#9d5cf0"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M40.5 19.5 Q42.7 24 40.5 28.5"
        stroke="#5b3fa8"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
