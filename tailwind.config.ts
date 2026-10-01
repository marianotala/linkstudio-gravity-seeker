import type { Config } from "tailwindcss";

// Tailwind consume los DESIGN TOKENS de app/globals.css (:root) — esa
// es LA fuente de verdad. Los nombres legados (panel, panel2, linea,
// cian, magenta, violeta) se conservan mapeados a los tokens nuevos
// para que las pantallas sin migrar hereden el sistema sin tocarse.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // superficies (elevación de 3 niveles)
        fondo: "rgb(var(--rgb-fondo-profundo) / <alpha-value>)",
        panel: "rgb(var(--rgb-superficie-1) / <alpha-value>)", // superficie-1
        panel2: "rgb(var(--rgb-superficie-2) / <alpha-value>)", // superficie-2
        "superficie-hover": "rgb(var(--rgb-superficie-hover) / <alpha-value>)",
        linea: "rgb(var(--rgb-borde-sutil) / <alpha-value>)", // borde sutil
        linea2: "rgb(var(--rgb-borde-activo) / <alpha-value>)", // borde activo
        // color semántico (sagrado)
        cian: "rgb(var(--rgb-origenes) / <alpha-value>)", // orígenes
        magenta: "rgb(var(--rgb-pois) / <alpha-value>)", // POIs · primario
        violeta: "rgb(var(--rgb-zonas) / <alpha-value>)", // zonas/CP
        exito: "rgb(var(--rgb-exito) / <alpha-value>)",
        alerta: "rgb(var(--rgb-alerta) / <alpha-value>)",
        error: "rgb(var(--rgb-error) / <alpha-value>)",
        // texto
        texto: {
          primario: "rgb(var(--rgb-texto-primario) / <alpha-value>)",
          secundario: "rgb(var(--rgb-texto-secundario) / <alpha-value>)",
          terciario: "rgb(var(--rgb-texto-terciario) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["var(--fuente-titulos)", "sans-serif"],
        body: ["var(--fuente-cuerpo)", "sans-serif"],
        sans: ["var(--fuente-cuerpo)", "sans-serif"],
        mono: ["var(--fuente-datos)", "monospace"], // SOLO datos
      },
      borderRadius: {
        tarjeta: "var(--radio-tarjeta)",
        control: "var(--radio-control)",
        chip: "var(--radio-chip)",
      },
      boxShadow: {
        elevada: "var(--sombra-elevada)",
      },
      backgroundImage: {
        // gradiente firma: SOLO CTA principal, anillo de progreso,
        // cifras protagonistas y divisores clave
        firma: "var(--gradiente-firma)",
      },
      transitionDuration: {
        rapida: "150ms",
        media: "250ms",
      },
    },
  },
  plugins: [],
};
export default config;
