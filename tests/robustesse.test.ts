import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { and, eq, inArray, sql } from "drizzle-orm";
import { zipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Requete } from "@prompts/lib/contextes";

/* after() de Next ne vit que dans une requête : ici, on garde ce qui devait partir après la réponse, pour le lancer soi-même */
const apres = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => apres.push(f) }));

import { executerChaine, type DonneesVerdict } from "@/server/analyse";
import { verifierCode, type Utilisateur } from "@/server/auth";
import { dechiffrer, empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { rapportDe } from "@/server/donnees";
import { definirQui, depuisFichier, depuisPaquet, ErreurImport, importer, rattacherBrouillon, type LigneComplete } from "@/server/histoires";
import { definirFactice, REFUS_FACTICE } from "@/server/ia/claude";
import { fournisseurFactice } from "@/server/ia/factice";
import { planifier, prendre } from "@/server/taches";

const emails = [`robuste-${Date.now()}@blush.test`, `robuste-code-${Date.now()}@blush.test`];
const ligne = async (id: string) => (await db().select().from(schema.stories).where(eq(schema.stories.id, id)))[0] as LigneComplete;
const conv = (f: string) => new File([readFileSync(`prompts/evals/convs/${f}`)], f, { type: "text/plain" });
const lancerApres = async () => {
  while (apres.length) await apres.shift()!();
};

/* Le verdict factice, modifiable test par test (l’alerte, le mode sobre). Le modèle factice n’écrit pas de rapport sobre : on le fait refuser */
let verdict: Record<string, unknown> = {};
let refuserRapport = false;
let u: Utilisateur;

beforeAll(async () => {
  definirFactice((req: Requete) => {
    if (refuserRapport && req.tache === "05-rapport") return REFUS_FACTICE;
    const s = fournisseurFactice(req) as Record<string, unknown>;
    return req.tache === "04-verdict" ? { ...s, ...verdict } : s;
  });
  [u] = await db().insert(schema.users).values({ email: emails[0] }).returning();
});
afterAll(async () => {
  await db().delete(schema.users).where(inArray(schema.users.email, emails));
  await db().delete(schema.loginCodes).where(eq(schema.loginCodes.email, emails[1]));
  definirFactice(null);
});

/** Une conv importée, rattachée au compte, « Qui es-tu ? » rempli, son verdict lu. */
async function lue(f: string): Promise<string> {
  const imp = await importer(await depuisFichier(conv(f)));
  await rattacherBrouillon(u, imp.secret);
  await definirQui(imp.id, { moi: 0, pronom: "il", devinette: "vus", objectif: "ensemble" });
  await planifier(imp.id, "verdict");
  await executerChaine(imp.id);
  return imp.id;
}

describe("le code de connexion", () => {
  const email = emails[1];
  const poserCode = (code: string) =>
    db()
      .insert(schema.loginCodes)
      .values({ email, codeHash: empreinte(`${email}:${code}`), expiresAt: new Date(Date.now() + 600e3), attempts: 0, createdAt: new Date() })
      .onConflictDoUpdate({ target: schema.loginCodes.email, set: { codeHash: empreinte(`${email}:${code}`), attempts: 0, expiresAt: new Date(Date.now() + 600e3) } });

  it("ne laisse pas passer plus de 5 essais, même envoyés en même temps", async () => {
    await poserCode("123456");
    await Promise.all(Array.from({ length: 20 }, (_, k) => verifierCode(email, String(200000 + k))));
    const [c] = await db().select().from(schema.loginCodes).where(eq(schema.loginCodes.email, email));
    expect(c.attempts).toBe(5);
    /* Le bon code ne marche plus : les essais sont épuisés */
    expect(await verifierCode(email, "123456")).toBeNull();
  });

  it("ne sert qu’une fois : deux bons essais en même temps, une seule session", async () => {
    await poserCode("654321");
    const r = await Promise.all([verifierCode(email, "654321"), verifierCode(email, "654321")]);
    expect(r.filter(Boolean)).toHaveLength(1);
  });
});

describe("les tâches d’une histoire", () => {
  it("une étape planifiée deux fois en même temps n’existe qu’une fois", async () => {
    verdict = {};
    const id = await lue("02-reciproque.txt");
    const [a, b] = await Promise.all([planifier(id, "rapport_plan"), planifier(id, "rapport_plan")]);
    expect(a).toBe(b);
    const enAttente = await db()
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "rapport_plan"), inArray(schema.tasks.status, ["attente", "en_cours"])));
    expect(enAttente).toHaveLength(1);
    /* Les mises à jour de la mémoire, elles, s’empilent */
    const [m1, m2] = [await planifier(id, "memoire_maj", { a: 1 }), await planifier(id, "memoire_maj", { a: 2 })];
    expect(m1).not.toBe(m2);
  });

  it("jamais deux étapes d’une même histoire en même temps", async () => {
    const id = await lue("03-elle-s-eloigne.txt");
    const t1 = await planifier(id, "memoire_maj", { a: 1 });
    const t2 = await planifier(id, "memoire_maj", { a: 2 });
    expect(await prendre(t1)).not.toBeNull();
    expect(await prendre(t2)).toBeNull();
    /* La première abandonnée (battement périmé) : la seconde peut partir */
    await db().update(schema.tasks).set({ heartbeatAt: sql`now() - interval '10 minutes'` }).where(eq(schema.tasks.id, t1));
    expect(await prendre(t2)).not.toBeNull();
  });
});

describe("le mode sobre", () => {
  const sortie = async (id: string) => dechiffrer<DonneesVerdict>((await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, id)))[0].data).sortie;
  const plans = async (id: string) => db().select().from(schema.tasks).where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "rapport_plan")));

  it("n’existe pas sans alerte, même si le modèle le demande (un rejet : le rapport complet, payant)", async () => {
    verdict = { mode_sobre: true, alerte: null };
    const id = await lue("04-ghosting.txt");
    expect((await sortie(id)).mode_sobre).toBe(false);
    /* Compte gratuit : pas de rapport offert */
    expect(await plans(id)).toHaveLength(0);
  });

  it("suit toujours une alerte, même si le modèle l’oublie (le rapport doux, offert)", async () => {
    verdict = { mode_sobre: false, alerte: "danger" };
    refuserRapport = true;
    const id = await lue("05-insiste-apres-un-non.txt");
    refuserRapport = false;
    expect((await sortie(id)).mode_sobre).toBe(true);
    expect(await plans(id)).toHaveLength(1);
  });
});

describe("l’accès donné après le verdict", () => {
  it("lance le rapport à l’ouverture, puis la mémoire, sans passer par « Débloquer »", async () => {
    verdict = {};
    const id = await lue("06-elle-hesite.txt");
    await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, u.id));
    const plus = { ...u, plan: "blushplus" as const };
    const avant = await rapportDe(await ligne(id), plus);
    expect(avant?.generating).toBe(true);
    await lancerApres();
    const [r] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, id));
    expect(r?.data).not.toBeNull();
    const taches = await db().select({ kind: schema.tasks.kind, status: schema.tasks.status }).from(schema.tasks).where(eq(schema.tasks.storyId, id));
    expect(taches.find((t) => t.kind === "memoire")?.status).toBe("fini");
    await db().update(schema.users).set({ plan: "gratuit" }).where(eq(schema.users.id, u.id));
  });
});

describe("une archive piégée", () => {
  it("est refusée sans être décompressée en entier (paquet gzip)", async () => {
    const piege = new File([gzipSync(Buffer.alloc(41 * 1024 * 1024))], "export.json.gz");
    await expect(depuisPaquet(piege)).rejects.toBeInstanceOf(ErreurImport);
  });

  it("est refusée quand ses fichiers dépassent la taille d’une conv, ensemble (zip)", async () => {
    const gros = new Uint8Array(15 * 1024 * 1024);
    const zip = zipSync({ "message_1.html": gros, "message_2.html": gros, "message_3.html": gros });
    await expect(depuisFichier(new File([zip], "export.zip"))).rejects.toBeInstanceOf(ErreurImport);
  });
});
