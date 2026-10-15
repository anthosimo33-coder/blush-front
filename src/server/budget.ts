import "server-only";
import { eq, gte, sql } from "drizzle-orm";
import { SOUFFLE } from "@/lib/messages-erreur";
import { alerter } from "./alertes";
import { COMPTE_DU_TOURNAGE } from "./compte-du-tournage";
import { db, schema } from "./db";
import { cleDuCompte } from "./email-canonique";
import { ErreurTache } from "./erreurs";
import { auMieux, journal } from "./journal";
import { compteDe, compter, sousLaLimite } from "./limites";
import { aujourdhuiParis, DEBUT_DU_JOUR } from "./temps";

/*
 * Le budget de l’IA (S-14) : ce que coûtent les appels au modèle, par jour de Paris (remis à zéro à minuit, heure de
 * Paris). Avant chaque appel (`controlerBudget`, dans appeler) : au-delà du budget du jour, pour tous ou pour ce compte,
 * l’appel ne part pas, et l’étape échoue sur « budget ». Le navigateur l’apprend comme « souffle » : « BLUSH souffle un
 * peu, réessaie demain ». Une lecture ou un rapport arrêté ainsi n’use pas ses essais et repart après minuit
 * (src/server/pipeline.ts). L’équipe est prévenue à 50 % et 80 % du budget du jour, puis quand il est atteint, une fois
 * par seuil et par jour.
 *
 * Qui paie un appel : le compte de sa conv, ou le compte connecté qui envoie des captures avant l’import (`compte`,
 * src/server/captures.ts). Sans l’un ni l’autre, l’appel est « sans compte » : il a sa part à lui, prise dans le budget
 * du jour. Ce qui est dépensé pour tous se lit dans ai_usage (une conv effacée y laisse ses lignes, sans conv : elles
 * comptent encore pour le jour). Ce qu’a dépensé un compte, ou la part sans compte, se compte à part au moment de
 * l’appel (noterDepense, dans rate_limits) : effacer une conv ne rend pas au compte ce qu’elle a coûté, et ne le fait
 * pas passer dans la part sans compte. Un compte se range sur son email canonique (cleDuCompte), comme ses limites : un
 * alias, ou le même compte effacé puis recréé, ne repart pas de zéro.
 */

/** Les budgets du jour, en dollars, et les seuils où l’équipe est prévenue (une part du budget du jour). */
export const BUDGET_IA = {
  /** Tous les appels du jour (décidé : 500 $ pour l’ouverture, le 13 octobre). */
  jour: 500,
  /** Les appels pour un compte (décidé : 10 $ pour l’ouverture, le 13 octobre ; ce sont les bulles qui comptent ce qu’on paie). */
  compte: 10,
  /** Les appels sans compte (les captures lues avant l’email), pris dans le budget du jour ; relevé pour l’ouverture. */
  anonyme: 50,
  /**
   * Les lectures des convs de tournage préparées par l’API (COMPTE_DU_TOURNAGE) : une lecture entière par lien et par
   * créatrice, environ 1 $ chacune, une trentaine par jour au plus (la limite tournageApiParJour les borne avant lui).
   */
  tournage: 40,
  /** L’équipe est prévenue à 50 % et 80 % (décidé), puis quand le budget du jour est atteint. */
  seuils: [0.5, 0.8, 1],
} as const;

/** Qui paie un appel : un compte (sa clé, cleDuCompte), ou null (sans compte). */
export type Payeur = string | null;

/** Le payeur des appels faits pour ce compte. */
export const payeurDuCompte = (compte: { email: string }): string => cleDuCompte(compte.email);

/** Ce qui est déjà dépensé aujourd’hui, en millionièmes de dollar (comme ai_usage.cost_micros) : pour tous, et pour ce payeur. */
export type Depenses = { jour: number; payeur: number };

const micros = (dollars: number) => Math.round(dollars * 1e6);

/** Le budget du jour de ce payeur, en millionièmes de dollar : le compte des convs de tournage a le sien. */
export const plafondDe = (payeur: Payeur): number => micros(payeur === cleDuCompte(COMPTE_DU_TOURNAGE) ? BUDGET_IA.tournage : payeur ? BUDGET_IA.compte : BUDGET_IA.anonyme);

/** Quel budget est épuisé (celui de tous d’abord), ou null : l’appel peut partir. */
export function budgetEpuise({ jour, payeur: duPayeur }: Depenses, payeur: Payeur): "jour" | "compte" | "anonyme" | null {
  if (jour >= micros(BUDGET_IA.jour)) return "jour";
  if (duPayeur >= plafondDe(payeur)) return payeur ? "compte" : "anonyme";
  return null;
}

/** Les seuils d’alerte que la dépense du jour a passés. */
export const seuilsAtteints = (jour: number): number[] => BUDGET_IA.seuils.filter((s) => jour >= micros(BUDGET_IA.jour * s));

/*
 * La dépense du jour d’un payeur, rangée dans rate_limits (src/server/limites.ts, sous son empreinte : ni email ni
 * identifiant en clair) : une clé par jour de Paris, gardée deux jours (la purge de la nuit les retire ensuite). Le
 * compte d’une ligne est un entier : en millionièmes de dollar, il tient jusqu’à 2 000 $ par jour, bien au-delà des
 * budgets.
 */
const SANS_COMPTE = "sans-compte";
const FENETRE_DEPENSE = { fenetreS: 2 * 86400 };
/** La clé de la dépense de ce payeur, ce jour-là (AAAA-MM-JJ, à Paris). */
export const cleDeDepense = (payeur: Payeur, jour: string) => `ia:${jour}:${payeur ?? SANS_COMPTE}`;

/* ———— Les dépenses, lues en base et gardées un instant ———— */

/*
 * Chaque appel relit le budget : on garde ce qu’on a lu 30 secondes par instance, et on y ajoute ce que les appels de
 * l’instance coûtent entre-temps (noterDepense). Les autres instances le voient à leur prochaine lecture : le budget
 * peut être dépassé de ce que coûtent les appels lancés pendant ces 30 secondes, jamais plus.
 */
const GARDE_MS = 30_000;
type Lu = { micros: number; jusqua: number };
/** Ce qui est gardé aujourd’hui (jourGarde) : tous les appels (`*`), puis payeur par payeur. Vidé au changement de jour. */
const LUES = new Map<string, Lu>();
let jourGarde = "";
const TOUS = "*";
/** Le payeur de chaque conv déjà vue (une conv sans compte n’est pas gardée : elle peut en trouver un). */
const PAYEURS = new Map<string, string>();
/** Les seuils dont cette instance a déjà prévenu l’équipe aujourd’hui (« 0.5 ») : elle ne relit plus la base pour eux. */
const PREVENUS = new Set<number>();
/** Au-delà, on oublie ce qui est gardé (les payeurs des convs vues, les dépenses lues) : tout se relit. */
const GARDES_MAX = 5000;

/** Ce qui est gardé l’est pour aujourd’hui : un nouveau jour vide tout (la dépense repart de zéro, les seuils aussi). */
function gardeDuJour(): string {
  const jour = aujourdhuiParis().iso;
  if (jour !== jourGarde) {
    LUES.clear();
    PREVENUS.clear();
    jourGarde = jour;
  }
  if (LUES.size >= GARDES_MAX) LUES.clear();
  return jour;
}

/**
 * Le compte qui paie les appels de cette conv (sa clé, cleDuCompte) ; null sans conv, ou sans compte. Gardé par
 * instance : la voix (src/server/ia/voix.ts) y range aussi ses caractères du jour.
 */
export async function payeurDe(storyId: string | undefined): Promise<Payeur> {
  if (!storyId) return null;
  const connu = PAYEURS.get(storyId);
  if (connu) return connu;
  const [s] = await db()
    .select({ email: schema.users.email })
    .from(schema.stories)
    .innerJoin(schema.users, eq(schema.users.id, schema.stories.userId))
    .where(eq(schema.stories.id, storyId));
  if (!s) return null;
  if (PAYEURS.size >= GARDES_MAX) PAYEURS.clear();
  const payeur = payeurDuCompte(s);
  PAYEURS.set(storyId, payeur);
  return payeur;
}

/** Les dépenses du jour pour tous : les lignes d’ai_usage d’aujourd’hui, avec celles des convs effacées depuis. */
async function lireTous(): Promise<number> {
  const [l] = await db()
    .select({ micros: sql<number>`coalesce(sum(${schema.aiUsage.costMicros}), 0)`.mapWith(Number) })
    .from(schema.aiUsage)
    .where(gte(schema.aiUsage.createdAt, DEBUT_DU_JOUR));
  return l?.micros ?? 0;
}

/** Ce qui est gardé sous `cle`, s’il est encore frais. */
function garde(cle: string): number | null {
  const lu = LUES.get(cle);
  return lu && lu.jusqua > Date.now() ? lu.micros : null;
}
const garder = (cle: string, m: number) => LUES.set(cle, { micros: m, jusqua: Date.now() + GARDE_MS });

/** Ce qui est dépensé aujourd’hui, pour tous et pour ce payeur (gardé 30 secondes). */
async function depenses(payeur: Payeur): Promise<Depenses> {
  const jour = gardeDuJour();
  const cle = cleDeDepense(payeur, jour);
  const [tous, duPayeur] = await Promise.all([
    garde(TOUS) ?? lireTous().then((m) => (garder(TOUS, m), m)),
    garde(cle) ?? compteDe(cle, FENETRE_DEPENSE).then((m) => (garder(cle, m), m)),
  ]);
  return { jour: tous, payeur: duPayeur };
}

/* ———— Avant et après chaque appel ———— */

/** Prévient l’équipe que la dépense du jour a passé ce seuil : une fois par seuil et par jour, pour toutes les instances. */
async function prevenir(seuil: number, jour: number): Promise<void> {
  if (PREVENUS.has(seuil)) return;
  /* La première instance qui passe le seuil prévient : les autres trouvent le passage déjà compté */
  const premiere = await sousLaLimite(`budget-ia:alerte:${jourGarde}:${seuil}`, { max: 1, fenetreS: 2 * 86400 });
  /* Retenu une fois la base lue : une lecture ratée laisse l’instance réessayer au prochain appel */
  PREVENUS.add(seuil);
  if (!premiere) return;
  const depense = `${(jour / 1e6).toFixed(2)} $ sur ${BUDGET_IA.jour} $`;
  await alerter(
    seuil >= 1 ? "budget de l’IA du jour atteint" : `budget de l’IA : ${Math.round(seuil * 100)} % du jour`,
    [
      `Dépensé aujourd’hui : ${depense}`,
      seuil >= 1
        ? `Les lectures, les rapports et le chat répondent « ${SOUFFLE} » jusqu’à minuit (heure de Paris).`
        : `Au-delà de ${BUDGET_IA.jour} $, tout s’arrête jusqu’à minuit (heure de Paris).`,
      `Chaque compte : ${BUDGET_IA.compte} $ par jour ; sans compte : ${BUDGET_IA.anonyme} $ en tout.`,
    ],
    { importante: true },
  );
}

/**
 * Avant un appel au modèle : le budget du jour le permet-il, pour tous et pour qui le paie (le compte de la conv
 * `storyId`, sinon le compte `compte`, sinon la part sans compte) ? Sinon l’erreur d’étape « budget », sans rien
 * appeler. Prévient l’équipe des seuils passés, sans attendre. Rend le payeur, pour noterDepense.
 */
export async function controlerBudget({ storyId, compte }: { storyId?: string; compte?: { email: string } | null } = {}): Promise<Payeur> {
  const payeur = (await payeurDe(storyId)) ?? (compte ? payeurDuCompte(compte) : null);
  const d = await depenses(payeur);
  for (const seuil of seuilsAtteints(d.jour)) void auMieux(prevenir(seuil, d.jour), "alerte du budget de l’IA", { seuil });
  const epuise = budgetEpuise(d, payeur);
  if (epuise) {
    journal("budget de l’IA atteint", { budget: epuise }, "alerte");
    throw new ErreurTache("budget");
  }
  return payeur;
}

/**
 * Après un appel : ce qu’il a coûté (en millionièmes de dollar) s’ajoute tout de suite à ce que l’instance garde, puis
 * à la dépense du jour de son payeur, en base (la promesse rendue : src/server/ia/claude.ts l’attend avec le suivi des
 * coûts, après la réponse du chat). `jour` : pour les tests, un autre jour qu’aujourd’hui.
 */
export async function noterDepense(payeur: Payeur, cout: number, jour = aujourdhuiParis().iso): Promise<void> {
  if (cout <= 0) return;
  if (jour === gardeDuJour()) {
    for (const cle of [TOUS, cleDeDepense(payeur, jour)]) {
      const lu = LUES.get(cle);
      if (lu) lu.micros += cout;
    }
  }
  await compter(cleDeDepense(payeur, jour), FENETRE_DEPENSE, cout);
}

/** Pour les tests : oublie ce que l’instance garde (les dépenses lues, les payeurs des convs, les seuils déjà dits). */
export function oublierLeBudget(): void {
  LUES.clear();
  PAYEURS.clear();
  PREVENUS.clear();
  jourGarde = "";
}
