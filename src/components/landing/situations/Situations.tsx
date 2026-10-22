"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { QUESTIONS_COMMUNES, SITUATIONS, TEXTES_SITUATIONS as T, type ChiffreExemple, type Situation, type SituationId } from "@/contenu/landing-situations";
import { TESTIMONIALS } from "@/contenu/landing";
import { BubbleLogo } from "@/components/brand/objects3d";
import { AppBadge, Avatar } from "@/components/ui/Avatar";
import { PlayCard } from "@/components/ui/cards";
import { Icon } from "@/components/ui/icons";
import { Bubble, ConfidenceLine, Tag } from "@/components/ui/messages";
import { CarteTemoignage } from "@/components/temoignages/CarteTemoignage";
import { ctaDe } from "../cta";

/*
 * La landing par situation, en un îlot (une proposition, /apercu/landing) : choisir sa situation change toute la page,
 * comme choisir sa taille change les photos d’une fiche produit. La vitrine (la photo de mise en situation et le
 * téléphone posé dessus), puis la personne qui lui ressemble, ce que BLUSH a vu dans sa conv, son rapport à feuilleter
 * avec le prix, les avis, les questions. Le choix s’écrit dans l’adresse (?s=), pour qu’un lien de campagne arrive
 * directement sur la bonne situation.
 */

type Props = {
  /** La situation montrée d’abord : celle du lien (?s=), sinon la plus fréquente. */
  initiale: SituationId;
  /** Arrivée par un lien de situation : le titre du haut est le sien. */
  parLien: boolean;
  /** Le prix du rapport, déjà écrit (« 9,90 € »), ses chapitres et ses bulles. */
  prix: string;
  chapitres: number;
  bulles: number;
  /** La note des avis (de vrais avis seulement), ou rien. */
  note: { note: string; nombre: string } | null;
};

const ENCRE = { toi: "text-toi-ink", elle: "text-elle-ink", pareil: "text-ink" } as const;
const CTA = ctaDe(null);

export function Situations({ initiale, parLien, prix, chapitres, bulles, note }: Props) {
  const [id, setId] = useState<SituationId>(initiale);
  const s = SITUATIONS.find((x) => x.id === id) ?? SITUATIONS[0]!;
  /* Le bouton du haut sorti de l’écran : la barre du bas prend le relais (sur téléphone) */
  const boutonDuHaut = useRef<HTMLDivElement>(null);
  const [barre, setBarre] = useState(false);
  useEffect(() => {
    const el = boutonDuHaut.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setBarre(!e!.isIntersecting && e!.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const choisir = (nouvelle: SituationId) => {
    setId(nouvelle);
    /* Le choix dans l’adresse : un lien partagé, ou un retour en arrière, retombe sur la même situation */
    window.history.replaceState(null, "", `?s=${nouvelle}`);
  };

  const titre = parLien ? [s.titre] : T.titre;
  return (
    <>
      {/* ———— Le haut : la promesse, le bouton, et la vitrine ———— */}
      <section className="relative isolate pt-10 lg:pt-20">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[620px] w-[1100px] -translate-x-1/2 bg-[radial-gradient(closest-side,white,rgba(255,255,255,0))]"
        />
        <Contenu className="grid items-center gap-9 lg:grid-cols-[1fr_1.02fr] lg:gap-14">
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <span className="inline-flex h-8 items-center gap-2 rounded-full bg-white pl-1.5 pr-3.5 text-legende font-black text-soft shadow-soft">
              <BubbleLogo size={22} />
              Lue par BLUSH · en 40{NBSP}secondes
            </span>
            <h1 className="m-0 mt-5 text-[40px] font-black leading-[1.02] tracking-[-0.04em] [text-wrap:balance] sm:text-[56px] lg:text-[66px]">
              {titre[0]}
              {titre[1] && (
                <>
                  <br />
                  <span className="text-elle-ink">{titre[1]}</span>
                </>
              )}
            </h1>
            <p className="m-0 mt-4 max-w-[480px] text-carte font-extrabold leading-[1.5] text-soft [text-wrap:balance] lg:mt-6 lg:text-[20px]">{T.sous}</p>
            <div ref={boutonDuHaut} className="mt-7 flex flex-col items-center lg:items-start">
              <BoutonPrincipal />
              <span className="mt-3 text-note font-extrabold text-grey">{CTA.note}</span>
              {note && (
                <a href="#avis-titre" className="mt-2 inline-flex items-center gap-1.5 text-note font-black text-soft no-underline hover:text-ink">
                  <span className="text-attente-ink">★</span>
                  {note.note} · {note.nombre} avis de testeurs
                </a>
              )}
            </div>
          </div>
          <Vitrine s={s} />
        </Contenu>
      </section>

      {/* ———— Le choix de sa situation : il reste en haut de l’écran tant qu’on lit la sienne ———— */}
      <section aria-labelledby="situation-titre" className="pt-14 lg:pt-20">
        <Contenu className="flex flex-col items-center text-center">
          <h2 id="situation-titre" className="m-0 text-[30px] font-black leading-[1.05] tracking-[-0.03em] lg:text-[44px]">
            {T.choisir}
          </h2>
          <p className="m-0 mt-3 max-w-[460px] text-accent font-extrabold leading-[1.5] text-soft [text-wrap:balance]">{T.choisirSous}</p>
        </Contenu>
        <div className="sticky top-16 z-30 mt-6 border-b border-[rgba(17,17,20,0.05)] bg-[rgba(244,242,237,0.86)] py-2.5 backdrop-blur-xl">
          <div
            role="radiogroup"
            aria-labelledby="situation-titre"
            className="mx-auto flex max-w-[1120px] snap-x gap-2 overflow-x-auto px-[22px] [scrollbar-width:none] lg:flex-wrap lg:justify-center lg:overflow-visible lg:px-8 [&::-webkit-scrollbar]:hidden"
          >
            {SITUATIONS.map((x) => {
              const choisie = x.id === s.id;
              return (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={choisie}
                  onClick={() => choisir(x.id)}
                  className={cn(
                    "inline-flex h-10 shrink-0 snap-start items-center gap-1.5 rounded-full px-3.5 text-note font-black transition-[background,color,box-shadow] duration-200",
                    choisie ? "bg-ink text-white shadow-ink" : "bg-white text-ink shadow-soft hover:shadow-soft-hover",
                  )}
                >
                  <span aria-hidden="true">{x.emoji}</span>
                  {x.choix}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tout ce qui suit change avec la situation : la clé rejoue l’apparition */}
        <div key={s.id}>
          <Persona s={s} />
          <Etapes s={s} />
          <Rapport s={s} prix={prix} chapitres={chapitres} bulles={bulles} />
          <Avis s={s} note={note} />
          <Questions s={s} prix={prix} />
        </div>
      </section>

      {/* La barre du bas, sur téléphone : le bouton reste sous le pouce une fois celui du haut passé */}
      <div
        aria-hidden={!barre}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(17,17,20,0.06)] bg-[rgba(244,242,237,0.92)] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl transition-transform duration-300 lg:hidden",
          barre ? "translate-y-0" : "translate-y-full",
        )}
      >
        <Link
          href={CTA.href}
          tabIndex={barre ? undefined : -1}
          className="flex h-[54px] items-center justify-center gap-2 rounded-[27px] text-carte font-black text-white no-underline shadow-ink [background:var(--btn-ink-bg)]"
        >
          {CTA.label}
          <Icon name="arrow" size={18} stroke={2.6} className="text-white" />
        </Link>
        <p className="m-0 mt-1.5 text-center text-micro font-extrabold text-grey">
          Le rapport {prix} · {T.paiement}
        </p>
      </div>
    </>
  );
}

/* ———— Habillage ———— */
function Contenu({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1120px] px-[22px] lg:px-8", className)}>{children}</div>;
}

function BoutonPrincipal({ className }: { className?: string }) {
  return (
    <Link
      href={CTA.href}
      className={cn(
        "arrow-nudge lift lift-ink lift-sm inline-flex h-[60px] items-center justify-center gap-2.5 rounded-[30px] px-9 text-carte font-black text-white no-underline shadow-ink [background:var(--btn-ink-bg)]",
        className,
      )}
    >
      {CTA.label}
      <Icon name="arrow" size={19} stroke={2.6} className="arrow text-white" />
    </Link>
  );
}

/** Le titre d’un bloc de la page. */
function TitreDeBloc({ id, surtitre, children, sous }: { id: string; surtitre?: string; children: ReactNode; sous?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      {surtitre && <span className="text-legende font-black text-grey">{surtitre}</span>}
      <h2 id={id} className="m-0 max-w-[680px] text-[30px] font-black leading-[1.06] tracking-[-0.03em] [text-wrap:balance] lg:text-[42px]">
        {children}
      </h2>
      {sous && <p className="m-0 max-w-[520px] text-accent font-extrabold leading-[1.5] text-soft [text-wrap:balance]">{sous}</p>}
    </div>
  );
}

/**
 * Le cadre d’une photo à shooter avec les créatrices : il garde sa place et dit ce qu’on y verra.
 * TODO(produit): remplacer chaque cadre par la vraie photo (droit à l’image signé).
 */
function CadrePhoto({ texte, className, petit = false }: { texte: string; className?: string; petit?: boolean }) {
  return (
    <div
      className={cn(
        "flex overflow-hidden bg-[linear-gradient(165deg,#FFD9EA_0%,#F3DDF4_48%,#DCE5FF_100%)] shadow-[inset_0_0_0_1px_rgba(17,17,20,0.05)]",
        /* Sa position vient de qui l’appelle (le grand cadre est posé « absolute ») : le petit rond se place tout seul */
        petit ? "relative items-center justify-center rounded-full" : "flex-col justify-start rounded-[32px] p-3.5",
        className,
      )}
    >
      {/* Une silhouette, en grand, à la place de la personne (à gauche : le téléphone se pose à droite) */}
      <svg aria-hidden="true" viewBox="0 0 100 100" className={cn("absolute text-white/55", petit ? "inset-[14%]" : "bottom-0 left-[8%] w-[50%]")}>
        <circle cx="50" cy="34" r="20" fill="currentColor" />
        <path d="M12 100c2-24 18-38 38-38s36 14 38 38z" fill="currentColor" />
      </svg>
      {!petit && (
        <span className="relative flex max-w-[260px] flex-col gap-1 rounded-[18px] border border-dashed border-[rgba(17,17,20,0.18)] bg-white/75 px-3 py-2.5 text-left backdrop-blur">
          <span className="flex items-center gap-1.5 text-micro font-black text-elle-ink">
            <Icon name="photo" size={13} stroke={2.4} />
            {T.photo}
          </span>
          <span className="text-micro font-extrabold leading-[1.4] text-soft">{texte}</span>
        </span>
      )}
    </div>
  );
}

/* ———— La vitrine : la photo de mise en situation, et le téléphone posé dessus ———— */
function Vitrine({ s }: { s: Situation }) {
  return (
    <div className="relative mx-auto w-full max-w-[400px] pb-16 lg:max-w-[500px] lg:pb-10">
      {/* La photo de mise en situation : elle, dans le moment où elle aurait besoin de BLUSH */}
      <div key={s.id} data-rise="" className="relative aspect-[4/5] w-[88%] lg:w-[84%]">
        <CadrePhoto texte={s.persona.photo} className="absolute inset-0" />
      </div>
      {/* Le téléphone, posé devant : l’écran du verdict de sa situation */}
      <div className="absolute bottom-0 right-0 w-[54%] rotate-[3deg] lg:w-[50%]" style={{ "--r": "3deg" }}>
        <Telephone>
          <EcranVerdict key={s.id} s={s} />
        </Telephone>
      </div>
      {/* L’étiquette « lue en entier », comme une bulle posée sur la photo */}
      <span
        data-float=""
        className="absolute bottom-[30%] left-[2%] inline-flex items-center gap-2 rounded-[18px] rounded-bl-[6px] bg-white px-3 py-2 text-legende font-black text-ink shadow-[0_18px_40px_-18px_rgba(17,17,20,0.45)]"
        style={{ "--r": "-3deg", transform: "rotate(-3deg)" }}
      >
        <BubbleLogo size={22} />
        <span>
          {s.persona.messages} messages
          <span className="block text-micro font-extrabold text-grey">lus en entier</span>
        </span>
      </span>
    </div>
  );
}

/** Un téléphone dessiné : son cadre noir, son îlot, son écran. */
function Telephone({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[34px] bg-ink p-[7px] shadow-[0_40px_70px_-28px_rgba(17,17,20,0.6),0_0_0_1px_rgba(255,255,255,0.06)_inset]">
      <div className="relative overflow-hidden rounded-[28px] bg-paper">
        <span aria-hidden="true" className="absolute left-1/2 top-2 z-10 h-[16px] w-[56px] -translate-x-1/2 rounded-full bg-ink" />
        <div className="px-3 pb-3.5 pt-8">{children}</div>
      </div>
    </div>
  );
}

/** L’écran du verdict, en petit : qui, le verdict, deux chiffres, la preuve, le prochain pas. */
function EcranVerdict({ s }: { s: Situation }) {
  return (
    <div data-rise="" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Avatar tone="elle" size={26}>
          {s.autre.prenom[0]}
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-micro font-black text-ink">{s.autre.prenom}</span>
        <AppBadge app={s.persona.app} size={20} radius={6} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[9px] font-black uppercase tracking-[0.06em] text-grey">Le verdict de BLUSH</span>
        <span className="text-[15px] font-black leading-[1.15] tracking-[-0.02em] text-ink">
          <span className="mr-1">{s.verdict.emoji}</span>
          {s.verdict.titre}
        </span>
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_rgba(17,17,20,0.07)]">
        {s.chiffres.slice(0, 2).map((c, i) => (
          <div key={c.texte} className={cn("flex flex-col gap-0.5 px-2 py-1.5", i === 0 && "border-r border-sep")}>
            <span className={cn("text-[13px] font-black leading-none", ENCRE[c.cote])}>{c.valeur}</span>
            <span className="line-clamp-2 text-[8.5px] font-extrabold leading-[1.25] text-soft">{c.texte}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 rounded-[12px] bg-white p-2 shadow-[inset_0_0_0_1px_rgba(17,17,20,0.07)]">
        <span className="self-start rounded-[12px] rounded-bl-[4px] bg-bubble-her px-2 py-1 font-message text-[9.5px] font-bold leading-[1.3] text-ink">
          {s.verdict.preuve.texte}
        </span>
        <span className="text-[8px] font-extrabold text-grey">{s.verdict.preuve.date}</span>
      </div>
      <div className="flex items-start gap-1.5 rounded-[12px] bg-white px-2 py-1.5 shadow-play" style={{ backgroundImage: "linear-gradient(180deg, #F3F8FF, white)" }}>
        <Icon name="bolt" size={12} className="mt-px text-toi" />
        <span className="text-[9px] font-black leading-[1.3] text-ink">{s.prochainPas}</span>
      </div>
    </div>
  );
}

/* ———— La personne qui lui ressemble ———— */
function Persona({ s }: { s: Situation }) {
  const p = s.persona;
  return (
    <Contenu className="pt-10 lg:pt-14">
      <figure data-rise="" className="m-0 mx-auto flex max-w-[680px] flex-col gap-5 rounded-[32px] bg-white p-5 shadow-card lg:flex-row lg:items-center lg:gap-7 lg:p-7">
        <CadrePhoto texte={p.photo} petit className="size-[84px] shrink-0 self-center lg:size-[104px]" />
        <div className="flex min-w-0 flex-col gap-3 text-center lg:text-left">
          <blockquote className="m-0 text-[22px] font-black leading-[1.22] tracking-[-0.02em] [text-wrap:balance] lg:text-[26px]">
            «{NBSP}
            {p.doute}
            {NBSP}»
          </blockquote>
          <figcaption className="flex flex-col items-center gap-1.5 lg:items-start">
            <span className="text-detail font-black text-ink">
              {p.prenom}, {p.age}
              {NBSP}ans
            </span>
            <span className="text-note font-extrabold leading-[1.45] text-soft [text-wrap:balance]">{p.ou}</span>
            <span className="inline-flex items-center gap-1.5 text-note font-extrabold text-soft">
              <AppBadge app={p.app} size={18} radius={5} />
              {p.messages} messages
            </span>
            <span className="mt-1 text-micro font-extrabold text-grey">{T.fictif}</span>
          </figcaption>
        </div>
      </figure>
    </Contenu>
  );
}

/* ———— Ce que BLUSH a vu dans sa conv, étape par étape ———— */
function Etapes({ s }: { s: Situation }) {
  const p = s.persona;
  return (
    <section aria-labelledby="etapes-titre" className="pt-16 lg:pt-24">
      <Contenu className="flex flex-col items-center">
        <TitreDeBloc id="etapes-titre">{T.etapes(p.prenom)}</TitreDeBloc>
        <ol className="m-0 mt-9 flex w-full max-w-[560px] list-none flex-col p-0">
          <Etape n={1} titre={T.conv}>
            <div className="flex flex-col gap-2 rounded-[24px] bg-white p-4 shadow-card">
              <div className="mb-1 flex items-center gap-2 border-b border-sep pb-2.5">
                <Avatar tone="elle" size={28}>
                  {s.autre.prenom[0]}
                </Avatar>
                <span className="flex-1 text-note font-black">{s.autre.prenom}</span>
                <AppBadge app={p.app} size={22} radius={7} />
              </div>
              {s.conv.map((m, i) => (
                <Bubble key={i} from={m.de} caption={m.heure}>
                  {m.texte}
                </Bubble>
              ))}
            </div>
          </Etape>
          <Etape n={2} titre="Lue par BLUSH">
            <div className="flex items-center gap-3 rounded-[24px] bg-white p-4 shadow-card">
              <BubbleLogo size={40} animated />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-detail font-black">{T.lue(p.messages)}</span>
                <span className="block h-2 overflow-hidden rounded-full bg-track">
                  <span data-rise="" className="block h-full w-full rounded-full [background:var(--rose-blush)]" />
                </span>
              </div>
            </div>
          </Etape>
          <Etape n={3} titre={T.chiffres}>
            <ul className="m-0 grid list-none gap-2 p-0">
              {s.chiffres.map((c) => (
                <Chiffre key={c.texte} c={c} />
              ))}
            </ul>
          </Etape>
          <Etape n={4} titre={T.verdict}>
            <div className="flex flex-col gap-3 rounded-[24px] bg-white p-5 shadow-card">
              <span className="text-[24px] font-black leading-[1.15] tracking-[-0.02em]">
                <span className="mr-1.5">{s.verdict.emoji}</span>
                {s.verdict.titre}
              </span>
              <p className="m-0 text-detail font-extrabold leading-[1.5] text-soft">{s.verdict.sous}</p>
              <div className="flex flex-col gap-2 rounded-[18px] bg-paper p-3">
                <Bubble from="elle" caption={s.verdict.preuve.date}>
                  {s.verdict.preuve.texte}
                </Bubble>
              </div>
              <ConfidenceLine level={s.verdict.confiance}>{T.preuves(s.verdict.preuves)}</ConfidenceLine>
            </div>
          </Etape>
          <Etape n={5} titre={T.chat(s.persona.genre)}>
            <div className="flex flex-col gap-3 rounded-[24px] bg-white p-4 shadow-card">
              <Bubble from="toi">{s.reponse.question}</Bubble>
              <div className="flex items-end gap-2">
                <BubbleLogo size={28} className="mb-0.5 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-[20px] rounded-bl-[6px] bg-paper px-4 py-3">
                  {s.reponse.aEnvoyer ? (
                    <>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-micro font-black text-vrai-ink">Ta meilleure réponse</span>
                        <Tag tone="recommandee" />
                      </span>
                      <span className="self-start rounded-[18px] rounded-br-[6px] bg-toi-ink px-3.5 py-2 font-message text-detail font-bold text-white">{s.reponse.texte}</span>
                      <span className="inline-flex h-8 items-center gap-1.5 self-start rounded-full bg-white px-3 text-micro font-black shadow-soft">
                        <Icon name="copy" size={13} stroke={2.6} className="text-ink" />
                        Copier
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-micro font-black text-elle-ink">{T.rienAEnvoyer}</span>
                        <Tag tone="risque">Ne relance pas</Tag>
                      </span>
                      <span className="text-[20px] font-black leading-[1.2]">{s.reponse.texte}</span>
                    </>
                  )}
                  <span className="text-note font-extrabold leading-[1.45] text-soft">
                    <span className="font-black text-ink">
                      {T.pourquoi}
                      {NBSP}:
                    </span>{" "}
                    {s.reponse.pourquoi}
                  </span>
                </div>
              </div>
            </div>
          </Etape>
          <Etape n={6} titre={T.prochainPas} dernier>
            <PlayCard title={T.conseil}>{s.prochainPas}</PlayCard>
          </Etape>
        </ol>
        <div className="mt-10 flex flex-col items-center text-center">
          <BoutonPrincipal />
          <span className="mt-3 text-note font-extrabold text-grey">La même lecture, pour ta conv.</span>
        </div>
      </Contenu>
    </section>
  );
}

/** Une étape : son numéro sur le fil, son titre, ce qu’on y voit. */
function Etape({ n, titre, dernier = false, children }: { n: number; titre: string; dernier?: boolean; children: ReactNode }) {
  return (
    <li data-rise="" style={{ "--d": `${n * 60}ms` }} className="relative flex gap-3.5 pb-7 last:pb-0">
      {!dernier && <span aria-hidden="true" className="absolute bottom-0 left-[15px] top-9 w-0.5 rounded-full bg-[rgba(17,17,20,0.08)]" />}
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-legende font-black text-white">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
        <span className="text-detail font-black text-ink">{titre}</span>
        {children}
      </div>
    </li>
  );
}

function Chiffre({ c }: { c: ChiffreExemple }) {
  return (
    <li className="flex items-center gap-3.5 rounded-[20px] bg-white px-4 py-3 shadow-card">
      <span className={cn("min-w-[104px] whitespace-nowrap text-[22px] font-black leading-none tracking-[-0.02em]", ENCRE[c.cote])}>{c.valeur}</span>
      <span className="text-note font-extrabold leading-[1.4] text-soft">{c.texte}</span>
    </li>
  );
}

/* ———— Son rapport à feuilleter, et ce qu’il coûte ———— */
function Rapport({ s, prix, chapitres, bulles }: { s: Situation; prix: string; chapitres: number; bulles: number }) {
  return (
    <section aria-labelledby="rapport-titre" className="pt-20 lg:pt-28">
      <Contenu className="flex flex-col items-center">
        <TitreDeBloc id="rapport-titre" sous={T.rapportSous}>
          {T.rapport(s.persona.prenom)}
        </TitreDeBloc>
        <div className="mt-9 grid w-full max-w-[960px] items-start gap-5 lg:grid-cols-[1.2fr_1fr]">
          {/* Le sommaire, comme la table des matières d’un livre qu’on feuillette : les titres lisibles, le texte flouté */}
          <div className="overflow-hidden rounded-[28px] bg-white shadow-card">
            <div className="flex items-center gap-2.5 border-b border-sep px-5 py-3.5">
              <Avatar tone="elle" size={28}>
                {s.autre.prenom[0]}
              </Avatar>
              <span className="flex flex-col">
                <span className="text-note font-black">
                  {s.persona.prenom} & {s.autre.prenom}
                </span>
                <span className="text-micro font-extrabold text-grey">Rapport · {s.persona.messages} messages lus</span>
              </span>
            </div>
            <ol className="m-0 flex list-none flex-col p-0">
              {s.chapitres.map((titre, i) => (
                <Chapitre key={titre} n={i + 1} titre={titre} ouvert={i < 2}>
                  {i === 0 && (
                    <span className="text-note font-extrabold leading-[1.45] text-soft">
                      {s.verdict.emoji} {s.verdict.titre}
                    </span>
                  )}
                  {i === 1 && <span className="text-note font-extrabold leading-[1.45] text-ink">{s.extrait}</span>}
                </Chapitre>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-4 lg:sticky lg:top-40">
            <Vocal />
            <Prix prix={prix} chapitres={chapitres} bulles={bulles} />
          </div>
        </div>
      </Contenu>
    </section>
  );
}

/** Un chapitre du sommaire : son titre, lisible ; son texte flouté. `ouvert` : le début se lit (les deux premiers). */
function Chapitre({ n, titre, ouvert, children }: { n: number; titre: string; ouvert: boolean; children?: ReactNode }) {
  return (
    <li className="flex flex-col gap-1.5 border-b border-sep px-5 py-3 last:border-b-0">
      <span className="flex items-center gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-paper text-micro font-black text-soft">{n}</span>
        <span className="text-detail font-black leading-[1.3] text-ink">{titre}</span>
      </span>
      <span className="flex flex-col gap-1.5 pl-9">
        {children}
        {/* Le reste du chapitre, flouté : une ligne de texte qu’on devine (deux sous un chapitre ouvert) */}
        <span aria-hidden="true" className="flex flex-col gap-1.5 blur-[2.5px]">
          <span className="h-2 w-[88%] rounded-full bg-[rgba(17,17,20,0.13)]" />
          {ouvert && <span className="h-2 w-[64%] rounded-full bg-[rgba(17,17,20,0.09)]" />}
        </span>
      </span>
    </li>
  );
}

/** Le vocal de BLUSH, en haut du rapport : à écouter (ici, son dessin). */
function Vocal() {
  /* Les barres de l’onde, figées : leur hauteur dessine une voix */
  const ondes = [8, 14, 22, 12, 28, 18, 32, 20, 12, 26, 16, 30, 22, 10, 24, 18, 28, 14, 20, 9, 16, 24, 12, 18];
  return (
    <div className="flex flex-col gap-3 rounded-[28px] bg-ink p-5 text-white shadow-ink">
      <span className="flex items-center gap-2.5">
        <BubbleLogo size={30} />
        <span className="flex flex-col">
          <span className="text-detail font-black">{T.vocal}</span>
          <span className="text-micro font-extrabold text-white/60">{T.vocalSous}</span>
        </span>
      </span>
      <span className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-ink">
          <Icon name="play" size={18} stroke={2.6} />
        </span>
        <span aria-hidden="true" className="flex h-9 flex-1 items-center gap-[3px]">
          {ondes.map((h, i) => (
            <span key={i} className={cn("w-[3px] rounded-full", i < 7 ? "bg-white" : "bg-white/35")} style={{ height: h }} />
          ))}
        </span>
        <span className="text-micro font-black text-white/70">{T.vocalDuree}</span>
      </span>
    </div>
  );
}

/** Ce qu’on achète, et son prix : la « boîte d’achat » d’une fiche produit. */
function Prix({ prix, chapitres, bulles }: { prix: string; chapitres: number; bulles: number }) {
  return (
    <div className="flex flex-col gap-4 rounded-[28px] bg-white p-5 shadow-card">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-detail font-black">Ton rapport complet</span>
        <span className="text-[30px] font-black leading-none tracking-[-0.03em]">{prix}</span>
      </span>
      <span className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-note font-extrabold text-soft">
          <Icon name="check" size={15} stroke={2.8} className="text-vrai-ink" />
          {T.contenu(chapitres, bulles)}
        </span>
        <span className="flex items-center gap-2 text-note font-extrabold text-soft">
          <Icon name="check" size={15} stroke={2.8} className="text-vrai-ink" />
          {T.paiement}
        </span>
        <span className="flex items-center gap-2 text-note font-extrabold text-soft">
          <Icon name="shield" size={15} stroke={2.4} className="text-vrai-ink" />
          Ta conv brute, effacée après ton rapport
        </span>
      </span>
      <BoutonPrincipal className="w-full" />
    </div>
  );
}

/* ———— Les avis : le plus proche de sa situation d’abord ———— */
function Avis({ s, note }: { s: Situation; note: Props["note"] }) {
  const tries = [...TESTIMONIALS].sort((a, b) => Number(b.name === s.avis) - Number(a.name === s.avis));
  if (!tries.length) return null;
  return (
    <section aria-labelledby="avis-titre" className="pt-20 lg:pt-28">
      <Contenu className="flex flex-col items-center">
        <TitreDeBloc id="avis-titre">{T.avis}</TitreDeBloc>
        {note && (
          <p className="m-0 mt-3 flex flex-col items-center gap-1 text-center">
            <span className="text-detail font-black">
              <span className="text-attente-ink">★</span> {note.note} · {note.nombre} avis
            </span>
            <span className="max-w-[420px] text-micro font-extrabold leading-[1.45] text-grey">{T.origineDeLaNote}</span>
          </p>
        )}
      </Contenu>
      <div className="mx-auto mt-8 flex max-w-[1120px] snap-x gap-4 overflow-x-auto px-[22px] pb-4 [scrollbar-width:none] lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-8 [&::-webkit-scrollbar]:hidden">
        {tries.map((t) => (
          <CarteTemoignage key={t.name} t={t} className="w-[300px] shrink-0 snap-start lg:w-auto" />
        ))}
      </div>
      <p className="m-0 mt-2 text-center text-micro font-extrabold text-grey">{T.origineDesAvis}</p>
    </section>
  );
}

/* ———— Les questions qu’on se pose avant de payer : la sienne d’abord ———— */
function Questions({ s, prix }: { s: Situation; prix: string }) {
  const liste = [s.question, ...QUESTIONS_COMMUNES(prix)];
  return (
    <section aria-labelledby="questions-titre" className="pb-6 pt-20 lg:pt-28">
      <Contenu className="flex flex-col items-center">
        <TitreDeBloc id="questions-titre">{T.questions}</TitreDeBloc>
        <div className="mt-8 flex w-full max-w-[640px] flex-col gap-2.5">
          {liste.map((x, i) => (
            <details key={x.q} open={i === 0} className="group rounded-[22px] bg-white px-5 py-4 shadow-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-detail font-black [&::-webkit-details-marker]:hidden">
                {x.q}
                <Icon name="plus" size={16} stroke={2.6} className="shrink-0 text-grey transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className="m-0 mt-2.5 text-note font-extrabold leading-[1.55] text-soft">{x.r}</p>
            </details>
          ))}
        </div>
      </Contenu>
    </section>
  );
}
