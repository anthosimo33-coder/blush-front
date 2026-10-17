import { erreur, repondre, route } from "@/server/http";
import { desinscrire } from "@/server/relances";

/** Ce que coupe le lien : les offres ou les conseils (« tout » n’est jamais dans un en-tête). */
const GENRES = new Set(["offres", "conseils"]);

/**
 * La désinscription en un clic (RFC 8058), hors de la garde commune : c’est la messagerie (Gmail, Yahoo…) qui l’appelle
 * elle-même, depuis ses serveurs, en POST, quand on touche « Se désabonner » à côté de l’expéditeur (l’en-tête
 * List-Unsubscribe des mails des séquences et de la relance, src/server/relances.ts). Pas notre origine, ni session, ni
 * page à confirmer : seul compte le lien signé (`id`, `cle`, `quoi`), sinon 404 « lien ». Le corps (« List-Unsubscribe=One-Click ») ne dit rien de plus.
 */
export const POST = route("POST /api/desinscription/un-clic", async (req: Request) => {
  const p = new URL(req.url).searchParams;
  const quoi = p.get("quoi") ?? "offres";
  if (!GENRES.has(quoi) || !(await desinscrire(p.get("id") ?? "", p.get("cle") ?? "", quoi as "offres" | "conseils"))) return erreur("lien");
  return repondre("POST /api/desinscription/un-clic", { ok: true });
});
