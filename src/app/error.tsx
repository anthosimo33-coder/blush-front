"use client";

import { PageErreur } from "@/components/screens/PageErreur";

/** Une page qui plante : on le dit, on réessaie, avec le code de référence de l’erreur (PageErreur). */
export default function Erreur({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageErreur error={error} retry={retry} trace="page en erreur" />;
}
