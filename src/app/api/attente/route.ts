import { after } from "next/server";
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
  /* Après la réponse : un mail qui ne part pas ne change pas ce qu’elle dit, ni son temps */
  after(() => inscrire(email.data, "accueil").catch((e: Error) => console.error("liste d’attente : l’inscription ou son mail n’est pas passé", e.name)));
  return json({ ok: true });
}
