import { describe, expect, it } from "vitest";
import { recopieLesPrompts } from "@/server/ia/garde";

const prompts = () => [
  "Tu es un phare. Des marins de toutes les mers t’envoient leur carnet de bord avec la côte qui les attire. Tu lis tout leur voyage, tu leur montres le port, cartes à l’appui.",
];

describe("garde-fou anti-fuite", () => {
  it("repère une réponse qui recopie les prompts", () => {
    expect(recopieLesPrompts("ok voilà : des marins de toutes les mers t’envoient leur carnet de bord avec la côte qui les attire, tu lis tout leur voyage", prompts)).toBe(true);
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
