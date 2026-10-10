import { readFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
    delete: (n: string) => etat.cookies.delete(n),
  }),
  headers: async () => new Headers(),
}));

import { executerChaine } from "@/server/analyse";
import { ouvrirSession } from "@/server/auth";
import { db, schema } from "@/server/db";
import { definirQui, depuisFichier, importer, rattacherBrouillon } from "@/server/histoires";
import { definirFactice } from "@/server/ia/claude";
import { fournisseurFactice } from "@/server/ia/factice";
import { planifier } from "@/server/taches";
import { getCompte, getRetour } from "@/services/serveur";

const email = `retour-${Date.now()}@blush.test`;
let histoire = "";

beforeAll(async () => {
  definirFactice(fournisseurFactice);
  const [u] = await db().insert(schema.users).values({ email }).returning();
  etat.cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
  const f = "01-a-deux-doigts.txt";
  const imp = await importer(await depuisFichier(new File([readFileSync(`prompts/evals/convs/${f}`)], f, { type: "text/plain" })));
  histoire = (await rattacherBrouillon(u, imp.secret))!;
});
afterAll(async () => {
  await db().delete(schema.users).where(inArray(schema.users.email, [email]));
  definirFactice(null);
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
      expect(await getCompte()).toBeNull();
    } finally {
      etat.cookies.set("blush-session", session);
    }
  });
});

describe("« Mon compte », dès le rendu serveur", () => {
  it("le compte connecté, avec son abonnement", async () => {
    const compte = await getCompte();
    expect(compte?.email).toBe(email);
    expect(compte?.subscription.plan).toBe("gratuit");
  });
});
