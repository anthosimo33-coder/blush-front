import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/cn";
import { jourDeParis, type Plage } from "@/lib/jours";
import type { Periode } from "@/server/stats";
import type { Vue } from "./a-decider";
import { adresseDe, type Ici } from "./adresses";
import { ChoixDeLaPeriode } from "./ChoixDeLaPeriode";
import { datesDeLaPeriode, periodeGardee } from "./dates";
import type { BaseDeLAdmin } from "./EnTete";
import { NombreEnLigne } from "./SondeDuDirect";

/*
 * L’habillage d’/admin : le cadre (les rubriques : un menu à gauche sur un grand écran, une rangée à faire défiler sur un
 * téléphone), le même pour le pilotage, le direct et le tournage ; et, pour le pilotage, le bandeau qui reste en haut de
 * chaque rubrique : son titre, la période (le sélecteur du pilotage, ChoixDeLaPeriode : 24 h, 7 jours, 30 jours, ou des
 * dates au calendrier), et ses dates en toutes lettres avec celles de la période d’avant. Aucune rubrique ne s’affiche
 * sans ses dates.
 */

/** Les rubriques, par groupe, dans l’ordre du menu. */
const MENU: { groupe: string; rubriques: { nom: string; ici: Ici }[] }[] = [
  { groupe: "Décider", rubriques: [{ nom: "Résumé", ici: "resume" }] },
  {
    groupe: "Comprendre",
    rubriques: [
      { nom: "Acquisition", ici: "acquisition" },
      { nom: "Tunnel", ici: "tunnel" },
      { nom: "Ventes", ici: "ventes" },
      { nom: "Coûts et marge", ici: "couts" },
    ],
  },
  {
    groupe: "Surveiller",
    rubriques: [
      { nom: "Santé", ici: "sante" },
      { nom: "En direct", ici: "direct" },
    ],
  },
  {
    groupe: "Agir",
    rubriques: [
      { nom: "Outils", ici: "outils" },
      { nom: "Tournage", ici: "tournage" },
    ],
  },
];

/** Le titre de chaque rubrique du pilotage, et la question à laquelle elle répond. */
const TITRES: Record<Vue, { titre: string; question: string }> = {
  resume: { titre: "Résumé", question: "Ce qu’il faut pour décider" },
  acquisition: { titre: "Acquisition", question: "D’où ils viennent, et qui importe" },
  tunnel: { titre: "Tunnel", question: "Où ils s’arrêtent, écran par écran" },
  ventes: { titre: "Ventes", question: "Ce qui se vend, et ce qui fait racheter" },
  couts: { titre: "Coûts et marge", question: "Ce que coûte l’IA, et ce qu’il reste" },
  sante: { titre: "Santé", question: "Ce qui casse, chez nous et chez les visiteurs" },
  outils: { titre: "Outils", question: "Les gestes de l’équipe, notés au journal" },
};

type DuMenu = {
  base: BaseDeLAdmin;
  ici: Ici;
  /** La période à garder d’une rubrique à l’autre (« p=30 »), s’il y en a une. */
  periode?: string;
  /** Combien de lignes de la santé sont allumées : la pastille de sa rubrique (rien, hors du pilotage). */
  soucis?: number;
};

/** Ce qui se pose à droite du nom d’une rubrique : les soucis de la santé, le nombre en ligne. */
function Pastille({ de, soucis = 0 }: { de: Ici; soucis?: number }) {
  if (de === "sante" && soucis > 0)
    return (
      <span className="rounded-full bg-[#e08600]/16 px-2 py-0.5 text-micro font-black text-[#8a4a00] tabular-nums">
        {soucis}
        <span className="sr-only"> à regarder</span>
      </span>
    );
  return de === "direct" ? <NombreEnLigne /> : null;
}

/** Les rubriques sur une rangée à faire défiler (un téléphone). */
function Rangee({ base, ici, periode, soucis }: DuMenu) {
  return (
    <nav aria-label="Rubriques" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden">
      {MENU.flatMap((g) => g.rubriques).map((r) => (
        <Link
          key={r.ici}
          href={adresseDe(base, r.ici, periode)}
          aria-current={r.ici === ici ? "page" : undefined}
          className={cn(
            "flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-note font-black no-underline",
            r.ici === ici ? "bg-ink text-white" : "bg-white text-soft shadow-[0_0_0_1px_rgba(17,17,20,0.06)]",
          )}
        >
          {r.nom}
          <Pastille de={r.ici} soucis={soucis} />
        </Link>
      ))}
    </nav>
  );
}

/**
 * Le cadre d’une page d’/admin : le menu à gauche (un grand écran), le logo puis les rubriques sur une rangée (un
 * téléphone ; `rangee` faux : la page les pose elle-même, dans son bandeau), et la page. À poser dans un SondeDuDirect :
 * la rubrique « En direct » dit le nombre en ligne.
 */
export function Cadre({ base, ici, periode, soucis, rangee = true, children }: DuMenu & { rangee?: boolean; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1360px] lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6 lg:overflow-y-auto lg:px-5 lg:py-6">
        <div className="flex items-center gap-2.5 px-2">
          <Logo size={30} fontSize={24} href="/" />
          <span className="rounded-full bg-ink px-2.5 py-1 text-legende font-black text-white">Admin</span>
        </div>
        <nav aria-label="Rubriques" className="flex flex-col gap-5">
          {MENU.map((g) => (
            <div key={g.groupe} className="flex flex-col gap-0.5">
              <p className="m-0 px-3 pb-1 text-micro font-black uppercase tracking-[0.08em] text-grey">{g.groupe}</p>
              {g.rubriques.map((r) => (
                <Link
                  key={r.ici}
                  href={adresseDe(base, r.ici, periode)}
                  aria-current={r.ici === ici ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 items-center justify-between gap-2 rounded-[14px] px-3 text-detail font-black no-underline",
                    r.ici === ici ? "bg-white text-ink shadow-[0_1px_2px_rgba(17,17,20,0.08),0_6px_14px_-8px_rgba(17,17,20,0.3)]" : "text-soft hover:bg-segment/60 hover:text-ink",
                  )}
                >
                  {r.nom}
                  <Pastille de={r.ici} soucis={soucis} />
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 px-4 pb-16 lg:pl-2 lg:pr-8">
        <div className="flex items-center gap-2.5 pt-4 lg:hidden">
          <Logo size={28} fontSize={22} href="/" />
          <span className="rounded-full bg-ink px-2.5 py-1 text-legende font-black text-white">Admin</span>
        </div>
        {rangee && (
          <div className="pt-3 lg:hidden">
            <Rangee base={base} ici={ici} periode={periode} soucis={soucis} />
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

/** Une rubrique du pilotage dans son cadre : le bandeau (son titre, la période, ses dates), puis ses cartes. */
export function Rangement({
  base,
  vue,
  jours,
  plage,
  premierJour,
  le,
  soucis,
  children,
}: {
  base: BaseDeLAdmin;
  vue: Vue;
  jours: Periode;
  /** La période choisie au calendrier, s’il y en a une. */
  plage?: Plage;
  /** Le premier jour qu’une période choisie peut couvrir. */
  premierJour: string;
  /** L’heure du calcul (ISO). */
  le: string;
  soucis: number;
  children: ReactNode;
}) {
  const dates = datesDeLaPeriode({ le, jours, plage });
  const heure = new Date(le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const periode = periodeGardee({ jours, plage });
  return (
    <Cadre base={base} ici={vue} periode={periode} soucis={soucis} rangee={false}>
      {/* Le bandeau qui reste en haut : les rubriques (téléphone), le titre, la période et ses dates. Un fond plein, sans flou : un flou en ferait le repère du panneau du calendrier, qui se fixe à l’écran sur un téléphone */}
      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-2.5 bg-paper px-4 pb-3 pt-3 lg:-mx-2 lg:px-2 lg:pt-6">
        <Rangee base={base} ici={vue} periode={periode} soucis={soucis} />
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2.5">
          <div className="min-w-0">
            <h1 className="m-0 text-[28px] font-black leading-[1.05] tracking-[-0.035em] lg:text-[34px]">{TITRES[vue].titre}</h1>
            <p className="m-0 mt-1 hidden text-note font-extrabold text-grey lg:block">{TITRES[vue].question}</p>
          </div>
          <div className="flex w-full flex-col gap-1.5 md:w-auto md:items-end">
            <ChoixDeLaPeriode
              base={base}
              jours={jours}
              plage={plage}
              aujourdhui={jourDeParis(new Date(le))}
              premier={premierJour}
              garde={vue === "resume" ? undefined : `vue=${vue}`}
            />
            {/* Les dates, toujours écrites : la période, celle d’avant, et l’heure du calcul */}
            <p className="m-0 text-legende font-extrabold leading-[1.35] text-soft md:text-right">
              <span className="font-black text-ink">{dates.periode}</span>
              <span className="text-grey"> · comparé {dates.avant}</span>
              <span className="text-grey"> · calculé à {heure}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 pt-2 md:gap-5">{children}</div>
    </Cadre>
  );
}
