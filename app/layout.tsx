import type { Metadata } from "next";
import "./globals.css";
import "./ndraaaid-detail-polish.css";
import "./ndraaaid-graphite-theme.css";

export const metadata: Metadata = {
  title: "NDRANEXA — Business Operating System",
  icons: { icon: "/ndranexa-logo.svg", shortcut: "/ndranexa-logo.svg", apple: "/ndranexa-logo.svg" },
  description: "Platform operasional bisnis terpadu untuk tim, toko, inventaris, penjualan, absensi, dan keuangan."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
