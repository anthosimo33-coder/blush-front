import { describe, expect, it } from "vitest";
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
import { mailDeSequence } from "@/server/mail-sequence";

/*
 * Les mails des séquences (src/contenu/mails.ts, dessinés par src/server/mail-sequence.ts) : leurs prénoms dans le
 * corps seulement (ni le sujet, ni l’aperçu, ni le texte brut, ce que montre un écran verrouillé), accordés à leurs
 * pronoms, rien d’oublié, et leurs liens (les boutons, la désinscription de leur genre).
 */

const INES: Personnes = { moi: { prenom: "Inès", elle: true }, autre: { prenom: "Lucas", il: true } };
const LUCAS: Personnes = { moi: { prenom: "Lucas", elle: false }, autre: { prenom: "Inès", il: false } };
const SANS_PRENOMS: Personnes = { moi: { prenom: null, elle: true }, autre: { prenom: null, il: true } };

/** Chaque mail des séquences du lot 1, pour ces personnes. */
const tous = (p: Personnes): [string, MailDeSequence][] => [
  ["repondre", mailRepondre(p, { bulles: 10 })],
  ["vocal", mailVocal(p, { secondes: 28 })],
  ["pas", mailProchainPas(p, { emoji: "🤏", pas: "Jeudi, propose-lui le ciné, avec une heure.", bulles: 9 })],
  ["glace", mailGlace(p)],
  ["peu", mailPeuDeBulles(p, { bulles: 1, actif: true })],
  ["prete", mailReponsePrete(p)],
  ["zero", mailZeroBulle(p, { faits: 12, messages: 4365, echanges: 23 })],
  ["endormi", mailEndormi(p, { niveau: "voit", bulles: 9 })],
  ["parfait", mailParfait(p, { bulles: 9 })],
  ["couple", mailTemperature(p, { niveau: "va", mois: 2 })],
  ["garde", mailGarde(p, { jour: "vendredi", heure: "18\u00a0h\u00a012" })],
  ["anniv", mailAnniversaire(p, { jour: "jeudi", date: "jeudi 23", aime: "Le ciné", bulles: 9 })],
  ["parrainage", mailParrainage(p, { lien: "https://www.askblush.com/p/abcdefg" })],
  ["haut", mailHautDuPaywall(p, hautDuPaywall(CONTRASTE, { nom: p.autre.prenom ?? "lui", il: p.autre.il }))],
  ["chapitres", mailChapitres(p)],
];

/* Un paywall au titre « contraste » : tu ouvres la conv, il revient après tes silences */
const CONTRASTE = {
  signaux: [
    { id: "ouvre" as const, cote: "toi" as const, toi: 7, elle: 3 },
    { id: "reprend" as const, cote: "elle" as const, toi: 2, elle: 8 },
  ],
  tendance: null,
};

const liens = {
  boutons: ["https://www.askblush.com/ouvrir/c1?dire=oui", "https://www.askblush.com/ouvrir/c1?dire=non"],
  desinscription: { lien: "https://www.askblush.com/desinscription?id=u1&cle=k1&quoi=conseils", quoi: "conseils" as const },
};

describe("les mails des séquences", () => {
  it.each(tous(INES))("%s : les prénoms dans le corps seulement (ni dans ce que tapent ses boutons), rien d’oublié", (_, m) => {
    expect(m.boutons.map((b) => b.dire ?? "").join(" ")).not.toMatch(/Inès|Lucas/);
    const d = mailDeSequence(m, { base: "https://www.askblush.com", liens });
    expect(`${d.sujet}\n${m.apercu}\n${d.texte}`).not.toMatch(/Inès|Lucas/);
    expect(d.html).toMatch(/Inès|Lucas/);
    for (const morceau of ["undefined", "null", "NaN", "[object"]) expect(`${d.sujet}${d.texte}${d.html}`).not.toContain(morceau);
    /* La désinscription de son genre, en pied et dans le texte brut */
    expect(d.html).toContain('href="https://www.askblush.com/desinscription?id=u1&amp;cle=k1&amp;quoi=conseils"');
    expect(d.texte).toContain("https://www.askblush.com/desinscription?id=u1&cle=k1&quoi=conseils");
    expect(d.html).toContain('href="https://www.askblush.com/ouvrir/c1?dire=oui"');
  });

  it("sans prénoms : « lui » ou « elle », jamais un trou", () => {
    for (const [, m] of tous(SANS_PRENOMS)) {
      const d = mailDeSequence(m, { base: "x", liens });
      expect(d.html).not.toMatch(/ sur \.| et ,|undefined|null/);
    }
    expect(mailVocal(SANS_PRENOMS, { secondes: 28 }).bulles[1]).toBe("28 secondes sur toi et lui");
  });

  it("accordés à leurs pronoms : elle (Inès parle de Lucas), lui (Lucas parle d’Inès)", () => {
    expect(mailZeroBulle(INES, { faits: 0, messages: 10, echanges: 0 }).sujet).toBe("je t’ai pas oubliée");
    expect(mailZeroBulle(LUCAS, { faits: 0, messages: 10, echanges: 0 }).sujet).toBe("je t’ai pas oublié");
    expect(mailRepondre(INES, { bulles: 10 }).bulles[1]).toBe("Lucas t’a répondu\u00a0?");
    expect(mailRepondre(SANS_PRENOMS, { bulles: 10 }).bulles[1]).toBe("il t’a répondu\u00a0?");
    expect(mailRepondre({ ...SANS_PRENOMS, autre: { prenom: null, il: false } }, { bulles: 10 }).bulles[1]).toBe("elle t’a répondu\u00a0?");
    expect(mailVocal(LUCAS, { secondes: 28 }).corps).toContain("ton meilleur pote");
    expect(mailGlace(INES).corps).toContain("Pas pour le faire revenir");
    expect(mailGlace(LUCAS).corps).toContain("Pas pour la faire revenir");
    /* L’exemple d’échange : une fille qui parle à un garçon tend une perche ; un garçon, ou une fille qui parle à une fille, propose */
    expect(mailRepondre(INES, { bulles: 10 }).exemple?.oui).toContain("tu proposes quoi");
    expect(mailRepondre(LUCAS, { bulles: 10 }).exemple?.oui).toContain("samedi");
    const deuxFilles: Personnes = { moi: { prenom: "Inès", elle: true }, autre: { prenom: "Léa", il: false } };
    expect(mailRepondre(deuxFilles, { bulles: 10 }).exemple?.oui).toContain("samedi");
    expect(mailRepondre(deuxFilles, { bulles: 10 }).bulles[1]).toBe("Léa t’a répondu\u00a0?");
  });

  it("les bulles : le pack conseillé (sans offertes, ni « + 0 » ni le total redit), plus de bonus de 1re recharge, et une réponse au singulier", () => {
    expect(mailPeuDeBulles(INES, { bulles: 1, actif: true }).encart).toEqual({
      gras: "Le pack conseillé",
      ligne: "25 bulles · 14,90\u00a0€ · 0,60\u00a0€ la réponse",
    });
    expect(mailPeuDeBulles(INES, { bulles: 1, actif: true }).bulles[0]).toBe("plus qu’une bulle");
    expect(mailPeuDeBulles(INES, { bulles: 2, actif: true }).bulles[0]).toBe("plus que 2\u00a0bulles");
    expect(mailPeuDeBulles(INES, { bulles: 1, actif: false }).sujet).toBe("il te reste 1\u00a0réponse");
    expect(mailPeuDeBulles(INES, { bulles: 1, actif: false }).ps).toBe("ps\u00a0: tes bulles expirent jamais");
    const prete = mailReponsePrete(INES);
    expect(prete.titre).toBe("Il attend ta réponse. Ta réponse attend 6,90\u00a0€.");
    expect(prete.encart).toEqual({ gras: "10 bulles · 6,90\u00a0€", ligne: "ou 25 à 14,90\u00a0€" });
    expect(prete.ps).toBe("ps\u00a0: 10 bulles, c’est 10 réponses comme celle-là");
    expect(JSON.stringify([mailPeuDeBulles(INES, { bulles: 1, actif: true }), prete])).not.toMatch(/1re recharge|bonus|offertes/);
    expect(mailZeroBulle(INES, { faits: 12, messages: 4365, echanges: 23 }).encart?.ligne).toBe(
      "Sa fiche, 12 choses sur Lucas · vos 4\u00a0365 messages · ton rapport · nos 23 échanges.",
    );
  });

  it("le prochain pas tel que le verdict l’a écrit, deux boutons à une touche ; après un 🧊, rien à vendre et le 3114", () => {
    const pas = mailProchainPas(INES, { emoji: "🔥", pas: "Propose-lui un verre <samedi> & une heure.", bulles: 3 });
    expect(pas.boutons.map((b) => b.dire)).toEqual(["c’est fait\u00a0! ", "j’ai pas osé…"]);
    const d = mailDeSequence(pas, { base: "x", liens });
    expect(d.html).toContain("Propose-lui un verre &lt;samedi&gt; &amp; une heure.");
    expect(d.html).toContain('href="https://www.askblush.com/ouvrir/c1?dire=non"');
    expect(mailProchainPas(INES, { emoji: "🤔", pas: null, bulles: 3 }).pas).toBeUndefined();
    const glace = mailGlace(INES);
    expect(glace.mini).toContain("3114");
    expect([glace.titre, glace.corps, ...glace.bulles, glace.mini, glace.ps, ...glace.boutons.map((b) => b.libelle)].join(" ")).not.toMatch(/bulle|recharg|€/i);
  });

  it("S5 : leur niveau et le suivant à franchir, trois réponses à une touche ; un couple, sa température d’il y a un mois", () => {
    const sept = mailEndormi(INES, { niveau: "voit", bulles: 1 });
    expect(sept.niveaux).toEqual({ noms: ["On se parle", "On se voit", "On se le dit", "On est ensemble"], ici: 1, etiquette: "t’en étais là", etapes: true });
    expect(sept.corps).toContain("passer à «\u00a0on se le dit\u00a0»");
    expect(sept.boutons.map((b) => b.libelle)).toEqual(["On se l’est dit", "Toujours pareil", "Ça s’est refroidi"]);
    expect(sept.ps).toBe("ps\u00a0: il te reste 1\u00a0bulle. une occasion de bien jouer");
    expect(mailEndormi(LUCAS, { niveau: "parle", bulles: 9 }).bulles[1]).toContain("trop occupé à être heureux");
    const couple = mailTemperature(INES, { niveau: "coince", mois: 1 });
    expect(couple.sujet).toBe("un mois déjà");
    expect(couple.bulles[1]).toBe("la dernière fois, vous étiez à «\u00a0ça coince\u00a0»");
    expect(couple.niveaux?.etapes).toBe(false);
    expect(mailTemperature(INES, { niveau: "soudes", mois: 3 }).sujet).toBe("3 mois déjà");
  });

  it("S6, S7 : l’offre gardée à son prix, le rapport d’avance sans prénom, rien de l’ancienne histoire après un 🧊", () => {
    const garde = mailGarde(INES, { jour: "vendredi", heure: "18\u00a0h\u00a012" });
    expect(garde.offre).toMatchObject({ prix: "4,95\u00a0€", barre: "9,90\u00a0€", jusqua: "Jusqu’à vendredi, 18\u00a0h\u00a012" });
    expect(garde.sujet).toBe("ton −50\u00a0% saute vendredi");
    for (const m of [mailAvance({ jusqua: "17 octobre 2027", mois: 11, bulles: 3 }), mailApresGlace()]) {
      const d = mailDeSequence(m, { base: "x", liens });
      for (const morceau of ["undefined", "null", "Inès", "Lucas"]) expect(`${d.sujet}${d.texte}${d.html}`).not.toContain(morceau);
    }
    expect(mailAvance({ jusqua: "17 octobre 2027", mois: 11, bulles: 3 }).apercu).toBe("valable encore 11 mois. mais pourquoi attendre\u00a0?");
    /* Après un 🧊 : ni « Ce mail ne cite… » (rien à citer), son lien de désinscription à lui */
    const apres = mailDeSequence(mailApresGlace(), { base: "x", liens });
    expect(apres.html).toContain(">Plus de mails comme ça</a>");
    expect(apres.html).not.toContain("Ce mail ne cite");
  });

  it("S8 : son anniversaire, ce qu’il ou elle aime, et le message à écrire d’une touche", () => {
    const anniv = mailAnniversaire(LUCAS, { jour: "samedi", date: "samedi 4", aime: null, bulles: 0 });
    expect(anniv.bulles[1]).toBe("samedi, c’est l’anniv d’Inès 🎂");
    expect(mailAnniversaire(INES, { jour: "samedi", date: "samedi 4", aime: null, bulles: 0 }).bulles[1]).toBe("samedi, c’est l’anniv de Lucas 🎂");
    expect(anniv.fiche).toEqual([{ rubrique: "Dates à retenir", texte: "samedi 4 · son anniv" }]);
    expect(anniv.corps).toContain("tout ce que je sais d’elle.");
    expect(anniv.boutons[0]!.dire).toBe("écris-moi son message d’anniv 🎂");
    expect(anniv.mini).toBe("1 bulle");
    expect(`${anniv.sujet}${anniv.apercu}${anniv.texte}`).not.toContain("Inès");
  });

  it("S1, S2 : les prospects ; le titre de son paywall, ses chapitres, et sans conv, ni prénom ni pronom", () => {
    const haut = mailHautDuPaywall(INES, hautDuPaywall(CONTRASTE, { nom: "Lucas", il: true }));
    expect(haut.sujet).toBe("t’as vu le chiffre\u00a0?");
    expect(haut.boutons[0]!.libelle).toBe("Voir pourquoi il revient");
    expect(haut.encart?.gras).toBe("Ton rapport sur Lucas");
    expect(haut.pied).toContain("Tu le reçois parce que t’as un compte BLUSH.");
    const chapitres = mailChapitres(LUCAS);
    expect(chapitres.fiche?.[4]).toEqual({ rubrique: "5 · Inès", texte: "ce qu’elle montre, ce qu’elle cache" });
    for (const m of [mailSansConv({ heure: "1\u00a0h\u00a012 du mat’" }), mailSansConvPeur(), mailSansConvQuestion()]) {
      const d = mailDeSequence(m, { base: "x", liens });
      for (const morceau of ["undefined", "null", "Inès", "Lucas", " il ", " elle "]) expect(`${d.sujet}${d.texte}${d.html}`).not.toContain(morceau);
    }
    expect(mailSansConv({ heure: null }).sujet).toBe("t’as créé ton compte, puis t’as filé");
    expect(mailSansConvQuestion().boutons).toHaveLength(4);
  });

  it("S1 J+6 : la one time offer à son prix, jusqu’à après-demain minuit, et plus de relance après", () => {
    const m = mailDerniereChance(INES, { jour: "jeudi" });
    expect(m.offre).toEqual({
      prix: "6,90\u00a0€",
      barre: "9,90\u00a0€",
      remise: "−3\u00a0€",
      inclus: "8 chapitres sur toi et Lucas, ton vocal, et 3 réponses de BLUSH",
      jusqua: "Jusqu’à jeudi, 23\u00a0h\u00a059",
      sous: "Après, 9,90\u00a0€. Comme tout le monde.",
    });
    expect(`${m.sujet}${m.apercu}${m.texte}`).not.toContain("Lucas");
  });

  it("le parrainage : l’amie de son genre, son lien, et ce que chacune y gagne", () => {
    const elle = mailParrainage(INES, { lien: "https://www.askblush.com/p/abcdefg" });
    expect(elle.titre).toBe("Ta pote mérite de savoir aussi.");
    expect(elle.encart?.ligne).toBe("askblush.com/p/abcdefg");
    expect(elle.corps).toBe("Elle importe sa conv avec ton lien\u00a0: elle a 3 réponses de BLUSH en plus avec son rapport, et toi 3 bulles offertes.");
    const lui = mailParrainage(LUCAS, { lien: "https://www.askblush.com/p/abcdefg" });
    expect(lui.titre).toBe("Ton pote mérite de savoir aussi.");
    expect(lui.apercu).toBe("envoie-moi ton pote. vous y gagnez tous les deux.");
  });
});
