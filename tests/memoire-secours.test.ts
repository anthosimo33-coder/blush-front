import Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { Requete } from "@prompts/lib/contextes";
import { origineDeLAlerte } from "@prompts/lib/memoire";

/* after() de Next ne vit que dans une requête : ici, ce qui devait partir après la réponse est gardé, et lancé à la main */
const etat = vi.hoisted(() => ({ apres: [] as (() => unknown)[], alertes: [] as string[][] }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => etat.apres.push(f) }));
vi.mock("@/server/alertes", async (original) => ({
  ...(await original<typeof import("@/server/alertes")>()),
  alerter: async (sujet: string, lignes: string[]) => void etat.alertes.push([sujet, ...lignes]),
}));

import { garderUneMemoireDeSecours } from "@/server/analyse";
import { repondre } from "@/server/chat";
import { db, schema } from "@/server/db";
import { donneesMemoire, modifierMemoire } from "@/server/depot";
import { ficheDe } from "@/server/donnees";
import { fusionnerFaits } from "@/server/fiche";
import { fournisseurFactice, refusFactice, type RequeteFactice } from "@/server/ia/factice";
import { FACTICE } from "@/server/ia/factice-valeurs";
import { executerChaine, memoireAssuree, RELANCES_MEMOIRE_MAX } from "@/server/pipeline";
import { planifier } from "@/server/taches";
import { majQuiAttend, retenir, sansAttendre } from "@/server/memoire-groupee";
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

/*
 * L’alerte de leur histoire (danger, detresse, mineur) reste dans la mémoire, et le chat la lit sur sa ligne de
 * <memoire> (rendreMemoire, prompts/lib/memoire.ts) : celle du verdict, que la création de la mémoire ne reprend pas
 * toujours (le modèle factice n’en lève jamais à la création), et celle d’une réponse du chat, qu’il ne relirait plus
 * au-delà de ses derniers échanges. Le texte de la ligne n’est pas recopié ici (le dépôt est public) : on la reconnaît à
 * l’alerte qu’elle porte, dans <memoire>.
 */
describe("l’alerte dans la mémoire, que le chat lit", () => {
  type Alerte = "danger" | "detresse" | "mineur";
  /** Le modèle factice, son verdict avec cette alerte ; pour la règle de l’âge, son rapport doux suit (FACTICE.alerte). */
  const avecAlerte = (alerte: Alerte) => (req: RequeteFactice) => {
    if (req.tache === "04-verdict") return { ...(fournisseurFactice(req) as object), alerte };
    return fournisseurFactice(alerte === "mineur" ? { ...req, blocs: [...req.blocs, { texte: FACTICE.alerte }] } : req);
  };
  /** Le modèle factice dont les réponses du chat sortent avec cette alerte (une question, pas une nouvelle). */
  const chatEnAlerte = (alerte: Alerte) => (req: RequeteFactice) => (req.tache === "10-chat" ? { ...(fournisseurFactice(req) as object), alerte } : fournisseurFactice(req));
  /** Les lignes de <memoire> que le chat a lues à sa dernière réponse, celles qui portent une alerte. */
  async function alertesLues(storyId: string, f: (req: RequeteFactice) => unknown = fournisseurFactice): Promise<string[]> {
    const lues: Requete[] = [];
    const [ligne, memoire] = [await ligneEnBase(storyId), (await donneesMemoire(storyId))!];
    await avecFactice(
      (req: RequeteFactice) => {
        if (req.tache === "10-chat") lues.push(req);
        return f(req);
      },
      () => repondre(ligne, memoire, "je lui réponds quoi ?"),
    );
    const texte = lues.at(-1)!.blocs.flatMap((b) => ("texte" in b ? [b.texte] : []))[0]!;
    const l = texte.split("\n");
    return l.slice(l.indexOf("<memoire>"), l.indexOf("</memoire>")).filter((x) => / : (danger|detresse|mineur)$/.test(x));
  }

  it.each(["danger", "mineur"] as const)("un verdict « %s » : la vraie mémoire garde son alerte, même si sa création l’oublie, et le chat la lit", async (alerte) => {
    const u = await compteDeTest(`alerte-memoire-${alerte}`, "debloque");
    const imp = await avecFactice(avecAlerte(alerte), () => histoireLue(u, "06-elle-hesite.txt"));
    const m = (await donneesMemoire(imp.id))!;
    /* La vraie, écrite par le modèle (factice) sans alerte : le code y a remis celle du verdict */
    expect(m.secours).toBeUndefined();
    expect(m.etat.memoire.ou_on_en_est).not.toBe("");
    expect(m.etat.alerte).toBe(alerte);
    expect(await alertesLues(imp.id)).toEqual([expect.stringMatching(new RegExp(` : ${alerte}$`))]);
  });

  it("sans alerte : la mémoire n’en a pas, et le chat n’en lit aucune", async () => {
    const u = await compteDeTest("alerte-memoire-sans", "debloque");
    const imp = await histoireLue(u, "06-elle-hesite.txt");
    expect((await donneesMemoire(imp.id))!.etat.alerte).toBeNull();
    expect(await alertesLues(imp.id)).toEqual([]);
  });

  it("une réponse du chat en alerte, sur une question : notée dans la mémoire, que la vraie garde en remplaçant celle de secours", async () => {
    const u = await compteDeTest("alerte-memoire-chat", "debloque");
    const imp = await avecFactice(memoireEnPanne, () => histoireLue(u, "06-elle-hesite.txt"));
    expect((await donneesMemoire(imp.id))!).toMatchObject({ secours: true, etat: { alerte: null } });

    /* « elle a 14 ans » : une question, que la règle de l’âge met en alerte. La mémoire la note, une mise à jour l’attend */
    await alertesLues(imp.id, chatEnAlerte("mineur"));
    expect((await donneesMemoire(imp.id))!.etat.alerte).toBe("mineur");
    expect(await majQuiAttend(imp.id)).toBe(true);
    /* La réponse suivante, sans alerte à elle, la lit encore ; une alerte « detresse » ne cache pas la règle de l’âge */
    expect(await alertesLues(imp.id)).toEqual([expect.stringMatching(/ : mineur$/)]);
    await alertesLues(imp.id, chatEnAlerte("detresse"));
    expect((await donneesMemoire(imp.id))!.etat.alerte).toBe("mineur");

    /* La vraie mémoire, passé la pause, remplace celle de secours : sa création n’a pas d’alerte, celle du chat reste */
    await vieillir(imp.id);
    etat.apres.length = 0;
    await memoireAssuree(await ligneEnBase(imp.id));
    await lancerLaSuite();
    const reelle = (await donneesMemoire(imp.id))!;
    expect(reelle.secours).toBeUndefined();
    expect(reelle.etat.alerte).toBe("mineur");
  });
});

/*
 * La mémoire tranche l’alerte venue du chat (prompts/lib/memoire.ts, appliquerMaj) : notée tout de suite, la mise à
 * jour suivante la confirme ou l’efface (une vanne, un âge mal lu) ; celle de la lecture (le verdict, le rapport, la
 * création) ne s’efface jamais, quoi que rende la mise à jour. Le modèle factice joue la décision ; la ligne de l’alerte
 * se reconnaît à l’alerte qu’elle porte, sans recopier son texte (le dépôt est public).
 */
describe("l’alerte venue du chat, tranchée par la mise à jour", () => {
  type Alerte = "danger" | "detresse" | "mineur";
  type Decision = "confirmee" | "effacee";
  const avecAlerte = (alerte: Alerte) => (req: RequeteFactice) => {
    if (req.tache === "04-verdict") return { ...(fournisseurFactice(req) as object), alerte };
    return fournisseurFactice(alerte === "mineur" ? { ...req, blocs: [...req.blocs, { texte: FACTICE.alerte }] } : req);
  };
  const chatEnAlerte = (alerte: Alerte) => (req: RequeteFactice) => (req.tache === "10-chat" ? { ...(fournisseurFactice(req) as object), alerte } : fournisseurFactice(req));
  /** Les lignes de <memoire> qui portent une alerte, dans le premier bloc d’une requête. */
  const lignesDAlerte = (req: Requete, alerte: Alerte) => {
    const l = (req.blocs.flatMap((b) => ("texte" in b ? [b.texte] : []))[0] ?? "").split("\n");
    return l.slice(l.indexOf("<memoire>"), l.indexOf("</memoire>")).filter((x) => x.includes(` : ${alerte}`));
  };
  /** La réponse suivante du chat, et les lignes d’alerte qu’elle a lues dans <memoire>. */
  async function auChat(storyId: string, alerte: Alerte, f: (req: RequeteFactice) => unknown = fournisseurFactice) {
    const lues: Requete[] = [];
    await avecFactice(
      (req: RequeteFactice) => {
        if (req.tache === "10-chat") lues.push(req);
        return f(req);
      },
      async () => repondre(await ligneEnBase(storyId), (await donneesMemoire(storyId))!, "je lui réponds quoi ?"),
    );
    return lignesDAlerte(lues.at(-1)!, alerte);
  }
  /**
   * La mise à jour qui attend, lancée sans attendre le calme, avec cette décision (et « rien de neuf » si demandé) ; les
   * lignes d’alerte qu’elle a lues dans <memoire>.
   */
  async function trancher(storyId: string, alerte: Alerte, alerte_du_chat: Decision, { rienDeNeuf = false } = {}) {
    const lues: Requete[] = [];
    expect(await sansAttendre(storyId)).toBe(true);
    await avecFactice(
      (req: RequeteFactice) => {
        if (req.tache !== "07-memoire" || req.partie !== "mise à jour") return fournisseurFactice(req);
        lues.push(req);
        return {
          ...(fournisseurFactice(req) as object),
          alerte_du_chat,
          ...(rienDeNeuf ? { rien_de_neuf: true, ou_on_en_est: null, moments_ajoutes: [], faits_ajoutes: [] } : {}),
        };
      },
      () => executerChaine(storyId),
    );
    expect(lues).toHaveLength(1);
    return lignesDAlerte(lues[0]!, alerte);
  }

  it("effacée (une vanne, sur « rien de neuf ») : elle disparaît de la mémoire, et le chat ne la lit plus", async () => {
    const u = await compteDeTest("alerte-chat-effacee", "debloque");
    const imp = await histoireLue(u, "06-elle-hesite.txt");
    expect(await auChat(imp.id, "danger", chatEnAlerte("danger"))).toEqual([]);
    const notee = (await donneesMemoire(imp.id))!.etat;
    expect(notee.alerte).toBe("danger");
    expect(origineDeLAlerte(notee)).toBe("chat");
    /* La réponse suivante la lit telle quelle, sans sa provenance */
    expect(await auChat(imp.id, "danger")).toEqual([expect.stringMatching(/ : danger$/)]);
    /* La mise à jour lit l’alerte avec sa provenance : la ligne porte « danger », et dit plus que celle du chat */
    const [ligne] = await trancher(imp.id, "danger", "effacee", { rienDeNeuf: true });
    expect(ligne).toMatch(/ : danger\b/);
    expect(ligne).not.toMatch(/ : danger$/);
    const apres = (await donneesMemoire(imp.id))!.etat;
    expect(apres.alerte).toBeNull();
    expect("alerte_lue" in apres).toBe(false);
    expect(await auChat(imp.id, "danger")).toEqual([]);
  });

  it("confirmée : elle reste, devient lue, et une mise à jour suivante ne l’efface plus", async () => {
    const u = await compteDeTest("alerte-chat-confirmee", "debloque");
    const imp = await histoireLue(u, "06-elle-hesite.txt");
    await auChat(imp.id, "detresse", chatEnAlerte("detresse"));
    await trancher(imp.id, "detresse", "confirmee");
    const confirmee = (await donneesMemoire(imp.id))!.etat;
    expect(confirmee.alerte).toBe("detresse");
    expect(origineDeLAlerte(confirmee)).toBe("lecture");
    /* Le chat la lit toujours ; la mise à jour suivante la lit sans provenance, et son effacement ne compte pas */
    expect(await auChat(imp.id, "detresse")).toEqual([expect.stringMatching(/ : detresse$/)]);
    await retenir(imp.id, echange(1, { dit: "on se voit samedi" }), { neuf: true, maintenant: false });
    expect(await trancher(imp.id, "detresse", "effacee")).toEqual([expect.stringMatching(/ : detresse$/)]);
    expect((await donneesMemoire(imp.id))!.etat.alerte).toBe("detresse");
  });

  it("une alerte de la lecture n’est jamais effacée, même si la mise à jour le demande ; une mémoire en base sans provenance est lue", async () => {
    const u = await compteDeTest("alerte-lecture-gardee", "debloque");
    const imp = await avecFactice(avecAlerte("danger"), () => histoireLue(u, "06-elle-hesite.txt"));
    const enBase = (await donneesMemoire(imp.id))!.etat;
    expect(enBase.alerte).toBe("danger");
    expect("alerte_lue" in enBase).toBe(false);
    expect(origineDeLAlerte(enBase)).toBe("lecture");
    await retenir(imp.id, echange(1, { dit: "mdr t’inquiète c’était pour rire" }), { neuf: true, maintenant: false });
    expect(await trancher(imp.id, "danger", "effacee", { rienDeNeuf: true })).toEqual([expect.stringMatching(/ : danger$/)]);
    expect((await donneesMemoire(imp.id))!.etat).toEqual(enBase);
    await retenir(imp.id, echange(2, { dit: "on s’est vus hier" }), { neuf: true, maintenant: false });
    await trancher(imp.id, "danger", "effacee");
    expect((await donneesMemoire(imp.id))!.etat.alerte).toBe("danger");
    expect(await auChat(imp.id, "danger")).toEqual([expect.stringMatching(/ : danger$/)]);
  });

  it("la règle de l’âge d’abord : « mineur » venu du chat passe la « detresse » du verdict ; effacé, la « detresse » revient", async () => {
    const u = await compteDeTest("alerte-chat-sur-lecture", "debloque");
    const imp = await avecFactice(avecAlerte("detresse"), () => histoireLue(u, "06-elle-hesite.txt"));
    expect((await donneesMemoire(imp.id))!.etat.alerte).toBe("detresse");
    await auChat(imp.id, "mineur", chatEnAlerte("mineur"));
    expect((await donneesMemoire(imp.id))!.etat).toMatchObject({ alerte: "mineur", alerte_lue: "detresse" });
    /* Une « detresse » du chat ne la cache pas, et ne change rien */
    await auChat(imp.id, "detresse", chatEnAlerte("detresse"));
    expect((await donneesMemoire(imp.id))!.etat).toMatchObject({ alerte: "mineur", alerte_lue: "detresse" });
    await trancher(imp.id, "mineur", "effacee");
    const apres = (await donneesMemoire(imp.id))!.etat;
    expect(apres.alerte).toBe("detresse");
    expect(origineDeLAlerte(apres)).toBe("lecture");
    expect(await auChat(imp.id, "detresse")).toEqual([expect.stringMatching(/ : detresse$/)]);
  });

  it("sans alerte : une mise à jour n’écrit aucune provenance, et une décision sans alerte ne change rien", async () => {
    const u = await compteDeTest("alerte-aucune-maj", "debloque");
    const imp = await histoireLue(u, "06-elle-hesite.txt");
    await retenir(imp.id, echange(1, { dit: "on s’est vus hier" }), { neuf: true, maintenant: false });
    await trancher(imp.id, "danger", "effacee");
    const apres = (await donneesMemoire(imp.id))!.etat;
    expect(apres.alerte).toBeNull();
    expect("alerte_lue" in apres).toBe(false);
    expect(await auChat(imp.id, "danger")).toEqual([]);
  });

  it("deux alertes venues du chat : la première effacée, la suivante s’affiche et attend son tour ; aucune ne se perd", async () => {
    const u = await compteDeTest("alerte-chat-deux", "debloque");
    const imp = await histoireLue(u, "06-elle-hesite.txt");
    await auChat(imp.id, "detresse", chatEnAlerte("detresse"));
    await auChat(imp.id, "danger", chatEnAlerte("danger"));
    expect((await donneesMemoire(imp.id))!.etat).toMatchObject({ alerte: "danger", alertes_vues: [{ alerte: "danger" }, { alerte: "detresse" }] });
    await trancher(imp.id, "danger", "effacee");
    const apres = (await donneesMemoire(imp.id))!.etat;
    expect(apres.alerte).toBe("detresse");
    expect(origineDeLAlerte(apres)).toBe("chat");
    expect(await auChat(imp.id, "detresse")).toEqual([expect.stringMatching(/ : detresse$/)]);
  });

  /*
   * La course : une mise à jour déjà prise (ses échanges lus) quand une réponse du chat lève l’alerte ne l’a pas relue.
   * Elle ne la tranche pas, quoi que rende le modèle ; celle qu’ouvre l’échange de l’alerte la tranche
   */
  it("notée après la prise d’une mise à jour : celle-là ne la tranche pas, la suivante, qui a son échange, la tranche", async () => {
    const u = await compteDeTest("alerte-chat-course", "debloque");
    const imp = await histoireLue(u, "06-elle-hesite.txt");
    const prise = await retenir(imp.id, echange(1, { dit: "on s’est vus hier" }), { neuf: true, maintenant: false });
    /* Une exécution l’a prise (un essai compté) : l’échange suivant ne la rejoint plus, il en ouvre une autre */
    await db().update(schema.tasks).set({ attempts: 1 }).where(eq(schema.tasks.id, prise.id!));
    await auChat(imp.id, "danger", chatEnAlerte("danger"));
    expect(origineDeLAlerte((await donneesMemoire(imp.id))!.etat)).toBe("chat");
    /* Les deux partent : la première, sans l’échange de l’alerte, rend « effacee » ; la seconde, avec, rend « confirmee » */
    const lues: Requete[] = [];
    expect(await sansAttendre(imp.id)).toBe(true);
    await avecFactice(
      (req: RequeteFactice) => {
        if (req.tache !== "07-memoire" || req.partie !== "mise à jour") return fournisseurFactice(req);
        lues.push(req);
        return { ...(fournisseurFactice(req) as object), alerte_du_chat: lues.length === 1 ? "effacee" : "confirmee" };
      },
      () => executerChaine(imp.id),
    );
    expect(lues).toHaveLength(2);
    /* La première lit l’alerte sans sa provenance, la seconde avec */
    expect(lignesDAlerte(lues[0]!, "danger")).toEqual([expect.stringMatching(/ : danger$/)]);
    expect(lignesDAlerte(lues[1]!, "danger")).toEqual([expect.stringMatching(/ : danger\b/)]);
    expect(lignesDAlerte(lues[1]!, "danger")).not.toEqual(lignesDAlerte(lues[0]!, "danger"));
    const apres = (await donneesMemoire(imp.id))!.etat;
    expect(apres.alerte).toBe("danger");
    expect(origineDeLAlerte(apres)).toBe("lecture");
  });

  it("une réponse en alerte sur une mémoire lue avant qu’une mise à jour efface la précédente : notée quand même, sur la mémoire relue", async () => {
    const u = await compteDeTest("alerte-chat-perimee", "debloque");
    const imp = await histoireLue(u, "06-elle-hesite.txt");
    await auChat(imp.id, "danger", chatEnAlerte("danger"));
    const lueAvant = (await donneesMemoire(imp.id))!;
    expect(origineDeLAlerte(lueAvant.etat)).toBe("chat");
    /* Pendant que le chat écrit sa réponse, la mise à jour efface la première (une vanne) */
    await trancher(imp.id, "danger", "effacee", { rienDeNeuf: true });
    expect((await donneesMemoire(imp.id))!.etat.alerte).toBeNull();
    /* La réponse, partie sur la mémoire lue avant, lève « danger » pour de bon */
    await avecFactice(chatEnAlerte("danger"), async () => repondre(await ligneEnBase(imp.id), lueAvant, "là il m’a vraiment menacé"));
    const apres = (await donneesMemoire(imp.id))!.etat;
    expect(apres.alerte).toBe("danger");
    expect(origineDeLAlerte(apres)).toBe("chat");
    expect(await majQuiAttend(imp.id)).toBe(true);
  });
});

/*
 * Une mémoire de secours écrite avant le rapport (débloqué, pas encore écrit) n’a que l’alerte du verdict : celle du
 * rapport s’y porte quand il s’écrit, lue (src/server/analyse.ts, porterLAlerteDuRapport), et une mise à jour ne
 * l’efface donc pas, même si une réponse du chat la voit ensuite. L’échec pour de bon de la vraie mémoire la porte aussi,
 * si l’écriture du rapport l’a manquée.
 */
describe("l’alerte du rapport sur la mémoire de secours écrite avant lui", () => {
  /** Le modèle factice, son plan du rapport en « danger » (pas son verdict), et la création de la mémoire en panne. */
  const rapportEnDanger = (req: RequeteFactice) => {
    const sortie = memoireEnPanne(req);
    if (req.tache !== "05-rapport" || req.partie !== "plan") return sortie;
    const etape = sortie as { plan: object };
    return { ...etape, plan: { ...etape.plan, alerte: "danger" } };
  };
  const chatEnDanger = (req: RequeteFactice) => (req.tache === "10-chat" ? { ...(fournisseurFactice(req) as object), alerte: "danger" } : fournisseurFactice(req));

  /** Une conv lue sans accès, puis débloquée : la mémoire de secours d’abord (le verdict seul), puis le rapport en « danger ». */
  async function secoursPuisRapport(nom: string) {
    const u = await compteDeTest(nom);
    const imp = await histoireLue(u, "06-elle-hesite.txt");
    await debloquerLaConv(imp.id);
    const avant = (await memoireAssuree(await ligneEnBase(imp.id)))!;
    expect(avant).toMatchObject({ secours: true, etat: { alerte: null } });
    await planifier(imp.id, "rapport_plan");
    await avecFactice(rapportEnDanger, () => executerChaine(imp.id));
    return imp;
  }

  it("portée quand le rapport s’écrit : lue, et un « danger » du chat effacé par la mise à jour ne l’efface pas", async () => {
    const imp = await secoursPuisRapport("alerte-rapport-secours");
    const secours = (await donneesMemoire(imp.id))!;
    expect(secours.secours).toBe(true);
    expect(secours.etat.alerte).toBe("danger");
    expect(origineDeLAlerte(secours.etat)).toBe("lecture");
    /* Le chat lève le même « danger » : rien à noter, il est lu ; la mise à jour qui dit « effacee » n’y change rien */
    await avecFactice(chatEnDanger, async () => repondre(await ligneEnBase(imp.id), (await donneesMemoire(imp.id))!, "je lui réponds quoi ?"));
    expect(origineDeLAlerte((await donneesMemoire(imp.id))!.etat)).toBe("lecture");
    expect(await sansAttendre(imp.id)).toBe(true);
    await avecFactice(
      (req: RequeteFactice) =>
        req.tache === "07-memoire" && req.partie === "mise à jour" ? { ...(fournisseurFactice(req) as object), alerte_du_chat: "effacee" } : memoireEnPanne(req),
      () => executerChaine(imp.id),
    );
    expect((await donneesMemoire(imp.id))!.etat.alerte).toBe("danger");
  });

  it("manquée à l’écriture du rapport (la mémoire de secours arrivée juste après) : l’échec pour de bon de la vraie la porte", async () => {
    const imp = await secoursPuisRapport("alerte-rapport-course");
    /* Comme si la mémoire de secours s’était écrite juste après le rapport, sans son alerte */
    expect(await modifierMemoire(imp.id, (m) => ({ ...m, etat: { ...m.etat, alerte: null } }), { essais: 1 })).toBe("ecrite");
    const portee = await garderUneMemoireDeSecours(imp.id);
    expect(portee).toMatchObject({ secours: true, etat: { alerte: "danger" } });
    expect(origineDeLAlerte(portee!.etat)).toBe("lecture");
    /* Déjà portée : rien ne change */
    expect(await garderUneMemoireDeSecours(imp.id)).toEqual(portee);
  });
});
