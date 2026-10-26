import { cleEnvoi } from "@/server/captures";
import { oublierLesEcransDe } from "@/server/ecrans-gardes";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { envoiDe } from "@/server/imports";
import { LIMITES } from "@/server/limites";
import { abandonnerLEnvoi } from "@/server/lots";
import { garde, sousLaLimiteDeLIp } from "@/server/requete";
import { ROUTES } from "@/types/api";

/**
 * Le navigateur abandonne un enregistrement d’écran en cours de lecture (`cle`, celle de ses lots ; `raison`,
 * RAISONS_D_ABANDON) : un de ses lots a échoué pour de bon (`echec` : ses lots ne vont plus au bout chez le prestataire),
 * ou la page est fermée (`page` : seuls ceux qui n’ont pas encore appelé le modèle s’arrêtent, les autres vont au bout
 * pour que la page rechargée les retrouve). Aucun ne part plus (src/server/lots.ts), et les lots déjà lus restent gardés.
 * Les écrans d’une longue vidéo envoyés pour après le paiement (src/server/ecrans-gardes.ts), qu’aucune conv n’a encore
 * pris, s’effacent dans les deux cas : la page rechargée tire une autre clé, et ne les reprendrait jamais. Une clé qui
 * n’en a pas la forme n’arrête rien. Toujours `{ ok: true }` : le navigateur l’envoie en partant, sans lire la réponse.
 */
export const POST = route("POST /api/captures/lot/abandon", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const corps = await lireCorps(req, ROUTES["POST /api/captures/lot/abandon"].corps);
  if (!corps) return erreur("invalide");
  /* Comptée avec les lots de l’adresse : une rafale d’abandons n’écrit pas sans fin dans la base */
  if (!(await sousLaLimiteDeLIp(req, "lot", LIMITES.lotParIp))) return erreur("trop");
  const envoi = envoiDe(cleEnvoi(corps.cle));
  if (envoi) {
    await abandonnerLEnvoi(envoi, corps.raison);
    await oublierLesEcransDe(envoi);
  }
  return repondre("POST /api/captures/lot/abandon", { ok: true });
});
