import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

// TIPOGRAFÍA ÚNICA: Montserrat para TODO (títulos 700, etiquetas 600,
// cuerpo 400, cifras 600 con tabular-nums). Un solo token --font-sans
// del que cuelga toda la app; las columnas numéricas alinean con
// font-variant-numeric: tabular-nums (Montserrat es proporcional).
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
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
        className={`${montserrat.variable} font-body bg-fondo text-texto-primario antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
