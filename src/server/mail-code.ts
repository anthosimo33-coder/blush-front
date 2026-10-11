/*
 * Le mail du code de connexion, aux couleurs de BLUSH : la bulle, le code dans un liseré rose (comme le champ
 * au focus), une version sombre pour Apple Mail. En tableaux et en styles en ligne : ce que tous les mails lisent.
 * Gmail ignore la police et le mode sombre déclarés : il retombe sur une police système et ses propres couleurs.
 * Textes validés le 8 octobre.
 */
import { CODE_MINUTES } from "@/lib/limites";

const POLICE = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const ENCRE = "#121214";
const DOUX = "#4B4A47";
const GRIS = "#6B6862";
const PAPIER = "#F4F2ED";
const ROSE = "#FF4F9A";

export type MailCode = { sujet: string; texte: string; html: string };

/** `base` : l’adresse du site, d’où vient l’image de la bulle (https://www.askblush.com en production). */
export function mailCode(code: string, base: string): MailCode {
  const c = code.replace(/\D/g, "").slice(0, 6);
  /* Le code ne vaut que dans le navigateur qui l’a demandé (S-08) : le mail le dit, tapé ailleurs il échouerait sans explication */
  const sujet = `${c}\u00a0: ton code BLUSH`;
  const texte = `Ton code BLUSH\u00a0: ${c}\n\nTape-le dans BLUSH, sur l’appareil où tu l’as demandé. Il marche ${CODE_MINUTES} minutes. Si tu n’as rien demandé, ignore ce message\u00a0: sans ce code, personne n’entre.`;
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Ton code BLUSH</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin: 0; padding: 0; }
  @media (prefers-color-scheme: dark) {
    body, .papier { background: #0E0E10 !important; }
    .carte { background: #1C1C1F !important; border-color: #2C2C30 !important; }
    .encre { color: #F4F2ED !important; }
    .doux { color: #B9B6AF !important; }
    .code { background: #2B0F1F !important; }
  }
</style>
</head>
<body class="papier" style="margin:0;padding:0;background:${PAPIER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Ton code BLUSH&nbsp;: ${c}. Il marche ${CODE_MINUTES} minutes.&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" class="papier" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPIER};">
  <tr>
    <td align="center" style="padding:40px 16px 48px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td align="center" style="padding:0 0 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:8px;vertical-align:middle;"><img src="${base}/mail/bulle.png" width="40" height="40" alt="" style="display:block;border:0;outline:none;"></td>
                <td class="encre" style="vertical-align:middle;font-family:${POLICE};font-size:26px;font-weight:900;letter-spacing:-0.03em;color:${ENCRE};">blush</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="carte" style="background:#FFFFFF;border:1px solid #ECE9E3;border-radius:28px;padding:40px 28px 36px;text-align:center;">
            <div class="encre" style="font-family:${POLICE};font-size:30px;line-height:36px;font-weight:900;letter-spacing:-0.02em;color:${ENCRE};">Ton code</div>
            <div class="doux" style="padding-top:10px;font-family:${POLICE};font-size:16px;line-height:23px;font-weight:700;color:${DOUX};">Tape-le dans BLUSH pour retrouver ton&nbsp;histoire.</div>
            <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 0;">
              <tr>
                <td class="code" style="background:#FFF1F7;border:2px solid ${ROSE};border-radius:20px;padding:16px 22px 16px 34px;">
                  <span class="encre" style="font-family:${POLICE};font-size:42px;line-height:48px;font-weight:900;letter-spacing:12px;color:${ENCRE};font-variant-numeric:tabular-nums;">${c}</span>
                </td>
              </tr>
            </table>
            <div class="doux" style="padding-top:18px;font-family:${POLICE};font-size:14px;line-height:20px;font-weight:800;color:${GRIS};">Tape-le dans BLUSH, sur l’appareil où tu l’as demandé.<br>Il marche ${CODE_MINUTES} minutes.</div>
          </td>
        </tr>
        <tr>
          <td align="center" class="doux" style="padding:24px 12px 0;font-family:${POLICE};font-size:13px;line-height:19px;font-weight:700;color:${GRIS};">
            Ce n’est pas toi&nbsp;? Ignore ce mail&nbsp;: sans ce code, personne n’entre.<br>
            <a href="${base}" class="doux" style="color:${GRIS};text-decoration:none;font-weight:900;">askblush.com</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
  return { sujet, texte, html };
}
