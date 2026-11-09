import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { CHANGEMENTS, type Changement } from "@/contenu/changements";
import { LANCEMENT_LE, VIDEO_RETIREE_LE } from "@/contenu/pilotage";
import { jourEnLettres, NBSP } from "@/lib/format";
import type { Delivrabilite as ChiffresDeDelivrabilite } from "@/server/delivrabilite";
import type { SanteDesNavigateurs } from "@/server/navigateur";
import type { StatsAdmin } from "@/server/stats";
import type { Direct } from "@/types/api";
import { soucisDeSante, type Vue } from "./a-decider";
import { adresseDe } from "./adresses";
import { periodeGardee } from "./dates";
import { Beta, Journal } from "./AdminScreen";
import { Delivrabilite } from "./Delivrabilite";
import type { BaseDeLAdmin } from "./EnTete";
import { GestesDeLEquipe } from "./GestesDeLEquipe";
import { Bloc } from "./morceaux";
import { Navigateurs } from "./Navigateurs";
import { nomsDeLaPeriode } from "./periodes";
import {
  CeQuiSeVend,
  Couts,
  HautsDuPaywall,
  IAAvantLAchat,
  ImportEcranParEcran,
  LecturePartielle,
  MailsDesSequences,
  NotesDuRapport,
  PagesDArrivee,
  PaywallJusquAuPaiement,
  QuiImporte,
  Sante,
  Sources,
  SousBloc,
  Tunnel,
  VentesDuChat,
} from "./Pilotage";
import { Rangement } from "./Rangement";
import { Resume, type VersLaVue } from "./Resume";
import { SondeDuDirect } from "./SondeDuDirect";

/*
 * Le pilotage rangé (/admin, /admin?vue=…) : les mêmes chiffres et les mêmes cartes que le pilotage d’avant
 * (Pilotage.tsx), rangés en rubriques au lieu d’une seule page de vingt et une cartes. Le résumé (Resume.tsx) tient ce
 * qu’il faut pour décider ; chaque autre rubrique répond à une question. Choisi le 9 novembre ; le pilotage d’avant reste
 * à /admin?version=pilotage.
 */

/** Les rubriques qu’une adresse peut demander. */
const VUES: readonly Vue[] = ["resume", "acquisition", "tunnel", "ventes", "couts", "sante", "outils"];

/** La rubrique d’une adresse (`?vue=`), le résumé sinon. */
export const vueDe = (v: unknown): Vue => VUES.find((x) => x === v) ?? "resume";

/** Deux cartes côte à côte sur un grand écran, l’une sous l’autre sinon (comme dans le pilotage). */
const COTE_A_COTE = "flex flex-wrap gap-4 md:gap-5";

export function PilotagePropre({
  s,
  vue,
  direct,
  navigateurs = null,
  delivrabilite = null,
  changements = CHANGEMENTS,
  base = "/admin",
  sonder = true,
  premierJour = LANCEMENT_LE,
}: {
  s: StatsAdmin;
  vue: Vue;
  direct: Direct | null;
  navigateurs?: SanteDesNavigateurs | null;
  delivrabilite?: ChiffresDeDelivrabilite | null;
  /** Les changements du produit, datés (ceux d’un aperçu, sinon les vrais) : ceux de la période se posent sur le graphique du résumé. */
  changements?: readonly Changement[];
  base?: BaseDeLAdmin;
  sonder?: boolean;
  /** Le premier jour qu’une période choisie au calendrier peut couvrir : le lancement, ou celui de l’exemple. */
  premierJour?: string;
}) {
  const p = s.pilotage;
  const periode = nomsDeLaPeriode(s);
  const vers: VersLaVue = (v, ancre) => adresseDe(base, v, periodeGardee(s), ancre);
  return (
    <SondeDuDirect initial={direct} sonder={sonder}>
      <Rangement base={base} vue={vue} jours={s.jours} plage={s.plage} premierJour={premierJour} le={s.le} soucis={soucisDeSante(s).length}>
        {vue === "resume" && <Resume s={s} vers={vers} changements={changements} />}

        {vue === "acquisition" && (
          <>
            <div className={COTE_A_COTE}>
              <Sources p={p} />
            </div>
            <PagesDArrivee p={p} />
            <QuiImporte p={p} periode={periode} />
          </>
        )}

        {vue === "tunnel" && (
          <>
            <Tunnel p={p} periode={periode} />
            <div className={COTE_A_COTE}>
              <ImportEcranParEcran p={p} periode={periode} />
              <PaywallJusquAuPaiement p={p} periode={periode} />
            </div>
            <HautsDuPaywall p={p} />
          </>
        )}

        {vue === "ventes" && (
          <>
            <div className={COTE_A_COTE}>
              <CeQuiSeVend s={s} />
              <div className="flex min-w-0 grow-[999] basis-[560px] flex-col gap-4 md:gap-5">
                <VentesDuChat p={p} />
                <NotesDuRapport p={p} periode={periode} />
              </div>
            </div>
            <MailsDesSequences p={p} />
          </>
        )}

        {vue === "couts" && (
          <>
            <div className={COTE_A_COTE}>
              <Couts s={s} />
            </div>
            <IAAvantLAchat p={p} />
            <Archive titre={"Longues vidéos\u00a0: lecture partielle"} pourquoi={`La vidéo de l’écran est retirée de l’import depuis le ${jourEnLettres(VIDEO_RETIREE_LE)}`}>
              <LecturePartielle p={p} />
            </Archive>
          </>
        )}

        {vue === "sante" && (
          <>
            <div className={COTE_A_COTE}>
              <Sante s={s} />
            </div>
            {navigateurs && <Navigateurs n={navigateurs} />}
            {delivrabilite && (
              <HorsPeriode texte={"Ne suit pas la période choisie\u00a0: toujours les 7 derniers jours"}>
                <Delivrabilite d={delivrabilite} />
              </HorsPeriode>
            )}
          </>
        )}

        {vue === "outils" && (
          <Bloc id="outils" titre="Les gestes" sous="Chaque geste est noté au journal de l’équipe">
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
        )}

        <p className="m-0 pt-2 text-center text-note font-extrabold text-grey">Que des nombres{NBSP}: aucune conv, aucun message, aucun email ne sort d’ici.</p>
      </Rangement>
    </SondeDuDirect>
  );
}

/** Une carte qui ne suit pas la période choisie : son étiquette le dit au-dessus d’elle, pour qu’aucun chiffre ne se lise sur de mauvaises dates. */
function HorsPeriode({ texte, children }: { texte: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 inline-flex items-center gap-1.5 self-start rounded-full bg-toi/12 px-3 py-1 text-legende font-black text-toi-ink">
        <Icon name="clock" size={15} stroke={2.4} />
        {texte}
      </p>
      {children}
    </div>
  );
}

/** Une carte d’une mesure finie, repliée : elle ne prend plus de place, et s’ouvre si on la cherche. */
function Archive({ titre, pourquoi, children }: { titre: string; pourquoi: string; children: ReactNode }) {
  return (
    <details className="group rounded-card bg-white/60 shadow-[0_0_0_1px_rgba(17,17,20,0.06)] open:bg-transparent open:shadow-none">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 group-open:px-1 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-detail font-black text-soft">
            <span className="mr-2 rounded-full bg-sep px-2 py-0.5 text-micro font-black uppercase tracking-[0.06em] text-grey">Archivé</span>
            {titre}
          </span>
          <span className="mt-0.5 block text-legende font-bold text-grey">{pourquoi}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-note font-black text-soft group-open:hidden">
          Ouvrir
        </span>
        <span aria-hidden="true" className="hidden shrink-0 text-note font-black text-soft group-open:inline">
          Replier
        </span>
      </summary>
      {children}
    </details>
  );
}
