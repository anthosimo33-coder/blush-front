import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { CASE_DE_REPLI, CASES_DE_LA_ROUE, DUREE_DU_CADEAU_MS, GROS_LOTS, GROS_LOTS_PAR_JOUR } from "@/contenu/roue";
import type { LotDeLaRoue } from "@/types";
import type { RoueDuCompte } from "@/types/api";
import type { Utilisateur } from "./auth";
import { db, schema } from "./db";
import { estEquipe } from "./droits";
import { fournisseur } from "./paiement/fournisseur";

/*
 * La roue du paywall (src/contenu/roue.ts) : un tour par compte, tiré ici, jamais dans le navigateur. Le compte la
 * tourne (une case, tirée avec sa chance ; un gros lot au-delà de son plafond du jour tombe sur +10 bulles), ou n’en
 * veut pas (« Je ne veux pas de cadeau ») ; dans les deux cas, elle ne revient plus. Le lot vaut 15 minutes
 * (DUREE_DU_CADEAU_MS) : la commande d’une formule passée dans ce temps le prend (commander, src/server/achats.ts), et la
 * livraison le marque pris, une fois (livrer). Ni l’équipe (qui ne paie rien), ni un site sans paiement ne la voient.
 * Un lot gagné remplace l’offre ① (la suite moins chère) : jamais les deux (proposerOffreUnique).
 */

/** Un compte, tel que la roue le lit : son id et son email (l’équipe ne la voit pas). */
type Compte = Pick<Utilisateur, "id" | "email">;

const r = schema.roue;

/** La ligne de la roue de ce compte, telle que l’écran la lit, ou null (jamais tournée). */
type Ligne = { caseTiree: number | null; lot: LotDeLaRoue | null; expireLe: Date | null; priseLe: Date | null };

/** Ce que l’écran sait de la roue d’après sa ligne : à tourner, refusée, ou gagnée (le lot, sa fin et ce qu’il reste). */
function etatDe(ligne: Ligne | undefined): RoueDuCompte {
  if (!ligne) return { etat: "a_tourner" };
  if (ligne.caseTiree === null || !ligne.lot) return { etat: "refusee" };
  const fin = ligne.expireLe ?? new Date();
  const reste = Math.max(0, fin.getTime() - Date.now());
  return { etat: "gagnee", case: ligne.caseTiree, lot: ligne.lot, fin: fin.toISOString(), reste, valable: !ligne.priseLe && reste > 0 };
}

const colonnes = { caseTiree: r.caseTiree, lot: r.lot, expireLe: r.expireLe, priseLe: r.priseLe };

/** La roue de ce compte : à tourner, refusée ou gagnée ; « aucune » pour l’équipe, ou sans paiement branché (rien ne s’achèterait). */
export async function roueDuCompte(compte: Compte): Promise<RoueDuCompte> {
  if (estEquipe(compte) || !fournisseur()) return { etat: "aucune" };
  const [ligne] = await db().select(colonnes).from(r).where(eq(r.userId, compte.id));
  return etatDe(ligne);
}

/** Une case tirée au hasard, chacune avec sa chance (sur 10 000, CASES_DE_LA_ROUE). */
function caseAuHasard(): number {
  let tirage = randomInt(0, 10_000);
  for (const [k, c] of CASES_DE_LA_ROUE.entries()) {
    if (tirage < c.chance) return k;
    tirage -= c.chance;
  }
  return CASE_DE_REPLI;
}

/**
 * Le compte tourne la roue, ou la refuse : une fois. Déjà tournée (ou refusée), rien ne change, la même réponse revient
 * (une page rechargée retrouve sa case et son minuteur). Tournée, la case est tirée ici (`forcee` : la case imposée par
 * un test, avec le faux Whop seulement, voir la route) ; un gros lot qui a déjà atteint son plafond du jour (heure de
 * Paris) tombe sur +10 bulles. Le compte est verrouillé le temps de décider : deux tours en même temps n’en font qu’un.
 */
export async function jouer(compte: Compte, geste: "tourner" | "refuser", { forcee = null }: { forcee?: number | null } = {}): Promise<RoueDuCompte> {
  if (estEquipe(compte) || !fournisseur()) return { etat: "aucune" };
  return db().transaction(async (tx) => {
    await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, compte.id)).for("update");
    const [deja] = await tx.select(colonnes).from(r).where(eq(r.userId, compte.id));
    if (deja) return etatDe(deja);
    if (geste === "refuser") {
      const [refusee] = await tx.insert(r).values({ userId: compte.id }).returning(colonnes);
      return etatDe(refusee);
    }
    /* La case imposée ne vaut qu’avec le faux Whop (les tests, jamais en ligne) */
    const imposee = fournisseur()?.mode === "factice" && forcee !== null && forcee >= 0 && forcee < CASES_DE_LA_ROUE.length ? forcee : null;
    let k = imposee ?? caseAuHasard();
    const lot = CASES_DE_LA_ROUE[k]!.lot;
    if (GROS_LOTS.includes(lot)) {
      const [jour] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(r)
        .where(and(eq(r.lot, lot), gt(r.tireeLe, sql`(date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')`)));
      if ((jour?.n ?? 0) >= GROS_LOTS_PAR_JOUR) k = CASE_DE_REPLI;
    }
    const [gagnee] = await tx
      .insert(r)
      .values({ userId: compte.id, caseTiree: k, lot: CASES_DE_LA_ROUE[k]!.lot, expireLe: sql`now() + make_interval(secs => ${DUREE_DU_CADEAU_MS / 1000})` })
      .returning(colonnes);
    return etatDe(gagnee);
  });
}

/** Le lot de la roue de ce compte, s’il est gagné et encore valable (ni pris, ni passé) : de quoi le figer dans une commande. Sinon null. */
export async function lotValable(userId: string): Promise<LotDeLaRoue | null> {
  const [l] = await db()
    .select({ lot: r.lot })
    .from(r)
    .where(and(eq(r.userId, userId), isNotNull(r.lot), isNull(r.priseLe), gt(r.expireLe, sql`now()`)));
  return l?.lot ?? null;
}

/** Ce compte a-t-il gagné un lot à la roue (pris, passé ou encore valable) ? Alors l’offre ① ne se montre pas : jamais les deux. */
export async function aGagneALaRoue(userId: string): Promise<boolean> {
  const [l] = await db()
    .select({ lot: r.lot })
    .from(r)
    .where(and(eq(r.userId, userId), isNotNull(r.lot)));
  return !!l;
}
