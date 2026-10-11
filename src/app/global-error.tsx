"use client";

import "./globals.css";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { PageProbleme } from "@/components/screens/PageProbleme";
import { NBSP } from "@/lib/format";
import { tracer } from "@/lib/tracer";

/** Le cadre de l’appli lui-même a planté (rare) : la même page que error.tsx, avec son propre <html>, et le code de référence. */
export default function ErreurGlobale({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => tracer("cadre en erreur", error), [error]);
  return (
    <html lang="fr">
      <body>
        <PageProbleme
          titre="Ça a coincé de notre côté."
          texte="Ta conv est en sécurité. Réessaie dans un instant."
          action={
            <div className="flex w-full flex-col gap-2">
              <Button onClick={() => retry()}>Réessayer</Button>
              {error.digest && (
                <p className="m-0 text-center text-[12px] font-bold text-grey">
                  Code de référence{NBSP}: <span className="select-all tabular-nums">{error.digest}</span>
                </p>
              )}
            </div>
          }
        />
      </body>
    </html>
  );
}
