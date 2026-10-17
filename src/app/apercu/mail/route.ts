import { NB_CHAPITRES } from "@/contenu/chapitres";
import {
  mailAnniversaire,
  mailApresGlace,
  mailAvance,
  mailChapitres,
  mailDerniereChance,
  mailEndormi,
  mailGarde,
  mailGlace,
  mailHautDuPaywall,
  mailParfait,
  mailParrainage,
  mailPeuDeBulles,
  mailProchainPas,
  mailRepondre,
  mailReponsePrete,
  mailSansConv,
  mailSansConvPeur,
  mailSansConvQuestion,
  mailTemperature,
  mailVocal,
  mailZeroBulle,
  type MailDeSequence,
  type Personnes,
} from "@/contenu/mails";
import { hautDuPaywall } from "@/contenu/haut-du-paywall";
import { mailAttente } from "@/server/mail-attente";
import { mailCode } from "@/server/mail-code";
import { mailRapport } from "@/server/mail-rapport";
import { mailRelance } from "@/server/mail-relance";
import { mailDeSequence } from "@/server/mail-sequence";
import { AUTRE } from "../ecriture/exemple";

export const dynamic = "force-dynamic";

/** Les mails des séquences (src/server/sequences.ts), par leur `?type=` : leur texte pour ces personnes, et ce qu’ils sont pour la désinscription. */
const SEQUENCES: Record<string, { mail: (p: Personnes) => MailDeSequence; quoi: "conseils" | "offres" }> = {
  repondre: { mail: (p) => mailRepondre(p, { bulles: 10 }), quoi: "conseils" },
  vocal: { mail: (p) => mailVocal(p, { secondes: 28 }), quoi: "conseils" },
  pas: { mail: (p) => mailProchainPas(p, { emoji: "🤏", pas: "Jeudi, propose-lui le ciné dont il t’a parlé, avec une heure.", bulles: 9 }), quoi: "conseils" },
  glace: { mail: (p) => mailGlace(p), quoi: "conseils" },
  peu: { mail: (p) => mailPeuDeBulles(p, { bulles: 2, bonus: true, actif: true }), quoi: "offres" },
  prete: { mail: (p) => mailReponsePrete(p, { bonus: true }), quoi: "offres" },
  zero: { mail: (p) => mailZeroBulle(p, { faits: 12, messages: 4365, echanges: 23 }), quoi: "offres" },
  endormi: { mail: (p) => mailEndormi(p, { niveau: "voit", bulles: 9 }), quoi: "conseils" },
  parfait: { mail: (p) => mailParfait(p, { bulles: 9 }), quoi: "conseils" },
  couple: { mail: (p) => mailTemperature(p, { niveau: "va", mois: 1 }), quoi: "conseils" },
  garde: { mail: (p) => mailGarde(p, { jour: "vendredi", heure: "18\u00a0h\u00a012" }), quoi: "offres" },
  avance: { mail: () => mailAvance({ jusqua: "17 octobre 2027", mois: 11 }), quoi: "offres" },
  apres: { mail: () => mailApresGlace(), quoi: "offres" },
  anniv: { mail: (p) => mailAnniversaire(p, { jour: "jeudi", date: "jeudi 23", aime: "Le ciné, les ramen", bulles: 9 }), quoi: "conseils" },
  parrainage: { mail: (p) => mailParrainage(p, { lien: "https://www.askblush.com/p/abcdefg" }), quoi: "offres" },
  haut: {
    mail: (p) =>
      mailHautDuPaywall(
        p,
        hautDuPaywall(
          {
            signaux: [
              { id: "ouvre", cote: "toi", toi: 7, elle: 3 },
              { id: "reprend", cote: "elle", toi: 2, elle: 8 },
            ],
            tendance: null,
          },
          { nom: p.autre.prenom ?? "lui", il: p.autre.il },
        ),
      ),
    quoi: "offres",
  },
  chapitres: { mail: (p) => mailChapitres(p), quoi: "offres" },
  derniere: { mail: (p) => mailDerniereChance(p, { jour: "jeudi" }), quoi: "offres" },
  "sans-conv": { mail: () => mailSansConv({ heure: "1\u00a0h\u00a012 du mat’" }), quoi: "offres" },
  peur: { mail: () => mailSansConvPeur(), quoi: "offres" },
  question: { mail: () => mailSansConvQuestion(), quoi: "offres" },
};

/**
 * Hors de Vercel seulement (src/proxy.ts) : un mail tel qu’il partira. Le code (par défaut) ; `?type=rapport` (`&sobre=1` :
 * le mode sobre, `&premium=1` : Premium pris), celui de l’histoire d’exemple ; ou `?type=attente`, celui de la liste
 * d’attente (`&place=prete` : un email déjà invité, `&conv=1` : la conv importée qui n’a pas été gardée) ; ou
 * `?type=relance`, la relance « Ton rapport t’attend » ; ou un mail des séquences (`?type=repondre`, `vocal`, `pas`,
 * `glace`, `peu`, `prete`, `zero`, `endormi`, `parfait`, `couple`, `garde`, `avance`, `apres`, `anniv`, `parrainage`, `haut`,
 * `chapitres`, `derniere`, `sans-conv`, `peur`, `question`). Pour ceux qui ont des prénoms : `&il=1`, c’est lui qui écrit (elle, l’autre) ;
 * `&anonyme=1`, sans prénoms.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const type = p.get("type") ?? "";
  const lui = p.get("il") === "1";
  const anonyme = p.get("anonyme") === "1";
  const personnes: Personnes = {
    moi: { prenom: anonyme ? null : lui ? "Lucas" : "Inès", elle: !lui },
    autre: { prenom: anonyme ? null : lui ? AUTRE : "Lucas", il: !lui },
  };
  const exemple = `${url.origin}/ouvrir/exemple`;
  const sequence = SEQUENCES[type];
  const html = sequence
    ? mailDeSequence(sequence.mail(personnes), {
        base: url.origin,
        liens: {
          boutons: [`${exemple}?dire=`, `${exemple}?dire=`, `${exemple}?dire=`, `${exemple}?dire=`],
          desinscription: { lien: `${url.origin}/desinscription?id=exemple&cle=exemple`, quoi: sequence.quoi },
        },
      }).html
    : type === "rapport"
      ? mailRapport({
          base: url.origin,
          lien: `${url.origin}/rapport`,
          chapitres: NB_CHAPITRES,
          lecture: "9 min",
          personnes,
          premium: p.get("premium") === "1",
          sobre: p.get("sobre") === "1",
        }).html
      : type === "attente"
        ? mailAttente({
            base: url.origin,
            place: p.get("place") === "prete" ? "prete" : "liste",
            retrait: `${url.origin}/attente/retirer?id=exemple&cle=exemple`,
            convEffacee: p.get("conv") === "1",
          }).html
        : type === "relance"
          ? mailRelance({ base: url.origin, lien: `${url.origin}/rapport?paiement=1`, desinscription: `${url.origin}/desinscription?id=exemple&cle=exemple` }).html
          : mailCode("159714", url.origin).html;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
