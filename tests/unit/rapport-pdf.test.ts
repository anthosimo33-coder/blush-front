import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pdfDuRapport, type RapportEnPdf } from "@/server/rapport-pdf";
import { lirePdf } from "../aide/pdf";
import { HISTOIRE, rapportComplet, rapportGratuit, rapportSobre } from "../aide/rapport-exemple";

/*
 * Le rapport en PDF (src/server/rapport-pdf.tsx), sans base, sur un rapport inventé (tests/aide/rapport-exemple.ts) : un
 * vrai PDF de pages A4, Nunito embarquée, rien de personnel dans ses métadonnées, chaque sorte de bloc dans son texte,
 * rien des chapitres fermés d’un aperçu gratuit, et le rapport doux du mode sobre tel quel. Sans réseau : les emojis,
 * que le serveur va chercher chez Fluent, sont ici un rond jaune (un vrai SVG, dessiné comme les leurs).
 */

const ROND = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#FFCC4D"/></svg>';
/** Les adresses d’emojis demandées pendant le test. */
let demandes: string[] = [];
/* Le vrai fetch, pour le reste (le moteur de next/og charge son wasm par lui) */
const fetchReel = globalThis.fetch;
beforeEach(() => {
  demandes = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (!String(url).includes("/fluentui-emoji-unicode/")) return fetchReel(url, init);
    demandes.push(String(url));
    return new Response(ROND, { headers: { "content-type": "image/svg+xml" } });
  });
});
afterEach(() => vi.restoreAllMocks());

const LE = new Date("2026-10-13T18:00:00Z");
const pdf = async (payload: RapportEnPdf["payload"]) => lirePdf(await pdfDuRapport({ payload, story: HISTOIRE, le: LE, site: "https://www.askblush.com" }));
/** Le texte, ses blancs (insécables comprises) ramenés à une espace : une ligne coupée se recolle. */
const plat = (texte: string) => texte.replace(/\s+/g, " ");

describe("le rapport en PDF", () => {
  it("est un PDF de plusieurs pages A4, Nunito embarquée, sans rien de personnel dans ses métadonnées", async () => {
    const lu = await pdf(rapportComplet());
    expect(lu.entete).toMatch(/^%PDF-1\.\d/);
    expect(lu.pages.length).toBeGreaterThanOrEqual(5);
    expect(lu.pages.every((p) => Math.round(p.largeur) === 595 && Math.round(p.hauteur) === 842)).toBe(true);
    /* Les deux graisses, en sous-ensemble («\u00a0ABCDEF+\u00a0» devant leur nom), leur fichier dans le PDF */
    const nunito = lu.polices.filter((p) => /\+Nunito-(Black|ExtraBold)$/.test(p.nom));
    expect(new Set(nunito.map((p) => p.nom.split("+")[1]))).toEqual(new Set(["Nunito-Black", "Nunito-ExtraBold"]));
    expect(lu.polices.every((p) => p.embarquee)).toBe(true);
    expect(lu.meta).toMatchObject({ Title: "Ton rapport BLUSH", Author: "BLUSH", Creator: "BLUSH", Producer: "BLUSH" });
    expect(Object.values(lu.meta).join(" ")).not.toMatch(/Noé|Maëlys/);
    expect(lu.liens.every((l) => l === "https://www.askblush.com")).toBe(true);
    /* L’emoji du verdict (360 px) et ceux du texte (72 px), demandés chez Fluent : des images, jamais un glyphe vide */
    expect(lu.images.some((i) => i.largeur === 360)).toBe(true);
    expect(lu.images.some((i) => i.largeur === 72)).toBe(true);
    expect(demandes.length).toBeGreaterThan(0);
    expect(demandes.every((u) => u.includes("/fluentui-emoji-unicode/"))).toBe(true);
    expect(lu.texte).not.toContain("\ufffd");
  });

  it("garde l’ordre de l’écran : la page de garde, le verdict, puis chaque chapitre et toutes ses sortes de blocs", async () => {
    const lu = await pdf(rapportComplet());
    const garde = plat(lu.pages[0]!.texte);
    for (const morceau of [
      "Le rapport de votre histoire",
      "Noé & Maëlys",
      "Complet",
      "1 274",
      "messages",
      "9 min",
      "Vous êtes à deux doigts.",
      "Ton résumé vocal t’attend dans l’appli",
      "Ton rapport du 13 octobre 2026",
    ])
      expect(garde).toContain(morceau);
    const texte = plat(lu.texte);
    const attendus = [
      "Assieds-toi. Trois mois de conv", // lead
      "Qui relance après un silence", // scores
      "Ce que ça veut dire", // meaning
      "14 preuves dans votre conv", // confidence
      "Maëlys · 04/09 23:12", // story, et qui parle, et quand
      "Elle a ouvert la porte. Tu as répondu avec un micro.", // punchline
      "La seule fois où l’un de vous a posé la question, c’était elle.", // essential
      "Ses messages passent ensuite de 28 mots en moyenne à 9.", // seen
      "Repose-lui la question, en face", // play
      "21 août · le premier date", // timeline
      "Le «\u00a0mdr\u00a0» qui ferme la porte", // stop
      "Le Stratège & la Relanceuse", // duo
      "La reine de la relance",
      "Si tu lui demandes samedi, en face", // scenarios
      "Le meilleur",
      "Propose le vide-grenier", // plan
      "J’aime bien ce qu’on a. Toi, tu le vois comment", // question
      "Le mot de la fin", // ending
    ];
    for (const a of attendus) expect(texte, a).toContain(plat(a));
    /* Dans l’ordre des chapitres */
    const places = ["Le verdict", "Le moment où tout a basculé", "Votre histoire", "Ce que vous ne dites pas", "Votre duo", "Ton prochain pas"].map((t) => texte.indexOf(t));
    expect(places).toEqual([...places].sort((a, b) => a - b));
    /* Chaque page de texte a son pied et son numéro */
    lu.pages.slice(1).forEach((p, i) => {
      expect(plat(p.texte)).toContain("askblush.com · ton rapport, rien qu’à toi");
      expect(plat(p.texte)).toContain(`${i + 2} / ${lu.pages.length}`);
    });
  });

  it("d’un aperçu gratuit : le verdict et le chapitre 1, les titres des chapitres fermés, rien de leur contenu", async () => {
    const lu = await pdf(rapportGratuit());
    const texte = plat(lu.texte);
    expect(texte).toContain("Aperçu gratuit");
    expect(texte).toContain("Qui relance après un silence");
    expect(texte).toContain("La suite de ton rapport · 7 chapitres");
    for (const titre of ["Le moment où tout a basculé", "Ce que vous ne dites pas", "Votre duo", "Ton prochain pas"]) expect(texte).toContain(titre);
    expect(texte).toContain("La suite t’attend sur askblush.com");
    for (const ferme of ["Tu ne dis jamais non", "Le Stratège & la Relanceuse", "Propose le vide-grenier", "deux légendes du karaoké", "Assieds-toi"])
      expect(texte).not.toContain(ferme);
    expect(texte).not.toContain("Ton résumé vocal");
  });

  it("du mode sobre : le rapport doux tel quel, ses lignes d’écoute, ni verdict ni chapitre", async () => {
    const lu = await pdf(rapportSobre());
    const texte = plat(lu.texte);
    for (const morceau of [
      "Ce qui se passe n’est pas de ta faute.",
      "Passe à autre chose, proprement.",
      "Parles-en à une personne de confiance.",
      "Si tu veux lui écrire",
      "Fil Santé Jeunes",
      "SOS Amitié",
    ])
      expect(texte).toContain(morceau);
    expect(texte).not.toContain("Vous êtes à deux doigts.");
    expect(texte).not.toContain("Le verdict");
  });
});
