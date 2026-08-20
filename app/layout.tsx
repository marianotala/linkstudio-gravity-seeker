import type { Metadata } from "next";
import { Manrope, DM_Mono, Inter } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-manrope",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
        className={`${manrope.variable} ${dmMono.variable} ${inter.variable} font-body bg-fondo text-zinc-200 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
