import { and, eq, ne } from "drizzle-orm";
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
import { COUT_EN_BULLES } from "@/contenu/offres";
import { ouvrirSession, type Utilisateur } from "@/server/auth";
import { coutDe, crediter, refDuMessage, reponseVerrouillee, soldeDe } from "@/server/bulles";
import * as coffre from "@/server/coffre";
import { db, schema } from "@/server/db";
import { compteDe, LIMITES } from "@/server/limites";
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
const envoyer = (texte: string, { flux = true, question = false }: { flux?: boolean; question?: boolean } = {}) =>
  POST(
    requete("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", ...(flux ? { accept: "application/x-ndjson" } : {}) },
      body: JSON.stringify({ texte, ...(question ? { question: true } : {}) }),
    }),
  );
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

  it("une réponse qui sort en alerte de danger est offerte : ses bulles rendues, la réponse le dit", async () => {
    const { u } = await parleur("bulles-alerte", 2);
    chat = (req) => ({ ...(fournisseurFactice(req) as object), alerte: "detresse", mode: "sobre" });
    const r = reponseDu((await fluxDe(await envoyer("j’en peux plus"))).evenements);
    await lancerApres();
    expect(r.bulles).toEqual({ depensees: 0, restantes: 2 });
    expect(r.verrouillee).toBeUndefined();
    expect((await journalDe(u.id)).map((m) => [m.raison, m.delta])).toEqual([
      ["reponse", -1],
      ["rendu", 1],
    ]);
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

  it("« Ta question » est une réponse du chat comme une autre : 1 bulle", async () => {
    const { u } = await parleur("bulles-question", 1);
    const r = reponseDu((await fluxDe(await envoyer("il pense à moi ?", { question: true }))).evenements);
    await lancerApres();
    expect(r.bulles).toEqual({ depensees: 1, restantes: 0 });
    expect(await soldeDe(u.id)).toBe(0);
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
    expect(verrouillee).toEqual({ kind: "bubbles", bubbles: [], verrouillee: { message: (await derniereVerrouillee(u.id)).id, cout: 1 }, modeVocal: false });
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
  it("BLUSH écrit sa réponse, mais rien d’elle ne sort : ni le flux, ni l’historique, ni l’image partagée, ni la mémoire ; payée, elle se lit une fois", async () => {
    const { u, id } = await parleur("verrou", 0);
    const { brut, evenements } = await fluxDe(await envoyer("elle m’a écrit « on verra », je réponds quoi ?"));
    await lancerApres();
    expect(appels).toBe(1);
    /* Rien en route : pas une bulle, seulement la réponse masquée */
    expect(evenements.map((e) => Object.keys(e)[0])).toEqual(["reponse"]);
    const v = await derniereVerrouillee(u.id);
    expect(reponseDu(evenements)).toEqual({ kind: "bubbles", bubbles: [], verrouillee: { message: v.id, cout: 1 }, modeVocal: false });
    expect(await derniereReponse(id)).toMatchObject({ id: v.id, cout: 1, verrouillee: true });
    expect(await soldeDe(u.id)).toBe(0);

    /* L’historique : l’échange est là, sa réponse masquée */
    const avant = await historique();
    const echange = avant.echanges.at(-1)!;
    expect(echange.answer).toEqual({ kind: "bubbles", bubbles: [], verrouillee: { message: v.id, cout: 1 } });
    /* L’image partagée de cet échange : refusée */
    expect(await momentAPartager(await ligneEnBase(id), true, { type: "reponse", echange: echange.id })).toBe("introuvable");
    /* La mise à jour de la mémoire n’apprend que ce qu’il a dit */
    const majs = (await tachesDe(id)).filter((t) => t.kind === "memoire_maj");
    for (const t of majs) expect(coffre.lire("tasks.input", t.input!).reponse).toEqual([]);

    /* Pas de quoi la lire : rien ne change */
    const sansBulles = await lire(v.id);
    expect([sansBulles.status, await sansBulles.json()]).toEqual([402, { erreur: "bulles" }]);
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

    /* Rien de ce qu’elle dit n’était sorti avant d’être payé */
    const sorti = [brut, JSON.stringify(avant)].join("\n");
    for (const t of textes) expect(sorti.includes(t), "un texte de la réponse verrouillée est sorti").toBe(false);
    /* Payée, l’historique la rend en entier */
    expect(textesDe((await historique()).echanges.at(-1)!.answer)).toEqual(textes);
    expect(await reponseVerrouillee(u.id)).toBeNull();
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
      expect([r.status, await r.json()]).toEqual([402, { erreur: "bulles" }]);
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
    expect(await reponseVerrouillee(u.id)).not.toBeNull();
    const gardees = await db().select().from(schema.chatMessages).where(eq(schema.chatMessages.storyId, id));
    expect(gardees.filter((m) => m.verrouillee).length).toBe(1);
  });

  it("un solde négatif (après un remboursement) bloque comme 0 ; une alerte de danger, elle, n’est jamais verrouillée", async () => {
    const { u } = await parleur("verrou-negatif", 0);
    await crediter(u.id, -4, "remboursement", `remboursement:test:${u.id}`);
    expect(await soldeDe(u.id)).toBe(-4);
    chat = (req) => ({ ...(fournisseurFactice(req) as object), alerte: "detresse", mode: "sobre" });
    const alerte = reponseDu((await fluxDe(await envoyer("j’en peux plus"))).evenements);
    await lancerApres();
    expect(alerte.verrouillee).toBeUndefined();
    expect(alerte.bulles).toEqual({ depensees: 0, restantes: -4 });
    expect(alerte.bubbles.length).toBeGreaterThan(0);
    expect(await reponseVerrouillee(u.id)).toBeNull();
    chat = null;
    const r = reponseDu((await fluxDe(await envoyer("et là ?"))).evenements);
    await lancerApres();
    expect(r.verrouillee).toBeDefined();
    expect(await soldeDe(u.id)).toBe(-4);
    /* Un don qui ne remonte pas au-dessus du coût : toujours pas de quoi la lire */
    await donnerDesBulles(u, 4);
    expect((await lire(r.verrouillee!.message)).status).toBe(402);
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

describe("le navigateur (api.ts), à 0 bulle", () => {
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

  it("« Ta question » verrouillée : prête, sans rien d’elle ; la suivante, BLUSH dit qu’il n’y a plus de bulles ; rechargé, elle se lit", async () => {
    const { u } = await parleur("verrou-navigateur", 0);
    const q = await askQuestion("il pense à moi ?");
    await lancerApres();
    expect(q).toMatchObject({ question: "il pense à moi ?", title: "Ta réponse est prête", verrouillee: true });
    expect(q.message).toBeUndefined();
    const chat = await sendToBlush({ text: "et maintenant ?" });
    expect(chat.bubbles.map((b) => b.text)).toEqual(["plus de bulles pour l’instant 🫧", "recharge, et je te réponds"]);
    await expect(askQuestion("et là ?")).rejects.toMatchObject({ code: "bulles", status: 402 });
    const v = await derniereVerrouillee(u.id);
    await expect(lireLaReponse(v.id)).rejects.toMatchObject({ code: "bulles" });
    await donnerDesBulles(u, 1);
    const lue = await lireLaReponse(v.id);
    expect(lue.bulles).toEqual({ depensees: 1, restantes: 0 });
    expect(lue.bubbles.length).toBeGreaterThan(0);
  });
});
