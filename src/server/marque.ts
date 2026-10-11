/*
 * La marque BLUSH, écrite une fois pour ce que le serveur dessine lui-même : ses mails (le code, la liste d’attente,
 * « ton rapport est prêt ») et ses images de partage (src/server/carte-verdict.tsx, src/server/carte-partage.tsx). Les
 * couleurs, la police, l’adresse affichée, et le gabarit commun des mails : le papier, la bulle et « blush » en tête, la
 * carte blanche, le pied, la version sombre pour Apple Mail. Et la teinte des barres du navigateur (themeColor des
 * métadonnées), que le CSS ne donne pas. Les écrans de l’appli ont leurs tokens (src/app/globals.css) : une couleur qui
 * en a un s’écrit ici en hex, et seulement ici (la règle couleur-en-jeton d’eslint.config.mjs).
 * Sans server-only : l’aperçu des mails (/apercu/mail) et les tests le lisent aussi.
 */

/** La police des mails : Nunito quand le client la charge, sinon celle du système (Gmail ignore la police déclarée). */
export const POLICE = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
/** L’encre : les titres, les boutons. */
export const ENCRE = "#121214";
/** Le texte courant, plus doux que l’encre. */
export const DOUX = "#4B4A47";
/** Les petites lignes : le pied, les mentions. */
export const GRIS = "#6B6862";
/** Le papier crème, le fond de tout ce que BLUSH dessine. */
export const PAPIER = "#F4F2ED";
/** Le rose de BLUSH (le liseré du code, comme le champ au focus). */
export const ROSE = "#FF4F9A";
/* Le dégradé des bulles de BLUSH, du clair au foncé (160°) : DEGRADE_ROSE */
const ROSE_CLAIR = "#FF9BCB";
const ROSE_FONCE = "#E8358A";
/** Les traits fins d’une carte (le sommaire du mail du rapport). */
export const TRAIT = "#EFEDE8";
/** Le bleu des bulles envoyées (la tienne). */
export const BLEU = "#1A66DB";
/** Le dégradé des bulles de BLUSH, tel que les mails et les images l’écrivent. */
export const DEGRADE_ROSE = `linear-gradient(160deg,${ROSE_CLAIR},${ROSE_FONCE})`;
/** Le fond des images : le papier crème, sa lueur blanche en haut, rose et bleue dans les coins du bas. */
export const FOND_IMAGE = `radial-gradient(70% 55% at 50% 0%, #FFFFFF 0%, rgba(255,255,255,0) 70%), radial-gradient(45% 40% at 100% 100%, rgba(255,79,154,0.16), rgba(255,79,154,0) 70%), radial-gradient(45% 40% at 0% 100%, rgba(61,139,255,0.12), rgba(61,139,255,0) 70%), ${PAPIER}`;
/** Le texte doux des mails en mode sombre (Apple Mail). */
export const DOUX_SOMBRE = "#B9B6AF";
/** L’adresse du site telle qu’on l’écrit (c’est elle qu’on retient). */
export const SITE_AFFICHE = "askblush.com";

/** Un mail : son sujet, sa version texte, et sa version HTML (une alerte de l’équipe n’en a pas). */
export type Mail = { sujet: string; texte: string; html?: string };
/** Un mail dessiné par le gabarit : il a toujours sa version HTML. */
export type MailDessine = Required<Mail>;

/** Une valeur d’attribut HTML (un lien) : ses `&` et ses guillemets échappés. */
export const attribut = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Les règles du mode sombre du bouton noir d’un mail (boutonMail) : il passe au papier, son texte à l’encre. */
export const BOUTON_SOMBRE = [`.bouton { background: ${PAPIER} !important; }`, `.bouton a { color: ${ENCRE} !important; }`];

/**
 * Le bouton noir d’un mail, sur toute la largeur de la carte : `lien` (échappé ici), `libelle` (du HTML) et `marge`, sa
 * marge au-dessus. Ses règles du mode sombre sont BOUTON_SOMBRE.
 */
export function boutonMail({ lien, libelle, marge }: { lien: string; libelle: string; marge: number }): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:${marge}px;">
              <tr>
                <td class="bouton" align="center" style="background:${ENCRE};border-radius:30px;">
                  <a href="${attribut(lien)}" style="display:block;padding:18px 24px;font-family:${POLICE};font-size:17px;line-height:22px;font-weight:900;color:#FFFFFF;text-decoration:none;">${libelle}</a>
                </td>
              </tr>
            </table>`;
}

/* Ce qui suit l’aperçu (le préheader) : des blancs invisibles, pour que le client n’y colle pas le début du mail */
const BLANCS = "&#8199;&#65279;&#847;";

/**
 * La page HTML d’un mail BLUSH, en tableaux et en styles en ligne : ce que tous les mails lisent.
 * - `base` : l’adresse du site, d’où vient l’image de la bulle (https://www.askblush.com en production) ;
 * - `titre` : le titre de la page ; `apercu` : la ligne que la boîte montre sous le sujet, suivie de `blancs` (4) ;
 * - `sombre` : les règles du mode sombre propres à ce mail, après celles du papier, de la carte et de l’encre ;
 * - `carte` : le contenu de la carte blanche, et son `style` (son retrait, l’alignement du texte) ;
 * - `pied` : la ligne sous la carte, au-dessus du lien du site, dans sa classe (`doux` ou `gris`).
 */
export function gabaritMail({
  base,
  titre,
  apercu,
  blancs = 4,
  sombre,
  carte,
  pied,
}: {
  base: string;
  titre: string;
  apercu: string;
  blancs?: number;
  sombre: string[];
  carte: { style: string; contenu: string };
  pied: { classe: "doux" | "gris"; contenu: string };
}): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${titre}</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body { margin: 0; padding: 0; }
  @media (prefers-color-scheme: dark) {
    body, .papier { background: #0E0E10 !important; }
    .carte { background: #1C1C1F !important; border-color: #2C2C30 !important; }
    .encre { color: ${PAPIER} !important; }
${sombre.map((regle) => `    ${regle}\n`).join("")}  }
</style>
</head>
<body class="papier" style="margin:0;padding:0;background:${PAPIER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${apercu}${BLANCS.repeat(blancs)}</div>
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
          <td class="carte" style="background:#FFFFFF;border:1px solid #ECE9E3;border-radius:28px;${carte.style}">${carte.contenu}
          </td>
        </tr>
        <tr>
          <td align="center" class="${pied.classe}" style="padding:24px 12px 0;font-family:${POLICE};font-size:13px;line-height:19px;font-weight:700;color:${GRIS};">
            ${pied.contenu}<br>
            <a href="${attribut(base)}" class="${pied.classe}" style="color:${GRIS};text-decoration:none;font-weight:900;">${SITE_AFFICHE}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
