"use client";

import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { MontageDeLaPage } from "@/lib/query";
import { poserConvDeLaPage } from "@/services/session";
import type { Account } from "@/types/api";
import { CompteRendu, type CompteDeLaPage } from "./compte-de-la-page";

/**
 * La page d’une conv, côté navigateur (rendue par PageDeConv) : elle pose sa conv avant les premiers appels de ses écrans,
 * et leur donne le compte rendu par le serveur (useCompteDeLaPage, ./compte-de-la-page.ts). Chaque montage a son objet
 * (MontageDeLaPage, src/lib/query.ts) : les écrans montés ensemble partagent ce qui vient d’être rendu, une page revue par
 * l’historique le relit.
 */
export function PoseConv({ id, compte, rendu, children }: { id: string | null; compte: Account | null; rendu: number; children: ReactNode }) {
  const [montage] = useState(() => ({}));
  const page = useMemo<CompteDeLaPage>(() => ({ compte, rendu }), [compte, rendu]);
  return (
    <MontageDeLaPage value={montage}>
      <CompteRendu value={page}>
        {/* En tête, avant les écrans : son effet de mise en page passe avant les leurs (et avant tous leurs effets) */}
        <ConvPosee id={id} />
        {children}
      </CompteRendu>
    </MontageDeLaPage>
  );
}

/**
 * Pose la conv de la page avant les premiers appels de ses écrans (un effet de mise en page passe avant les autres).
 * `data-conv-posee` sur <html> le dit, tant qu’elle est posée : avant, un geste viserait la conv du cookie. Les tests de
 * bout en bout l’attendent avant leur premier geste (ouvrir, tests/e2e/aide/page.ts).
 */
function ConvPosee({ id }: { id: string | null }) {
  useLayoutEffect(() => {
    poserConvDeLaPage(id);
    document.documentElement.dataset.convPosee = "";
    return () => {
      poserConvDeLaPage(null);
      delete document.documentElement.dataset.convPosee;
    };
  }, [id]);
  return null;
}
