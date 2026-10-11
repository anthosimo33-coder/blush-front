"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { PageProbleme } from "@/components/screens/PageProbleme";
import { NBSP } from "@/lib/format";
import { tracer } from "@/lib/tracer";

/**
 * Une page qui plante (la base qui tarde au réveil, un souci passager) : on le dit, et on réessaie. Une erreur du serveur
 * a une empreinte (digest), que le journal du serveur garde aussi (src/instrumentation.ts) : la page la montre sous le
 * bouton, pour qu’on la retrouve si on nous l’envoie.
 */
export default function Erreur({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => tracer("page en erreur", error), [error]);
  return (
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
  );
}
