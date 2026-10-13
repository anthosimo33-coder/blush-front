import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SortiesDuBanc } from "@prompts/lib/apercu";
import { Sortie05, Sortie10, type ReponseChat, type Verdict } from "@prompts/lib/schemas";
import { TITRE_DU_VERDICT } from "@/contenu/chapitres";
import { apercuDe, lireApercu, lireTous } from "@/server/apercu";
import { sobreAffiche } from "@/server/ecrans/rapport";
import { enTete } from "@/server/presentation/rapport";
import { chapitre, memoire } from "../aide/fabriques";
import { auMoins } from "../aide/listes";

/*
 * Les aperçus de l’équipe (src/server/apercu.ts) : les sorties brutes du banc d’évals (prompts/lib/apercu.ts), mises en
 * écrans par la traduction de l’appli (src/server/ecrans), pas par une copie à elles. Sans base ni modèle. Des exemples
 * inventés : Tom importe sa conv avec Léa (60 messages, un vocal), les sorties sont fabriquées.
 */

/** La conv : Léa et Tom, chacun son tour, une minute d’écart, le 1er mars 2026 (m0001 à m0060) ; m0006 est un vocal de Tom. */
const TEXTE = Array.from({ length: 60 }, (_, k) => {
  const texte = k === 5 ? "audio omis" : k === 6 ? "on se voit samedi ?" : `message ${k}`;
  return `[01/03/2026 10:${String(k).padStart(2, "0")}:00] ${k % 2 ? "Tom" : "Léa"}: ${texte}`;
}).join("\n");

const VERDICT: Verdict = {
  alerte: null,
  mode_sobre: false,
  emoji: "🔥",
  court: "ça chauffe",
  titre: "Elle attend que tu proposes",
  sous_titre: "Léa relance, Tom hésite.",
  preuves: ["m0007"],
  confiance: "probable",
  confiance_texte: "Elle propose samedi.",
  niveau: "voit",
  niveau_pourquoi: "Vous vous êtes vus.",
  tendance: "↗ ça monte",
  prochain_pas: "Propose un verre jeudi.",
  devinette: null,
  titres: null,
};

const RAPPORT = Sortie05.parse({
  alerte: null,
  mode_sobre: false,
  decouvertes: [],
  these: "Elle avance, il recule.",
  chapitres: [
    chapitre(1, { blocs: [{ type: "accroche", texte: "Tout commence un dimanche.", preuves: [], titre: null, niveau: null, items: null }] }),
    chapitre(2, { blocs: [{ type: "recit", texte: "Elle propose, il esquive.", preuves: ["m0006", "m0007"], titre: null, niveau: null, items: null }] }),
  ],
  sobre: null,
});

/** Une réponse du chat : une bulle qui cite `preuves`, puis une réponse à envoyer. */
const chat = (texte: string, preuves: string[] = []): ReponseChat =>
  Sortie10.parse({
    alerte: null,
    type: "message_recu",
    coup: "plan",
    mode: "jeu",
    confiance: "probable",
    lecture: [{ texte, preuves }],
    a_envoyer: ["samedi 18h ça marche"],
    question: null,
    reaction: null,
    pourquoi: "tu dis oui, avec une heure",
    niveau_atteint: null,
    mode_vocal: null,
    dit: null,
  });

const sorties = (autres: Partial<SortiesDuBanc> = {}): SortiesDuBanc =>
  SortiesDuBanc.parse({
    banc: 1,
    histoire: {
      utilisateur: { prenom: "Tom", pronom: "il", nomExport: "Tom" },
      autre: { prenom: "Léa", pronom: "elle", nomExport: "Léa" },
      devinette: "flou",
      objectif: "ensemble",
      appli: "whatsapp",
      format: "whatsapp-ios",
    },
    texte: TEXTE,
    verdict: VERDICT,
    rapport: RAPPORT,
    memoire: memoire({ fiche: { portrait: "la Taquine", faits: [{ section: "aime", texte: "Les crêpes", preuves: ["m0007"], statut: "nouveau" }] }, questions: ["elle m’aime ?"] }),
    reponses: [{ question: "elle m’aime ?", sortie: chat("elle propose", ["m0007"]) }],
    script: [
      { dit: "je lui réponds quoi ?", recus: ["m0006", "m0007"], sortie: chat("elle te tend la perche") },
      { dit: null, recus: [], sortie: chat("son samedi est passé") },
    ],
    ...autres,
  });

/** Le message m0007 de Léa, tel que l’appli le montre. */
const SAMEDI = { from: "elle", text: "on se voit samedi ?", caption: "Léa · 01/03 10:06" };

describe("l’aperçu du banc, mis en écrans par l’appli", () => {
  it("le rapport : l’en-tête du verdict de l’appli, le chapitre offert avec ses scores, les preuves en messages datés", () => {
    const { payload } = apercuDe(sorties());
    expect(payload.report).toMatchObject({ storyId: "apercu", ...enTete(VERDICT) });
    expect(payload.report.nextStep).toBe("Ton prochain pas\u00a0: Propose un verre jeudi.");
    const [ch1, ch2] = auMoins(payload.report.chapters, 2);
    expect(ch1).toMatchObject({ number: 1, title: TITRE_DU_VERDICT, free: true });
    expect(ch1.blocks.map((b) => b.kind)).toEqual(["lead", "scores"]);
    expect(ch2).toMatchObject({ number: 2, title: "Chapitre 2", free: false });
    /* Le vocal de Tom (m0006) n’a rien à montrer : seul le message de Léa est cité */
    expect(ch2.blocks).toEqual([{ kind: "story", text: "Elle propose, il esquive.", messages: [SAMEDI] }]);
    expect(payload).toMatchObject({ sober: null, debloque: true });
  });

  it("la conv : ses deux personnes, ses messages et son vocal, comme l’appli la décrit", () => {
    const { story } = apercuDe(sorties());
    expect(story.participants.map((p) => [p.name, p.pronoun])).toEqual([
      ["Tom", "il"],
      ["Léa", "elle"],
    ]);
    expect(story).toMatchObject({ totalMessages: 60, voiceCount: 1, period: "1 mars → 1 mars", me: "p0" });
    expect(story.sources[0]).toMatchObject({ app: "whatsapp", mode: "export", label: "WhatsApp · 1 mars", messageCount: 60 });
  });

  it("sa fiche et l’accueil : la fiche de l’appli, les réponses du chat en bulles, ses messages reçus, une ouverture sans message à lui", () => {
    const { fiche, home } = apercuDe(sorties());
    expect(fiche).toMatchObject({ person: { name: "Léa", initial: "L", pronoun: "elle" }, portrait: "La Taquine" });
    expect(fiche?.facts).toEqual([{ id: "f0", section: "aime", text: "Les crêpes", sourceLabel: "votre conv · 1 mars", sources: ["conv"] }]);
    expect(home?.quick).toEqual(["elle m’aime ?"]);
    expect(home?.answers["elle m’aime ?"]).toEqual({
      kind: "bubbles",
      bubbles: [{ text: "elle propose", messages: [SAMEDI] }],
      send: ["samedi 18h ça marche"],
      why: "tu dis oui, avec une heure",
    });
    const [quotidien, ouverture] = home?.script ?? [];
    expect(quotidien).toMatchObject({ mine: "je lui réponds quoi ?", answer: { incoming: [SAMEDI], bubbles: [{ text: "elle te tend la perche", messages: [] }] } });
    expect(ouverture).not.toHaveProperty("mine");
    expect(ouverture!.answer).not.toHaveProperty("incoming");
  });

  it("le mode sobre : le rapport doux de l’appli (ses libellés), sans chapitres", () => {
    const verdict: Verdict = { ...VERDICT, alerte: "detresse", mode_sobre: true, emoji: null };
    const sobre = {
      intro: "On met les vannes de côté.",
      titre: "Ce qui se passe",
      faits: "Léa ne répond plus.",
      preuves: ["m0007"],
      reassurance: "Ce n’est pas toi.",
      gestes: ["Parle à un ami"],
      brouillon: null,
    };
    const { payload } = apercuDe(sorties({ verdict, rapport: Sortie05.parse({ ...RAPPORT, alerte: "detresse", mode_sobre: true, chapitres: null, sobre }) }));
    expect(payload.report.chapters).toEqual([]);
    expect(payload.sober).toEqual(sobreAffiche({ sobre }));
    expect(payload.sober).toMatchObject({ title: "Ce qui se passe", steps: ["Parle à un ami"], draft: "" });
  });

  it("des captures : la conv se décrit par ses captures, pas comme un export", () => {
    const texte = ["# captures · instagram · 3 captures", "== 2026-03-01 10:00 ==", ...Array.from({ length: 24 }, (_, k) => `${k % 2 ? "Tom" : "Léa"}: message ${k}`)].join("\n");
    const base = sorties();
    const { story } = apercuDe(sorties({ texte, histoire: { ...base.histoire, appli: "instagram", format: "captures" } }));
    expect(story).toMatchObject({ totalMessages: 24, voiceCount: 0 });
    expect(story.sources[0]).toMatchObject({ app: "instagram", mode: "captures", screenshotCount: 3, label: "Instagram · 3 captures", messageCount: 24 });
  });

  it("sans mémoire : le rapport seul, ni fiche ni accueil", () => {
    expect(apercuDe(sorties({ memoire: null }))).toMatchObject({ fiche: null, home: null });
  });
});

describe("les fichiers d’aperçu (BLUSH_APERCU)", () => {
  let dossier: string;
  beforeEach(() => {
    dossier = mkdtempSync(join(tmpdir(), "blush-apercu-"));
  });
  afterEach(() => rmSync(dossier, { recursive: true, force: true }));

  it("un fichier du banc est mis en écrans ; un ancien aperçu, déjà en types du front, se lit tel quel ; un dossier, une conv par fichier", async () => {
    const ancien = { payload: { report: { verdict: { title: "Un ancien" } } }, story: {}, fiche: null, home: null };
    writeFileSync(join(dossier, "01.json"), JSON.stringify(sorties()));
    writeFileSync(join(dossier, "02.json"), JSON.stringify(ancien));
    expect(await lireApercu(null)).toBeNull();
    const un = await lireApercu(join(dossier, "01.json"));
    expect(un).toMatchObject({ cas: null, tous: [] });
    expect(un?.data).toEqual(apercuDe(sorties()));
    expect(await lireApercu(dossier, "02")).toEqual({ data: ancien, cas: "02", tous: ["01", "02"] });
    /* Un cas inconnu : le premier du dossier */
    expect((await lireApercu(dossier, "99"))?.cas).toBe("01");
    expect((await lireTous(dossier)).map((x) => x.cas)).toEqual(["01", "02"]);
  });
});
