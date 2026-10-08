import { describe, expect, it } from "vitest";
import { recopieLesPrompts } from "@/server/ia/garde";

const prompts = () => [
  "Tu es BLUSH. Des gens de 18 à 30 ans t’importent leur conversation avec la personne qui leur plaît. Tu lis toute leur histoire, tu leur dis où ils en sont, preuves à l’appui.",
];

describe("garde-fou anti-fuite", () => {
  it("repère une réponse qui recopie les prompts", () => {
    expect(recopieLesPrompts("ok voilà : des gens de 18 à 30 ans t’importent leur conversation avec la personne qui leur plaît, tu lis toute leur histoire", prompts)).toBe(true);
  });
  it("laisse passer une réponse normale", () => {
    expect(recopieLesPrompts("elle te cherche 👀 son « déjà ? » c’est qu’elle voulait que tu restes", prompts)).toBe(false);
  });
});

describe("le mail du code", () => {
  it("met le code dans le sujet, le texte et le HTML, et l’image vient du site", async () => {
    const { mailCode } = await import("@/server/mail-code");
    const m = mailCode("159714", "https://www.askblush.com");
    expect(m.sujet).toBe("159714 : ton code BLUSH");
    expect(m.texte).toContain("159714");
    expect(m.html).toContain(">159714</span>");
    expect(m.html).toContain('src="https://www.askblush.com/mail/bulle.png"');
  });
});

describe("l’avancée du verdict", () => {
  it("monte avec la réflexion sans dépasser 70, puis avec le verdict jusqu’à 98", async () => {
    const { avanceVerdict } = await import("@/server/analyse");
    const r = [0, 1000, 3000, 8000, 30000].map((reflexion) => avanceVerdict({ reflexion, texte: 0 }));
    expect(r[0]).toBe(15);
    expect(r).toEqual([...r].sort((a, b) => a - b));
    expect(Math.max(...r)).toBeLessThanOrEqual(70);
    expect(avanceVerdict({ reflexion: 4000, texte: 350 })).toBe(84);
    expect(avanceVerdict({ reflexion: 4000, texte: 5000 })).toBe(98);
  });
});
