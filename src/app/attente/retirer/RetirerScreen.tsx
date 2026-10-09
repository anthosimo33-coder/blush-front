"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";

/*
 * Se retirer de la liste d’attente, depuis le lien du mail : l’inscription a pu venir de quelqu’un d’autre. Un bouton
 * plutôt que le lien seul : certaines messageries ouvrent les liens d’un mail pour les vérifier.
 */
export function RetirerScreen({ id, cle }: { id: string; cle: string }) {
  const [etat, setEtat] = useState<"question" | "envoi" | "fait" | "lien" | "reseau">(id && cle ? "question" : "lien");

  const retirer = async () => {
    setEtat("envoi");
    const r = await fetch("/api/attente/retrait", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, cle }) }).catch(() => null);
    setEtat(r?.ok ? "fait" : r?.status === 404 ? "lien" : "reseau");
  };

  if (etat === "fait" || etat === "lien")
    return (
      <Screen
        mobileTop={<MobileTopBar back="/" />}
        desktopBack={{ target: "/" }}
        head={
          <>
            {etat === "fait" && (
              <span className="flex size-12 items-center justify-center rounded-full" style={{ background: "var(--gloss), #12C08A", boxShadow: "0 8px 18px -8px rgba(18,192,138,0.6)" }}>
                <Icon name="check" size={22} color="#FFFFFF" stroke={3.2} />
              </span>
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
          <ScreenTitle>Te retirer de la liste ?</ScreenTitle>
          <Lead size={15} weight={800}>
            Ton email quitte la liste d’attente de BLUSH, et on ne t’écrira plus.
          </Lead>
        </>
      }
      footer={
        <Button arrow={etat !== "envoi"} disabled={etat === "envoi"} aria-busy={etat === "envoi"} onClick={retirer}>
          {etat === "envoi" ? <TypingDots color="#FFFFFF" label="Retrait" /> : "Retirer mon email"}
        </Button>
      }
    >
      {etat === "reseau" ? (
        <p role="alert" className="m-0 text-[14px] font-extrabold text-[#D93036]">
          Ça n’a pas marché. Vérifie ta connexion et réessaie.
        </p>
      ) : (
        <span />
      )}
    </Screen>
  );
}
