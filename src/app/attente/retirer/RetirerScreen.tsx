"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert, DoneCheck } from "@/components/ui/feedback";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { NBSP } from "@/lib/format";
import { retirerDeLaListe } from "@/services/api";

/*
 * Se retirer de la liste d’attente, depuis le lien du mail : l’inscription a pu venir de quelqu’un d’autre. Un bouton
 * plutôt que le lien seul : certaines messageries ouvrent les liens d’un mail pour les vérifier.
 */
export function RetirerScreen({ id, cle }: { id: string; cle: string }) {
  const [etat, setEtat] = useState<"question" | "envoi" | "fait" | "lien" | "reseau">(id && cle ? "question" : "lien");

  const retirer = async () => {
    setEtat("envoi");
    const issue = await retirerDeLaListe({ id, cle });
    setEtat(issue === "retire" ? "fait" : issue === "lien" ? "lien" : "reseau");
  };

  if (etat === "fait" || etat === "lien")
    return (
      <Screen
        mobileTop={<MobileTopBar back="/" />}
        desktopBack={{ target: "/" }}
        head={
          <>
            {etat === "fait" && (
              <DoneCheck size={48} glyphe={22} trait={3.2} />
            )}
            <ScreenTitle>{etat === "fait" ? "C’est fait." : "Ce lien ne marche pas."}</ScreenTitle>
            <Lead size={15} weight={800}>
              {etat === "fait" ? "Ton email n’est plus sur la liste d’attente. On ne t’écrira plus." : "Il est peut-être incomplet. Ouvre-le depuis le mail, tel quel."}
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
          <ScreenTitle>Te retirer de la liste{NBSP}?</ScreenTitle>
          <Lead size={15} weight={800}>
            Ton email quitte la liste d’attente de BLUSH, et on ne t’écrira plus.
          </Lead>
        </>
      }
      footer={
        <Button arrow disabled={etat === "envoi"} loading={etat === "envoi"} loadingLabel="Retrait" onClick={() => void retirer()}>
          Retirer mon email
        </Button>
      }
    >
      {etat === "reseau" ? (
        <Alert>
          Ça n’a pas marché. Vérifie ta connexion et réessaie.
        </Alert>
      ) : (
        <span />
      )}
    </Screen>
  );
}
