/*
 * Le mail du code de connexion, aux couleurs de BLUSH : la bulle, le code dans un liseré rose (comme le champ
 * au focus), une version sombre pour Apple Mail. Le gabarit commun des mails est dans marque.ts (gabaritMail).
 * Gmail ignore la police et le mode sombre déclarés : il retombe sur une police système et ses propres couleurs.
 * Textes validés le 8 octobre.
 */
import { CODE_MINUTES } from "@/lib/limites";
import { DOUX, ENCRE, gabaritMail, GRIS, POLICE, ROSE, type MailDessine } from "./marque";

/**
 * `base` : l’adresse du site, d’où vient l’image de la bulle (https://www.askblush.com en production). `minutes` : la
 * durée de vie du code, celle de tous les codes (CODE_MINUTES) par défaut.
 */
export function mailCode(code: string, base: string, minutes = CODE_MINUTES): MailDessine {
  const c = code.replace(/\D/g, "").slice(0, 6);
  /* Le code ne vaut que dans le navigateur qui l’a demandé (S-08) : le mail le dit, tapé ailleurs il échouerait sans explication */
  const sujet = `${c}\u00a0: ton code BLUSH`;
  const texte = `Ton code BLUSH\u00a0: ${c}\n\nTape-le dans BLUSH, sur l’appareil où tu l’as demandé. Il marche ${minutes} minutes. Si tu n’as rien demandé, ignore ce message\u00a0: sans ce code, personne n’entre.`;
  const html = gabaritMail({
    base,
    titre: "Ton code BLUSH",
    apercu: `Ton code BLUSH&nbsp;: ${c}. Il marche ${minutes} minutes.`,
    sombre: [".doux { color: #B9B6AF !important; }", ".code { background: #2B0F1F !important; }"],
    carte: {
      style: "padding:40px 28px 36px;text-align:center;",
      contenu: `
            <div class="encre" style="font-family:${POLICE};font-size:30px;line-height:36px;font-weight:900;letter-spacing:-0.02em;color:${ENCRE};">Ton code</div>
            <div class="doux" style="padding-top:10px;font-family:${POLICE};font-size:16px;line-height:23px;font-weight:700;color:${DOUX};">Tape-le dans BLUSH pour retrouver ton&nbsp;histoire.</div>
            <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 0;">
              <tr>
                <td class="code" style="background:#FFF1F7;border:2px solid ${ROSE};border-radius:20px;padding:16px 22px 16px 34px;">
                  <span class="encre" style="font-family:${POLICE};font-size:42px;line-height:48px;font-weight:900;letter-spacing:12px;color:${ENCRE};font-variant-numeric:tabular-nums;">${c}</span>
                </td>
              </tr>
            </table>
            <div class="doux" style="padding-top:18px;font-family:${POLICE};font-size:14px;line-height:20px;font-weight:800;color:${GRIS};">Tape-le dans BLUSH, sur l’appareil où tu l’as demandé.<br>Il marche ${minutes} minutes.</div>`,
    },
    pied: { classe: "doux", contenu: "Ce n’est pas toi&nbsp;? Ignore ce mail&nbsp;: sans ce code, personne n’entre." },
  });
  return { sujet, texte, html };
}
