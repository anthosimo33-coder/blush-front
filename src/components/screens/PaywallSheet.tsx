"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { invalidate } from "@/lib/query";
import { unlock } from "@/services/api";
import { OFFERS, PAYWALL } from "@/mocks/daily";
import { Button } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/FileInput";
import { Tag } from "@/components/ui/messages";
import { Sheet } from "@/components/ui/surfaces";
import type { Offer, Plan } from "@/types";

/**
 * Écran 10 — Paiement : CRUSH+ (conseillé) ou le rapport complet, un seul bouton « Débloquer ».
 * `only="crushplus"` sert de porte d’entrée aux fonctions CRUSH+ (accueil, aide à chaque message, fiche).
 */
export function PaywallSheet({
  open,
  onClose,
  onUnlocked,
  otherName = "Sophie",
  only,
  next,
}: {
  open: boolean;
  onClose: () => void;
  onUnlocked?: (plan: Exclude<Plan, "gratuit">) => void;
  otherName?: string;
  only?: Offer["id"];
  /** Où reprendre après la page « C’est débloqué » (par défaut : la suite du rapport). */
  next?: string;
}) {
  const router = useRouter();
  const offers = only ? OFFERS.filter((o) => o.id === only) : OFFERS;
  const [selected, setSelected] = useState<Offer["id"]>(only ?? "crushplus");
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    setBusy(true);
    await unlock(selected);
    invalidate("report", "account");
    setBusy(false);
    /* Le parent ferme le panneau : fermer n’est pas annuler. Puis le moment « C’est débloqué ». */
    onUnlocked?.(selected);
    router.push(`/rapport/debloque?offre=${selected}${next ? `&suite=${encodeURIComponent(next)}` : ""}`);
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy="paywall-title">
      <h2 id="paywall-title" className="m-0 text-[26px] font-black leading-[1.05] tracking-[-0.02em] [text-wrap:balance] lg:text-[32px]">
        {only ? "CRUSH+" : PAYWALL.title(otherName)}
      </h2>
      {!only && <p className="m-0 text-[14px] font-bold leading-[1.45] text-soft lg:text-[15px]">{PAYWALL.subtitle}</p>}
      {/* Les offres, comme un choix d’abonnement sur iPhone : un rond à cocher, le prix aligné à droite */}
      <div role="radiogroup" aria-label="Ton offre" className="flex flex-col gap-2.5">
        {offers.map((o) => {
          const on = selected === o.id;
          const [amount, period] = o.price.split(" / ");
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setSelected(o.id)}
              className={cn("lift flex items-center gap-3.5 rounded-[20px] bg-white px-4 py-4 text-left text-ink", on ? "shadow-selected" : "shadow-soft")}
            >
              <span aria-hidden="true" className={cn("flex size-6 shrink-0 items-center justify-center rounded-full transition-colors", on ? "bg-ink" : "bg-white shadow-[inset_0_0_0_2px_#D6D2C8]")}>
                {on && <span className="size-2 rounded-full bg-white" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[16px] font-black leading-[1.25]">
                    <span className="lg:hidden">{o.title}</span>
                    <span className="hidden lg:inline">{o.titleDesktop}</span>
                  </span>
                  {o.recommended && <Tag tone="conseille" />}
                </span>
                <span className="text-[13px] font-extrabold leading-[1.4] text-grey">
                  <span className="lg:hidden">{o.note}</span>
                  <span className="hidden lg:inline">{o.noteDesktop}</span>
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-[21px] font-black leading-none tracking-[-0.01em] lg:text-[23px]">{amount}</span>
                {period && <span className="mt-1 text-[12px] font-extrabold text-grey">/ {period}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-3 lg:w-[360px] lg:gap-4 lg:self-center">
        <Button arrow={!busy} onClick={busy ? undefined : pay} aria-busy={busy}>
          {busy ? <TypingDots color="#FFFFFF" label="Paiement en cours" /> : "Débloquer"}
        </Button>
        <span className="text-center text-[12px] font-extrabold text-grey">{PAYWALL.payments}</span>
      </div>
    </Sheet>
  );
}
