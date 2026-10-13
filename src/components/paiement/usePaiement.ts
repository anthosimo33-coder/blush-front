"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { codeDe } from "@/lib/messages-erreur";
import { partirPayer, useLibererAuRetour } from "@/lib/paiement";
import { apresDeblocage } from "@/lib/requetes";
import { useAccord } from "@/components/juridique/cases";
import type { OffreId } from "@/types";

/*
 * Ce que chaque écran qui fait payer partage (la feuille « Ta formule », l’offre ①, l’offre ③, la recharge) : la renonciation,
 * le bouton occupé, et ce qu’on dit quand ça ne part pas. Payer passe par partirPayer (src/lib/paiement.ts) : le serveur
 * commence le paiement, puis on part sur la page de paiement de Whop (ou du faux Whop en local), d’où l’on revient sur
 * /paiement/retour. Le bouton reste occupé jusqu’à ce que la page s’en aille ; revenu de chez Whop par « Retour »
 * (le cache des pages du navigateur), il se libère.
 */

/** Pourquoi rien n’est parti, quand l’écran le dit : pas encore de paiement branché, ou le reste (le réseau, le serveur). */
type Refus = "bientot" | "souci";

/** Ce que l’écran fait quand le serveur refuse : le rapport déjà ouvert (un autre onglet a payé), l’offre unique passée. */
type QuandRefuse = { deja?: () => void; offre?: () => void };

/** La renonciation (que le geste de payer donne), l’état du bouton, et `payer(offre)` : le paiement au premier toucher, ou le refus dit. */
export function usePaiement({ suite, quand = {} }: { suite?: string | null; quand?: QuandRefuse }) {
  const router = useRouter();
  const renonciation = useAccord();
  const [parti, setParti] = useState(false);
  /* Le faux Whop et le retour sont des pages de l’appli : le bouton reste occupé jusqu’à leur arrivée */
  const [navigue, demarrer] = useTransition();
  const [refus, setRefus] = useState<Refus | null>(null);
  useLibererAuRetour(useCallback(() => setParti(false), []));

  const payer = async (offre: OffreId) => {
    if (!renonciation.exiger()) return;
    setParti(true);
    setRefus(null);
    try {
      await partirPayer(offre, { renonciation: true, suite, aller: (adresse) => demarrer(() => router.push(adresse as Route)) });
    } catch (e) {
      setParti(false);
      const code = codeDe(e);
      /* La renonciation n’est plus celle du serveur (son texte a changé depuis l’ouverture de la page) : à recharger */
      if (code === "renonciation") renonciation.perimer();
      else if (code === "bientot") setRefus("bientot");
      else if (code === "deja" && quand.deja) {
        /* Un autre onglet l’a déjà payé : le rapport et le compte se relisent, rien n’est à payer */
        apresDeblocage();
        router.refresh();
        quand.deja();
      } else if (code === "offre" && quand.offre) quand.offre();
      else setRefus("souci");
    }
  };

  return { renonciation, occupe: parti || navigue, refus, payer };
}
