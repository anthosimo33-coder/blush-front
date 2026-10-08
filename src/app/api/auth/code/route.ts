import { inscrire } from "@/server/attente";
import { Email, envoyerCode } from "@/server/auth";
import { effacerBrouillon, lireBrouillon } from "@/server/cookies";
import { peutEntrer } from "@/server/env";
import { histoireOuverte, supprimerHistoire } from "@/server/histoires";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";

export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const email = Email.safeParse((await corps<{ email: string }>(req)).email);
  if (!email.success) return erreur("email", 422);
  /*
   * Bêta fermée : un email hors de la liste ne reçoit pas de code. Il rejoint la liste d’attente, et la conv qu’il
   * vient d’importer est effacée tout de suite : on ne garde rien de quelqu’un qui n’entre pas.
   */
  if (!peutEntrer(email.data)) {
    if (!(await sousLaLimite(`attente:${ipDe(req)}`, LIMITES.attenteParIp))) return erreur("trop", 429);
    await inscrire(email.data, "connexion");
    const brouillon = await histoireOuverte(null, { brouillon: await lireBrouillon() });
    if (brouillon) await supprimerHistoire(brouillon.id);
    await effacerBrouillon();
    return erreur("beta", 403);
  }
  const ok = (await sousLaLimite(`code:ip:${ipDe(req)}`, LIMITES.codeParIp)) && (await sousLaLimite(`code:email:${email.data}`, LIMITES.codeParEmail));
  if (!ok) return erreur("trop", 429);
  await envoyerCode(email.data);
  return json({ email: email.data });
}
