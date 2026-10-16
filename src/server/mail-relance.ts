import { NB_CHAPITRES } from "@/contenu/chapitres";
import { attribut, BOUTON_SOMBRE, boutonMail, DEGRADE_ROSE, DOUX, DOUX_SOMBRE, ENCRE, gabaritMail, GRIS, POLICE, type MailDessine } from "./marque";

/*
 * Le mail de relance (l’offre unique ②, src/server/relances.ts) : « Ton rapport t’attend », deux heures après une feuille
 * de paiement fermée sans payer. Le paywall passe avant toute lecture (16 octobre) : rien n’est encore lu par le modèle,
 * le mail promet le rapport entier. Dans la famille du mail « ton rapport est prêt » (marque.ts, gabaritMail). Rien de la
 * conv : ni prénom, ni message, ni verdict ; seulement les chapitres, nommés comme dans tous les rapports. Un lien de
 * désinscription signé, en pied, coupe toutes les relances du compte.
 * TODO(produit): à relire par un juriste (prospection) : un mail commercial à quelqu’un qui n’a encore rien acheté
 * (article L34-5 du Code des postes et des communications électroniques), son consentement à l’inscription, et ce que dit
 * le pied (l’expéditeur, le lien de désinscription).
 */

/** `lien` : l’adresse qui rouvre cette conv sur la feuille de paiement ; `desinscription` : le lien signé qui coupe les relances. */
export function mailRelance({ base, lien, desinscription }: { base: string; lien: string; desinscription: string }): MailDessine {
  const sujet = "Ton rapport t’attend";
  const apercu = "Ta conv est prête à être lue. Il ne manque que toi.";
  const corps = `Ta conv est prête à être lue. Tes ${NB_CHAPITRES} chapitres t’attendent\u00a0: le verdict, la bascule, ce qui coince, ton portrait sans filtre, et ton prochain pas.`;
  const texte = [
    "Ton rapport t’attend.",
    corps,
    `Lire mon rapport\u00a0: ${lien}`,
    "Ce mail ne contient rien de ta conv\u00a0: ni prénom, ni message.",
    `Plus de relances\u00a0? Désinscris-toi\u00a0: ${desinscription}`,
  ].join("\n\n");
  const bulle = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;"><tr><td style="background-color:#F0479A;background-image:${DEGRADE_ROSE};border-radius:20px 20px 20px 6px;padding:9px 16px 11px;font-family:${POLICE};font-size:16px;line-height:20px;font-weight:900;color:#FFFFFF;">t’as fermé juste avant le meilleur 👀</td></tr></table>`;
  const html = gabaritMail({
    base,
    titre: sujet,
    apercu,
    sombre: [`.doux, .gris { color: ${DOUX_SOMBRE} !important; }`, ...BOUTON_SOMBRE],
    carte: {
      style: "padding:32px 28px 30px;text-align:left;",
      contenu: `
            ${bulle}
            <div class="encre" style="padding-top:18px;font-family:${POLICE};font-size:32px;line-height:37px;font-weight:900;letter-spacing:-0.025em;color:${ENCRE};">Ton rapport<br>t’attend.</div>
            <div class="doux" style="padding-top:10px;font-family:${POLICE};font-size:16px;line-height:24px;font-weight:700;color:${DOUX};">${corps.replace("\u00a0", "&nbsp;")}</div>
            ${boutonMail({ lien, libelle: "Lire mon rapport&nbsp;&nbsp;→", marge: 24 })}
            <div class="gris" style="padding-top:14px;text-align:center;font-family:${POLICE};font-size:13px;line-height:19px;font-weight:800;color:${GRIS};">Ce mail ne contient rien de ta conv&nbsp;: ni prénom, ni&nbsp;message.</div>`,
    },
    pied: {
      classe: "gris",
      contenu: `Plus de relances&nbsp;? <a href="${attribut(desinscription)}" class="gris" style="color:${GRIS};font-weight:900;">Désinscris-toi</a>.`,
    },
  });
  return { sujet, texte, html };
}
