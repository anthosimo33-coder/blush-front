import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Requete } from "@prompts/lib/contextes";

/*
 * Des captures pour sa fiche : la réponse part avec ce qui a été lu, sans attendre la mise à jour de la mémoire
 * (20 à 60 s, après la réponse). GET /api/fiche dit qu’elle tourne, pour que l’écran relise la fiche jusqu’à la fin.
 * Les routes sont appelées comme le ferait le navigateur : cookies simulés, after() gardé pour être lancé à la main, les
 * alertes à l’équipe gardées pour être lues.
 */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>(), apres: [] as (() => unknown)[], alertes: [] as string[][] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
    set: (n: string, v: string) => etat.cookies.set(n, v),
    delete: (n: string) => etat.cookies.delete(n),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => etat.apres.push(f) }));
vi.mock("@/server/alertes", async (original) => ({ ...(await original<typeof import("@/server/alertes")>()), alerter: async (sujet: string, lignes: string[]) => void etat.alertes.push([sujet, ...lignes]) }));

import { GET, POST, PUT } from "@/app/api/fiche/route";
import { executerChaine } from "@/server/analyse";
import { ouvrirSession } from "@/server/auth";
import { db, schema } from "@/server/db";
import { ErreurTache } from "@/server/erreurs";
import { definirQui, depuisFichier, importer, rattacherBrouillon } from "@/server/histoires";
import { definirFactice } from "@/server/ia/claude";
import { fournisseurFactice } from "@/server/ia/factice";
import { planifier } from "@/server/taches";
import type { Fiche, FicheUpdate } from "@/types";

const email = `fiche-async-${Date.now()}@blush.test`;
const taches: string[] = [];
let id = "";
/* Ce que rend la lecture des captures (par défaut, celle du modèle factice) */
let captures: ((req: Requete) => unknown) | null = null;

const requete = (init: RequestInit = {}) => new Request("http://localhost/api/fiche", { ...init, headers: { origin: "http://localhost", "x-forwarded-host": "localhost", ...init.headers } });
const lire = async () => (await (await GET()).json()) as Fiche;
const lancerApres = async () => {
  while (etat.apres.length) await etat.apres.shift()!();
};
/** Une mise à jour de la mémoire planifiée par le chat (un échange qui apporte du neuf). */
const majDuChat = () => planifier(id, "memoire_maj", { date: "2026-03-15", dit: "on s’est vus hier, c’était trop bien", reponse: ["Enfin."] });

beforeAll(async () => {
  definirFactice((req: Requete) => (taches.push(req.tache), req.tache === "01-captures" && captures ? captures(req) : fournisseurFactice(req)));
  const imp = await importer(await depuisFichier(new File([readFileSync("prompts/evals/convs/01-a-deux-doigts.txt")], "01.txt", { type: "text/plain" })));
  id = imp.id;
  const [u] = await db().insert(schema.users).values({ email, plan: "blushplus" }).returning();
  await rattacherBrouillon(u, imp.secret);
  await definirQui(id, { moi: imp.meta.participants.findIndex((p) => p.prenom === "Hugo") as 0 | 1, pronom: "il", devinette: "vus", objectif: "ensemble" });
  await planifier(id, "verdict");
  await executerChaine(id);
  await lancerApres();
  etat.cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
});
afterAll(async () => {
  await db().delete(schema.users).where(eq(schema.users.email, email));
  definirFactice(null);
});

describe("ajouter des captures à sa fiche", () => {
  it("un nouvel export : la réponse part avec le nombre de nouveaux messages, sans profil", async () => {
    const suite = ["[14/03/2026 10:02:11] Hugo: alors cette semaine ?", "[14/03/2026 18:40:00] Sophie: ça va mieux"].join("\n");
    /* Le paquet que prépare le navigateur (src/services/preparer-export.ts) : du JSON compressé */
    const paquet = gzipSync(JSON.stringify({ nom: "conv.txt", parties: [{ nom: "conv.txt", contenu: `${readFileSync("prompts/evals/convs/01-a-deux-doigts.txt", "utf8")}\n${suite}` }] }));
    const fd = new FormData();
    fd.append("export", new File([paquet], "paquet.json.gz", { type: "application/gzip" }));
    taches.length = 0;
    const r = await POST(requete({ method: "POST", body: fd }));
    expect(r.status).toBe(200);
    /* Champ par champ : en cas d’échec, la réponse entière (lue sur une conv d’éval, privée) ne s’affiche pas */
    const reponse = (await r.json()) as FicheUpdate;
    expect(reponse.added).toEqual([]);
    expect(reponse.pending?.profile).toEqual([]);
    expect(reponse.pending?.messages).toBe(2);
    expect(reponse.fiche.updating).toBe(true);
    expect(taches).toEqual([]);
    await lancerApres();
    expect((await lire()).updating).toBeUndefined();
  });

  it("la réponse part avec son profil « en cours d’ajout », la mémoire se met à jour après", async () => {
    const avant = await lire();
    expect(avant.updating).toBeUndefined();
    const fd = new FormData();
    fd.append("captures", new File([new Uint8Array(64)], "profil.jpg", { type: "image/jpeg" }));
    taches.length = 0;
    const r = await POST(requete({ method: "POST", body: fd }));
    expect(r.status).toBe(200);
    const maj = (await r.json()) as FicheUpdate;
    /* Les captures sont lues (prompt 01), la mémoire pas encore (prompt 07) */
    expect(taches).toEqual(["01-captures"]);
    expect(maj).toMatchObject({ added: [], pending: { profile: ["Étudiante en droit à Lyon"] }, fiche: { updating: true } });
    expect(maj.pending!.messages).toBeGreaterThan(0);
    expect(maj.fiche.facts.map((f) => f.text)).toEqual(avant.facts.map((f) => f.text));

    /* Tant qu’elle tourne, la fiche le dit */
    expect((await lire()).updating).toBe(true);
    await lancerApres();
    expect(taches).toContain("07-memoire");
    const apres = await lire();
    expect(apres.updating).toBeUndefined();
    expect(apres.facts.find((f) => f.text === "Étudiante en droit à Lyon")).toMatchObject({ sourceLabel: expect.stringMatching(/^son profil · /) });
  });

  it("corriger sa fiche pendant une mise à jour : la réponse le dit, et la mise à jour garde la correction", async () => {
    await majDuChat();
    const actuelle = await lire();
    expect(actuelle.updating).toBe(true);
    const facts = [...actuelle.facts.map((f) => ({ section: f.section, text: f.text })), { section: "notes", text: "Allergique aux chats" }];
    const r = await PUT(requete({ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts }) }));
    expect(r.status).toBe(200);
    expect(((await r.json()) as Fiche).updating).toBe(true);
    await lancerApres();
    const fin = await lire();
    expect(fin.updating).toBeUndefined();
    /* Ce qu’il a ajouté reste, ce que la mise à jour a appris s’y ajoute */
    expect(fin.facts.map((f) => f.text)).toEqual(expect.arrayContaining(["Allergique aux chats", "Adore les soirées improvisées"]));
  });

  it("une mise à jour restée en plan (l’instance arrêtée) repart quand la fiche se relit", async () => {
    const t = await majDuChat();
    await db().update(schema.tasks).set({ status: "en_cours", attempts: 1, heartbeatAt: sql`now() - interval '10 minutes'` }).where(eq(schema.tasks.id, t));
    etat.apres.length = 0;
    expect((await lire()).updating).toBe(true);
    expect(etat.apres).toHaveLength(1);
    await lancerApres();
    const [tache] = await db().select().from(schema.tasks).where(and(eq(schema.tasks.id, t), eq(schema.tasks.storyId, id)));
    expect(tache.status).toBe("fini");
    expect((await lire()).updating).toBeUndefined();
    /* Plus rien en attente : la relecture ne relance rien */
    expect(etat.apres).toHaveLength(0);
  });
});

describe("un ajout à sa fiche qui échoue", () => {
  afterAll(() => void (captures = null));

  it("une erreur d’étape à la lecture des captures (le temps écoulé) : un 502 « panne », le code interne dans l’alerte", async () => {
    /* Ce que lève appeler() quand l’échéance est trop proche pour lancer l’appel */
    captures = () => {
      throw new ErreurTache("delai");
    };
    etat.alertes.length = 0;
    const fd = new FormData();
    fd.append("captures", new File([new Uint8Array(64)], "profil.jpg", { type: "image/jpeg" }));
    const r = await POST(requete({ method: "POST", body: fd }));
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ erreur: "panne" });
    expect(etat.alertes).toEqual([["ajout à la fiche en échec", `Histoire ${id}`, "Erreur : delai"]]);
    await lancerApres();
  });
});
