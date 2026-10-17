import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NDRANEXA", template: "%s | NDRANEXA" },
  description: "NDRANEXA — platform bisnis, absensi, inventaris, transaksi, dan keuangan NDRANEXA Niaga Nusantara.",
  applicationName: "NDRANEXA",
  icons: { icon: "/ndranexa-web.svg", shortcut: "/ndranexa-web.svg", apple: "/ndranexa-web.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
