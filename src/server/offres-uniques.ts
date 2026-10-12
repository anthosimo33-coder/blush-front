import "server-only";
import { and, eq, gt, ne, sql } from "drizzle-orm";
import { DUREE_SUITE_MS, ECART_OFFRES_UNIQUES_MS } from "@/contenu/offres";
import type { OffreUnique } from "@/types";
import type { Utilisateur } from "./auth";
import { db, schema } from "./db";
import { estEquipe } from "./droits";

/*
 * Les offres uniques (OFFRES_UNIQUES, src/types) : le serveur décide seul de les montrer, et les garde
 * (offres_uniques). Chacune une fois par compte au plus ; jamais deux à moins de 24 h l’une de l’autre (glissantes,
 * ECART_OFFRES_UNIQUES_MS) ; la suite (①) n’est valable que 5 minutes, l’heure de fin donnée par le serveur (le compte à
 * rebours de l’écran la lit). Montrée, une offre reste valable (jusqu’à sa fin, s’il y en a une) tant qu’elle n’est pas
 * prise : une page rechargée la retrouve. Prise à la livraison de l’achat qui en profite (livrer, src/server/achats.ts).
 * L’équipe ne paie rien : aucune ne lui est montrée.
 */

/** Une offre unique montrée à un compte : quand, jusqu’à quand (ou sans fin), pour quelle conv. */
export type OffreMontree = { offre: OffreUnique; montreeLe: Date; expireLe: Date | null; storyId: string | null };

/** La durée de chaque offre une fois montrée, en millisecondes, ou null : sans fin, jusqu’à ce qu’elle soit prise. */
const DUREES: Record<OffreUnique, number | null> = { suite: DUREE_SUITE_MS, relance_mail: null, premium_ajout: null, premiere_recharge: null };

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
    const [recente] = await tx
      .select({ offre: o.offre })
      .from(o)
      .where(and(eq(o.userId, compte.id), ne(o.offre, offre), gt(o.montreeLe, sql`now() - make_interval(secs => ${ECART_OFFRES_UNIQUES_MS / 1000})`)))
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

/** L’offre unique de ce compte, si elle est montrée et encore valable (ni prise, ni passée) : de quoi la vendre. Sinon null. */
export async function offreValable(userId: string, offre: OffreUnique): Promise<OffreMontree | null> {
  const [l] = await db()
    .select({ offre: o.offre, montreeLe: o.montreeLe, expireLe: o.expireLe, storyId: o.storyId })
    .from(o)
    .where(and(eq(o.userId, userId), eq(o.offre, offre), valable));
  return l ?? null;
}
