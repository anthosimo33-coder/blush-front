import type { Metadata, Viewport } from "next";
import { Figtree, Nunito } from "next/font/google";
import { Suspense } from "react";
import { JourneyProvider } from "@/state/journey";
import { DemoParams } from "@/state/DemoParams";
import "./globals.css";

/* Nunito pour toute l’interface (titres en 900, texte en 700-800) */
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  display: "swap",
});

/* Figtree uniquement pour les bulles de vrais messages */
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "CRUSH", template: "%s · CRUSH" },
  description: "Passe de « on se parle » à « on est ensemble ».",
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
    <html lang="fr" className={`${nunito.variable} ${figtree.variable} antialiased`}>
      <body>
        <JourneyProvider>
          <div id="app-root">{children}</div>
          <Suspense fallback={null}>
            <DemoParams />
          </Suspense>
        </JourneyProvider>
      </body>
    </html>
  );
}
