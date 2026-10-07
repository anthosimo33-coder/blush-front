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
