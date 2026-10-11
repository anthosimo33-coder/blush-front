"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { NBSP } from "@/lib/format";
import { tracer } from "@/lib/tracer";
import { PageProbleme } from "./PageProbleme";

/**
 * Une page qui plante (la base qui tarde au réveil, un souci passager) : on le dit, et on réessaie. Celle de
 * src/app/error.tsx, et celle de src/app/global-error.tsx quand le cadre lui-même a planté. Une erreur du serveur a une
 * empreinte (digest), que le journal du serveur garde aussi (src/instrumentation.ts) : la page la montre sous le bouton,
 * pour qu’on la retrouve si on nous l’envoie. `trace` : l’événement écrit dans la console (src/lib/tracer.ts).
 */
export function PageErreur({ error, retry, trace }: { error: Error & { digest?: string }; retry: () => void; trace: string }) {
  useEffect(() => tracer(trace, error), [trace, error]);
  return (
    <PageProbleme
      titre="Ça a coincé de notre côté."
      texte="Ta conv est en sécurité. Réessaie dans un instant."
      action={
        <div className="flex w-full flex-col gap-2">
          <Button onClick={() => retry()}>Réessayer</Button>
          {error.digest && (
            <p className="m-0 text-center text-micro font-bold text-grey">
              Code de référence{NBSP}: <span className="select-all tabular-nums">{error.digest}</span>
            </p>
          )}
        </div>
      }
    />
  );
}
