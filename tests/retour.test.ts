import { beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Les pages serveur de la navigation (src/services/serveur.ts) : où mène « Retrouver ma conv » selon l’état de la conv
 * (sans les redirections en chaîne /app → /rapport → /lecture → /qui), et le compte lu pour « Mon compte ».
 * Les cookies sont simulés.
 */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
    set: (n: string, v: string) => etat.cookies.set(n, v),
    delete: (n: string | { name: string }) => etat.cookies.delete(typeof n === "string" ? n : n.name),
  }),
  headers: async () => new Headers(),
}));

import { executerChaine } from "@/server/pipeline";
import { ouvrirSession, type Utilisateur } from "@/server/auth";
import { definirQui } from "@/server/histoires";
import { planifier } from "@/server/taches";
import { getCompte, getRetour, getRetourDeLaLanding } from "@/services/serveur";
import { compteDeTest, convRattachee } from "./aide/fixtures";

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

describe("« Mon compte », dès le rendu serveur", () => {
  it("le compte connecté, avec ses bulles et ses droits", async () => {
    const compte = await getCompte();
    expect(compte).toMatchObject({ email: u.email, bulles: 0, client: false, equipe: false });
  });
});
