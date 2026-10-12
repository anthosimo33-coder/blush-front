"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert, NoteIcone } from "@/components/ui/feedback";
import { Sheet } from "@/components/ui/surfaces";
import { Lead, MobileTopBar, Screen, ScreenTitle } from "@/components/shell/Screen";
import { NBSP } from "@/lib/format";
import { tracer } from "@/lib/tracer";
import { deleteAccount, seDeconnecter } from "@/services/api";
import { ErreurApi } from "@/types/erreurs-api";

/*
 * Ta place dans la bêta est fermée : un testeur retiré de la liste, sa session encore ouverte (src/app/effacer/page.tsx).
 * BLUSH ne lui ouvre plus rien, mais il peut tout effacer, ou se connecter avec un autre email. Textes de l’écran et de
 * sa feuille écrits sans maquette (voix de BLUSH).
 */
export function EffacerScreen({ email }: { email: string }) {
  const [confirmer, setConfirmer] = useState(false);
  /* Le geste en cours (effacer, ou partir vers un autre email), et ce qui n’a pas abouti */
  const [enCours, setEnCours] = useState<"effacer" | "sortir" | null>(null);
  const [souci, setSouci] = useState<string | null>(null);

  /* Un chargement neuf : rien du compte ne reste en mémoire (le cache des requêtes, le parcours) */
  const partir = (adresse: string) => window.location.assign(adresse);

  /* La feuille se ferme, sauf pendant l’effacement */
  const fermer = () => {
    if (enCours) return;
    setConfirmer(false);
    setSouci(null);
  };

  const effacer = async () => {
    if (enCours) return;
    setEnCours("effacer");
    setSouci(null);
    try {
      await deleteAccount();
    } catch (e) {
      /* 401 : la session a expiré entre-temps, il n’y a plus rien à effacer sur le serveur, et cet appareil a déjà tout oublié */
      if (!(e instanceof ErreurApi && e.status === 401)) {
        tracer("effacer:compte", e);
        setEnCours(null);
        setSouci("Ça n’a pas marché. Vérifie ta connexion et réessaie.");
        return;
      }
    }
    partir("/");
  };

  const autreEmail = async () => {
    if (enCours) return;
    setEnCours("sortir");
    setSouci(null);
    try {
      await seDeconnecter();
    } catch (e) {
      tracer("effacer:sortie", e);
      setEnCours(null);
      setSouci("Ça n’a pas marché. Vérifie ta connexion et réessaie.");
      return;
    }
    partir("/connexion");
  };

  return (
    <Screen
      mobileTop={<MobileTopBar back={() => partir("/")} />}
      desktopBack={{ target: "/" }}
      head={
        <>
          <ScreenTitle>Ta place dans la bêta est fermée.</ScreenTitle>
          <Lead size={15} weight={800}>
            BLUSH n’est plus ouvert à {email} pour l’instant. Tes histoires sont toujours gardées{NBSP}: tu peux tout effacer maintenant, ou attendre qu’une place se rouvre.
          </Lead>
        </>
      }
      footer={
        <>
          <Button onClick={() => setConfirmer(true)} disabled={!!enCours}>
            Tout effacer
          </Button>
          <Button variant="link" loading={enCours === "sortir"} loadingLabel="Déconnexion" onClick={() => void autreEmail()}>
            Me connecter avec un autre email
          </Button>
        </>
      }
    >
      {souci && !confirmer && <Alert>{souci}</Alert>}
      <NoteIcone icone="lock" ton="muted" className="text-legende">
        Une question{NBSP}? Écris-nous à{" "}
        <a href="mailto:bonjour@askblush.com" className="underline">
          bonjour@askblush.com
        </a>
        .
      </NoteIcone>

      <Sheet open={confirmer} onClose={fermer} labelledBy="effacer-titre">
        <h2 id="effacer-titre" className="m-0 text-titre-3 font-black leading-[1.1] tracking-[-0.02em]">
          Tout effacer{NBSP}?
        </h2>
        <p className="m-0 text-detail font-extrabold leading-[1.45] text-soft">Ton compte et toutes tes histoires, sur tous tes appareils. On ne pourra rien récupérer.</p>
        {souci && <Alert>{souci}</Alert>}
        <Button loading={enCours === "effacer"} loadingLabel="Effacement" onClick={() => void effacer()}>
          Tout effacer
        </Button>
        <Button variant="link" onClick={fermer}>
          Annuler
        </Button>
      </Sheet>
    </Screen>
  );
}
