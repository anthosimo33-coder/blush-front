import { useId } from "react";
import { PAYWALL } from "@/contenu/paiement";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icons";
import type { ApercuDuPaywall } from "@/types";

/*
 * Ta question, sur le paywall (une proposition du 22 octobre 2026) : on vient avec une question, le paywall la redit,
 * montre ce que vos messages en disent déjà (les indices, comptés par le code) et ce qui reste caché (ta devinette face
 * à ses messages, floutée). Rien ne vient du modèle : le paywall passe avant toute lecture (src/server/ecrans/indices.ts).
 * data-prive : ce que tu as dit sur « Qui es-tu ? », masqué dans l’enregistrement des visites. Les moments cachés (de
 * vrais messages floutés : la plus longue attente, son plus long message) ont été retirés le 22 octobre : « du
 * technique, rien d’émotionnel ».
 */

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
