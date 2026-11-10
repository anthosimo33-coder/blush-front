"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { bloquerDefilement } from "@/lib/defilement";
import { NBSP } from "@/lib/format";
import { joursDeLaPlage, plageDAvant, plusJours, type Plage } from "@/lib/jours";
import type { Periode } from "@/server/stats";
import { pluriel } from "./calculs";
import type { BaseDeLAdmin } from "./EnTete";
import { PERIODES, colonneDe, jourComplet, jourCourt, moisPlus, nomDeLaPlage, nomDuMois, raccourciDe, raccourcis, type Raccourci } from "./periodes";

/*
 * La période du pilotage (/admin). Les trois d’office gardent leur place (24 h, 7 jours, 30 jours : des fenêtres qui
 * glissent jusqu’à maintenant, `?p=`) ; une quatrième case, « Dates », ouvre un calendrier de deux mois avec ses
 * raccourcis (aujourd’hui, hier, ce mois-ci, le mois dernier, depuis le lancement) pour une période à soi, en jours de
 * Paris entiers (`?du=&au=`). L’adresse porte la période : elle se partage et se retrouve.
 * Sur un téléphone, le panneau monte du bas de l’écran (un mois, les raccourcis en pastilles) ; sur un grand écran, il
 * s’ouvre sous son bouton. Un raccourci s’applique au toucher ; des dates choisies, par « Appliquer ». Le pied dit
 * contre quoi se liront les écarts : la période d’avant, de même durée.
 * Choisie le 9 novembre parmi trois maquettes (le calendrier, une frise à faire glisser, une pastille unique).
 */

type Props = {
  base: BaseDeLAdmin;
  /** La fenêtre d’office affichée, ou le repère d’une période choisie. */
  jours: Periode;
  /** La période choisie au calendrier, s’il y en a une. */
  plage?: Plage;
  /** Le jour de Paris : le dernier qu’on peut choisir. */
  aujourdhui: string;
  /** Le premier jour qu’on peut choisir (le lancement). */
  premier: string;
};

const ROSE = "#e8358a";

/* Une case du segment (24 h, 7 jours, 30 jours, les dates) : la même allure que les rubriques de l’en-tête */
const CASE = "flex min-h-10 items-center justify-center rounded-full text-detail font-black no-underline transition-colors";
const CASE_ICI = "bg-white text-ink shadow-[0_1px_2px_rgba(17,17,20,0.08),0_6px_14px_-8px_rgba(17,17,20,0.3)]";
const CASE_AILLEURS = "text-soft hover:text-ink";

function IconeCalendrier() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="3.5" y="5" width="17" height="15.5" rx="4" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

function Chevron({ vers }: { vers: "gauche" | "droite" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("shrink-0", vers === "gauche" && "rotate-180")}
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

function Coche() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/* ———— Le choix en cours : ce que le panneau montre avant « Appliquer » ———— */

function useChoix({ base, jours, plage, aujourdhui, premier }: Props, bouton: RefObject<HTMLButtonElement | null>) {
  const router = useRouter();
  const [enRoute, partir] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const liste = useMemo(() => raccourcis(aujourdhui, premier), [aujourdhui, premier]);
  const actif = raccourciDe(liste, { jours, plage });
  /* Les jours affichés en ce moment : ceux de la période choisie, ou ceux que couvre la fenêtre glissante */
  const actuelle: Plage = plage ?? actif?.plage ?? { du: aujourdhui, au: aujourdhui };
  const [choix, setChoix] = useState<Plage>(actuelle);
  /* Le premier bout posé au calendrier, en attendant le second ; le jour survolé dessine la période à venir */
  const [ancre, setAncre] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [mois, setMois] = useState(actuelle.au.slice(0, 7));

  const ouvrir = () => {
    setChoix(actuelle);
    setAncre(null);
    setSurvol(null);
    setMois(actuelle.au.slice(0, 7));
    setOuvert(true);
  };
  /* Le focus revient au bouton qui a ouvert le panneau */
  const fermer = useCallback(() => {
    setOuvert(false);
    bouton.current?.focus();
  }, [bouton]);
  /* La page se recalcule sur le serveur : le segment bat le temps qu’elle arrive */
  const aller = (suite: string) => {
    fermer();
    partir(() => router.push(`${base}?${suite}` as Route));
  };
  return {
    liste,
    actif,
    actuelle,
    choix,
    ancre,
    survol,
    mois,
    ouvert,
    enRoute,
    ouvrir,
    fermer,
    setMois,
    setSurvol,
    /** Un raccourci : appliqué au toucher. */
    prendre: (r: Raccourci) => aller(r.p ? `p=${r.p}` : `du=${r.plage.du}&au=${r.plage.au}`),
    /** Un jour touché au calendrier : le premier bout, puis le second (dans un sens ou dans l’autre). */
    toucher: (jour: string) => {
      if (!ancre) {
        setAncre(jour);
        setChoix({ du: jour, au: jour });
        return;
      }
      setChoix(ancre <= jour ? { du: ancre, au: jour } : { du: jour, au: ancre });
      setAncre(null);
    },
    appliquer: () => aller(`du=${choix.du}&au=${choix.au}`),
  };
}

type Choix = ReturnType<typeof useChoix>;

/* ———— Le sélecteur ———— */

/** La période du pilotage : 24 h, 7 jours, 30 jours, ou des dates choisies au calendrier. */
export function ChoixDeLaPeriode(props: Props) {
  const bouton = useRef<HTMLButtonElement>(null);
  const c = useChoix(props, bouton);
  const { base, jours, plage, aujourdhui, premier } = props;
  const perso = !!plage && !c.actif;
  const calendrier = (nb: 1 | 2) => (
    <Calendrier
      nb={nb}
      mois={c.mois}
      choix={c.choix}
      ancre={c.ancre}
      survol={c.survol}
      min={premier}
      max={aujourdhui}
      surJour={c.toucher}
      surSurvol={c.setSurvol}
      surMois={c.setMois}
    />
  );
  return (
    <div className="relative w-full md:w-auto">
      <nav aria-label="Période" className={cn("flex w-full rounded-full bg-segment p-1 md:w-auto", c.enRoute && "motion-safe:animate-pulse")}>
        {([1, 7, 30] as const).map((j) => (
          <Link
            key={j}
            href={`${base}?p=${j}`}
            aria-current={!plage && j === jours ? "page" : undefined}
            className={cn(CASE, "flex-1 whitespace-nowrap md:flex-none", plage ? "px-1.5 md:px-4" : "px-4", !plage && j === jours ? CASE_ICI : CASE_AILLEURS)}
          >
            {/* Sur téléphone, à côté de dates choisies, les trois périodes d’office s’abrègent (« 7 j ») */}
            {plage && j !== 1 ? (
              <>
                <span aria-hidden="true" className="md:hidden">
                  {j}
                  {NBSP}j
                </span>
                <span className="sr-only md:not-sr-only">{PERIODES[j].lien}</span>
              </>
            ) : (
              PERIODES[j].lien
            )}
          </Link>
        ))}
        <button
          ref={bouton}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={c.ouvert}
          aria-label={plage ? `Changer les dates, période choisie ${nomDeLaPlage(plage)}` : "Choisir des dates"}
          onClick={c.ouvrir}
          className={cn(CASE, "gap-2 whitespace-nowrap tabular-nums", plage ? "px-3 md:px-4" : "px-4", plage ? CASE_ICI : CASE_AILLEURS, c.ouvert && !plage && "text-ink")}
        >
          <IconeCalendrier />
          <span className={cn(!plage && "hidden md:inline")}>{plage ? nomDeLaPlage(plage) : "Dates"}</span>
        </button>
      </nav>
      {c.ouvert && (
        <Panneau titre="Choisir une période" fermer={c.fermer}>
          <div className="md:flex">
            <div className="hidden w-[212px] shrink-0 border-r border-sep pr-2 md:block">
              <Liste c={c} perso={perso} />
            </div>
            <div className="min-w-0 md:pl-5 md:pr-2 md:pt-1">
              <Pastilles c={c} className="mb-4 md:hidden" />
              {/* Deux mois côte à côte sur un grand écran, un seul en dessous */}
              <div className="lg:hidden">{calendrier(1)}</div>
              <div className="hidden lg:block">{calendrier(2)}</div>
              <Pied choix={c.choix} premier={premier} attend={c.ancre !== null} surAppliquer={c.appliquer} />
            </div>
          </div>
        </Panneau>
      )}
    </div>
  );
}

/* ———— Le panneau : une feuille qui monte du bas (téléphone), ou un volet sous le bouton (grand écran) ———— */

function Panneau({ titre, fermer, children }: { titre: string; fermer: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    /* Sur un téléphone, la page ne défile plus sous la feuille */
    const liberer = window.matchMedia("(max-width: 767px)").matches ? bloquerDefilement() : null;
    const surTouche = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", surTouche);
    return () => {
      liberer?.();
      document.removeEventListener("keydown", surTouche);
    };
  }, [fermer]);
  return (
    <>
      {/* Le voile : il assombrit la page sous la feuille du téléphone ; sur un grand écran il ne se voit pas, un clic hors du volet le ferme */}
      <div aria-hidden="true" onClick={fermer} className="fixed inset-0 z-40 bg-ink/28 motion-safe:[animation:fadeIn_0.25s_ease-out_both] md:bg-transparent" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-[28px] bg-white px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2.5 text-ink shadow-[0_-18px_50px_-18px_rgba(17,17,20,0.45)] outline-none motion-safe:[animation:sheetUp_0.36s_cubic-bezier(0.2,0.8,0.2,1)_both] md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-[calc(100%+10px)] md:max-h-none md:w-max md:overflow-visible md:rounded-[26px] md:p-3 md:shadow-[0_0_0_1px_rgba(17,17,20,0.06),0_2px_6px_rgba(17,17,20,0.06),0_34px_70px_-24px_rgba(17,17,20,0.45)] md:motion-safe:[animation:sheetIn_0.2s_cubic-bezier(0.2,0.8,0.2,1)_both] md:origin-top-right"
      >
        {/* La poignée et le titre de la feuille, sur téléphone */}
        <div aria-hidden="true" className="mx-auto mb-2 h-[5px] w-10 rounded-full bg-track md:hidden" />
        <div className="mb-3 flex min-h-11 items-center gap-1 md:hidden">
          <h2 className="m-0 flex-1 text-[21px] font-black tracking-[-0.02em]">{titre}</h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={fermer}
            className="flex size-10 items-center justify-center rounded-full bg-sep text-[21px] font-black leading-none transition-colors hover:bg-track md:hidden"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/* ———— Les raccourcis ———— */

/** Les raccourcis en liste (grand écran) : une coche sur celui qui est affiché. */
function Liste({ c, perso }: { c: Choix; perso: boolean }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {c.liste.map((r, k) => {
        const ici = !perso && c.actif?.cle === r.cle;
        return (
          <li key={r.cle} className={cn(k > 0 && c.liste[k - 1]?.groupe !== r.groupe && "mt-1.5 border-t border-sep pt-1.5")}>
            <button
              type="button"
              aria-current={ici ? "true" : undefined}
              onClick={() => c.prendre(r)}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 text-left text-detail transition-colors md:min-h-10",
                ici ? "bg-paper font-black text-ink" : "font-extrabold text-soft hover:bg-paper hover:text-ink",
              )}
            >
              <span className="flex-1 whitespace-nowrap">{r.nom}</span>
              {ici && <Coche />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Les raccourcis en pastilles (téléphone) : une rangée qui défile. */
function Pastilles({ c, className }: { c: Choix; className?: string }) {
  return (
    <ul className={cn("-mx-4 m-0 flex list-none gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden", className)}>
      {c.liste.map((r) => {
        const ici = c.actif?.cle === r.cle && c.choix.du === c.actuelle.du && c.choix.au === c.actuelle.au;
        return (
          <li key={r.cle} className="shrink-0">
            <button
              type="button"
              aria-current={ici ? "true" : undefined}
              onClick={() => c.prendre(r)}
              className={cn(
                "flex min-h-10 items-center whitespace-nowrap rounded-full px-3.5 text-note font-black transition-colors",
                ici ? "bg-ink text-white" : "bg-paper text-soft shadow-[inset_0_0_0_1px_rgba(17,17,20,0.06)] hover:text-ink",
              )}
            >
              {r.nom}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ———— Le calendrier ———— */

const JOURS_DE_LA_SEMAINE = ["L", "M", "M", "J", "V", "S", "D"];
const PAS_DES_FLECHES: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/**
 * Un ou deux mois (`mois` : le dernier affiché). Le premier toucher pose un bout, le second l’autre ; entre les deux, le
 * jour survolé dessine la période à venir. Les jours sans chiffres (avant `min`, après `max`) ne se choisissent pas. Au
 * clavier, les flèches passent d’un jour à l’autre, d’un mois à l’autre s’il le faut.
 */
function Calendrier({
  nb,
  mois,
  choix,
  ancre,
  survol,
  min,
  max,
  surJour,
  surSurvol,
  surMois,
}: {
  nb: 1 | 2;
  mois: string;
  choix: Plage;
  ancre: string | null;
  survol: string | null;
  min: string;
  max: string;
  surJour: (jour: string) => void;
  surSurvol: (jour: string | null) => void;
  surMois: (mois: string) => void;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const affiches = nb === 2 ? [moisPlus(mois, -1), mois] : [mois];
  const autre = ancre && survol ? survol : ancre;
  const montre: Plage = ancre && autre ? (ancre <= autre ? { du: ancre, au: autre } : { du: autre, au: ancre }) : choix;
  const reculer = (affiches[0] ?? mois) > min.slice(0, 7);
  const avancer = mois < max.slice(0, 7);

  const surTouche = (e: KeyboardEvent<HTMLDivElement>) => {
    const pas = PAS_DES_FLECHES[e.key];
    const depuis = (e.target as HTMLElement).closest<HTMLElement>("[data-jour]")?.dataset.jour;
    if (!pas || !depuis) return;
    e.preventDefault();
    const vers = plusJours(depuis, pas);
    if (vers < min || vers > max) return;
    const viser = () => racine.current?.querySelector<HTMLElement>(`[data-jour="${vers}"]`)?.focus();
    if (affiches.includes(vers.slice(0, 7))) viser();
    else {
      surMois(pas > 0 || nb === 1 ? vers.slice(0, 7) : moisPlus(vers.slice(0, 7), 1));
      requestAnimationFrame(viser);
    }
  };

  return (
    <div ref={racine} onKeyDown={surTouche} onPointerLeave={() => surSurvol(null)} className="flex gap-7">
      {affiches.map((m, k) => (
        <div key={m} className="w-full md:w-[280px]">
          <div className="mb-1 flex h-10 items-center justify-between">
            <BoutonDeMois vers="gauche" nom="Mois précédent" montrer={k === 0} actif={reculer} surClic={() => surMois(moisPlus(mois, -1))} />
            <p aria-live="polite" className="m-0 text-detail font-black tracking-[-0.01em]">
              {nomDuMois(m)}
            </p>
            <BoutonDeMois vers="droite" nom="Mois suivant" montrer={k === affiches.length - 1} actif={avancer} surClic={() => surMois(moisPlus(mois, 1))} />
          </div>
          <div aria-hidden="true" className="grid grid-cols-7 pb-1 text-center text-micro font-black text-grey">
            {JOURS_DE_LA_SEMAINE.map((j, i) => (
              <span key={i}>{j}</span>
            ))}
          </div>
          <Mois mois={m} montre={montre} enCours={ancre !== null} min={min} max={max} surJour={surJour} surSurvol={surSurvol} />
        </div>
      ))}
    </div>
  );
}

function BoutonDeMois({ vers, nom, montrer, actif, surClic }: { vers: "gauche" | "droite"; nom: string; montrer: boolean; actif: boolean; surClic: () => void }) {
  if (!montrer) return <span className="size-10" />;
  return (
    <button
      type="button"
      aria-label={nom}
      disabled={!actif}
      onClick={surClic}
      className="flex size-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-sep disabled:cursor-default disabled:text-pale disabled:hover:bg-transparent"
    >
      <Chevron vers={vers} />
    </button>
  );
}

/** Les jours d’un mois. La période se lit d’un trait : une bande d’un bout à l’autre, arrondie en fin de semaine et de mois. */
function Mois({
  mois,
  montre,
  enCours,
  min,
  max,
  surJour,
  surSurvol,
}: {
  mois: string;
  montre: Plage;
  enCours: boolean;
  min: string;
  max: string;
  surJour: (jour: string) => void;
  surSurvol: (jour: string | null) => void;
}) {
  const premier = `${mois}-01`;
  const decalage = colonneDe(premier);
  const nbJours = joursDeLaPlage({ du: premier, au: plusJours(`${moisPlus(mois, 1)}-01`, -1) });
  const seul = montre.du === montre.au;
  return (
    <div className="grid grid-cols-7 gap-y-1">
      {Array.from({ length: decalage }, (_, k) => (
        <span key={k} />
      ))}
      {Array.from({ length: nbJours }, (_, k) => {
        const jour = plusJours(premier, k);
        const debut = jour === montre.du;
        const fin = jour === montre.au;
        const dedans = jour >= montre.du && jour <= montre.au;
        const hors = jour < min || jour > max;
        const colonne = (decalage + k) % 7;
        return (
          <div key={jour} className="relative flex h-11 items-center justify-center md:h-10">
            {dedans && !seul && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-0.5 bg-sep",
                  debut ? "left-1/2 right-0" : fin ? "left-0 right-1/2" : "inset-x-0",
                  !debut && (colonne === 0 || k === 0) && "rounded-l-full",
                  !fin && (colonne === 6 || k === nbJours - 1) && "rounded-r-full",
                )}
              />
            )}
            <button
              type="button"
              data-jour={jour}
              disabled={hors}
              aria-label={`${jourComplet(jour)}${jour === max ? ", aujourd’hui" : ""}`}
              aria-pressed={debut || fin}
              onClick={() => surJour(jour)}
              onPointerEnter={() => surSurvol(jour)}
              onFocus={() => surSurvol(jour)}
              className={cn(
                "relative flex size-10 items-center justify-center rounded-full text-detail tabular-nums transition-[background-color,color,box-shadow] duration-150 md:size-9",
                debut || fin
                  ? cn("bg-ink font-black text-white", enCours && fin && !debut && "bg-ink/70")
                  : hors
                    ? "cursor-default font-bold text-pale"
                    : "font-extrabold text-ink hover:shadow-[inset_0_0_0_1.5px_var(--ink)]",
              )}
            >
              {Number(jour.slice(8))}
              {jour === max && <span aria-hidden="true" className="absolute bottom-1 size-1 rounded-full" style={{ background: debut || fin ? "#ffffff" : ROSE }} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ———— Le pied : ce qui va s’afficher, contre quoi, et « Appliquer » ———— */

function Pied({ choix, premier, attend, surAppliquer }: { choix: Plage; premier: string; attend: boolean; surAppliquer: () => void }) {
  const n = joursDeLaPlage(choix);
  const avant = plageDAvant(choix);
  return (
    <div className="mt-4 flex flex-col gap-3.5 border-t border-sep pt-4 md:flex-row md:items-center md:justify-between md:gap-6">
      <p className="m-0 min-w-0" aria-live="polite">
        <span className="flex flex-wrap items-baseline gap-x-2 text-accent font-black tracking-[-0.01em] tabular-nums">
          {attend ? `Du ${jourCourt(choix.du)} au…` : nomDeLaPlage(choix)}
          {!attend && <span className="text-note font-extrabold text-grey">{pluriel(n, "jour")}</span>}
        </span>
        <span className="mt-0.5 block text-legende font-bold text-grey">
          {attend
            ? "Touche le dernier jour"
            : avant.du < premier
              ? `Pas de période d’avant entière, les chiffres commencent le ${jourCourt(premier)}`
              : `Comparé ${n === 1 ? "à la veille" : `aux ${pluriel(n, "jour")} d’avant`}, ${n === 1 ? `le ${jourCourt(avant.du)}` : `du ${jourCourt(avant.du)} au ${jourCourt(avant.au)}`}`}
        </span>
      </p>
      <Button size="md" disabled={attend} onClick={surAppliquer} className="md:w-auto md:px-7">
        Appliquer
      </Button>
    </div>
  );
}
