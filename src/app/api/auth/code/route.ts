import { after } from "next/server";
import { alerter } from "@/server/alertes";
import { inscrire } from "@/server/attente";
import { jetonRefuse } from "@/server/captcha";
import { codeAccorde, Email, envoyerCode, essaisEpuises, mailsDeCodeEpuises, preparerCode } from "@/server/auth";
import { lireBrouillon, lireNavigateur, poserNavigateur } from "@/server/cookies";
import { peutEntrer } from "@/server/env";
import { histoireOuverte, supprimerHistoire } from "@/server/histoires";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { journalErreur } from "@/server/journal";
import { ipDe, LIMITES, sousLaLimite } from "@/server/limites";
import { garde } from "@/server/requete";
import { ROUTES } from "@/types/api";

/* Le corps du contrat, l’email vérifié (Email : sa forme, en minuscules) */
const Corps = ROUTES["POST /api/auth/code"].corps.extend({ email: Email });

/** Le code de connexion, envoyé par email. Il ne vaudra que dans ce navigateur (son cookie, posé ici). */
export const POST = route("POST /api/auth/code", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const lu = await lireCorps(req, Corps);
  if (!lu) return erreur("email");
  const { email } = lu;
  /* Le CAPTCHA (src/server/captcha.ts), avant toute limite : un jeton refusé n’use rien, ni à l’adresse ni à l’email */
  const captcha = await jetonRefuse(req, "code");
  if (captcha) return captcha;
  /*
   * Les mêmes limites pour tous : un « trop » ne dit pas si l’email est invité. Par adresse IP ; puis par email canonique
   * (ses alias comptent avec lui) : ses essais ratés du jour, pour l’email, ce navigateur et cette adresse (un code de
   * plus n’y pourrait rien, et ne ferait que consommer un mail ; la limite existe aussi pour un email hors de la liste :
   * essaisEpuises) ; le plafond des mails du jour, pour tous (avant de compter quoi que ce soit à l’email) ; enfin ses
   * codes du jour, de cette adresse puis de partout, et au-delà la réserve qu’un tiers ne prend pas d’une seule adresse
   * (codeAccorde).
   */
  const ip = ipDe(req);
  if (!(await sousLaLimite(`code:ip:${ip}`, LIMITES.codeParIp))) return erreur("trop");
  if (await essaisEpuises(email, await lireNavigateur(), ip)) return erreur("essais");
  if (await mailsDeCodeEpuises()) return erreur("codes");
  if (!(await codeAccorde(email, ip))) return erreur("codes");
  const navigateur = await poserNavigateur();
  const brouillon = await lireBrouillon();
  const invite = peutEntrer(email);
  /*
   * Bêta fermée : la même réponse pour tous (« regarde tes mails »), pour que personne ne puisse savoir si un email est
   * invité. Tout ce qui en dépend se fait après la réponse : elle a le même temps, et un mail qui ne part pas ne la change
   * pas. L’invité reçoit son code. Un email hors de la liste rejoint la liste d’attente, qui lui écrit, et la conv importée
   * sur ce navigateur est effacée : on ne garde rien de quelqu’un qui n’entre pas. Son cookie reste (l’effacer changerait
   * la réponse) : il ne mène plus à rien.
   */
  after(async () => {
    try {
      const code = await preparerCode(email, navigateur, { envoye: invite });
      if (invite) {
        if (code) await envoyerCode(email, code);
        return;
      }
      const conv = await histoireOuverte(null, { brouillon });
      if (conv) await supprimerHistoire(conv.id);
      /* Le mail de la liste suit le même rythme qu’un code : pas un par demande */
      if (code) await inscrire(email, "connexion", { convEffacee: !!conv });
    } catch (e) {
      /* Le message d’une erreur SQL peut contenir l’email : seuls son nom et son code vont au journal, et rien d’elle à l’alerte */
      journalErreur("code de connexion : la demande n’a pas abouti après la réponse", e);
      /* L’invité lit « regarde tes mails » et n’en reçoit aucun : l’équipe le sait */
      if (invite) await alerter("code de connexion non envoyé", ["Le mail du code n’est pas parti.", "Erreur : la base"]);
    }
  });
  return repondre("POST /api/auth/code", { email });
});
