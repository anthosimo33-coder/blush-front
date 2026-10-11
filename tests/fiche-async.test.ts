import { gzipSync } from "node:zlib";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
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
    delete: (n: string | { name: string }) => etat.cookies.delete(typeof n === "string" ? n : n.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => etat.apres.push(f) }));
vi.mock("@/server/alertes", async (original) => ({ ...(await original<typeof import("@/server/alertes")>()), alerter: async (sujet: string, lignes: string[]) => void etat.alertes.push([sujet, ...lignes]) }));

import { GET, POST, PUT } from "@/app/api/fiche/route";
import { ouvrirSession } from "@/server/auth";
import { db, schema } from "@/server/db";
import { ErreurTache } from "@/server/erreurs";
import { contexteDe } from "@/server/histoires";
import { fournisseurFactice } from "@/server/ia/factice";
import { planifier } from "@/server/taches";
import { getFiche, getFicheEtMaj } from "@/services/serveur";
import type { Fiche, FicheUpdate } from "@/types";
import { texteDeConv } from "./aide/fichiers";
import { avecFactice, compteDeTest, facticePourChaqueTest, histoireLue, ligneEnBase } from "./aide/fixtures";

/* Les étapes demandées au modèle (factice) pendant les tests */
const taches: string[] = [];
let id = "";

const requete = (init: RequestInit = {}) => new Request("http://localhost/api/fiche", { ...init, headers: { origin: "http://localhost", "x-forwarded-host": "localhost", ...init.headers } });
const lire = async () => (await (await GET()).json()) as Fiche;
const lancerApres = async () => {
  while (etat.apres.length) await etat.apres.shift()!();
};
/**
 * Une ligne d’un export WhatsApp, `minutes` après le dernier message lu de la conv (relu en base : l’import, ou un ajout
 * d’un autre test) : toujours nouvelle. L’heure d’un export n’a pas de fuseau, elle se garde et se relit en UTC.
 */
async function apresLeDernierLu(minutes: number, qui: string, texte: string): Promise<string> {
  const dernier = contexteDe(await ligneEnBase(id))?.dernier;
  if (dernier == null) throw new Error("une conv lue garde l’heure de son dernier message");
  const d = new Date(dernier + minutes * 60e3);
  const p = (n: number) => String(n).padStart(2, "0");
  return `[${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}] ${qui}: ${texte}`;
}
/** Une mise à jour de la mémoire planifiée par le chat (un échange qui apporte du neuf). */
const majDuChat = () => planifier(id, "memoire_maj", { date: "2026-03-15", dit: "on s’est vus hier, c’était trop bien", reponse: ["Enfin."] });

facticePourChaqueTest((req: Requete) => (taches.push(req.tache), fournisseurFactice(req)));
beforeAll(async () => {
  const u = await compteDeTest("fiche-async", "blushplus");
  id = (await histoireLue(u, "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id;
  await lancerApres();
  etat.cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
});

describe("ajouter des captures à sa fiche", () => {
  it("un nouvel export : la réponse part avec le nombre de nouveaux messages, sans profil", async () => {
    const suite = [await apresLeDernierLu(1, "Hugo", "alors cette semaine ?"), await apresLeDernierLu(2, "Sophie", "ça va mieux")].join("\n");
    /* Le paquet que prépare le navigateur (src/services/preparer-export.ts) : du JSON compressé */
    const paquet = gzipSync(JSON.stringify({ nom: "conv.txt", parties: [{ nom: "conv.txt", contenu: `${texteDeConv("01-a-deux-doigts.txt")}\n${suite}` }] }));
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
    fd.append("captures", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Uint8Array(60)])], "profil.jpg", { type: "image/jpeg" }));
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
    const tache = (await db().select().from(schema.tasks).where(and(eq(schema.tasks.id, t), eq(schema.tasks.storyId, id))))[0]!;
    expect(tache.status).toBe("fini");
    expect((await lire()).updating).toBeUndefined();
    /* Plus rien en attente : la relecture ne relance rien */
    expect(etat.apres).toHaveLength(0);
  });

  it("la page de sa fiche, rendue par le serveur, dit aussi qu’une mise à jour tourne, et relance celle restée en plan", async () => {
    /* L’écran ne relit pas une fiche rendue à l’instant (Q63) : le rendu doit porter `updating`, comme GET /api/fiche */
    const t = await majDuChat();
    etat.apres.length = 0;
    expect((await getFicheEtMaj())?.updating).toBe(true);
    expect(etat.apres).toHaveLength(1);
    /* Ce que l’accueil lit de sa fiche (son prénom, son résumé) ne la suit pas : rien de relancé */
    etat.apres.length = 0;
    expect((await getFiche())?.updating).toBeUndefined();
    expect(etat.apres).toHaveLength(0);
    await db().update(schema.tasks).set({ status: "en_cours", attempts: 1, heartbeatAt: sql`now() - interval '10 minutes'` }).where(eq(schema.tasks.id, t));
    expect((await getFicheEtMaj())?.updating).toBe(true);
    await lancerApres();
    const tache = (await db().select().from(schema.tasks).where(eq(schema.tasks.id, t)))[0]!;
    expect(tache.status).toBe("fini");
    expect((await getFicheEtMaj())?.updating).toBeUndefined();
    expect(etat.apres).toHaveLength(0);
  });
});

describe("un ajout à sa fiche qui échoue", () => {
  it("une erreur d’étape à la lecture des captures (le temps écoulé) : un 502 « panne », le code interne dans l’alerte", async () => {
    /* Ce que lève appeler() quand l’échéance est trop proche pour lancer l’appel */
    const enRetard = (req: Requete) => {
      if (req.tache === "01-captures") throw new ErreurTache("delai");
      return fournisseurFactice(req);
    };
    etat.alertes.length = 0;
    const fd = new FormData();
    fd.append("captures", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Uint8Array(60)])], "profil.jpg", { type: "image/jpeg" }));
    const r = await avecFactice(enRetard, () => POST(requete({ method: "POST", body: fd })));
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ erreur: "panne" });
    /* L’alerte part une fois la réponse envoyée (reponseErreur, comme le chat) : elle ne la retarde pas */
    expect(etat.alertes).toEqual([]);
    await lancerApres();
    expect(etat.alertes).toEqual([["ajout à la fiche en échec", `Histoire ${id}`, "Erreur : delai"]]);
  });
});
