import { randomUUID } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Requete } from "@prompts/lib/contextes";

/*
 * Les bulles dans le chat (POST /api/chat, et la lecture d’une réponse verrouillée, POST /api/chat/debloquer) : le
 * débit avant que BLUSH écrive, les bulles rendues quand la réponse échoue ou sort en alerte de danger, la réponse qui
 * dit ce qu’elle a coûté et ce qu’il reste, et la réponse écrite à 0 bulle, verrouillée, qui ne sort jamais du serveur
 * avant d’être payée (ni dans le flux, ni dans l’historique, ni en image partagée, ni dans la mémoire). Les routes sont
 * appelées comme le ferait le navigateur (cookies simulés, after() gardé pour être lancé à la main). L’équipe est simulée
 * (un email en « equipe- »). Chaque test a son compte et sa conv : il passe seul comme dans n’importe quel ordre.
 * Le dépôt est public : on compare ce que BLUSH a écrit à ce qui est sorti, jamais un texte recopié ici.
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
vi.mock("@/server/env", async (original) => {
  const o = await original<typeof import("@/server/env")>();
  return { ...o, accesLibre: (email: string) => email.startsWith("equipe-") };
});

import { GET, POST } from "@/app/api/chat/route";
import { POST as debloquer } from "@/app/api/chat/debloquer/route";
import { AIDE_SANS_BULLES, URGENCES } from "@/contenu/aide";
import { CATALOGUE, COUT_EN_BULLES } from "@/contenu/offres";
import { commander, livrer } from "@/server/achats";
import { ouvrirSession, type Utilisateur } from "@/server/auth";
import { coutDe, crediter, refDuMessage, reponseVerrouillee, soldeDe } from "@/server/bulles";
import * as coffre from "@/server/coffre";
import { CLES } from "@/server/compteurs";
import { db, schema } from "@/server/db";
import { compteDe, compter, LIMITES } from "@/server/limites";
import { cleDeLimiteDuCompte } from "@/server/email-canonique";
import { momentAPartager } from "@/server/partages";
import { fournisseurFactice, refusFactice } from "@/server/ia/factice";
import { askQuestion, lireLaReponse, sendToBlush } from "@/services/api";
import type { BlushAnswer, EvenementChat } from "@/types";
import type { HistoriqueChat } from "@/types/api";
import { tachesDe } from "./aide/essai";
import { compteDeTest, donnerDesBulles, facticePourChaqueTest, histoireLue, ligneEnBase } from "./aide/fixtures";

/* Les appels au chat, et ce que le modèle factice rend pour lui (par défaut, sa réponse habituelle) */
let appels = 0;
let chat: ((req: Requete) => unknown) | null = null;
/* Pendant l’appel au chat : le solde de son compte, lu à ce moment-là (`sonde`) */
let sonde: { userId: string; soldes: Promise<number>[] } | null = null;

facticePourChaqueTest((req) => {
  if (req.tache !== "10-chat") return fournisseurFactice(req);
  appels++;
  if (sonde) sonde.soldes.push(soldeDe(sonde.userId));
  return chat ? chat(req) : fournisseurFactice(req);
});
beforeEach(() => {
  appels = 0;
  chat = null;
  sonde = null;
});

const lancerApres = async () => {
  while (etat.apres.length) await etat.apres.shift()!();
};

/** Un compte qui a lu sa conv (son rapport débloqué, sa mémoire faite), connecté, avec `bulles` bulles. */
async function parleur(prefixe: string, bulles: number): Promise<{ u: Utilisateur; id: string }> {
  const u = await compteDeTest(prefixe, "debloque");
  if (bulles) await donnerDesBulles(u, bulles);
  const id = (await histoireLue(u, "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id;
  await lancerApres();
  etat.cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
  return { u, id };
}

const requete = (chemin: string, init: RequestInit = {}) =>
  new Request(`http://localhost${chemin}`, { ...init, headers: { origin: "http://localhost", "x-forwarded-host": "localhost", ...init.headers } });
/* `cle` : la clé du message, la même pour « Réessayer » (le navigateur la prend une fois par message) */
const envoyer = (texte: string, { flux = true, question = false, cle }: { flux?: boolean; question?: boolean; cle?: string } = {}) =>
  POST(
    requete("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", ...(flux ? { accept: "application/x-ndjson" } : {}) },
      body: JSON.stringify({ texte, ...(question ? { question: true } : {}), ...(cle ? { cle } : {}) }),
    }),
  );
/** La réponse d’un envoi, en flux ou d’un bloc (une réponse déjà écrite revient d’un bloc). */
const reponseDe = async (r: Response): Promise<BlushAnswer> =>
  r.headers.get("content-type")?.includes("ndjson") ? reponseDu((await fluxDe(r)).evenements) : ((await r.json()) as BlushAnswer);
/**
 * La carte d’achat qu’une réponse verrouillée porte en arrivant (src/server/vente.ts) : la recharge, à zéro, sans carte
 * gardée (aucun paiement branché ici). Elle ne dit rien de la réponse, et ne se garde pas : ni l’historique ni « Réessayer » ne l’ont.
 */
const RECHARGE_A_ZERO = { offre: { genre: "bulles", solde: 0, enUnGeste: false } } as const;
/** Ce que porte une réponse 402 « bulles » : les numéros d’aide de l’appli (src/contenu/aide.ts), toujours. */
const SANS_BULLES = { erreur: "bulles", aide: AIDE_SANS_BULLES };
/* Une capture (de leur conv), comme l’envoie le « + » du chat */
const envoyerCaptures = () => {
  const fd = new FormData();
  fd.append("captures", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "c.png", { type: "image/png" }));
  return POST(requete("/api/chat", { method: "POST", headers: { accept: "application/x-ndjson" }, body: fd }));
};
const lire = (message: number) => debloquer(requete("/api/chat/debloquer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) }));
const historique = async () => (await (await GET(requete("/api/chat"))).json()) as HistoriqueChat;

/** Le flux en entier, tel qu’il est parti (le texte brut), et ses événements. */
async function fluxDe(r: Response): Promise<{ brut: string; evenements: EvenementChat[] }> {
  const brut = await r.text();
  return {
    brut,
    evenements: brut
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as EvenementChat),
  };
}
const reponseDu = (evenements: EvenementChat[]) => evenements.flatMap((e) => ("reponse" in e ? [e.reponse] : [])).at(-1)!;

/** Le journal des bulles du compte, sans le don du départ : raison, delta, référence. */
const journalDe = (userId: string) =>
  db()
    .select({ raison: schema.mouvementsBulles.raison, delta: schema.mouvementsBulles.delta, ref: schema.mouvementsBulles.ref })
    .from(schema.mouvementsBulles)
    .where(and(eq(schema.mouvementsBulles.userId, userId), ne(schema.mouvementsBulles.raison, "equipe")))
    .orderBy(schema.mouvementsBulles.id);

/** Les réponses du chat sorties en alerte aujourd’hui (jour de Paris), comptées pour la santé de /admin. */
const alertesDuJour = async () => {
  const [l] = await db()
    .select({ n: schema.counters.count })
    .from(schema.counters)
    .where(and(eq(schema.counters.key, CLES.alerteChat), eq(schema.counters.day, sql`(now() at time zone 'Europe/Paris')::date`)));
  return l?.n ?? 0;
};

/** La dernière réponse de BLUSH gardée pour cette conv : son id, son coût, verrouillée ou non. */
const derniereReponse = async (storyId: string) =>
  (
    await db()
      .select({ id: schema.chatMessages.id, cout: schema.chatMessages.cout, verrouillee: schema.chatMessages.verrouillee })
      .from(schema.chatMessages)
      .where(and(eq(schema.chatMessages.storyId, storyId), eq(schema.chatMessages.role, "blush")))
      .orderBy(schema.chatMessages.id)
  ).at(-1)!;

/** Tout ce que BLUSH a écrit dans cette réponse, texte par texte (ses bulles, la réponse à envoyer, sa question). */
const textesDe = (r: BlushAnswer) => [...r.bubbles.map((b) => b.text), ...(r.send ?? []), ...(r.why ? [r.why] : []), ...(r.ask ? [r.ask] : [])].filter((t) => t.length > 3);
/** Ce qui se paie dans une réponse qui a une réponse à envoyer : la réponse à envoyer, son pourquoi, la relance, le geste. */
const payantsDe = (r: BlushAnswer) => [...(r.send ?? []), ...(r.why ? [r.why] : []), ...(r.ask ? [r.ask] : []), ...(r.react ? [r.react] : [])].filter((t) => t.length > 3);
/** La forme de ces lignes, telle que le serveur la dit à la place de leur texte : leur longueur en caractères (un emoji en vaut un). */
const formes = (textes: readonly string[]) => textes.map((t) => Array.from(t).length);
/* Le modèle factice, avec une réponse à envoyer (des lignes et un pourquoi inventés) : sa lecture, elle, reste la sienne */
const avecUneReponseAEnvoyer = (req: Requete) => ({
  ...(fournisseurFactice(req) as object),
  a_envoyer: ["t’es libre samedi ?", "j’ai une idée 🍷"],
  pourquoi: "court, et c’est elle qui choisit",
});

describe("le coût d’une réponse", () => {
  it("des captures ou un export 3, une réponse en vocal 2, écrite 1, jamais cumulés", () => {
    expect([coutDe({ ajout: false, vocal: false }), coutDe({ ajout: false, vocal: true }), coutDe({ ajout: true, vocal: false }), coutDe({ ajout: true, vocal: true })]).toEqual([
      COUT_EN_BULLES.reponse,
      COUT_EN_BULLES.vocal,
      COUT_EN_BULLES.ajout,
      COUT_EN_BULLES.ajout,
    ]);
    expect(COUT_EN_BULLES).toEqual({ reponse: 1, vocal: 2, ajout: 3 });
  });
});

describe("POST /api/chat, avec des bulles", () => {
  it("le débit passe avant que BLUSH écrive, sous la référence de sa réponse ; la réponse dit ce qu’elle a coûté et ce qu’il reste", async () => {
    const { u, id } = await parleur("bulles-debit", 5);
    sonde = { userId: u.id, soldes: [] };
    const { evenements } = await fluxDe(await envoyer("on s’est vus hier"));
    await lancerApres();
    expect(await Promise.all(sonde.soldes)).toEqual([4]);
    const r = reponseDu(evenements);
    expect(r.bulles).toEqual({ depensees: 1, restantes: 4 });
    expect(r.bubbles.length).toBeGreaterThan(0);
    const gardee = await derniereReponse(id);
    expect(gardee).toMatchObject({ cout: 1, verrouillee: false });
    expect(await journalDe(u.id)).toEqual([{ raison: "reponse", delta: -1, ref: refDuMessage(gardee.id) }]);
    expect(await soldeDe(u.id)).toBe(4);
    /* D’un bloc (une page d’avant le flux), pareil */
    const bloc = (await (await envoyer("et maintenant ?", { flux: false })).json()) as BlushAnswer;
    expect(bloc.bulles).toEqual({ depensees: 1, restantes: 3 });
    await lancerApres();
  });

  it("une réponse qui échoue rend ses bulles : un refus du modèle, en flux comme d’un bloc", async () => {
    const { u, id } = await parleur("bulles-echec", 3);
    chat = () => refusFactice("cyber");
    for (const flux of [true, false]) {
      const r = await envoyer("…", { flux });
      expect([r.status, await r.json()]).toEqual([502, { erreur: "refus" }]);
      await lancerApres();
    }
    expect(appels).toBe(2);
    expect(await soldeDe(u.id)).toBe(3);
    /* Débitée avant l’appel, puis rendue : deux lignes par essai, sous la même référence ; rien n’est gardé */
    const journal = await journalDe(u.id);
    expect(journal.map((m) => [m.raison, m.delta])).toEqual([
      ["reponse", -1],
      ["rendu", 1],
      ["reponse", -1],
      ["rendu", 1],
    ]);
    expect(journal[0]!.ref).toBe(journal[1]!.ref);
    expect(await db().select().from(schema.chatMessages).where(eq(schema.chatMessages.storyId, id))).toEqual([]);
  });

  it("une erreur après les premières bulles : la réponse n’est pas partie, ses bulles reviennent", async () => {
    const { u } = await parleur("bulles-coupee", 2);
    /* Une sortie illisible à la fin (un niveau qui n’existe pas), après des bulles déjà montrées : l’erreur arrive dans le flux */
    chat = (req) => ({ ...(fournisseurFactice(req) as object), niveau_atteint: "inconnu" });
    const { evenements } = await fluxDe(await envoyer("elle veut quoi ?"));
    await lancerApres();
    expect(evenements.map((e) => Object.keys(e)[0])).toEqual(["bulle", "bulle", "erreur"]);
    expect(evenements.at(-1)).toEqual({ erreur: "panne" });
    expect(await soldeDe(u.id)).toBe(2);
  });

  it("une réponse qui sort en alerte se paie comme les autres (21 octobre 2026), et /admin la compte", async () => {
    const { u } = await parleur("bulles-alerte", 2);
    const avant = await alertesDuJour();
    chat = (req) => ({ ...(fournisseurFactice(req) as object), alerte: "detresse", mode: "sobre" });
    const r = reponseDu((await fluxDe(await envoyer("j’en peux plus"))).evenements);
    await lancerApres();
    expect(r.bulles).toEqual({ depensees: 1, restantes: 1 });
    expect(r.verrouillee).toBeUndefined();
    expect((await journalDe(u.id)).map((m) => [m.raison, m.delta])).toEqual([["reponse", -1]]);
    expect(await alertesDuJour()).toBe(avant + 1);
  });

  it("en vocal : 2 bulles ; avec une seule, la réponse s’écrit pour 1, sans voix", async () => {
    const { u, id } = await parleur("bulles-vocal", 3);
    await db().update(schema.stories).set({ chatVocal: true }).where(eq(schema.stories.id, id));
    const vocal = (await fluxDe(await envoyer("dis-moi tout"))).evenements;
    await lancerApres();
    expect(reponseDu(vocal).bulles).toEqual({ depensees: 2, restantes: 1 });
    expect(vocal.some((e) => "vocal" in e && e.vocal)).toBe(true);
    const ecrite = (await fluxDe(await envoyer("et encore ?"))).evenements;
    await lancerApres();
    expect(reponseDu(ecrite)).toMatchObject({ bulles: { depensees: 1, restantes: 0 } });
    expect(reponseDu(ecrite).vocalEnCours).toBeUndefined();
    expect(ecrite.some((e) => "vocal" in e)).toBe(false);
    expect(await soldeDe(u.id)).toBe(0);
  });

  it("en vocal, la voix ratée (son budget du jour épuisé) : la réponse reste écrite et ne coûte que l’écrit, le surplus rendu", async () => {
    const { u, id } = await parleur("bulles-voix-ratee", 3);
    await db().update(schema.stories).set({ chatVocal: true }).where(eq(schema.stories.id, id));
    await compter(cleDeLimiteDuCompte("voix", u.email), LIMITES.voixParCompte, LIMITES.voixParCompte.max);
    const evenements = (await fluxDe(await envoyer("dis-moi tout"))).evenements;
    await lancerApres();
    /* L’événement du vocal dit ce que la réponse a coûté en fin de compte (2 → 1) et ce qu’il reste : le compteur suit */
    expect(reponseDu(evenements).bulles).toEqual({ depensees: 2, restantes: 1 });
    expect(evenements.at(-1)).toEqual({ vocal: null, bulles: { depensees: 1, restantes: 2 } });
    expect(await soldeDe(u.id)).toBe(2);
    expect((await journalDe(u.id)).map((m) => [m.raison, m.delta])).toEqual([
      ["reponse", -COUT_EN_BULLES.vocal],
      ["rendu", 1],
    ]);
    expect(await derniereReponse(id)).toMatchObject({ cout: COUT_EN_BULLES.reponse, verrouillee: false });
  });

  it("« parle-moi en vocal » dans un chat écrit : la réponse part en vocal et coûte 2 comme tout vocal (la bulle de plus débitée quand la voix part) ; sans elle, la réponse reste écrite pour 1", async () => {
    const { u, id } = await parleur("bulles-voix-demandee", 3);
    chat = (req) => ({ ...(fournisseurFactice(req) as object), mode_vocal: "activer" });
    const evenements = (await fluxDe(await envoyer("parle-moi en vocal"))).evenements;
    await lancerApres();
    expect(evenements.some((e) => "vocal" in e && e.vocal)).toBe(true);
    expect(reponseDu(evenements).bulles).toEqual({ depensees: 2, restantes: 1 });
    expect((await journalDe(u.id)).map((m) => m.delta)).toEqual([-1, -1]);
    expect(await derniereReponse(id)).toMatchObject({ cout: 2 });
    /* Une seule bulle : pas de quoi payer la voix, la réponse reste écrite (1) */
    const seule = await parleur("bulles-voix-demandee-une", 1);
    const ecrite = (await fluxDe(await envoyer("parle-moi en vocal"))).evenements;
    await lancerApres();
    expect(ecrite.some((e) => "vocal" in e)).toBe(false);
    expect(reponseDu(ecrite).bulles).toEqual({ depensees: 1, restantes: 0 });
    expect(await soldeDe(seule.u.id)).toBe(0);
  });

  it("des captures : 3 bulles ; à 2, la réponse s’écrit verrouillée et se lira pour 3 ; la suivante répond « bulles » et rend l’ajout du jour", async () => {
    const { u, id } = await parleur("bulles-captures", 5);
    const payee = reponseDu((await fluxDe(await envoyerCaptures())).evenements);
    await lancerApres();
    expect(payee.bulles).toEqual({ depensees: COUT_EN_BULLES.ajout, restantes: 2 });
    const verrouillee = reponseDu((await fluxDe(await envoyerCaptures())).evenements);
    await lancerApres();
    expect(verrouillee.verrouillee).toEqual({ message: (await derniereReponse(id)).id, cout: COUT_EN_BULLES.ajout, cache: { quoi: "tout", lignes: expect.any(Array) } });
    expect(await soldeDe(u.id)).toBe(2);
    const ajouts = () => compteDe(cleDeLimiteDuCompte("ajout", u.email), LIMITES.ajoutParCompte);
    const avant = await ajouts();
    const refusee = await envoyerCaptures();
    expect([refusee.status, await refusee.json()]).toEqual([402, SANS_BULLES]);
    expect(await ajouts()).toBe(avant);
    expect((await lire(verrouillee.verrouillee!.message)).status).toBe(402);
    await donnerDesBulles(u, 1);
    expect(((await (await lire(verrouillee.verrouillee!.message)).json()) as BlushAnswer).bulles).toEqual({ depensees: COUT_EN_BULLES.ajout, restantes: 0 });
  });

  it("« Ta question » est une réponse du chat comme une autre : 1 bulle", async () => {
    const { u } = await parleur("bulles-question", 1);
    const cle = randomUUID();
    const r = reponseDu((await fluxDe(await envoyer("il pense à moi ?", { question: true, cle }))).evenements);
    await lancerApres();
    expect(r.bulles).toEqual({ depensees: 1, restantes: 0 });
    expect(await soldeDe(u.id)).toBe(0);
    /* Renvoyée après une coupure (l’écran la renvoie avec sa clé) : la réponse déjà écrite, sans second débit ni appel */
    const encore = await reponseDe(await envoyer("il pense à moi ?", { question: true, cle }));
    await lancerApres();
    expect(appels).toBe(1);
    expect(encore.echange).toBe(r.echange);
    expect(await soldeDe(u.id)).toBe(0);
  });

  it("« Réessayer » après une coupure (la même clé) : jamais débité deux fois ; la réponse déjà écrite revient telle quelle, sans nouvel appel au modèle", async () => {
    const { u, id } = await parleur("bulles-reessayer", 5);
    const cle = randomUUID();
    const premiere = await reponseDe(await envoyer("on s’est vus hier", { cle }));
    await lancerApres();
    const encore = await reponseDe(await envoyer("on s’est vus hier", { cle }));
    await lancerApres();
    expect(appels).toBe(1);
    expect(textesDe(encore)).toEqual(textesDe(premiere));
    expect(encore.echange).toBe(premiere.echange);
    expect(encore.bulles).toEqual({ depensees: 1, restantes: 4 });
    expect(await soldeDe(u.id)).toBe(4);
    expect((await journalDe(u.id)).map((m) => [m.raison, m.delta])).toEqual([["reponse", -1]]);
    expect((await db().select().from(schema.chatMessages).where(eq(schema.chatMessages.storyId, id))).length).toBe(2);
    /* Deux envois de la même clé en même temps (un double toucher) : un appel, un débit */
    const autre = randomUUID();
    const deux = await Promise.all([envoyer("et là ?", { cle: autre }), envoyer("et là ?", { cle: autre })]);
    const [a, b] = await Promise.all(deux.map(reponseDe));
    await lancerApres();
    expect(appels).toBe(2);
    expect(a!.echange).toBe(b!.echange);
    expect(await soldeDe(u.id)).toBe(3);
    /* Une autre clé, c’est un autre message : il se paie */
    await reponseDe(await envoyer("on s’est vus hier", { cle: randomUUID() }));
    await lancerApres();
    expect(await soldeDe(u.id)).toBe(2);
  });

  it("« Réessayer » après un échec (ses bulles rendues) : le nouvel essai se paie une fois, le solde net n’a perdu qu’une bulle", async () => {
    const { u } = await parleur("bulles-reessayer-echec", 3);
    const cle = randomUUID();
    chat = () => refusFactice("cyber");
    expect((await envoyer("…", { cle })).status).toBe(502);
    await lancerApres();
    chat = null;
    const r = await reponseDe(await envoyer("…", { cle }));
    await lancerApres();
    expect(r.bulles).toEqual({ depensees: 1, restantes: 2 });
    expect(await soldeDe(u.id)).toBe(2);
  });

  it("l’équipe n’est jamais débitée, et ne voit pas de compteur", async () => {
    const { u } = await parleur("equipe", 0);
    const r = reponseDu((await fluxDe(await envoyer("salut"))).evenements);
    await lancerApres();
    expect(r.verrouillee).toBeUndefined();
    expect(r.bulles).toBeUndefined();
    expect(r.bubbles.length).toBeGreaterThan(0);
    expect(await journalDe(u.id)).toEqual([]);
  });

  it("deux messages en même temps avec 1 bulle : un seul passe, l’autre s’écrit verrouillé", async () => {
    const { u, id } = await parleur("bulles-course", 1);
    const reponses = await Promise.all(["premier", "second"].map(async (t) => reponseDu((await fluxDe(await envoyer(t))).evenements)));
    await lancerApres();
    const [payee, verrouillee] = [reponses.find((r) => !r.verrouillee), reponses.find((r) => r.verrouillee)];
    expect(payee?.bulles).toEqual({ depensees: 1, restantes: 0 });
    expect(verrouillee).toEqual({
      kind: "bubbles",
      bubbles: [],
      verrouillee: { message: (await derniereVerrouillee(u.id)).id, cout: 1, cache: { quoi: "tout", lignes: expect.any(Array) } },
      modeVocal: false,
      echange: expect.any(Number),
      ...RECHARGE_A_ZERO,
    });
    expect(await soldeDe(u.id)).toBe(0);
    expect((await journalDe(u.id)).map((m) => m.raison)).toEqual(["reponse"]);
    /* L’historique les a toutes les deux, dans l’ordre, chacune avec son message */
    expect((await historique()).echanges.map((e) => e.mine).sort()).toEqual(["premier", "second"]);
    expect((await db().select().from(schema.chatMessages).where(eq(schema.chatMessages.storyId, id))).length).toBe(4);
  });
});

/** La réponse verrouillée qui attend pour ce compte (elle doit exister). */
async function derniereVerrouillee(userId: string) {
  const v = await reponseVerrouillee(userId);
  if (!v) throw new Error("aucune réponse verrouillée");
  return v;
}

describe("à 0 bulle : la réponse verrouillée", () => {
  it("sans réponse à envoyer, BLUSH écrit sa réponse, mais rien d’elle ne sort (seulement la forme de ses bulles) : ni le flux, ni l’historique, ni l’image partagée, ni la mémoire ; payée, elle se lit une fois", async () => {
    const { u, id } = await parleur("verrou", 0);
    const { brut, evenements } = await fluxDe(await envoyer("elle m’a écrit « on verra », je réponds quoi ?"));
    await lancerApres();
    expect(appels).toBe(1);
    /* Rien en route : pas une bulle, seulement la réponse masquée */
    expect(evenements.map((e) => Object.keys(e)[0])).toEqual(["reponse"]);
    const v = await derniereVerrouillee(u.id);
    const masquee = reponseDu(evenements);
    const cache = { quoi: "tout", lignes: expect.any(Array) };
    expect(masquee).toEqual({ kind: "bubbles", bubbles: [], verrouillee: { message: v.id, cout: 1, cache }, modeVocal: false, echange: expect.any(Number), ...RECHARGE_A_ZERO });
    expect(await derniereReponse(id)).toMatchObject({ id: v.id, cout: 1, verrouillee: true });
    expect(await soldeDe(u.id)).toBe(0);

    /* L’historique : l’échange est là, sa réponse masquée ; celui que la réponse a dit (l’accueil s’y reconnaît au retour) */
    const avant = await historique();
    const echange = avant.echanges.at(-1)!;
    expect(echange.answer).toEqual({ kind: "bubbles", bubbles: [], verrouillee: { message: v.id, cout: 1, cache } });
    expect(masquee.echange).toBe(echange.id);
    /* L’image partagée de cet échange : refusée */
    expect(await momentAPartager(await ligneEnBase(id), true, { type: "reponse", echange: echange.id })).toBe("introuvable");
    /* La mise à jour de la mémoire n’apprend que ce qu’il a dit */
    const majs = (await tachesDe(id)).filter((t) => t.kind === "memoire_maj");
    for (const t of majs) expect(coffre.lire("tasks.input", t.input!).reponse).toEqual([]);

    /* Pas de quoi la lire : rien ne change */
    const sansBulles = await lire(v.id);
    expect([sansBulles.status, await sansBulles.json()]).toEqual([402, SANS_BULLES]);
    expect(await soldeDe(u.id)).toBe(0);

    /* Rechargé : elle se lit, son coût débité une fois ; un second toucher la rend sans nouveau débit */
    await donnerDesBulles(u, 3);
    const lue = (await (await lire(v.id)).json()) as BlushAnswer;
    expect(lue.bulles).toEqual({ depensees: 1, restantes: 2 });
    expect(lue.echange).toBe(echange.id);
    expect(lue.verrouillee).toBeUndefined();
    const textes = textesDe(lue);
    expect(textes.length).toBeGreaterThan(0);
    const encore = (await (await lire(v.id)).json()) as BlushAnswer;
    expect(encore.bulles).toBeUndefined();
    expect(textesDe(encore)).toEqual(textes);
    expect(await soldeDe(u.id)).toBe(2);
    expect((await journalDe(u.id)).map((m) => [m.raison, m.delta, m.ref])).toEqual([["reponse", -1, refDuMessage(v.id)]]);

    /* Rien de ce qu’elle dit n’était sorti avant d’être payé : seulement la forme de ses bulles, dans l’ordre (la lecture, la relance) */
    const sorti = [brut, JSON.stringify(avant)].join("\n");
    for (const t of textes) expect(sorti.includes(t), "un texte de la réponse verrouillée est sorti").toBe(false);
    expect(masquee.verrouillee!.cache.lignes).toEqual(formes([...lue.bubbles.map((b) => b.text), lue.ask ?? ""].filter(Boolean)));
    /* Payée, l’historique la rend en entier */
    expect(textesDe((await historique()).echanges.at(-1)!.answer)).toEqual(textes);
    expect(await reponseVerrouillee(u.id)).toBeNull();
  });

  it("avec une réponse à envoyer : la lecture de BLUSH se lit en clair (ses bulles, les messages qu’elles citent) ; la réponse à envoyer, son pourquoi et la relance ne sortent jamais (ni le flux, ni l’historique, ni « Réessayer », ni l’image partagée), seulement la forme de ses lignes", async () => {
    const { u, id } = await parleur("verrou-lecture", 0);
    chat = avecUneReponseAEnvoyer;
    const cle = randomUUID();
    const { brut, evenements } = await fluxDe(await envoyer("elle me propose un verre, je dis quoi ?", { cle }));
    await lancerApres();
    /* Rien en route : la lecture arrive avec la réponse, d’un bloc */
    expect(evenements.map((e) => Object.keys(e)[0])).toEqual(["reponse"]);
    const v = await derniereVerrouillee(u.id);
    const masquee = reponseDu(evenements);
    /* « Réessayer » (la même clé) : la même réponse masquée, sans appel ni débit */
    const encore = (await (await envoyer("elle me propose un verre, je dis quoi ?", { cle })).json()) as BlushAnswer;
    expect(appels).toBe(1);
    const avant = await historique();
    const echange = avant.echanges.at(-1)!;
    expect(await momentAPartager(await ligneEnBase(id), true, { type: "reponse", echange: echange.id })).toBe("introuvable");

    /* Payée : la réponse entière, à quoi comparer ce qui était sorti avant */
    await donnerDesBulles(u, 1);
    const lue = (await (await lire(v.id)).json()) as BlushAnswer;
    expect(lue.send?.length).toBeGreaterThan(0);
    expect(lue.why).toBeTruthy();
    const cache = { quoi: "reponse", lignes: formes(lue.send!) };
    /* La lecture, en clair, telle que la réponse payée la montre (ses bulles, avec les messages qu’elles citent) ; et rien d’autre */
    expect(lue.bubbles.length).toBeGreaterThan(0);
    expect(lue.bubbles.some((b) => b.messages?.length)).toBe(true);
    expect(masquee).toEqual({ kind: "bubbles", bubbles: lue.bubbles, verrouillee: { message: v.id, cout: 1, cache }, modeVocal: false, echange: echange.id, ...RECHARGE_A_ZERO });
    expect(echange.answer).toEqual({ kind: "bubbles", bubbles: lue.bubbles, verrouillee: { message: v.id, cout: 1, cache } });
    expect(encore).toEqual({ kind: "bubbles", bubbles: lue.bubbles, verrouillee: { message: v.id, cout: 1, cache }, echange: echange.id });
    for (const b of lue.bubbles) expect(brut.includes(JSON.stringify(b.text)), "la lecture se lit dans le flux").toBe(true);
    /* Ce qui se paie n’était sorti nulle part : ni le flux, ni l’historique, ni « Réessayer » */
    const payants = payantsDe(lue);
    expect(payants.length).toBeGreaterThanOrEqual(3);
    const sorti = [brut, JSON.stringify(avant), JSON.stringify(encore)].join("\n");
    for (const t of payants) expect(sorti.includes(t), "un texte payant de la réponse verrouillée est sorti").toBe(false);
    /* La mise à jour de la mémoire n’apprend que ce qu’il a dit */
    for (const t of (await tachesDe(id)).filter((t) => t.kind === "memoire_maj")) expect(coffre.lire("tasks.input", t.input!).reponse).toEqual([]);
  });

  it("rechargé (un pack payé après elle) : elle se lit sans débit, elle a coûté 0 et le solde reste l’ancien plus les bulles achetées ; une seule fois", async () => {
    const { u } = await parleur("verrou-recharge", 0);
    await fluxDe(await envoyer("je dis quoi ?"));
    await lancerApres();
    const v = await derniereVerrouillee(u.id);
    const achat = await commander(u, "pack30", { fournisseur: "factice" });
    if (typeof achat === "string") throw new Error(`commande refusée : ${achat}`);
    expect((await livrer(achat.id)).effet).toBe("livre");
    expect(await soldeDe(u.id)).toBe(CATALOGUE.pack30.bulles);

    const lue = await lire(v.id);
    expect(lue.status).toBe(200);
    const r = (await lue.json()) as BlushAnswer;
    expect(r.verrouillee).toBeUndefined();
    expect(r.bubbles.length).toBeGreaterThan(0);
    expect(r.bulles).toEqual({ depensees: 0, restantes: CATALOGUE.pack30.bulles });
    expect(await soldeDe(u.id)).toBe(CATALOGUE.pack30.bulles);
    /* Le journal : l’achat seul, aucun débit ; la réponse n’attend plus, offerte */
    expect((await journalDe(u.id)).map((m) => [m.raison, m.delta])).toEqual([["achat", CATALOGUE.pack30.bulles]]);
    const [ligne] = await db()
      .select({ cout: schema.chatMessages.cout, verrouillee: schema.chatMessages.verrouillee })
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.id, v.id));
    expect(ligne).toEqual({ cout: null, verrouillee: false });
    expect(await reponseVerrouillee(u.id)).toBeNull();
    /* Un second toucher : rendue telle quelle, sans rien de plus */
    const encore = (await (await lire(v.id)).json()) as BlushAnswer;
    expect(encore.bulles).toBeUndefined();
    expect(textesDe(encore)).toEqual(textesDe(r));
    expect(await soldeDe(u.id)).toBe(CATALOGUE.pack30.bulles);
  });

  it("une recharge payée avant la réponse verrouillée ne la paie pas : des bulles venues d’ailleurs, son coût est débité", async () => {
    const { u } = await parleur("verrou-recharge-avant", 0);
    const achat = await commander(u, "pack30", { fournisseur: "factice" });
    if (typeof achat === "string") throw new Error(`commande refusée : ${achat}`);
    await livrer(achat.id);
    /* Les bulles de ce pack, parties ailleurs : le solde revient à 0 */
    await crediter(u.id, -CATALOGUE.pack30.bulles, "remboursement", `test:depense:${u.id}`);
    await fluxDe(await envoyer("je dis quoi ?"));
    await lancerApres();
    const v = await derniereVerrouillee(u.id);
    expect((await lire(v.id)).status).toBe(402);
    await donnerDesBulles(u, 1);
    const r = (await (await lire(v.id)).json()) as BlushAnswer;
    expect(r.bulles).toEqual({ depensees: 1, restantes: 0 });
    expect((await journalDe(u.id)).at(-1)).toEqual({ raison: "reponse", delta: -1, ref: refDuMessage(v.id) });
  });

  it("une seule en attente par compte : la suivante répond « bulles », sans appel au modèle, le message du jour rendu", async () => {
    const { u } = await parleur("verrou-une", 0);
    await fluxDe(await envoyer("premier"));
    await lancerApres();
    expect(appels).toBe(1);
    const cle = cleDeLimiteDuCompte("chat", u.email);
    const comptes = () => compteDe(cle, LIMITES.chatParCompte);
    const avant = await comptes();
    for (const flux of [true, false]) {
      const r = await envoyer("second", { flux });
      expect([r.status, await r.json()]).toEqual([402, SANS_BULLES]);
    }
    expect(appels).toBe(1);
    expect(await comptes()).toBe(avant);
  });

  it("deux messages en même temps à 0 bulle : un seul garde sa réponse verrouillée, l’autre répond « bulles »", async () => {
    const { u, id } = await parleur("verrou-course", 0);
    const reponses = await Promise.all(["un", "deux"].map((t) => envoyer(t)));
    const statuts = reponses.map((r) => r.status).sort();
    expect(statuts).toEqual([200, 402]);
    await Promise.all(reponses.map((r) => r.text()));
    await lancerApres();
    /* L’autre n’a pas appelé le modèle : la place de la réponse verrouillée est prise avant lui */
    expect(appels).toBe(1);
    expect(await reponseVerrouillee(u.id)).not.toBeNull();
    const gardees = await db().select().from(schema.chatMessages).where(eq(schema.chatMessages.storyId, id));
    expect(gardees.filter((m) => m.verrouillee).length).toBe(1);
  });

  it("un solde négatif (après un remboursement) bloque comme 0 ; une alerte aussi, mais les numéros d’urgence se lisent en clair", async () => {
    const { u } = await parleur("verrou-negatif", 0);
    await crediter(u.id, -4, "remboursement", `remboursement:test:${u.id}`);
    expect(await soldeDe(u.id)).toBe(-4);
    chat = (req) => ({ ...(fournisseurFactice(req) as object), alerte: "detresse", mode: "sobre" });
    const alerte = reponseDu((await fluxDe(await envoyer("j’en peux plus"))).evenements);
    await lancerApres();
    expect(alerte.verrouillee).toBeDefined();
    expect(alerte.bubbles).toEqual([{ text: URGENCES }]);
    expect(await reponseVerrouillee(u.id)).not.toBeNull();
    expect(await soldeDe(u.id)).toBe(-4);
    /* Rouvert plus tard : l’historique la montre de même, les numéros en clair, le reste masqué */
    const gardee = (await historique()).echanges.at(-1)!.answer;
    expect(gardee.verrouillee).toBeDefined();
    expect(gardee.bubbles).toEqual([{ text: URGENCES }]);
    /* Le message suivant n’appelle pas le modèle : « bulles », avec les numéros d’aide */
    chat = null;
    const r = await envoyer("et là ?");
    expect(r.status).toBe(402);
    expect(await r.json()).toEqual(SANS_BULLES);
    /* Un don qui ne remonte pas au-dessus du coût : toujours pas de quoi la lire */
    await donnerDesBulles(u, 4);
    expect((await lire(alerte.verrouillee!.message)).status).toBe(402);
  });

  it("rechargé sans la lire, la réponse suivante ne la reçoit pas dans son fil : BLUSH ne peut pas la redire pour moins cher", async () => {
    const { u } = await parleur("verrou-fil", 0);
    await fluxDe(await envoyer("des captures de notre conv, je réponds quoi ?"));
    await lancerApres();
    const v = await derniereVerrouillee(u.id);
    const [gardee] = await db().select({ data: schema.chatMessages.data }).from(schema.chatMessages).where(eq(schema.chatMessages.id, v.id));
    const textes = coffre
      .lire("chat_messages.data:blush", gardee!.data)
      .resume.split(" / ")
      .filter((t) => t.length > 3);
    expect(textes.length).toBeGreaterThan(0);
    await donnerDesBulles(u, 5);
    let envoye = "";
    chat = (req) => ((envoye = JSON.stringify(req.blocs)), fournisseurFactice(req));
    const suivante = reponseDu((await fluxDe(await envoyer("tu disais quoi juste avant ?"))).evenements);
    await lancerApres();
    expect(suivante.verrouillee).toBeUndefined();
    /* Son message est dans le fil (c’est le sien), la réponse verrouillée non */
    expect(envoye).toContain("des captures de notre conv");
    for (const t of textes) expect(envoye.includes(JSON.stringify(t).slice(1, -1)), "la réponse verrouillée est partie au modèle").toBe(false);
    expect(await reponseVerrouillee(u.id)).toEqual(v);
  });

  it("la réponse d’un autre compte ne se lit pas", async () => {
    const autre = await parleur("verrou-autre", 0);
    await fluxDe(await envoyer("à moi"));
    await lancerApres();
    const v = await derniereVerrouillee(autre.u.id);
    await parleur("verrou-curieux", 10);
    const r = await lire(v.id);
    expect([r.status, await r.json()]).toEqual([404, { erreur: "introuvable" }]);
    expect(await reponseVerrouillee(autre.u.id)).toEqual(v);
  });
});

describe("le navigateur (api.ts)", () => {
  /* Le navigateur parle aux vraies routes (le chat, la lecture d’une réponse verrouillée) */
  beforeEach(() =>
    vi.stubGlobal("fetch", (url: string, init: RequestInit) =>
      (url === "/api/chat/debloquer" ? debloquer : POST)(
        new Request(`http://localhost${url}`, {
          ...init,
          headers: { origin: "http://localhost", "x-forwarded-host": "localhost", ...Object.fromEntries(new Headers(init.headers)) },
        }),
      ),
    ),
  );
  afterEach(() => vi.unstubAllGlobals());

  it("« Ta question » avec des bulles : sa réponse dit ce qu’elle a coûté et ce qu’il reste (le reçu de l’écran, et son compteur)", async () => {
    await parleur("question-recu", 10);
    const q = await askQuestion("il pense à moi ?");
    await lancerApres();
    expect(q.verrouillee).toBeUndefined();
    expect(q.title).not.toBe("");
    expect(q.bulles).toEqual({ depensees: 1, restantes: 9 });
  });

  it("« Ta question » verrouillée : prête, sans rien d’elle ; la suivante, BLUSH dit qu’il n’y a plus de bulles ; rechargé, elle se lit", async () => {
    const { u } = await parleur("verrou-navigateur", 0);
    const q = await askQuestion("il pense à moi ?");
    await lancerApres();
    expect(q).toMatchObject({ question: "il pense à moi ?", title: "Ta réponse est prête", verrouillee: true });
    expect(q.message).toBeUndefined();
    const chat = await sendToBlush({ text: "et maintenant ?" });
    /* Les numéros d’aide de l’appli, toujours : un message de détresse à 0 bulle n’a pas de réponse du modèle, il a l’aide */
    expect(chat.bubbles.map((b) => b.text)).toEqual(["plus de bulles pour l’instant 🫧", "recharge, et je te réponds", URGENCES]);
    await expect(askQuestion("et là ?")).rejects.toMatchObject({ code: "bulles", status: 402 });
    const v = await derniereVerrouillee(u.id);
    await expect(lireLaReponse(v.id)).rejects.toMatchObject({ code: "bulles" });
    await donnerDesBulles(u, 1);
    const lue = await lireLaReponse(v.id);
    expect(lue.bulles).toEqual({ depensees: 1, restantes: 0 });
    expect(lue.bubbles.length).toBeGreaterThan(0);
  });
});
