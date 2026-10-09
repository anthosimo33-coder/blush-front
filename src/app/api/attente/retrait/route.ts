import { retirer } from "@/server/attente";
import { corps, erreur, json, memeOrigine } from "@/server/http";

/** Se retirer de la liste d’attente, depuis le lien de son mail (signé : on ne peut retirer que son propre email). */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { id, cle } = await corps<{ id: string; cle: string }>(req);
  if (typeof id !== "string" || typeof cle !== "string" || !(await retirer(id, cle))) return erreur("lien", 404);
  return json({ ok: true });
}
