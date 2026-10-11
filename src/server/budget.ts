import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { alerter } from "./alertes";
import { db, schema } from "./db";
import { ErreurTache } from "./erreurs";
import { auMieux, journal } from "./journal";
import { sousLaLimite } from "./limites";
import { aujourdhuiParis } from "./temps";

/*
 * Le budget de l’IA (S-14) : ce que coûtent les appels au modèle, par jour de Paris (remis à zéro à minuit, heure de
 * Paris), lu dans ai_usage (ce que chaque appel a coûté, noté par src/server/ia/claude.ts). Avant chaque appel
 * (`controlerBudget`, dans appeler) : au-delà du budget du jour, pour tous ou pour ce compte, l’appel ne part pas, et
 * l’étape échoue sur « budget ». Le navigateur l’apprend comme « souffle » : « BLUSH souffle un peu, réessaie demain ».
 * Une lecture ou un rapport arrêté ainsi n’use pas ses essais et repart après minuit (src/server/pipeline.ts).
 * L’équipe est prévenue à 50 % et 80 % du budget du jour, puis quand il est atteint, une fois par seuil et par jour.
 *
 * Qui paie un appel : le compte de sa conv (ai_usage.story_id → stories.user_id). Un appel sans conv (les captures lues
 * avant l’import, src/server/captures.ts) ou sur une conv sans compte est « anonyme » : il a sa part à lui, prise dans
 * le budget du jour. Une conv effacée laisse ses lignes sans conv (set null) : elles comptent encore pour le jour, et
 * passent dans la part anonyme.
 */

/** Les budgets du jour, en dollars, et les seuils où l’équipe est prévenue (une part du budget du jour). */
export const BUDGET_IA = {
  /** Tous les appels du jour (décidé). */
  jour: 30,
  /** Les appels pour les convs d’un compte (décidé). */
  compte: 3,
  /** Les appels sans compte, pris dans le budget du jour. TODO(produit): 5 $, à revoir avec les chiffres de l’ouverture. */
  anonyme: 5,
  /** L’équipe est prévenue à 50 % et 80 % (décidé), puis quand le budget du jour est atteint. */
  seuils: [0.5, 0.8, 1],
} as const;

/** Qui paie un appel : l’identifiant d’un compte, ou null (sans compte). */
export type Payeur = string | null;

/** Ce qui est déjà dépensé aujourd’hui, en millionièmes de dollar (comme ai_usage.cost_micros) : pour tous, et pour ce payeur. */
export type Depenses = { jour: number; payeur: number };

const micros = (dollars: number) => Math.round(dollars * 1e6);

/** Le budget du jour de ce payeur, en millionièmes de dollar. */
export const plafondDe = (payeur: Payeur): number => micros(payeur ? BUDGET_IA.compte : BUDGET_IA.anonyme);

/** Quel budget est épuisé (celui de tous d’abord), ou null : l’appel peut partir. */
export function budgetEpuise({ jour, payeur: duPayeur }: Depenses, payeur: Payeur): "jour" | "compte" | "anonyme" | null {
  if (jour >= micros(BUDGET_IA.jour)) return "jour";
  if (duPayeur >= plafondDe(payeur)) return payeur ? "compte" : "anonyme";
  return null;
}

/** Les seuils d’alerte que la dépense du jour a passés. */
export const seuilsAtteints = (jour: number): number[] => BUDGET_IA.seuils.filter((s) => jour >= micros(BUDGET_IA.jour * s));

/** Minuit à Paris, aujourd’hui : le début du jour du budget (et de l’heure où une tâche arrêtée par lui peut repartir). */
export const DEBUT_DU_JOUR = sql`(date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')`;

/* ———— Les dépenses, lues en base et gardées un instant ———— */

/*
 * Chaque appel relit le budget : on garde ce qu’on a lu 30 secondes par instance, et on y ajoute ce que les appels de
 * l’instance coûtent entre-temps (noterDepense). Les autres instances le voient à leur prochaine lecture : le budget
 * peut être dépassé de ce que coûtent les appels lancés pendant ces 30 secondes, jamais plus.
 */
const GARDE_MS = 30_000;
type Lu = { micros: number; jour: string; jusqua: number };
/** Tous les appels du jour (`*`), les appels sans compte (`-`), puis compte par compte. */
const LUES = new Map<string, Lu>();
const TOUS = "*";
const ANONYMES = "-";
/** Le compte de chaque conv déjà vue (une conv sans compte n’est pas gardée : elle peut en trouver un). */
const PAYEURS = new Map<string, string>();
/** Les seuils dont cette instance a déjà prévenu l’équipe aujourd’hui (« 2026-10-11:0.5 ») : elle ne relit plus la base pour eux. */
const PREVENUS = new Set<string>();
/** Au-delà, on oublie les comptes des convs vues (ils se relisent). */
const PAYEURS_MAX = 5000;

/** Le compte qui paie les appels de cette conv ; null sans conv, ou sans compte. */
async function payeurDe(storyId: string | undefined): Promise<Payeur> {
  if (!storyId) return null;
  const connu = PAYEURS.get(storyId);
  if (connu) return connu;
  const [s] = await db().select({ userId: schema.stories.userId }).from(schema.stories).where(eq(schema.stories.id, storyId));
  if (!s?.userId) return null;
  if (PAYEURS.size >= PAYEURS_MAX) PAYEURS.clear();
  PAYEURS.set(storyId, s.userId);
  return s.userId;
}

const somme = sql<number>`coalesce(sum(${schema.aiUsage.costMicros}), 0)`.mapWith(Number);

/** Les dépenses du jour, pour tous et sans compte, en une lecture (les deux viennent des mêmes lignes). */
async function lireTous(): Promise<{ tous: number; anonymes: number }> {
  const [l] = await db()
    .select({ tous: somme, anonymes: sql<number>`coalesce(sum(${schema.aiUsage.costMicros}) filter (where ${schema.stories.userId} is null), 0)`.mapWith(Number) })
    .from(schema.aiUsage)
    .leftJoin(schema.stories, eq(schema.stories.id, schema.aiUsage.storyId))
    .where(gte(schema.aiUsage.createdAt, DEBUT_DU_JOUR));
  return l ?? { tous: 0, anonymes: 0 };
}

/** Les dépenses du jour pour les convs d’un compte (par ses convs : l’index de ai_usage sur story_id sert). */
async function lireCompte(compte: string): Promise<number> {
  const [l] = await db()
    .select({ micros: somme })
    .from(schema.stories)
    .innerJoin(schema.aiUsage, eq(schema.aiUsage.storyId, schema.stories.id))
    .where(and(eq(schema.stories.userId, compte), gte(schema.aiUsage.createdAt, DEBUT_DU_JOUR)));
  return l?.micros ?? 0;
}

/** Ce qui est gardé sous `cle`, s’il est encore frais et du même jour. */
function garde(cle: string, jour: string): number | null {
  const lu = LUES.get(cle);
  return lu && lu.jour === jour && lu.jusqua > Date.now() ? lu.micros : null;
}
const garder = (cle: string, jour: string, m: number) => LUES.set(cle, { micros: m, jour, jusqua: Date.now() + GARDE_MS });

/** Ce qui est dépensé aujourd’hui, pour tous et pour ce payeur (gardé 30 secondes). */
async function depenses(payeur: Payeur): Promise<Depenses> {
  const jour = aujourdhuiParis().iso;
  const cle = payeur ?? ANONYMES;
  let tous = garde(TOUS, jour);
  let duPayeur = garde(cle, jour);
  if (tous === null || (duPayeur === null && !payeur)) {
    const lu = await lireTous();
    [tous, duPayeur] = [lu.tous, payeur ? duPayeur : lu.anonymes];
    garder(TOUS, jour, lu.tous);
    garder(ANONYMES, jour, lu.anonymes);
  }
  if (duPayeur === null && payeur) {
    duPayeur = await lireCompte(payeur);
    garder(cle, jour, duPayeur);
  }
  return { jour: tous, payeur: duPayeur ?? 0 };
}

/* ———— Avant et après chaque appel ———— */

/** Prévient l’équipe que la dépense du jour a passé ce seuil : une fois par seuil et par jour, pour toutes les instances. */
async function prevenir(seuil: number, jour: number): Promise<void> {
  const cle = `${aujourdhuiParis().iso}:${seuil}`;
  if (PREVENUS.has(cle)) return;
  PREVENUS.add(cle);
  /* La première instance qui passe le seuil prévient : les autres trouvent le passage déjà compté */
  if (!(await sousLaLimite(`budget-ia:alerte:${cle}`, { max: 1, fenetreS: 2 * 86400 }))) return;
  const depense = `${(jour / 1e6).toFixed(2)} $ sur ${BUDGET_IA.jour} $`;
  await alerter(
    seuil >= 1 ? "budget de l’IA du jour atteint" : `budget de l’IA : ${Math.round(seuil * 100)} % du jour`,
    [
      `Dépensé aujourd’hui : ${depense}`,
      seuil >= 1
        ? "Les lectures, les rapports et le chat répondent « BLUSH souffle un peu, réessaie demain » jusqu’à minuit (heure de Paris)."
        : `Au-delà de ${BUDGET_IA.jour} $, tout s’arrête jusqu’à minuit (heure de Paris).`,
      `Chaque compte : ${BUDGET_IA.compte} $ par jour ; sans compte : ${BUDGET_IA.anonyme} $ en tout.`,
    ],
    { importante: true },
  );
}

/**
 * Avant un appel au modèle : le budget du jour le permet-il, pour tous et pour le compte de cette conv (sans conv : la
 * part sans compte) ? Sinon l’erreur d’étape « budget », sans rien appeler. Prévient l’équipe des seuils passés, sans
 * attendre. Rend le payeur, pour noterDepense.
 */
export async function controlerBudget(storyId?: string): Promise<Payeur> {
  const payeur = await payeurDe(storyId);
  const d = await depenses(payeur);
  for (const seuil of seuilsAtteints(d.jour)) void auMieux(prevenir(seuil, d.jour), "alerte du budget de l’IA", { seuil });
  const epuise = budgetEpuise(d, payeur);
  if (epuise) {
    journal("budget de l’IA atteint", { budget: epuise }, "alerte");
    throw new ErreurTache("budget");
  }
  return payeur;
}

/** Après un appel : ce qu’il a coûté s’ajoute à ce que l’instance garde, sans attendre sa prochaine lecture. */
export function noterDepense(payeur: Payeur, cout: number): void {
  const jour = aujourdhuiParis().iso;
  for (const cle of [TOUS, payeur ?? ANONYMES]) {
    const lu = LUES.get(cle);
    if (lu && lu.jour === jour) lu.micros += cout;
  }
}

/** Pour les tests : oublie ce que l’instance garde (les dépenses lues, les comptes des convs, les seuils déjà dits). */
export function oublierLeBudget(): void {
  LUES.clear();
  PAYEURS.clear();
  PREVENUS.clear();
}
