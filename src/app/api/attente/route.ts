import { Email } from "@/server/auth";
import { inscrire } from "@/server/attente";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";

/** La liste d’attente de la bêta fermée : on garde l’email (chiffré) pour prévenir quand une place se libère. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const email = Email.safeParse((await corps<{ email: string }>(req)).email);
  if (!email.success) return erreur("email");
  if (!(await sousLaLimite(`attente:${ipDe(req)}`, LIMITES.attenteParIp))) return erreur("trop");
  await inscrire(email.data, "accueil");
  return json({ ok: true });
}
