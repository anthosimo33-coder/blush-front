"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { enEuros } from "@/contenu/offres";
import { fauxWhop } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/feedback";
import { Screen, ScreenTitle } from "@/components/shell/Screen";
import type { IssueDuFauxWhop, StatutAchat } from "@/types";

/** Ce qu’est déjà l’achat, dit en clair. */
const STATUTS: Record<StatutAchat, string> = { en_attente: "en attente", paye: "payé", echoue: "refusé", rembourse: "remboursé", conteste: "contesté" };

/**
 * Le faux Whop, en local et dans les tests : l’achat, son prix, et « Payer » ou « Refuser ». Chaque bouton fait
 * fabriquer au serveur le webhook que Whop enverrait (POST /api/paiement/factice), le poste à /api/paiement/whop comme
 * Whop, puis revient sur la page du retour. Un outil de l’équipe : ses textes ne sont pas ceux du produit.
 */
export function FauxWhopScreen({ achat, titre, centimes, statut }: { achat: string; titre: string; centimes: number; statut: StatutAchat }) {
  const router = useRouter();
  const [occupe, setOccupe] = useState<IssueDuFauxWhop | null>(null);
  const [souci, setSouci] = useState(false);
  const choisir = async (issue: IssueDuFauxWhop) => {
    setOccupe(issue);
    setSouci(false);
    try {
      const retour = await fauxWhop(achat, issue);
      if (retour) router.push(retour as Route);
    } catch {
      setOccupe(null);
      setSouci(true);
    }
  };
  return (
    <Screen mise="colonne" mainWidth={480}>
      <div className="flex flex-col gap-4 pt-10">
        <p className="m-0 text-legende font-black uppercase tracking-[0.08em] text-grey">Paiement factice · jamais en ligne</p>
        <ScreenTitle>{titre}</ScreenTitle>
        <p className="m-0 text-[40px] font-black leading-none">{enEuros(centimes)}</p>
        {statut !== "en_attente" && <p className="m-0 text-note font-extrabold text-soft">Cet achat est déjà {STATUTS[statut]}.</p>}
        {souci && <Alert>Le webhook n’est pas passé.</Alert>}
        <Button arrow loading={occupe === "payer"} loadingLabel="Paiement en cours" disabled={!!occupe} onClick={() => void choisir("payer")}>
          Payer
        </Button>
        <Button variant="secondary" loading={occupe === "refuser"} disabled={!!occupe} onClick={() => void choisir("refuser")}>
          Refuser
        </Button>
      </div>
    </Screen>
  );
}
