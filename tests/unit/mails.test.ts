import { describe, expect, it } from "vitest";
import { mailGlace, mailPeuDeBulles, mailProchainPas, mailRepondre, mailReponsePrete, mailVocal, mailZeroBulle, type MailDeSequence, type Personnes } from "@/contenu/mails";
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
  ["peu", mailPeuDeBulles(p, { bulles: 2, bonus: true, actif: true })],
  ["prete", mailReponsePrete(p, { bonus: false })],
  ["zero", mailZeroBulle(p, { faits: 12, messages: 4365, echanges: 23 })],
];

const liens = {
  boutons: ["https://www.askblush.com/ouvrir/c1?dire=oui", "https://www.askblush.com/ouvrir/c1?dire=non"],
  desinscription: { lien: "https://www.askblush.com/desinscription?id=u1&cle=k1&quoi=conseils", quoi: "conseils" as const },
};

describe("les mails des séquences", () => {
  it.each(tous(INES))("%s : les prénoms dans le corps seulement, rien d’oublié", (_, m) => {
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
    /* L’exemple d’échange : une fille tend une perche, un garçon propose */
    expect(mailRepondre(INES, { bulles: 10 }).exemple?.oui).toContain("tu proposes quoi");
    expect(mailRepondre(LUCAS, { bulles: 10 }).exemple?.oui).toContain("samedi");
  });

  it("les bulles : le pack conseillé, son bonus de 1re recharge s’il vaut, et une réponse au singulier", () => {
    expect(mailPeuDeBulles(INES, { bulles: 2, bonus: true, actif: true }).encart).toEqual({
      gras: "Ta 1re recharge\u00a0: +40 offertes",
      ligne: "70 bulles + 50 offertes · 13,90\u00a0€ · 120 réponses, 0,12\u00a0€ la réponse",
    });
    expect(mailPeuDeBulles(INES, { bulles: 1, bonus: false, actif: false }).encart?.ligne).toBe("70 bulles + 10 offertes · 13,90\u00a0€ · 80 réponses, 0,17\u00a0€ la réponse");
    expect(mailPeuDeBulles(INES, { bulles: 1, bonus: false, actif: false }).sujet).toBe("il te reste 1\u00a0réponse");
    expect(mailReponsePrete(INES, { bonus: true }).titre).toBe("Il attend ta réponse. Ta réponse attend 8,90\u00a0€.");
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
});
