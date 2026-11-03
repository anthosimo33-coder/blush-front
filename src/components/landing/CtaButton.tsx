import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import { ctaDe, type Retour } from "./cta";

/*
 * Le bouton principal de la landing, rendu sur le serveur, seul dans son fichier : les pages des guides et du lexique
 * (src/components/article) le reprennent tel quel, sans tirer avec lui les îlots de la landing (ilots.tsx, que les
 * autres morceaux de parts.tsx importent), ni leur code dans le navigateur.
 */

/** Le bouton principal de la landing : noir sur le papier, ou `blanc` sur le rose du pied de page. */
export function CtaButton({ retour, blanc = false, className }: { retour: Retour; blanc?: boolean; className?: string }) {
  const cta = ctaDe(retour);
  return (
    <Link
      href={cta.href}
      prefetch={cta.prefetch}
      scroll={cta.scroll}
      className={cn(
        "arrow-nudge lift lift-sm inline-flex h-[60px] items-center justify-center gap-2.5 rounded-[30px] px-9 text-carte font-black no-underline",
        blanc
          ? "lift-rose bg-white text-ink shadow-[0_1px_2px_rgba(110,0,50,0.16),0_18px_36px_-14px_rgba(110,0,50,0.55)]"
          : "lift-ink text-white shadow-ink [background:var(--btn-ink-bg)]",
        className,
      )}
    >
      {cta.label}
      <Icon name="arrow" size={19} stroke={2.6} className={cn("arrow", blanc ? "text-ink" : "text-white")} />
    </Link>
  );
}
