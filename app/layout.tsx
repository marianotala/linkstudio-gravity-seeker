import type { Metadata } from "next";
import { Montserrat, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Tipografía del brand book V2: Montserrat para TODO (Regular 400
// lectura, Medium 500 titulares, Semibold 600 énfasis/cifras/CTAs —
// evitar Light en lecturas pequeñas) y monospace SOLO para datos
// (números, coordenadas, códigos) en JetBrains Mono.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fuente-montserrat",
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
        className={`${montserrat.variable} ${datos.variable} font-body bg-fondo text-texto-primario antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
