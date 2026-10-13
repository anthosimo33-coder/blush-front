"use client";

import { useEffect, useRef, useState } from "react";
import { NOMS_DES_ETAPES, NOMS_DES_SOURCES } from "@/contenu/pilotage";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import type { GenreFil } from "@/types";
import type { Direct } from "@/types/api";
import { BoutonAide } from "./Aide";
import { etapesPeuplees, euros, ilYa, nombre, pluriel, texteDuGeste } from "./calculs";
import { ECART_DE_L_ETIQUETTE, HAUTEUR, LARGEUR, placerLesVilles, pointsDeLaCarte, type Cote } from "./carte-de-france";
import { POINTS_DU_FIL } from "./CarteEnDirect";
import { Barre, Pouls } from "./morceaux";
import { secondesDepuis, useDirect } from "./SondeDuDirect";

/*
 * /admin en direct : qui est sur le site maintenant (le bandeau noir : en ligne, le record du jour, les 30 dernières
 * minutes, la journée), où (la carte de France en points, une bulle par ville), à quel écran, d’où ils arrivent, et le
 * fil des derniers gestes, filtrable. Une ville et un geste, jamais un nom ni une conv. Le direct vient de la sonde
 * (SondeDuDirect), relu toutes les 5 s.
 */

/** Les filtres du fil : leur nom, et les gestes qu’ils gardent. */
const FILTRES: { id: string; nom: string; genres: readonly GenreFil[] | null }[] = [
  { id: "tout", nom: "Tout", genres: null },
  { id: "achats", nom: "Achats", genres: ["achat", "paiement"] },
  { id: "imports", nom: "Imports", genres: ["import"] },
  { id: "arrivees", nom: "Arrivées", genres: ["arrivee"] },
];
/** Combien de gestes le fil montre. */
const GESTES_MONTRES = 12;

/** La propriété qui écarte une étiquette de sa bulle, selon son côté. */
const COTES: Record<Cote, "left" | "right" | "bottom" | "top"> = { d: "left", g: "right", h: "bottom", b: "top" };

const PARIS = "Europe/Paris";
const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: PARIS });

export function EcranDuDirect() {
  const { d } = useDirect();
  if (!d) return <p className="m-0 text-detail font-extrabold text-grey">Lecture du direct…</p>;
  return (
    <>
      <Maintenant d={d} />
      <div className="flex flex-wrap gap-4 md:gap-6">
        <Carte d={d} />
        <div className="flex min-w-0 grow basis-[340px] flex-col gap-4 md:gap-6">
          <OuIlsEnSont d={d} />
          <DOuIlsArrivent d={d} />
        </div>
      </div>
      <Fil d={d} />
    </>
  );
}

/* ———— Le bandeau : maintenant, les 30 dernières minutes, aujourd’hui ———— */

function Maintenant({ d }: { d: Direct }) {
  const max = Math.max(5, ...d.minutes.map((m) => m.n));
  const valeurs = d.minutes.map((m) => m.n);
  const resume = valeurs.length
    ? `Personnes en ligne minute par minute, sur les ${valeurs.length} dernières minutes\u00a0: de ${nombre(Math.min(...valeurs))} à ${nombre(Math.max(...valeurs))}, ${nombre(valeurs.at(-1) ?? 0)} maintenant`
    : "Pas encore de minutes comptées";
  return (
    <section aria-labelledby="maintenant-titre" className="flex flex-wrap items-stretch gap-x-10 gap-y-7 rounded-card bg-ink p-5 text-white shadow-card md:p-6">
      <div className="flex min-w-0 grow basis-[220px] flex-col justify-between gap-3">
        <h1 id="maintenant-titre" className="m-0 flex items-center gap-2.5 text-detail font-black uppercase tracking-[0.08em] text-white/75">
          <Pouls taille={10} />
          En ligne maintenant
        </h1>
        <p className="m-0 flex items-baseline gap-3">
          <span className="text-[64px] font-black leading-[0.95] tracking-[-0.04em] tabular-nums md:text-[88px]">{nombre(d.enLigne)}</span>
          <span className="text-accent font-extrabold text-white/75">{d.enLigne > 1 ? "personnes" : "personne"}</span>
        </p>
        <p className="m-0 text-note font-extrabold text-white/70">
          {d.record ? `Record du jour\u00a0: ${nombre(d.record.n)}, à ${heure(d.record.le)}` : "Pas encore de record aujourd’hui"}
        </p>
      </div>
      <div className="flex min-w-0 grow-[999] basis-[380px] flex-col gap-2.5">
        <p className="m-0 flex justify-between gap-3 text-note font-extrabold text-white/70">
          <span>Les 30 dernières minutes</span>
          <span>maintenant</span>
        </p>
        <div role="img" aria-label={resume} className="flex h-24 items-end gap-[3px]">
          {d.minutes.map((m, k) => (
            <span
              key={m.le}
              className={cn("min-w-0 flex-1 rounded-t-[3px] transition-[height] duration-500", k === d.minutes.length - 1 ? "bg-elle" : "bg-white/28")}
              style={{ height: `${(m.n / max) * 100}%` }}
            />
          ))}
        </div>
      </div>
      <ul className="m-0 grid min-w-0 grow basis-[340px] list-none grid-cols-3 content-end gap-2 p-0">
        <Jour valeur={nombre(d.jour.visiteurs)} nom="visiteurs aujourd’hui" />
        <Jour valeur={nombre(d.jour.achats)} nom="achats aujourd’hui" />
        <Jour valeur={euros(d.jour.centimes, 0)} nom="encaissés" />
      </ul>
    </section>
  );
}

function Jour({ valeur, nom }: { valeur: string; nom: string }) {
  return (
    <li className="flex min-w-0 flex-col gap-0.5 rounded-[16px] bg-white/8 px-3 py-3.5">
      <b className="truncate text-[22px] font-black tracking-[-0.02em] tabular-nums">{valeur}</b>
      <span className="text-legende font-extrabold text-white/70">{nom}</span>
    </li>
  );
}

/* ———— La carte ———— */

function Carte({ d }: { d: Direct }) {
  const { france, voisins } = pointsDeLaCarte();
  /* Les étiquettes se placent d’après la largeur de la carte à l’écran (620 px au rendu du serveur) */
  const boite = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(620);
  useEffect(() => {
    const el = boite.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const suivi = new ResizeObserver(([e]) => e && e.contentRect.width > 0 && setLargeur(Math.round(e.contentRect.width)));
    suivi.observe(el);
    return () => suivi.disconnect();
  }, []);
  const { placees, horsCarte } = placerLesVilles(d.villes, largeur);
  const enMots = (v: { nom: string; n: number }) => `${v.nom} ${nombre(v.n)}`;
  const resume = d.villes.length
    ? `Carte des personnes en ligne\u00a0: ${placees.map(enMots).join(", ") || "aucune en France, en Belgique ou en Suisse"}${horsCarte.length ? `\u00a0; hors carte\u00a0: ${horsCarte.map(enMots).join(", ")}` : ""}`
    : "Carte des personnes en ligne\u00a0: personne en ce moment";
  return (
    <section aria-labelledby="carte-titre" className="flex min-w-0 grow-[999] basis-[560px] flex-col rounded-card bg-white p-5 shadow-card md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="carte-titre" className="m-0 text-[19px] font-black tracking-[-0.01em]">
            Où ils sont
          </h2>
          <p className="m-0 mt-[3px] text-note font-bold text-grey">D’après leur connexion, à la ville près</p>
        </div>
        <div className="flex items-center gap-3">
          {horsCarte.length > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-1.5 text-note font-extrabold">
              <span aria-hidden="true" className="size-2 rounded-full bg-[#e8358a]" />
              Hors carte{NBSP}: {horsCarte.map(enMots).join(", ")}
            </span>
          )}
          <BoutonAide
            cle="carte"
            valeur={pluriel(d.villes.length, "ville")}
            contexte={`${pluriel(
              horsCarte.reduce((t, v) => t + v.n, 0),
              "personne",
            )} hors carte`}
          />
        </div>
      </header>
      <div ref={boite} role="img" aria-label={resume} className="relative mx-auto mt-2 w-full max-w-[620px]" style={{ aspectRatio: `${LARGEUR} / ${HAUTEUR}` }}>
        <svg viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} aria-hidden="true" className="absolute inset-0 size-full">
          <path d={voisins} fill="none" stroke="#e7e3db" strokeWidth={0.1} strokeLinecap="round" />
          <path d={france} fill="none" stroke="#cdc8bd" strokeWidth={0.1} strokeLinecap="round" />
        </svg>
        {/* Les bulles d’abord, les étiquettes par-dessus */}
        {placees.map((v, k) => (
          <span key={`b-${k}`} aria-hidden="true" className="absolute size-0" style={{ left: `${v.x}%`, top: `${v.y}%` }}>
            <span
              className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-elle shadow-[0_0_0_2px_white]"
              style={{ width: v.diametre, height: v.diametre }}
            >
              <span className="absolute inset-0 rounded-full bg-elle opacity-60 motion-safe:animate-ping" />
            </span>
          </span>
        ))}
        {placees
          .filter((v) => v.etiquette)
          .map((v, k) => (
            <span key={`e-${k}`} aria-hidden="true" className="absolute size-0" style={{ left: `${v.x}%`, top: `${v.y}%` }}>
              <span
                className={cn(
                  "absolute flex h-6 items-center gap-1 whitespace-nowrap rounded-full bg-ink px-[9px] text-legende font-black text-white shadow-[0_6px_14px_-6px_rgba(17,17,20,0.5)]",
                  v.cote === "d" || v.cote === "g" ? "top-0 -translate-y-1/2" : "left-0 -translate-x-1/2",
                )}
                style={{ [COTES[v.cote]]: v.diametre / 2 + ECART_DE_L_ETIQUETTE }}
              >
                {v.nom} <b className="text-[#ff9bcb] tabular-nums">{nombre(v.n)}</b>
              </span>
            </span>
          ))}
      </div>
    </section>
  );
}

/* ———— Où ils en sont, d’où ils arrivent ———— */

function Lignes({
  titre,
  id,
  sous,
  lignes,
  total,
  couleur,
  vide,
}: {
  titre: string;
  id: string;
  sous: string;
  lignes: { nom: string; n: number }[];
  total: number;
  couleur: string;
  vide: string;
}) {
  return (
    <section aria-labelledby={`${id}-titre`} className="flex min-w-0 flex-col rounded-card bg-white p-5 shadow-card md:p-6">
      <h2 id={`${id}-titre`} className="m-0 text-[19px] font-black tracking-[-0.01em]">
        {titre}
      </h2>
      <p className="m-0 mt-[3px] text-note font-bold text-grey">{sous}</p>
      {lignes.length ? (
        <ul className="m-0 mt-[18px] flex list-none flex-col gap-3 p-0">
          {lignes.map((l) => (
            <li key={l.nom} className="grid grid-cols-[minmax(0,170px)_minmax(0,1fr)_30px] items-center gap-3 text-detail font-extrabold">
              <span className="truncate">{l.nom}</span>
              <Barre part={l.n / Math.max(1, total)} couleur={couleur} />
              <span className="text-right tabular-nums">{nombre(l.n)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-[18px] text-note font-bold text-grey">{vide}</p>
      )}
    </section>
  );
}

function OuIlsEnSont({ d }: { d: Direct }) {
  return (
    <Lignes
      id="etapes"
      titre="Où ils en sont"
      sous="L’écran ouvert en ce moment"
      lignes={etapesPeuplees(d.etapes).map((e) => ({ nom: NOMS_DES_ETAPES[e.etape], n: e.n }))}
      total={d.enLigne}
      couleur="#e8358a"
      vide="Personne sur le site en ce moment."
    />
  );
}

function DOuIlsArrivent({ d }: { d: Direct }) {
  return (
    <Lignes
      id="arrivent"
      titre="D’où ils arrivent"
      sous="Les personnes en ligne, par canal"
      lignes={d.sources.map((s) => ({ nom: NOMS_DES_SOURCES[s.source], n: s.n }))}
      total={d.enLigne}
      couleur="var(--toi)"
      vide="Personne sur le site en ce moment."
    />
  );
}

/* ———— Le fil ———— */

function Fil({ d }: { d: Direct }) {
  const { ecoule } = useDirect();
  const [filtre, setFiltre] = useState("tout");
  const genres = FILTRES.find((f) => f.id === filtre)?.genres ?? null;
  const gestes = d.fil.filter((g) => !genres || genres.includes(g.genre)).slice(0, GESTES_MONTRES);
  const dernier = d.fil[0];
  const annonce = dernier ? texteDuGeste(dernier) : null;
  return (
    <section aria-labelledby="fil-titre" className="flex min-w-0 flex-col rounded-card bg-white p-5 shadow-card md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 id="fil-titre" className="m-0 text-[19px] font-black tracking-[-0.01em]">
            Ce qui se passe
          </h2>
          <p className="m-0 mt-[3px] text-note font-bold text-grey">Une ville et un geste, jamais un nom ni une conv</p>
        </div>
        <div role="group" aria-label="Filtrer le fil" className="flex flex-wrap gap-2">
          {FILTRES.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={f.id === filtre}
              onClick={() => setFiltre(f.id)}
              className={cn("min-h-11 rounded-full px-3.5 text-note font-black transition-colors", f.id === filtre ? "bg-ink text-white" : "bg-sep text-soft hover:text-ink")}
            >
              {f.nom}
            </button>
          ))}
        </div>
      </header>
      {/* Le dernier geste arrivé, annoncé une fois (les « il y a » qui changent chaque seconde ne le sont pas) */}
      <p role="status" className="sr-only">
        {annonce ? `Dernier geste\u00a0: ${annonce.ville}, ${annonce.quoi}${annonce.prix ? `, ${annonce.prix}` : ""}` : ""}
      </p>
      {gestes.length ? (
        <ul className="m-0 mt-4 list-none p-0">
          {gestes.map((g, k) => {
            const t = texteDuGeste(g);
            return (
              <li key={`${g.le}-${g.genre}-${k}`} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-3.5 border-t border-sep py-[13px] text-corps font-extrabold">
                <span aria-hidden="true" className={cn("size-2.5 rounded-full", POINTS_DU_FIL[g.genre].blanc)} />
                <span className="min-w-0">
                  {t.ville} <span className="text-grey">· {t.quoi}</span>
                  {t.prix && <b className="ml-1.5 inline-block rounded-full bg-[#e8358a]/12 px-2 py-0.5 text-legende font-black text-elle-ink tabular-nums">{t.prix}</b>}
                </span>
                <span className="whitespace-nowrap text-legende font-extrabold text-grey">{ilYa(secondesDepuis(d, g.le, ecoule))}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 mt-4 text-note font-bold text-grey">{genres ? "Rien de ce genre dans les dernières 24\u00a0h." : "Rien dans les dernières 24\u00a0h."}</p>
      )}
    </section>
  );
}
