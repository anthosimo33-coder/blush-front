import { readFileSync } from "node:fs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Requete } from "@prompts/lib/contextes";
import { executerChaine } from "@/server/analyse";
import type { Utilisateur } from "@/server/auth";
import { db, schema } from "@/server/db";
import { ETAPES_DU_RAPPORT, rapportDe, relancer } from "@/server/donnees";
import { definirQui, depuisFichier, histoireOuverte, importer, rattacherBrouillon, type Ligne } from "@/server/histoires";
import { definirFactice } from "@/server/ia/claude";
import { fournisseurFactice } from "@/server/ia/factice";
import { ESSAIS_MAX, planifier, reprendre } from "@/server/taches";

const conv = (f: string) => new File([readFileSync(`prompts/evals/convs/${f}`)], f, { type: "text/plain" });
const ligne = async (id: string) => (await db().select().from(schema.stories).where(eq(schema.stories.id, id)))[0] as Ligne;
const emails = [`corrections-${Date.now()}@blush.test`, `corrections-autre-${Date.now()}@blush.test`];

/* Les requêtes envoyées au modèle (factice), pour lire ce qu’il reçoit */
const requetes: Requete[] = [];

let u: Utilisateur;
let autre: Utilisateur;

beforeAll(async () => {
  definirFactice((req) => {
    requetes.push(req);
    return fournisseurFactice(req);
  });
  [u, autre] = await db()
    .insert(schema.users)
    .values(emails.map((email) => ({ email })))
    .returning();
});
afterAll(async () => {
  await db().delete(schema.users).where(inArray(schema.users.email, emails));
  definirFactice(null);
});

/** Une conv importée et rattachée au compte, « Qui es-tu ? » rempli, son verdict lu. */
async function lue(f: string, avant?: (id: string) => Promise<void>): Promise<string> {
  const imp = await importer(await depuisFichier(conv(f)));
  await rattacherBrouillon(u, imp.secret);
  await definirQui(imp.id, { moi: 0, pronom: "il", devinette: "vus", objectif: "ensemble" });
  await avant?.(imp.id);
  await planifier(imp.id, "verdict");
  await executerChaine(imp.id);
  return imp.id;
}

describe("le jour de la lecture", () => {
  it("est celui de l’import, pas le lendemain du dernier message", async () => {
    /* Le dernier message d’Inès date du 2 octobre ; la conv est importée le 6 */
    requetes.length = 0;
    await lue("04-ghosting.txt", (id) => db().update(schema.stories).set({ createdAt: new Date("2026-10-06T10:00:00Z") }).where(eq(schema.stories.id, id)).then(() => {}));
    const verdict = requetes.find((r) => r.tache === "04-verdict");
    const texte = verdict!.blocs.map((b) => ("texte" in b ? b.texte : "")).join("\n");
    expect(texte).toContain("aujourd’hui : 2026-10-06");
    expect(texte).not.toContain("aujourd’hui : 2026-10-03");
  });
});

describe("une écriture coupée à chaque essai", () => {
  let id: string;

  beforeAll(async () => {
    /* Le verdict seul (compte gratuit), puis l’accès : le rapport est planifié, et sa première étape coupée trois fois */
    id = await lue("01-a-deux-doigts.txt");
    await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, u.id));
    u.plan = "blushplus";
    const tache = await planifier(id, "rapport_plan");
    await db()
      .update(schema.tasks)
      .set({ status: "en_cours", attempts: ESSAIS_MAX, heartbeatAt: sql`now() - interval '10 minutes'` })
      .where(eq(schema.tasks.id, tache));
  });

  it("passe en échec, et le rapport le dit au lieu de s’écrire pour toujours", async () => {
    await relancer(id);
    const [t] = await db().select().from(schema.tasks).where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "rapport_plan")));
    expect([t.status, t.error]).toEqual(["echec", "coupee"]);
    const r = await rapportDe(await ligne(id), u);
    expect(r?.echec).toBe("panne");
    expect(r?.generating).toBe(false);
    expect(r?.ecriture).toBeUndefined();
  });

  it("se relance de zéro, et le rapport s’écrit", async () => {
    expect(await reprendre(id, [...ETAPES_DU_RAPPORT])).toBe(1);
    await executerChaine(id);
    const r = await rapportDe(await ligne(id), u);
    expect(r?.echec).toBeUndefined();
    expect(r?.generating).toBe(false);
    expect(r?.report.chapters).toHaveLength(8);
  });
});

describe("la conv que montre la page", () => {
  it("est celle que vise un geste, jamais une autre à sa place", async () => {
    const [a, b] = await Promise.all([lue("02-reciproque.txt"), lue("03-elle-s-eloigne.txt")]);
    const imp = await importer(await depuisFichier(conv("05-insiste-apres-un-non.txt")));
    await rattacherBrouillon(autre, imp.secret);
    /* Le cookie désigne b (ouverte dans un autre onglet) ; la page montre a : c’est a */
    expect((await histoireOuverte(u, { choisie: b, affichee: a }))!.id).toBe(a);
    /* Supprimée entre-temps, à un autre compte, mal formée : rien, plutôt que la conv du cookie */
    expect(await histoireOuverte(u, { choisie: b, affichee: imp.id })).toBeNull();
    expect(await histoireOuverte(u, { choisie: b, affichee: "../../etc" })).toBeNull();
    /* Sans compte, ou pendant l’import : la page ne compte pas */
    expect(await histoireOuverte(null, { affichee: a })).toBeNull();
    const brouillon = await importer(await depuisFichier(conv("06-elle-hesite.txt")));
    expect((await histoireOuverte(u, { brouillon: brouillon.secret, affichee: a }, { parcours: true }))!.id).toBe(brouillon.id);
    await db().delete(schema.stories).where(eq(schema.stories.id, brouillon.id));
  });
});
