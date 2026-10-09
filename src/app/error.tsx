"use client";

import { Button } from "@/components/ui/Button";
import { PageProbleme } from "@/components/screens/PageProbleme";

/** Une page qui plante (la base qui tarde au réveil, un souci passager) : on le dit, et on réessaie. */
export default function Erreur({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageProbleme titre="Ça a coincé de notre côté." texte="Ta conv est en sécurité. Réessaie dans un instant." action={<Button onClick={() => retry()}>Réessayer</Button>} />;
}
