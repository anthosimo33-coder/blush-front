import { useId } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
import type { BlocArticle, Replique } from "@/contenu/articles/types";
import { BulleMini } from "./bulle";
import { BullesDeConv, EnTeteDeConv, fondDe, Telephone, type Mode } from "./ecran";
import { appliDuRang } from "./lecture";
import { BlocAide } from "./pieces";
import { MorceauDuTexte } from "./texte";
import { ROSE_VIF } from "./titre";

/*
 * Les morceaux d’une section d’article (BlocArticle, src/contenu/articles/types.ts), rendus sur le serveur. Le texte en
 * colonne de lecture (la première phrase de la section en attaque : ./texte.tsx), les mini-convs (à plat dans une carte,
 * puis dans un téléphone sur un ordinateur : ./ecran.tsx), BLUSH en grandes bulles roses inclinées (les citations du
 * magazine), « Ce que BLUSH regarde » (un écran de l’appli sur un ordinateur), « Les pièges », et le bloc d’aide. Chaque
 * bloc visuel a son titre et sa ligne qui dit ce qu’il montre, comme une fiche produit. Les marges verticales se fondent
 * (pas de flex) : un paragraphe suit un autre de près, une figure prend de l’air.
 * `telephone` : les figures passent dans un téléphone sur un ordinateur (un guide) ; sans lui, elles restent à plat
 * partout (une entrée du lexique, plus courte). `sobre` : la zone rouge (la violence, la détresse, les mineurs), où BLUSH
 * parle sans autocollant : ses bulles droites, blanches, à l’encre.
 */

/** Les marges d’une figure dans la colonne : de l’air autour, et sur un ordinateur, un peu plus large que le texte. */
const FIGURE = "my-10 ordi:-mx-12 ordi:my-14";

/** Le fond d’une scène de figure, sur un ordinateur : le papier qui s’éclaire, une lueur rose en haut (BLUSH), une bleue en bas (toi). */
const SCENE =
  "ordi:[background:radial-gradient(60%_70%_at_88%_0%,rgba(255,155,203,0.3),rgba(255,155,203,0)_70%),radial-gradient(60%_70%_at_10%_100%,rgba(61,139,255,0.13),rgba(61,139,255,0)_70%),linear-gradient(180deg,#ffffff,#f1ede6)]";

/** Une figure en deux volets sur un ordinateur : sa légende à gauche, le téléphone à droite, coupé par le bas de la scène. */
const DEUX_VOLETS = "ordi:grid ordi:grid-cols-[280px_minmax(0,1fr)] ordi:items-center ordi:gap-x-10 ordi:rounded-[36px] ordi:pl-12 ordi:pr-12 ordi:pt-12 ordi:shadow-card";

/**
 * Une mini-conv : « La conv » (son appli, la pastille « exemple inventé », les bulles), puis « Ce que ça montre » (sa
 * légende). À plat, une carte en deux volets, l’un sous l’autre (côte à côte dès qu’il y a la place, dans le lexique) ;
 * dans un guide sur un ordinateur, une figure de magazine : la légende à gauche, le téléphone à droite. `rang` : sa place
 * parmi les convs de la page (son appli en dépend).
 */
function Conv({ repliques, legende, rang, telephone }: { repliques: readonly Replique[]; legende?: string; rang: number; telephone: boolean }) {
  const appli = appliDuRang(rang);
  const mode: Mode = telephone ? "adaptatif" : "carte";
  return (
    <figure
      data-conv=""
      className={cn(
        "m-0 overflow-hidden rounded-[26px] bg-white shadow-card",
        telephone
          ? cn(FIGURE, SCENE, legende && DEUX_VOLETS, !legende && "ordi:flex ordi:justify-center ordi:rounded-[36px] ordi:pt-12")
          : cn("my-8", legende && "sm:grid sm:grid-cols-[1.1fr_1fr]"),
      )}
    >
      <div className={cn(telephone && "ordi:order-2 ordi:flex ordi:justify-end")}>
        <Telephone mode={mode} fond={fondDe(appli)}>
          <EnTeteDeConv appli={appli} mode={mode} />
          <BullesDeConv appli={appli} repliques={repliques} mode={mode} />
        </Telephone>
      </div>
      {legende && (
        <figcaption
          className={cn(
            "flex flex-col gap-1.5 border-t border-sep bg-[#fbfaf7] px-4 pb-5 pt-4",
            telephone ? "ordi:order-1 ordi:gap-3 ordi:self-center ordi:border-0 ordi:bg-transparent ordi:p-0 ordi:pb-12" : "sm:border-l sm:border-t-0 sm:px-5",
          )}
        >
          <span className="flex items-center gap-1.5 text-legende font-black text-elle-ink">
            <Icon name="eye" size={15} stroke={2.4} />
            Ce que ça montre
          </span>
          <span className={cn("text-[16px] font-bold leading-[1.55] text-ink/85", telephone && "ordi:text-[19px] ordi:leading-[1.5] ordi:tracking-[-0.01em] ordi:text-ink")}>
            {legende}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

/**
 * BLUSH qui parle : ses bulles roses, grandes et penchées tour à tour, sa bulle à côté de la dernière. Les citations du
 * magazine. `sobre` (la zone rouge) : les mêmes bulles, droites, blanches et à l’encre, sans rien d’un autocollant.
 */
function BullesBlush({ bulles, telephone, sobre }: { bulles: readonly string[]; telephone: boolean; sobre: boolean }) {
  return (
    <div className={cn("my-9 flex flex-col items-start gap-2.5", telephone && "ordi:my-12 ordi:-ml-[58px]")}>
      {bulles.map((b, k) => {
        const derniere = k === bulles.length - 1;
        return (
          <div key={k} className="flex max-w-full items-end gap-2.5">
            {derniere ? <BulleMini size={36} className="-mb-1 ordi:size-11" /> : <span aria-hidden="true" className="w-9 shrink-0 ordi:w-11" />}
            {/* 19 px en gras au moins : un grand texte, à qui le rose vif suffit (3:1) */}
            <p
              className={cn(
                "m-0 min-w-0 max-w-[520px] rounded-[22px] px-4 pb-2.5 pt-2 text-[19px] font-black leading-[1.24] tracking-[-0.012em] ordi:px-5 ordi:pb-3 ordi:pt-2.5 ordi:text-[23px]",
                sobre
                  ? "bg-white text-ink shadow-card"
                  : cn("text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_18px_34px_-18px_rgba(232,53,138,0.85)]", ROSE_VIF, k % 2 ? "rotate-1" : "-rotate-[1.5deg]"),
                derniere && "rounded-bl-[6px]",
              )}
            >
              <span className="sr-only">BLUSH{NBSP}: </span>
              {b}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * « Ce que BLUSH regarde » : son titre et ce qu’il montre, puis les signes numérotés en rose. À plat, une carte ; dans un
 * guide sur un ordinateur, un écran de l’appli (sa barre de lecture, ses lignes), dans le téléphone, le titre à gauche.
 * Cet écran de l’appli (le retour, « blush », la barre de lecture pleine) n’existe pas tel quel dans BLUSH : une greffe
 * des juges, gardée telle quelle et sans mention « illustration » (décidé par l’utilisateur le 4 novembre 2026).
 */
function Regarde({ signes, telephone }: { signes: readonly string[]; telephone: boolean }) {
  const titre = useId();
  const mode: Mode = telephone ? "adaptatif" : "carte";
  const enTel = telephone ? "hidden ordi:flex" : "hidden";
  return (
    <aside aria-labelledby={titre} className={cn("overflow-hidden rounded-[26px] bg-white shadow-card", telephone ? cn(FIGURE, SCENE, DEUX_VOLETS) : "my-8")}>
      <div className={cn("flex items-center gap-3.5 px-5 pt-5", telephone && "ordi:order-1 ordi:flex-col ordi:items-start ordi:gap-4 ordi:self-center ordi:p-0 ordi:pb-12")}>
        <BulleMini size={44} className={cn(telephone && "ordi:size-14")} />
        <div className="flex min-w-0 flex-col gap-0.5 ordi:gap-1.5">
          <h3 id={titre} className={cn("m-0 text-[21px] font-black leading-[1.15] tracking-[-0.02em]", telephone && "ordi:text-[28px]")}>
            Ce que BLUSH regarde
          </h3>
          <p className={cn("m-0 text-[15px] font-bold leading-[1.45] text-grey", telephone && "ordi:text-[17px]")}>Les signes qu’il lit dans une conv importée, pour ce cas-là.</p>
        </div>
      </div>
      <div className={cn(telephone && "ordi:order-2 ordi:flex ordi:justify-end")}>
        <Telephone mode={mode} fond={telephone ? "ordi:[background:var(--paper-light)]" : undefined}>
          {/* L’en-tête de l’appli, dans le téléphone : le retour, la bulle et « blush », puis sa barre de lecture, pleine */}
          <div aria-hidden="true" className={cn("items-center justify-between px-4 pb-2 pt-1.5", enTel)}>
            <Icon name="back" size={20} stroke={2.6} className="text-ink" />
            <span className="flex items-center gap-1.5 text-[17px] font-black tracking-[-0.03em] text-ink">
              <BulleMini size={22} />
              blush
            </span>
            <span className="w-5" />
          </div>
          <div aria-hidden="true" className={cn("mx-4 mb-3 h-[3px] rounded-full [background:var(--degrade-lecture)]", telephone ? "hidden ordi:block" : "hidden")} />
          <ol className={cn("m-0 mt-3 list-none px-5 pb-1.5", telephone && "ordi:mx-3 ordi:mt-0 ordi:rounded-[20px] ordi:bg-white ordi:px-4 ordi:pb-0 ordi:shadow-card")}>
            {signes.map((s, k) => (
              <li
                key={s}
                className={cn(
                  "flex gap-3.5 border-t border-sep py-3.5 text-[16px] font-extrabold leading-[1.45] text-ink",
                  telephone && "ordi:py-3 ordi:text-[14.5px] ordi:first:border-t-0",
                )}
              >
                <span aria-hidden="true" className="w-6 shrink-0 pt-px text-note font-black tabular-nums text-elle-ink">
                  {String(k + 1).padStart(2, "0")}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </Telephone>
      </div>
    </aside>
  );
}

/** « Les pièges » : son titre et ce qu’il montre, puis ce qu’il vaut mieux ne pas faire, chaque ligne barrée d’une croix ambre. */
function Pieges({ pieges, telephone }: { pieges: readonly string[]; telephone: boolean }) {
  const titre = useId();
  return (
    <aside
      aria-labelledby={titre}
      className={cn("rounded-[26px] bg-white px-5 pb-2 pt-5 shadow-card", telephone ? cn(FIGURE, "ordi:rounded-[36px] ordi:px-12 ordi:pb-4 ordi:pt-10") : "my-8")}
    >
      <div className="flex items-center gap-3.5">
        <span
          aria-hidden="true"
          className={cn("flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[#fff1dc] text-attente-ink", telephone && "ordi:size-14 ordi:rounded-[18px]")}
        >
          <Icon name="alert" size={22} stroke={2.4} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={titre} className={cn("m-0 text-[21px] font-black leading-[1.15] tracking-[-0.02em]", telephone && "ordi:text-[28px]")}>
            Les pièges
          </h3>
          <p className={cn("m-0 text-[15px] font-bold leading-[1.45] text-grey", telephone && "ordi:text-[17px]")}>Ce qu’il vaut mieux éviter, même quand l’envie est là.</p>
        </div>
      </div>
      <ul className="m-0 mt-4 list-none p-0 ordi:mt-6">
        {pieges.map((p) => (
          <li key={p} className="flex gap-3.5 border-t border-sep py-3.5 text-[16px] font-extrabold leading-[1.45] text-ink ordi:py-4 ordi:text-[17px]">
            <span aria-hidden="true" className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-[#fff1dc] text-attente-ink">
              <Icon name="close" size={13} stroke={3} />
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * Les morceaux d’une section, dans l’ordre ; la première phrase de son premier paragraphe en attaque. `rangDesConvs` :
 * le rang de sa première mini-conv parmi celles de la page (l’appli de chacune en dépend) ; `rangDeCouverture` : celui de
 * la conv que la couverture montre déjà dans un téléphone (couvertureDe), qui reste à plat ici, sur un ordinateur aussi :
 * le même téléphone ne revient pas deux fois dans la page. `sobre` : la zone rouge (BullesBlush).
 */
export function BlocsArticle({
  blocs,
  rangDesConvs,
  telephone,
  rangDeCouverture = null,
  sobre = false,
}: {
  blocs: readonly BlocArticle[];
  rangDesConvs: number;
  telephone: boolean;
  rangDeCouverture?: number | null;
  sobre?: boolean;
}) {
  const premier = blocs.findIndex((b) => b.type === "paragraphe");
  /* Le rang de chaque bloc parmi les convs de la page : celui de la section, plus ses convs d’avant */
  const rangs = blocs.map((_, k) => rangDesConvs + blocs.slice(0, k).filter((b) => b.type === "conv").length);
  return blocs.map((b, k) => {
    switch (b.type) {
      case "paragraphe":
      case "liste":
        return <MorceauDuTexte key={k} morceau={b} attaque={k === premier} />;
      case "conv": {
        const rang = rangs[k] ?? 0;
        return <Conv key={k} repliques={b.repliques} legende={b.legende} rang={rang} telephone={telephone && rang !== rangDeCouverture} />;
      }
      case "blush":
        return <BullesBlush key={k} bulles={b.bulles} telephone={telephone} sobre={sobre} />;
      case "regarde":
        return <Regarde key={k} signes={b.signes} telephone={telephone} />;
      case "pieges":
        return <Pieges key={k} pieges={b.pieges} telephone={telephone} />;
      case "aide":
        return (
          <div key={k} className="my-10">
            <BlocAide />
          </div>
        );
    }
  });
}
