import { NB_CHAPITRES } from "@/contenu/chapitres";
import { titreAttendu } from "./ecrans/rapport";
import { BOUTON_SOMBRE, boutonMail, DEGRADE_ROSE, DOUX, DOUX_SOMBRE, ENCRE, gabaritMail, GRIS, PAPIER, POLICE, type MailDessine } from "./marque";

/*
 * Le mail « ton rapport est prêt », dans la famille du mail du code : la bulle, la carte blanche, et BLUSH qui
 * parle en bulles roses, comme sur la landing. Son sommaire reprend les titres du rapport (src/contenu/chapitres.ts),
 * dont le prénom de l’autre (son chapitre). Rien d’autre de la conv : ni verdict, ni message. Le sujet, l’aperçu et le
 * texte brut (ce que montre l’écran verrouillé) ne disent aucun prénom. En mode sobre, ni sommaire ni vanne. Le
 * gabarit commun des mails est dans marque.ts (gabaritMail). Textes relus le 8 octobre (voix de BLUSH).
 */

/** Un texte de la conv (un prénom) dans le HTML du mail. */
const enHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `lien` : l’adresse qui ouvre ce rapport ; `autre` : le prénom de l’autre (le titre de son chapitre, comme dans le rapport). */
export function mailRapport({ base, lien, chapitres, lecture, autre, sobre }: { base: string; lien: string; chapitres: number; lecture: string; autre: string; sobre: boolean }): MailDessine {
  const n = String(chapitres);
  const sujet = sobre ? "Ton rapport BLUSH est prêt" : "📖 Ton rapport BLUSH est prêt";
  const resume = sobre ? "Prends le temps de le lire au calme." : `${n} chapitres, ${lecture} de lecture. J’ai pas été tendre.`;
  const texte = sobre
    ? `Ton rapport est prêt.\n\nIl est court, et il t’aide à y voir clair. Prends le temps de le lire au calme\u00a0:\n${lien}\n\nCe mail ne contient rien de ta conv.`
    : `Ton rapport est prêt\u00a0: ${n} chapitres, ${lecture} de lecture.\n\nLe verdict, la bascule, ce qui coince, ton portrait sans filtre, et ton prochain pas\u00a0:\n${lien}\n\nCe mail ne contient aucun message de ta conv, ni le verdict.`;

  const bulle = (t: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;"><tr><td style="background-color:#F0479A;background-image:${DEGRADE_ROSE};border-radius:20px 20px 20px 6px;padding:9px 16px 11px;font-family:${POLICE};font-size:16px;line-height:20px;font-weight:900;color:#FFFFFF;">${t}</td></tr></table>`;

  const chapitre = (numero: number) =>
    `<td width="50%" style="padding:6px 0;vertical-align:middle;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="26" style="width:26px;vertical-align:middle;"><div class="pastille" style="width:26px;height:26px;background:${ENCRE};border-radius:13px;text-align:center;font-family:${POLICE};font-size:12px;line-height:26px;font-weight:900;color:#FFFFFF;">${numero}</div></td><td class="encre" style="padding-left:10px;vertical-align:middle;font-family:${POLICE};font-size:15px;line-height:19px;font-weight:800;color:${ENCRE};">${enHtml(titreAttendu(numero, autre))}</td></tr></table></td>`;
  /* Le sommaire : tous les chapitres, deux par ligne, sous les titres du rapport */
  const sommaire = Array.from({ length: Math.ceil(NB_CHAPITRES / 2) }, (_, k) => `<tr>${chapitre(2 * k + 1)}${chapitre(2 * k + 2)}</tr>`).join("");

  const corps = sobre
    ? `${bulle("j’ai fini de lire.")}
            <div class="encre" style="padding-top:18px;font-family:${POLICE};font-size:32px;line-height:37px;font-weight:900;letter-spacing:-0.025em;color:${ENCRE};">Ton rapport<br>est prêt.</div>
            <div class="doux" style="padding-top:10px;font-family:${POLICE};font-size:16px;line-height:24px;font-weight:700;color:${DOUX};">Il est court, et il t’aide à y voir clair. Prends le temps de le lire au&nbsp;calme.</div>`
    : `${bulle("j’ai fini ton rapport 📖")}${bulle(`${n} chapitres. j’ai pas été tendre 😏`)}
            <div class="encre" style="padding-top:18px;font-family:${POLICE};font-size:32px;line-height:37px;font-weight:900;letter-spacing:-0.025em;color:${ENCRE};">Ton rapport<br>est prêt.</div>
            <div class="doux" style="padding-top:10px;font-family:${POLICE};font-size:16px;line-height:24px;font-weight:700;color:${DOUX};">Le verdict, la bascule, ce qui coince, ton portrait sans filtre, et ton prochain&nbsp;pas.</div>
            <table role="presentation" class="sommaire" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border-top:1px solid #EFEDE8;border-bottom:1px solid #EFEDE8;padding:10px 0;">${sommaire}</table>
            <div class="gris" style="padding-top:12px;font-family:${POLICE};font-size:13px;line-height:18px;font-weight:800;color:${GRIS};">${n}&nbsp;chapitres · ${lecture.replace(" ", "&nbsp;")} de lecture</div>`;

  const html = gabaritMail({
    base,
    titre: "Ton rapport BLUSH est prêt",
    apercu: resume,
    blancs: 6,
    sombre: [
      `.doux, .gris { color: ${DOUX_SOMBRE} !important; }`,
      `.pastille { background: ${PAPIER} !important; color: ${ENCRE} !important; }`,
      ".sommaire { border-color: #2C2C30 !important; }",
      ...BOUTON_SOMBRE,
    ],
    carte: {
      style: "padding:32px 28px 30px;text-align:left;",
      contenu: `
            ${corps}
            ${boutonMail({ lien, libelle: "Lire mon rapport&nbsp;&nbsp;→", marge: 24 })}
            <div class="gris" style="padding-top:14px;text-align:center;font-family:${POLICE};font-size:13px;line-height:19px;font-weight:800;color:${GRIS};">${sobre ? "BLUSH reste là si tu veux en parler." : "Ensuite, parle à BLUSH&nbsp;: il connaît toute votre&nbsp;histoire."}</div>`,
    },
    pied: { classe: "gris", contenu: sobre ? "Ce mail ne contient rien de ta conv&nbsp;: ni prénom, ni&nbsp;message." : "Ce mail ne contient aucun message de ta conv, ni&nbsp;le&nbsp;verdict." },
  });
  return { sujet, texte, html };
}
