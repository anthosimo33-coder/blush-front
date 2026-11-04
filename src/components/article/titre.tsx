import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import type { Article } from "@/contenu/articles/types";
import { decouper, titreEnDeuxTemps, type Morceau, type Ton } from "./lecture";

/*
 * Les titres des guides, du lexique et des pages de confiance, rendus sur le serveur : composés comme dans un magazine
 * (un mot court ne reste pas seul en bout de ligne, un mot à trait d’union ne se coupe pas), et leurs mots surlignés
 * dans les bulles inclinées du titre de la landing (src/components/landing/Hero.tsx) : la situation (ou BLUSH) en
 * rose, l’action (toi) en bleu. Le texte ne change jamais : seuls des groupes insécables et des bulles l’habillent, et
 * les moteurs lisent le titre entier.
 */

/** Un mot qu’on ne laisse pas seul en bout de ligne : une ou deux lettres (« à », « et », « ce »). */
const COURT = /^[\p{L}’']{1,2}$/u;

/**
 * Un texte de titre composé comme dans un magazine : un mot court se colle au suivant (jamais « à » seul en bout de
 * ligne), un mot à trait d’union ne se coupe pas (« qu’est-ce »). Le texte reste le même, espaces comprises : seuls des
 * groupes insécables l’habillent (aucune insécable ajoutée).
 */
export function Compose({ texte }: { texte: string }) {
  const debut = /^ */.exec(texte)?.[0] ?? "";
  const fin = / *$/.exec(texte)?.[0] ?? "";
  /* Seules les espaces simples bordent les mots : trim() mangerait l’insécable d’un morceau qui en part (« ?» après une bulle) */
  const mots = texte
    .slice(debut.length, texte.length - fin.length)
    .split(/ +/)
    .filter(Boolean);
  /* Les mots courts s’accumulent jusqu’au premier mot plein, qui ferme leur groupe */
  const groupes: string[] = [];
  let enAttente = "";
  for (const mot of mots) {
    const groupe = enAttente ? `${enAttente} ${mot}` : mot;
    if (COURT.test(mot)) enAttente = groupe;
    else {
      groupes.push(groupe);
      enAttente = "";
    }
  }
  if (enAttente) groupes.push(enAttente);
  return (
    <>
      {debut}
      {groupes.map((g, k) => (
        <span key={k}>
          {k > 0 && " "}
          {g.includes(" ") || g.includes("-") ? <span className="whitespace-nowrap">{g}</span> : g}
        </span>
      ))}
      {fin}
    </>
  );
}

/**
 * Le rose des grandes bulles, du titre aux paroles de BLUSH : celui de la landing, parti de --elle et non de son rose
 * pâle, pour que le texte blanc d’au moins 19 px en gras garde 3:1 partout (3,1:1 au plus clair, 4:1 au plus foncé).
 * Sous un texte blanc plus petit, le rose profond (ROSE_PROFOND).
 */
export const ROSE_VIF = "[background:linear-gradient(160deg,var(--elle),#e8358a)]";

/** Le rose profond, sous un texte blanc de moins de 19 px : de #d4317e à l’encre rose, 4,6:1 au moins. */
export const ROSE_PROFOND = "[background:linear-gradient(160deg,#d4317e,var(--color-elle-ink))]";

/**
 * Une expression dans une bulle inclinée, comme le titre de la landing : la situation (rose, penchée à gauche) ou
 * l’action (bleue, penchée à droite). D’un bloc : elle passe à la ligne entière, jamais coupée par le bord (les
 * garde-fous la gardent courte, SURLIGNE_MAX) ; plus large que sa colonne, elle passe à la ligne dans sa bulle plutôt que
 * de déborder de l’écran. `petit` : dans un titre de moins de 19 px (une carte), le rose profond, pour que le blanc garde
 * 4,5:1.
 */
export function Surligne({ ton, petit = false, children }: { ton: Ton; petit?: boolean; children: string }) {
  return (
    <span
      className={cn(
        "mx-[0.03em] inline-block max-w-full whitespace-normal px-[0.28em] pb-[0.1em] pt-[0.02em] align-[0.04em] leading-[1.08] text-white",
        ton === "bleu"
          ? "rotate-[1.5deg] rounded-[0.48em_0.48em_0.16em_0.48em] bg-bubble-me shadow-[0_18px_32px_-18px_rgba(26,102,219,0.75)]"
          : cn(
              "-rotate-2 rounded-[0.48em_0.48em_0.48em_0.16em] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_18px_32px_-18px_rgba(232,53,138,0.8)]",
              petit ? ROSE_PROFOND : ROSE_VIF,
            ),
      )}
    >
      {children}
    </span>
  );
}

/** Des morceaux de titre, surlignés ou composés ; `sobre` (la zone rouge) : tous composés, à l’encre, sans bulle. */
function Morceaux({ morceaux, petit, sobre }: { morceaux: readonly Morceau[]; petit: boolean; sobre: boolean }) {
  return morceaux.map((m, k) =>
    m.ton && !sobre ? (
      <Surligne key={k} ton={m.ton} petit={petit}>
        {m.texte}
      </Surligne>
    ) : (
      <Compose key={k} texte={m.texte} />
    ),
  );
}

/**
 * Ce qui reste collé à une bulle, avant elle : le bout de mot qui la touche (« d’ » dans « Besoin d’en parler »), et un
 * mot court juste devant (« de » dans « À propos de BLUSH ») ; jamais seuls en bout de ligne. Seules les espaces simples
 * séparent : une insécable colle déjà.
 */
const COLLE_AVANT = /(?<![^ ])(?:[\p{L}’']{1,2} )?[^ ]*$/u;

/** Ce qui reste collé à une bulle, après elle : ce qui la touche jusqu’à la première espace simple (« ?» après une insécable). */
const COLLE_APRES = /^[^ ]*/;

/**
 * Ce qui suit la bulle en partant d’une insécable (« ?» de « Besoin d’en parler ? ») s’en rapproche un peu : sa marge et
 * son rembourrage creusaient l’espace, et le « ? » semblait détaché. Le texte ne change pas.
 */
const RAPPROCHE = "-ml-[0.12em]";

/**
 * Un titre d’un seul tenant (une page de confiance), son expression surlignée dans sa bulle : le reste composé comme un
 * titre de magazine, et ce qui touche la bulle reste sur sa ligne (COLLE_AVANT, COLLE_APRES). Le texte reste le titre
 * entier ; une expression absente du titre le laisse sans bulle.
 */
export function TitreSurligne({ texte, surligne }: { texte: string; surligne: { mots: string; ton: Ton } }) {
  const morceaux = decouper(texte, [surligne]);
  const k = morceaux.findIndex((m) => m.ton);
  if (k < 0) return <Compose texte={texte} />;
  const avant = k > 0 ? (morceaux[k - 1]?.texte ?? "") : "";
  const apres = morceaux[k + 1]?.texte ?? "";
  const colleAvant = COLLE_AVANT.exec(avant)?.[0] ?? "";
  const colleApres = COLLE_APRES.exec(apres)?.[0] ?? "";
  return (
    <>
      <Compose texte={avant.slice(0, avant.length - colleAvant.length)} />
      <span className="whitespace-nowrap">
        {colleAvant}
        <Surligne ton={surligne.ton}>{surligne.mots}</Surligne>
        {colleApres.startsWith("\u00a0") ? <span className={RAPPROCHE}>{colleApres}</span> : colleApres}
      </span>
      <Compose texte={apres.slice(colleApres.length)} />
    </>
  );
}

/**
 * Le titre d’un article en deux temps (titreEnDeuxTemps) : la requête en grand (`tete`, ses classes), puis sa promesse
 * dessous (`suite`), chacune avec ses mots surlignés. À poser dans le titre qui les porte (le h1 de la page, le h2 de la
 * une, le h3 d’une carte) : le texte reste le titre entier, les deux-points lus par les moteurs et les lecteurs d’écran,
 * remplacés à l’œil par le passage à la ligne. `petit` : un titre de carte, dont la suite passe sous 19 px (Surligne) ;
 * la tête, elle, reste un grand texte, au rose vif de la page (le même mot ne change pas de rose d’un écran à l’autre).
 * `sobre` : la zone rouge, le titre à l’encre, sans bulle (le sujet, « me menace », ne devient pas un autocollant).
 */
export function TitreEnDeuxTemps({
  article,
  tete,
  suite,
  petit = false,
  sobre = false,
}: {
  article: Pick<Article, "titre" | "surligne">;
  tete: string;
  suite: string;
  petit?: boolean;
  sobre?: boolean;
}) {
  const titre = titreEnDeuxTemps(article);
  return (
    <>
      <span className={cn("block", tete)}>
        <Morceaux morceaux={titre.tete} petit={false} sobre={sobre} />
        {titre.suite && <span className="sr-only">{NBSP}: </span>}
      </span>
      {titre.suite && (
        <span className={cn("block [text-wrap:balance] first-letter:uppercase", suite)}>
          <Morceaux morceaux={titre.suite} petit={petit} sobre={sobre} />
        </span>
      )}
    </>
  );
}
