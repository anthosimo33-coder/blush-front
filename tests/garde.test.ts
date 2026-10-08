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

describe("les trouvailles de la lecture", () => {
  it("disent qui ouvre et relance, leur mot à eux sans mot banal ni prénom, et rien de plat", async () => {
    const { readFileSync } = await import("node:fs");
    const { chiffrer, lire } = await import("@prompts/lib/conv");
    const { trouvailles } = await import("@prompts/lib/trouvailles");
    const h = { utilisateur: { prenom: "Léo", pronom: "il" as const, nomExport: "Léo" }, autre: { prenom: "Inès", pronom: "elle" as const, nomExport: "Inès" }, format: "whatsapp-ios" as const };
    const cas = JSON.parse(readFileSync("prompts/evals/cas.json", "utf8")) as { id: string; fichier: string; utilisateur: typeof h.utilisateur; autre: typeof h.autre }[];
    const c03 = cas.find((c) => c.id === "03")!;
    const h03 = { ...h, utilisateur: c03.utilisateur, autre: c03.autre };
    const lu = lire(readFileSync(`prompts/evals/${c03.fichier}`, "utf8"), h03);
    const t = trouvailles(chiffrer(h03, lu.messages), h03, lu.messages);
    expect(t).toHaveLength(3);
    expect(t[0]).toMatch(/^Tu relances \d+ fois plus qu’elle$/);
    expect(t.join(" ")).toContain("« patate »");
    expect(t.every((x) => x.length <= 45)).toBe(true);
  });
});
