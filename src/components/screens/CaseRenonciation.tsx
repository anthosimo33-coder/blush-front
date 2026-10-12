"use client";

import { RENONCIATION } from "@/contenu/paiement";
import { cn } from "@/lib/cn";

/**
 * La case « Je veux mon rapport tout de suite et je renonce à mon droit de rétractation » (Code de la consommation,
 * L221-28 13°), à cocher avant chaque paiement : sans elle, le bouton ne paie pas (et le serveur refuse : 422
 * « renonciation »). `quoi` : le rapport, ou des bulles seules. `manque` : on a appuyé sans la cocher, elle le dit. Une
 * vraie case du navigateur (son libellé la coche aussi), à l’allure de BLUSH : la vague 2 la met au dessin du prototype.
 */
export function CaseRenonciation({
  quoi,
  cochee,
  onChange,
  manque = false,
  className,
}: {
  quoi: "rapport" | "bulles";
  cochee: boolean;
  onChange: (v: boolean) => void;
  manque?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="flex cursor-pointer items-start gap-2.5 text-left text-legende font-extrabold leading-[1.4] text-soft">
        <input
          type="checkbox"
          checked={cochee}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={manque || undefined}
          className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-ink"
        />
        <span>{RENONCIATION[quoi]}</span>
      </label>
      {manque && (
        <p role="alert" className="m-0 text-legende font-extrabold text-elle-ink">
          {RENONCIATION.manque}
        </p>
      )}
    </div>
  );
}
