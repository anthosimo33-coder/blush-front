"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { PARRAINAGE_TEXTES as T } from "@/contenu/parrainage";
import { copyText } from "@/lib/hooks";
import { nomErreur, tracer } from "@/lib/tracer";

/*
 * Son lien de parrainage : affiché tel quel, à copier, ou à partager (la feuille de partage du téléphone, quand il en a
 * une). Rien de sa conv ici : la page ne connaît que le lien.
 */
/* La feuille de partage du téléphone : lue au navigateur seulement (le rendu serveur ne la connaît pas) */
const sansAbonnement = () => () => {};
const peutPartager = () => typeof navigator.share === "function";

export function ParrainageScreen({ lien }: { lien: string }) {
  const [copie, setCopie] = useState(false);
  const partage = useSyncExternalStore(sansAbonnement, peutPartager, () => false);

  const copier = async () => {
    if (await copyText(lien)) setCopie(true);
  };
  const partager = async () => {
    try {
      await navigator.share({ text: `${T.message} ${lien}` });
    } catch (e) {
      /* La feuille de partage refermée sans choisir (AbortError) n’est pas un souci */
      if (nomErreur(e) !== "AbortError") tracer("parrainage:partage", e);
    }
  };

  return (
    <Screen
      mobileTop={<MobileTopBar back="/app" />}
      desktopBack={{ target: "/app" }}
      head={
        <>
          <ScreenTitle>{T.titre}</ScreenTitle>
          <Lead size={15} weight={800}>
            {T.lead}
          </Lead>
        </>
      }
      footer={
        <div className="flex flex-col gap-2">
          <Button arrow onClick={() => void copier()}>
            {copie ? T.copie : T.copier}
          </Button>
          {partage && (
            <Button variant="secondary" onClick={() => void partager()}>
              {T.partager}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="break-all rounded-2xl bg-white px-4 py-3 text-corps font-black text-ink shadow-soft">{lien.replace(/^https?:\/\/(www\.)?/, "")}</p>
        <p className="text-detail font-extrabold text-soft">{T.promesse}</p>
        <p className="text-detail font-extrabold text-soft">{T.quand}</p>
      </div>
    </Screen>
  );
}
