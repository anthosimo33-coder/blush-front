import Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { Requete } from "@prompts/lib/contextes";

/* after() de Next ne vit que dans une requête : ici, ce qui devait partir après la réponse est gardé, et lancé à la main */
const etat = vi.hoisted(() => ({ apres: [] as (() => unknown)[], alertes: [] as string[][] }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => etat.apres.push(f) }));
vi.mock("@/server/alertes", async (original) => ({
  ...(await original<typeof import("@/server/alertes")>()),
  alerter: async (sujet: string, lignes: string[]) => void etat.alertes.push([sujet, ...lignes]),
}));

import { repondre } from "@/server/chat";
import { db, schema } from "@/server/db";
import { donneesMemoire, modifierMemoire } from "@/server/depot";
import { ficheDe } from "@/server/donnees";
import { fusionnerFaits } from "@/server/fiche";
import { fournisseurFactice, refusFactice, type RequeteFactice } from "@/server/ia/factice";
import { executerChaine, memoireAssuree, RELANCES_MEMOIRE_MAX } from "@/server/pipeline";
import { planifier } from "@/server/taches";
import { retenir, sansAttendre } from "@/server/memoire-groupee";
import { echange } from "./aide/fabriques";
import { avecFactice, compteDeTest, debloquerLaConv, histoireLue, ligneEnBase } from "./aide/fixtures";

/*
 * Le chat coûte que coûte (src/server/secours.ts, src/server/pipeline.ts) : quand la vraie mémoire échoue, celle de
 * secours, tirée du verdict et du rapport, prend le relais, l’équipe le sait, et la vraie repart à l’ouverture suivante
 * pour la remplacer. Le modèle factice joue la panne : une limite de débit à la création de la mémoire.
 */

/** Une limite de débit du prestataire, comme le SDK la lève (son nom : « Error », comme toutes les siennes). */
const limite = () => new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "trop de jetons" } }, undefined, new Headers());
/** Le modèle factice, sauf la création de la mémoire (pas sa mise à jour), qui tombe sur une limite de débit. */
const memoireEnPanne = (req: RequeteFactice) => {
  if (req.tache === "07-memoire" && req.partie !== "mise à jour") throw limite();
  return fournisseurFactice(req);
};
/** Le modèle factice qui refuse d’écrire la mémoire (un refus revient à chaque essai : il n’est jamais relancé). */
const memoireRefusee = (req: Requete) => (req.tache === "07-memoire" ? refusFactice("cyber") : fournisseurFactice(req));

const tachesMemoire = (storyId: string) =>
  db()
    .select({ id: schema.tasks.id, status: schema.tasks.status, error: schema.tasks.error })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, "memoire")))
    .orderBy(asc(schema.tasks.createdAt));
/** La dernière mémoire en échec, vieillie d’une heure : la pause avant sa relance est passée. */
const vieillir = (storyId: string) =>
  db()
    .update(schema.tasks)
    .set({ updatedAt: sql`now() - interval '1 hour'` })
    .where(and(eq(schema.tasks.storyId, storyId), eq(schema.tasks.kind, "memoire")));
/** Ce qui devait partir après la réponse (la chaîne relancée), lancé maintenant. */
const lancerLaSuite = async () => {
  for (const f of etat.apres.splice(0)) await f();
};

describe("la vraie mémoire en échec", () => {
  it("la mémoire de secours prend le relais : l’alerte le dit avec le code du prestataire, le chat répond, la conv reste", async () => {
    const u = await compteDeTest("secours", "debloque");
    etat.alertes.length = 0;
    const imp = await avecFactice(memoireEnPanne, () => histoireLue(u, "06-elle-hesite.txt"));

    expect(await tachesMemoire(imp.id)).toEqual([expect.objectContaining({ status: "echec", error: "api:429:rate_limit_error" })]);
    const alerte = etat.alertes.find(([sujet]) => sujet === "memoire en échec");
    expect(alerte).toContain("Erreur : api:429:rate_limit_error");
    expect(alerte?.at(-1)).toContain("mémoire de secours");

    const secours = (await donneesMemoire(imp.id))!;
    expect(secours.secours).toBe(true);
    expect(secours.etat.memoire.ou_on_en_est).not.toBe("");
    expect(secours.lignes.length).toBeGreaterThan(0);
    /* La conv reste : la vraie mémoire repartira d’elle */
    expect((await ligneEnBase(imp.id)).conv).not.toBeNull();
    /* Sa fiche est encore vide pour l’écran */
    expect((await ficheDe(await ligneEnBase(imp.id))).updatedLabel).toBe("pas encore remplie");

    /* Le chat répond sur elle, avec des preuves de la conv ; sa mise à jour la garde de secours */
    const { reponse, majMemoire } = await repondre(await ligneEnBase(imp.id), secours, "on s’est vus hier, c’était trop bien");
    expect(reponse.kind).toBe("bubbles");
    /* Elle attend que le chat se calme ; ici, elle part sans attendre */
    expect(majMemoire).toBe(false);
    expect(await sansAttendre(imp.id)).toBe(true);
    /* Trop tôt pour relancer la vraie (la pause) : seule la mise à jour du chat part */
    await executerChaine(imp.id);
    expect(await tachesMemoire(imp.id)).toHaveLength(1);
    expect((await donneesMemoire(imp.id))!.secours).toBe(true);
  });

  it("la vraie repart à l’ouverture suivante, passé la pause, et remplace celle de secours en gardant ses corrections", async () => {
    const u = await compteDeTest("secours-relance", "debloque");
    const imp = await avecFactice(memoireEnPanne, () => histoireLue(u, "06-elle-hesite.txt"));
    const ligne = await ligneEnBase(imp.id);
    /* Il corrige sa fiche pendant le secours : il y ajoute un fait */
    expect(await modifierMemoire(imp.id, (m) => fusionnerFaits(m, [{ section: "infos", text: "Elle part à Lyon" }]), { essais: 1 })).toBe("ecrite");

    /* Le chat la lit : passé la pause, la vraie mémoire est replanifiée, et part après la réponse */
    await vieillir(imp.id);
    etat.apres.length = 0;
    expect((await memoireAssuree(ligne))?.secours).toBe(true);
    expect((await tachesMemoire(imp.id)).map((t) => t.status)).toEqual(["echec", "attente"]);
    await lancerLaSuite();

    const reelle = (await donneesMemoire(imp.id))!;
    expect(reelle.secours).toBeUndefined();
    expect(reelle.etat.fiche.faits.map((f) => f.texte)).toContain("Elle part à Lyon");
    expect(reelle.editions?.parToi).toEqual(["Elle part à Lyon"]);
    expect((await tachesMemoire(imp.id)).map((t) => t.status)).toEqual(["echec", "fini"]);
    expect((await ligneEnBase(imp.id)).conv).toBeNull();
  });

  it(`repart ${RELANCES_MEMOIRE_MAX} fois au plus après une panne, jamais après un refus`, async () => {
    const u = await compteDeTest("secours-borne", "debloque");
    const imp = await avecFactice(memoireEnPanne, () => histoireLue(u, "06-elle-hesite.txt"));
    const ligne = await ligneEnBase(imp.id);
    await avecFactice(memoireEnPanne, async () => {
      for (let k = 0; k < RELANCES_MEMOIRE_MAX + 1; k++) {
        await vieillir(imp.id);
        await memoireAssuree(ligne);
        await lancerLaSuite();
      }
    });
    expect(await tachesMemoire(imp.id)).toHaveLength(1 + RELANCES_MEMOIRE_MAX);
    expect((await donneesMemoire(imp.id))!.secours).toBe(true);
    /* Chaque alerte dit ce qu’il reste de relances, la dernière qu’il n’y en a plus */
    const alertes = etat.alertes.filter((a) => a[0] === "memoire en échec" && a.includes(`Histoire ${imp.id}`)).map((a) => a.at(-1));
    expect(alertes).toHaveLength(1 + RELANCES_MEMOIRE_MAX);
    expect(alertes.slice(-2)).toEqual([expect.stringContaining("encore 1 fois au plus"), expect.stringContaining("ne repartira plus")]);

    const v = await compteDeTest("secours-refus", "debloque");
    const refusee = await avecFactice(memoireRefusee, () => histoireLue(v, "06-elle-hesite.txt"));
    expect((await tachesMemoire(refusee.id)).map((t) => t.error)).toEqual(["refus:cyber"]);
    expect(etat.alertes.at(-1)?.at(-1)).toContain("ne repart pas");
    expect((await donneesMemoire(refusee.id))!.secours).toBe(true);
    await vieillir(refusee.id);
    await memoireAssuree(await ligneEnBase(refusee.id));
    expect(await tachesMemoire(refusee.id)).toHaveLength(1);
  });
});

describe("le chat avant la vraie mémoire", () => {
  it("un rapport débloqué sans mémoire encore : celle de secours, que la vraie remplace en passant", async () => {
    const u = await compteDeTest("secours-avant");
    const imp = await histoireLue(u, "06-elle-hesite.txt");
    /* Sans accès : ni rapport ni mémoire, le chat n’a rien à lire */
    expect(await memoireAssuree(await ligneEnBase(imp.id))).toBeNull();

    /* Débloqué : le rapport s’écrit, et le chat a déjà sa mémoire, le verdict seul */
    await debloquerLaConv(imp.id);
    const avant = (await memoireAssuree(await ligneEnBase(imp.id)))!;
    expect(avant.secours).toBe(true);
    expect(avant.etat.memoire.moments).toEqual([]);

    /* Le rapport puis la vraie mémoire, qui prend la place */
    await planifier(imp.id, "rapport_plan");
    await executerChaine(imp.id);
    expect((await donneesMemoire(imp.id))!.secours).toBeUndefined();
  });

  it("une mise à jour qui ne trouve pas de mémoire écrit d’abord celle de secours, au lieu d’échouer", async () => {
    const u = await compteDeTest("secours-maj", "debloque");
    const imp = await avecFactice(memoireEnPanne, () => histoireLue(u, "06-elle-hesite.txt"));
    await db().delete(schema.memories).where(eq(schema.memories.storyId, imp.id));
    await retenir(imp.id, echange(1, { dit: "on se voit samedi" }), { neuf: true, maintenant: true });
    await executerChaine(imp.id);
    const maj = await db()
      .select({ status: schema.tasks.status })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, imp.id), eq(schema.tasks.kind, "memoire_maj")));
    expect(maj).toEqual([{ status: "fini" }]);
    expect((await donneesMemoire(imp.id))!.secours).toBe(true);
  });
});
