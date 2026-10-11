/*
 * Le mail de la liste d’attente, dans la famille du mail du code (le gabarit commun : marque.ts, gabaritMail). La
 * connexion répond pareil à tous (« regarde tes mails ») : c’est ce mail qui dit à un email hors de la bêta qu’il est
 * sur la liste, et lui seul le lit. L’inscription a pu venir de quelqu’un d’autre : le mail donne de quoi se retirer. Un
 * email déjà invité (inscrit par la page de la liste) apprend que sa place est prête.
 */
import { attribut, DOUX, ENCRE, gabaritMail, GRIS, POLICE, type MailDessine } from "./marque";

/**
 * `place` : « liste » (sur la liste d’attente) ou « prete » (déjà invité). `retrait` : le lien pour se retirer de la liste.
 * `convEffacee` : la conv importée sur ce navigateur n’a pas été gardée.
 */
export function mailAttente({ base, place, retrait, convEffacee = false }: { base: string; place: "liste" | "prete"; retrait: string; convEffacee?: boolean }): MailDessine {
  const liste = place === "liste";
  const sujet = liste ? "Tu es sur la liste de BLUSH" : "Ta place BLUSH est prête";
  const titre = liste ? "Tu es sur la liste." : "Ta place est prête.";
  const corps = liste
    ? "BLUSH est en bêta privée, sur invitation. Ton email est sur la liste d’attente\u00a0: on t’écrit dès que ta place est prête."
    : "Ton email est déjà invité\u00a0: entre sur BLUSH avec cet email, et fais-lui lire votre conv.";
  const conv = liste && convEffacee ? "La conv que tu viens d’importer n’a pas été gardée. Tu la renverras ce jour-là." : null;
  const texte = [
    titre,
    corps,
    ...(conv ? [conv] : []),
    ...(liste ? [`Ce n’est pas toi\u00a0? Retire ton email de la liste\u00a0: ${retrait}`] : [base, "Ce n’est pas toi\u00a0? Ignore ce mail."]),
  ].join("\n\n");
  const html = gabaritMail({
    base,
    titre: sujet,
    apercu: liste ? "BLUSH est en bêta privée. On t’écrit dès que ta place est prête." : "Ton email est déjà invité.",
    sombre: [".doux { color: #B9B6AF !important; }", ".bouton { background: #F4F2ED !important; }", ".bouton a { color: #121214 !important; }"],
    carte: {
      style: "padding:40px 28px 36px;text-align:center;",
      contenu: `
            <div class="encre" style="font-family:${POLICE};font-size:30px;line-height:36px;font-weight:900;letter-spacing:-0.02em;color:${ENCRE};">${titre}</div>
            <div class="doux" style="padding-top:10px;font-family:${POLICE};font-size:16px;line-height:23px;font-weight:700;color:${DOUX};">${corps}</div>${
              conv ? `\n            <div class="doux" style="padding-top:14px;font-family:${POLICE};font-size:14px;line-height:20px;font-weight:800;color:${GRIS};">${conv}</div>` : ""
            }${
              liste
                ? ""
                : `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
              <tr>
                <td class="bouton" align="center" style="background:${ENCRE};border-radius:30px;">
                  <a href="${attribut(base)}" style="display:block;padding:18px 24px;font-family:${POLICE};font-size:17px;line-height:22px;font-weight:900;color:#FFFFFF;text-decoration:none;">Ouvrir BLUSH&nbsp;&nbsp;→</a>
                </td>
              </tr>
            </table>`
            }`,
    },
    pied: {
      classe: "doux",
      contenu: liste ? `Ce n’est pas toi&nbsp;? <a href="${attribut(retrait)}" class="doux" style="color:${GRIS};font-weight:900;">Retire ton email de la liste</a>.` : "Ce n’est pas toi&nbsp;? Ignore ce mail.",
    },
  });
  return { sujet, texte, html };
}
