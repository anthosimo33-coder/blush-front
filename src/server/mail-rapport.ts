/*
 * Le mail « ton rapport est prêt », dans la famille du mail du code : la bulle, la carte blanche, et BLUSH qui
 * parle en bulles roses, comme sur la landing. Rien de la conv : ni prénom, ni verdict, ni message (le mail
 * peut s’afficher sur l’écran verrouillé). En mode sobre, pas de vanne. En tableaux et en styles en ligne.
 * ⚠ Textes à valider.
 */

const POLICE = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const ENCRE = "#121214";
const DOUX = "#4B4A47";
const GRIS = "#6B6862";
const PAPIER = "#F4F2ED";

export type MailRapport = { sujet: string; texte: string; html: string };

/** `lien` : l’adresse qui ouvre ce rapport ; `autre` : le pronom de l’autre (le chapitre 5 s’appelle « Elle » ou « Lui »). */
export function mailRapport({ base, lien, chapitres, lecture, autre, sobre }: { base: string; lien: string; chapitres: number; lecture: string; autre: "il" | "elle"; sobre: boolean }): MailRapport {
  const n = String(chapitres);
  const sujet = sobre ? "Ton rapport BLUSH est prêt" : "📖 Ton rapport BLUSH est prêt";
  const resume = sobre ? "Prends le temps de le lire au calme." : `${n} chapitres, ${lecture} de lecture. J’ai pas été tendre.`;
  const texte = sobre
    ? `Ton rapport est prêt.\n\nIl est court, et il t’aide à y voir clair. Prends le temps de le lire au calme :\n${lien}\n\nCe mail ne contient rien de ta conv.`
    : `Ton rapport est prêt : ${n} chapitres, ${lecture} de lecture.\n\nLe verdict, la bascule, ce qui coince, ton portrait sans filtre, et ton prochain pas :\n${lien}\n\nCe mail ne contient rien de ta conv : ni prénom, ni message.`;

  const bulle = (t: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;"><tr><td style="background-color:#F0479A;background-image:linear-gradient(160deg,#FF9BCB,#E8358A);border-radius:20px 20px 20px 6px;padding:9px 16px 11px;font-family:${POLICE};font-size:16px;line-height:20px;font-weight:900;color:#FFFFFF;">${t}</td></tr></table>`;

  const titres = ["Le verdict", "La bascule", "Votre histoire", "Ce qui coince", autre === "elle" ? "Elle" : "Lui", "Toi", "Votre duo", "Ton prochain pas"];
  const chapitre = (k: number) =>
    `<td width="50%" style="padding:6px 0;vertical-align:middle;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" style="width:26px;vertical-align:middle;"><div class="pastille" style="width:26px;height:26px;background:${ENCRE};border-radius:13px;text-align:center;font-family:${POLICE};font-size:12px;line-height:26px;font-weight:900;color:#FFFFFF;">${k + 1}</div></td><td class="encre" style="padding-left:10px;vertical-align:middle;font-family:${POLICE};font-size:15px;line-height:19px;font-weight:800;color:${ENCRE};">${titres[k]}</td></tr></table></td>`;
  const sommaire = [0, 2, 4, 6].map((k) => `<tr>${chapitre(k)}${chapitre(k + 1)}</tr>`).join("");

  const corps = sobre
    ? `${bulle("j’ai fini de lire.")}
            <div class="encre" style="padding-top:18px;font-family:${POLICE};font-size:32px;line-height:37px;font-weight:900;letter-spacing:-0.025em;color:${ENCRE};">Ton rapport<br>est prêt.</div>
            <div class="doux" style="padding-top:10px;font-family:${POLICE};font-size:16px;line-height:24px;font-weight:700;color:${DOUX};">Il est court, et il t’aide à y voir clair. Prends le temps de le lire au&nbsp;calme.</div>`
    : `${bulle("j’ai fini ton rapport 📖")}${bulle(`${n} chapitres. j’ai pas été tendre 😏`)}
            <div class="encre" style="padding-top:18px;font-family:${POLICE};font-size:32px;line-height:37px;font-weight:900;letter-spacing:-0.025em;color:${ENCRE};">Ton rapport<br>est prêt.</div>
            <div class="doux" style="padding-top:10px;font-family:${POLICE};font-size:16px;line-height:24px;font-weight:700;color:${DOUX};">Le verdict, la bascule, ce qui coince, ton portrait sans filtre, et ton prochain&nbsp;pas.</div>
            <table role="presentation" class="sommaire" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border-top:1px solid #EFEDE8;border-bottom:1px solid #EFEDE8;padding:10px 0;">${sommaire}</table>
            <div class="gris" style="padding-top:12px;font-family:${POLICE};font-size:13px;line-height:18px;font-weight:800;color:${GRIS};">${n}&nbsp;chapitres · ${lecture.replace(" ", "&nbsp;")} de lecture</div>`;

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Ton rapport BLUSH est prêt</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin: 0; padding: 0; }
  @media (prefers-color-scheme: dark) {
    body, .papier { background: #0E0E10 !important; }
    .carte { background: #1C1C1F !important; border-color: #2C2C30 !important; }
    .encre { color: #F4F2ED !important; }
    .doux, .gris { color: #B9B6AF !important; }
    .pastille { background: #F4F2ED !important; color: #121214 !important; }
    .sommaire { border-color: #2C2C30 !important; }
    .bouton { background: #F4F2ED !important; }
    .bouton a { color: #121214 !important; }
  }
</style>
</head>
<body class="papier" style="margin:0;padding:0;background:${PAPIER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${resume}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
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
          <td class="carte" style="background:#FFFFFF;border:1px solid #ECE9E3;border-radius:28px;padding:32px 28px 30px;text-align:left;">
            ${corps}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
              <tr>
                <td class="bouton" align="center" style="background:${ENCRE};border-radius:30px;">
                  <a href="${lien}" style="display:block;padding:18px 24px;font-family:${POLICE};font-size:17px;line-height:22px;font-weight:900;color:#FFFFFF;text-decoration:none;">Lire mon rapport&nbsp;&nbsp;→</a>
                </td>
              </tr>
            </table>
            <div class="gris" style="padding-top:14px;text-align:center;font-family:${POLICE};font-size:13px;line-height:19px;font-weight:800;color:${GRIS};">${sobre ? "BLUSH reste là si tu veux en parler." : "Ensuite, parle à BLUSH&nbsp;: il connaît toute votre&nbsp;histoire."}</div>
          </td>
        </tr>
        <tr>
          <td align="center" class="gris" style="padding:24px 12px 0;font-family:${POLICE};font-size:13px;line-height:19px;font-weight:700;color:${GRIS};">
            Ce mail ne contient rien de ta conv&nbsp;: ni prénom, ni&nbsp;message.<br>
            <a href="${base}" class="gris" style="color:${GRIS};text-decoration:none;font-weight:900;">askblush.com</a>
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
