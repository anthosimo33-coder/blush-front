import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { NOM_DU_GENRE } from "@/contenu/haut-du-paywall";
import { NOMS_DES_MAILS } from "@/contenu/mails";
import { NOTE_DU_RAPPORT } from "@/contenu/mesures";
import { prixDe } from "@/contenu/offres";
import {
  CIBLE_DE_MARGE,
  EUROS_PAR_DOLLAR,
  NOMS_DES_GENRES,
  NOMS_DES_GROUPES,
  NOMS_DES_PAIRES,
  NOMS_DES_POPULATIONS,
  NOMS_DES_SOURCES,
  NOMS_DES_TYPES_D_IMPORT,
  NOMS_DES_VENTES,
  PAIRES,
  SOURCE_INCONNUE,
  margeApresIA,
} from "@/contenu/pilotage";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { jourDeParisAvant } from "@/lib/jours";
import type { Delivrabilite as ChiffresDeDelivrabilite } from "@/server/delivrabilite";
import type { SanteDesNavigateurs } from "@/server/navigateur";
import type { Periode, Pilotage as Chiffres, StatsAdmin } from "@/server/stats";
import type { OffreUnique, Population } from "@/types";
import type { Direct } from "@/types/api";
import { aRegarder, meilleureSource, type CarteARegarder } from "./a-regarder";
import { BoutonAide } from "./Aide";
import { Beta, Journal, NOMS_OFFRES_UNIQUES } from "./AdminScreen";
import {
  COULEURS_DES_GROUPES,
  ETAPES_DU_TUNNEL,
  JALONS_DE_L_IMPORT,
  JALONS_DU_PAYWALL,
  PERSONNES_D_UN_TAUX,
  caseNommee,
  dollars,
  ecartEnPoints,
  ecartEnValeur,
  ecartRelatif,
  euros,
  fuiteDuTunnel,
  graduations,
  nombre,
  nomDeLAppli,
  nomsDeLaCase,
  plusGrossePerte,
  pluriel,
  pointsDeLaCourbe,
  pourcent,
  rapport,
  tauxLisible,
  texteDeLaFuite,
  type Ecart,
} from "./calculs";
import { CarteEnDirect } from "./CarteEnDirect";
import { Delivrabilite } from "./Delivrabilite";
import { EnTete, type BaseDeLAdmin } from "./EnTete";
import { GestesDeLEquipe } from "./GestesDeLEquipe";
import { Navigateurs } from "./Navigateurs";
import { Barre, Bloc, PastilleEcart, type AideDuBloc } from "./morceaux";
import { SondeDuDirect } from "./SondeDuDirect";

/*
 * Le pilotage (/admin) : ce qui se passe sur la période, d’un coup d’œil. En haut, « À regarder » (ce qui coince, puis
 * les bonnes nouvelles) ; puis l’argent (le chiffre d’affaires net, case par case) à côté du direct ; les quatre chiffres
 * clés ; le tunnel, puis le détail de l’import et du paywall (leurs jalons), et qui importe ; les mails des séquences et leur délivrabilité ; d’où viennent les visiteurs et ce qui se vend ; l’IA avant l’achat (par type d’import) et la lecture partielle des longues vidéos (son A/B), ce que coûte l’IA et la santé ; enfin les outils de
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
  premiere_recharge: "à la première recharge, arrêté le 23 octobre",
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

/**
 * `direct` : le direct lu par la page (null : pas lu, la carte le lit) ; `base` : /admin, ou l’aperçu de l’équipe ;
 * `sonder` faux : l’aperçu, dont le direct reste figé.
 */
export function Pilotage({
  s,
  direct,
  navigateurs = null,
  delivrabilite = null,
  base = "/admin",
  sonder = true,
}: {
  s: StatsAdmin;
  direct: Direct | null;
  /** Les erreurs et la vitesse chez les visiteurs (src/server/navigateur.ts) ; null : pas lues. */
  navigateurs?: SanteDesNavigateurs | null;
  /** Ce que Resend dit des mails sur 7 jours (src/server/delivrabilite.ts) ; null : pas lue. */
  delivrabilite?: ChiffresDeDelivrabilite | null;
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
          <div className="flex flex-wrap gap-4 md:gap-6">
            <ImportEcranParEcran p={p} jours={s.jours} />
            <PaywallJusquAuPaiement p={p} jours={s.jours} />
          </div>
          <QuiImporte p={p} jours={s.jours} />
          <HautsDuPaywall p={p} />
          <NotesDuRapport p={p} jours={s.jours} />
          <VentesDuChat p={p} />
          <MailsDesSequences p={p} />
          {delivrabilite && <Delivrabilite d={delivrabilite} />}

          <div className="flex flex-wrap gap-4 md:gap-6">
            <Sources p={p} />
            <CeQuiSeVend s={s} />
          </div>

          <IAAvantLAchat p={p} />
          <LecturePartielle p={p} />
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
  /* La marge produit : les ventes des vrais clients face à l’IA du produit ; les tests à part (src/server/population.ts) */
  const marge = margeApresIA(p.netProduit.valeur, s.couts.produit.valeur);
  const margeAvant = margeApresIA(p.netProduit.avant, s.couts.produit.avant);
  const sousLaCible = marge !== null && marge < CIBLE_DE_MARGE;
  const tests = `tests\u00a0: ${dollars(s.couts.tests.valeur)} à part`;
  const ecartVisiteurs = suivi ? ecartRelatif(p.visiteurs.valeur, p.visiteurs.avant, nombre) : null;
  const ecartTaux = ecartEnPoints(taux === null ? null : taux * 100, tauxAvant === null ? null : tauxAvant * 100, "hausse", 2);
  const ecartPanier = ecartEnValeur(parAcheteur, parAcheteurAvant, (v) => euros(v));
  const ecartMarge = ecartEnPoints(marge, margeAvant);
  /* Le suivi des visites a commencé pendant la période : elle n’en a qu’une partie */
  const debut = jourDeParisAvant(s.jours, new Date(s.le));
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
          titre="Marge produit"
          aide={{ cle: "marge", valeur: marge === null ? "—" : pourcent(marge, 0), contexte: `cible ${pourcent(CIBLE_DE_MARGE, 0)}, ${tests}` }}
          valeur={marge === null ? "—" : pourcent(marge, 0)}
          valeurClasse={sousLaCible ? "text-attente-ink" : undefined}
          ecart={ecartMarge}
          sous={`cible ${pourcent(CIBLE_DE_MARGE, 0)} · ${tests}`}
          courbe={pointsDeLaCourbe(cases.map((c) => margeApresIA(c.centimesProduit, c.dollarsProduit)))}
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

/* ———— Les jalons : l’import, écran par écran, et le paywall, jusqu’au paiement ———— */

/** Une étape d’une suite de jalons : sa clé, son nom, ses personnes, et son détail, sous sa barre. */
type EtapeDeLaSuite = { cle: string; nom: string; n: number; detail?: ReactNode };

/**
 * Une suite d’étapes, en lignes : le nom, ce qui passe de l’étape d’avant, le nombre, et une barre à la mesure de la plus
 * grande ; la plus grosse perte en orange, dite dessous.
 */
function SuiteDEtapes({ etapes, nom }: { etapes: EtapeDeLaSuite[]; nom: string }) {
  const reference = Math.max(1, ...etapes.map((e) => e.n));
  const perte = plusGrossePerte(etapes.map((e) => e.n));
  const avantLaPerte = perte ? etapes[perte.etape - 1] : undefined;
  const laPerte = perte ? etapes[perte.etape] : undefined;
  return (
    <>
      <ol aria-label={nom} className="m-0 mt-[18px] flex list-none flex-col gap-3 p-0">
        {etapes.map((e, k) => {
          const taux = k > 0 ? rapport(e.n, etapes[k - 1]?.n ?? 0) : null;
          const estLaPerte = perte?.etape === k;
          return (
            <li key={e.cle} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-3 text-detail font-extrabold">
                <span className="min-w-0">{e.nom}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {k > 0 && (
                    <span
                      className={cn(
                        "whitespace-nowrap rounded-full px-[9px] py-[2px] text-legende font-black tabular-nums",
                        estLaPerte ? "bg-[#e08600]/16 text-[#8a4a00]" : "bg-sep text-soft",
                      )}
                    >
                      {taux === null ? "—" : `→ ${pourcent(taux * 100, 0)}`}
                    </span>
                  )}
                  <span className="min-w-[44px] text-right font-black tabular-nums">{nombre(e.n)}</span>
                </span>
              </span>
              {/* La barre s’étire en largeur (flex-1) : dans sa ligne, pas dans la colonne, où elle n’aurait pas de hauteur */}
              <span className="flex">
                <Barre part={e.n / reference} couleur={estLaPerte ? ORANGE : ROSE} />
              </span>
              {e.detail}
            </li>
          );
        })}
      </ol>
      {perte && avantLaPerte && laPerte && (
        <p className="m-0 mt-4 rounded-[16px] bg-[#e08600]/10 px-4 py-3 text-note font-extrabold leading-[1.4] text-[#5c3300]">
          {`La plus grosse perte\u00a0: ${pourcent((1 - perte.taux) * 100, 0)} entre «\u00a0${avantLaPerte.nom}\u00a0» et «\u00a0${laPerte.nom}\u00a0».`}
        </p>
      )}
    </>
  );
}

/** Une part, en pourcentage (« — » sans rien à diviser). */
const part = (n: number, sur: number) => {
  const t = rapport(n, sur);
  return t === null ? "—" : pourcent(t * 100, 0);
};

/** Le bloc vide d’une suite de jalons : avant le premier jalon compté, ou rien sur la période. */
function SansJalons({ depuis }: { depuis: string | null }) {
  return (
    <p className="m-0 mt-[18px] text-note font-bold text-grey">
      {depuis ? "Personne n’est passé par là sur la période." : "Les jalons se comptent depuis cette version\u00a0: les premières visites rempliront ce bloc."}
    </p>
  );
}

/**
 * Sous « Choisissent leur fichier » : le même passage, appli par appli (ceux qui la choisissent → ceux qui choisissent
 * leur fichier), son taux à partir de PERSONNES_D_UN_TAUX qui la choisissent.
 */
function DuChoixAuFichier({ applis }: { applis: Chiffres["jalonsParAppli"] }) {
  return (
    <div className="mt-1 border-l-2 border-sep pl-3">
      <ul aria-label="De l’appli au fichier, appli par appli" className="m-0 flex list-none flex-col gap-1 p-0">
        {applis.map(({ appli, jalons: j }) => {
          const taux = tauxLisible(j.fichier, j.appli);
          return (
            <li key={appli} className="flex items-baseline justify-between gap-3 text-note font-bold text-soft">
              <span className="min-w-0">{nomDeLAppli(appli)}</span>
              <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span>{`${nombre(j.appli)} → ${nombre(j.fichier)}`}</span>
                <span className="min-w-[44px] text-right font-black text-ink">{taux === null ? "—" : pourcent(taux * 100, 0)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {applis.some(({ jalons: j }) => j.appli < PERSONNES_D_UN_TAUX) && (
        <p className="m-0 mt-1 text-legende font-bold text-grey">{`«\u00a0—\u00a0»\u00a0: moins de ${PERSONNES_D_UN_TAUX}\u00a0personnes, trop peu pour un taux.`}</p>
      )}
    </div>
  );
}

function ImportEcranParEcran({ p, jours }: { p: Chiffres; jours: Periode }) {
  const j = p.jalons;
  const etapes: EtapeDeLaSuite[] = [
    { cle: "visiteurs", nom: "Visiteurs", n: p.tunnel.visiteurs },
    ...JALONS_DE_L_IMPORT.map(([cle, nom]) => ({
      cle,
      nom,
      n: j[cle],
      ...(cle === "fichier" && p.jalonsParAppli.length ? { detail: <DuChoixAuFichier applis={p.jalonsParAppli} /> } : {}),
    })),
  ];
  const rien = JALONS_DE_L_IMPORT.every(([cle]) => j[cle] === 0);
  return (
    <Bloc
      id="import"
      titre="L’import, écran par écran"
      sous={`De l’arrivée à la lecture lancée · ${PERIODES[jours].sur}`}
      aide={{ cle: "import", valeur: part(j.lecture, p.tunnel.visiteurs), contexte: "des visiteurs lancent la lecture" }}
      className="grow basis-[480px]"
    >
      {rien ? (
        <SansJalons depuis={p.jalonsDepuis} />
      ) : (
        <>
          <SuiteDEtapes etapes={etapes} nom="L’import, écran par écran" />
          <p className="m-0 mt-4 text-note font-bold text-soft">
            <span className="font-black text-ink">{pluriel(j.envoi_rate, "envoi raté", "envois ratés")}</span> ({part(j.envoi_rate, j.fichier)} de ceux qui ont choisi un fichier)
            {NBSP}: un fichier illisible, une conv trop courte ou de groupe, le réseau.
          </p>
        </>
      )}
    </Bloc>
  );
}

function PaywallJusquAuPaiement({ p, jours }: { p: Chiffres; jours: Periode }) {
  const j = p.jalons;
  const etapes: EtapeDeLaSuite[] = JALONS_DU_PAYWALL.map(([cle, nom]) => ({ cle, nom, n: j[cle] }));
  const lignes: [string, ReactNode][] = [
    ["Jusqu’où ils descendent", `les avis ${part(j.avis, j.paywall)}, les questions ${part(j.questions, j.paywall)}, tout en bas ${part(j.bas, j.paywall)}`],
    ["La formule", `Premium au bouton ${part(j.payer_premium, j.payer)} · cartes touchées\u00a0: Le rapport ${nombre(j.touche_rapport)}, Premium ${nombre(j.touche_premium)}`],
    ["Sans payer", `${pluriel(j.ferme, "refermé", "refermés")}, ${pluriel(j.refuse, "refus", "refus")} de la banque, ${pluriel(j.page_whop, "parti", "partis")} payer chez Whop`],
    ["La carte de Whop", `${pluriel(j.carte, "feuille ouverte", "feuilles ouvertes")}`],
    [
      "Qu’est-ce qui coince\u00a0?",
      `${pluriel(j.coince, "question posée", "questions posées")} · trop cher ${nombre(j.coince_cher)}, pas confiance ${nombre(j.coince_confiance)}, pas maintenant ${nombre(j.coince_plus_tard)}, ça a bugué ${nombre(j.coince_bug)}`,
    ],
  ];
  return (
    <Bloc
      id="paywall"
      titre="Le paywall, jusqu’au paiement"
      sous={`De l’arrivée au paywall au paiement · ${PERIODES[jours].sur}`}
      aide={{ cle: "paywall", valeur: part(j.paye, j.paywall), contexte: "des arrivés au paywall paient" }}
      className="grow basis-[480px]"
    >
      {j.paywall === 0 ? (
        <SansJalons depuis={p.jalonsDepuis} />
      ) : (
        <>
          <SuiteDEtapes etapes={etapes} nom="Le paywall, jusqu’au paiement" />
          <dl className="m-0 mt-4 flex flex-col gap-2 text-note">
            {lignes.map(([titre, valeur]) => (
              <div key={titre} className="flex flex-wrap gap-x-2">
                <dt className="font-black text-ink">{titre}</dt>
                <dd className="m-0 font-bold text-soft">{valeur}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Bloc>
  );
}

/* ———— Qui importe ———— */

/** Une ligne de « Qui importe » : son nom, ses convs importées et celles payées depuis ; `sansTaux` : aucune ne peut l’être. */
type LigneDesGenres = { cle: string; nom: string; importees: number; payees: number; sansTaux?: boolean };

/**
 * Les convs importées sur la période et payées depuis, par genre de celui qui importe, puis par paire : la part des
 * importées (sur `total`), et le taux d’achat de la ligne à partir de PERSONNES_D_UN_TAUX convs.
 */
function TableDesGenres({ titre, lignes, total }: { titre: string; lignes: LigneDesGenres[]; total: number }) {
  const max = Math.max(1, ...lignes.map((l) => l.importees));
  return (
    <div role="region" aria-label={`${titre}, à faire défiler`} tabIndex={0} className="-mx-2 overflow-x-auto px-2">
      <table className="w-full min-w-[440px] border-collapse text-left">
        <caption className="sr-only">{`${titre}\u00a0: les convs importées, leur part, celles payées depuis et le taux d’achat`}</caption>
        <thead>
          <tr className="text-micro font-black uppercase tracking-[0.06em] text-grey">
            <th scope="col" className="pb-2.5 font-black">
              {titre}
            </th>
            <th scope="col" className="w-[36%] pb-2.5 font-black">
              Importées
            </th>
            <th scope="col" className="pb-2.5 text-right font-black">
              Payées
            </th>
            <th scope="col" className="pb-2.5 text-right font-black">
              Taux
            </th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => {
            const taux = l.sansTaux ? null : tauxLisible(l.payees, l.importees);
            return (
              <tr key={l.cle} className="border-t border-sep text-detail font-extrabold">
                <th scope="row" className="py-3 pr-3 text-left font-extrabold">
                  {l.nom} <span className="text-legende text-grey">· {part(l.importees, total)}</span>
                </th>
                <td className="py-3 pr-3">
                  <span className="flex items-center gap-2.5">
                    <Barre part={l.importees / max} couleur="var(--elle)" />
                    <span className="min-w-[40px] text-right tabular-nums">{nombre(l.importees)}</span>
                  </span>
                </td>
                <td className="py-3 pr-3 text-right tabular-nums">{nombre(l.payees)}</td>
                <td className="py-3 text-right tabular-nums">{taux === null ? "—" : pourcent(taux * 100)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QuiImporte({ p, jours }: { p: Chiffres; jours: Periode }) {
  const { importees: i, payees: a } = p.quiImporte;
  /* Les convs où « Qui es-tu ? » est rempli : elles seules ont un genre, l’autre et sa paire */
  const dites = i.moi.elle + i.moi.il;
  const filles = rapport(i.moi.elle, dites);
  /* Sans « Qui es-tu ? », pas de paywall : « Pas encore dit » n’a pas de taux */
  const genres: LigneDesGenres[] = (["elle", "il", "inconnu"] as const).map((g) => ({
    cle: g,
    nom: NOMS_DES_GENRES[g],
    importees: i.moi[g],
    payees: a.moi[g],
    sansTaux: g === "inconnu",
  }));
  const paires: LigneDesGenres[] = PAIRES.map((x) => ({ cle: x, nom: NOMS_DES_PAIRES[x], importees: i.paires[x], payees: a.paires[x] }));
  return (
    <Bloc
      id="qui-importe"
      titre="Qui importe"
      sous={`Les convs importées, et celles payées depuis · ${PERIODES[jours].sur}`}
      aide={{
        cle: "quiImporte",
        valeur: filles === null ? "—" : `${pourcent(filles * 100, 0)} de filles`,
        contexte: `sur ${pluriel(dites, "conv")} où «\u00a0Qui es-tu\u00a0?\u00a0» est rempli`,
      }}
    >
      {i.convs === 0 ? (
        <p className="m-0 mt-[18px] text-note font-bold text-grey">Aucune conv importée sur la période.</p>
      ) : (
        <>
          <div className="mt-[18px] grid gap-6 xl:grid-cols-2">
            <TableDesGenres titre="Qui importe" lignes={genres} total={i.convs} />
            <TableDesGenres titre="Et sur qui" lignes={paires} total={dites} />
          </div>
          <p className="m-0 mt-4 text-note font-bold text-soft">
            <span className="font-black text-ink">L’autre{NBSP}:</span> {pluriel(i.autre.il, "garçon")}, {pluriel(i.autre.elle, "fille")}, dont{" "}
            {pluriel(i.autre.devines, "deviné", "devinés")} (ni sa fiche ni la conv ne le disent{NBSP}: l’opposé de celui qui importe).
          </p>
          {[...genres, ...paires].some((l) => !l.sansTaux && l.importees < PERSONNES_D_UN_TAUX) && (
            <p className="m-0 mt-1 text-legende font-bold text-grey">{`«\u00a0—\u00a0»\u00a0: moins de ${PERSONNES_D_UN_TAUX}\u00a0convs, trop peu pour un taux.`}</p>
          )}
        </>
      )}
    </Bloc>
  );
}

/* ———— La note du rapport ———— */

/** Ce qui n’allait pas, en clair, dans l’ordre de RAISONS_DE_LA_NOTE (les textes des pastilles du rapport). */
const NOM_DE_LA_RAISON = NOTE_DU_RAPPORT.raisons;

function NotesDuRapport({ p, jours }: { p: Chiffres; jours: Periode }) {
  const { oui, bof, avis, raisons } = p.note;
  const notes = oui + bof;
  const taux = tauxLisible(oui, notes);
  const maxRaisons = Math.max(1, ...raisons.map((r) => r.n));
  return (
    <Bloc
      id="note"
      titre={"Le rapport t’a parlé\u00a0?"}
      sous={`La note en bas des rapports écrits, une par conv · ${PERIODES[jours].sur}`}
      aide={{ cle: "note", valeur: taux === null ? "—" : pourcent(taux * 100, 0), contexte: "de «\u00a0Oui, grave\u00a0»" }}
    >
      {notes === 0 ? (
        <p className="m-0 mt-[18px] text-note font-bold text-grey">Aucune note sur la période.</p>
      ) : (
        <div className="mt-[18px] flex flex-col gap-4">
          <p className="m-0 text-detail font-bold text-soft">
            <span className="font-black text-ink">{pluriel(notes, "note", "notes")}</span>
            {` · Oui, grave ${nombre(oui)} · Bof ${nombre(bof)} · ${pluriel(avis, "avis laissé", "avis laissés")} (partis par mail à l’équipe)`}
          </p>
          {bof > 0 && (
            <ul aria-label="Ce qui n’allait pas" className="m-0 flex list-none flex-col gap-2 p-0">
              {raisons.map((r) => (
                <li key={r.raison} className="flex items-center gap-2.5 text-detail font-extrabold">
                  <span className="w-[200px] shrink-0">{NOM_DE_LA_RAISON[r.raison]}</span>
                  <Barre part={r.n / maxRaisons} couleur="var(--flou)" />
                  <span className="min-w-[32px] text-right tabular-nums">{nombre(r.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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

/* ———— La vente dans le chat ———— */

function VentesDuChat({ p }: { p: Chiffres }) {
  const vues = p.ventesDuChat.reduce((t, v) => t + v.vues, 0);
  const lignes = p.ventesDuChat.filter((v) => v.vues || v.touchees || v.refusees || v.payees);
  const maxVues = Math.max(1, ...lignes.map((v) => v.vues));
  return (
    <Bloc
      id="vente-du-chat"
      titre="La vente dans le chat"
      sous="Les cartes posées sous les réponses de BLUSH, et ce qu’elles rapportent"
      aide={{ cle: "ventesDuChat", valeur: pluriel(vues, "carte posée", "cartes posées"), contexte: "sur la période" }}
    >
      {lignes.length ? (
        <div role="region" aria-label="Les cartes du chat, à faire défiler" tabIndex={0} className="-mx-2 mt-[18px] overflow-x-auto px-2">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <caption className="sr-only">Les cartes d’achat du chat, posées, touchées, refusées et payées, et le payé</caption>
            <thead>
              <tr className="text-micro font-black uppercase tracking-[0.06em] text-grey">
                <th scope="col" className="pb-2.5 font-black">
                  Carte
                </th>
                <th scope="col" className="w-[26%] pb-2.5 font-black">
                  Posées
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  Touchées
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  Pas maintenant
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  Payées
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  Payé
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((v) => {
                const taux = rapport(v.payees, v.vues);
                return (
                  <tr key={v.genre} className="border-t border-sep text-detail font-extrabold">
                    <th scope="row" className="py-3 pr-3 text-left font-extrabold">
                      {NOMS_DES_VENTES[v.genre]}
                    </th>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2.5">
                        <Barre part={v.vues / maxVues} couleur="var(--elle)" />
                        <span className="min-w-[40px] text-right tabular-nums">{nombre(v.vues)}</span>
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{nombre(v.touchees)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{nombre(v.refusees)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {nombre(v.payees)}
                      {taux !== null && <span className="ml-1.5 text-micro text-grey">{pourcent(taux * 100)}</span>}
                    </td>
                    <td className="py-3 text-right tabular-nums">{euros(v.centimes, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 mt-[18px] text-note font-bold text-grey">Aucune carte posée sur la période.</p>
      )}
      <div className="mt-[18px] grid grid-cols-1 gap-3 sm:grid-cols-2">
        {p.abDuChat.map((g) => {
          const part = rapport(g.acheteurs, g.comptes);
          const parCompte = rapport(g.centimes, g.comptes);
          return (
            <div key={g.groupe} className="flex flex-col gap-1 rounded-[16px] bg-paper px-4 py-3">
              <span className="text-micro font-black uppercase tracking-[0.06em] text-grey">{g.groupe === "avec" ? "Avec les propositions" : "Sans (le témoin)"}</span>
              <span className="text-detail font-extrabold">
                {pluriel(g.comptes, "compte au chat", "comptes au chat")} · {pluriel(g.acheteurs, "acheteur")}
                {part !== null && ` (${pourcent(part * 100)})`}
              </span>
              <span className="text-note font-bold text-soft">
                {euros(g.centimes, 0)} payés{parCompte !== null && ` · ${euros(parCompte)} par compte`}
              </span>
            </div>
          );
        })}
      </div>
    </Bloc>
  );
}

/* ———— Les mails des séquences ———— */

function MailsDesSequences({ p }: { p: Chiffres }) {
  const envoyes = p.mails.reduce((t, m) => t + m.envoyes, 0);
  const lignes = p.mails.filter((m) => m.envoyes || m.clics || m.payes);
  const maxEnvoyes = Math.max(1, ...lignes.map((m) => m.envoyes));
  return (
    <Bloc
      id="mails"
      titre="Les mails des séquences"
      sous="Partis, touchés, et payés dans les 3 jours"
      aide={{ cle: "mails", valeur: pluriel(envoyes, "mail parti", "mails partis"), contexte: "sur la période" }}
    >
      {lignes.length ? (
        <div role="region" aria-label="Les mails des séquences, à faire défiler" tabIndex={0} className="-mx-2 mt-[18px] overflow-x-auto px-2">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <caption className="sr-only">Les mails des séquences, leurs envois, leurs clics et les paiements qui ont suivi</caption>
            <thead>
              <tr className="text-micro font-black uppercase tracking-[0.06em] text-grey">
                <th scope="col" className="pb-2.5 font-black">
                  Mail
                </th>
                <th scope="col" className="w-[26%] pb-2.5 font-black">
                  Envoyés
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  Clics
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  Payés
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  Taux de clic
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((m) => {
                const taux = rapport(m.clics, m.envoyes);
                return (
                  <tr key={m.cle} className="border-t border-sep text-detail font-extrabold">
                    <th scope="row" className="py-3 pr-3 text-left font-extrabold">
                      {NOMS_DES_MAILS[m.cle]}
                    </th>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2.5">
                        <Barre part={m.envoyes / maxEnvoyes} couleur="var(--elle)" />
                        <span className="min-w-[40px] text-right tabular-nums">{nombre(m.envoyes)}</span>
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{nombre(m.clics)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{nombre(m.payes)}</td>
                    <td className="py-3 text-right tabular-nums">{taux === null ? "—" : pourcent(taux * 100)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 mt-[18px] text-note font-bold text-grey">Aucun mail des séquences parti sur la période.</p>
      )}
      <ABDeLaDerniere ab={p.abDerniere} />
    </Bloc>
  );
}

/** L’A/B de S1 J+6 : avec la one time offer rouverte, ou sans (le témoin), et leurs rapports payés dans les 3 jours. */
function ABDeLaDerniere({ ab }: { ab: Chiffres["abDerniere"] }) {
  if (!ab.avec.n && !ab.sans.n) return null;
  const taux = (g: { n: number; payes: number }) => {
    const t = rapport(g.payes, g.n);
    return t === null ? "—" : pourcent(t * 100);
  };
  return (
    <p className="m-0 mt-4 text-note font-bold text-soft">
      <span className="font-black text-ink">A/B · S1 J+6 à {prixDe("suite")}.</span> Avec l’offre{NBSP}: {nombre(ab.avec.n)} comptes, {nombre(ab.avec.payes)} payés ({taux(ab.avec)}
      ). Sans{NBSP}: {nombre(ab.sans.n)} comptes, {nombre(ab.sans.payes)} payés ({taux(ab.sans)}).
    </p>
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

/* ———— L’IA avant l’achat, par type d’import ———— */

/* Une moyenne par import : à l’unité, à la décimale sous 10 (des exports dont quelques-uns ont reçu un morceau de captures : « 0,4 écran ») */
const moyenne = (v: number) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));

/* Une durée en secondes : « 45 s », « 2 min 5 s » */
const duree = (secondes: number) => (secondes >= 60 ? `${Math.floor(secondes / 60)}\u00a0min ${secondes % 60}\u00a0s` : `${secondes}\u00a0s`);

/**
 * Ce que coûtent les convs avant que la personne paie, par type d’import (src/server/imports.ts) : combien sont arrivées,
 * ce que leurs lectures ont coûté par import, le temps médian jusqu’au paywall, la part qui y arrive et celle qui paie (à
 * partir de PERSONNES_D_UN_TAUX convs), et ce que coûte un acheteur, lu pour rien compris.
 */
function IAAvantLAchat({ p }: { p: Chiffres }) {
  const types = p.importsParType;
  const total = types.reduce((t, x) => t + x.dollars + x.pourRien, 0);
  const pourRien = types.filter((x) => x.pourRien > 0);
  const lignes = types.filter((x) => x.imports || x.pourRien);
  return (
    <Bloc
      id="ia-avant-achat"
      titre="L’IA avant l’achat"
      sous="Par type d’import, ce que coûte une conv avant le paiement"
      aide={{ cle: "avantLAchat", valeur: dollars(total), contexte: "lus avant l’achat sur la période" }}
    >
      {lignes.length ? (
        <div role="region" aria-label="L’IA avant l’achat, par type d’import, à faire défiler" tabIndex={0} className="-mx-2 mt-[18px] overflow-x-auto px-2">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <caption className="sr-only">
              Par type d’import, les convs importées, l’IA par import, le temps médian jusqu’au paywall, la part au paywall et la part qui paie, l’IA par acheteur
            </caption>
            <thead>
              <tr className="text-micro font-black uppercase tracking-[0.06em] text-grey">
                <th scope="col" className="pb-2.5 pr-3 font-black">
                  Type
                </th>
                <th scope="col" className="pb-2.5 pr-3 text-right font-black">
                  Imports
                </th>
                <th scope="col" className="pb-2.5 pr-3 text-right font-black">
                  IA par import
                </th>
                <th scope="col" className="pb-2.5 pr-3 text-right font-black">
                  Jusqu’au paywall
                </th>
                <th scope="col" className="pb-2.5 pr-3 text-right font-black">
                  Paywall
                </th>
                <th scope="col" className="pb-2.5 pr-3 text-right font-black">
                  Paient
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  IA par acheteur
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((x) => {
                const parImport = rapport(x.dollars, x.imports);
                const parAcheteur = rapport(x.dollars + x.pourRien, x.payes);
                const auPaywall = tauxLisible(x.paywall, x.imports);
                const paient = tauxLisible(x.payes, x.imports);
                const ecrans = rapport(x.ecrans, x.imports);
                const lots = rapport(x.lots, x.imports);
                return (
                  <tr key={x.type} className="border-t border-sep text-detail font-extrabold">
                    <th scope="row" className="py-3 pr-3 text-left font-extrabold">
                      <span className="block">{NOMS_DES_TYPES_D_IMPORT[x.type]}</span>
                      {ecrans !== null && lots !== null && x.lots > 0 && (
                        <span className="block text-micro font-bold text-grey">{`${pluriel(moyenne(ecrans), "écran")}, ${pluriel(moyenne(lots), "lot")} par import`}</span>
                      )}
                    </th>
                    <td className="py-3 pr-3 text-right tabular-nums">{nombre(x.imports)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{parImport === null ? "—" : dollars(parImport)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{x.secondesAuPaywall === null ? "—" : duree(x.secondesAuPaywall)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{auPaywall === null ? "—" : pourcent(auPaywall * 100, 0)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {nombre(x.payes)}
                      <span className="ml-1.5 text-micro text-grey">{paient === null ? "—" : pourcent(paient * 100)}</span>
                    </td>
                    <td className="py-3 text-right tabular-nums">{parAcheteur === null ? "—" : dollars(parAcheteur)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 mt-[18px] text-note font-bold text-grey">Aucun import mesuré sur la période.</p>
      )}
      <p className="m-0 mt-3 text-legende font-bold text-grey">
        {pourRien.length
          ? `Lu pour rien (aucune conv importée ensuite)\u00a0: ${pourRien.map((x) => `${NOMS_DES_TYPES_D_IMPORT[x.type].toLowerCase()} ${dollars(x.pourRien)}`).join(", ")}, compté dans l’IA par acheteur.`
          : "Rien de lu pour rien sur la période."}{" "}
        {`«\u00a0—\u00a0»\u00a0: moins de ${PERSONNES_D_UN_TAUX}\u00a0convs, trop peu pour un taux.`}
      </p>
    </Bloc>
  );
}

/* ———— La lecture partielle des longues vidéos ———— */

/**
 * Les deux moitiés de l’A/B de la lecture partielle (src/server/lecture-partielle.ts), côte à côte : la moitié qui lit
 * tout avant l’achat, celle qui n’en lit que la partie récente (le reste lu après le paiement). Comptées dès leur plan
 * (importées ou non) : ce qu’elles coûtent avant l’achat, ce qu’elles vendent (avec les effectifs, un taux n’étant
 * lisible qu’à partir de PERSONNES_D_UN_TAUX vidéos), en combien de temps elles arrivent au paywall, et le titre qu’elles y
 * montrent. Puis le contrefactuel des vidéos lues en entier : ce que la lecture partielle leur aurait changé.
 */
function LecturePartielle({ p }: { p: Chiffres }) {
  const { bras, contrefactuel: c } = p.lecturePartielle;
  const videos = bras.reduce((t, b) => t + b.videos, 0);
  const avant = bras.reduce((t, b) => t + b.dollarsAvant, 0);
  /* Chaque ligne : son nom, et sa valeur dans chaque moitié (dans l’ordre de BRAS_DE_LA_LECTURE : entière, partielle) */
  const taux = (vers: number, depuis: number) => {
    const t = tauxLisible(vers, depuis);
    return t === null ? "—" : pourcent(t * 100, 0);
  };
  const lignes: [string, (b: (typeof bras)[number]) => string][] = [
    ["Longues vidéos (au plan)", (b) => nombre(b.videos)],
    ["Importées", (b) => `${nombre(b.importees)} · ${taux(b.importees, b.videos)}`],
    ["Au paywall", (b) => `${nombre(b.paywall)} · ${taux(b.paywall, b.videos)}`],
    ["Paient", (b) => `${nombre(b.payes)} · ${taux(b.payes, b.videos)}`],
    /* L’achat venu des relances (la suite gardée 11 jours après le paywall pour lui) */
    ["Paient plus de 24\u00a0h après", (b) => nombre(b.payesTard)],
    ["IA avant l’achat, par vidéo", (b) => (rapport(b.dollarsAvant, b.videos) === null ? "—" : dollars(b.dollarsAvant / b.videos))],
    ["Suite lue après, par acheteur", (b) => (rapport(b.dollarsSuite, b.payes) === null ? "—" : dollars(b.dollarsSuite / b.payes))],
    ["IA de lecture par acheteur", (b) => (rapport(b.dollarsAvant + b.dollarsSuite, b.payes) === null ? "—" : dollars((b.dollarsAvant + b.dollarsSuite) / b.payes))],
    ["Jusqu’au paywall (médiane)", (b) => (b.secondesAuPaywall === null ? "—" : duree(b.secondesAuPaywall))],
    ["Lus avant l’achat, par import", (b) => (b.importees ? `${pluriel(moyenne(b.ecrans / b.importees), "écran")}, ${pluriel(moyenne(b.lots / b.importees), "lot")}` : "—")],
    ["Coupées avant l’achat", (b) => (b.bras === "partielle" ? taux(b.coupees, b.importees) : "—")],
    ["Lots gardés, par import", (b) => (b.importees ? nombre(moyenne(b.lotsGardes / b.importees)) : "—")],
    ["Titre «\u00a0Tendance\u00a0»", (b) => taux(b.tendance, b.titres)],
    ["Suites lues, incomplètes, perdues", (b) => (b.bras === "partielle" ? `${nombre(b.suites.lues)}, ${nombre(b.suites.incompletes)}, ${nombre(b.suites.perdues)}` : "—")],
    /* La conv entière, une fois sa suite lue : un autre titre que celui que le paywall a montré (la moitié entière : le contrefactuel, plus bas) */
    ["Titre changé par la suite", (b) => (b.bras === "partielle" && b.titresEntiers.entiers ? `${nombre(b.titresEntiers.changes)} sur ${nombre(b.titresEntiers.entiers)}` : "—")],
  ];
  return (
    <Bloc
      id="lecture-partielle"
      titre={"Longues vidéos\u00a0: lecture partielle"}
      sous={"L’A/B\u00a0: tout lire avant l’achat, ou seulement la partie récente"}
      aide={{ cle: "lecturePartielle", valeur: dollars(avant), contexte: `lus avant l’achat pour ${pluriel(videos, "longue vidéo", "longues vidéos")}` }}
    >
      {videos ? (
        <div role="region" aria-label="Les deux moitiés de la lecture partielle, à faire défiler" tabIndex={0} className="-mx-2 mt-[18px] overflow-x-auto px-2">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <caption className="sr-only">
              Pour chaque moitié de l’A/B, les longues vidéos, leur part au paywall et qui paie, ce que coûte leur lecture, et le titre de leur paywall
            </caption>
            <thead>
              <tr className="text-micro font-black uppercase tracking-[0.06em] text-grey">
                <th scope="col" className="pb-2.5 pr-3 font-black">
                  Moitié
                </th>
                <th scope="col" className="pb-2.5 pr-3 text-right font-black">
                  Entière
                </th>
                <th scope="col" className="pb-2.5 text-right font-black">
                  Partielle
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(([nom, valeur]) => (
                <tr key={nom} className="border-t border-sep text-detail font-extrabold">
                  <th scope="row" className="py-2.5 pr-3 text-left font-extrabold">
                    {nom}
                  </th>
                  {bras.map((b, k) => (
                    <td key={b.bras} className={cn("py-2.5 text-right tabular-nums", k < bras.length - 1 && "pr-3")}>
                      {valeur(b)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 mt-[18px] text-note font-bold text-grey">
          Aucune longue vidéo en A/B sur la période (BLUSH_LECTURE_PARTIELLE à «{NBSP}ab{NBSP}»).
        </p>
      )}
      <p className="m-0 mt-3 text-legende font-bold text-grey">
        {c.videos
          ? `Lues en entier, sur ${pluriel(c.videos, "vidéo")}\u00a0: la partie récente aurait montré le même titre ${pluriel(c.pareil, "fois", "fois")}, perdu la tendance ${pluriel(c.tendancePerdue, "fois", "fois")}, décalé sa date de plus de 7\u00a0jours ${pluriel(c.dateDecalee, "fois", "fois")}, changé de titre ${pluriel(c.autreTitre, "fois", "fois")}, et laissé ${c.lots ? pourcent((100 * c.lotsEpargnables) / c.lots, 0) : "0\u00a0%"} des lots pour après le paiement.`
          : "Aucun contrefactuel sur la période (BLUSH_LECTURE_PARTIELLE à «\u00a0mesure\u00a0» ou «\u00a0ab\u00a0»)."}{" "}
        {`«\u00a0—\u00a0»\u00a0: moins de ${PERSONNES_D_UN_TAUX}\u00a0vidéos, trop peu pour un taux.`}
      </p>
    </Bloc>
  );
}

/* ———— Ce que coûte l’IA ———— */

/** La couleur de la barre d’une population : le produit en encre, les tests en orange, le reste en gris. */
const COULEURS_DES_POPULATIONS: Record<Population, string> = {
  client: "var(--ink)",
  prospect: "var(--ink)",
  offert: "var(--grey)",
  equipe: ORANGE,
  tournage: ORANGE,
  inconnu: "var(--grey)",
};

/**
 * L’IA de la période en deux (la règle « qui est qui », src/server/population.ts) : celle du produit (les clients et les
 * prospects), en grand, et celle des tests (l’équipe et le tournage) à côté ; puis chaque population, les postes du
 * produit, ses ratios (la même population en haut et en bas), et le budget du jour, qui compte tout.
 */
function Couts({ s }: { s: StatsAdmin }) {
  const c = s.couts;
  const p = s.pilotage;
  const parAcheteur = rapport(c.produit.valeur, p.acheteursProduit.valeur);
  const postes = c.postes.filter((x) => x.produit.appels > 0).sort((a, b) => b.produit.dollars - a.produit.dollars);
  const max = Math.max(0.0001, ...postes.map((x) => x.produit.dollars));
  const maxDesPopulations = Math.max(0.0001, ...c.populations.map((x) => x.dollars));
  const jour = rapport(p.iaDuJour.dollars, p.iaDuJour.budget);
  const sansCompte = rapport(p.iaDuJour.sansCompte.dollars, p.iaDuJour.sansCompte.budget);
  const ecart = ecartRelatif(c.produit.valeur, c.produit.avant, dollars, null);
  const ecartDesTests = ecartRelatif(c.tests.valeur, c.tests.avant, dollars, null);
  return (
    <Bloc
      id="couts"
      titre="Ce que coûte l’IA"
      sous="En dollars, comme on la paie, le produit et les tests à part"
      aide={{
        cle: "couts",
        valeur: `${dollars(c.produit.valeur)} pour le produit`,
        contexte: `${dollars(c.tests.valeur)} de tests, ${dollars(c.total)} en tout${parAcheteur === null ? "" : `, ${dollars(parAcheteur)} par acheteur`}`,
      }}
      className="grow-[999] basis-[560px]"
    >
      <div className="mt-[18px] grid gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="m-0 text-detail font-extrabold">IA du produit</p>
          <p className="m-0 mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="text-[44px] font-black leading-none tracking-[-0.03em] tabular-nums">{dollars(c.produit.valeur)}</span>
            <span className="text-detail font-bold text-grey">≈ {euros(c.produit.valeur * EUROS_PAR_DOLLAR * 100, 0)}</span>
            <PastilleEcart e={ecart} />
          </p>
          <p className="m-0 mt-1.5 text-legende font-bold text-grey">Les clients et les prospects</p>
        </div>
        <div className="min-w-0">
          <p className="m-0 text-detail font-extrabold">IA des tests</p>
          <p className="m-0 mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="text-[30px] font-black leading-none tracking-[-0.03em] tabular-nums">{dollars(c.tests.valeur)}</span>
            <PastilleEcart e={ecartDesTests} />
          </p>
          <p className="m-0 mt-1.5 text-legende font-bold text-grey">L’équipe et le tournage</p>
        </div>
      </div>
      <ul aria-label="L’IA par population" className="m-0 mt-[22px] flex list-none flex-col gap-3 p-0">
        {c.populations.map((x) => {
          const part = rapport(x.dollars, c.total);
          return (
            <li key={x.population} className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_auto_44px] items-center gap-3 text-detail font-extrabold">
              <span className="truncate">{NOMS_DES_POPULATIONS[x.population]}</span>
              <Barre part={x.dollars / maxDesPopulations} couleur={COULEURS_DES_POPULATIONS[x.population]} />
              <span className="text-right tabular-nums">{dollars(x.dollars)}</span>
              <span className="text-right text-legende text-grey tabular-nums">{part === null ? "—" : pourcent(part * 100, 0)}</span>
            </li>
          );
        })}
      </ul>
      <p className="m-0 mt-2 text-legende font-bold text-grey">
        En tout, {dollars(c.total)} (≈ {euros(c.total * EUROS_PAR_DOLLAR * 100, 0)}). Les invités ne sont ni un test, ni une vente. Non classé{NBSP}: une conv effacée avant la
        note, ou une ligne d’avant la règle que rien ne rattache.
      </p>
      <h3 className="m-0 mt-[22px] text-detail font-black">Les postes du produit</h3>
      {postes.length ? (
        <ul aria-label="Les postes du produit" className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
          {postes.map((x) => {
            const part = rapport(x.produit.dollars, c.produit.valeur);
            return (
              <li key={x.nom} className="grid grid-cols-[minmax(0,90px)_minmax(0,1fr)_auto_44px] items-center gap-3 text-detail font-extrabold">
                <span className="truncate">{x.nom}</span>
                <Barre part={x.produit.dollars / max} couleur="var(--ink)" />
                <span className="text-right tabular-nums">{dollars(x.produit.dollars)}</span>
                <span className="text-right text-legende text-grey tabular-nums">{part === null ? "—" : pourcent(part * 100, 0)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 mt-3 text-note font-bold text-grey">
          {c.postes.length ? "Aucun appel du produit sur la période\u00a0: seulement des tests." : "Aucun appel au modèle sur la période."}
        </p>
      )}
      <ul aria-label="Les ratios du produit" className="m-0 mt-[18px] flex list-none flex-wrap gap-2 p-0">
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
        <p className="m-0 mt-2 text-legende font-bold text-grey">Tout ce qui part, tests compris{NBSP}: c’est lui qui protège la facture.</p>
        {/* La part sans compte (src/server/budget.ts) : atteinte, tous les visiteurs d’avant l’email voient « souffle » jusqu’à minuit */}
        <p className="m-0 mt-3.5 flex justify-between gap-3 text-detail font-extrabold">
          <span>Sans compte</span>
          <span className="tabular-nums">
            {dollars(p.iaDuJour.sansCompte.dollars)} sur {dollars(p.iaDuJour.sansCompte.budget)}
          </span>
        </p>
        <div
          role="img"
          aria-label={`${dollars(p.iaDuJour.sansCompte.dollars)} de la part sans compte sur ${dollars(p.iaDuJour.sansCompte.budget)} aujourd’hui`}
          className="mt-2.5 h-3 overflow-hidden rounded-full bg-paper"
        >
          <div className="h-full rounded-full" style={{ width: `${Math.min(1, sansCompte ?? 0) * 100}%`, background: (sansCompte ?? 0) >= 0.8 ? ORANGE : "var(--ink)" }} />
        </div>
        <p className="m-0 mt-2 text-legende font-bold text-grey">
          Les captures et les vidéos d’avant l’email, celles en cours comprises. Atteinte, elles s’arrêtent jusqu’à minuit.
        </p>
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
    ["Réponses en alerte", x.alertes, []],
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
