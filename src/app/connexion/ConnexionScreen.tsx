"use client";

import { useSearchParams } from "next/navigation";
import { suiteSure } from "@/lib/suite";
import { useEnvoiCode } from "@/lib/useEnvoiCode";
import { BoutonRecevoirCode, FormulaireEmail } from "@/components/formulaires/FormulaireEmail";
import { LienDiscret, NotePrivee } from "@/components/ui/NotePrivee";
import { ParcoursScreen } from "@/components/shell/ParcoursScreen";
import { Lead, ScreenTitle } from "@/components/shell/Screen";
import { NOTE_CONNEXION } from "@/contenu/confidentialite";
import { NBSP } from "@/lib/format";

/*
 * Se connecter : retrouver ses convs sur un autre appareil. L’email du compte, un code (pas de mot de passe),
 * et tout est là. Textes relus le 8 octobre (voix de BLUSH).
 * Venu de l’import (`suite` sous /importer/ : en bêta fermée, les captures se lisent pour un compte connecté) : un premier
 * accès, pas un retour. Le texte le dit, le retour mène au choix de l’appli, et le lien « Analyser ma conv » (qui ramènerait
 * ici) disparaît. Textes à valider.
 */
export function ConnexionScreen({ suite = null }: { suite?: string | null }) {
  const depuisImport = !!suite?.startsWith("/importer/");
  const retour = depuisImport ? "/commencer" : "/";
  const envoi = useEnvoiCode(suite ? `/connexion/code?suite=${encodeURIComponent(suite)}` : "/connexion/code");

  return (
    <ParcoursScreen
      back={retour}
      head={
        depuisImport ? (
          <>
            <ScreenTitle>D’abord, ton email.</ScreenTitle>
            <Lead size={15} weight={800}>
              BLUSH est en bêta privée{NBSP}: on t’envoie un code, puis tu envoies ta conv.
            </Lead>
          </>
        ) : (
          <>
            <ScreenTitle>Retrouve tes convs.</ScreenTitle>
            <Lead size={15} weight={800}>
              Entre l’email de ton compte{NBSP}: on t’envoie un code, et tout est là, sur cet appareil aussi.
            </Lead>
          </>
        )
      }
      footer={<BoutonRecevoirCode envoi={envoi} />}
    >
      <FormulaireEmail envoi={envoi} />
      <NotePrivee className="leading-[1.45]">{NOTE_CONNEXION}</NotePrivee>
      {!depuisImport && (
        <p className="m-0 text-note font-extrabold text-grey">
          Pas encore de compte{NBSP}?{" "}
          <LienDiscret href="/commencer">Analyser ma conv</LienDiscret>
        </p>
      )}
    </ParcoursScreen>
  );
}

/** /connexion statique : `?suite=` se lit dans le navigateur, avec la même garde que côté serveur (suiteSure). */
export function ConnexionDepuisLadresse() {
  return <ConnexionScreen suite={suiteSure(useSearchParams().get("suite"))} />;
}
