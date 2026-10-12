import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Requete } from "@prompts/lib/contextes";

/*
 * La question incluse avec le rapport (« Ta question », POST /api/chat marquée `question`) : le plan « rapport » en a
 * une par conv, sans le chat (src/server/question-incluse.ts). Elle ne part qu’une fois au modèle, même envoyée deux
 * fois d’un coup ; une réponse qui échoue la rend ; BLUSH+ n’a pas de compte à tenir, un compte gratuit n’a rien. La
 * route est appelée comme le ferait le navigateur (cookies simulés, after() gardé pour être lancé à la main, les alertes
 * à l’équipe gardées sans partir).
 */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>(), apres: [] as (() => unknown)[] }));
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
vi.mock("@/server/alertes", async (original) => ({ ...(await original<typeof import("@/server/alertes")>()), alerter: async () => {} }));

import { POST } from "@/app/api/chat/route";
import { ouvrirSession, type Utilisateur } from "@/server/auth";
import { db, schema } from "@/server/db";
import { DUREE_FONCTION_S } from "@/server/echeance";
import { cleDeLimiteDuCompte } from "@/server/email-canonique";
import { historique } from "@/server/historique";
import { fournisseurFactice, refusFactice } from "@/server/ia/factice";
import { compteDe, LIMITES } from "@/server/limites";
import { prendreLaQuestion, rendreLaQuestion } from "@/server/question-incluse";
import type { EvenementChat, Plan } from "@/types";
import { compteDeTest, facticePourChaqueTest, histoireLue, ligneEnBase } from "./aide/fixtures";

/* Une question inventée, comme un utilisateur l’écrirait */
const QUESTION = { texte: "elle m’a dit on verra pour dimanche, ça veut dire non ?", question: true } as const;

/* Les appels au chat, et ce que le modèle factice rend pour lui (par défaut, sa réponse habituelle) */
let appels = 0;
let chat: ((req: Requete) => unknown) | null = null;

/** Un envoi du navigateur à la route : un corps JSON (ou tel quel, s’il est déjà écrit), en flux ou d’un bloc. */
const envoyer = (corps: object | string, flux = true) =>
  POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "content-type": "application/json", ...(flux ? { accept: "application/x-ndjson" } : {}) },
      body: typeof corps === "string" ? corps : JSON.stringify(corps),
    }),
  );
/** Le flux lu jusqu’au bout : ses événements, dans l’ordre. */
const evenements = async (r: Response) =>
  (await r.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as EvenementChat);
const lancerApres = async () => {
  while (etat.apres.length) await etat.apres.shift()!();
};
const echanges = async (id: string) => (await historique(id)).echanges.length;
const prise = async (id: string) => (await ligneEnBase(id)).questionPrise;

/** Un compte de ce plan, connecté. `conv` : avec sa conv lue (le rapport et la mémoire faits si le plan les ouvre). */
async function compteConnecte(plan: Plan, { conv = true } = {}): Promise<{ compte: Utilisateur; id: string }> {
  const compte = await compteDeTest(`question-${plan}`, plan);
  const id = conv ? (await histoireLue(compte, "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id : "";
  await lancerApres();
  etat.cookies.set("blush-session", (await ouvrirSession(compte.id)).secret);
  return { compte, id };
}

facticePourChaqueTest((req) => {
  if (req.tache !== "10-chat") return fournisseurFactice(req);
  appels++;
  return chat ? chat(req) : fournisseurFactice(req);
});
beforeEach(() => {
  appels = 0;
  chat = null;
  etat.cookies.clear();
});

describe("la question incluse avec le rapport", () => {
  it("un compte « rapport » : sa question reçoit sa réponse, une fois ; la suivante et le chat répondent 402 « acces », sans appeler le modèle", async () => {
    const { compte, id } = await compteConnecte("rapport");
    const r = await envoyer(QUESTION);
    expect(r.status).toBe(200);
    expect((await evenements(r)).map((e) => Object.keys(e)[0])).toEqual(["bulle", "bulle", "reponse"]);
    await lancerApres();
    expect([appels, await echanges(id)]).toEqual([1, 1]);
    expect(await prise(id)).not.toBeNull();

    for (const corps of [{ ...QUESTION, texte: "et samedi, je fais quoi ?" }, { texte: "et samedi, je fais quoi ?" }]) {
      const refus = await envoyer(corps);
      expect([refus.status, await refus.json()]).toEqual([402, { erreur: "acces" }]);
    }
    expect([appels, await echanges(id)]).toEqual([1, 1]);
    /* Seule la question partie compte un message du jour : la seconde rend le sien, le chat est refusé avant d’en compter */
    expect(await compteDe(cleDeLimiteDuCompte("chat", compte.email), LIMITES.chatParCompte)).toBe(1);
  });

  it("deux questions envoyées d’un coup (deux onglets, un double envoi) : une seule part au modèle, l’autre répond 402", async () => {
    const { id } = await compteConnecte("rapport");
    const reponses = await Promise.all([envoyer(QUESTION, false), envoyer(QUESTION, false)]);
    expect(reponses.map((r) => r.status).sort()).toEqual([200, 402]);
    await lancerApres();
    expect([appels, await echanges(id)]).toEqual([1, 1]);
  });

  it("une réponse qui échoue rend la question, avant sa première bulle (un refus) comme après (une sortie illisible) : elle se repose", async () => {
    const { id } = await compteConnecte("rapport");
    chat = () => refusFactice("cyber");
    for (const flux of [true, false]) {
      const r = await envoyer(QUESTION, flux);
      expect([r.status, await r.json()]).toEqual([502, { erreur: "refus" }]);
      await lancerApres();
      expect(await prise(id)).toBeNull();
    }
    /* Un niveau qui n’existe pas, lu après la lecture déjà montrée : les bulles sont parties, la réponse non */
    chat = (req) => ({ ...(fournisseurFactice(req) as object), niveau_atteint: "inconnu" });
    expect((await evenements(await envoyer(QUESTION))).map((e) => Object.keys(e)[0])).toEqual(["bulle", "bulle", "erreur"]);
    await lancerApres();
    expect([await prise(id), await echanges(id)]).toEqual([null, 0]);

    chat = null;
    expect((await envoyer(QUESTION, false)).status).toBe(200);
    await lancerApres();
    expect(await echanges(id)).toBe(1);
  });

  it("prise, elle ne se reprend pas ; une prise plus vieille qu’une fonction sans échange gardé (coupée en route) se reprend ; posée, plus jamais", async () => {
    const { id } = await compteConnecte("rapport");
    const priseIlYA = (secondes: number) =>
      db()
        .update(schema.stories)
        .set({ questionPrise: sql`now() - make_interval(secs => ${secondes})` })
        .where(eq(schema.stories.id, id));
    expect(await prendreLaQuestion(id)).toBe(true);
    expect(await prendreLaQuestion(id)).toBe(false);
    await priseIlYA(DUREE_FONCTION_S - 10);
    expect(await prendreLaQuestion(id)).toBe(false);
    await priseIlYA(DUREE_FONCTION_S + 120);
    expect(await prendreLaQuestion(id)).toBe(true);
    await rendreLaQuestion(id);
    expect(await prise(id)).toBeNull();

    /* Posée : son échange gardé dans le chat, ni une vieille prise ni une prise rendue ne la font repartir */
    expect((await envoyer(QUESTION, false)).status).toBe(200);
    await lancerApres();
    await priseIlYA(DUREE_FONCTION_S + 120);
    expect(await prendreLaQuestion(id)).toBe(false);
    await rendreLaQuestion(id);
    expect(await prendreLaQuestion(id)).toBe(false);
  });

  it("BLUSH+ : la question part autant de fois que le chat, sans rien prendre", async () => {
    const { id } = await compteConnecte("blushplus");
    for (const texte of ["pourquoi elle vanne ?", "je relance trop ?"]) expect((await envoyer({ ...QUESTION, texte }, false)).status).toBe(200);
    await lancerApres();
    expect([appels, await echanges(id), await prise(id)]).toEqual([2, 2, null]);
  });

  it("un compte gratuit : 402 « acces », pour la question comme pour le chat, avant même de lire l’envoi", async () => {
    await compteConnecte("gratuit", { conv: false });
    for (const corps of [QUESTION, { texte: QUESTION.texte }, "{"]) {
      const r = await envoyer(corps);
      expect([r.status, await r.json()]).toEqual([402, { erreur: "acces" }]);
    }
    expect(appels).toBe(0);
  });
});
