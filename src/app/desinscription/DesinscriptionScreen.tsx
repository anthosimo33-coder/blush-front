"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert, DoneCheck } from "@/components/ui/feedback";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { couperLesRelances } from "@/services/api";
import type { Desinscription } from "@/types";

/*
 * Couper un genre de mails, depuis le lien en pied d’un mail : les offres (« Ton rapport t’attend », les bulles), ou les
 * conseils (les séquences après l’achat), et, plus bas, tous les mails de BLUSH. Un bouton plutôt que le lien seul,
 * comme pour la liste d’attente : certaines messageries ouvrent les liens d’un mail pour les vérifier. Les mails qu’on
 * demande (le code de connexion, « ton rapport est prêt ») partent toujours.
 * TODO(produit): textes à valider.
 */

/** Ce que dit la page, selon ce que le lien coupe. */
const TEXTES: Record<Desinscription, { titre: string; lead: string; fait: string }> = {
  offres: {
    titre: "Plus d’offres\u00a0?",
    lead: "BLUSH ne t’écrira plus pour te rappeler une suite à lire ni tes bulles. Les mails que tu demandes (ton code, ton rapport prêt) arrivent toujours.",
    fait: "Plus aucune offre de BLUSH par mail. Ton code de connexion et «\u00a0ton rapport est prêt\u00a0» arrivent toujours.",
  },
  conseils: {
    titre: "Plus de conseils\u00a0?",
    lead: "BLUSH ne t’écrira plus pour prendre de tes nouvelles ou te rappeler ton prochain pas. Les mails que tu demandes (ton code, ton rapport prêt) arrivent toujours.",
    fait: "Plus aucun conseil de BLUSH par mail. Ton code de connexion et «\u00a0ton rapport est prêt\u00a0» arrivent toujours.",
  },
  tout: {
    titre: "",
    lead: "",
    fait: "Plus aucun mail de BLUSH, sauf ceux que tu demandes\u00a0: ton code de connexion et «\u00a0ton rapport est prêt\u00a0».",
  },
};

export function DesinscriptionScreen({ id, cle, quoi }: { id: string; cle: string; quoi: Exclude<Desinscription, "tout"> }) {
  const [etat, setEtat] = useState<"question" | "envoi" | "fait" | "lien" | "reseau">(id && cle ? "question" : "lien");
  const [coupe, setCoupe] = useState<Desinscription>(quoi);

  const couper = async (genre: Desinscription) => {
    setCoupe(genre);
    setEtat("envoi");
    const issue = await couperLesRelances({ id, cle, quoi: genre });
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
              {etat === "fait" ? TEXTES[coupe].fait : "Il est peut-être incomplet. Ouvre-le depuis le mail, tel quel."}
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

  const envoi = etat === "envoi";
  return (
    <Screen
      mobileTop={<MobileTopBar back="/" />}
      desktopBack={{ target: "/" }}
      head={
        <>
          <ScreenTitle>{TEXTES[quoi].titre}</ScreenTitle>
          <Lead size={15} weight={800}>
            {TEXTES[quoi].lead}
          </Lead>
        </>
      }
      footer={
        <div className="flex flex-col">
          <Button arrow disabled={envoi} loading={envoi && coupe === quoi} loadingLabel="Désinscription" onClick={() => void couper(quoi)}>
            Me désinscrire
          </Button>
          <Button
            variant="link"
            className="mt-1 self-center"
            disabled={envoi}
            loading={envoi && coupe === "tout"}
            loadingLabel="Désinscription"
            onClick={() => void couper("tout")}
          >
            Couper tous les mails de BLUSH
          </Button>
        </div>
      }
    >
      {etat === "reseau" ? <Alert>Ça n’a pas marché. Vérifie ta connexion et réessaie.</Alert> : <span />}
    </Screen>
  );
}
