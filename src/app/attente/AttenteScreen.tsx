"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { NotePrivee } from "@/components/ui/NotePrivee";
import { FormulaireEmail } from "@/components/formulaires/FormulaireEmail";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { NOTE_ATTENTE } from "@/contenu/confidentialite";
import { useSaisieEmail } from "@/lib/email";
import { NBSP } from "@/lib/format";
import { rejoindreAttente } from "@/services/api";

/*
 * La bêta fermée : BLUSH est sur invitation. On laisse son email : un mail le confirme (l’inscription a pu venir de
 * quelqu’un d’autre, il permet de se retirer), et un autre arrive quand une place se libère.
 * Textes relus le 8 octobre (voix de BLUSH).
 */
export function AttenteScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [etat, setEtat] = useState<"saisie" | "envoi" | "fait" | "erreur">("saisie");
  /* Le même champ que le parcours : son erreur de forme, ou l’inscription ratée */
  const saisie = useSaisieEmail(email, setEmail, {
    probleme: etat === "erreur" ? "Ça n’a pas marché. Réessaie dans un instant." : null,
    oublierProbleme: () => setEtat((e) => (e === "erreur" ? "saisie" : e)),
    occupe: etat === "envoi",
    envoyer: async (propre) => {
      setEtat("envoi");
      try {
        await rejoindreAttente(propre);
        setEtat("fait");
      } catch {
        setEtat("erreur");
      }
    },
  });

  if (etat === "fait")
    return (
      <Screen
        mobileTop={<MobileTopBar back={() => router.push("/")} />}
        desktopBack={{ target: "/" }}
        head={
          <>
            <span className="flex size-12 items-center justify-center rounded-full" style={{ background: "var(--gloss), #12C08A", boxShadow: "0 8px 18px -8px rgba(18,192,138,0.6)" }}>
              <Icon name="check" size={22} color="#FFFFFF" stroke={3.2} />
            </span>
            <ScreenTitle>Tu es sur la liste.</ScreenTitle>
            <Lead size={15} weight={800}>
              On vient de t’écrire pour te le confirmer. On te réécrit dès que ta place est prête.
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
      mobileTop={<MobileTopBar back={() => router.back()} />}
      desktopBack={{ target: "/" }}
      head={
        <>
          <ScreenTitle>BLUSH est en bêta privée.</ScreenTitle>
          <Lead size={15} weight={800}>
            Pour l’instant, BLUSH lit les convs de quelques testeurs, sur invitation. Laisse ton email{NBSP}: on te prévient dès qu’une place se libère.
          </Lead>
        </>
      }
      footer={
        <Button arrow={etat !== "envoi"} disabled={!saisie.valide || etat === "envoi"} aria-busy={etat === "envoi"} onClick={() => void saisie.envoyer()}>
          {etat === "envoi" ? <TypingDots color="#FFFFFF" label="Inscription" /> : "Rejoindre la liste"}
        </Button>
      }
    >
      <FormulaireEmail envoi={saisie} />
      <NotePrivee>{NOTE_ATTENTE}</NotePrivee>
    </Screen>
  );
}
