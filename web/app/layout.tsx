import "./globals.css";
import type { Metadata } from "next";
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans
} from "next/font/google";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans"
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "ETF Trader Dashboard",
  description:
    "Dual momentum strategy — signal, backtest, and journal"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${plexSans.variable} ${plexMono.variable} ${plexSans.className}`}
      >
        {children}
      </body>
    </html>
  );
}
