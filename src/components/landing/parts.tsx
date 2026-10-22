import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { figtree } from "@/lib/fonts";
import { FAITS_LANDING, NOTE_LANDING, REPONSE_EXEMPLE, TEMOIGNAGES, VERDICT_EXEMPLE } from "@/contenu/landing";
import { NOTE_DES_AVIS } from "@/contenu/paiement";
import { AppBadge } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/icons";
import { ConfidenceLine, Tag } from "@/components/ui/messages";
import { LogoIlot } from "@/components/shell/LogoIlot";
import type { Testimonial } from "@/types";
import { ctaDe, type Retour } from "./cta";
import { AvisDefilants, BigHand, Cloche, Demandes, LogoBulle, type Demande } from "./ilots";

/*
 * Les morceaux de la landing, rendus sur le serveur : aucun « use client » ici. Ce qui tourne dans le navigateur vit
 * dans les îlots (ilots.tsx, ConvsExemples.tsx). Qui revient (`retour`, cta.ts) passe de morceau en morceau par les props.
 */

/* ———— Habillage ———— */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1120px] px-[22px] lg:px-8", className)}>{children}</div>;
}

export function CtaButton({ retour, className }: { retour: Retour; className?: string }) {
  const cta = ctaDe(retour);
  return (
    <Link
      href={cta.href}
      prefetch={cta.prefetch}
      scroll={cta.scroll}
      className={cn(
        "arrow-nudge lift lift-ink lift-sm inline-flex h-[60px] items-center justify-center gap-2.5 rounded-[30px] px-9 text-carte font-black text-white no-underline shadow-ink [background:var(--btn-ink-bg)]",
        className,
      )}
    >
      {cta.label}
      <Icon name="arrow" size={19} stroke={2.6} className="arrow text-white" />
    </Link>
  );
}

/**
 * Sous le bouton principal : la note des avis et la ligne qui rassure (qui découvre), ou le lien pour analyser une autre
 * conv (qui revient).
 */
export function SousLeBouton({ retour }: { retour: Retour }) {
  const cta = ctaDe(retour);
  if (!cta.autre)
    return (
      <>
        <NoteDesAvis />
        <span className={cn("text-note font-extrabold text-grey", NOTE_DES_AVIS ? "mt-1.5" : "mt-3.5")}>{cta.note}</span>
      </>
    );
  return (
    <Link
      href={cta.autre.href}
      className="mt-1 inline-flex h-11 items-center px-3 text-note font-black text-ink underline decoration-[rgba(17,17,20,0.25)] underline-offset-2 transition-colors hover:decoration-ink"
    >
      {cta.autre.label}
    </Link>
  );
}

/**
 * La note des avis, sous le bouton de qui découvre, comme les étoiles sous un produit : de vrais avis seulement
 * (NOTE_DES_AVIS, rien sans eux). Elle mène aux avis, où l’on dit d’où elle vient.
 */
function NoteDesAvis() {
  if (!NOTE_DES_AVIS) return null;
  return (
    <a href="#avis-titre" className="mt-4 inline-flex items-center gap-1.5 text-note font-extrabold text-soft no-underline transition-colors hover:text-ink">
      <span aria-hidden="true" className="tracking-[0.04em] text-attente">
        ★★★★★
      </span>
      <span className="font-black text-ink">{NOTE_DES_AVIS.note}</span>
      <span className="sr-only">sur 5</span>
      {NOTE_LANDING.avis(NOTE_DES_AVIS.nombre)}
    </a>
  );
}

function SectionHead({ id, kicker, title, sub, align = "center" }: { id: string; kicker?: string; title: ReactNode; sub?: ReactNode; align?: "center" | "start" }) {
  /* Aligné à gauche = section à deux colonnes : le titre descend d’un cran pour tenir sur deux lignes */
  return (
    <div data-reveal="" className={cn("flex flex-col items-center gap-3 text-center", align === "start" && "lg:items-start lg:text-left")}>
      {kicker && <span className="text-legende font-black text-grey">{kicker}</span>}
      <h2
        id={id}
        /* scroll-mt : un lien vers le titre (la note sous les boutons) le pose sous la barre du haut, pas dessous */
        className={cn(
          "m-0 max-w-[720px] scroll-mt-28 text-[34px] font-black leading-[1.04] tracking-[-0.03em] [text-wrap:balance]",
          align === "start" ? "lg:text-[44px]" : "lg:text-chiffre",
        )}
      >
        {title}
      </h2>
      {sub && <p className="m-0 max-w-[540px] text-accent font-extrabold leading-[1.5] text-soft [text-wrap:balance] lg:text-[19px]">{sub}</p>}
    </div>
  );
}

/** L’habillage d’une landing : la barre du haut, le contenu, le pied de page. `retour` : qui revient (cta.ts). */
export function LandingFrame({ retour, children }: { retour: Retour; children: ReactNode }) {
  const cta = ctaDe(retour);
  return (
    <div className={cn("min-h-dvh overflow-x-clip", figtree.variable)}>
      <header className="sticky top-0 z-40 border-b border-[rgba(17,17,20,0.05)] bg-[rgba(244,242,237,0.82)] backdrop-blur-xl">
        <Container className="flex h-16 items-center justify-between">
          <LogoIlot size={30} fontSize={22} href="/" />
          <div className="flex items-center gap-1 sm:gap-2">
            {/*
             * Déjà un compte, sur un autre appareil : on retrouve ses convs avec son email. Connecté sans conv : son compte
             * (ses achats, la déconnexion, tout effacer), que « Se connecter » ne montrait plus (il ramène au parcours)
             */}
            {(!retour || "sansConv" in retour) && (
              <Link
                href={retour ? "/compte" : "/connexion"}
                className="relative inline-flex h-10 items-center px-2.5 text-note font-black text-soft no-underline transition-colors hover:text-ink"
              >
                {retour ? "Mon compte" : "Se connecter"}
              </Link>
            )}
            {/* Le bouton noir reste celui de la page : ici, le blanc qui s’efface */}
            <Link
              href={cta.href}
              prefetch={cta.prefetch}
              scroll={cta.scroll}
              className="arrow-nudge lift lift-sm inline-flex h-10 items-center gap-1.5 rounded-full bg-white pl-4 pr-3.5 text-note font-black text-ink no-underline shadow-soft"
            >
              {cta.header}
              <Icon name="arrow" size={15} stroke={2.6} className="arrow text-ink" />
            </Link>
          </div>
        </Container>
      </header>
      <main>{children}</main>
      <footer className="border-t border-[rgba(17,17,20,0.06)] py-10">
        <Container className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <LogoIlot size={26} fontSize={19} href="/" />
            <span className="text-legende font-extrabold text-grey">© 2026</span>
          </div>
          <nav aria-label="Pied de page" className="flex flex-wrap gap-x-6 gap-y-2 text-note font-extrabold">
            <Link href={cta.href} scroll={cta.scroll} className="text-soft no-underline hover:text-ink">
              {cta.label}
            </Link>
            <Link href={retour ? "/compte" : "/connexion"} className="text-soft no-underline hover:text-ink">
              {retour ? "Mon compte" : "Se connecter"}
            </Link>
            <Link href="/confidentialite" className="text-soft no-underline hover:text-ink">
              Confidentialité
            </Link>
            <Link href="/conditions" className="text-soft no-underline hover:text-ink">
              Conditions
            </Link>
            <Link href="/mentions-legales" className="text-soft no-underline hover:text-ink">
              Mentions légales
            </Link>
          </nav>
        </Container>
      </footer>
    </div>
  );
}

/* ———— Ensuite, au quotidien : le message qui fait cogiter, et ce qu’on demande à BLUSH ———— */

/* Les messages qu’on relit dix fois : ils flottent autour du titre (grand écran) */
const OVERTHINK: { text: string; at: string; r: number; d: string }[] = [
  { text: "on verra", at: "left-[3%] top-[6%]", r: -4, d: "0s" },
  { text: "haha ok", at: "left-[8%] top-[60%]", r: 3, d: "1.2s" },
  { text: "t’es dispo quand\u00a0?", at: "right-[2%] top-[34%]", r: 3, d: "0.6s" },
  { text: "dsl j’avais pas vu", at: "right-[7%] top-[78%]", r: -3, d: "1.8s" },
];

/* Ce qu’on demande à BLUSH, en très grand ; la réponse (rendue ici, sur le serveur) s’ouvre sous la question (Demandes) */
const DEMANDES: Demande[] = [
  {
    q: "ça veut dire quoi\u00a0?",
    reponse: (
      <>
        <span className="max-w-[86%] self-end rounded-[20px] rounded-br-[6px] bg-toi-ink px-4 py-2.5 font-message text-detail font-bold text-white">
          je suis crevée cette semaine, on verra
        </span>
        <FromBlush>
          <span className="text-micro font-black text-grey">Ce que ça veut dire</span>
          <span className="text-accent font-black leading-[1.3]">Elle est partante, mais fatiguée.</span>
        </FromBlush>
      </>
    ),
  },
  {
    q: "je lui réponds quoi\u00a0?",
    reponse: (
      <FromBlush>
        <span className="flex items-center justify-between gap-2">
          <span className="text-micro font-black text-vrai-ink">Ta meilleure réponse</span>
          <Tag tone="recommandee" />
        </span>
        <span className="self-start rounded-[18px] rounded-br-[6px] bg-toi-ink px-3.5 py-2 font-message text-detail font-bold text-white">
          Courage pour jeudi. Samedi pour fêter ça{NBSP}?
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 self-start rounded-full bg-white px-3 text-micro font-black shadow-soft">
          <Icon name="copy" size={13} stroke={2.6} className="text-ink" />
          Copier
        </span>
      </FromBlush>
    ),
  },
  {
    q: "elle voit quelqu’un d’autre\u00a0?",
    reponse: (
      <FromBlush>
        <span className="text-accent font-black leading-[1.3]">{REPONSE_EXEMPLE.title}</span>
        <span className="text-note font-extrabold leading-[1.45] text-soft">{REPONSE_EXEMPLE.evidence}</span>
        <ConfidenceLine level={REPONSE_EXEMPLE.confidence} className="mt-1">
          {REPONSE_EXEMPLE.limits}
        </ConfidenceLine>
      </FromBlush>
    ),
  },
  {
    q: "on en est où\u00a0?",
    reponse: (
      <FromBlush>
        <span className="text-accent font-black leading-[1.3]">
          {VERDICT_EXEMPLE.emoji} {VERDICT_EXEMPLE.short} · <span className="text-vrai-ink">{VERDICT_EXEMPLE.trend}</span>
        </span>
        <span className="text-note font-extrabold leading-[1.45] text-soft">{VERDICT_EXEMPLE.nextStep}</span>
      </FromBlush>
    ),
  },
];

/** Le quotidien avec BLUSH, en un bloc noir : le titre géant, les messages qui font cogiter, puis les questions qu’on lui pose (un îlot). */
export function Quotidien() {
  return (
    <section aria-labelledby="quotidien-titre" className="py-10 lg:py-16">
      <Container>
        <div className="relative isolate overflow-hidden rounded-[36px] bg-ink px-5 pb-10 pt-14 text-white lg:rounded-[48px] lg:px-12 lg:pb-16 lg:pt-20">
          <BigHand />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(52%_62%_at_50%_0%,rgba(255,79,154,0.2),rgba(255,79,154,0))]"
          />
          {/* L’objet 3D : la cloche d’un nouveau message. Et le logo, en bas. */}
          <div
            aria-hidden="true"
            data-float=""
            className="pointer-events-none absolute -right-5 -top-5 w-[96px] lg:right-6 lg:top-8 lg:w-[132px]"
            style={{ "--r": "12deg", transform: "rotate(12deg)" }}
          >
            <Cloche size={132} className="h-auto w-full" />
          </div>
          <div
            aria-hidden="true"
            data-float=""
            className="pointer-events-none absolute -bottom-8 -left-6 hidden lg:block"
            style={{ "--r": "-12deg", transform: "rotate(-12deg)", animationDelay: "1.4s" }}
          >
            <LogoBulle size={150} />
          </div>

          <div className="relative flex flex-col items-center text-center">
            {OVERTHINK.map((b) => (
              <span
                key={b.text}
                aria-hidden="true"
                data-float=""
                className={cn(
                  "pointer-events-none absolute hidden whitespace-nowrap rounded-[22px] bg-white px-4 py-2.5 font-message text-accent font-bold text-ink shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)] lg:block",
                  b.r < 0 ? "rounded-bl-[6px]" : "rounded-br-[6px]",
                  b.at,
                )}
                style={{ "--r": `${b.r}deg`, transform: `rotate(${b.r}deg)`, animationDelay: b.d }}
              >
                {b.text}
              </span>
            ))}
            {/* TODO(produit): le surtitre du bloc depuis le paiement à l’unité (l’abonnement d’avant y était nommé), à relire */}
            <span data-reveal="" className="text-legende font-black text-white/60">
              Ensuite, avec tes bulles
            </span>
            {/* Mobile : les messages qui font cogiter, en autocollants au-dessus du titre */}
            <span aria-hidden="true" className="mt-5 flex flex-wrap justify-center gap-2 lg:hidden">
              {OVERTHINK.slice(0, 3).map((b) => (
                <span
                  key={b.text}
                  className={cn(
                    "whitespace-nowrap rounded-[18px] bg-white px-3 py-1.5 font-message text-note font-bold text-ink",
                    b.r < 0 ? "rounded-bl-[5px]" : "rounded-br-[5px]",
                  )}
                  style={{ transform: `rotate(${b.r}deg)` }}
                >
                  {b.text}
                </span>
              ))}
            </span>
            <h2 id="quotidien-titre" data-reveal="" className="m-0 mt-4 text-[54px] font-black leading-[0.94] tracking-[-0.05em] sm:text-[76px] lg:text-[100px]">
              un nouveau
              <br />
              message{NBSP}?
            </h2>
            <p data-reveal="" className="m-0 mt-6 max-w-[440px] text-accent font-extrabold leading-[1.5] text-white/70 [text-wrap:balance] lg:mt-7 lg:text-[19px]">
              Colle-le dans BLUSH, envoie une capture ou un nouvel export. Puis demande-lui{NBSP}:
            </p>
          </div>

          <Demandes demandes={DEMANDES} />
        </div>
      </Container>
    </section>
  );
}

/** Une réponse de BLUSH : la bulle qui écrit, puis la réponse dans une bulle couleur papier. */
function FromBlush({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-end gap-2">
      <LogoBulle size={28} className="mb-0.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-[20px] rounded-bl-[6px] bg-paper px-4 py-3">{children}</div>
    </div>
  );
}

/* ———— Les avis (seulement s’il y en a de vrais) ———— */
export function Reviews({ items }: { items: Testimonial[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="avis-titre" className="py-14 lg:py-20">
      <Container>
        <SectionHead id="avis-titre" title={TEMOIGNAGES.titre} />
        {/* D’où vient la note montrée sous les boutons : la loi demande de le dire à côté */}
        {NOTE_DES_AVIS && (
          <p data-reveal="" className="m-0 mx-auto mt-3 max-w-[460px] text-center text-legende font-extrabold leading-[1.5] text-grey [text-wrap:balance]">
            <span aria-hidden="true" className="text-attente">
              ★
            </span>{" "}
            {NOTE_LANDING.origine(NOTE_DES_AVIS.note, NOTE_DES_AVIS.nombre)}
          </p>
        )}
      </Container>
      <AvisDefilants items={items} />
    </section>
  );
}

/* ———— Ce que BLUSH promet, en faits ———— */
export function Facts() {
  return (
    <section aria-labelledby="faits-titre" className="py-14 lg:py-20">
      <Container className="flex flex-col items-center">
        <SectionHead
          id="faits-titre"
          title="Rapide. Complet. Discret."
          sub={"Et honnête\u00a0: BLUSH ne garantit rien sur ce que l’autre ressent. Il dit ce que montrent vos messages, et à quel point il en est sûr."}
        />
        <ul className="m-0 mt-10 grid w-full max-w-[1000px] list-none grid-cols-2 gap-3 p-0 lg:mt-14 lg:grid-cols-4 lg:gap-5">
          {FAITS_LANDING.map((f, i) => (
            <FactTile key={f.libelle} index={i}>
              <span className="text-[46px] font-black leading-none tracking-[-0.03em] lg:text-[60px]">{f.valeur}</span>
              <span className="max-w-[170px] text-note font-extrabold leading-[1.4] text-grey [text-wrap:balance] lg:text-corps">{f.libelle}</span>
            </FactTile>
          ))}
          <FactTile index={3}>
            <span className="flex gap-1.5">
              {(["whatsapp", "imessage", "instagram", "hinge"] as const).map((a) => (
                <AppBadge key={a} app={a} size={30} radius={9} className="lg:!size-10 lg:!rounded-[12px] lg:[&_svg]:!size-5" />
              ))}
            </span>
            <span className="max-w-[170px] text-note font-extrabold leading-[1.4] text-grey [text-wrap:balance] lg:text-corps">Toutes tes applis, même par captures</span>
          </FactTile>
        </ul>
      </Container>
    </section>
  );
}

function FactTile({ index, children }: { index: number; children: ReactNode }) {
  return (
    <li
      data-reveal=""
      style={{ "--reveal-delay": `${index * 80}ms` }}
      className="flex min-h-[156px] flex-col items-center justify-center gap-3 rounded-[28px] bg-white px-4 py-6 text-center shadow-card lg:aspect-square lg:gap-4"
    >
      {children}
    </li>
  );
}

/* ———— Le dernier appel ———— */
export function FinalCta({ retour }: { retour: Retour }) {
  return (
    <section className="pb-20 pt-6 lg:pb-28 lg:pt-10">
      <Container>
        <div data-reveal="" className="flex flex-col items-center text-center">
          <LogoBulle size={68} animated />
          <h2 className="m-0 mt-6 max-w-[640px] text-titre-1 font-black leading-[1.04] tracking-[-0.03em] [text-wrap:balance] lg:text-affiche">Ta conv a déjà la réponse.</h2>
          <CtaButton retour={retour} className="mt-8" />
          <SousLeBouton retour={retour} />
        </div>
      </Container>
    </section>
  );
}
