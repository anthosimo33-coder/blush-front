import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { figtree } from "@/lib/fonts";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Icon } from "@/components/ui/icons";
import { Bubble, coinsDeBulle, placeDansLeGroupe } from "@/components/ui/messages";
import type { BlocArticle, Replique } from "@/contenu/articles/types";
import { BlocAide } from "./pieces";

/*
 * Les morceaux d’une section d’article (BlocArticle, src/contenu/articles/types.ts), rendus sur le serveur : le texte
 * en phrases complètes, les mini-convs inventées dans les bulles de l’appli, BLUSH dans ses bulles roses, les cartes
 * « Ce que BLUSH regarde » et « Les pièges », et le bloc d’aide.
 */

/** Le corps d’un article : assez grand pour se lire d’une traite sur un téléphone, une idée par paragraphe. */
const TEXTE_ARTICLE = "text-[16px] font-bold leading-[1.62] text-soft lg:text-[17px]";

/**
 * Une mini-conv, toujours marquée « exemple inventé » : l’autre en gris à gauche, toi en bleu à droite (les bulles de
 * l’appli, en Figtree), et sa légende dessous. Chaque bulle dit qui parle aux lecteurs d’écran.
 */
function MiniConv({ repliques, legende }: { repliques: readonly Replique[]; legende?: string }) {
  return (
    <figure className={cn("m-0 flex flex-col gap-2.5 rounded-[22px] bg-white px-4 pb-4 pt-3 shadow-card", figtree.variable)}>
      <span className="self-start rounded-full bg-plaque px-2.5 py-1 text-micro font-black text-grey">exemple inventé</span>
      <div className="flex flex-col gap-1.5">
        {repliques.map((r, k) => (
          <Bubble key={k} from={r.de === "moi" ? "toi" : "elle"}>
            <span className="sr-only">
              {r.de === "moi" ? "Toi" : "L’autre"}
              {NBSP}:{" "}
            </span>
            {r.texte}
          </Bubble>
        ))}
      </div>
      {legende && <figcaption className="text-legende font-extrabold leading-[1.45] text-grey">{legende}</figcaption>}
    </figure>
  );
}

/** BLUSH qui parle : ses bulles roses, groupées comme dans le chat, sa petite bulle à côté de la dernière. */
function BullesBlush({ bulles }: { bulles: readonly string[] }) {
  return (
    <div className="flex flex-col gap-[3px]">
      {bulles.map((b, k) => (
        <div key={k} className="flex items-end gap-2">
          {k === bulles.length - 1 ? <BubbleLogo size={30} className="-mb-0.5 shrink-0" /> : <span aria-hidden="true" className="w-[30px] shrink-0" />}
          <p
            className={cn(
              "m-0 max-w-[85%] rounded-[20px] px-3.5 pb-2 pt-1.5 text-detail font-black leading-[1.3] text-white [background:var(--rose-blush)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_22px_-14px_rgba(232,53,138,0.75)] lg:text-corps",
              coinsDeBulle("blush", placeDansLeGroupe(k, bulles.length)),
            )}
          >
            <span className="sr-only">BLUSH{NBSP}: </span>
            {b}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Une carte titrée avec ses lignes, chacune derrière son icône : « Ce que BLUSH regarde » et « Les pièges ». */
function CarteListe({ titre, icone, lignes }: { titre: string; icone: "regarde" | "piege"; lignes: readonly string[] }) {
  return (
    <aside aria-label={titre} className="flex flex-col gap-3 rounded-[22px] bg-white px-4 py-4 shadow-card">
      <h3 className="m-0 flex items-center gap-2 text-carte font-black text-ink">
        {icone === "regarde" ? <BubbleLogo size={26} className="shrink-0" /> : <Icon name="alert" size={20} stroke={2.4} className="shrink-0 text-attente-ink" />}
        {titre}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {lignes.map((l) => (
          <li key={l} className="flex gap-2.5 text-detail font-extrabold leading-[1.45] text-soft">
            <Icon
              name={icone === "regarde" ? "check" : "close"}
              size={17}
              stroke={2.8}
              className={cn("mt-0.5 shrink-0", icone === "regarde" ? "text-vrai-ink" : "text-attente-ink")}
            />
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Les morceaux d’une section, dans l’ordre. */
export function BlocsArticle({ blocs }: { blocs: readonly BlocArticle[] }) {
  return blocs.map((b, k) => {
    switch (b.type) {
      case "paragraphe":
        return (
          <p key={k} className={cn("m-0", TEXTE_ARTICLE)}>
            {b.texte}
          </p>
        );
      case "liste":
        return (
          <ul key={k} className={cn("m-0 flex list-disc flex-col gap-1.5 pl-5 marker:text-pale", TEXTE_ARTICLE)}>
            {b.elements.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        );
      case "conv":
        return <MiniConv key={k} repliques={b.repliques} legende={b.legende} />;
      case "blush":
        return <BullesBlush key={k} bulles={b.bulles} />;
      case "regarde":
        return <CarteListe key={k} titre="Ce que BLUSH regarde" icone="regarde" lignes={b.signes} />;
      case "pieges":
        return <CarteListe key={k} titre="Les pièges" icone="piege" lignes={b.pieges} />;
      case "aide":
        return <BlocAide key={k} />;
    }
  });
}
