import { describe, expect, it } from "vitest";
import { mailParrainage, mailRepondre, mailSansConvQuestion, type MailDeSequence, type Personnes } from "@/contenu/mails";
import { marquerLesLiens, type SorteSuivie } from "@/server/email";
import { mailAttente } from "@/server/mail-attente";
import { mailCode } from "@/server/mail-code";
import { mailRapport } from "@/server/mail-rapport";
import { mailRelance } from "@/server/mail-relance";
import { mailDeSequence } from "@/server/mail-sequence";
import type { MailDessine } from "@/server/marque";

/*
 * Les liens des mails (src/server/email.ts, marquerLesLiens, que envoyerMail et envoyerCodeParEmail passent à chaque
 * mail) : chaque lien vers le site, dans le HTML comme dans le texte brut, de chaque famille de mail (le code, « ton
 * rapport est prêt », la relance, la liste d’attente, les séquences à un, deux ou trois boutons), porte utm_source=email
 * et le genre du mail (utm_campaign), pour que /admin compte la visite en « Mail » (src/server/visites.ts). Rien de
 * personnel n’y est ajouté, et ni les images, ni un autre site ne bougent.
 */

const BASE = "https://www.askblush.com";
const INES: Personnes = { moi: { prenom: "Inès", elle: true }, autre: { prenom: "Lucas", il: true } };

/** Les liens d’un mail vers le site : les href du HTML (désechappés) et les adresses du texte brut. */
const liensDuSite = (m: MailDessine) => [
  ...[...m.html.matchAll(/href="([^"]*)"/g)].map((l) => l[1]!.replaceAll("&amp;", "&")).filter((l) => l.startsWith(BASE)),
  ...(m.texte.match(/https?:\/\/\S+/g) ?? []).filter((l) => l.startsWith(BASE)),
];

/** Un mail des séquences, dessiné comme les envoie src/server/sequences.ts (ses boutons par /ouvrir, sa désinscription signée). */
const sequence = (m: MailDeSequence, cle: string) =>
  mailDeSequence(m, {
    base: BASE,
    liens: {
      boutons: m.boutons.map((_, k) => `${BASE}/ouvrir/c1?m=${cle}&dire=${encodeURIComponent(`réponse ${k}`)}`),
      desinscription: { lien: `${BASE}/desinscription?id=u1&cle=k1&quoi=conseils`, quoi: "conseils" },
    },
  });

/** Chaque famille de mail, son genre dans les liens, et sa sorte suivie (celle que lui donne son envoi). */
const FAMILLES: [string, MailDessine, SorteSuivie, string][] = [
  ["le code", mailCode("042917", BASE), "code", "code"],
  [
    "ton rapport est prêt",
    mailRapport({ base: BASE, lien: `${BASE}/ouvrir/c1`, chapitres: 8, lecture: "9 min", personnes: INES, premium: false, sobre: false }),
    "rapport",
    "rapport",
  ],
  ["la relance", mailRelance({ base: BASE, lien: `${BASE}/ouvrir/c1?paiement=1`, desinscription: `${BASE}/desinscription?id=u1&cle=k1` }), "relance", "relance"],
  ["la liste d’attente", mailAttente({ base: BASE, place: "liste", retrait: `${BASE}/attente/retirer?id=h1&cle=k1` }), "attente", "attente"],
  ["la place prête", mailAttente({ base: BASE, place: "prete", retrait: `${BASE}/attente/retirer?id=h1&cle=k1` }), "attente", "attente"],
  ["une séquence, un bouton", sequence(mailRepondre(INES, { bulles: 10 }), "s3_repondre"), "sequence-s3_repondre", "s3_repondre"],
  ["une séquence, son lien à partager", sequence(mailParrainage(INES, { lien: `${BASE}/p/abcdefg` }), "s3_parrainage"), "sequence-s3_parrainage", "s3_parrainage"],
  ["une séquence, quatre boutons", sequence(mailSansConvQuestion(), "s2_question"), "sequence-s2_question", "s2_question"],
  [
    "une séquence, deux boutons",
    sequence({ ...mailRepondre(INES, { bulles: 10 }), boutons: [{ libelle: "Oui" }, { libelle: "Non" }] }, "s3_repondre"),
    "sequence-s3_repondre",
    "s3_repondre",
  ],
];

describe("les liens des mails, marqués pour /admin", () => {
  it.each(FAMILLES)("%s : chaque lien vers le site porte utm_source=email et son genre, rien d’autre de neuf", (_, mail, suivi, campagne) => {
    const marque = marquerLesLiens(mail, { base: BASE, suivi });
    const liens = liensDuSite(marque);
    expect(liens.length).toBeGreaterThan(0);
    expect(liensDuSite(mail)).toHaveLength(liens.length);
    for (const lien of liens) {
      const u = new URL(lien);
      expect(u.searchParams.getAll("utm_source"), lien).toEqual(["email"]);
      expect(u.searchParams.getAll("utm_campaign"), lien).toEqual([campagne]);
    }
    /* Les paramètres d’avant restent, dans leur ordre, et rien d’autre ne s’ajoute */
    const avant = liensDuSite(mail).map((l) => [...new URL(l).searchParams.keys()]);
    expect(liens.map((l) => [...new URL(l).searchParams.keys()])).toEqual(avant.map((cles) => [...cles, "utm_source", "utm_campaign"]));
    /* L’image de la bulle, le sujet et ce qui n’est pas un lien ne bougent pas */
    expect(marque.html).toContain(`src="${BASE}/mail/bulle.png"`);
    expect(marque.sujet).toBe(mail.sujet);
    expect(marque.html.replace(/[?&](amp;)?utm_source=email(&amp;|&)utm_campaign=[\w-]+/g, "").replaceAll(`${BASE}/"`, `${BASE}"`)).toBe(mail.html);
  });

  it("le site seul prend sa barre, un fragment reste au bout, un lien déjà marqué ou d’un autre site ne bouge pas, et les en-têtes non plus", () => {
    const entetes = { "List-Unsubscribe": `<${BASE}/api/desinscription/un-clic?id=u1&cle=k1&quoi=offres>` };
    const m = marquerLesLiens(
      {
        sujet: "Un sujet",
        texte: `Le site : ${BASE}\nUne page : ${BASE}/rapport#chapitre-2\nDéjà : ${BASE}/?utm_source=tiktok\nAilleurs : https://www.exemple.org/page\nPas le nôtre : ${BASE}.exemple.org/x`,
        html: `<a href="${BASE}">a</a><a href="https://www.exemple.org/?a=1">b</a><a href="${BASE}/v/x?a=1&amp;b=2">c</a>`,
        entetes,
      },
      { base: `${BASE}/`, suivi: "sequence-s1_haut" },
    );
    expect(m.texte).toBe(
      `Le site : ${BASE}/?utm_source=email&utm_campaign=s1_haut\nUne page : ${BASE}/rapport?utm_source=email&utm_campaign=s1_haut#chapitre-2\nDéjà : ${BASE}/?utm_source=tiktok\nAilleurs : https://www.exemple.org/page\nPas le nôtre : ${BASE}.exemple.org/x`,
    );
    expect(m.html).toBe(
      `<a href="${BASE}/?utm_source=email&amp;utm_campaign=s1_haut">a</a><a href="https://www.exemple.org/?a=1">b</a><a href="${BASE}/v/x?a=1&amp;b=2&amp;utm_source=email&amp;utm_campaign=s1_haut">c</a>`,
    );
    expect(m.entetes).toBe(entetes);
    /* Une alerte de l’équipe, sans HTML : sans lien, rien ne change */
    expect(marquerLesLiens({ sujet: "BLUSH · une alerte", texte: "Tâche t1" }, { base: BASE, suivi: "alerte" })).toEqual({ sujet: "BLUSH · une alerte", texte: "Tâche t1" });
  });
});
