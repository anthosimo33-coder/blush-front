import { Email, envoyerCode } from "@/server/auth";
import { peutEntrer } from "@/server/env";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";

export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const email = Email.safeParse((await corps<{ email: string }>(req)).email);
  if (!email.success) return erreur("email", 422);
  /* Bêta fermée : un email hors de la liste ne reçoit pas de code (rien n’est créé, rien n’est envoyé) */
  if (!peutEntrer(email.data)) return erreur("beta", 403);
  const ok = (await sousLaLimite(`code:ip:${ipDe(req)}`, LIMITES.codeParIp)) && (await sousLaLimite(`code:email:${email.data}`, LIMITES.codeParEmail));
  if (!ok) return erreur("trop", 429);
  await envoyerCode(email.data);
  return json({ email: email.data });
}
