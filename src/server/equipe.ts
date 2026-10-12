import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { crediter, soldeDe } from "./bulles";
import { db, schema } from "./db";
import type { ActionEquipe } from "./db/enums";
import { journal } from "./journal";

/*
 * Les gestes de l’équipe, sans paiement : donner des bulles à un compte, débloquer le rapport de ses convs. Depuis /admin
 * (POST /api/admin, réservé aux emails de BLUSH_ADMINS) ou depuis le terminal (scripts/acces.mts, `npm run acces`).
 * Chacun va au journal de l’équipe (actions_equipe : qui, quoi, pour quel compte, combien ; ni email, ni conv) et au
 * journal du serveur. Les bulles passent par le journal des bulles (raison « equipe », une référence datée), dans la même
 * transaction que le solde, comme dans l’appli. Une conv débloquée écrit son rapport à sa prochaine ouverture
 * (reparerLaChaine, src/server/pipeline.ts). Les comptes de l’équipe (BLUSH_ACCES_LIBRE) n’en ont pas besoin : tout leur
 * est ouvert. Les invitations de la liste d’attente sont dans src/server/attente.ts (inviterLaListe).
 */

/** Qui fait le geste : un compte de l’équipe (son id), ou null depuis le terminal. */
type Par = string | null;

/** Le compte de cet email (la personne doit s’être connectée une fois), ou null. */
async function compteDeLEmail(email: string): Promise<{ id: string } | null> {
  const [u] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase()));
  return u ?? null;
}

/** Note un geste de l’équipe : au journal de l’équipe (actions_equipe) et à celui du serveur. Jamais un email. */
export async function noterAction(action: ActionEquipe, { par, compte, nombre }: { par: Par; compte: string | null; nombre: number }): Promise<void> {
  await db().insert(schema.actionsEquipe).values({ action, parId: par, compteId: compte, nombre });
  journal("action de l’équipe", { action, par: par ?? "terminal", compte: compte ?? "", nombre });
}

/**
 * Donne `n` bulles au compte de cet email (négatif : en retire ; le solde peut alors passer sous zéro). Rend son nouveau
 * solde, ou null : aucun compte pour cet email.
 */
export async function donnerDesBulles(email: string, n: number, par: Par): Promise<{ solde: number; ref: string } | null> {
  const compte = await compteDeLEmail(email);
  if (!compte) return null;
  const ref = `equipe:${new Date().toISOString()}:${randomUUID().slice(0, 8)}`;
  await crediter(compte.id, n, "equipe", ref);
  await noterAction("bulles", { par, compte: compte.id, nombre: n });
  return { solde: await soldeDe(compte.id), ref };
}

/**
 * Ce que l’équipe débloque d’un compte : sa dernière conv (la plus récente), toutes ses convs, ou une
 * conv désignée par son id (stories.id, depuis le terminal).
 */
export type CibleDuDeblocage = "derniere" | "toutes" | { conv: string };

/**
 * Débloque le rapport des convs du compte de cet email (`cible`) qui ne l’étaient pas encore. Rend les convs débloquées
 * (leurs ids), ou null : aucun compte pour cet email.
 */
export async function debloquerDesConvs(email: string, cible: CibleDuDeblocage, par: Par): Promise<{ convs: string[] } | null> {
  const compte = await compteDeLEmail(email);
  if (!compte) return null;
  const s = schema.stories;
  const duCompte = eq(s.userId, compte.id);
  let ou;
  if (cible === "toutes") ou = duCompte;
  else if (cible === "derniere") {
    const [derniere] = await db().select({ id: s.id }).from(s).where(duCompte).orderBy(desc(s.createdAt)).limit(1);
    if (!derniere) return { convs: [] };
    ou = and(duCompte, eq(s.id, derniere.id));
  } else ou = and(duCompte, inArray(s.id, [cible.conv]));
  const ouvertes = await db()
    .update(s)
    .set({ debloqueLe: sql`now()` })
    .where(and(ou, isNull(s.debloqueLe)))
    .returning({ id: s.id });
  const convs = ouvertes.map((c) => c.id);
  if (convs.length) await noterAction("debloquer", { par, compte: compte.id, nombre: convs.length });
  return { convs };
}

/**
 * Une action récente de l’équipe, pour /admin : laquelle, combien, quand (ISO), et si elle vient du terminal (sans compte
 * de l’équipe : le terminal, ou un compte effacé depuis). Ni qui l’a reçue, ni son email.
 */
export type ActionRecente = { action: ActionEquipe; nombre: number; le: string; depuisLeTerminal: boolean };

/** Les `n` dernières actions de l’équipe, de la plus récente à la plus ancienne. */
export async function actionsRecentes(n = 6): Promise<ActionRecente[]> {
  const a = schema.actionsEquipe;
  const lignes = await db().select({ action: a.action, nombre: a.nombre, le: a.creeLe, parId: a.parId }).from(a).orderBy(desc(a.creeLe), desc(a.id)).limit(n);
  return lignes.map((l) => ({ action: l.action, nombre: l.nombre, le: l.le.toISOString(), depuisLeTerminal: !l.parId }));
}
