import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fondo: "#0a0a0c",
        panel: "#101014",
        panel2: "#16161c",
        linea: "#26262e",
        cian: "#2fb9e8",
        magenta: "#f4368a",
        violeta: "#9d5cf0",
      },
      fontFamily: {
        display: ["var(--font-manrope)", "sans-serif"],
        mono: ["var(--font-dm-mono)", "monospace"],
        body: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
