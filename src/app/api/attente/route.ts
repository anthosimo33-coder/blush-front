import { after } from "next/server";
import { Email } from "@/server/auth";
import { inscrire } from "@/server/attente";
import { erreur, lireCorps, memeOrigine, repondre } from "@/server/http";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";
import { ROUTES } from "@/types/api";

/* Le corps du contrat, l’email vérifié comme à la demande d’un code */
const Corps = ROUTES["POST /api/attente"].corps.extend({ email: Email });

/** La liste d’attente de la bêta fermée : on garde l’email (chiffré) pour prévenir quand une place se libère. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const lu = await lireCorps(req, Corps);
  if (!lu) return erreur("email");
  const { email } = lu;
  if (!(await sousLaLimite(`attente:${ipDe(req)}`, LIMITES.attenteParIp))) return erreur("trop");
  /* Après la réponse : un mail qui ne part pas ne change pas ce qu’elle dit, ni son temps */
  after(() => inscrire(email, "accueil").catch((e: Error) => console.error("liste d’attente : l’inscription ou son mail n’est pas passé", e.name)));
  return repondre("POST /api/attente", { ok: true });
}
