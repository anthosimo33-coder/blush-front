"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CATALOGUE } from "@/contenu/offres";
import { RETOUR_PAIEMENT } from "@/contenu/paiement";
import { codeDe } from "@/lib/messages-erreur";
import { suiteDuPaiement } from "@/lib/paiement";
import { apresDeblocage } from "@/lib/requetes";
import { etatDuPaiement } from "@/services/api";
import { ButtonLink } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/feedback";
import { Screen } from "@/components/shell/Screen";
import type { EtatAchat } from "@/types/api";

/** Toutes les combien relire l’achat, et combien de fois avant de dire que ça prend du temps (une minute). */
const PAS_MS = 1_000;
const ESSAIS = 60;

/**
 * Où mener une fois l’achat payé : un rapport, « C’est débloqué » (qui reprend ensuite où le paiement a été commencé) ;
 * des bulles, là où le paiement a été commencé, sinon l’accueil.
 */
function destination(e: EtatAchat): Route {
  const suite = suiteDuPaiement(e.achat);
  if (CATALOGUE[e.offre].conv) return `/rapport/debloque?achat=${e.achat}${suite ? `&suite=${encodeURIComponent(suite)}` : ""}`;
  return suite ?? "/app";
}

/** Ce que la page dit en attendant, ou de l’achat qui ne sera pas livré. */
type Etat = "attente" | "long" | "echoue" | "annule" | "introuvable";

/**
 * Le retour du paiement : l’achat relu chaque seconde (GET /api/paiement/[achat], qui vérifie chez Whop si le webhook
 * tarde), puis la page qui suit. Échoué, remboursé ou introuvable : on le dit, et on revient au rapport.
 */
export function RetourScreen({ achat, paiement }: { achat: string | null; paiement: string | null }) {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>(achat ? "attente" : "introuvable");
  useEffect(() => {
    if (!achat) return;
    let fini = false;
    let essais = 0;
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const relire = async () => {
      essais += 1;
      try {
        const e = await etatDuPaiement(achat, paiement);
        if (fini) return;
        if (e.statut === "paye") {
          fini = true;
          apresDeblocage();
          router.replace(destination(e));
          return;
        }
        if (e.statut !== "en_attente") return setEtat(e.statut === "echoue" ? "echoue" : "annule");
      } catch (err) {
        if (fini) return;
        /* Pas son achat, ou plus de session : rien à attendre ; le réseau, on réessaie */
        if (codeDe(err) === "introuvable" || codeDe(err) === "connexion") return setEtat("introuvable");
      }
      if (essais >= ESSAIS) setEtat("long");
      minuterie = setTimeout(() => void relire(), PAS_MS);
    };
    void relire();
    return () => {
      fini = true;
      clearTimeout(minuterie);
    };
  }, [achat, paiement, router]);

  const enCours = etat === "attente" || etat === "long";
  return (
    <Screen
      mise="colonne"
      mainWidth={480}
      desktopTopPad={0}
      footer={enCours && etat === "attente" ? undefined : <ButtonLink href="/rapport">{RETOUR_PAIEMENT.revenir}</ButtonLink>}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-6 pt-16 text-center">
        {etat === "attente" && <TypingDots label={RETOUR_PAIEMENT.attente} />}
        <p role="status" className="m-0 max-w-[340px] text-corps font-extrabold leading-[1.45] text-soft">
          {RETOUR_PAIEMENT[etat]}
        </p>
      </div>
    </Screen>
  );
}
