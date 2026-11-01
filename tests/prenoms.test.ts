import { describe, expect, it } from "vitest";
import { lire, rendre } from "@prompts/lib/conv";
import { storyAffichee } from "@/server/conv-affichee";
import { messagesAffiches } from "@/server/ecrans/messages";
import { definirQui, histoireDe, importer } from "@/server/histoires";
import { masqueDe } from "@/server/partages";
import { personnesDe } from "@/server/sequences";
import { accordDeTest, ligneEnBase } from "./aide/fixtures";
import { creees } from "./aide/nettoyage";

/*
 * Les prénoms, de l’import à ce que lit le modèle (src/server/histoires.ts, conv-affichee.ts) : un contact enregistré
 * sous un surnom ou un numéro, que « Qui es-tu ? » renomme, et deux personnes au même prénom, qui prennent deux noms
 * distincts sur les cartes, dans chaque ligne de la conv et dans les bulles des preuves. Les convs sont inventées.
 */

/** Un export WhatsApp d’iPhone inventé : `n` messages, un par minute le 1er octobre 2026, `toi` et `autre` en alternance. */
function exportIos(toi: string, autre: string, { n = 60, fichier = `Discussion WhatsApp avec ${autre}.txt` }: { n?: number; fichier?: string } = {}) {
  const lignes = Array.from({ length: n }, (_, k) => `[01/10/2026 ${10 + Math.floor(k / 60)}:${String(k % 60).padStart(2, "0")}:00] ${k % 2 ? autre : toi}: message ${k}`);
  return { appli: "whatsapp" as const, texte: lignes.join("\n"), nom: fichier };
}

const QUI = { moi: 0 as const, pronom: "il" as const, devinette: "parle" as const, objectif: "comprendre" as const };

async function importe(e: ReturnType<typeof exportIos>) {
  const imp = await importer(e, accordDeTest());
  creees.histoires.push(imp.id);
  return imp;
}

describe("un contact qui ne dit pas son prénom", () => {
  it("un surnom : gardé en entier, signalé à « Qui es-tu ? », remplacé par le prénom écrit", async () => {
    const imp = await importe(exportIos("Hugo", "Mon amour ❤️"));
    expect(imp.meta.participants[1]).toMatchObject({ nom: "Mon amour ❤️", prenom: "Mon amour" });
    expect(storyAffichee(imp.id, imp.meta).participants[1]).toMatchObject({ name: "Mon amour", initial: "M", nameCheck: "nickname" });
    const meta = await definirQui(imp.id, { ...QUI, prenomAutre: "Léa" });
    expect(histoireDe(meta).autre).toMatchObject({ prenom: "Léa", nomExport: "Mon amour ❤️" });
    /* Son prénom écrit : « Qui es-tu ? » n’a plus rien à demander */
    expect(storyAffichee(imp.id, meta).participants[1]).toMatchObject({ name: "Léa" });
    expect(storyAffichee(imp.id, meta).participants[1]!.nameCheck).toBeUndefined();
  });

  it("un prénom composé écrit avec une espace reste entier", async () => {
    const imp = await importe(exportIos("Hugo", "Mon cœur 💕"));
    expect(histoireDe(await definirQui(imp.id, { ...QUI, prenomAutre: "Anne Sophie" })).autre.prenom).toBe("Anne Sophie");
  });

  it("un possessif devant son prénom : le prénom, et un lien partagé le masque", async () => {
    const imp = await importe(exportIos("Hugo", "Ma Léa ❤️"));
    expect(storyAffichee(imp.id, imp.meta).participants[1]).toMatchObject({ name: "Léa" });
    await definirQui(imp.id, QUI);
    expect(masqueDe(await ligneEnBase(imp.id))("Léa te garde au chaud, Hugo")).toBe("L. te garde au chaud, Hugo");
  });

  it("un surnom qui contient son prénom (« Mon amour Léa ❤️ ») : un lien partagé masque aussi le prénom", async () => {
    const imp = await importe(exportIos("Clara", "Mon amour Léa ❤️"));
    await definirQui(imp.id, QUI);
    expect(masqueDe(await ligneEnBase(imp.id))("Léa te teste, mon amour")).toBe("L. te teste, mon amour");
  });

  it("un surnom venu du nom d’export (« Mon ex 💔 ») se masque entier, pas mot à mot", async () => {
    const imp = await importe(exportIos("Clara", "Mon ex 💔"));
    await definirQui(imp.id, QUI);
    expect(masqueDe(await ligneEnBase(imp.id))("Ton ex te teste : Mon ex sait")).toBe("Ton ex te teste : M. sait");
  });

  it("un mot qui situe le contact (« Kevin ex 💔 ») reste en clair dans un lien partagé, seul le prénom est masqué", async () => {
    const imp = await importe(exportIos("Clara", "Kevin ex 💔"));
    await definirQui(imp.id, QUI);
    expect(masqueDe(await ligneEnBase(imp.id))("Ton ex te teste, Kevin veut voir")).toBe("Ton ex te teste, K. veut voir");
  });

  it("un numéro : signalé, et remplacé par le prénom écrit", async () => {
    const imp = await importe(exportIos("Hugo", "+33 6 12 34 56 78", { fichier: "_chat.txt" }));
    expect(storyAffichee(imp.id, imp.meta).participants[1]).toMatchObject({ nameCheck: "unknown" });
    expect(histoireDe(await definirQui(imp.id, { ...QUI, prenomAutre: "Léa" })).autre.prenom).toBe("Léa");
  });

  it("un prénom : rien n’est signalé, et un prénom resté dans le parcours ne le remplace pas", async () => {
    const imp = await importe(exportIos("Hugo", "Léa"));
    expect(storyAffichee(imp.id, imp.meta).participants[1]!.nameCheck).toBeUndefined();
    expect(histoireDe(await definirQui(imp.id, { ...QUI, prenomAutre: "Sarah" })).autre.prenom).toBe("Léa");
  });
});

describe("deux personnes au même prénom", () => {
  it("deux noms distincts : sur les cartes, dans chaque ligne que lit le modèle, et dans les bulles", async () => {
    const e = exportIos("Léa Martin", "Léa Dubois", { fichier: "_chat.txt" });
    const imp = await importe(e);
    expect(storyAffichee(imp.id, imp.meta).participants).toMatchObject([
      { name: "Léa M.", detail: "Léa Martin · 30 messages" },
      { name: "Léa D.", detail: "Léa Dubois · 30 messages" },
    ]);
    const h = histoireDe(await definirQui(imp.id, { ...QUI, pronom: "elle" }));
    expect([h.utilisateur.prenom, h.autre.prenom]).toEqual(["Léa M.", "Léa D."]);
    const rendu = rendre({ ...h, aujourdhui: "2026-10-22" }, lire(e.texte, h));
    expect(rendu.histoire).toContain("Léa D.");
    expect([...rendu.lignes.values()][1]).toMatch(/ Léa D\. : message 1$/);
    const bulles = messagesAffiches(rendu.lignes, h.utilisateur.prenom);
    expect([...bulles.values()].slice(0, 2)).toMatchObject([
      { from: "toi", text: "message 0" },
      { from: "elle", text: "message 1", caption: expect.stringMatching(/^Léa D\. · /) },
    ]);
  });

  it("rien ne les distingue que leurs emojis : ses emojis ; rien du tout : « Léa (l’autre) »", async () => {
    const imp = await importe(exportIos("Léa", "Léa 🌸", { fichier: "_chat.txt" }));
    const h = histoireDe(await definirQui(imp.id, { ...QUI, pronom: "elle" }));
    expect([h.utilisateur.prenom, h.autre.prenom]).toEqual(["Léa", "Léa 🌸"]);
    expect(storyAffichee(imp.id, imp.meta).participants.map((p) => p.detail)).toEqual(["Léa · 30 messages", "Léa 🌸 · 30 messages"]);
    const memes = await importe(exportIos("Léa Martin", "Léa Moreau", { fichier: "_chat.txt" }));
    const meta = await definirQui(memes.id, { ...QUI, pronom: "elle" });
    expect(histoireDe(meta).autre.prenom).toBe("Léa (l’autre)");
    /* Les mails gardent les prénoms tels qu’on les connaît ; un lien partagé masque aussi le nom de famille */
    expect(personnesDe(meta)).toMatchObject({ moi: { prenom: "Léa" }, autre: { prenom: "Léa" } });
    expect(masqueDe(await ligneEnBase(memes.id))("Léa Moreau t’attend")).toBe("L. t’attend");
    /* À l’écran, jamais « (l’autre) » : « Léa & Léa » */
    expect(storyAffichee(memes.id, meta).participants.map((p) => p.name)).toEqual(["Léa", "Léa"]);
  });
});
