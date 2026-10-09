"use client";

import "./globals.css";
import { Button } from "@/components/ui/Button";
import { PageProbleme } from "@/components/screens/PageProbleme";

/** Le cadre de l’appli lui-même a planté (rare) : la même page, avec son propre <html>. */
export default function ErreurGlobale({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="fr">
      <body>
        <PageProbleme titre="Ça a coincé de notre côté." texte="Ta conv est en sécurité. Réessaie dans un instant." action={<Button onClick={() => retry()}>Réessayer</Button>} />
      </body>
    </html>
  );
}
