import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NDRAAAID | Smart Business Management",
  description: "Sistem manajemen bisnis, absensi, inventaris, dan keuangan."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
