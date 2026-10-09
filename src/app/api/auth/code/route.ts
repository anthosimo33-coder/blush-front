import { inscrire } from "@/server/attente";
import { Email, envoyerCode } from "@/server/auth";
import { lireBrouillon } from "@/server/cookies";
import { peutEntrer } from "@/server/env";
import { histoireOuverte, supprimerHistoire } from "@/server/histoires";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";

/** Le code de connexion, envoyé par email. */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const email = Email.safeParse((await corps<{ email: string }>(req)).email);
  if (!email.success) return erreur("email", 422);
  /* Les mêmes limites pour tous : un « trop » ne dit pas si l’email est invité */
  const ok = (await sousLaLimite(`code:ip:${ipDe(req)}`, LIMITES.codeParIp)) && (await sousLaLimite(`code:email:${email.data}`, LIMITES.codeParEmail));
  if (!ok) return erreur("trop", 429);
  /*
   * Bêta fermée : la même réponse pour tous (« regarde tes mails »), pour que personne ne puisse savoir si un email est
   * invité. L’invité reçoit son code. Un email hors de la liste rejoint la liste d’attente, qui lui écrit, et la conv
   * importée sur ce navigateur est effacée tout de suite : on ne garde rien de quelqu’un qui n’entre pas. Son cookie
   * reste (l’effacer changerait la réponse) : il ne mène plus à rien.
   */
  if (peutEntrer(email.data)) await envoyerCode(email.data);
  else {
    const brouillon = await histoireOuverte(null, { brouillon: await lireBrouillon() });
    if (brouillon) await supprimerHistoire(brouillon.id);
    await inscrire(email.data, "connexion", { convEffacee: !!brouillon });
  }
  return json({ email: email.data });
}
