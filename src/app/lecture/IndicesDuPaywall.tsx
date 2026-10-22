import { useId } from "react";
import { dateDuHaut } from "@/contenu/haut-du-paywall";
import { PAYWALL } from "@/contenu/paiement";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import type { ApercuDuPaywall, MomentDuPaywall } from "@/types";

/*
 * Ta question et les moments cachés, sur le paywall (une proposition du 22 octobre 2026) : on vient avec une question,
 * le paywall la redit, montre ce que vos messages en disent déjà (les indices, comptés par le code), et ce qui reste
 * caché (ta devinette face à ses messages, de vrais messages de votre conv, floutés). Rien ne vient du modèle : le
 * paywall passe avant toute lecture (src/server/ecrans/indices.ts). data-prive : de vrais messages et ce que tu as dit,
 * masqués dans l’enregistrement des visites.
 */

const H = 3600e3;

/** Une attente : « 40 min », « 14 h », « 3 jours ». */
function attente(ms: number): string {
  if (ms < H) return `${Math.max(1, Math.round(ms / 60e3))}\u00a0min`;
  if (ms < 48 * H) return `${Math.round(ms / H)}\u00a0h`;
  return `${Math.round(ms / (24 * H))}\u00a0jours`;
}

/** Ta question de « Qui es-tu ? », ce que vos messages en montrent déjà, et ta devinette face aux siens (floutés). */
export function TaQuestion({ apercu, autre, il, className }: { apercu: ApercuDuPaywall; autre: string; il: boolean; className?: string }) {
  const q = apercu.question;
  const titre = useId();
  if (!q) return null;
  const t = PAYWALL.question;
  const indices = apercu.indices ?? [];
  return (
    <section data-prive="" aria-labelledby={titre} className={cn("flex flex-col gap-3 rounded-[22px] bg-white p-4 shadow-card lg:p-5", className)}>
      <div className="flex flex-col gap-1">
        <span className="text-legende font-black text-elle-ink">{t.titre}</span>
        <h2 id={titre} className="m-0 text-carte font-black leading-[1.2] [text-wrap:balance] lg:text-titre-3">
          {t.texte(q.objectif, autre, il)}
        </h2>
      </div>
      {indices.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-micro font-black text-grey">{t.deja}</span>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {indices.map((i) => (
              <li key={i.id} className="flex items-start gap-2 text-note font-extrabold leading-[1.35] text-ink">
                <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-elle" />
                {t.indice(i, autre)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="m-0 flex items-center gap-2 rounded-[14px] bg-paper px-3 py-2.5 text-note font-extrabold leading-[1.35] text-soft">
        <span className="min-w-0">{t.devinette(q.devinette)}</span>
        {/* Ce que disent ses messages : flouté, dans le rapport */}
        <span aria-hidden="true" className="h-2.5 min-w-10 flex-1 rounded-full bg-[rgba(17,17,20,0.16)] blur-[2px]" />
        <span className="sr-only">{t.cache}</span>
        <Icon name="lock" size={13} stroke={2.6} className="shrink-0 text-grey" />
      </p>
    </section>
  );
}

/** Ce que BLUSH a repéré dans votre conv : de vrais messages, floutés jusqu’au paiement ; rien sans moment. */
export function MomentsCaches({ moments, il, className }: { moments: MomentDuPaywall[]; il: boolean; className: string }) {
  const titre = useId();
  if (!moments.length) return null;
  const t = PAYWALL.moments;
  const annee = new Date().getFullYear();
  const valeur = (m: MomentDuPaywall) =>
    m.id === "attente" && m.valeur ? attente(m.valeur) : m.id === "long" && m.valeur ? t.mots(m.valeur) : dateDuHaut(m.jour, { annee, court: true });
  return (
    <section data-prive="" aria-labelledby={titre} className={cn("flex-col gap-3", className)}>
      <div className="flex flex-col gap-0.5">
        <h2 id={titre} className="m-0 text-detail font-black lg:text-carte">
          {t.titre}
        </h2>
        <p className="m-0 text-legende font-extrabold text-grey">{t.sous}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {moments.map((m) => (
          <li key={m.id} className="flex flex-col gap-2.5 rounded-[18px] bg-white p-3.5 shadow-card lg:p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="text-note font-black leading-[1.3]">{t.libelle(m.id, il)}</span>
              <span className="shrink-0 rounded-full bg-paper px-2.5 py-1 text-micro font-black text-soft">{valeur(m)}</span>
            </div>
            {/* Le message, flouté : on voit qu’il est là, pas ce qu’il dit */}
            <div
              className={cn(
                "relative max-w-[88%] overflow-hidden rounded-[16px] px-3 py-2",
                m.de === "toi" ? "self-end rounded-br-[5px] bg-bubble-me text-white" : "self-start rounded-bl-[5px] bg-bubble-her text-ink",
              )}
            >
              <span aria-hidden="true" className="block select-none font-message text-note font-bold leading-[1.35] blur-[5px]">
                {m.texte}
              </span>
              <span className="sr-only">{t.cache}</span>
              <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                <span className="flex size-7 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(17,17,20,0.18)]">
                  <Icon name="lock" size={12} stroke={2.6} className="text-ink" />
                </span>
              </span>
            </div>
            {m.id !== "bascule" && <span className={cn("text-micro font-extrabold text-grey", m.de === "toi" ? "self-end" : "self-start")}>{dateDuHaut(m.jour, { annee })}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
