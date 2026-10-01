import type { Metadata } from "next";
import { Space_Grotesk, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Tipografía con disciplina de roles (design tokens v2):
// títulos en Space Grotesk, cuerpo/UI en DM Sans y monospace SOLO
// para datos (números, coordenadas, códigos) en JetBrains Mono.
const titulos = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--fuente-titulos",
});

const cuerpo = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--fuente-cuerpo",
});

const datos = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fuente-datos",
});

export const metadata: Metadata = {
  title: "Seeker — Gravity",
  description:
    "Seeker — point of interest intelligence · powered by Link Studio",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX">
      <body
        className={`${titulos.variable} ${cuerpo.variable} ${datos.variable} font-body bg-fondo text-texto-primario antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
