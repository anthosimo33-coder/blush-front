import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Requete } from "@prompts/lib/contextes";

/*
 * Le budget de l’IA (src/server/budget.ts) en base : ce que chaque appel a coûté, par jour de Paris, pour tous (ai_usage),
 * par compte et sans compte (comptés à l’appel, dans rate_limits). Les dépenses d’un test sont des lignes d’ai_usage à
 * l’étiquette ETIQUETTE et les dépenses du jour de ses payeurs : effacées avant et après chaque test (un lancement
 * interrompu ne laisse pas 30 $ peser sur les autres fichiers : tests/preparer-la-base.ts efface aussi l’étiquette). Ce
 * qu’un test a lu du budget est oublié avant le suivant. Les captures sont lues comme le ferait la route (cookies simulés).
 */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
  }),
  headers: async () => new Headers(),
}));

import type { Utilisateur } from "@/server/auth";
import { ouvrirSession } from "@/server/auth";
import { cleDeDepense, controlerBudget, noterDepense, oublierLeBudget, payeurDuCompte, type Payeur } from "@/server/budget";
import { lireCaptures } from "@/server/captures";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { progression } from "@/server/donnees";
import { ErreurTache } from "@/server/erreurs";
import { appeler } from "@/server/ia/claude";
import { fournisseurFactice } from "@/server/ia/factice";
import { cloreLesAbandons, executerChaine } from "@/server/pipeline";
import { etatDesTaches, planifier } from "@/server/taches";
import { aujourdhuiParis } from "@/server/temps";
import { echange } from "./aide/fabriques";
import { avecFactice, compteDeTest, convPrete, histoireLue, ligneEnBase } from "./aide/fixtures";

const ETIQUETTE = "test-budget";
const hier = () => aujourdhuiParis(new Date(Date.now() - 86400e3)).iso;

/* Les payeurs dont un test a noté une dépense : leurs dépenses du jour (et de la veille) sont effacées après lui */
const payeurs = new Set<Payeur>([null]);
async function effacerLesDepenses(): Promise<void> {
  await db().delete(schema.aiUsage).where(eq(schema.aiUsage.task, ETIQUETTE));
  const jours = [aujourdhuiParis().iso, hier()];
  const cles = [...payeurs].flatMap((p) => jours.map((j) => empreinte(`limite:${cleDeDepense(p, j)}`)));
  await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, cles));
  oublierLeBudget();
}

/**
 * Une dépense de `dollars` payée par `payeur` (un compte, ou null : sans compte), comme la note un appel : dans ai_usage
 * (pour tous, sur la conv `storyId` s’il y en a une) et dans la dépense du jour de son payeur. `jour` : un autre jour.
 */
async function depense(payeur: Payeur, dollars: number, { storyId = null, jour }: { storyId?: string | null; jour?: string } = {}): Promise<void> {
  payeurs.add(payeur);
  const micros = Math.round(dollars * 1e6);
  if (!jour) await db().insert(schema.aiUsage).values({ storyId, task: ETIQUETTE, model: "test", costMicros: micros });
  await noterDepense(payeur, micros, jour);
}

/** Rejoue le contrôle d’un appel : la conv `storyId` (ou aucune) peut-elle appeler le modèle ? « budget » si non. */
const controle = (storyId?: string) =>
  controlerBudget({ storyId }).then(
    () => "ok",
    (e: unknown) => (e instanceof ErreurTache ? e.code : "autre"),
  );

beforeEach(async () => {
  etat.cookies.clear();
  await effacerLesDepenses();
});
afterEach(effacerLesDepenses);

let numero = 0;
/** Un compte neuf et une conv à lui, prête à être lue. */
async function compteEtConv(plan: Utilisateur["plan"] = "gratuit"): Promise<{ u: Utilisateur; id: string; payeur: string }> {
  const u = await compteDeTest(`budget-${++numero}`, plan);
  const { id } = await convPrete(u, "02-reciproque.txt");
  return { u, id, payeur: payeurDuCompte(u) };
}

/** Le lendemain : les tâches de la conv sont d’hier, et les dépenses du jour remises à zéro. */
async function lendemain(storyId: string): Promise<void> {
  await effacerLesDepenses();
  await db()
    .update(schema.tasks)
    .set({ updatedAt: new Date(Date.now() - 86400e3 - 3600e3) })
    .where(eq(schema.tasks.storyId, storyId));
}

describe("la dépense d’un compte", () => {
  it("additionne ses convs du jour, pas celles d’hier ni celles des autres", async () => {
    const [a, b] = [await compteEtConv(), await compteEtConv()];
    const { id: autreConvDeA } = await convPrete(a.u, "06-elle-hesite.txt");
    await depense(a.payeur, 1.5, { storyId: a.id });
    await depense(a.payeur, 1.4, { storyId: autreConvDeA });
    await depense(a.payeur, 10, { jour: hier() });
    await depense(b.payeur, 2.9, { storyId: b.id });
    expect(await controle(a.id)).toBe("ok");
    expect(await controle(b.id)).toBe("ok");
    /* 3 $ pour A sur ses deux convs : arrêté, B non */
    await depense(a.payeur, 0.1, { storyId: autreConvDeA });
    oublierLeBudget();
    expect(await controle(a.id)).toBe("budget");
    expect(await controle(autreConvDeA)).toBe("budget");
    expect(await controle(b.id)).toBe("ok");
  });

  it("effacer une conv ne rend pas au compte ce qu’elle a coûté, et ne le fait pas passer dans la part sans compte", async () => {
    const a = await compteEtConv();
    const { id: autreConvDeA } = await convPrete(a.u, "06-elle-hesite.txt");
    await depense(a.payeur, 3, { storyId: a.id });
    await db().delete(schema.stories).where(eq(schema.stories.id, a.id));
    oublierLeBudget();
    expect(await controle(autreConvDeA)).toBe("budget");
    expect(await controle()).toBe("ok");
  });

  it("sans conv, l’appel est sans compte : sa part à lui ne touche pas celle des comptes", async () => {
    const a = await compteEtConv();
    await depense(null, 5);
    expect(await controle()).toBe("budget");
    expect(await controle(a.id)).toBe("ok");
  });

  it("au-delà de 30 $ pour tous, plus personne n’appelle le modèle", async () => {
    const a = await compteEtConv();
    await depense(null, 4);
    await depense(a.payeur, 2.5);
    await depense((await compteEtConv()).payeur, 2.9);
    for (let i = 0; i < 7; i++) await depense(`compte:budget-autre-${i}@blush.test`, 2.95);
    expect(await controle(a.id)).toBe("budget");
  });
});

describe("des captures lues avant l’import", () => {
  const images = [{ media: "image/png" as const, base64: "AA==" }];

  it("sont payées par le compte connecté, pas par la part sans compte", async () => {
    const { u, payeur } = await compteEtConv();
    etat.cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
    await depense(payeur, 3);
    await expect(lireCaptures(images, "instagram")).rejects.toMatchObject({ code: "budget" });
    /* Sans compte, la part sans compte, intacte : la lecture part */
    etat.cookies.clear();
    await expect(lireCaptures(images, "instagram")).resolves.toMatchObject({ messages: expect.any(Number) });
  });

  it("sans compte, la part sans compte épuisée n’arrête pas un compte connecté", async () => {
    const { u } = await compteEtConv();
    await depense(null, 5);
    await expect(lireCaptures(images, "instagram")).rejects.toMatchObject({ code: "budget" });
    etat.cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
    await expect(lireCaptures(images, "instagram")).resolves.toMatchObject({ messages: expect.any(Number) });
  });
});

describe("avant l’appel", () => {
  it("le budget atteint, le modèle n’est pas appelé (en mode factice aussi)", async () => {
    const a = await compteEtConv();
    await depense(a.payeur, 3);
    const modele = vi.fn(() => ({ ok: true }));
    const appel = avecFactice(modele, () => appeler({ tache: "10-chat", blocs: [{ texte: "salut" }] }, z.object({ ok: z.boolean() }), { storyId: a.id }));
    await expect(appel).rejects.toMatchObject({ code: "budget" });
    expect(modele).not.toHaveBeenCalled();
  });
});

describe("une lecture arrêtée par le budget", () => {
  it("n’use pas son essai, se dit « souffle », et repart après minuit", async () => {
    const a = await compteEtConv();
    await depense(a.payeur, 3);
    await planifier(a.id, "verdict");
    const modele = vi.fn(() => ({}));
    await avecFactice(modele, () => executerChaine(a.id));
    expect(modele).not.toHaveBeenCalled();
    const { verdict } = await etatDesTaches(a.id, ["verdict"]);
    expect(verdict).toMatchObject({ status: "echec", error: "budget", attempts: 0 });
    expect(await progression(await ligneEnBase(a.id))).toMatchObject({ failed: true, failReason: "souffle" });

    /* Le même jour, rien ne repart : la tâche attend minuit */
    await cloreLesAbandons(a.id);
    expect((await etatDesTaches(a.id, ["verdict"])).verdict?.status).toBe("echec");

    /* Le lendemain : le budget du compte repart de zéro, la lecture aussi */
    await lendemain(a.id);
    await cloreLesAbandons(a.id);
    expect((await etatDesTaches(a.id, ["verdict"])).verdict).toMatchObject({ status: "attente", error: null, attempts: 0 });
    await executerChaine(a.id);
    expect((await etatDesTaches(a.id, ["verdict"])).verdict?.status).toBe("fini");
  });
});

describe("deux lectures arrêtées le même jour", () => {
  it("seule la dernière repart après minuit, sans buter sur l’index des tâches en cours", async () => {
    const a = await compteEtConv();
    await depense(a.payeur, 3);
    /* Arrêtée par le budget, puis relancée le jour même (POST /api/analyse planifie un nouveau verdict) : arrêtée encore */
    await planifier(a.id, "verdict");
    await executerChaine(a.id);
    await planifier(a.id, "verdict");
    await executerChaine(a.id);
    const verdicts = await db().select().from(schema.tasks).where(eq(schema.tasks.storyId, a.id)).orderBy(schema.tasks.createdAt);
    expect(verdicts.map((t) => [t.kind, t.status, t.error])).toEqual([
      ["verdict", "echec", "budget"],
      ["verdict", "echec", "budget"],
    ]);
    await lendemain(a.id);
    await cloreLesAbandons(a.id);
    const apres = await db().select().from(schema.tasks).where(eq(schema.tasks.storyId, a.id)).orderBy(schema.tasks.createdAt);
    expect(apres.map((t) => t.status)).toEqual(["echec", "attente"]);
  });
});

describe("des mises à jour de la mémoire arrêtées par le budget", () => {
  it("repartent toutes le lendemain, dans l’ordre, même après une nouvelle planifiée avant la reprise", async () => {
    const u = await compteDeTest(`budget-${++numero}`, "blushplus");
    const payeur = payeurDuCompte(u);
    const { id } = await histoireLue(u, "02-reciproque.txt");
    expect((await etatDesTaches(id, ["memoire"])).memoire?.status).toBe("fini");
    /* Le jour J : deux échanges du chat, chacun arrêté par le budget (la chaîne s’arrête au premier) */
    await depense(payeur, 3);
    await planifier(id, "memoire_maj", echange(1));
    await executerChaine(id);
    await planifier(id, "memoire_maj", echange(2));
    await executerChaine(id);
    const majs = async () =>
      db()
        .select({ status: schema.tasks.status, error: schema.tasks.error })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "memoire_maj")))
        .orderBy(schema.tasks.createdAt);
    expect(await majs()).toEqual([
      { status: "echec", error: "budget" },
      { status: "echec", error: "budget" },
    ]);

    /* Le lendemain, un message du chat planifie une troisième mise à jour avant que la chaîne reprenne les deux autres */
    await lendemain(id);
    await planifier(id, "memoire_maj", echange(3));
    const lus: number[] = [];
    const modele = (req: Requete) => {
      if (req.tache === "07-memoire") {
        const texte = req.blocs.map((b) => ("texte" in b ? b.texte : "")).join("\n");
        lus.push(...[1, 2, 3].filter((n) => texte.includes(`échange numéro ${n}`)));
      }
      return fournisseurFactice(req);
    };
    await avecFactice(modele, () => executerChaine(id));
    expect(await majs()).toEqual([
      { status: "fini", error: null },
      { status: "fini", error: null },
      { status: "fini", error: null },
    ]);
    expect(lus).toEqual([1, 2, 3]);
    /* Une fois finie, une mise à jour n’a plus à garder son échange (S-34) : la mémoire l’a retenu */
    const entrees = await db()
      .select({ input: schema.tasks.input })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "memoire_maj")));
    expect(entrees).toEqual([{ input: null }, { input: null }, { input: null }]);
  });
});

describe("l’alerte à l’équipe", () => {
  /*
   * Les alertes des fichiers de tests déjà passés comptent dans le budget des alertes du jour, et le seuil a pu être dit
   * par un passage précédent : ce test remet à zéro ces trois compteurs (src/server/limites.ts les range sous leur empreinte)
   */
  const cles = () => ["alertes", "alertes:sujet:budget de l’IA : 50 % du jour", `budget-ia:alerte:${aujourdhuiParis().iso}:0.5`].map((c) => empreinte(`limite:${c}`));
  beforeEach(async () => {
    await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, cles()));
  });

  it("part une fois par seuil et par jour, quelle que soit l’instance qui le passe", async () => {
    const dites: string[] = [];
    vi.spyOn(console, "log").mockImplementation((ligne: unknown) => void dites.push(String(ligne)));
    const a = await compteEtConv();
    await depense(null, 15.5);
    await controle(a.id);
    await vi.waitFor(() => expect(dites.filter((l) => l.includes("50 % du jour"))).toHaveLength(1));
    /* La même instance, puis une autre (qui n’a rien gardé) : le seuil est déjà dit */
    await controle(a.id);
    oublierLeBudget();
    await controle(a.id);
    await new Promise((ok) => setTimeout(ok, 200));
    expect(dites.filter((l) => l.includes("50 % du jour"))).toHaveLength(1);
    expect(dites.some((l) => l.includes("80 %"))).toBe(false);
  });
});
