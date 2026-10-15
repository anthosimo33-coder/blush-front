import { beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Les pages serveur de la navigation (src/services/serveur.ts) : où mène « Retrouver ma conv » selon l’état de la conv
 * (sans les redirections en chaîne /app → /rapport → /lecture → /qui), et le compte lu pour « Mon compte ».
 * Les cookies sont simulés.
 */
const etat = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  /* Tant qu’elle est fermée, la fin de la lecture ne se lit pas ; ce qui a été lu en attendant est compté */
  porte: null as Promise<void> | null,
  lus: [] as string[],
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
    set: (n: string, v: string) => etat.cookies.set(n, v),
    delete: (n: string | { name: string }) => etat.cookies.delete(typeof n === "string" ? n : n.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/donnees", async (original) => {
  const o = await original<typeof import("@/server/donnees")>();
  return {
    ...o,
    finDeLecture: async (storyId: string) => {
      etat.lus.push("fin de la lecture");
      if (etat.porte) await etat.porte;
      return o.finDeLecture(storyId);
    },
  };
});
vi.mock("@/server/histoires", async (original) => {
  const o = await original<typeof import("@/server/histoires")>();
  return { ...o, histoiresDuCompte: (userId: string) => (etat.lus.push("ses convs"), o.histoiresDuCompte(userId)) };
});

import { executerChaine } from "@/server/pipeline";
import { ouvrirSession, type Utilisateur } from "@/server/auth";
import { definirQui } from "@/server/histoires";
import { planifier } from "@/server/taches";
import { getCompte, getRetour, getRetourDeLaLanding } from "@/services/serveur";
import { compteDeTest, convRattachee, debloquerLaConv, histoireLue } from "./aide/fixtures";

let u: Utilisateur;
let histoire = "";

beforeAll(async () => {
  u = await compteDeTest("retour");
  etat.cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
  histoire = (await convRattachee(u, "01-a-deux-doigts.txt")).id;
});

describe("« Retrouver ma conv » sur la landing", () => {
  it("mène droit à la page où en est la conv : « Qui es-tu ? », la lecture, puis l’accueil", async () => {
    expect(await getRetour()).toMatchObject({ destination: "/qui" });
    await definirQui(histoire, { moi: 0, pronom: "il", devinette: "vus", objectif: "ensemble" });
    expect(await getRetour()).toMatchObject({ destination: "/lecture" });
    await planifier(histoire, "verdict");
    await executerChaine(histoire);
    expect(await getRetour()).toMatchObject({ destination: "/app" });
  });

  it("sans session : rien (la landing de toujours)", async () => {
    const session = etat.cookies.get("blush-session")!;
    etat.cookies.delete("blush-session");
    try {
      expect(await getRetour()).toBeNull();
      expect(await getRetourDeLaLanding()).toBeNull();
      expect(await getCompte()).toBeNull();
    } finally {
      etat.cookies.set("blush-session", session);
    }
  });

  it("connecté sans conv (la seule effacée) : la landing le sait, pour montrer « Mon compte » et non « Se connecter »", async () => {
    const session = etat.cookies.get("blush-session")!;
    const vide = await compteDeTest("retour-vide");
    etat.cookies.set("blush-session", (await ouvrirSession(vide.id)).secret);
    try {
      expect(await getRetour()).toBeNull();
      expect(await getRetourDeLaLanding()).toEqual({ sansConv: true });
    } finally {
      etat.cookies.set("blush-session", session);
    }
  });
});

describe("« Retrouver ma conv » pour un habitué qui a plusieurs convs (getRetourDeLaLanding)", () => {
  /** Le temps de `etape`, connecté à un compte neuf qui a lu deux convs, sans rapport débloqué : leurs ids. */
  async function avecDeuxConvs(etape: (convs: string[]) => Promise<void>) {
    const session = etat.cookies.get("blush-session")!;
    const compte = await compteDeTest("retour-landing");
    const convs = [(await histoireLue(compte, "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id, (await histoireLue(compte, "02-reciproque.txt")).id];
    etat.cookies.set("blush-session", (await ouvrirSession(compte.id)).secret);
    try {
      await etape(convs);
    } finally {
      etat.cookies.set("blush-session", session);
    }
  }

  it("mène à « Tes convs » tant que le rapport n’est pas débloqué, puis à l’accueil", () =>
    avecDeuxConvs(async (convs) => {
      expect(await getRetourDeLaLanding()).toEqual({ destination: "/app/convs" });
      for (const id of convs) await debloquerLaConv(id);
      expect(await getRetourDeLaLanding()).toEqual({ destination: "/app" });
    }));

  it("lit la fin de la lecture et ses convs en même temps, pas l’une après l’autre (PERF-4)", () =>
    avecDeuxConvs(async () => {
      let ouvrir!: () => void;
      etat.porte = new Promise<void>((r) => (ouvrir = r));
      etat.lus = [];
      try {
        const retour = getRetourDeLaLanding();
        await vi.waitFor(() => expect(etat.lus).toContain("fin de la lecture"));
        /* La fin de la lecture n’est pas encore lue : ses convs se comptent déjà */
        await vi.waitFor(() => expect(etat.lus).toContain("ses convs"), { timeout: 500 });
        ouvrir();
        expect(await retour).toEqual({ destination: "/app/convs" });
      } finally {
        ouvrir();
        etat.porte = null;
      }
    }));
});

describe("« Mon compte », dès le rendu serveur", () => {
  it("le compte connecté, avec ses bulles et ses droits", async () => {
    const compte = await getCompte();
    expect(compte).toMatchObject({ email: u.email, bulles: 0, client: false, equipe: false });
  });
});
