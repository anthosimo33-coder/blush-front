"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert, DoneCheck } from "@/components/ui/feedback";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { NBSP } from "@/lib/format";
import { couperLesRelances } from "@/services/api";

/*
 * Couper les relances par mail, depuis le lien du mail « Ta suite t’attend ». Un bouton plutôt que le lien seul, comme
 * pour la liste d’attente : certaines messageries ouvrent les liens d’un mail pour les vérifier. Les mails qu’on demande
 * (le code de connexion, « ton rapport est prêt ») partent toujours.
 * TODO(produit): textes à valider.
 */
export function DesinscriptionScreen({ id, cle }: { id: string; cle: string }) {
  const [etat, setEtat] = useState<"question" | "envoi" | "fait" | "lien" | "reseau">(id && cle ? "question" : "lien");

  const couper = async () => {
    setEtat("envoi");
    const issue = await couperLesRelances({ id, cle });
    setEtat(issue === "coupees" ? "fait" : issue === "lien" ? "lien" : "reseau");
  };

  if (etat === "fait" || etat === "lien")
    return (
      <Screen
        mobileTop={<MobileTopBar back="/" />}
        desktopBack={{ target: "/" }}
        head={
          <>
            {etat === "fait" && <DoneCheck size={48} glyphe={22} trait={3.2} />}
            <ScreenTitle>{etat === "fait" ? "C’est fait." : "Ce lien ne marche pas."}</ScreenTitle>
            <Lead size={15} weight={800}>
              {etat === "fait"
                ? "Plus aucune relance de BLUSH. Ton code de connexion et «\u00a0ton rapport est prêt\u00a0» arrivent toujours."
                : "Il est peut-être incomplet. Ouvre-le depuis le mail, tel quel."}
            </Lead>
          </>
        }
        footer={
          <ButtonLink href="/" arrow>
            Revenir à l’accueil
          </ButtonLink>
        }
      >
        <span />
      </Screen>
    );

  return (
    <Screen
      mobileTop={<MobileTopBar back="/" />}
      desktopBack={{ target: "/" }}
      head={
        <>
          <ScreenTitle>Plus de relances{NBSP}?</ScreenTitle>
          <Lead size={15} weight={800}>
            BLUSH ne t’écrira plus pour te rappeler une suite à lire. Les mails que tu demandes (ton code, ton rapport prêt) arrivent toujours.
          </Lead>
        </>
      }
      footer={
        <Button arrow disabled={etat === "envoi"} loading={etat === "envoi"} loadingLabel="Désinscription" onClick={() => void couper()}>
          Me désinscrire
        </Button>
      }
    >
      {etat === "reseau" ? <Alert>Ça n’a pas marché. Vérifie ta connexion et réessaie.</Alert> : <span />}
    </Screen>
  );
}
