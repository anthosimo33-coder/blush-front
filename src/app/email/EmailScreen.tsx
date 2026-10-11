"use client";

import { BoutonRecevoirCode, FormulaireEmail } from "@/components/formulaires/FormulaireEmail";
import { LienDiscret, NotePrivee } from "@/components/ui/NotePrivee";
import { ParcoursScreen } from "@/components/shell/ParcoursScreen";
import { Lead, ScreenTitle } from "@/components/shell/Screen";
import { NOTE_EMAIL } from "@/contenu/confidentialite";
import { useEnvoiCode } from "@/lib/useEnvoiCode";
import { NBSP } from "@/lib/format";

/* Écran 07 — Email seul : on y envoie un code (pas de mot de passe), à saisir sur l’écran suivant. */
export function EmailScreen() {
  const envoi = useEnvoiCode("/email/code");
  return (
    <ParcoursScreen
      step={3}
      back="/qui"
      head={
        <>
          <ScreenTitle>On t’envoie ton rapport où{NBSP}?</ScreenTitle>
          <Lead size={15} weight={800}>
            Pour le retrouver quand tu veux, et pour qu’on te relance au bon moment.
          </Lead>
        </>
      }
      footer={<BoutonRecevoirCode envoi={envoi} />}
    >
      <FormulaireEmail envoi={envoi} />
      <NotePrivee>
        {NOTE_EMAIL} <LienDiscret href="/confidentialite">Ce que BLUSH fait de ta conv</LienDiscret>
      </NotePrivee>
    </ParcoursScreen>
  );
}
