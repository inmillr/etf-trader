import "./globals.css";
import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}
