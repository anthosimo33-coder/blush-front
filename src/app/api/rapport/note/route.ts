import { rapportOuvertEnBase } from "@/server/droits";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { noterLeRapport } from "@/server/note-du-rapport";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * La note du rapport de la conv ouverte (src/server/note-du-rapport.ts) : « Oui, grave » ou « Bof », la raison d’un
 * « Bof », ou un avis. Seulement un rapport débloqué (402 « acces » sinon) ; chaque chose se compte une fois par conv,
 * et la réponse est toujours `{ ok: true }` : une note déjà donnée ne se dit pas.
 */
export const POST = route("POST /api/rapport/note", async (req: Request) => {
  const g = await garde(req, { session: "requise", histoire: true });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/rapport/note"].corps);
  if (!corps) return erreur("invalide");
  if (!(await rapportOuvertEnBase(g.story.id))) return erreur("acces");
  await noterLeRapport(g.story.id, corps);
  return repondre("POST /api/rapport/note", { ok: true });
});
