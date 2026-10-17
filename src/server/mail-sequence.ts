import type { MailDeSequence } from "@/contenu/mails";
import { DESINSCRIPTION } from "@/contenu/mails";
import { attribut, BOUTON_SOMBRE, boutonMail, DEGRADE_ROSE, DOUX, DOUX_SOMBRE, ENCRE, gabaritMail, GRIS, PAPIER, POLICE, TRAIT, type MailDessine } from "./marque";

/*
 * Le gabarit des mails des séquences (src/server/sequences.ts, leurs textes dans src/contenu/mails.ts) : la famille du
 * mail « ton rapport est prêt » (marque.ts, gabaritMail). BLUSH parle en bulles roses, puis ce que chaque mail ajoute
 * (un exemple d’échange, le prochain pas sur fond noir, la réponse prête dessinée floue, leurs niveaux, des idées en
 * pastilles, des lignes de sa fiche), un titre, son texte, une offre ou un encart gris, un à trois boutons à une touche,
 * et la désinscription de ce genre de mail en pied. Les prénoms ne sont que
 * dans le HTML : le sujet, l’aperçu et le texte brut n’en disent aucun.
 */

/** Un texte des séquences (un prénom, le prochain pas du verdict) dans le HTML du mail. */
export const enHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u00a0/g, "&nbsp;");

/** Une bulle rose de BLUSH, comme sur la landing. */
export const bulleMail = (t: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;"><tr><td style="background-color:#F0479A;background-image:${DEGRADE_ROSE};border-radius:20px 20px 20px 6px;padding:9px 16px 11px;font-family:${POLICE};font-size:16px;line-height:20px;font-weight:900;color:#FFFFFF;">${enHtml(t)}</td></tr></table>`;

/** Une bulle de l’échange : la sienne à gauche (grise), les tiennes à droite (noires ; barrée, celle à éviter). */
const bulleEchange = (t: string, cote: "recu" | "non" | "oui") => {
  const droite = cote !== "recu";
  const fond = cote === "recu" ? PAPIER : ENCRE;
  const encre = cote === "recu" ? ENCRE : "#FFFFFF";
  const barre = cote === "non" ? "text-decoration:line-through;opacity:0.45;" : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;"><tr><td align="${droite ? "right" : "left"}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="${cote === "recu" ? "echange-recu" : "echange-moi"}" style="background:${fond};border-radius:${droite ? "18px 18px 6px 18px" : "18px 18px 18px 6px"};padding:8px 14px 9px;font-family:${POLICE};font-size:15px;line-height:19px;font-weight:800;color:${encre};${barre}">${enHtml(t)}</td></tr></table></td></tr></table>`;
};

/** Les liens d’un mail des séquences : chacun de ses boutons, et sa désinscription. */
export type LiensDuMail = { boutons: string[]; desinscription: { lien: string; quoi: keyof typeof DESINSCRIPTION } };

/** Le mail dessiné : ses textes (src/contenu/mails.ts) et ses liens. Le texte brut redit les liens, sans prénom. */
export function mailDeSequence(m: MailDeSequence, { base, liens }: { base: string; liens: LiensDuMail }): MailDessine {
  const desinscription = m.desinscription ?? DESINSCRIPTION[liens.desinscription.quoi];
  const texte = [
    m.texte,
    ...m.boutons.map((b, k) => `${b.libelle}\u00a0: ${liens.boutons[k] ?? liens.boutons[0]}`),
    ...(m.pied ? [m.pied] : []),
    `${desinscription}\u00a0? ${liens.desinscription.lien}`,
  ].join("\n\n");

  const exemple = m.exemple
    ? `<div style="padding-top:16px;">${bulleEchange(m.exemple.recu, "recu")}${bulleEchange(m.exemple.non, "non")}<div class="gris" style="padding:4px 0 8px;text-align:right;font-family:${POLICE};font-size:13px;line-height:18px;font-weight:900;color:${GRIS};">${enHtml(m.exemple.conseil)}</div>${bulleEchange(m.exemple.oui, "oui")}</div>`
    : "";
  const pas = m.pas
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td class="pas" style="background:${ENCRE};border-radius:18px;padding:16px 18px;"><div style="font-family:${POLICE};font-size:12px;line-height:16px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:#FF8CC0;">Ton prochain pas</div><div style="padding-top:6px;font-family:${POLICE};font-size:17px;line-height:23px;font-weight:900;color:#FFFFFF;">${enHtml(m.pas)}</div></td></tr></table>`
    : "";
  /* Un dessin, jamais la réponse : des barres grises sous un voile, et son étiquette */
  const floue = m.floue
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td class="encart" style="background:${PAPIER};border-radius:18px;padding:16px 18px;"><div class="gris" style="font-family:${POLICE};font-size:12px;line-height:16px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:${GRIS};">${enHtml(m.floue)}</div>${[92, 78, 54].map((l) => `<div style="margin-top:9px;height:12px;width:${l}%;border-radius:6px;background:#D9D5CD;opacity:0.8;"></div>`).join("")}<div style="padding-top:12px;font-family:${POLICE};font-size:20px;line-height:20px;">🔒</div></td></tr></table>`
    : "";
  const encart = m.encart
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;"><tr><td class="encart" style="background:${PAPIER};border-radius:16px;padding:14px 16px;"><div class="encre" style="font-family:${POLICE};font-size:15px;line-height:20px;font-weight:900;color:${ENCRE};">${enHtml(m.encart.gras)}</div><div class="doux" style="padding-top:4px;font-family:${POLICE};font-size:14px;line-height:20px;font-weight:700;color:${DOUX};">${enHtml(m.encart.ligne)}</div></td></tr></table>`
    : "";
  /* Leurs niveaux : une ligne chacun, une pastille (franchi ✓, le leur en rose, les suivants numérotés), le leur dit par son étiquette */
  const niveaux = m.niveaux
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">${m.niveaux.noms
        .map((nom, k) => {
          const { ici, etapes, etiquette } = m.niveaux!;
          const franchi = etapes && k < ici;
          const fond = k === ici ? "#F0479A" : franchi ? ENCRE : TRAIT;
          const marque = franchi ? "✓" : String(k + 1);
          return `<tr><td width="30" style="width:30px;padding:5px 0;vertical-align:middle;"><div class="${k === ici || franchi ? "" : "pastille-vide"}" style="width:26px;height:26px;border-radius:13px;background:${fond};text-align:center;font-family:${POLICE};font-size:12px;line-height:26px;font-weight:900;color:${k === ici || franchi ? "#FFFFFF" : GRIS};">${marque}</div></td><td class="${k === ici ? "encre" : "doux"}" style="padding:5px 0 5px 8px;vertical-align:middle;font-family:${POLICE};font-size:15px;line-height:19px;font-weight:${k === ici ? 900 : 800};color:${k === ici ? ENCRE : DOUX};">${enHtml(nom)}${k === ici ? ` <span style="font-size:12px;font-weight:900;color:#F0479A;">· ${enHtml(etiquette)}</span>` : ""}</td></tr>`;
        })
        .join("")}</table>`
    : "";
  const puces = m.puces
    ? `<div style="padding-top:14px;">${m.puces.map((t) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;"><tr><td class="encart" style="background:${PAPIER};border-radius:14px;padding:8px 14px;font-family:${POLICE};font-size:15px;line-height:19px;font-weight:800;color:${ENCRE};">${enHtml(t)}</td></tr></table>`).join("")}</div>`
    : "";
  /* Une offre : le prix en grand, le prix barré, la remise en rose, ce qu’elle comprend, et jusqu’à quand */
  const offre = m.offre
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;"><tr><td class="encart" style="background:${PAPIER};border-radius:18px;padding:16px 18px;"><div style="font-family:${POLICE};line-height:34px;"><span class="encre" style="font-size:30px;font-weight:900;color:${ENCRE};">${enHtml(m.offre.prix)}</span>&nbsp;&nbsp;<s class="gris" style="font-size:17px;font-weight:800;color:${GRIS};">${enHtml(m.offre.barre)}</s>&nbsp;&nbsp;<span style="font-size:13px;font-weight:900;color:#FFFFFF;background:#F0479A;border-radius:10px;padding:3px 8px;">${enHtml(m.offre.remise)}</span></div><div class="doux" style="padding-top:4px;font-family:${POLICE};font-size:14px;line-height:20px;font-weight:700;color:${DOUX};">${enHtml(m.offre.inclus)}</div><div class="filet" style="margin-top:12px;padding-top:12px;border-top:1px solid ${TRAIT};font-family:${POLICE};font-size:14px;line-height:20px;"><b class="encre" style="font-weight:900;color:${ENCRE};">${enHtml(m.offre.jusqua)}</b><br><span class="gris" style="font-weight:700;color:${GRIS};">${enHtml(m.offre.sous)}</span></div></td></tr></table>`
    : "";
  /* Des lignes de sa fiche : la rubrique en petit, puis son texte */
  const fiche = m.fiche
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td class="encart" style="background:${PAPIER};border-radius:18px;padding:6px 18px;">${m.fiche
        .map(
          (l, k) =>
            `<div class="${k ? "filet" : ""}" style="padding:10px 0;${k ? `border-top:1px solid ${TRAIT};` : ""}"><div class="gris" style="font-family:${POLICE};font-size:12px;line-height:16px;font-weight:900;letter-spacing:0.06em;text-transform:uppercase;color:${GRIS};">${enHtml(l.rubrique)}</div><div class="encre" style="padding-top:3px;font-family:${POLICE};font-size:15px;line-height:20px;font-weight:900;color:${ENCRE};">${enHtml(l.texte)}</div></div>`,
        )
        .join("")}</td></tr></table>`
    : "";
  /* Un bouton au trait : le second (ou les suivants) de ceux à une touche */
  const auTrait = (b: { libelle: string }, lien: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="bouton-trait" align="center" style="background:#FFFFFF;border:2px solid ${ENCRE};border-radius:30px;"><a href="${attribut(lien)}" style="display:block;padding:14px 10px;font-family:${POLICE};font-size:16px;line-height:20px;font-weight:900;color:${ENCRE};text-decoration:none;">${enHtml(b.libelle)}</a></td></tr></table>`;
  /* Deux boutons à une touche : côte à côte, le premier plein, le second au trait ; trois : l’un sous l’autre */
  const boutons =
    m.boutons.length > 2
      ? `${boutonMail({ lien: liens.boutons[0]!, libelle: enHtml(m.boutons[0]!.libelle), marge: 24 })}${m.boutons
          .slice(1)
          .map((b, k) => `<div style="padding-top:8px;">${auTrait(b, liens.boutons[k + 1] ?? liens.boutons[0]!)}</div>`)
          .join("")}`
      : m.boutons.length > 1
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr>${m.boutons
            .map((b, k) => {
              const plein = k === 0;
              return `<td width="50%" style="padding:0 ${plein ? 5 : 0}px 0 ${plein ? 0 : 5}px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="${plein ? "bouton" : "bouton-trait"}" align="center" style="background:${plein ? ENCRE : "#FFFFFF"};border:2px solid ${ENCRE};border-radius:30px;"><a href="${attribut(liens.boutons[k] ?? liens.boutons[0]!)}" style="display:block;padding:16px 10px;font-family:${POLICE};font-size:16px;line-height:20px;font-weight:900;color:${plein ? "#FFFFFF" : ENCRE};text-decoration:none;">${enHtml(b.libelle)}</a></td></tr></table></td>`;
            })
            .join("")}</tr></table>`
        : boutonMail({ lien: liens.boutons[0]!, libelle: `${enHtml(m.boutons[0]!.libelle)}&nbsp;&nbsp;→`, marge: 24 });

  const html = gabaritMail({
    base,
    titre: m.sujet,
    apercu: enHtml(m.apercu),
    sombre: [
      `.doux, .gris { color: ${DOUX_SOMBRE} !important; }`,
      `.encart, .echange-recu { background: #232326 !important; color: ${PAPIER} !important; }`,
      `.pas { background: #000000 !important; border: 1px solid #2C2C30 !important; }`,
      `.bouton-trait { background: transparent !important; border-color: ${PAPIER} !important; }`,
      `.bouton-trait a { color: ${PAPIER} !important; }`,
      `.pastille-vide { background: #2C2C30 !important; }`,
      ".filet { border-color: #2C2C30 !important; }",
      ...BOUTON_SOMBRE,
    ],
    carte: {
      style: "padding:32px 28px 30px;text-align:left;",
      contenu: `
            ${m.bulles.map(bulleMail).join("")}
            ${exemple}${pas}${floue}${niveaux}${puces}${fiche}
            ${m.titre ? `<div class="encre" style="padding-top:20px;font-family:${POLICE};font-size:30px;line-height:35px;font-weight:900;letter-spacing:-0.025em;color:${ENCRE};">${enHtml(m.titre)}</div>` : ""}
            ${m.corps ? `<div class="doux" style="padding-top:10px;font-family:${POLICE};font-size:16px;line-height:24px;font-weight:700;color:${DOUX};">${enHtml(m.corps)}</div>` : ""}
            ${offre}${encart}
            ${boutons}
            ${m.mini ? `<div class="gris" style="padding-top:12px;text-align:center;font-family:${POLICE};font-size:13px;line-height:19px;font-weight:800;color:${GRIS};">${enHtml(m.mini)}</div>` : ""}
            ${m.ps ? `<div class="doux filet" style="margin-top:22px;padding-top:16px;border-top:1px solid ${TRAIT};font-family:${POLICE};font-size:15px;line-height:22px;font-weight:800;color:${DOUX};">${enHtml(m.ps)}</div>` : ""}`,
    },
    pied: {
      classe: "gris",
      contenu: `${m.pied ? `${enHtml(m.pied)}<br>` : ""}<a href="${attribut(liens.desinscription.lien)}" class="gris" style="color:${GRIS};font-weight:900;">${enHtml(desinscription)}</a>`,
    },
  });
  return { sujet: m.sujet, texte, html };
}
