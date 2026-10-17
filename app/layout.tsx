import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NDRANEXA",
  description: "Platform bisnis, absensi, inventaris, dan keuangan NDRANEXA."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
