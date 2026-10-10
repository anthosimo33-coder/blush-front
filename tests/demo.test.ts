import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/* Les pages serveur de la démo lisent l’état recopié dans un cookie : les cookies sont simulés */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined) }),
  headers: async () => new Headers(),
}));

/*
 * Le mode démo : les branches démo d’api.ts et leurs données arrivent à la demande (src/services/demo.ts), l’état de
 * démo se lit toujours avant le premier await (côté serveur, avecEtat ne le pose que le temps de la partie synchrone :
 * serveur.ts appelle demo.ts), et le cookie qui le recopie pour le serveur ne porte rien de ce qu’il a écrit.
 */

describe("mode démo", () => {
  it("lit l’état posé par avecEtat avant son premier await", async () => {
    const { avecEtat } = await import("@/mocks/server");
    const demo = await import("@/services/demo");
    const plus = await avecEtat({ plan: "blushplus", verdict: "normal" }, () => demo.getReport());
    expect(plus.access).toBe("blushplus");
    expect(plus.report.chapters.every((c) => !c.locked)).toBe(true);
    const sobre = await avecEtat({ plan: "gratuit", verdict: "difficile" }, () => demo.getReport());
    expect(sobre.access).toBe("gratuit");
    expect(sobre.sober).not.toBeNull();
    /* Hors d’avecEtat : l’état de départ */
    expect((await demo.getReport()).access).toBe("gratuit");
    const compte = await avecEtat({ plan: "rapport", email: "hugo@blush.test" }, () => demo.getAccount());
    expect(compte.subscription.plan).toBe("rapport");
    expect(compte.email).toBe("hugo@blush.test");
    const question = await avecEtat({ questionAsked: "Elle voit quelqu’un d’autre ?" }, () => demo.getQuestion());
    expect(question?.question).toBe("Elle voit quelqu’un d’autre ?");
  });

  it("rend les pages serveur d’après l’état recopié dans le cookie de démo", async () => {
    const { DEMO_COOKIE, RESTE_DANS_LE_NAVIGATEUR } = await import("@/mocks/server");
    const { opened } = await import("@/services/demo");
    const serveur = await import("@/services/serveur");
    const cookie = (v: object) => etat.cookies.set(DEMO_COOKIE, encodeURIComponent(JSON.stringify(v)));
    /* Une idée toute prête : son rang suffit à rendre la question et sa réponse */
    cookie({ plan: "blushplus", email: true, question: 1 });
    expect((await serveur.getReport())?.access).toBe("blushplus");
    expect((await serveur.getQuestion())?.question).toBe(opened().questionIdeas[1].question);
    /* Son email et sa question à lui : leur ligne, sans leur texte, qui arrive à la relecture du navigateur */
    expect((await serveur.getCompte())?.email).toBe(RESTE_DANS_LE_NAVIGATEUR);
    cookie({ plan: "blushplus", email: false, question: true });
    expect((await serveur.getQuestion())?.question).toBe(RESTE_DANS_LE_NAVIGATEUR);
    expect((await serveur.getCompte())?.email).toBeNull();
    cookie({ plan: "blushplus", question: false });
    expect(await serveur.getQuestion()).toBeNull();
    etat.cookies.clear();
    expect((await serveur.getReport())?.access).toBe("gratuit");
    expect((await serveur.getFiche())?.person.name).toBe("Sophie");
  });

  it("ne recopie dans le cookie rien de ce qu’il a écrit", async () => {
    const stockage = new Map<string, string>();
    const page = { cookie: "" };
    vi.stubGlobal("window", { sessionStorage: { getItem: (k: string) => stockage.get(k) ?? null, setItem: (k: string, v: string) => stockage.set(k, v) } });
    vi.stubGlobal("document", page);
    try {
      const { DEMO_COOKIE, mockServer } = await import("@/mocks/server");
      const { opened } = await import("@/services/demo");
      const recopie = () => JSON.parse(decodeURIComponent(page.cookie.slice(`${DEMO_COOKIE}=`.length).split(";")[0])) as Record<string, unknown>;
      mockServer.set({ plan: "rapport", email: "hugo@blush.test", questionAsked: "elle pense à moi le soir ?" });
      expect(recopie()).toEqual({ plan: "rapport", verdict: "normal", paused: false, cancelled: false, storyDeleted: false, email: true, question: true });
      expect(page.cookie).not.toContain("hugo");
      mockServer.set({ questionAsked: opened().questionIdeas[2].question, questionIdee: 2 });
      expect(recopie().question).toBe(2);
      /* Le navigateur garde le texte : sessionStorage, qui ne part pas vers le serveur */
      expect(mockServer.get().email).toBe("hugo@blush.test");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("répond comme avant depuis api.ts, qui charge la démo à la demande", async () => {
    const api = await import("@/services/api");
    expect((await api.getReport()).access).toBe("gratuit");
    expect((await api.getFiche()).person.name).toBe("Sophie");
    expect((await api.getAccount()).subscription.plan).toBe("gratuit");
    expect((await api.getQuickQuestions()).length).toBeGreaterThan(0);
    /* Aucun mock importé d’office : avec le back-end, ni la fiche de démo ni son faux back-end ne partent vers le navigateur */
    const source = readFileSync(new URL("../src/services/api.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^import [^;]*from "@\/mocks\//m);
  });

  it("garde les données de démo derrière l’import à la demande", async () => {
    const demo = await import("@/services/demo");
    const { vocalDemo } = await import("@/mocks/vocal");
    const { FICHE_FINDINGS } = await import("@/mocks/quotidien");
    expect(demo.opened().story.participants.length).toBe(2);
    expect(vocalDemo(false).etat).toBe("pret");
    expect(Object.keys(FICHE_FINDINGS)).toEqual(["captures", "export"]);
  });
});
