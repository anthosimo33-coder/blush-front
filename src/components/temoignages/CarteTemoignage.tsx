import { BubbleLogo } from "@/components/brand/objects3d";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/icons";
import { TEMOIGNAGES } from "@/contenu/landing";
import { cn } from "@/lib/cn";
import type { Testimonial } from "@/types";

/*
 * Un témoignage, sur la landing et sous le paywall (la maquette A1, « La phrase qui reste », choisie le 16 octobre) :
 * ce que BLUSH a vu pour elle, sa phrase qui reste en grand, son avis en entier (le passage sur BLUSH surligné), puis qui
 * elle est, avec sa photo s’il l’a donnée. Ses mots ne changent jamais : la phrase et le passage sont des morceaux de son
 * avis, mot pour mot (tests/client/temoignages.test.tsx).
 */

/** Sa situation en couleur : le petit rond sur son initiale et son étiquette (rose : un crush, vert : en couple, violet : c’est flou). */
const TEINTES = {
  elle: { rond: "bg-elle", etiquette: "bg-[#FFF0F6] text-elle-ink" },
  vrai: { rond: "bg-vrai", etiquette: "bg-[#E6F6EF] text-vrai-ink" },
  flou: { rond: "bg-flou", etiquette: "bg-[#F1ECFF] text-flou-ink" },
} as const;

/** Sa phrase qui reste, en grand : une majuscule, un point au bout s’il manque, entre guillemets. */
export function enCitation(morceau: string): string {
  const phrase = morceau.charAt(0).toUpperCase() + morceau.slice(1);
  return `«\u00a0${/[.!?…]$/.test(phrase) ? phrase : `${phrase}.`}\u00a0»`;
}

/** Son avis, le passage sur BLUSH surligné (introuvable : l’avis tel quel). */
function AvisSurligne({ text, surligne }: { text: string; surligne: string }) {
  const debut = text.indexOf(surligne);
  if (debut < 0) return text;
  return (
    <>
      {text.slice(0, debut)}
      <mark className="font-extrabold text-ink [background:linear-gradient(transparent_56%,#FFD3E6_56%)]">{surligne}</mark>
      {text.slice(debut + surligne.length)}
    </>
  );
}

export function CarteTemoignage({ t, className }: { t: Testimonial; className?: string }) {
  const teinte = TEINTES[t.teinte];
  return (
    <figure className={cn("m-0 flex flex-col gap-3.5 rounded-[24px] bg-white p-5 shadow-card lg:gap-[18px] lg:rounded-[28px] lg:p-7", className)}>
      <p className="m-0 flex items-center gap-2 self-start rounded-[14px] bg-[#FFF0F6] py-[7px] pl-[9px] pr-3 lg:gap-[9px] lg:py-2 lg:pl-2.5 lg:pr-3.5">
        <BubbleLogo size={16} glow={false} />
        <span className="flex flex-col gap-px">
          <span className="text-[11px] font-black uppercase leading-[1.3] tracking-[0.08em] text-elle-ink">{TEMOIGNAGES.aVu}</span>
          <span className="text-note font-black leading-[1.3] text-ink">{t.vu}</span>
        </span>
      </p>
      <p className="m-0 text-[23px] font-black leading-[1.15] tracking-[-0.02em] [text-wrap:pretty] lg:text-[27px] lg:tracking-[-0.025em]">{enCitation(t.citation)}</p>
      <blockquote className="m-0 text-note font-bold leading-[1.55] text-soft lg:text-detail lg:leading-[1.6]">
        <AvisSurligne text={t.text} surligne={t.surligne} />
      </blockquote>
      <figcaption className="mt-auto flex items-center gap-3 border-t border-sep pt-3.5 lg:pt-4">
        <span aria-hidden="true" className="relative shrink-0">
          {t.photo ? (
            /* Sa photo, déjà à la bonne taille (256 px pour un rond de 44) : servie telle quelle, sans passer par l’optimiseur */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.photo}
              alt=""
              width={44}
              height={44}
              loading="lazy"
              decoding="async"
              className="block size-11 rounded-full bg-sep object-cover shadow-[0_3px_8px_-3px_rgba(17,17,20,0.3)]"
            />
          ) : (
            <Avatar tone="toi" size={44}>
              {t.name.charAt(0)}
            </Avatar>
          )}
          <span className={cn("absolute -bottom-[3px] -right-[5px] flex size-[22px] items-center justify-center rounded-full text-white shadow-[0_0_0_2.5px_#fff]", teinte.rond)}>
            <Icon name="heart" size={12} stroke={0} fill="currentColor" />
          </span>
        </span>
        <span className="min-w-0 flex-1 text-corps font-black lg:text-accent">{t.name}</span>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-micro font-black lg:text-legende", teinte.etiquette)}>{t.label}</span>
      </figcaption>
    </figure>
  );
}
