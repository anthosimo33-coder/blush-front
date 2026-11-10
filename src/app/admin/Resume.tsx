import type { Route } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import type { Changement } from "@/contenu/changements";
import { CIBLE_DE_MARGE, NOMS_DES_SOURCES, SOURCE_INCONNUE } from "@/contenu/pilotage";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { jourDeParis } from "@/lib/jours";
import type { StatsAdmin } from "@/server/stats";
import { aDecider, soucisDeSante, type Decision, type Vue } from "./a-decider";
import { margeProduit, margeSurPeuDeVentes, meilleureSource } from "./a-regarder";
import { ETAPES_DU_TUNNEL, ecartEnPoints, ecartEnValeur, ecartRelatif, euros, fuiteDuTunnel, nombre, pluriel, pourcent, rapport, type Ecart } from "./calculs";
import { Barre, Bloc, PastilleEcart } from "./morceaux";
import { Colonnes } from "./Pilotage";

/*
 * Le résumé du pilotage rangé (/admin) : ce qu’il faut pour
 * décider, sur un écran et demi. Le bandeau de la santé (seulement si ça coince), les cinq chiffres avec leur valeur
 * d’avant en toutes lettres, « À décider », le chiffre d’affaires avec les changements du produit datés sur ses
 * colonnes, le tunnel sur une ligne, et les canaux, leur part du trafic face à leur part du chiffre d’affaires. Le
 * détail de chaque chose est dans sa rubrique. Que des nombres.
 * TODO(produit): textes du résumé à valider.
 */

/** Le lien vers une rubrique (et une ancre dedans), la période gardée. */
export type VersLaVue = (vue: Vue, ancre?: string) => Route;

const ORANGE = "#e08600";
const ROSE = "#e8358a";

export function Resume({ s, vers, changements }: { s: StatsAdmin; vers: VersLaVue; changements: readonly Changement[] }) {
  return (
    <>
      <BandeauDeSante s={s} vers={vers} />
      <CinqChiffres s={s} />
      <ADecider lignes={aDecider(s)} vers={vers} />
      <ArgentEtChangements s={s} changements={changements} />
      <TunnelSurUneLigne s={s} vers={vers} />
      <CanauxFaceAFace s={s} vers={vers} />
    </>
  );
}

/* ———— La santé : un bandeau, seulement si ça coince ———— */

function BandeauDeSante({ s, vers }: { s: StatsAdmin; vers: VersLaVue }) {
  const soucis = soucisDeSante(s);
  if (!soucis.length) return null;
  return (
    <Link
      href={vers("sante")}
      className="flex items-center gap-3 rounded-[16px] bg-[#e08600]/12 px-4 py-3 text-detail font-extrabold leading-[1.35] text-[#5c3300] no-underline hover:bg-[#e08600]/18"
    >
      <Icon name="alert" size={20} stroke={2.4} />
      <span className="min-w-0 flex-1">
        <span className="font-black">Santé{NBSP}:</span> {soucis.join(", ")}
      </span>
      <span className="shrink-0 font-black">Voir →</span>
    </Link>
  );
}

/* ———— Les cinq chiffres ———— */

function CinqChiffres({ s }: { s: StatsAdmin }) {
  const p = s.pilotage;
  const suivi = p.suiviDepuis !== null;
  const taux = rapport(p.acheteurs.valeur, p.visiteurs.valeur);
  const tauxAvant = rapport(p.acheteurs.avant, p.visiteurs.avant);
  const panier = rapport(p.centimesPayes.valeur, p.acheteurs.valeur);
  const panierAvant = rapport(p.centimesPayes.avant, p.acheteurs.avant);
  const m = margeProduit(s);
  const peu = m.valeur !== null && !m.seLit ? margeSurPeuDeVentes(m, s.jours) : null;
  const sousLaCible = !peu && m.valeur !== null && m.valeur < CIBLE_DE_MARGE;
  return (
    <section aria-labelledby="cinq-chiffres-titre" id="chiffres-cles" className="scroll-mt-40">
      <h2 id="cinq-chiffres-titre" className="sr-only">
        Les chiffres clés
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
        <Chiffre
          large
          titre="Chiffre d’affaires net"
          valeur={euros(p.net.valeur)}
          avant={euros(p.net.avant)}
          ecart={ecartRelatif(p.net.valeur, p.net.avant, (v) => euros(v))}
          sous={pluriel(p.payes.n, "vente")}
        />
        <Chiffre
          titre="Visiteurs"
          valeur={suivi ? nombre(p.visiteurs.valeur) : "—"}
          avant={suivi ? nombre(p.visiteurs.avant) : null}
          ecart={suivi ? ecartRelatif(p.visiteurs.valeur, p.visiteurs.avant, nombre) : null}
          sous="une fois par jour"
        />
        <Chiffre
          titre="Taux d’achat"
          valeur={taux === null ? "—" : pourcent(taux * 100)}
          avant={tauxAvant === null ? null : pourcent(tauxAvant * 100)}
          ecart={ecartEnPoints(taux === null ? null : taux * 100, tauxAvant === null ? null : tauxAvant * 100)}
          sous={pluriel(p.acheteurs.valeur, "acheteur")}
        />
        <Chiffre
          titre="Revenu par acheteur"
          valeur={panier === null ? "—" : euros(panier)}
          avant={panierAvant === null ? null : euros(panierAvant)}
          ecart={ecartEnValeur(panier, panierAvant, (v) => euros(v))}
          sous="recharges comprises"
        />
        <Chiffre
          titre="Marge produit"
          valeur={m.valeur === null ? "—" : pourcent(m.valeur, 0)}
          valeurClasse={peu ? "text-grey" : sousLaCible ? "text-attente-ink" : undefined}
          avant={peu || m.avant === null ? null : pourcent(m.avant, 0)}
          ecart={peu ? null : ecartEnPoints(m.valeur, m.avant)}
          sous={peu ? `${peu.ventes}, ${peu.ouLire}` : `cible ${pourcent(CIBLE_DE_MARGE, 0)}`}
        />
      </div>
    </section>
  );
}

/** Un chiffre du résumé : sa valeur, son écart, et la valeur d’avant en toutes lettres (jamais un écart seul). */
function Chiffre({
  titre,
  valeur,
  valeurClasse,
  avant,
  ecart,
  sous,
  large = false,
}: {
  titre: string;
  valeur: string;
  valeurClasse?: string;
  avant: string | null;
  ecart: Ecart | null;
  sous: string;
  large?: boolean;
}) {
  return (
    <article className={cn("flex min-w-0 flex-col gap-1 rounded-tile bg-white p-4 shadow-card", large && "col-span-2 lg:col-span-1")}>
      <h3 className="m-0 text-legende font-black text-grey">{titre}</h3>
      <p className={cn("m-0 whitespace-nowrap text-[27px] font-black leading-[1.1] tracking-[-0.03em] tabular-nums", valeurClasse)}>{valeur}</p>
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <PastilleEcart e={ecart} />
        {avant !== null && <span className="whitespace-nowrap text-legende font-extrabold text-soft tabular-nums">{avant} avant</span>}
      </p>
      <p className="m-0 text-micro font-bold text-grey">{sous}</p>
    </article>
  );
}

/* ———— À décider ———— */

const TONS: Record<Decision["ton"], { nom: string; pastille: string }> = {
  mal: { nom: "Ça coince", pastille: "bg-[#e08600]/16 text-[#8a4a00]" },
  neutre: { nom: "À savoir", pastille: "bg-sep text-soft" },
  bon: { nom: "Ça marche", pastille: "bg-vrai/14 text-vrai-ink" },
};

function ADecider({ lignes, vers }: { lignes: Decision[]; vers: VersLaVue }) {
  return (
    <Bloc id="a-decider" titre="À décider" sous="Ce qui coince d’abord, puis ce qui marche. Chaque ligne mène à son détail.">
      <ol className="m-0 mt-3 flex list-none flex-col p-0">
        {lignes.map((l, k) => (
          <li
            key={l.titre}
            className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-sep py-3.5 first:border-t-0 md:grid-cols-[28px_minmax(0,1fr)_auto] md:items-center"
          >
            <span aria-hidden="true" className={cn("flex size-7 items-center justify-center rounded-full text-legende font-black tabular-nums", TONS[l.ton].pastille)}>
              {k + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-corps font-black leading-[1.25] tracking-[-0.01em]">
                <span className="sr-only">{TONS[l.ton].nom}. </span>
                {l.titre}
              </span>
              <span className="mt-1 block text-note font-bold leading-[1.45] text-soft">{l.texte}</span>
            </span>
            {l.lien && (
              <Link
                href={vers(l.lien.vue, l.lien.ancre)}
                className="col-start-2 justify-self-start whitespace-nowrap rounded-full bg-paper px-3.5 py-2 text-note font-black text-ink no-underline hover:bg-sep md:col-start-3"
              >
                {l.lien.texte} →
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Bloc>
  );
}

/* ———— Le chiffre d’affaires, et ce qui a changé ———— */

function ArgentEtChangements({ s, changements }: { s: StatsAdmin; changements: readonly Changement[] }) {
  const p = s.pilotage;
  /* Les changements tombés dans la période, du plus ancien au plus récent : leur numéro, et la colonne de leur jour */
  const premier = p.cases[0] ? jourDeParis(new Date(p.cases[0].le)) : null;
  const dernier = s.plage?.au ?? jourDeParis(new Date(s.le));
  /* Une période choisie qui s’arrête avant aujourd’hui : pas de case en cours */
  const fini = !!s.plage && s.plage.au < jourDeParis(new Date(s.le));
  const dans = premier === null ? [] : changements.filter((c) => c.le >= premier && c.le <= dernier).sort((a, b) => a.le.localeCompare(b.le));
  const reperes = new Map<number, number>();
  if (p.pas === "jour")
    dans.forEach((c, k) => {
      const colonne = p.cases.findIndex((x) => jourDeParis(new Date(x.le)) === c.le);
      if (colonne >= 0 && !reperes.has(colonne)) reperes.set(colonne, k + 1);
    });
  return (
    <Bloc id="chiffre-d-affaires" titre="Le payé, jour par jour" sous="Net, TTC, des vrais clients. Chaque changement du produit est daté sur sa colonne." className="scroll-mt-40">
      <Colonnes p={p} fini={fini} reperes={reperes} />
      <p className="m-0 mt-4 flex flex-wrap gap-x-[18px] gap-y-1.5 border-t border-sep pt-3.5 text-note font-extrabold text-soft tabular-nums">
        <span>Payé {euros(p.payes.centimes)}</span>
        <span>Remboursé {p.rembourses.centimes ? `−${euros(p.rembourses.centimes)} (${nombre(p.rembourses.n)})` : euros(0)}</span>
        <span>Contesté {p.contestes.centimes ? `−${euros(p.contestes.centimes)} (${nombre(p.contestes.n)})` : euros(0)}</span>
        {!fini && (
          <span className="inline-flex items-center gap-1.5 text-grey md:ml-auto">
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: ROSE }} />
            {p.pas === "heure" ? "cette heure, en cours" : "aujourd’hui, en cours"}
          </span>
        )}
      </p>
      <h3 className="m-0 mt-5 text-detail font-black">Ce qui a changé sur la période</h3>
      {dans.length ? (
        <ol className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
          {dans.map((c, k) => (
            <li key={`${c.le}-${c.quoi}`} className="flex items-baseline gap-2.5 text-note font-bold text-soft">
              <span
                aria-hidden="true"
                className="flex size-5 shrink-0 translate-y-[3px] items-center justify-center rounded-full bg-toi text-[11px] font-black leading-none text-white"
              >
                {k + 1}
              </span>
              <span>
                <span className="font-black text-ink">
                  {new Date(`${c.le}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" })}
                </span>{" "}
                · {c.quoi}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 mt-2 text-note font-bold text-grey">Rien n’a changé dans le produit sur la période{NBSP}: ce qui bouge vient du trafic.</p>
      )}
    </Bloc>
  );
}

/* ———— Le tunnel, sur une ligne ———— */

function TunnelSurUneLigne({ s, vers }: { s: StatsAdmin; vers: VersLaVue }) {
  const t = s.pilotage.tunnel;
  const suivi = s.pilotage.suiviDepuis !== null;
  const fuite = fuiteDuTunnel(t);
  const etapes = ETAPES_DU_TUNNEL.map(([cle, nom]) => ({ cle, nom, n: t[cle] }));
  return (
    <Bloc id="tunnel" titre="Le tunnel" sous="De l’arrivée sur le site au deuxième achat" className="scroll-mt-40">
      <ol className="m-0 mt-4 grid list-none grid-cols-1 gap-x-3 gap-y-0 p-0 sm:grid-cols-5">
        {etapes.map((e, k) => {
          const taux = k > 0 ? rapport(e.n, etapes[k - 1]?.n ?? 0) : null;
          const estLaFuite = fuite?.etape === k;
          return (
            <li
              key={e.cle}
              className="flex min-w-0 items-center justify-between gap-3 border-t border-sep py-2.5 first:border-t-0 sm:flex-col sm:items-start sm:justify-start sm:gap-1.5 sm:border-l sm:border-t-0 sm:py-0 sm:pl-3 sm:first:border-l-0 sm:first:pl-0"
            >
              <span className="text-note font-extrabold leading-[1.2] text-soft sm:order-2">{e.nom}</span>
              <span className="flex items-center gap-2.5 sm:order-1 sm:flex-col sm:items-start sm:gap-1.5">
                <span
                  className={cn(
                    "whitespace-nowrap rounded-full px-[9px] py-[2px] text-legende font-black tabular-nums",
                    k === 0 ? "hidden sm:invisible sm:inline" : estLaFuite ? "bg-[#e08600]/16 text-[#8a4a00]" : "bg-sep text-soft",
                  )}
                >
                  {taux === null ? "—" : `→ ${pourcent(taux * 100)}`}
                </span>
                <span className="min-w-[52px] text-right text-[24px] font-black leading-none tracking-[-0.02em] tabular-nums sm:text-left">
                  {e.cle === "visiteurs" && !suivi ? "—" : nombre(e.n)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="m-0 mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-note font-bold text-soft">
        <span>
          {fuite ? (
            <>
              <span aria-hidden="true" className="mr-1.5 inline-block size-2.5 rounded-[3px] align-baseline" style={{ background: ORANGE }} />
              La plus grosse fuite{NBSP}: {pourcent((1 - fuite.taux) * 100, 0)} partent entre «{NBSP}
              {etapes[fuite.etape - 1]?.nom}
              {NBSP}» et «{NBSP}
              {etapes[fuite.etape]?.nom}
              {NBSP}».
            </>
          ) : (
            "Pas encore de fuite à comparer."
          )}
        </span>
        <Link href={vers("tunnel")} className="whitespace-nowrap font-black text-ink no-underline hover:underline">
          L’import et le paywall, écran par écran →
        </Link>
      </p>
    </Bloc>
  );
}

/* ———— Les canaux : leur part du trafic face à leur part du chiffre d’affaires ———— */

/** Combien de canaux au plus dans le résumé (les autres sont dans l’acquisition). */
const CANAUX = 6;

function CanauxFaceAFace({ s, vers }: { s: StatsAdmin; vers: VersLaVue }) {
  const p = s.pilotage;
  const sources = p.sources.filter((x) => x.visiteurs > 0 || x.centimes > 0);
  const visiteurs = sources.reduce((t, x) => t + x.visiteurs, 0);
  const paye = sources.reduce((t, x) => t + x.centimes, 0);
  const meilleure = meilleureSource(p.sources)?.source;
  return (
    <Bloc id="canaux" titre="Où mettre l’effort" sous="Chaque canal, sa part du trafic face à sa part du chiffre d’affaires" className="scroll-mt-40">
      {sources.length ? (
        <ul className="m-0 mt-3 flex list-none flex-col p-0">
          {sources.slice(0, CANAUX).map((x) => {
            const trafic = rapport(x.visiteurs, visiteurs) ?? 0;
            const argent = rapport(x.centimes, paye) ?? 0;
            return (
              <li
                key={x.source ?? "inconnue"}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-sep py-3 first:border-t-0 md:grid-cols-[190px_minmax(0,1fr)_150px]"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-detail font-black">
                  {x.source === null ? SOURCE_INCONNUE : NOMS_DES_SOURCES[x.source]}
                  {x.source !== null && x.source === meilleure && (
                    <span className="whitespace-nowrap rounded-full bg-vrai/14 px-[7px] py-0.5 text-[11px] font-black text-vrai-ink">meilleur taux</span>
                  )}
                  {x.source !== null && x.acheteurs === 0 && x.visiteurs >= 100 && (
                    <span className="whitespace-nowrap rounded-full bg-[#e08600]/16 px-[7px] py-0.5 text-[11px] font-black text-[#8a4a00]">aucun acheteur</span>
                  )}
                </span>
                <span className="text-right text-detail font-black tabular-nums md:order-3">
                  {euros(x.centimes, 0)}
                  <span className="block text-micro font-bold text-grey">
                    {x.source === null ? pluriel(x.acheteurs, "acheteur") : `${pluriel(x.acheteurs, "acheteur")} sur ${nombre(x.visiteurs)}`}
                  </span>
                </span>
                <span className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
                  <span className="flex items-center gap-2.5">
                    <span className="w-[86px] shrink-0 text-micro font-extrabold text-grey tabular-nums">trafic {pourcent(trafic * 100, 0)}</span>
                    <Barre part={trafic} couleur="var(--toi)" hauteur="h-2" />
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="w-[86px] shrink-0 text-micro font-extrabold text-grey tabular-nums">ventes {pourcent(argent * 100, 0)}</span>
                    <Barre part={argent} couleur={ROSE} hauteur="h-2" />
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 mt-[18px] text-note font-bold text-grey">Ni visite ni vente sur la période.</p>
      )}
      <p className="m-0 mt-3 text-right text-note">
        <Link href={vers("acquisition")} className="font-black text-ink no-underline hover:underline">
          Tous les canaux et les pages d’arrivée →
        </Link>
      </p>
    </Bloc>
  );
}
