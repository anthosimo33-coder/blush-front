import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Requete } from "@prompts/lib/contextes";
import type { Utilisateur } from "@/server/auth";
import { db, schema } from "@/server/db";
import { ETAPES_DU_RAPPORT, rapportDe, relancer } from "@/server/donnees";
import { histoireOuverte } from "@/server/histoires";
import { fournisseurFactice } from "@/server/ia/factice";
import { executerChaine } from "@/server/pipeline";
import { ESSAIS_MAX, planifier, reprendre } from "@/server/taches";
import { compteDeTest, convImportee, convRattachee, facticePourChaqueTest, histoireLue, ligneEnBase } from "./aide/fixtures";

/* Les requêtes envoyées au modèle (factice) pendant les tests, pour lire ce qu’il reçoit */
const requetes: Requete[] = [];
facticePourChaqueTest((req) => (requetes.push(req), fournisseurFactice(req)));

let u: Utilisateur;
beforeAll(async () => {
  u = await compteDeTest("corrections");
});

/** Une conv importée, rattachée au compte gratuit du fichier (ou à `compte`), « Qui es-tu ? » rempli, son verdict lu. */
const lue = async (f: string, { avant, compte = u }: { avant?: (id: string) => Promise<unknown>; compte?: Utilisateur } = {}) => (await histoireLue(compte, f, { avant })).id;

describe("le jour de la lecture", () => {
  it("est celui de l’import, pas le lendemain du dernier message", async () => {
    /* Le dernier message d’Inès date du 2 octobre ; la conv est importée le 6 */
    requetes.length = 0;
    await lue("04-ghosting.txt", { avant: (id) => db().update(schema.stories).set({ createdAt: new Date("2026-10-06T10:00:00Z") }).where(eq(schema.stories.id, id)) });
    const verdict = requetes.find((r) => r.tache === "04-verdict");
    const texte = verdict!.blocs.map((b) => ("texte" in b ? b.texte : "")).join("\n");
    expect(texte).toContain("aujourd’hui : 2026-10-06");
    expect(texte).not.toContain("aujourd’hui : 2026-10-03");
  });
});

describe("une écriture coupée à chaque essai", () => {
  /**
   * Une conv lue par un compte à lui (le verdict seul, en gratuit), puis l’accès : le rapport est planifié, et sa
   * première étape coupée trois fois. Chaque test part de la sienne : le plan du compte et la tâche changent en route.
   */
  async function coupee(): Promise<{ id: string; plus: Utilisateur }> {
    const plus = await compteDeTest("corrections-acces");
    const id = await lue("01-a-deux-doigts.txt", { compte: plus });
    await db().update(schema.users).set({ plan: "blushplus" }).where(eq(schema.users.id, plus.id));
    plus.plan = "blushplus";
    const tache = await planifier(id, "rapport_plan");
    await db()
      .update(schema.tasks)
      .set({ status: "en_cours", attempts: ESSAIS_MAX, heartbeatAt: sql`now() - interval '10 minutes'` })
      .where(eq(schema.tasks.id, tache));
    return { id, plus };
  }

  it("passe en échec, et le rapport le dit au lieu de s’écrire pour toujours", async () => {
    const { id, plus } = await coupee();
    await relancer(id);
    const t = (await db().select().from(schema.tasks).where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "rapport_plan"))))[0]!;
    expect([t.status, t.error]).toEqual(["echec", "coupee"]);
    const r = await rapportDe(await ligneEnBase(id), plus);
    expect(r?.echec).toBe("panne");
    expect(r?.generating).toBe(false);
    expect(r?.ecriture).toBeUndefined();
  });

  it("en échec, se relance de zéro, et le rapport s’écrit", async () => {
    const { id, plus } = await coupee();
    await relancer(id);
    expect((await rapportDe(await ligneEnBase(id), plus))?.echec).toBe("panne");
    expect(await reprendre(id, [...ETAPES_DU_RAPPORT])).toBe(1);
    await executerChaine(id);
    const r = await rapportDe(await ligneEnBase(id), plus);
    expect(r?.echec).toBeUndefined();
    expect(r?.generating).toBe(false);
    expect(r?.report.chapters).toHaveLength(8);
  });
});

describe("la conv que montre la page", () => {
  it("est celle que vise un geste, jamais une autre à sa place", async () => {
    const [a, b] = await Promise.all([lue("02-reciproque.txt"), lue("03-elle-s-eloigne.txt")]);
    const imp = await convRattachee(await compteDeTest("corrections-autre"), "05-insiste-apres-un-non.txt");
    /* Le cookie désigne b (ouverte dans un autre onglet) ; la page montre a : c’est a */
    expect((await histoireOuverte(u, { choisie: b, affichee: a }))!.id).toBe(a);
    /* Supprimée entre-temps, à un autre compte, mal formée : rien, plutôt que la conv du cookie */
    expect(await histoireOuverte(u, { choisie: b, affichee: imp.id })).toBeNull();
    expect(await histoireOuverte(u, { choisie: b, affichee: "../../etc" })).toBeNull();
    /* Sans compte, ou pendant l’import : la page ne compte pas */
    expect(await histoireOuverte(null, { affichee: a })).toBeNull();
    const brouillon = await convImportee("06-elle-hesite.txt");
    expect((await histoireOuverte(u, { brouillon: brouillon.secret, affichee: a }, { parcours: true }))!.id).toBe(brouillon.id);
  });
});
