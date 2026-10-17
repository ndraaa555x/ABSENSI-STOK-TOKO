import type { Metadata } from "next";
import "./globals.css";
import "./motion-system.css";
import MotionSystem from "./motion-system";

export const metadata: Metadata = {
  title: { default: "NDRANEXA", template: "%s | NDRANEXA" },
  description: "NDRANEXA — platform bisnis, absensi, inventaris, transaksi, dan keuangan NDRANEXA Niaga Nusantara.",
  applicationName: "NDRANEXA",
  icons: { icon: "/ndranexa-web.svg", shortcut: "/ndranexa-web.svg", apple: "/ndranexa-web.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        {children}
        <MotionSystem />
      </body>
    </html>
  );
}
