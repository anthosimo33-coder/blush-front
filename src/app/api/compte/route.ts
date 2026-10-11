import { eq } from "drizzle-orm";
import { oublierCetAppareil } from "@/server/cookies";
import { db, schema } from "@/server/db";
import { compteDe } from "@/server/donnees";
import { erreur, lireCorps, OUBLIER_LE_NAVIGATEUR, repondre } from "@/server/http";
import { garde, lecture } from "@/server/requete";
import { ROUTES } from "@/types/api";
import { ERREURS_API } from "@/types/erreurs-api";

export async function GET() {
  const g = await lecture({ session: "requise" });
  return g instanceof Response ? g : repondre("GET /api/compte", compteDe(g.utilisateur, g.story));
}

/** Mettre BLUSH en pause (ou le reprendre). Un corps mal formé le reprend. */
export async function POST(req: Request) {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const paused = (await lireCorps(req, ROUTES["POST /api/compte"].corps))?.paused === true;
  await db().update(schema.users).set({ paused }).where(eq(schema.users.id, g.utilisateur.id));
  return repondre("POST /api/compte", { ok: true });
}

/**
 * « Tout effacer » : le compte, ses sessions (sur tous ses appareils) et ses histoires, en cascade. Ce navigateur oublie
 * aussi ce qu’il gardait de BLUSH, comme à la déconnexion. La session se lit sans le filtre de la bêta : un testeur
 * retiré de la liste peut toujours tout effacer (l’écran /effacer). Sans compte (la session a expiré, ou on s’est
 * déconnecté de partout depuis un autre appareil), rien à effacer sur le serveur : 401, jamais un « c’est fait » qui ne
 * l’est pas ; mais cet appareil oublie quand même ce qu’il gardait, comme avant.
 */
export async function DELETE(req: Request) {
  const g = await garde(req, { session: "sansBeta" });
  if (g instanceof Response) {
    /* Une requête venue d’ailleurs (403) ne fait rien oublier */
    if (g.status !== ERREURS_API.connexion) return g;
    await oublierCetAppareil();
    return erreur("connexion", OUBLIER_LE_NAVIGATEUR);
  }
  await db().delete(schema.users).where(eq(schema.users.id, g.utilisateur.id));
  await oublierCetAppareil();
  return repondre("DELETE /api/compte", { ok: true }, 200, OUBLIER_LE_NAVIGATEUR);
}
