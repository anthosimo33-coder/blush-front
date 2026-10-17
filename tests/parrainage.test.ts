import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Le parrainage (src/server/parrainage.ts) : un code par compte, le lien /p/<code> qui le garde dans un cookie, la
 * marraine notée sur un compte neuf seulement, et au premier rapport payé de la filleule, 10 bulles chacune, une fois ;
 * reprises si ce rapport est remboursé. Les cookies de Next, les alertes et la relance de la chaîne sont simulés.
 */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>(), relancees: [] as string[] }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) => (etat.cookies.has(nom) ? { value: etat.cookies.get(nom)! } : undefined),
    has: (nom: string) => etat.cookies.has(nom),
    set: (nom: string, valeur: string) => void etat.cookies.set(nom, valeur),
    delete: (o: string | { name: string }) => void etat.cookies.delete(typeof o === "string" ? o : o.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/alertes", async (original) => ({ ...(await original<typeof import("@/server/alertes")>()), alerter: async () => {} }));
vi.mock("@/server/pipeline", async (original) => ({
  ...(await original<typeof import("@/server/pipeline")>()),
  reparerLaChaine: async (story: { id: string }) => (etat.relancees.push(story.id), true),
}));

import { GET as lienDUneAmie } from "@/app/p/[code]/route";
import { PARRAINAGE } from "@/contenu/offres";
import { livrer, reprendre } from "@/server/achats";
import type { Utilisateur } from "@/server/auth";
import { soldeDe } from "@/server/bulles";
import { db, schema } from "@/server/db";
import { CODE, codeDe, lienDeParrainage, noterLaMarraine } from "@/server/parrainage";
import { compteDeTest, convRattachee } from "./aide/fixtures";

beforeEach(() => etat.cookies.clear());

/** Un rapport de cette conv, commandé puis livré comme payé. */
async function payerLeRapport(u: Utilisateur, storyId: string): Promise<string> {
  const [achat] = await db()
    .insert(schema.achats)
    .values({ userId: u.id, storyId, offre: "rapport", centimes: 1390, bulles: 10, fournisseur: "factice" })
    .returning({ id: schema.achats.id });
  await livrer(achat!.id, { paiementId: `pay_${achat!.id}` });
  return achat!.id;
}

/** Une marraine et sa filleule : un compte neuf, venu par son lien. */
async function marraineEtFilleule(prefixe: string) {
  const marraine = await compteDeTest(`${prefixe}-marraine`);
  const filleule = await compteDeTest(`${prefixe}-filleule`);
  expect(await noterLaMarraine(filleule, await codeDe(marraine.id))).toBe(true);
  return { marraine, filleule };
}

describe("le parrainage", () => {
  it("un code par compte, toujours le même, et son lien", async () => {
    const u = await compteDeTest("parrainage-code");
    const code = await codeDe(u.id);
    expect(code).toMatch(CODE);
    expect(await codeDe(u.id)).toBe(code);
    expect(await lienDeParrainage(u.id)).toMatch(new RegExp(`/p/${code}$`));
  });

  it("le lien d’une amie garde son code dans un cookie et mène à la landing ; un code mal formé, rien", async () => {
    const appel = (code: string) => lienDUneAmie(new Request(`http://localhost/p/${code}`), { params: Promise.resolve({ code }) });
    const r = await appel("abcdefg");
    expect(r.status).toBe(307);
    expect(new URL(r.headers.get("location")!).pathname).toBe("/");
    expect([...etat.cookies.values()]).toEqual(["abcdefg"]);
    etat.cookies.clear();
    await appel("../admin");
    await appel("ABCDEFG");
    expect(etat.cookies.size).toBe(0);
  });

  it("la marraine : sur un compte neuf seulement, jamais soi-même, jamais remplacée, jamais un code inconnu", async () => {
    const marraine = await compteDeTest("parrainage-m");
    const code = await codeDe(marraine.id);
    expect(await noterLaMarraine(marraine, code)).toBe(false);
    const ancien = await compteDeTest("parrainage-ancien");
    expect(await noterLaMarraine({ ...ancien, createdAt: new Date(Date.now() - 2 * 3600e3) }, code)).toBe(false);
    const neuf = await compteDeTest("parrainage-neuf");
    expect(await noterLaMarraine(neuf, "zzzzzzz")).toBe(false);
    expect(await noterLaMarraine(neuf, code)).toBe(true);
    const autre = await compteDeTest("parrainage-autre");
    expect(await noterLaMarraine(neuf, await codeDe(autre.id))).toBe(false);
    const [l] = await db().select({ parrain: schema.users.parrainId }).from(schema.users).where(eq(schema.users.id, neuf.id));
    expect(l).toEqual({ parrain: marraine.id });
  });

  it("au premier rapport payé de la filleule : 10 bulles chacune, une fois ; un 2e rapport, rien de plus", async () => {
    const { marraine, filleule } = await marraineEtFilleule("parrainage-paye");
    await payerLeRapport(filleule, (await convRattachee(filleule, "01-a-deux-doigts.txt")).id);
    expect(await soldeDe(filleule.id)).toBe(10 + PARRAINAGE.bulles);
    expect(await soldeDe(marraine.id)).toBe(PARRAINAGE.bulles);
    await payerLeRapport(filleule, (await convRattachee(filleule, "01-a-deux-doigts.txt")).id);
    expect(await soldeDe(filleule.id)).toBe(20 + PARRAINAGE.bulles);
    expect(await soldeDe(marraine.id)).toBe(PARRAINAGE.bulles);
  });

  it("son rapport remboursé, sans autre rapport payé : les bulles du parrainage reprises aux deux, une fois", async () => {
    const { marraine, filleule } = await marraineEtFilleule("parrainage-rembourse");
    const achat = await payerLeRapport(filleule, (await convRattachee(filleule, "01-a-deux-doigts.txt")).id);
    await reprendre(achat, "rembourse");
    await reprendre(achat, "rembourse");
    expect(await soldeDe(filleule.id)).toBe(0);
    expect(await soldeDe(marraine.id)).toBe(0);
    const reprises = await db()
      .select({ delta: schema.mouvementsBulles.delta })
      .from(schema.mouvementsBulles)
      .where(and(eq(schema.mouvementsBulles.userId, marraine.id), eq(schema.mouvementsBulles.raison, "remboursement")));
    expect(reprises).toEqual([{ delta: -PARRAINAGE.bulles }]);
  });

  it("sans marraine : rien de plus que les bulles du rapport", async () => {
    const seule = await compteDeTest("parrainage-seule");
    await payerLeRapport(seule, (await convRattachee(seule, "01-a-deux-doigts.txt")).id);
    expect(await soldeDe(seule.id)).toBe(10);
  });
});
