import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Le paywall avant toute lecture (décidé le 16 octobre), avec la base : « Qui es-tu ? » rempli (POST /api/analyse), le
 * verdict d’une conv pas encore payée attend son paiement (tasks.status « paiement ») et rien ne part au modèle ; le code
 * écrit seulement ce qu’il sait (les trouvailles, les chiffres du paywall). Le paiement (la livraison, qui répare la
 * chaîne ; le suivi de la lecture, si le webhook tarde) le lance. Un compte de l’équipe lit tout de suite. Une conv payée
 * qui lève une alerte est signalée à l’équipe, pour la rembourser. La session, after() de Next et les alertes sont simulés.
 */
const etat = vi.hoisted(() => ({
  /** Le compte de la session et sa conv ouverte (contexteRequete) */
  utilisateur: null as { id: string; email: string; bulles: number } | null,
  story: null as Record<string, unknown> | null,
  apres: [] as (() => unknown)[],
  alertes: [] as string[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => void etat.apres.push(f) }));
vi.mock("@/server/donnees", async (original) => ({
  ...(await original<typeof import("@/server/donnees")>()),
  contexteRequete: async () => ({ utilisateur: etat.utilisateur, story: etat.story }),
}));
vi.mock("@/server/env", async (original) => ({ ...(await original<typeof import("@/server/env")>()), accesLibre: (email: string) => email.startsWith("equipe-") }));
vi.mock("@/server/alertes", async (original) => ({ ...(await original<typeof import("@/server/alertes")>()), alerter: async (sujet: string) => void etat.alertes.push(sujet) }));

import { GET as suivreLaLecture, POST as lancerLaLecture } from "@/app/api/analyse/route";
import { signalerLesAchatsDUneAlerte } from "@/server/achats";
import { apercuAvantPaiement } from "@/server/analyse";
import type { Utilisateur } from "@/server/auth";
import { db, schema } from "@/server/db";
import { progression } from "@/server/donnees";
import { contexteDe } from "@/server/histoires";
import { executerChaine, reparerLaChaine } from "@/server/pipeline";
import { etatDesTaches } from "@/server/taches";
import { genreDuHaut } from "@/contenu/haut-du-paywall";
import { HAUT } from "@/server/compteurs";
import { compteDeTest, convRattachee, debloquerLaConv, ligneEnBase } from "./aide/fixtures";

const APPLI = "http://localhost";

/** Le compte du jour d’un compteur (un titre du haut du paywall, vu ou payé). */
const compteDuJour = async (cle: string) => (await db().select().from(schema.counters).where(eq(schema.counters.key, cle)))[0]?.count ?? 0;
const QUI = { me: "p0", pronom: "il", guess: "vus", goal: "ensemble" };

afterEach(() => {
  etat.utilisateur = null;
  etat.story = null;
  etat.apres.length = 0;
  etat.alertes.length = 0;
});

/** Passe après la réponse ce que les routes ont confié à after() (la chaîne relancée). */
async function apresLaReponse(): Promise<void> {
  while (etat.apres.length) await etat.apres.shift()!();
}

/** Connecte ce compte, sur cette conv, telle qu’elle est en base à cet instant (comme la relirait la requête). */
const connecter = async (u: Utilisateur, story: string) => {
  etat.utilisateur = { id: u.id, email: u.email, bulles: u.bulles };
  const { conv, ...ligne } = await ligneEnBase(story);
  etat.story = { ...ligne, aConv: !!conv };
};

/** Un appel de l’appli (même origine), avec ce corps JSON. */
const depuisLAppli = (chemin: string, corps?: unknown, methode = "POST") =>
  new Request(`${APPLI}${chemin}`, {
    method: methode,
    headers: { origin: APPLI, host: "localhost", "x-forwarded-for": "10.8.8.8", "content-type": "application/json" },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });

/** Un compte connecté (de l’équipe avec un préfixe « equipe- »), sa conv importée, puis « Qui es-tu ? » envoyé. */
async function lectureLancee(prefixe: string): Promise<{ u: Utilisateur; conv: string; status: number }> {
  const u = await compteDeTest(prefixe);
  const conv = (await convRattachee(u, "02-reciproque.txt")).id;
  await connecter(u, conv);
  const r = await lancerLaLecture(depuisLAppli("/api/analyse", QUI));
  await connecter(u, conv);
  return { u, conv, status: r.status };
}

const statutDuVerdict = async (conv: string) => (await etatDesTaches(conv, ["verdict"])).verdict?.status;
const appelsAuModele = async (conv: string) => (await db().select().from(schema.aiUsage).where(eq(schema.aiUsage.storyId, conv))).length;

describe("le paywall avant toute lecture", () => {
  it("« Qui es-tu ? » envoyé, rien de payé : le verdict attend son paiement, rien ne part au modèle, le code écrit ce qu’il sait", async () => {
    const { conv, status } = await lectureLancee("paywall-attend");
    expect(status).toBe(200);
    expect(await statutDuVerdict(conv)).toBe("paiement");
    await apresLaReponse();
    await executerChaine(conv);
    expect(await statutDuVerdict(conv)).toBe("paiement");
    expect(await appelsAuModele(conv)).toBe(0);
    expect(await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, conv))).toHaveLength(0);
    /*
     * Ce que le code sait : les trouvailles de la lecture, le haut du paywall (qui ouvre, reprend, relance, répond vite,
     * écrit long, et la chute s’il y en a une), et son titre, gardé chiffré dans le contexte et compté vu une fois
     */
    const ligne = await ligneEnBase(conv);
    expect(contexteDe(ligne)?.trouvailles.length).toBeGreaterThan(0);
    expect((await progression(ligne)).paiement).toBe(true);
    const apercu = await apercuAvantPaiement(conv);
    expect(apercu?.signaux.map((s) => s.id).slice(0, 3)).toEqual(["ouvre", "reprend", "relance"]);
    const genre = contexteDe(ligne)?.accroche;
    expect(genre).toBe(genreDuHaut(apercu!));
    expect(await compteDuJour(`${HAUT}vu:${genre}`)).toBeGreaterThan(0);
    /* Relancée (l’écran de lecture, un autre onglet) : une seule tâche, toujours en attente du paiement */
    expect((await lancerLaLecture(depuisLAppli("/api/analyse", {}))).status).toBe(200);
    expect(await db().select().from(schema.tasks).where(eq(schema.tasks.storyId, conv))).toHaveLength(1);
    expect(await statutDuVerdict(conv)).toBe("paiement");
  });

  it("payé : la livraison répare la chaîne, le verdict part, puis le rapport ; le paywall ne se montre plus", async () => {
    const { u, conv } = await lectureLancee("paywall-paye");
    await debloquerLaConv(conv);
    expect(await reparerLaChaine({ id: conv, userId: u.id })).toBe(true);
    expect(await statutDuVerdict(conv)).toBe("attente");
    await apresLaReponse();
    await executerChaine(conv);
    expect(await statutDuVerdict(conv)).toBe("fini");
    expect(await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, conv))).toHaveLength(1);
    expect((await etatDesTaches(conv, ["rapport_plan"])).rapport_plan).toBeDefined();
    expect(await apercuAvantPaiement(conv)).toBeNull();
    expect((await progression(await ligneEnBase(conv))).paiement).toBeUndefined();
  });

  it("le webhook tarde : le suivi de la lecture (GET /api/analyse) lance le verdict d’une conv déjà débloquée", async () => {
    const { u, conv } = await lectureLancee("paywall-suivi");
    /* Pas encore payée : le suivi ne lance rien */
    expect((await suivreLaLecture()).status).toBe(200);
    expect(await statutDuVerdict(conv)).toBe("paiement");
    await debloquerLaConv(conv);
    await connecter(u, conv);
    expect((await suivreLaLecture()).status).toBe(200);
    expect(await statutDuVerdict(conv)).not.toBe("paiement");
  });

  it("un compte de l’équipe : le verdict part tout de suite, comme avant", async () => {
    const { conv } = await lectureLancee("equipe-paywall");
    expect(await statutDuVerdict(conv)).toBe("attente");
    await apresLaReponse();
    expect(await statutDuVerdict(conv)).toBe("fini");
  });
});

describe("une conv payée qui lève une alerte", () => {
  it("ses achats payés sont signalés à l’équipe, pour les rembourser ; sans achat payé, rien", async () => {
    const u = await compteDeTest("paywall-alerte");
    const conv = (await convRattachee(u, "02-reciproque.txt")).id;
    await signalerLesAchatsDUneAlerte(conv, "danger");
    expect(etat.alertes).toEqual([]);
    await db().insert(schema.achats).values({ userId: u.id, storyId: conv, offre: "rapport", centimes: 1390, bulles: 10, fournisseur: "factice", statut: "paye" });
    await signalerLesAchatsDUneAlerte(conv, "danger");
    expect(etat.alertes).toEqual(["à rembourser : une conv payée lève une alerte"]);
    await db()
      .delete(schema.achats)
      .where(and(eq(schema.achats.userId, u.id), eq(schema.achats.storyId, conv)));
  });
});
