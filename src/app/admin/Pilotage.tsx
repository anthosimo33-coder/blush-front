import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { NOM_DU_GENRE } from "@/contenu/haut-du-paywall";
import { CIBLE_DE_MARGE, EUROS_PAR_DOLLAR, NOMS_DES_GROUPES, NOMS_DES_SOURCES, SOURCE_INCONNUE, margeApresIA } from "@/contenu/pilotage";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import type { SanteDesNavigateurs } from "@/server/navigateur";
import type { Periode, Pilotage as Chiffres, StatsAdmin } from "@/server/stats";
import type { OffreUnique } from "@/types";
import type { Direct } from "@/types/api";
import { aRegarder, meilleureSource, type CarteARegarder } from "./a-regarder";
import { BoutonAide } from "./Aide";
import { Beta, Journal, NOMS_OFFRES_UNIQUES } from "./AdminScreen";
import {
  COULEURS_DES_GROUPES,
  ETAPES_DU_TUNNEL,
  caseNommee,
  dollars,
  ecartEnPoints,
  ecartEnValeur,
  ecartRelatif,
  euros,
  fuiteDuTunnel,
  graduations,
  nombre,
  nomsDeLaCase,
  pluriel,
  pointsDeLaCourbe,
  pourcent,
  rapport,
  texteDeLaFuite,
  type Ecart,
} from "./calculs";
import { CarteEnDirect } from "./CarteEnDirect";
import { EnTete, type BaseDeLAdmin } from "./EnTete";
import { GestesDeLEquipe } from "./GestesDeLEquipe";
import { Navigateurs } from "./Navigateurs";
import { Barre, Bloc, PastilleEcart, type AideDuBloc } from "./morceaux";
import { SondeDuDirect } from "./SondeDuDirect";

/*
 * Le pilotage (/admin) : ce qui se passe sur la période, d’un coup d’œil. En haut, « À regarder » (ce qui coince, puis
 * les bonnes nouvelles) ; puis l’argent (le chiffre d’affaires net, case par case) à côté du direct ; les quatre chiffres
 * clés ; le tunnel ; d’où viennent les visiteurs et ce qui se vend ; ce que coûte l’IA et la santé ; enfin les outils de
 * l’équipe. Que des nombres : aucune conv, aucun message, aucun email. Chaque carte a son « ? » (src/contenu/aide-pilotage.ts).
 * Maquette validée le 13 octobre ; l’écran d’avant reste à /admin?version=actuelle.
 * TODO(produit): textes du pilotage à valider.
 */

/** Une période : le nom de son lien, « sur … » et « vs … » (contre quoi se lit l’écart). */
const PERIODES: Record<Periode, { lien: string; sur: string; contre: string }> = {
  1: { lien: "24 h", sur: "sur 24\u00a0h", contre: "vs les 24\u00a0h d’avant" },
  7: { lien: "7 jours", sur: "sur 7\u00a0jours", contre: "vs les 7\u00a0jours d’avant" },
  30: { lien: "30 jours", sur: "sur 30\u00a0jours", contre: "vs les 30\u00a0jours d’avant" },
};

/** Où et quand chaque coup de pouce se montre (src/server/offres-uniques.ts, src/server/relances.ts). */
const MOMENTS_DES_COUPS: Record<OffreUnique, string> = {
  suite: "feuille du paiement fermée sans payer",
  relance_mail: "deux heures après",
  premium_ajout: "juste après le paiement",
  premiere_recharge: "à la première recharge",
  second_rapport: "juste après le paiement",
  garde_second: "le 2e rapport refusé, juste après",
};

/* Les couleurs propres au pilotage : le rose de la case en cours, l’orange de la fuite et de la marge sous la cible, le vert de la marge tenue */
const ROSE = "#e8358a";
const ORANGE = "#e08600";
const VERT = "#0fa877";

const PARIS = "Europe/Paris";

/** « Mardi 13 octobre, 16:05 », en heure de Paris. */
function quand(le: string): string {
  const d = new Date(le);
  const jour = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: PARIS });
  return `${jour.charAt(0).toUpperCase()}${jour.slice(1)}, ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: PARIS })}`;
}

/** Le jour de Paris d’un instant (AAAA-MM-JJ). */
const jourDeParis = (t: number) => new Date(t).toLocaleDateString("sv-SE", { timeZone: PARIS });

/**
 * `direct` : le direct lu par la page (null : pas lu, la carte le lit) ; `base` : /admin, ou l’aperçu de l’équipe ;
 * `sonder` faux : l’aperçu, dont le direct reste figé.
 */
export function Pilotage({
  s,
  direct,
  navigateurs = null,
  base = "/admin",
  sonder = true,
}: {
  s: StatsAdmin;
  direct: Direct | null;
  /** Les erreurs et la vitesse chez les visiteurs (src/server/navigateur.ts) ; null : pas lues. */
  navigateurs?: SanteDesNavigateurs | null;
  base?: BaseDeLAdmin;
  sonder?: boolean;
}) {
  const p = s.pilotage;
  const periode = PERIODES[s.jours];
  return (
    <SondeDuDirect initial={direct} sonder={sonder}>
      <main className="min-h-dvh pb-32 md:pb-16">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 pt-4 md:gap-6 md:px-8 md:pt-6">
          <EnTete base={base} ici="pilotage" droite={<Periodes base={base} jours={s.jours} />} />

          <div className="flex flex-col gap-1.5 md:mt-2">
            <h1 className="m-0 text-[34px] font-black leading-[1.05] tracking-[-0.035em] md:text-[44px]">Pilotage</h1>
            <p className="m-0 text-detail font-extrabold text-grey">
              {quand(s.le)} · {periode.sur}, {periode.contre}
            </p>
          </div>

          <ARegarder cartes={aRegarder(s)} />

          <div className="flex flex-wrap gap-4 md:gap-6">
            <ChiffreDAffaires p={p} jours={s.jours} />
            <CarteEnDirect base={base} />
          </div>

          <ChiffresCles s={s} />
          <Tunnel p={p} jours={s.jours} />
          <HautsDuPaywall p={p} />

          <div className="flex flex-wrap gap-4 md:gap-6">
            <Sources p={p} />
            <CeQuiSeVend s={s} />
          </div>

          <div className="flex flex-wrap gap-4 md:gap-6">
            <Couts s={s} />
            <Sante s={s} />
          </div>

          {navigateurs && <Navigateurs n={navigateurs} />}

          <Bloc id="outils" titre="Outils" sous="Chaque geste est noté au journal de l’équipe">
            <div className="mt-4 flex flex-col gap-4">
              <GestesDeLEquipe invitables={s.beta.attente - s.beta.attenteInvites} mailsPossibles={s.beta.mailsPossibles} />
              <div className="grid gap-4 md:grid-cols-2">
                <SousBloc id="beta" titre="Bêta" sous="Qui attend, qui est entré">
                  <Beta b={s.beta} />
                </SousBloc>
                <SousBloc id="journal" titre="Les derniers gestes" sous="De l’équipe, ici ou dans le terminal">
                  <Journal actions={s.actions} />
                </SousBloc>
              </div>
            </div>
          </Bloc>

          <p className="m-0 text-center text-note font-extrabold text-grey">Que des nombres{NBSP}: aucune conv, aucun message, aucun email ne sort d’ici.</p>
        </div>
      </main>
    </SondeDuDirect>
  );
}

/** La période, en liens (?p=) : 24 h, 7 jours, 30 jours. */
function Periodes({ base, jours }: { base: BaseDeLAdmin; jours: Periode }) {
  return (
    <nav aria-label="Période" className="flex w-full rounded-full bg-segment p-1 md:w-auto">
      {([1, 7, 30] as const).map((j) => (
        <Link
          key={j}
          href={`${base}?p=${j}`}
          aria-current={j === jours ? "page" : undefined}
          className={cn(
            "flex min-h-10 flex-1 items-center justify-center rounded-full px-4 text-detail font-black no-underline md:flex-none",
            j === jours ? "bg-white text-ink shadow-[0_1px_2px_rgba(17,17,20,0.08),0_6px_14px_-8px_rgba(17,17,20,0.3)]" : "text-soft hover:text-ink",
          )}
        >
          {PERIODES[j].lien}
        </Link>
      ))}
    </nav>
  );
}

/* ———— À regarder ———— */

const TONS: Record<CarteARegarder["ton"], { etiquette: string; classe: string; icone: ReactNode }> = {
  mal: { etiquette: "À regarder", classe: "text-attente-ink", icone: <Icon name="alert" size={16} stroke={2.4} /> },
  bon: {
    etiquette: "Bonne nouvelle",
    classe: "text-vrai-ink",
    icone: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 16l5-5 4 4 7-7" />
        <path d="M15 8h5v5" />
      </svg>
    ),
  },
  neutre: { etiquette: "À savoir", classe: "text-grey", icone: <Icon name="clock" size={16} stroke={2.4} /> },
};

function ARegarder({ cartes }: { cartes: CarteARegarder[] }) {
  return (
    <section aria-labelledby="a-regarder-titre">
      <h2 id="a-regarder-titre" className="m-0 mb-3 text-legende font-black uppercase tracking-[0.08em] text-grey">
        À regarder
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
        {cartes.map((c) => (
          <article key={c.titre} className="flex flex-col gap-2 rounded-tile bg-white p-5 shadow-card">
            <p className={cn("m-0 inline-flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.06em]", TONS[c.ton].classe)}>
              {TONS[c.ton].icone}
              {TONS[c.ton].etiquette}
            </p>
            <h3 className="m-0 text-accent font-black leading-[1.25] tracking-[-0.01em]">{c.titre}</h3>
            <p className="m-0 text-note font-bold leading-[1.45] text-soft">{c.texte}</p>
            {c.lien && (
              <a href={`#${c.lien.ancre}`} className="mt-auto pt-1 text-note font-black text-ink no-underline hover:underline">
                {c.lien.texte} →
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

/* ———— Le chiffre d’affaires ———— */

function ChiffreDAffaires({ p, jours }: { p: Chiffres; jours: Periode }) {
  const ecart = ecartRelatif(p.net.valeur, p.net.avant, (v) => euros(v));
  return (
    <Bloc
      id="chiffre-d-affaires"
      titre="Chiffre d’affaires"
      sous="Net, TTC, remboursements retirés"
      aide={{ cle: "ca", valeur: euros(p.net.valeur), contexte: `${PERIODES[jours].sur}, ${texteDeLEcart(ecart)} ${PERIODES[jours].contre}` }}
      className="grow-[999] basis-[560px]"
    >
      <p className="m-0 mt-[18px] flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <span className="text-[44px] font-black leading-none tracking-[-0.035em] tabular-nums md:text-affiche">{euros(p.net.valeur)}</span>
        <PastilleEcart e={ecart} />
        <span className="text-legende font-bold text-grey">{PERIODES[jours].contre}</span>
      </p>
      <Colonnes p={p} />
      <p className="m-0 mt-[18px] flex flex-wrap gap-x-[18px] gap-y-1.5 border-t border-sep pt-4 text-note font-extrabold text-soft tabular-nums">
        <span>Payé {euros(p.payes.centimes)}</span>
        <span>Remboursé {p.rembourses.centimes ? `−${euros(p.rembourses.centimes)} (${nombre(p.rembourses.n)})` : euros(0)}</span>
        <span>Contesté {p.contestes.centimes ? `−${euros(p.contestes.centimes)} (${nombre(p.contestes.n)})` : euros(0)}</span>
        <span className="inline-flex items-center gap-1.5 text-grey md:ml-auto">
          <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: ROSE }} />
          {p.pas === "heure" ? "cette heure, en cours" : "aujourd’hui, en cours"}
        </span>
      </p>
    </Bloc>
  );
}

/** Le payé case par case : une colonne par heure ou par jour, la dernière (en cours) en rose, une info-bulle au survol. */
function Colonnes({ p }: { p: Chiffres }) {
  const n = p.cases.length;
  if (!n) return <p className="m-0 mt-6 text-note font-bold text-grey">Rien à montrer case par case pour l’instant.</p>;
  const { haut, marques } = graduations(Math.max(0, ...p.cases.map((c) => c.centimes)));
  const noms = p.cases.map((c) => nomsDeLaCase(c.le, p.pas, n));
  const plusHaut = p.cases.reduce((m, c, k) => (c.centimes > (p.cases[m]?.centimes ?? 0) ? k : m), 0);
  const unite = p.pas === "heure" ? "heure" : "jour";
  const derniere = p.cases[n - 1]?.centimes ?? 0;
  const resume = `Le payé par ${unite}, sur ${pluriel(n, unite)}\u00a0: le plus haut ${euros(p.cases[plusHaut]?.centimes ?? 0, 0)} (${noms[plusHaut]?.complete ?? ""}), ${euros(derniere, 0)} pour ${p.pas === "heure" ? "l’heure" : "le jour"} en cours.`;
  return (
    <>
      <div role="img" aria-label={resume} className="relative mt-6 flex h-[180px] md:h-[220px]">
        <div aria-hidden="true" className="relative w-[52px] shrink-0">
          {marques.map((m) => (
            <span key={m} className="absolute right-2.5 translate-y-1/2 text-micro font-extrabold text-grey tabular-nums" style={{ bottom: `${(m / haut) * 100}%` }}>
              {euros(m, 0)}
            </span>
          ))}
        </div>
        <div className="group/plot relative flex min-w-0 flex-1 items-end">
          {marques.map((m) => (
            <span key={m} aria-hidden="true" className="absolute inset-x-0 h-px bg-sep" style={{ bottom: `${(m / haut) * 100}%` }} />
          ))}
          {p.cases.map((c, k) => (
            <div key={c.le} className="group/col relative flex h-full min-w-0 flex-1 items-end justify-center">
              <div className="relative flex w-[70%] max-w-[26px] justify-center" style={{ height: c.centimes > 0 ? `${Math.max(1.5, (c.centimes / haut) * 100)}%` : "0%" }}>
                <span
                  className="block h-full w-full rounded-t-[5px] transition-opacity duration-200 group-hover/plot:opacity-30 group-hover/col:opacity-100"
                  style={{ background: k === n - 1 ? ROSE : "var(--ink)" }}
                />
                <span
                  className={cn(
                    "pointer-events-none absolute bottom-[calc(100%+8px)] z-10 whitespace-nowrap rounded-[10px] bg-ink px-2.5 py-1.5 text-legende font-extrabold text-white opacity-0 transition-opacity duration-200 group-hover/col:opacity-100 tabular-nums",
                    k < n / 3 ? "left-0" : k > (2 * n) / 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                  )}
                >
                  {noms[k]?.longue} · {euros(c.centimes, 0)}
                  {k === n - 1 && " (en cours)"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="ml-[52px] mt-2 flex">
        {noms.map((nom, k) => (
          <span key={p.cases[k]?.le ?? k} className={cn("min-w-0 flex-1 whitespace-nowrap text-center text-micro font-extrabold text-grey", !caseNommee(k, n) && "invisible")}>
            <span className="md:hidden">{nom.courte}</span>
            <span className="hidden md:inline">{nom.longue}</span>
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Le payé par {unite}</caption>
        <thead>
          <tr>
            <th scope="col">{p.pas === "heure" ? "Heure" : "Jour"}</th>
            <th scope="col">Payé</th>
          </tr>
        </thead>
        <tbody>
          {p.cases.map((c, k) => (
            <tr key={c.le}>
              <th scope="row">
                {noms[k]?.complete}
                {k === n - 1 && " (en cours)"}
              </th>
              <td>{euros(c.centimes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ———— Les chiffres clés ———— */

function ChiffresCles({ s }: { s: StatsAdmin }) {
  const p = s.pilotage;
  const suivi = p.suiviDepuis !== null;
  const cases = p.cases;
  const taux = rapport(p.acheteurs.valeur, p.visiteurs.valeur);
  const tauxAvant = rapport(p.acheteurs.avant, p.visiteurs.avant);
  const parAcheteur = rapport(p.centimesPayes.valeur, p.acheteurs.valeur);
  const parAcheteurAvant = rapport(p.centimesPayes.avant, p.acheteurs.avant);
  const marge = margeApresIA(p.net.valeur, p.dollars.valeur);
  const margeAvant = margeApresIA(p.net.avant, p.dollars.avant);
  const sousLaCible = marge !== null && marge < CIBLE_DE_MARGE;
  const ecartVisiteurs = suivi ? ecartRelatif(p.visiteurs.valeur, p.visiteurs.avant, nombre) : null;
  const ecartTaux = ecartEnPoints(taux === null ? null : taux * 100, tauxAvant === null ? null : tauxAvant * 100, "hausse", 2);
  const ecartPanier = ecartEnValeur(parAcheteur, parAcheteurAvant, (v) => euros(v));
  const ecartMarge = ecartEnPoints(marge, margeAvant);
  /* Le suivi des visites a commencé pendant la période : elle n’en a qu’une partie */
  const debut = jourDeParis(Date.parse(s.le) - s.jours * 86400e3);
  const depuis =
    p.suiviDepuis && p.suiviDepuis > debut
      ? `comptés depuis le ${new Date(`${p.suiviDepuis}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })}`
      : null;
  return (
    <section aria-labelledby="chiffres-cles-titre" id="chiffres-cles" className="scroll-mt-6">
      <h2 id="chiffres-cles-titre" className="sr-only">
        Les chiffres clés
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ChiffreCle
          titre="Visiteurs"
          aide={{
            cle: "visiteurs",
            valeur: suivi ? nombre(p.visiteurs.valeur) : "—",
            contexte: suivi ? `${PERIODES[s.jours].sur}, ${texteDeLEcart(ecartVisiteurs)}` : "pas encore comptés",
          }}
          valeur={suivi ? nombre(p.visiteurs.valeur) : "—"}
          ecart={ecartVisiteurs}
          sous={suivi ? (depuis ?? "comptés une fois par jour") : "pas encore comptés"}
          courbe={suivi ? pointsDeLaCourbe(cases.map((c) => c.visiteurs)) : ""}
          couleur="var(--toi)"
        />
        <ChiffreCle
          titre="Taux d’achat"
          aide={{
            cle: "conversion",
            valeur: taux === null ? "—" : pourcent(taux * 100, 2),
            contexte: `${pluriel(p.acheteurs.valeur, "acheteur")} sur ${pluriel(p.visiteurs.valeur, "visiteur")}`,
          }}
          valeur={taux === null ? "—" : pourcent(taux * 100, 2)}
          ecart={ecartTaux}
          sous={pluriel(p.acheteurs.valeur, "acheteur")}
          courbe={pointsDeLaCourbe(cases.map((c) => rapport(c.acheteurs, c.visiteurs)))}
          couleur={ROSE}
        />
        <ChiffreCle
          titre="Revenu par acheteur"
          aide={{ cle: "panier", valeur: parAcheteur === null ? "—" : euros(parAcheteur), contexte: `${PERIODES[s.jours].sur}, ${texteDeLEcart(ecartPanier)}` }}
          valeur={parAcheteur === null ? "—" : euros(parAcheteur)}
          ecart={ecartPanier}
          sous="recharges comprises"
          courbe={pointsDeLaCourbe(cases.map((c) => rapport(c.centimes, c.acheteurs)))}
          couleur="var(--ink)"
        />
        <ChiffreCle
          titre="Marge après IA"
          aide={{ cle: "marge", valeur: marge === null ? "—" : pourcent(marge, 0), contexte: `cible ${pourcent(CIBLE_DE_MARGE, 0)}` }}
          valeur={marge === null ? "—" : pourcent(marge, 0)}
          valeurClasse={sousLaCible ? "text-attente-ink" : undefined}
          ecart={ecartMarge}
          sous={`cible ${pourcent(CIBLE_DE_MARGE, 0)}`}
          courbe={pointsDeLaCourbe(cases.map((c) => margeApresIA(c.centimes, c.dollars)))}
          couleur={sousLaCible ? ORANGE : VERT}
        />
      </div>
    </section>
  );
}

/** Un écart en toutes lettres, pour la valeur d’un « ? » (« ↑ +31 % »). */
const texteDeLEcart = (e: Ecart | null) => (e ? `${e.fleche} ${e.texte}`.trim() : "sans période d’avant");

function ChiffreCle({
  titre,
  aide,
  valeur,
  valeurClasse,
  ecart,
  sous,
  courbe,
  couleur,
}: {
  titre: string;
  aide: AideDuBloc;
  valeur: string;
  valeurClasse?: string;
  ecart: Ecart | null;
  sous: string;
  courbe: string;
  couleur: string;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-1.5 rounded-card bg-white p-5 shadow-card md:p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="m-0 text-detail font-black">{titre}</h3>
        <BoutonAide {...aide} />
      </div>
      <p className={cn("m-0 mt-1.5 text-[36px] font-black leading-[1.05] tracking-[-0.03em] tabular-nums", valeurClasse)}>{valeur}</p>
      <p className="m-0 flex flex-wrap items-center gap-2">
        <PastilleEcart e={ecart} />
        <span className="text-legende font-bold text-grey">{sous}</span>
      </p>
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true" className="mt-2.5 block h-[42px] w-full">
        {courbe && <polyline points={courbe} fill="none" stroke={couleur} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
      </svg>
    </article>
  );
}

/* ———— Le tunnel ———— */

function Tunnel({ p, jours }: { p: Chiffres; jours: Periode }) {
  const t = p.tunnel;
  const suivi = p.suiviDepuis !== null;
  const fuite = fuiteDuTunnel(t);
  const etapes = ETAPES_DU_TUNNEL.map(([cle, nom]) => ({ cle, nom, n: t[cle] }));
  const reference = Math.max(1, ...etapes.map((e) => e.n));
  const achete = rapport(t.acheteurs, t.visiteurs);
  const texte = fuite ? texteDeLaFuite(fuite) : null;
  return (
    <Bloc
      id="tunnel"
      titre="Le tunnel"
      sous={`De l’arrivée sur le site au deuxième achat · ${PERIODES[jours].sur}`}
      aide={{ cle: "tunnel", valeur: achete === null ? "—" : pourcent(achete * 100, 2), contexte: "des visiteurs achètent" }}
    >
      <div role="region" aria-label="Le tunnel, étape par étape" tabIndex={0} className="-mx-2 overflow-x-auto px-2 pb-1">
        <ol className="m-0 grid min-w-[660px] list-none grid-cols-5 gap-3.5 p-0 pt-[22px]">
          {etapes.map((e, k) => {
            const avant = k > 0 ? (etapes[k - 1]?.n ?? 0) : 0;
            const taux = k > 0 ? rapport(e.n, avant) : null;
            const estLaFuite = fuite?.etape === k;
            const pasCompte = e.cle === "visiteurs" && !suivi;
            const part = rapport(e.n, t.visiteurs);
            return (
              <li key={e.cle} className="flex min-w-0 flex-col gap-2">
                <span
                  className={cn(
                    "self-start whitespace-nowrap rounded-full px-[9px] py-[3px] text-legende font-black tabular-nums",
                    k === 0 ? "invisible" : estLaFuite ? "bg-[#e08600]/16 text-[#8a4a00]" : "bg-sep text-soft",
                  )}
                >
                  {taux === null ? "—" : `→ ${pourcent(taux * 100)}`}
                  {/* La colonne est étroite tant que l’écran l’est : « fuite » seul, puis en toutes lettres */}
                  {estLaFuite && <span className="xl:hidden"> · fuite</span>}
                  {estLaFuite && <span className="hidden xl:inline"> · plus grosse fuite</span>}
                </span>
                <span className="text-[28px] font-black leading-none tracking-[-0.02em] tabular-nums">{pasCompte ? "—" : nombre(e.n)}</span>
                <span aria-hidden="true" className="flex h-[150px] items-end overflow-hidden rounded-[14px] bg-paper md:h-[180px]">
                  <span
                    className="block w-full rounded-t-[4px] transition-[height] duration-500"
                    style={{ height: e.n > 0 ? `${Math.max(1.2, (e.n / reference) * 100)}%` : "0%", background: estLaFuite ? ORANGE : ROSE }}
                  />
                </span>
                <span className="text-detail font-black leading-[1.2]">{e.nom}</span>
                <span className="text-legende font-extrabold text-grey">
                  {k === 0 ? (suivi ? "100\u00a0% des visiteurs" : "pas encore comptés") : part === null ? "—" : `${pourcent(part * 100, part < 0.01 ? 2 : 1)} des visiteurs`}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p
        className={cn(
          "m-0 mt-5 flex items-start gap-3 rounded-[16px] px-4 py-3.5 text-detail font-extrabold leading-[1.4]",
          texte ? "bg-[#e08600]/10 text-[#5c3300]" : "bg-paper text-soft",
        )}
      >
        <Icon name={texte ? "alert" : "clock"} size={20} stroke={2.4} style={{ marginTop: 1 }} />
        <span>{texte ? `${texte.titre}. ${texte.texte}` : "Pas encore de fuite à comparer\u00a0: il faut du monde à deux étapes qui se suivent."}</span>
      </p>
    </Bloc>
  );
}

/* ———— Le haut du paywall ———— */

function HautsDuPaywall({ p }: { p: Chiffres }) {
  const vus = p.hauts.reduce((t, h) => t + h.vus, 0);
  const lignes = p.hauts.filter((h) => h.vus || h.payes);
  const maxVus = Math.max(1, ...lignes.map((h) => h.vus));
  return (
    <Bloc
      id="haut-du-paywall"
      titre="Le haut du paywall"
      sous="Chaque conv voit un titre parmi cinq, d’après ses chiffres"
      aide={{ cle: "hauts", valeur: pluriel(vus, "paywall vu", "paywalls vus"), contexte: "sur la période" }}
    >
      {lignes.length ? (
        <div role="region" aria-label="Les titres du paywall, à faire défiler" tabIndex={0} className="-mx-2 mt-[18px] overflow-x-auto px-2">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <caption className="sr-only">Les titres du haut du paywall, leurs vus et leurs rapports débloqués</caption>
            <thead>
              <tr className="text-micro font-black uppercase tracking-[0.06em] text-grey">
                <th scope="col" className="pb-2.5 font-black">
                  Titre
                </th>
                <th scope="col" className="w-[30%] pb-2.5 font-black">
                  Vus
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  Payés
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  Taux
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((h) => {
                const taux = rapport(h.payes, h.vus);
                return (
                  <tr key={h.genre} className="border-t border-sep text-detail font-extrabold">
                    <th scope="row" className="py-3 pr-3 text-left font-extrabold">
                      {NOM_DU_GENRE[h.genre]}
                    </th>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2.5">
                        <Barre part={h.vus / maxVus} couleur="var(--elle)" />
                        <span className="min-w-[40px] text-right tabular-nums">{nombre(h.vus)}</span>
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{nombre(h.payes)}</td>
                    <td className="py-3 text-right tabular-nums">{taux === null ? "—" : pourcent(taux * 100)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 mt-[18px] text-note font-bold text-grey">Aucun paywall vu sur la période.</p>
      )}
    </Bloc>
  );
}

/* ———— D’où ils viennent ———— */

function Sources({ p }: { p: Chiffres }) {
  const meilleure = meilleureSource(p.sources)?.source;
  const maxVisiteurs = Math.max(1, ...p.sources.map((s) => s.visiteurs));
  return (
    <Bloc
      id="sources"
      titre="D’où ils viennent"
      sous="Classés par chiffre d’affaires"
      aide={{ cle: "sources", valeur: pluriel(p.sources.length, "canal", "canaux"), contexte: "classés par chiffre d’affaires" }}
      className="grow-[999] basis-[560px]"
    >
      {p.sources.length ? (
        <div role="region" aria-label="Les sources, à faire défiler" tabIndex={0} className="-mx-2 mt-[18px] overflow-x-auto px-2">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <caption className="sr-only">Les sources des visiteurs, classées par chiffre d’affaires</caption>
            <thead>
              <tr className="text-micro font-black uppercase tracking-[0.06em] text-grey">
                <th scope="col" className="pb-2.5 font-black">
                  Canal
                </th>
                <th scope="col" className="w-[40%] pb-2.5 font-black">
                  Visiteurs
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  Achètent
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  CA
                </th>
              </tr>
            </thead>
            <tbody>
              {p.sources.map((s) => {
                const taux = rapport(s.acheteurs, s.visiteurs);
                return (
                  <tr key={s.source ?? "inconnue"} className="border-t border-sep text-detail font-extrabold">
                    <th scope="row" className="py-3 pr-3 text-left font-extrabold">
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        {s.source === null ? SOURCE_INCONNUE : NOMS_DES_SOURCES[s.source]}
                        {s.source !== null && s.source === meilleure && (
                          <span className="whitespace-nowrap rounded-full bg-vrai/14 px-[7px] py-0.5 text-[11px] font-black text-vrai-ink">meilleur taux</span>
                        )}
                      </span>
                    </th>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2.5">
                        <Barre part={s.visiteurs / maxVisiteurs} couleur="var(--toi)" />
                        <span className="min-w-[52px] text-right tabular-nums">{s.source === null ? "—" : nombre(s.visiteurs)}</span>
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{taux === null ? "—" : pourcent(taux * 100)}</td>
                    <td className="py-3 text-right tabular-nums">{euros(s.centimes, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 mt-[18px] text-note font-bold text-grey">Ni visite ni vente sur la période.</p>
      )}
    </Bloc>
  );
}

/* ———— Ce qui se vend ———— */

function CeQuiSeVend({ s }: { s: StatsAdmin }) {
  const mix = s.pilotage.mix;
  const total = mix.reduce((t, m) => t + m.centimes, 0);
  const part = (c: number) => rapport(c, total);
  const resume = total
    ? `Ce qui se vend\u00a0: ${mix.map((m) => `${NOMS_DES_GROUPES[m.groupe]} ${pourcent((part(m.centimes) ?? 0) * 100, 0)}`).join(", ")}`
    : "Rien de vendu sur la période";
  const prises = s.offresUniques.reduce((t, o) => t + o.prises, 0);
  const montrees = s.offresUniques.reduce((t, o) => t + o.montrees, 0);
  return (
    <Bloc
      id="ventes"
      titre="Ce qui se vend"
      sous="Le payé par offre"
      aide={{ cle: "mix", valeur: euros(total, 0), contexte: "payé sur la période" }}
      className="grow basis-[340px]"
    >
      {/* Les segments se partagent la place (flex-grow) : les 2 px de blanc entre eux ne font rien déborder */}
      <div role="img" aria-label={resume} className={cn("mt-[22px] flex h-7 gap-0.5 overflow-hidden rounded-lg", !total && "bg-paper")}>
        {mix
          .filter((m) => m.centimes > 0)
          .map((m) => (
            <span key={m.groupe} className="h-full" style={{ flexGrow: m.centimes, flexBasis: 0, background: COULEURS_DES_GROUPES[m.groupe] }} />
          ))}
      </div>
      <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
        {mix.map((m) => (
          <li key={m.groupe} className="grid grid-cols-[12px_minmax(0,1fr)_auto_40px] items-center gap-2.5 text-detail font-extrabold">
            <span aria-hidden="true" className="size-3 rounded-[4px]" style={{ background: COULEURS_DES_GROUPES[m.groupe] }} />
            <span className="min-w-0">
              {NOMS_DES_GROUPES[m.groupe]} <span className="text-legende text-grey">· {pluriel(m.n, "achat")}</span>
            </span>
            <span className="tabular-nums">{euros(m.centimes, 0)}</span>
            <span className="text-right text-legende text-grey tabular-nums">{total ? pourcent((part(m.centimes) ?? 0) * 100, 0) : "—"}</span>
          </li>
        ))}
      </ul>
      <div className="mt-[26px] flex items-start justify-between gap-3">
        <h3 id="coups-titre" className="m-0 text-corps font-black">
          Les coups de pouce
        </h3>
        <BoutonAide cle="coups" valeur={`${nombre(prises)} sur ${nombre(montrees)}`} contexte="prises, sur les offres montrées" />
      </div>
      <ul aria-labelledby="coups-titre" className="m-0 mt-1.5 flex list-none flex-col p-0">
        {s.offresUniques.map((o) => {
          const [, nom] = NOMS_OFFRES_UNIQUES[o.offre];
          const taux = rapport(o.prises, o.montrees);
          return (
            <li key={o.offre} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-sep py-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-detail font-black">{nom}</span>
                <span className="text-legende font-bold text-grey">
                  {MOMENTS_DES_COUPS[o.offre]} · {nombre(o.prises)} sur {nombre(o.montrees)}
                </span>
              </span>
              <span className="text-right text-detail font-black tabular-nums">{taux === null ? "—" : pourcent(taux * 100, 0)}</span>
              <span className="col-span-2 flex">
                <Barre part={taux ?? 0} couleur="var(--ink)" hauteur="h-1.5" />
              </span>
            </li>
          );
        })}
      </ul>
    </Bloc>
  );
}

/* ———— Ce que coûte l’IA ———— */

function Couts({ s }: { s: StatsAdmin }) {
  const c = s.couts;
  const p = s.pilotage;
  const parAcheteur = rapport(c.total, p.acheteurs.valeur);
  const max = Math.max(0.0001, ...c.postes.map((x) => x.dollars));
  const jour = rapport(p.iaDuJour.dollars, p.iaDuJour.budget);
  const ecart = ecartRelatif(c.total, c.avant, dollars, null);
  return (
    <Bloc
      id="couts"
      titre="Ce que coûte l’IA"
      sous="En dollars, comme on la paie"
      aide={{ cle: "couts", valeur: dollars(c.total), contexte: parAcheteur === null ? "aucun acheteur sur la période" : `${dollars(parAcheteur)} par acheteur` }}
      className="grow-[999] basis-[560px]"
    >
      <p className="m-0 mt-[18px] flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <span className="text-[44px] font-black leading-none tracking-[-0.03em] tabular-nums">{dollars(c.total)}</span>
        <span className="text-detail font-bold text-grey">≈ {euros(c.total * EUROS_PAR_DOLLAR * 100, 0)}</span>
        <PastilleEcart e={ecart} />
      </p>
      {c.postes.length ? (
        <ul className="m-0 mt-[22px] flex list-none flex-col gap-3 p-0">
          {c.postes.map((x) => {
            const part = rapport(x.dollars, c.total);
            return (
              <li key={x.nom} className="grid grid-cols-[minmax(0,90px)_minmax(0,1fr)_auto_44px] items-center gap-3 text-detail font-extrabold">
                <span className="truncate">{x.nom}</span>
                <Barre part={x.dollars / max} couleur="var(--ink)" />
                <span className="text-right tabular-nums">{dollars(x.dollars)}</span>
                <span className="text-right text-legende text-grey tabular-nums">{part === null ? "—" : pourcent(part * 100, 0)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 mt-[22px] text-note font-bold text-grey">Aucun appel au modèle sur la période.</p>
      )}
      <ul className="m-0 mt-[18px] flex list-none flex-wrap gap-2 p-0">
        <Pastille valeur={parAcheteur === null ? "—" : dollars(parAcheteur)} nom="par acheteur" />
        <Pastille valeur={c.parVerdict === null ? "—" : dollars(c.parVerdict)} nom="par verdict" />
        <Pastille valeur={c.parRapport === null ? "—" : dollars(c.parRapport)} nom="par rapport" />
      </ul>
      <div className="mt-5 border-t border-sep pt-4">
        <p className="m-0 flex justify-between gap-3 text-detail font-extrabold">
          <span>Budget du jour</span>
          <span className="tabular-nums">
            {dollars(p.iaDuJour.dollars)} sur {dollars(p.iaDuJour.budget)}
          </span>
        </p>
        <div
          role="img"
          aria-label={`${dollars(p.iaDuJour.dollars)} dépensés sur ${dollars(p.iaDuJour.budget)} aujourd’hui`}
          className="mt-2.5 h-3 overflow-hidden rounded-full bg-paper"
        >
          <div className="h-full rounded-full" style={{ width: `${Math.min(1, jour ?? 0) * 100}%`, background: (jour ?? 0) >= 0.8 ? ORANGE : "var(--ink)" }} />
        </div>
      </div>
    </Bloc>
  );
}

function Pastille({ valeur, nom }: { valeur: string; nom: string }) {
  return (
    <li className="flex flex-col gap-0.5 rounded-[16px] bg-paper px-3.5 py-2.5">
      <b className="text-carte font-black tabular-nums">{valeur}</b>
      <span className="text-micro font-extrabold text-grey">{nom}</span>
    </li>
  );
}

/* ———— La santé ———— */

function Sante({ s }: { s: StatsAdmin }) {
  const x = s.pilotage.sante;
  /* Chaque ligne, et le détail qui l’accompagne quand elle s’allume : les codes des échecs, les lieux des pannes */
  const lignes: [string, number, { cle: string; n: number }[]][] = [
    ["Tâches en échec", x.echecs, s.sante.echecs.map((e) => ({ cle: e.code, n: e.n }))],
    ["Tâches bloquées en ce moment", x.bloquees, []],
    ["Paiements refusés", x.paiementsEchoues, []],
    ["Réponses en alerte danger", x.alertes, []],
    ["Pannes du serveur", x.pannes, s.sante.pannes.map((p) => ({ cle: p.lieu, n: p.n }))],
  ];
  const calme = lignes.every(([, n]) => n === 0);
  return (
    <Bloc
      id="sante"
      titre="Santé"
      sous="Ne s’allume que si ça coince"
      aide={{ cle: "sante", valeur: calme ? "Tout tourne" : "À regarder", contexte: `${lignes.filter(([, n]) => n > 0).length} sur ${lignes.length} lignes allumées` }}
      className="grow basis-[320px]"
    >
      <p className="m-0 mb-2 mt-[18px]">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full py-1.5 pl-2 pr-3 text-note font-black",
            calme ? "bg-vrai/14 text-vrai-ink" : "bg-[#e08600]/14 text-attente-ink",
          )}
        >
          <Icon name={calme ? "check" : "alert"} size={18} stroke={2.6} />
          {calme ? "Tout tourne" : "À regarder"}
        </span>
      </p>
      <ul className="m-0 flex list-none flex-col p-0">
        {lignes.map(([nom, n, detail]) => (
          <li key={nom} className="flex flex-col gap-2 border-t border-sep py-3">
            <span className={cn("flex justify-between gap-3 text-detail", n > 0 ? "font-black text-attente-ink" : "font-extrabold")}>
              <span>{nom}</span>
              <span className={cn("tabular-nums", n === 0 && "text-soft")}>{nombre(n)}</span>
            </span>
            {n > 0 && detail.length > 0 && (
              <span className="flex flex-wrap gap-1.5">
                {detail.map((d) => (
                  <span key={d.cle} className="rounded-full bg-paper px-2.5 py-0.5 font-mono text-micro font-bold text-soft">
                    {d.cle} · {nombre(d.n)}
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="m-0 mt-1 text-legende font-bold text-grey">
        En ce moment{NBSP}: {pluriel(s.sante.enCours, "tâche")} en cours, {nombre(s.sante.enAttente)} en attente. Aujourd’hui{NBSP}:{" "}
        {pluriel(x.pannesDuJour, "panne du serveur", "pannes du serveur")}.
      </p>
    </Bloc>
  );
}

/** Une carte dans la carte (les outils) : son titre (h3) et sa ligne de dessous. */
function SousBloc({ id, titre, sous, children }: { id: string; titre: string; sous: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-titre`} className="flex flex-col gap-2 rounded-[18px] border-2 border-sep p-4">
      <div>
        <h3 id={`${id}-titre`} className="m-0 text-note font-black">
          {titre}
        </h3>
        <p className="m-0 text-micro font-extrabold text-grey">{sous}</p>
      </div>
      {children}
    </section>
  );
}
