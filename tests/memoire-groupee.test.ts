import { eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { Requete } from "@prompts/lib/contextes";
import { ficheEtMaj, majEnCours } from "@/server/ajouts";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { fournisseurFactice } from "@/server/ia/factice";
import { CALME_S, ECHANGES_PAR_MAJ, retenir } from "@/server/memoire-groupee";
import { executerChaine, reprendreLesChainesEnPlan } from "@/server/pipeline";
import { aRelancer } from "@/server/taches";
import { echange } from "./aide/fabriques";
import { compteDeTest, facticePourChaqueTest, histoireLue, ligneEnBase } from "./aide/fixtures";

/* Ce qui part après la réponse (after) : gardé, lancé à la main */
const apres = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => apres.push(f) }));
/* Le relais de la chaîne (src/server/relais.ts) : chaque passage de main noté, sans appel réseau */
const relais = vi.hoisted(() => [] as [string, number][]);
vi.mock("@/server/relais", () => ({ RELAIS_MAX: 5, passerLaMain: async (histoire: string, rang: number) => (relais.push([histoire, rang]), true) }));

/*
 * La mise à jour de la mémoire, groupée (src/server/memoire-groupee.ts) : les échanges du chat se retrouvent dans une
 * seule tâche qui attend que le chat se calme, au plus ECHANGES_PAR_MAJ, ou part tout de suite quand il le faut. Avec la
 * base et le modèle factice.
 */

/* Les requêtes au modèle (factice), pour compter les mises à jour et lire ce qu’elles reçoivent */
const requetes: Requete[] = [];
facticePourChaqueTest((req) => (requetes.push(req), fournisseurFactice(req)));
const majsLues = () => requetes.filter((r) => r.tache === "07-memoire").map((r) => r.blocs.flatMap((b) => ("texte" in b ? [b.texte] : [])).join("\n"));

let n = 0;
/** Une conv lue, son rapport débloqué et sa mémoire écrite : son id. Les requêtes de sa lecture sont oubliées. */
async function convLue(): Promise<string> {
  const { id } = await histoireLue(await compteDeTest(`groupee-${++n}`, "debloque"), "02-reciproque.txt");
  requetes.length = 0;
  return id;
}

/** La tâche, et dans combien de secondes elle partira (null : tout de suite). */
async function tache(id: string) {
  const [t] = await db()
    .select({ status: schema.tasks.status, input: schema.tasks.input, dans: sql<number | null>`extract(epoch from (${schema.tasks.pasAvant} - now()))::float` })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, id));
  if (!t) throw new Error(`pas de tâche ${id}`);
  return { status: t.status, dans: t.dans, dits: t.input ? coffre.lire("tasks.input", t.input).map((e) => e.dit) : null };
}

describe("la mise à jour de la mémoire, groupée", () => {
  it("un échange qui apporte du neuf ouvre une mise à jour qui attend que le chat se calme : ni la chaîne ni la fiche ne la prennent", async () => {
    const id = await convLue();
    const r = await retenir(id, echange(1), { neuf: true, maintenant: false });
    expect(r.part).toBe(false);
    const t = await tache(r.id!);
    expect(t).toMatchObject({ status: "attente", dits: ["échange numéro 1"] });
    expect(t.dans).toBeGreaterThan(CALME_S - 60);
    expect(t.dans).toBeLessThanOrEqual(CALME_S);
    expect((await aRelancer(id)).map((x) => x.id)).not.toContain(r.id);
    expect(await majEnCours(id)).toBe(false);
    await executerChaine(id);
    expect((await tache(r.id!)).status).toBe("attente");
    expect(majsLues()).toEqual([]);
  });

  it("sans mise à jour qui attend, un échange sans neuf ne retient rien ; avec, il la rejoint et repousse son départ", async () => {
    const id = await convLue();
    expect(await retenir(id, echange(1), { neuf: false, maintenant: false })).toEqual({ id: null, part: false });
    const r1 = await retenir(id, echange(2), { neuf: true, maintenant: false });
    /* Le temps passe : il reste une minute de calme */
    await db()
      .update(schema.tasks)
      .set({ pasAvant: sql`now() + interval '1 minute'` })
      .where(eq(schema.tasks.id, r1.id!));
    const r2 = await retenir(id, echange(3), { neuf: false, maintenant: false });
    expect(r2).toEqual({ id: r1.id, part: false });
    const t = await tache(r1.id!);
    expect(t.dits).toEqual(["échange numéro 2", "échange numéro 3"]);
    expect(t.dans).toBeGreaterThan(CALME_S - 60);
  });

  it(`au ${ECHANGES_PAR_MAJ}e échange, elle part : la mémoire les relit tous, dans l’ordre, en un seul appel`, async () => {
    const id = await convLue();
    const parts = [];
    for (let k = 1; k <= ECHANGES_PAR_MAJ; k++) parts.push(await retenir(id, echange(k), { neuf: k === 1, maintenant: false }));
    expect(parts.map((p) => p.part)).toEqual([...Array<boolean>(ECHANGES_PAR_MAJ - 1).fill(false), true]);
    expect(new Set(parts.map((p) => p.id)).size).toBe(1);
    const id1 = parts[0]!.id!;
    expect((await tache(id1)).dans).toBeNull();
    expect((await aRelancer(id)).map((x) => x.id)).toContain(id1);
    await executerChaine(id);
    const lues = majsLues();
    expect(lues).toHaveLength(1);
    const places = Array.from({ length: ECHANGES_PAR_MAJ }, (_, k) => lues[0]!.indexOf(`échange numéro ${k + 1}`));
    expect(places.every((p, k) => p >= 0 && (k === 0 || p > places[k - 1]!))).toBe(true);
    /* Un bloc <nouveau> par échange */
    expect(lues[0]!.match(/<nouveau date=/g)).toHaveLength(ECHANGES_PAR_MAJ);
    /* Finie, elle n’a plus à garder ses échanges (S-34) */
    expect(await tache(id1)).toMatchObject({ status: "fini", dits: null });
  });

  it("un échange qui l’exige (un niveau atteint, un ajout que le fil ne garde pas) la fait partir tout de suite, avec ceux qui attendaient", async () => {
    const id = await convLue();
    const r1 = await retenir(id, echange(1), { neuf: true, maintenant: false });
    const r2 = await retenir(id, echange(2), { neuf: true, maintenant: true });
    expect(r2).toEqual({ id: r1.id, part: true });
    expect(await tache(r1.id!)).toMatchObject({ dans: null, dits: ["échange numéro 1", "échange numéro 2"] });
    expect(await majEnCours(id)).toBe(true);
  });

  it("déjà prise, elle n’est plus rejointe : l’échange suivant en ouvre une autre, qui attend son tour", async () => {
    const id = await convLue();
    const r1 = await retenir(id, echange(1), { neuf: true, maintenant: true });
    await db().update(schema.tasks).set({ status: "en_cours", attempts: 1, heartbeatAt: new Date() }).where(eq(schema.tasks.id, r1.id!));
    const r2 = await retenir(id, echange(2), { neuf: true, maintenant: false });
    expect(r2.id).not.toBe(r1.id);
    expect((await tache(r1.id!)).dits).toEqual(["échange numéro 1"]);
    expect((await tache(r2.id!)).dits).toEqual(["échange numéro 2"]);
  });

  it("deux échanges en même temps (deux onglets) : une seule mise à jour, avec les deux", async () => {
    const id = await convLue();
    const [a, b] = await Promise.all([retenir(id, echange(1), { neuf: true, maintenant: false }), retenir(id, echange(2), { neuf: true, maintenant: false })]);
    expect(a.id).toBe(b.id);
    expect((await tache(a.id!)).dits?.sort()).toEqual(["échange numéro 1", "échange numéro 2"]);
  });

  it("son heure passée, le passage des 5 minutes la lance, pas avant ; un échange arrivé entre-temps part avec elle", async () => {
    const id = await convLue();
    const r = await retenir(id, echange(1), { neuf: true, maintenant: false });
    relais.length = 0;
    await reprendreLesChainesEnPlan();
    expect(relais.map(([h]) => h)).not.toContain(id);
    await db()
      .update(schema.tasks)
      .set({ pasAvant: sql`now() - interval '1 second'` })
      .where(eq(schema.tasks.id, r.id!));
    await reprendreLesChainesEnPlan();
    expect(relais).toContainEqual([id, 1]);
    /* Le passage ne l’a pas encore prise : l’échange suivant la rejoint, et elle part */
    expect(await retenir(id, echange(2), { neuf: false, maintenant: false })).toEqual({ id: r.id, part: true });
    await executerChaine(id);
    expect(majsLues()).toHaveLength(1);
    expect((await tache(r.id!)).status).toBe("fini");
  });

  it("sa fiche ouverte la fait partir : la page (que l’accueil précharge) dit seulement qu’elle vient, la relecture de l’écran la lance", async () => {
    const id = await convLue();
    const r = await retenir(id, echange(1, { dit: "on s’est vus hier, c’était trop bien" }), { neuf: true, maintenant: false });
    expect(await majEnCours(id)).toBe(false);
    /* La page rendue par le serveur, peut-être un préchargement de l’accueil : rien ne part */
    expect((await ficheEtMaj(await ligneEnBase(id), { page: true })).updating).toBe(true);
    expect((await tache(r.id!)).dans).toBeGreaterThan(0);
    /* L’écran se relit (GET /api/fiche) : elle part */
    apres.length = 0;
    expect((await ficheEtMaj(await ligneEnBase(id))).updating).toBe(true);
    expect((await tache(r.id!)).dans).toBeNull();
    while (apres.length) await apres.shift()!();
    expect((await tache(r.id!)).status).toBe("fini");
    expect(majsLues()).toHaveLength(1);
    expect((await ficheEtMaj(await ligneEnBase(id))).updating).toBeUndefined();
  });
});
