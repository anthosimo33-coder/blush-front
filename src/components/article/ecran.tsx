import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { figtree } from "@/lib/fonts";
import { NBSP } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
import { EXEMPLE_INVENTE } from "@/contenu/articles";
import type { Replique } from "@/contenu/articles/types";
import type { Appli } from "./lecture";

/*
 * Les écrans des guides et du lexique, rendus sur le serveur en HTML et CSS (aucune image, aucun script) : une mini-conv
 * telle qu’une appli l’affiche (iMessage, Instagram ou WhatsApp, chacune à ses couleurs), et le téléphone qui la porte.
 * Trois mises en page d’un même écran (`Mode`) :
 * - « carte » : la conv à plat, dans une carte (le lexique, et les guides sur un téléphone, où un téléphone dessiné
 *   coûterait 500 px de défilement pour trois répliques) : « La conv », la pastille « exemple inventé », les bulles ;
 * - « telephone » : un vrai téléphone, sa barre d’état, l’en-tête de l’appli (« exemple inventé » à la place du nom),
 *   coupé par le bas (la couverture d’un guide) ;
 * - « adaptatif » : la carte, puis le téléphone sur un ordinateur (les figures d’un guide).
 * Un seul écran dans la page, quelle que soit la largeur : chaque texte y est une fois (les moteurs, les lecteurs
 * d’écran et les garde-fous le lisent une fois). Seules les répliques viennent de l’article ; le décor (l’heure 9:41 des
 * visuels d’Apple, l’avatar sans visage) est caché aux lecteurs d’écran, sans prénom, sans photo, sans heure de message.
 * Une illustration qui redit l’article (`decor` : la couverture, l’image d’une carte) écrit ses textes en CSS (TexteDecor) :
 * cachée aux lecteurs d’écran, elle ne passe pas non plus devant la réponse courte dans le texte que lisent les moteurs.
 * La police des bulles (Figtree) se pose ici, sur chaque écran : seules les pages qui en dessinent la préchargent.
 */

/** Un texte de décor, écrit par le CSS (son attribut, repris par ::before) : affiché, mais absent du texte de la page. */
export function TexteDecor({ texte, className }: { texte: string; className?: string }) {
  return <span data-t={texte} className={cn("before:content-[attr(data-t)]", className)} />;
}

/** Un texte de l’écran : tel quel, ou en décor (TexteDecor). */
const texteDe = (texte: string, decor: boolean) => (decor ? <TexteDecor texte={texte} /> : texte);

/**
 * Un message tel que l’appli le met en page : l’émoji qui le finit reste collé au mot d’avant (une insécable), jamais
 * seul sur la dernière ligne de sa bulle. Le texte de l’article ne change pas, seule l’espace devant l’émoji.
 */
const colleLEmoji = (texte: string) => texte.replace(/ (\p{Extended_Pictographic}\uFE0F?)$/u, "\u00a0$1");

/** La mise en page d’un écran : à plat, dans un téléphone, ou à plat puis dans un téléphone sur un ordinateur. */
export type Mode = "carte" | "telephone" | "adaptatif";

/** Une classe par mode : `carte` à plat, `tel` dans le téléphone, et l’adaptatif, l’une puis l’autre sur un ordinateur (ordi:). */
const selon = (mode: Mode, { carte, tel, adaptatif }: { carte: string; tel: string; adaptatif: string }) => ({ carte, telephone: tel, adaptatif })[mode];

/** Le nom de chaque appli, tel qu’elle l’écrit. */
const NOMS: Record<Appli, string> = { imessage: "iMessage", instagram: "Instagram", whatsapp: "WhatsApp" };

/** Le fond de l’écran de chaque appli, derrière les bulles (la queue des bulles iMessage s’y découpe). */
const FONDS: Record<Appli, string> = { imessage: "bg-white", instagram: "bg-white", whatsapp: "bg-[#efeae2]" };

/** La barre d’état : l’heure des visuels d’Apple (en décor, hors du texte de la page), l’île, le réseau, le Wi-Fi et la batterie. */
function BarreDEtat({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("relative h-[50px] items-center justify-between px-[20px] pt-1 font-message text-[15px] font-extrabold text-ink", className)}>
      <TexteDecor texte="9:41" />
      <span className="absolute left-1/2 top-[11px] h-[30px] w-[80px] -translate-x-1/2 rounded-full bg-black" />
      <span className="flex items-center gap-[3px]">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" className="@max-[260px]:hidden">
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="4.6" y="5" width="3" height="6" rx="1" />
          <rect x="9.2" y="2.6" width="3" height="8.4" rx="1" />
          <rect x="13.8" y="0" width="3" height="11" rx="1" />
        </svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor">
          <path d="M7.5 2.2c2.1 0 4 .8 5.4 2.1l1.1-1.1A9.2 9.2 0 0 0 7.5.6 9.2 9.2 0 0 0 1 3.2l1.1 1.1a7.7 7.7 0 0 1 5.4-2.1Zm0 3.2c1.2 0 2.3.5 3.1 1.2l1.1-1.1a6 6 0 0 0-8.4 0l1.1 1.1c.8-.7 1.9-1.2 3.1-1.2Zm0 3.1-1.5 1.5L7.5 11 9 9.9 7.5 8.5Z" />
        </svg>
        <span className="relative flex h-[12px] w-[25px] items-center rounded-[4px] border border-[rgba(17,17,20,0.35)] p-[1.5px]">
          <span className="h-full w-[78%] rounded-[2px] bg-ink" />
          <span className="absolute -right-[3px] top-1/2 h-[4px] w-[1.5px] -translate-y-1/2 rounded-r bg-[rgba(17,17,20,0.4)]" />
        </span>
      </span>
    </div>
  );
}

/**
 * Le téléphone : son cadre (titane, boutons sur la tranche), sa barre d’état, puis son écran (`children`), coupé par le
 * bas. En mode « carte », rien de tout ça : l’écran seul, à plat. `fond` : celui de l’écran ; `etire` : il prend toute la
 * hauteur de son cadre (la couverture), au lieu de s’arrêter sous son contenu.
 */
export function Telephone({ mode, fond = "bg-white", etire = false, children }: { mode: Mode; fond?: string; etire?: boolean; children: ReactNode }) {
  const cadre = selon(mode, {
    carte: "",
    tel: "relative flex w-full max-w-[318px] flex-col rounded-t-[54px] px-[10px] pt-[10px]",
    adaptatif: "ordi:relative ordi:flex ordi:w-[318px] ordi:flex-col ordi:rounded-t-[54px] ordi:px-[10px] ordi:pt-[10px]",
  });
  const titane = selon(mode, {
    carte: "",
    tel: "bg-[linear-gradient(160deg,#3a3a3e,#1b1b1e_38%,#2a2a2e)] shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.14),0_0_0_1px_rgba(17,17,20,0.5),0_40px_70px_-30px_rgba(17,17,20,0.55)]",
    adaptatif:
      "ordi:bg-[linear-gradient(160deg,#3a3a3e,#1b1b1e_38%,#2a2a2e)] ordi:shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.14),0_0_0_1px_rgba(17,17,20,0.5),0_40px_70px_-30px_rgba(17,17,20,0.55)]",
  });
  const tranche = selon(mode, { carte: "hidden", tel: "block", adaptatif: "hidden ordi:block" });
  return (
    <div className={cn(cadre, titane, figtree.variable, etire && "self-stretch")}>
      {/* Les boutons sur la tranche : le silencieux, le volume, puis l’alimentation de l’autre côté */}
      <span aria-hidden="true" className={cn("absolute -left-[3px] top-[104px] h-[26px] w-[3px] rounded-l-[2px] bg-[#2a2a2e]", tranche)} />
      <span aria-hidden="true" className={cn("absolute -left-[3px] top-[150px] h-[48px] w-[3px] rounded-l-[2px] bg-[#2a2a2e]", tranche)} />
      <span aria-hidden="true" className={cn("absolute -right-[3px] top-[164px] h-[74px] w-[3px] rounded-r-[2px] bg-[#2a2a2e]", tranche)} />
      {/* Un conteneur : sur un écran étroit (une couverture réduite), la barre d’état laisse tomber le réseau */}
      <div
        className={cn(
          "@container relative",
          fond,
          selon(mode, { carte: "", tel: "overflow-hidden rounded-t-[44px] pb-7", adaptatif: "ordi:overflow-hidden ordi:rounded-t-[44px] ordi:pb-7" }),
          etire && "flex-1",
        )}
      >
        <BarreDEtat className={selon(mode, { carte: "hidden", tel: "flex", adaptatif: "hidden ordi:flex" })} />
        {children}
      </div>
    </div>
  );
}

/** Le pictogramme de chaque appli, sur sa couleur : il dit l’appli de la conv à plat (« carte »), où l’en-tête n’est pas. */
const PICTOS: Record<Appli, string> = {
  imessage: "bg-[#2fb84f]",
  instagram: "[background:linear-gradient(45deg,#f9a33a,#e1306c_45%,#833ab4)]",
  whatsapp: "bg-[#25d366]",
};

/** L’avatar sans visage d’un contact : le gris d’un contact sans photo, sa silhouette. */
function Avatar({ taille }: { taille: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-end justify-center overflow-hidden rounded-full bg-[linear-gradient(180deg,#a9adb8,#858996)]"
      style={{ width: taille, height: taille }}
    >
      <svg width={taille * 0.74} height={taille * 0.74} viewBox="0 0 34 34" fill="white" className="-mb-[3px]">
        <circle cx="17" cy="12" r="7" />
        <path d="M3 34c1-8 7-12.5 14-12.5S30 26 31 34Z" />
      </svg>
    </span>
  );
}

/**
 * L’en-tête d’une mini-conv. À plat : le pictogramme de l’appli, « La conv », et la pastille « exemple inventé ». Dans le
 * téléphone : l’en-tête de l’appli (le retour, l’avatar sans visage, la pastille « exemple inventé » à la place du nom,
 * et le nom de l’appli). La pastille est la même, une fois : elle seule se lit, le reste est un décor. `decor` : tout en
 * décor (la couverture), la pastille comprise, toujours affichée.
 */
export function EnTeteDeConv({ appli, mode, decor = false }: { appli: Appli; mode: Mode; decor?: boolean }) {
  const imessage = appli === "imessage";
  const conteneur = imessage
    ? selon(mode, {
        carte: "flex items-center justify-between gap-3 px-4 pb-1 pt-4",
        tel: "relative flex flex-col items-center gap-[5px] border-b border-[#ececf0] pb-2.5",
        adaptatif:
          "flex items-center justify-between gap-3 px-4 pb-1 pt-4 ordi:relative ordi:flex-col ordi:justify-start ordi:gap-[5px] ordi:border-b ordi:border-[#ececf0] ordi:px-0 ordi:pb-2.5 ordi:pt-0",
      })
    : selon(mode, {
        carte: "flex items-center justify-between gap-3 px-4 pb-1 pt-4",
        tel: cn("flex items-center gap-2.5 border-b border-[rgba(17,17,20,0.07)] px-3 py-2.5", appli === "whatsapp" ? "bg-[#f7f6f3]" : "bg-white"),
        adaptatif: cn(
          "flex items-center justify-between gap-3 px-4 pb-1 pt-4 ordi:justify-start ordi:gap-2.5 ordi:border-b ordi:border-[rgba(17,17,20,0.07)] ordi:px-3 ordi:py-2.5",
          appli === "whatsapp" && "ordi:bg-[#f7f6f3]",
        ),
      });
  const aPlat = selon(mode, { carte: "flex", tel: "hidden", adaptatif: "flex ordi:hidden" });
  const enTel = selon(mode, { carte: "hidden", tel: "flex", adaptatif: "hidden ordi:flex" });
  return (
    <div className={conteneur}>
      {/* À plat : l’appli, et « La conv » */}
      <span aria-hidden="true" className={cn("items-center gap-2", aPlat)}>
        <span className={cn("flex size-[22px] items-center justify-center rounded-[7px] text-white", PICTOS[appli])}>
          <Icon name={appli} size={14} stroke={2.4} />
        </span>
        <span className="text-legende font-black text-ink">{texteDe("La conv", decor)}</span>
      </span>
      {/* Dans le téléphone : le retour, l’avatar */}
      <span aria-hidden="true" className={cn(enTel, appli === "instagram" ? "text-ink" : "text-[#0a7cff]", imessage && "absolute left-[16px] top-[14px]")}>
        <svg width="11" height="18" viewBox="0 0 11 18">
          <path d="M9 2 2 9l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className={cn("shrink-0", enTel)}>
        <Avatar taille={imessage ? 46 : 34} />
      </span>
      <span className={cn("flex min-w-0 flex-col", imessage ? "items-center" : "items-start")}>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#f2f2f5] px-2 py-[3px] font-message text-[11px] font-extrabold leading-none text-soft">
          {texteDe(EXEMPLE_INVENTE, decor)}
          <svg aria-hidden="true" width="5" height="8" viewBox="0 0 5 8" className={cn("text-muted", enTel)}>
            <path d="m1 1 3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {!imessage && (
          <span aria-hidden="true" className={cn("mt-[3px] font-message text-[11.5px] font-bold leading-none text-grey", enTel)}>
            {texteDe(NOMS[appli], decor)}
          </span>
        )}
      </span>
    </div>
  );
}

/* La queue d’une bulle iMessage : un coin de sa couleur, que recouvre un coin du fond de l’écran (blanc) */
const QUEUE = {
  moi: "before:absolute before:bottom-0 before:-right-[7px] before:h-5 before:w-5 before:rounded-bl-[16px_14px] before:bg-bubble-me before:content-[''] after:absolute after:bottom-0 after:-right-[10px] after:h-5 after:w-[10px] after:rounded-bl-[10px] after:bg-white after:content-['']",
  autre:
    "before:absolute before:bottom-0 before:-left-[7px] before:h-5 before:w-5 before:rounded-br-[16px_14px] before:bg-[#e9e9eb] before:content-[''] after:absolute after:bottom-0 after:-left-[10px] after:h-5 after:w-[10px] after:rounded-br-[10px] after:bg-white after:content-['']",
} as const;

/** La forme et les couleurs d’une bulle, d’après son appli : la tienne (`moi`), celle de l’autre, la dernière de son groupe (`fin`). */
function formeDeBulle(appli: Appli, moi: boolean, fin: boolean): string {
  switch (appli) {
    case "imessage":
      return cn("relative rounded-[19px] px-[13px] py-[7px]", moi ? "bg-bubble-me text-white" : "bg-[#e9e9eb] text-ink", fin && QUEUE[moi ? "moi" : "autre"]);
    case "instagram":
      /* Le dégradé violet puis bleu de tes messages, foncé pour que le texte blanc garde 4,5:1 */
      return cn("rounded-[22px] px-3.5 py-2", moi ? "text-white [background:linear-gradient(135deg,#6f3cf5,#2563eb)]" : "bg-[#efefef] text-ink");
    case "whatsapp":
      return cn(
        "flex flex-wrap items-end gap-x-1.5 rounded-[12px] px-2.5 pb-1.5 pt-[6px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
        fin && (moi ? "rounded-br-[4px]" : "rounded-bl-[4px]"),
        moi ? "bg-[#d9fdd3] text-ink" : "bg-white text-ink",
      );
  }
}

/** Les deux coches de WhatsApp (distribué, pas lu), grises. */
function Coches() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="11"
      viewBox="0 0 16 11"
      fill="none"
      stroke="#8696a0"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mb-px ml-auto shrink-0"
    >
      <path d="M1 6l3 3 6.5-7.5" />
      <path d="M6.5 8.6L7 9l6.5-7.5" />
    </svg>
  );
}

/**
 * Les bulles d’une mini-conv, à la façon de son appli : l’autre à gauche, toi à droite, groupées comme dans l’appli.
 * Chacune dit qui parle aux lecteurs d’écran. Sous ton dernier message resté sans réponse, ce que l’appli y écrit
 * (« Distribué », « Envoyé ») ; WhatsApp le dit par ses coches, dans la bulle. `decor` : les textes en décor (la
 * couverture, que l’article redit), sans dire qui parle.
 */
export function BullesDeConv({ appli, repliques, mode, compte, decor = false }: { appli: Appli; repliques: readonly Replique[]; mode: Mode; compte?: number; decor?: boolean }) {
  const derniere = repliques.at(-1);
  const montrees = compte ? repliques.slice(-compte) : repliques;
  return (
    <div className={cn("flex flex-col pt-2", FONDS[appli], selon(mode, { carte: "px-4 pb-4", tel: "px-[14px]", adaptatif: "px-4 pb-4 ordi:px-[14px] ordi:pb-0" }))}>
      {appli === "imessage" && (
        <span
          aria-hidden="true"
          className={cn("mb-2 self-center font-message text-[11px] font-bold text-grey", selon(mode, { carte: "hidden", tel: "block", adaptatif: "hidden ordi:block" }))}
        >
          {texteDe(NOMS.imessage, decor)}
        </span>
      )}
      {montrees.map((r, k) => {
        const moi = r.de === "moi";
        const fin = montrees[k + 1]?.de !== r.de;
        return (
          <p
            key={k}
            className={cn(
              "m-0 max-w-[80%] font-message text-[15px] font-bold leading-[1.32] [overflow-wrap:anywhere]",
              moi ? "self-end" : "self-start",
              fin ? "mb-2" : "mb-[3px]",
              formeDeBulle(appli, moi, fin),
            )}
          >
            {!decor && (
              <span className="sr-only">
                {moi ? "Toi" : "L’autre"}
                {NBSP}:{" "}
              </span>
            )}
            {decor ? <TexteDecor texte={colleLEmoji(r.texte)} /> : <span>{colleLEmoji(r.texte)}</span>}
            {appli === "whatsapp" && moi && <Coches />}
          </p>
        );
      })}
      {derniere?.de === "moi" && appli !== "whatsapp" && (
        <span aria-hidden="true" className="-mt-1 self-end pr-0.5 font-message text-[11px] font-bold text-grey">
          {texteDe(appli === "imessage" ? "Distribué" : "Envoyé", decor)}
        </span>
      )}
    </div>
  );
}

/** Le fond de l’écran d’une appli, pour le téléphone qui la porte. */
export const fondDe = (appli: Appli) => FONDS[appli];
