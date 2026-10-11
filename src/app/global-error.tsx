"use client";

import "./globals.css";
import { PageErreur } from "@/components/screens/PageErreur";

/** Le cadre de l’appli lui-même a planté (rare) : la même page que error.tsx (PageErreur), avec son propre <html>. */
export default function ErreurGlobale({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="fr">
      <body>
        <PageErreur error={error} retry={retry} trace="cadre en erreur" />
      </body>
    </html>
  );
}
