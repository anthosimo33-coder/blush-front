import { and, desc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { Requete } from "@prompts/lib/contextes";

/*
 * Les citations du chat (POST /api/chat) : un message que les dernières réponses de BLUSH ont déjà cité ne se remontre
 * pas sous la suivante, ni au fil de l’eau, ni dans la réponse gardée (l’historique). Une réponse verrouillée n’a rien
 * montré ; au-delà des dernières réponses, la citation revient. Chaque test a son compte et sa conv : l’ordre des tests
 * n’y change rien. Le dépôt est public : on compare des citations entre elles, jamais un texte recopié ici.
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
import { ouvrirSession } from "@/server/auth";
import { db, schema } from "@/server/db";
import { fournisseurFactice } from "@/server/ia/factice";
import { historique } from "@/server/historique";
import type { BulleChat, EvenementChat, Message } from "@/types";
import { compteDeTest, donnerDesBulles, facticePourChaqueTest, histoireLue } from "./aide/fixtures";

/* Ce que le modèle factice cite à la prochaine réponse : des rangs dans les messages qu’il peut citer, bulle par bulle */
let aCiter: number[][] = [];

/** Les identifiants des messages que la requête du chat lui donne à citer, dans l’ordre où elle les montre. */
const identifiants = (req: Requete) => [
  ...new Set(
    req.blocs
      .flatMap((b) => ("texte" in b ? [b.texte] : []))
      .join("\n")
      .match(/^m\d{4,}(?= )/gm) ?? [],
  ),
];

facticePourChaqueTest((req) => {
  if (req.tache !== "10-chat") return fournisseurFactice(req);
  const ids = identifiants(req);
  return {
    ...(fournisseurFactice(req) as Record<string, unknown>),
    lecture: aCiter.map((rangs, i) => ({ texte: `bulle ${i + 1}`, preuves: rangs.map((r) => ids[r]!) })),
  };
});

const lancerApres = async () => {
  while (etat.apres.length) await etat.apres.shift()!();
};

/** Un compte qui a de quoi parler, sa conv lue, et sa session ouverte : son id. */
async function convDuTest(nom: string): Promise<string> {
  const u = await compteDeTest(`citations-${nom}`, "debloque");
  await donnerDesBulles(u, 1000);
  const { id } = await histoireLue(u, "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } });
  await lancerApres();
  etat.cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
  return id;
}

/** Une réponse du chat, en flux comme le navigateur : les bulles parties au fil de l’eau, puis celles de la réponse validée. */
async function demander(rangs: number[][]): Promise<{ auFil: BulleChat[]; reponse: BulleChat[] }> {
  aCiter = rangs;
  const r = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify({ texte: "elle veut dire quoi ?" }),
    }),
  );
  const evenements = (await r.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as EvenementChat);
  await lancerApres();
  const fin = evenements.find((e) => "reponse" in e) as { reponse: { bubbles: BulleChat[] } } | undefined;
  if (!fin) throw new Error(`pas de réponse : ${evenements.map((e) => Object.keys(e)[0]).join(", ")}`);
  return { auFil: evenements.flatMap((e) => ("bulle" in e ? [e.bulle] : [])), reponse: fin.reponse.bubbles };
}

const citations = (bulles: BulleChat[]): Message[] => bulles.flatMap((b) => b.messages ?? []);

describe("une citation déjà montrée ne revient pas", () => {
  it("sous la réponse suivante : ni au fil de l’eau, ni dans la réponse gardée ; une citation neuve, si", async () => {
    const id = await convDuTest("suivante");
    const premiere = await demander([[0], [1]]);
    expect(citations(premiere.reponse)).toHaveLength(2);

    const seconde = await demander([[0, 2], [1]]);
    /* La première et la deuxième déjà citées : seule la troisième part, sous la première bulle */
    expect(seconde.reponse.map((b) => b.messages?.length)).toEqual([1, 0]);
    expect(citations(premiere.reponse)).not.toContainEqual(citations(seconde.reponse)[0]);
    /* Ce qui part au fil de l’eau est ce que la réponse gardée montre */
    expect(seconde.auFil).toEqual(seconde.reponse);
    expect((await historique(id)).echanges.at(-1)?.answer).toMatchObject({ bubbles: seconde.reponse });
  });

  it("dans la même réponse : un message cité deux fois ne se montre qu’une", async () => {
    await convDuTest("meme-reponse");
    const { auFil, reponse } = await demander([
      [0, 0],
      [0, 1],
    ]);
    expect(reponse.map((b) => b.messages?.length)).toEqual([1, 1]);
    expect(auFil).toEqual(reponse);
  });

  it("une réponse verrouillée n’a rien montré : sa citation revient sous la suivante", async () => {
    const id = await convDuTest("verrouillee");
    await demander([[0]]);
    /* Sa réponse, telle qu’une réponse écrite à 0 bulle l’attend : verrouillée, rien n’en est parti */
    const [blush] = await db()
      .select({ id: schema.chatMessages.id })
      .from(schema.chatMessages)
      .where(and(eq(schema.chatMessages.storyId, id), eq(schema.chatMessages.role, "blush")))
      .orderBy(desc(schema.chatMessages.id))
      .limit(1);
    await db().update(schema.chatMessages).set({ verrouillee: true }).where(eq(schema.chatMessages.id, blush!.id));
    expect(citations((await demander([[0]])).reponse)).toHaveLength(1);
  });

  it("au-delà des 20 dernières réponses, la citation revient", async () => {
    await convDuTest("vingt");
    expect(citations((await demander([[0]])).reponse)).toHaveLength(1);
    for (let i = 0; i < 19; i++) await demander([[]]);
    /* La réponse qui la citait est la vingtième en remontant : la citation ne revient pas encore */
    expect(citations((await demander([[0]])).reponse)).toHaveLength(0);
    /* Elle sort des 20 dernières (celle d’avant ne l’a pas montrée) : elle revient */
    expect(citations((await demander([[0]])).reponse)).toHaveLength(1);
  }, 60_000);
});
