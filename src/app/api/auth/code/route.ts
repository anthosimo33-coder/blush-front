import { Email, envoyerCode } from "@/server/auth";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";

export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const email = Email.safeParse((await corps<{ email: string }>(req)).email);
  if (!email.success) return erreur("email", 422);
  const ok = (await sousLaLimite(`code:ip:${ipDe(req)}`, LIMITES.codeParIp)) && (await sousLaLimite(`code:email:${email.data}`, LIMITES.codeParEmail));
  if (!ok) return erreur("trop", 429);
  await envoyerCode(email.data);
  return json({ email: email.data });
}
