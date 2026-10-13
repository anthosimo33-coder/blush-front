import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { SoundBoot } from "@/components/shell/SoundBoot";
import { Reveil } from "@/components/shell/Reveil";
import { SuiviNavigation } from "@/lib/navigation";
import { Presence } from "@/lib/presence";
import { ErreurDeParcours } from "@/components/screens/ErreurDeParcours";
import { surVercel } from "@/server/drapeaux";
import { URL_SITE } from "@/server/env";
import { PAPIER } from "@/server/marque";
import { classesDesPolices } from "./polices";
import "./globals.css";

export const metadata: Metadata = {
  /* Les images des liens partagés (/v/…) en adresse complète : celle du site en ligne, l’adresse locale en dev */
  metadataBase: surVercel() ? new URL(URL_SITE) : undefined,
  title: { default: "BLUSH", template: "%s · BLUSH" },
  description: "Ta conv en dit plus que tu crois.",
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: PAPIER,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${classesDesPolices} antialiased`}>
      <body>
        <div id="app-root">{children}</div>
        <SoundBoot />
        <Reveil />
        <SuiviNavigation />
        <Presence />
        <Suspense fallback={null}>
          <ErreurDeParcours />
        </Suspense>
      </body>
    </html>
  );
}
