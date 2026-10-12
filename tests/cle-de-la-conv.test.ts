import { beforeAll, describe, expect, it, vi } from "vitest";

/*
 * La clé de ce que l’accueil et sa fiche gardent pendant la visite (idDeLaConv, src/services/serveur.ts) : l’identifiant
 * de la conv que la page montre, résolu par le contexte de la requête. Sans le cookie de « Tes convs » (une connexion
 * sans brouillon), c’est la dernière conv du compte, jamais une clé vide qui vaudrait pour toutes ses convs : l’échange
 * d’une conv ne se fond pas dans la suivante quand celle que le serveur résout change. Les cookies sont simulés.
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

import { ouvrirSession, type Utilisateur } from "@/server/auth";
import { STORY_COOKIE } from "@/services/session";
import { idDeLaConv } from "@/services/serveur";
import { compteDeTest, convRattachee } from "./aide/fixtures";

let u: Utilisateur;

beforeAll(async () => {
  u = await compteDeTest("cle-conv");
  etat.cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
});

describe("idDeLaConv : la clé de la conv affichée", () => {
  it("sans cookie de conv : la dernière conv du compte, puis la suivante quand une autre arrive", async () => {
    etat.cookies.delete(STORY_COOKIE);
    const premiere = (await convRattachee(u, "01-a-deux-doigts.txt")).id;
    etat.cookies.delete(STORY_COOKIE);
    expect(await idDeLaConv()).toBe(premiere);
    const seconde = (await convRattachee(u, "01-a-deux-doigts.txt")).id;
    etat.cookies.delete(STORY_COOKIE);
    expect(await idDeLaConv()).toBe(seconde);
    expect(seconde).not.toBe(premiere);
  });

  it("avec le cookie de « Tes convs » : la conv choisie ; sans session : rien", async () => {
    etat.cookies.delete(STORY_COOKIE);
    const derniere = await idDeLaConv();
    const autre = (await convRattachee(u, "01-a-deux-doigts.txt")).id;
    etat.cookies.set(STORY_COOKIE, derniere!);
    try {
      expect(await idDeLaConv()).toBe(derniere);
      expect(autre).not.toBe(derniere);
    } finally {
      etat.cookies.delete(STORY_COOKIE);
    }
    const session = etat.cookies.get("blush-session")!;
    etat.cookies.delete("blush-session");
    try {
      expect(await idDeLaConv()).toBeNull();
    } finally {
      etat.cookies.set("blush-session", session);
    }
  });
});
