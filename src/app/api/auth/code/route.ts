import { after } from "next/server";
import { alerter } from "@/server/alertes";
import { inscrire } from "@/server/attente";
import { Email, envoyerCode, mailsDeCodeEpuises, preparerCode } from "@/server/auth";
import { lireBrouillon, poserNavigateur } from "@/server/cookies";
import { emailCanonique } from "@/server/email-canonique";
import { peutEntrer } from "@/server/env";
import { histoireOuverte, supprimerHistoire } from "@/server/histoires";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { ipDe, LIMITES, limiteAtteinte, sousLaLimite } from "@/server/limites";

/** Le code de connexion, envoyé par email. Il ne vaudra que dans ce navigateur (son cookie, posé ici). */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine");
  const email = Email.safeParse((await corps<{ email: string }>(req)).email);
  if (!email.success) return erreur("email");
  /*
   * Les mêmes limites pour tous : un « trop » ne dit pas si l’email est invité. Par adresse IP ; puis par email canonique
   * (ses alias comptent avec lui) : ses essais ratés du jour (un code de plus n’y pourrait rien, et ne ferait que
   * consommer un mail ; la limite existe aussi pour un email hors de la liste), ses codes d’une même adresse IP (qui en
   * demande pour l’email d’un autre lui en laisse), puis de partout ; enfin le plafond des mails du jour, pour tous.
   */
  const ip = ipDe(req);
  const canonique = emailCanonique(email.data);
  if (!(await sousLaLimite(`code:ip:${ip}`, LIMITES.codeParIp))) return erreur("trop");
  if (await limiteAtteinte(`code:echecs:${canonique}`, LIMITES.echecsCodeParEmail)) return erreur("essais");
  if (!(await sousLaLimite(`code:email-ip:${canonique}:${ip}`, LIMITES.codeParEmailEtIp))) return erreur("codes");
  if (!(await sousLaLimite(`code:email:${canonique}`, LIMITES.codeParEmail))) return erreur("codes");
  if (await mailsDeCodeEpuises()) return erreur("codes");
  const navigateur = await poserNavigateur();
  const brouillon = await lireBrouillon();
  const invite = peutEntrer(email.data);
  /*
   * Bêta fermée : la même réponse pour tous (« regarde tes mails »), pour que personne ne puisse savoir si un email est
   * invité. Tout ce qui en dépend se fait après la réponse : elle a le même temps, et un mail qui ne part pas ne la change
   * pas. L’invité reçoit son code. Un email hors de la liste rejoint la liste d’attente, qui lui écrit, et la conv importée
   * sur ce navigateur est effacée : on ne garde rien de quelqu’un qui n’entre pas. Son cookie reste (l’effacer changerait
   * la réponse) : il ne mène plus à rien.
   */
  after(async () => {
    try {
      const code = await preparerCode(email.data, navigateur, { envoye: invite });
      if (invite) {
        if (code) await envoyerCode(email.data, code);
        return;
      }
      const conv = await histoireOuverte(null, { brouillon });
      if (conv) await supprimerHistoire(conv.id);
      /* Le mail de la liste suit le même rythme qu’un code : pas un par demande */
      if (code) await inscrire(email.data, "connexion", { convEffacee: !!conv });
    } catch (e) {
      /* Le message d’une erreur SQL peut contenir l’email : seul son nom va aux logs, et rien de lui à l’alerte */
      console.error("code de connexion : la demande n’a pas abouti après la réponse", (e as Error).name);
      /* L’invité lit « regarde tes mails » et n’en reçoit aucun : l’équipe le sait */
      if (invite) await alerter("code de connexion non envoyé", ["Le mail du code n’est pas parti.", "Erreur : la base"]);
    }
  });
  return json({ email: email.data });
}
