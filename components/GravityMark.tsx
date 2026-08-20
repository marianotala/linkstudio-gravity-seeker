// Isotipo de ondas de Gravity: arcos concéntricos irradiando de un
// punto de señal, en cian sobre fondo oscuro.

export default function GravityMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Gravity"
    >
      <circle cx="16" cy="21" r="3" fill="#2fb9e8" />
      <path
        d="M8.5 16.5a9.5 9.5 0 0 1 15 0"
        stroke="#2fb9e8"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M4.5 11.5a15 15 0 0 1 23 0"
        stroke="#2fb9e8"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M11.5 6.5a20.5 20.5 0 0 1 9 0"
        stroke="#f4368a"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}
