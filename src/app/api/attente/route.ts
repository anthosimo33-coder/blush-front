import { after } from "next/server";
import { Email } from "@/server/auth";
import { inscrire } from "@/server/attente";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { auMieux } from "@/server/journal";
import { LIMITES } from "@/server/limites";
import { garde, sousLaLimiteDeLIp } from "@/server/requete";
import { ROUTES } from "@/types/api";

/* Le corps du contrat, l’email vérifié comme à la demande d’un code */
const Corps = ROUTES["POST /api/attente"].corps.extend({ email: Email });

/** La liste d’attente de la bêta fermée : on garde l’email (chiffré) pour prévenir quand une place se libère. */
export const POST = route(async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const lu = await lireCorps(req, Corps);
  if (!lu) return erreur("email");
  const { email } = lu;
  if (!(await sousLaLimiteDeLIp(req, "attente", LIMITES.attenteParIp))) return erreur("trop");
  /* Après la réponse : un mail qui ne part pas ne change pas ce qu’elle dit, ni son temps (le journal le dit, sans l’email) */
  after(() => auMieux(() => inscrire(email, "accueil"), "liste d’attente : l’inscription ou son mail n’est pas passé"));
  return repondre("POST /api/attente", { ok: true });
});
