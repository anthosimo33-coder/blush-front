import { cleEnvoi } from "@/server/captures";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { envoiDe } from "@/server/imports";
import { LIMITES } from "@/server/limites";
import { abandonnerLEnvoi } from "@/server/lots";
import { garde, sousLaLimiteDeLIp } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * Le navigateur abandonne un enregistrement d’écran en cours de lecture (un de ses lots a échoué pour de bon, ou la page
 * est fermée pendant la lecture) : les lots de cet envoi (`cle`, celle de ses lots) ne vont plus au bout chez le
 * prestataire, et aucun ne part plus (src/server/lots.ts). Les lots déjà lus restent gardés. Une clé qui n’en a pas la forme n’arrête rien. Toujours
 * `{ ok: true }` : le navigateur l’envoie en partant, sans lire la réponse.
 */
export const POST = route("POST /api/captures/lot/abandon", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/captures/lot/abandon"].corps);
  if (!corps) return erreur("invalide");
  /* Comptée avec les lots de l’adresse : une rafale d’abandons n’écrit pas sans fin dans la base */
  if (!(await sousLaLimiteDeLIp(req, "lot", LIMITES.lotParIp))) return erreur("trop");
  const envoi = envoiDe(cleEnvoi(corps.cle));
  if (envoi) await abandonnerLEnvoi(envoi);
  return repondre("POST /api/captures/lot/abandon", { ok: true });
});
