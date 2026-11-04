import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/icons";
import type { LigneDAide } from "@/contenu/pages-de-confiance";

/*
 * Les gestes d’urgence, rendus sur le serveur, les mêmes sur /aide (src/app/aide/AideScreen.tsx) et dans le bloc d’aide
 * des guides et du lexique (BlocAide, src/components/article/pieces.tsx) : un numéro d’urgence seul en grand bouton bleu
 * (le 17, le 112, le 3114), une ligne d’urgence qui a sa phrase (le 114 par SMS). De simples liens tel:, sms: et https:,
 * lisibles sans JavaScript. Les numéros viennent tous de src/contenu/aide.ts, par GROUPES_D_AIDE.
 */

/** Une page d’un autre site s’ouvre à côté : la page d’où l’on vient reste là. */
export const aCote = (lien: string) => (lien.startsWith("https:") ? ({ target: "_blank", rel: "noopener" } as const) : {});

/** Le geste d’une ligne, en pictogramme : un appel, un SMS, ou une page. */
const GESTES: Record<string, IconName> = { tel: "phone", sms: "imessage", https: "arrow" };

/** Le pictogramme du geste d’un lien (tel:, sms:, https:). */
export const pictoDe = (lien: string): IconName => GESTES[lien.slice(0, lien.indexOf(":"))] ?? "arrow";

/** Le bleu des gestes d’urgence : celui des bulles de toi (5,3:1 sous le blanc), et son relief. */
const BLEU = "bg-bubble-me text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_14px_28px_-14px_rgba(26,102,219,0.85)]";

/** Les numéros d’urgence seuls (le 17, le 112, le 3114) d’un groupe d’aide : ceux qui n’ont ni phrase ni promesse. */
export const numerosSeuls = (lignes: readonly LigneDAide[]) => lignes.filter((l) => !l.pour && !l.detail);

/** Les lignes d’urgence qui ont leur phrase (le 114 par SMS). */
export const lignesAvecPhrase = (lignes: readonly LigneDAide[]) => lignes.filter((l) => l.pour || l.detail);

/**
 * Un numéro d’urgence seul (« Appeler le 17 »), en grand bouton bleu : « Appeler le » en petit, le numéro en très grand.
 * Le texte reste « Appeler le 17 », pour les lecteurs d’écran et les moteurs.
 */
export function BoutonDUrgence({ ligne }: { ligne: LigneDAide }) {
  const numero = ligne.nom.endsWith(ligne.label) ? ligne.label : null;
  return (
    <a
      href={ligne.lien}
      className={cn(
        "flex min-h-[88px] w-full flex-col items-center justify-center gap-1.5 rounded-[22px] px-1 text-center no-underline transition-[filter,scale] hover:brightness-110 active:scale-[0.97] min-[360px]:min-h-[96px] ordi:min-h-[116px] ordi:rounded-[26px]",
        BLEU,
      )}
    >
      {numero ? (
        <>
          {/* Sous 360 px, le combiné s’efface : « Appeler le » tient sur une ligne */}
          <span className="flex items-center gap-1 whitespace-nowrap text-[12.5px] font-extrabold leading-none ordi:text-note">
            <span className="inline-flex max-[359px]:hidden">
              <Icon name="phone" size={13} stroke={2.6} />
            </span>
            {ligne.nom.slice(0, -numero.length).trim()}
          </span>{" "}
          <span className="text-[clamp(27px,8.6vw,34px)] font-black leading-none tracking-[-0.03em] tabular-nums ordi:text-[40px]">{numero}</span>
        </>
      ) : (
        <span className="text-detail font-black">{ligne.nom}</span>
      )}
    </a>
  );
}

/**
 * Une ligne d’urgence qui a sa phrase (le 114 par SMS) : son nom, pour qui, ce qu’elle promet, puis son numéro, posé à
 * gauche en pastille bleue (le texte, lui, garde cet ordre). Toute la ligne à un toucher.
 */
export function LigneDUrgence({ ligne }: { ligne: LigneDAide }) {
  return (
    <a
      href={ligne.lien}
      {...aCote(ligne.lien)}
      className="flex items-start gap-3.5 rounded-[22px] bg-[rgba(26,102,219,0.07)] p-3.5 no-underline transition-colors hover:bg-[rgba(26,102,219,0.11)] ordi:rounded-[26px] ordi:p-5"
    >
      <span className="order-2 flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[17px] font-black leading-[1.3] text-ink">{ligne.nom}</span>
        {ligne.pour && <span className="text-[15px] font-extrabold leading-[1.4] text-ink">{ligne.pour}</span>}
        {ligne.detail && <span className="mt-0.5 text-note font-bold leading-[1.45] text-soft">{ligne.detail}</span>}
      </span>
      <span className={cn("order-1 flex size-[60px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[18px]", BLEU)}>
        <Icon name={pictoDe(ligne.lien)} size={15} stroke={2.6} />
        <span className="text-[19px] font-black leading-none tracking-[-0.02em] tabular-nums">{ligne.label}</span>
      </span>
    </a>
  );
}
