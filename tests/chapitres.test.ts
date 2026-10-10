import { describe, expect, it } from "vitest";
import { cardsOf } from "@/app/rapport/verdict/cartes";
import { chapitresAffiches, tempsDeLecture } from "@prompts/lib/front";
import type { Rapport } from "@prompts/lib/schemas";
import { CHAPITRES_OFFERTS, CHAPITRES_PAYANTS, estOffert, NB_CHAPITRES, PREMIER_PAYANT, titreDAttente } from "@/contenu/chapitres";
import { lectureDe } from "@/server/analyse";
import { mailRapport } from "@/server/mail-rapport";
import type { ReportPayload } from "@/services/api";
import type { Chapter } from "@/types";

describe("les chapitres du rapport : seul le chapitre 1 est offert", () => {
  it("huit chapitres, le verdict offert, la lecture reprend au 2", () => {
    expect(NB_CHAPITRES).toBe(8);
    expect(CHAPITRES_OFFERTS).toBe(1);
    expect(PREMIER_PAYANT).toBe(2);
    expect(CHAPITRES_PAYANTS).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].filter(estOffert)).toEqual([1]);
  });

  it("les titres d’attente : le 5 porte le prénom de l’autre", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => titreDAttente(n, "Maëlys"))).toEqual([
      "Le verdict",
      "Le moment où tout a basculé",
      "Votre histoire, en actes",
      "Ce qui coince",
      "Maëlys",
      "Toi",
      "Votre duo",
      "Ton prochain pas",
    ]);
  });

  /* Le sommaire du mail, lu dans son HTML : la pastille du numéro, puis le titre */
  const sommaireDuMail = (html: string) => [...html.matchAll(/>(\d)<\/div><\/td><td class="encre"[^>]*>([^<]+)</g)].map((m) => [Number(m[1]), m[2]]);

  it("le sommaire du mail : les titres du rapport, dans l’ordre, le 5 au prénom de l’autre", () => {
    const { html } = mailRapport({ base: "https://www.askblush.com", lien: "x", chapitres: 8, lecture: "9 min", autre: "Maëlys", sobre: false });
    expect(sommaireDuMail(html)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, titreDAttente(n, "Maëlys")]));
    /* Le mode sobre n’a pas de sommaire : aucun prénom */
    expect(sommaireDuMail(mailRapport({ base: "x", lien: "x", chapitres: 1, lecture: "2 min", autre: "Maëlys", sobre: true }).html)).toEqual([]);
  });

  it("le prénom de l’autre reste du texte dans le HTML du mail", () => {
    const { html } = mailRapport({ base: "x", lien: "x", chapitres: 8, lecture: "9 min", autre: "<b>Léa & Zoé</b>", sobre: false });
    expect(sommaireDuMail(html)[4]).toEqual([5, "&lt;b&gt;Léa &amp; Zoé&lt;/b&gt;"]);
    expect(html).not.toContain("<b>Léa");
  });

  it("le sous-module des prompts ne marque « free » que les chapitres offerts", () => {
    const rapport = { chapitres: Array.from({ length: NB_CHAPITRES }, (_, k) => ({ numero: k + 1, titre: "t", titre_court: "t", surtitre: null, blocs: [] })) } as unknown as Rapport;
    expect(chapitresAffiches(rapport, new Map(), []).map((c) => c.free)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(estOffert));
  });

  it("le temps de lecture offert ne compte que le chapitre 1, même quand un chapitre 2 est marqué « free »", () => {
    const court: Chapter = { number: 1, title: "Le verdict", tocTitle: "Le verdict", free: true, blocks: [{ kind: "meaning", text: "L’envie est là des deux côtés." }] };
    /* Un `free` vrai au chapitre 2, comme le marquait le sous-module des prompts avant de n’offrir que le chapitre 1 : il n’est pas lu */
    const long: Chapter = { number: 2, title: "Le moment où tout a basculé", tocTitle: "La bascule", free: true, blocks: [{ kind: "story", text: "mot ".repeat(2_300) }] };
    expect(lectureDe([court, long])).toEqual({ free: tempsDeLecture([court]), full: tempsDeLecture([court, long]) });
    expect(lectureDe([court, long])).toEqual({ free: "1 min", full: "10 min" });
  });
});

describe("la révélation du verdict ne montre rien de payant sans accès", () => {
  const verdict: Chapter = {
    number: 1,
    title: "Le verdict",
    tocTitle: "Le verdict",
    free: true,
    blocks: [
      { kind: "scores", rows: [{ label: "Qui écrit en premier", winner: "toi", toiPercent: 62 }] },
      { kind: "meaning", text: "L’envie est là des deux côtés." },
      { kind: "confidence", level: "sur", text: "12 preuves dans votre conv" },
    ],
  };
  const bascule: Chapter = {
    number: 2,
    title: "Le moment où tout a basculé",
    kicker: "2 mars, 23 h 41",
    tocTitle: "La bascule",
    free: false,
    blocks: [
      { kind: "essential", text: "La seule fois où l’un de vous a posé la question, c’était elle." },
      { kind: "seen", messages: [{ from: "elle", text: "au fait on est quoi toi et moi" }, { from: "toi", text: "mdr" }], factsAfter: ["Ses messages raccourcissent."] },
      { kind: "play", text: "Pose-lui la question, en face." },
    ],
  };
  const fermes = CHAPITRES_PAYANTS.map((n): Chapter => ({ number: n, title: titreDAttente(n, "Maëlys"), tocTitle: titreDAttente(n, "Maëlys"), free: false, locked: true, blocks: [] }));
  const payload = (chapters: Chapter[], access: ReportPayload["access"]): ReportPayload => ({
    report: {
      storyId: "s",
      verdict: { emoji: "🤏", short: "À deux doigts", title: "Vous êtes à deux doigts.", subtitle: "", difficult: false },
      chapters,
      readingTime: { free: "1 min", full: "9 min" },
      level: "parle",
      trend: "",
      nextStep: "",
    },
    sober: null,
    access,
  });

  it("un compte gratuit : quatre cartes, toutes tirées du verdict", () => {
    const cartes = cardsOf(payload([verdict, ...fermes], "gratuit"));
    expect(cartes.map((c) => c.id)).toEqual(["chiffres", "verdict", "duel", "jouer"]);
    expect(cartes.at(-1)).toEqual({ id: "jouer", text: undefined, quote: undefined });
    /* Même un chapitre 2 fermé qui aurait du contenu n’est pas lu */
    const fuite = cardsOf(payload([verdict, { ...bascule, locked: true }, ...fermes.slice(1)], "gratuit"));
    expect(fuite).toEqual(cartes);
  });

  it("un rapport BLUSH+ écrit : le moment, et « à toi de jouer » du chapitre 2", () => {
    const ecrits = [verdict, bascule, ...fermes.slice(1).map((c) => ({ ...c, locked: false, blocks: [{ kind: "punchline" as const, text: "fin" }] }))];
    const cartes = cardsOf(payload(ecrits, "blushplus"));
    expect(cartes.map((c) => c.id)).toEqual(["chiffres", "verdict", "duel", "moment", "jouer"]);
    expect(cartes[3]).toMatchObject({ id: "moment", kicker: "2 mars, 23 h 41", title: "Le moment où tout a basculé", fact: "Ses messages raccourcissent." });
    expect(cartes[4]).toEqual({ id: "jouer", text: "Pose-lui la question, en face.", quote: "au fait on est quoi toi et moi" });
  });
});
