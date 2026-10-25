import "server-only";
import { and, eq, gt, isNull, notInArray, sql } from "drizzle-orm";
import { DUREE_AJOUT_MS, DUREE_GARDE_MS, DUREE_SUITE_MS, ECART_OFFRES_UNIQUES_MS } from "@/contenu/offres";
import type { OffreUnique } from "@/types";
import type { Utilisateur } from "./auth";
import { db, schema } from "./db";
import { estEquipe } from "./droits";

/*
 * Les offres uniques (OFFRES_UNIQUES, src/types) : le serveur décide seul de les montrer, et les garde
 * (offres_uniques). Chacune une fois par compte au plus ; jamais deux à moins de 24 h l’une de l’autre (glissantes,
 * ECART_OFFRES_UNIQUES_MS) ; la suite (①) n’est valable que 5 minutes, l’heure de fin donnée par le serveur (le compte à
 * rebours de l’écran la lit), ③ et ⑤ 15 minutes (DUREE_AJOUT_MS : elles ne se montrent que juste après un paiement),
 * et ⑥ 7 jours (DUREE_GARDE_MS). Montrée, une offre reste valable (jusqu’à sa fin, s’il y en a une) tant qu’elle n’est
 * pas prise : une page rechargée la retrouve. Prise à la livraison de l’achat qui en profite (livrer, src/server/achats.ts).
 * L’équipe ne paie rien : aucune ne lui est montrée. La relance par mail (②) n’est pas montrée par ici : elle s’envoie
 * deux heures après la ① (src/server/relances.ts), qui seule ne l’arrête pas (elle la suit par définition). Pour le
 * reste, elle compte comme les autres : ni ③ ni ④ dans les 24 h d’une relance, ni de relance dans les 24 h de l’une
 * d’elles, et pas de ① dans les 24 h d’une relance partie après une commande laissée en attente. ④ (le bonus de la
 * première recharge) est arrêtée le 23 octobre 2026 : plus jamais montrée (proposerOffreUnique), ses lignes restent.
 * Seule exception à la règle des 24 h : les offres de « C’est débloqué » (OFFRES_DU_MERCI), qui se suivent sur la même
 * page juste après un paiement, une offre puis son repli si elle est refusée (décidé le 13 octobre).
 */

/** Une offre unique montrée à un compte : quand, jusqu’à quand (ou sans fin), pour quelle conv. */
export type OffreMontree = { offre: OffreUnique; montreeLe: Date; expireLe: Date | null; storyId: string | null };

/** La durée de chaque offre une fois montrée, en millisecondes, ou null : sans fin, jusqu’à ce qu’elle soit prise. */
const DUREES: Record<OffreUnique, number | null> = {
  suite: DUREE_SUITE_MS,
  relance_mail: null,
  premium_ajout: DUREE_AJOUT_MS,
  premiere_recharge: null,
  second_rapport: DUREE_AJOUT_MS,
  garde_second: DUREE_GARDE_MS,
};

/**
 * Les offres de « C’est débloqué », juste après le paiement d’un rapport : ③ Premium pour 6,90 € de plus et ⑤ le 2e rapport
 * à −50 % (l’une, puis l’autre en repli), puis ⑥ le −50 % gardé quand ⑤ est refusée. Entre elles, et après la suite (①)
 * qui vient d’être payée, la règle des 24 h ne joue pas. Chacune reste une fois par compte, et compte pour les autres
 * (② la relance, ④ la première recharge) comme n’importe quelle offre unique.
 */
const OFFRES_DU_MERCI: readonly OffreUnique[] = ["premium_ajout", "second_rapport", "garde_second"];

/**
 * Les offres qui n’empêchent pas d’en montrer une autre dans les 24 h : elle-même (déjà vue plus haut), et ① avant la
 * relance (②), qui la suit de deux heures par définition ; et, avant une offre de « C’est débloqué », les autres offres
 * du merci et ① (la suite qu’on vient de payer y mène).
 */
function sansEcart(offre: OffreUnique): OffreUnique[] {
  if (offre === "relance_mail") return [offre, "suite"];
  if (OFFRES_DU_MERCI.includes(offre)) return [...OFFRES_DU_MERCI, "suite"];
  return [offre];
}

const o = schema.offresUniques;

/** Encore valable : ni prise, ni passée. */
const valable = sql`(${o.priseLe} is null and (${o.expireLe} is null or ${o.expireLe} > now()))`;

/**
 * Montre cette offre unique à ce compte, si le serveur le permet : la première fois (et aucune autre offre montrée dans
 * les 24 h), ou de nouveau tant qu’elle est valable (une page rechargée retrouve le même compte à rebours). Rend l’offre
 * montrée, ou null : déjà prise, passée, une autre trop récente, ou un compte de l’équipe. `storyId` : la conv pour
 * laquelle elle est montrée (la suite, la relance). Le compte est verrouillé le temps de décider : deux offres demandées
 * en même temps n’en montrent qu’une.
 */
export async function montrer(compte: Pick<Utilisateur, "id" | "email">, offre: OffreUnique, { storyId = null }: { storyId?: string | null } = {}): Promise<OffreMontree | null> {
  if (estEquipe(compte)) return null;
  return db().transaction(async (tx) => {
    await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, compte.id)).for("update");
    const colonnes = { offre: o.offre, montreeLe: o.montreeLe, expireLe: o.expireLe, storyId: o.storyId };
    const [deja] = await tx
      .select({ ...colonnes, valable: sql<boolean>`${valable}` })
      .from(o)
      .where(and(eq(o.userId, compte.id), eq(o.offre, offre)));
    if (deja) {
      const { valable: encore, ...montree } = deja;
      return encore ? montree : null;
    }
    /* Une autre offre montrée dans les 24 h la retient, sauf celles qui se suivent par définition (sansEcart) */
    const [recente] = await tx
      .select({ offre: o.offre })
      .from(o)
      .where(and(eq(o.userId, compte.id), notInArray(o.offre, sansEcart(offre)), gt(o.montreeLe, sql`now() - make_interval(secs => ${ECART_OFFRES_UNIQUES_MS / 1000})`)))
      .limit(1);
    if (recente) return null;
    const duree = DUREES[offre];
    const [montree] = await tx
      .insert(o)
      .values({ userId: compte.id, offre, storyId, expireLe: duree === null ? null : sql`now() + make_interval(secs => ${duree / 1000})` })
      .returning(colonnes);
    return montree ?? null;
  });
}

/**
 * Rouvre l’offre ① de ce compte pour cette conv, jusqu’à après-demain minuit (heure de Paris) : le mail J+6 de S1, la
 * « dernière fois » (src/server/sequences.ts). La seule exception à « une fois, 5 minutes » : décidée le 17 octobre, en
 * A/B. Pas si elle est déjà prise, ni si une autre offre unique a été montrée dans les 24 h ; sa ligne se crée si elle
 * n’avait jamais été montrée. Rend sa nouvelle fin, ou null. À l’appelant de vérifier qu’elle se vend pour cette conv
 * (suiteVendable, src/server/paiement/commande.ts).
 */
export async function rouvrirLaSuite(compte: Pick<Utilisateur, "id" | "email">, storyId: string): Promise<Date | null> {
  if (estEquipe(compte)) return null;
  return db().transaction(async (tx) => {
    await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, compte.id)).for("update");
    const [recente] = await tx
      .select({ offre: o.offre })
      .from(o)
      .where(and(eq(o.userId, compte.id), notInArray(o.offre, ["suite"]), gt(o.montreeLe, sql`now() - make_interval(secs => ${ECART_OFFRES_UNIQUES_MS / 1000})`)))
      .limit(1);
    if (recente) return null;
    const fin = sql`((date_trunc('day', now() at time zone 'Europe/Paris') + interval '3 days' - interval '1 second') at time zone 'Europe/Paris')`;
    const [rouverte] = await tx
      .insert(o)
      .values({ userId: compte.id, offre: "suite", storyId, expireLe: fin })
      .onConflictDoUpdate({ target: [o.userId, o.offre], set: { storyId, montreeLe: sql`now()`, expireLe: fin }, setWhere: isNull(o.priseLe) })
      .returning({ expireLe: o.expireLe });
    return rouverte?.expireLe ?? null;
  });
}

/** L’offre unique de ce compte, si elle est montrée et encore valable (ni prise, ni passée) : de quoi la vendre. Sinon null. */
export async function offreValable(userId: string, offre: OffreUnique): Promise<OffreMontree | null> {
  const [l] = await db()
    .select({ offre: o.offre, montreeLe: o.montreeLe, expireLe: o.expireLe, storyId: o.storyId })
    .from(o)
    .where(and(eq(o.userId, userId), eq(o.offre, offre), valable));
  return l ?? null;
}
