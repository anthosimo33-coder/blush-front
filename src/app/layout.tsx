import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { SoundBoot } from "@/components/shell/SoundBoot";
import { Reveil } from "@/components/shell/Reveil";
import { SuiviNavigation } from "@/lib/navigation";
import { Presence } from "@/lib/presence";
import { Sentinelle } from "@/lib/sentinelle";
import { ErreurDeParcours } from "@/components/screens/ErreurDeParcours";
import { surVercel } from "@/server/drapeaux";
import { URL_SITE } from "@/server/env";
import { PAPIER } from "@/server/marque";
import { classesDesPolices } from "./polices";
import "./globals.css";

/*
 * Les moteurs de recherche : seules les pages publiques s’indexent (la landing, les conditions, les mentions légales, la
 * confidentialité : PAGE_PUBLIQUE, src/lib/referencement.ts). Toutes les autres, privées (le parcours, le rapport, le
 * chat, le compte) ou outils de l’équipe, restent hors des moteurs par défaut : une nouvelle page aussi, tant qu’elle ne
 * le demande pas. robots.txt (src/app/robots.ts) et le plan du site (src/app/sitemap.ts) disent la même chose.
 */
export const metadata: Metadata = {
  /* Les images des liens partagés (/v/…) et des pages publiques en adresse complète : celle du site en ligne, l’adresse locale en dev */
  metadataBase: surVercel() ? new URL(URL_SITE) : undefined,
  title: { default: "BLUSH", template: "%s · BLUSH" },
  description: "Ta conv en dit plus que tu crois.",
  applicationName: "BLUSH",
  robots: { index: false, follow: false },
  openGraph: { siteName: "BLUSH", locale: "fr_FR", type: "website" },
  twitter: { card: "summary_large_image" },
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
        <Sentinelle />
        <Suspense fallback={null}>
          <ErreurDeParcours />
        </Suspense>
      </body>
    </html>
  );
}
