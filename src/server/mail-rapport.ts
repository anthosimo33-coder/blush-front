import { NB_CHAPITRES, titreDAttente } from "@/contenu/chapitres";
import { mailRapportPret, type Personnes } from "@/contenu/mails";
import { bulleMail, enHtml } from "./mail-sequence";
import { BOUTON_SOMBRE, boutonMail, DOUX, DOUX_SOMBRE, ENCRE, gabaritMail, GRIS, PAPIER, POLICE, TRAIT, type MailDessine } from "./marque";

/*
 * Le mail « ton rapport est prêt » (S3 J0 des séquences, src/contenu/mails.ts), dans la famille du mail du code : la
 * bulle, la carte blanche, et BLUSH qui parle en bulles roses, comme sur la landing, avec son prénom à elle et celui de
 * l’autre. Son sommaire reprend les titres d’attente des chapitres (src/contenu/chapitres.ts), dont le prénom de l’autre
 * (son chapitre), et non ceux que le verdict a écrits pour leur histoire, qui peuvent citer leur conv. Puis les réponses
 * de BLUSH qu’elle a d’avance, selon ce qu’elle a pris (le rapport, ou Premium et sa promesse). Ni verdict ni message.
 * Le sujet, l’aperçu et le texte brut (ce que montre l’écran verrouillé) ne disent aucun prénom. En mode sobre, ni
 * sommaire, ni vanne, ni prénom. Le gabarit commun des mails est dans marque.ts (gabaritMail).
 */

/** `lien` : l’adresse qui ouvre ce rapport ; `personnes` : leurs prénoms et leurs pronoms ; `premium` : elle a pris Premium. */
export function mailRapport({
  base,
  lien,
  chapitres,
  lecture,
  personnes,
  premium,
  sobre,
}: {
  base: string;
  lien: string;
  chapitres: number;
  lecture: string;
  personnes: Personnes;
  premium: boolean;
  sobre: boolean;
}): MailDessine {
  const n = String(chapitres);
  const pret = mailRapportPret(personnes, { chapitres, premium });
  const sujet = sobre ? "Ton rapport BLUSH est prêt" : pret.sujet;
  const resume = sobre ? "Prends le temps de le lire au calme." : `${n} chapitres, ${lecture}. le 4 va piquer un peu.`;
  const texte = sobre
    ? `Ton rapport est prêt.\n\nIl est court, et il t’aide à y voir clair. Prends le temps de le lire au calme\u00a0:\n${lien}\n\nCe mail ne contient rien de ta conv.`
    : `Ton rapport est prêt\u00a0: ${n} chapitres, ${lecture} de lecture.\n\nLe verdict, la bascule, ce qui coince, ton portrait sans filtre, et ton prochain pas\u00a0:\n${lien}\n\nCe mail ne contient aucun message de ta conv, ni le verdict.`;

  /* Le chapitre 5 porte le prénom de l’autre, comme dans le rapport ; sans prénom, « Lui » ou « Elle » */
  const autre = personnes.autre.prenom ?? (personnes.autre.il ? "Lui" : "Elle");
  const chapitre = (numero: number) =>
    `<td width="50%" style="padding:6px 0;vertical-align:middle;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" style="width:26px;vertical-align:middle;"><div class="pastille" style="width:26px;height:26px;background:${ENCRE};border-radius:13px;text-align:center;font-family:${POLICE};font-size:12px;line-height:26px;font-weight:900;color:#FFFFFF;">${numero}</div></td><td class="encre" style="padding-left:10px;vertical-align:middle;font-family:${POLICE};font-size:15px;line-height:19px;font-weight:800;color:${ENCRE};">${enHtml(titreDAttente(numero, autre))}</td></tr></table></td>`;
  /* Le sommaire : tous les chapitres, deux par ligne, sous les titres du rapport */
  const sommaire = Array.from({ length: Math.ceil(NB_CHAPITRES / 2) }, (_, k) => `<tr>${chapitre(2 * k + 1)}${chapitre(2 * k + 2)}</tr>`).join("");

  const corps = sobre
    ? `${bulleMail("j’ai fini de lire.")}
            <div class="encre" style="padding-top:18px;font-family:${POLICE};font-size:32px;line-height:37px;font-weight:900;letter-spacing:-0.025em;color:${ENCRE};">Ton rapport<br>est prêt.</div>
            <div class="doux" style="padding-top:10px;font-family:${POLICE};font-size:16px;line-height:24px;font-weight:700;color:${DOUX};">Il est court, et il t’aide à y voir clair. Prends le temps de le lire au&nbsp;calme.</div>`
    : `${pret.bulles.map(bulleMail).join("")}
            <div class="encre" style="padding-top:18px;font-family:${POLICE};font-size:30px;line-height:35px;font-weight:900;letter-spacing:-0.025em;color:${ENCRE};">${enHtml(pret.titre)}</div>
            <div class="doux" style="padding-top:10px;font-family:${POLICE};font-size:16px;line-height:24px;font-weight:700;color:${DOUX};">Le verdict, la bascule, ce qui coince, ton portrait sans filtre, et ton prochain&nbsp;pas.</div>
            <table role="presentation" class="sommaire" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border-top:1px solid ${TRAIT};border-bottom:1px solid ${TRAIT};padding:10px 0;">${sommaire}</table>
            <div class="gris" style="padding-top:12px;font-family:${POLICE};font-size:13px;line-height:18px;font-weight:800;color:${GRIS};">${n}&nbsp;chapitres · ${lecture.replace(" ", "&nbsp;")} de lecture</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;"><tr><td class="encart" style="background:${PAPIER};border-radius:16px;padding:14px 16px;"><div class="encre" style="font-family:${POLICE};font-size:15px;line-height:20px;font-weight:900;color:${ENCRE};">${enHtml(pret.encart.gras)}</div><div class="doux" style="padding-top:4px;font-family:${POLICE};font-size:14px;line-height:20px;font-weight:700;color:${DOUX};">${enHtml(pret.encart.ligne)}</div></td></tr></table>`;

  const html = gabaritMail({
    base,
    titre: "Ton rapport BLUSH est prêt",
    apercu: resume,
    blancs: 6,
    sombre: [
      `.doux, .gris { color: ${DOUX_SOMBRE} !important; }`,
      `.pastille { background: ${PAPIER} !important; color: ${ENCRE} !important; }`,
      ".sommaire, .filet { border-color: #2C2C30 !important; }",
      `.encart { background: #232326 !important; }`,
      ...BOUTON_SOMBRE,
    ],
    carte: {
      style: "padding:32px 28px 30px;text-align:left;",
      contenu: `
            ${corps}
            ${boutonMail({ lien, libelle: "Lire mon rapport&nbsp;&nbsp;→", marge: 24 })}
            ${
              sobre
                ? `<div class="gris" style="padding-top:14px;text-align:center;font-family:${POLICE};font-size:13px;line-height:19px;font-weight:800;color:${GRIS};">BLUSH reste là si tu veux en parler.</div>`
                : `<div class="doux filet" style="margin-top:22px;padding-top:16px;border-top:1px solid ${TRAIT};font-family:${POLICE};font-size:15px;line-height:22px;font-weight:800;color:${DOUX};">${enHtml(pret.ps)}</div>`
            }`,
    },
    pied: {
      classe: "gris",
      contenu: sobre ? "Ce mail ne contient rien de ta conv&nbsp;: ni prénom, ni&nbsp;message." : "Ce mail ne contient aucun message de ta conv, ni&nbsp;le&nbsp;verdict.",
    },
  });
  return { sujet, texte, html };
}
