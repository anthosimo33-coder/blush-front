import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { SoundBoot } from "@/components/shell/SoundBoot";
import { Reveil } from "@/components/shell/Reveil";
import { SuiviNavigation } from "@/lib/navigation";
import { ErreurDeParcours } from "@/components/screens/ErreurDeParcours";
import { classesDesPolices } from "./polices";
import "./globals.css";

export const metadata: Metadata = {
  /* Les images des liens partagés (/v/…) en adresse complète : celle du site en ligne, l’adresse locale en dev */
  metadataBase: process.env.VERCEL ? new URL(process.env.BLUSH_URL ?? "https://www.askblush.com") : undefined,
  title: { default: "BLUSH", template: "%s · BLUSH" },
  description: "Ta conv en dit plus que tu crois.",
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4F2ED",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${classesDesPolices} antialiased`}>
      <body>
        <div id="app-root">{children}</div>
        <SoundBoot />
        <Reveil />
        <SuiviNavigation />
        <Suspense fallback={null}>
          <ErreurDeParcours />
        </Suspense>
      </body>
    </html>
  );
}
