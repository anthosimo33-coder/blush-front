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
