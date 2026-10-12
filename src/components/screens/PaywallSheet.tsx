"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { codeDe } from "@/lib/messages-erreur";
import { unlock } from "@/services/api";
import { CATALOGUE, enEuros, FORMULE_CHOISIE, OFFERS, PAYWALL } from "@/contenu/offres";
import { Button } from "@/components/ui/Button";
import { RadioGroup } from "@/components/ui/controls";
import { Alert } from "@/components/ui/feedback";
import { Tag } from "@/components/ui/messages";
import { Sheet } from "@/components/ui/surfaces";
import type { Formule } from "@/types";

/**
 * Écran 10 — Paiement : les deux formules du catalogue (le rapport seul, ou Premium, choisie d’avance), un seul bouton
 * « Débloquer ». La feuille du prototype des bulles (« Ta formule ») la remplace avec le paiement par Whop.
 */
export function PaywallSheet({
  open,
  onClose,
  onUnlocked,
  otherName,
  chapitres,
  next,
}: {
  open: boolean;
  onClose: () => void;
  onUnlocked?: (offre: Formule) => void;
  otherName?: string;
  /** Combien de chapitres restent à lire (le rapport ouvert) : sans, la suite est dite sans compter. */
  chapitres?: number;
  /** Où reprendre après la page « C’est débloqué » (par défaut : la suite du rapport). */
  next?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Formule>(FORMULE_CHOISIE);
  const titre = useId();
  const [busy, setBusy] = useState(false);
  /*
   * Payé : le bouton reste occupé jusqu’à l’arrivée de « C’est débloqué », la feuille reste ouverte (elle part avec la
   * page). Fermer la feuille et relire le rapport avant faisait redessiner et sauter le rapport dessous.
   */
  const [navigue, demarrer] = useTransition();
  const paye = useRef<Formule | null>(null);
  const occupe = busy || navigue;
  /* La navigation finie sans quitter la page : le parent ferme le panneau (fermer n’est pas annuler) */
  useEffect(() => {
    if (navigue || !paye.current) return;
    const offre = paye.current;
    paye.current = null;
    onUnlocked?.(offre);
  }, [navigue, onUnlocked]);

  const [later, setLater] = useState(false);
  /* Autre chose que « bientôt » (le réseau, le serveur) : on le dit, le bouton se libère */
  const [souci, setSouci] = useState(false);

  const pay = async () => {
    setBusy(true);
    setSouci(false);
    try {
      await unlock(selected);
    } catch (e) {
      /* Sans paiement branché : seule l’équipe se débloque un rapport */
      setBusy(false);
      if (codeDe(e) === "bientot") setLater(true);
      else setSouci(true);
      return;
    }
    /* Le moment « C’est débloqué », qui relit le rapport et le compte en arrivant. Le bouton passe d’occupé (busy) à en route (navigue) sans se libérer */
    setBusy(false);
    paye.current = selected;
    demarrer(() => router.push(`/rapport/debloque?offre=${selected}${next ? `&suite=${encodeURIComponent(next)}` : ""}`));
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titre}>
      <h2 id={titre} className="m-0 text-[26px] font-black leading-[1.05] tracking-[-0.02em] [text-wrap:balance] lg:text-[32px]">
        {PAYWALL.title(otherName)}
      </h2>
      <p className="m-0 text-note font-bold leading-[1.45] text-soft lg:text-detail">{PAYWALL.subtitle(chapitres)}</p>
      {/* Les formules, comme un choix d’offre sur iPhone : un rond à cocher, le prix aligné à droite (barré dessous) */}
      <RadioGroup label="Ta formule" className="flex flex-col gap-2.5">
        {OFFERS.map((o) => {
          const on = selected === o.id;
          const { barre } = CATALOGUE[o.id];
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSelected(o.id)}
              className={cn("lift flex items-center gap-3.5 rounded-[20px] bg-white px-4 py-4 text-left text-ink", on ? "shadow-selected" : "shadow-soft")}
            >
              <span
                aria-hidden="true"
                className={cn("flex size-6 shrink-0 items-center justify-center rounded-full transition-colors", on ? "bg-ink" : "bg-white shadow-[inset_0_0_0_2px_#D6D2C8]")}
              >
                {on && <span className="size-2 rounded-full bg-white" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-corps font-black leading-[1.25]">
                    <span className="lg:hidden">{o.title}</span>
                    <span className="hidden lg:inline">{o.titleDesktop}</span>
                  </span>
                  {o.recommended && <Tag tone="conseille" />}
                </span>
                <span className="text-legende font-extrabold leading-[1.4] text-grey">
                  <span className="lg:hidden">{o.note}</span>
                  <span className="hidden lg:inline">{o.noteDesktop}</span>
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-[21px] font-black leading-none tracking-[-0.01em] lg:text-[23px]">{o.price}</span>
                {barre !== null && <s className="mt-1 text-micro font-extrabold text-grey">{enEuros(barre)}</s>}
              </span>
            </button>
          );
        })}
      </RadioGroup>
      <div className="flex flex-col gap-3 lg:w-[360px] lg:gap-4 lg:self-center">
        {later && (
          <p role="status" className="m-0 text-center text-note font-extrabold leading-[1.45] text-soft">
            Le paiement arrive très vite. Pour l’instant, BLUSH est ouvert sur invitation.
          </p>
        )}
        {souci && <Alert className="text-center leading-[1.45]">Ça n’a pas pu se faire. Vérifie ta connexion et réessaie.</Alert>}
        <Button arrow loading={occupe} loadingLabel="Paiement en cours" onClick={() => void pay()}>
          Débloquer
        </Button>
        <span className="text-center text-micro font-extrabold text-grey">{PAYWALL.payments}</span>
      </div>
    </Sheet>
  );
}
