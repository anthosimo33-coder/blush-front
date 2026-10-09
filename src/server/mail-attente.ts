/*
 * Le mail de la liste d’attente, dans la famille du mail du code : la bulle, la carte blanche. La connexion répond pareil
 * à tous (« regarde tes mails ») : c’est ce mail qui dit à un email hors de la bêta qu’il est sur la liste, et lui seul
 * le lit. L’inscription a pu venir de quelqu’un d’autre : le mail donne de quoi se retirer. Un email déjà invité
 * (inscrit par la page de la liste) apprend que sa place est prête. En tableaux et en styles en ligne.
 */

const POLICE = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const ENCRE = "#121214";
const DOUX = "#4B4A47";
const GRIS = "#6B6862";
const PAPIER = "#F4F2ED";

export type MailAttente = { sujet: string; texte: string; html: string };

const attribut = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * `place` : « liste » (sur la liste d’attente) ou « prete » (déjà invité). `retrait` : le lien pour se retirer de la liste.
 * `convEffacee` : la conv importée sur ce navigateur n’a pas été gardée.
 */
export function mailAttente({ base, place, retrait, convEffacee = false }: { base: string; place: "liste" | "prete"; retrait: string; convEffacee?: boolean }): MailAttente {
  const liste = place === "liste";
  const sujet = liste ? "Tu es sur la liste de BLUSH" : "Ta place BLUSH est prête";
  const titre = liste ? "Tu es sur la liste." : "Ta place est prête.";
  const corps = liste
    ? "BLUSH est en bêta privée, sur invitation. Ton email est sur la liste d’attente : on t’écrit dès que ta place est prête."
    : "Ton email est déjà invité : entre sur BLUSH avec cet email, et fais-lui lire votre conv.";
  const conv = liste && convEffacee ? "La conv que tu viens d’importer n’a pas été gardée. Tu la renverras ce jour-là." : null;
  const texte = [
    titre,
    corps,
    ...(conv ? [conv] : []),
    ...(liste ? [`Ce n’est pas toi ? Retire ton email de la liste : ${retrait}`] : [base, "Ce n’est pas toi ? Ignore ce mail."]),
  ].join("\n\n");
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${sujet}</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin: 0; padding: 0; }
  @media (prefers-color-scheme: dark) {
    body, .papier { background: #0E0E10 !important; }
    .carte { background: #1C1C1F !important; border-color: #2C2C30 !important; }
    .encre { color: #F4F2ED !important; }
    .doux { color: #B9B6AF !important; }
    .bouton { background: #F4F2ED !important; }
    .bouton a { color: #121214 !important; }
  }
</style>
</head>
<body class="papier" style="margin:0;padding:0;background:${PAPIER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${liste ? "BLUSH est en bêta privée. On t’écrit dès que ta place est prête." : "Ton email est déjà invité."}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
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
            }
          </td>
        </tr>
        <tr>
          <td align="center" class="doux" style="padding:24px 12px 0;font-family:${POLICE};font-size:13px;line-height:19px;font-weight:700;color:${GRIS};">
            ${liste ? `Ce n’est pas toi ? <a href="${attribut(retrait)}" class="doux" style="color:${GRIS};font-weight:900;">Retire ton email de la liste</a>.` : "Ce n’est pas toi ? Ignore ce mail."}<br>
            <a href="${attribut(base)}" class="doux" style="color:${GRIS};text-decoration:none;font-weight:900;">askblush.com</a>
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
