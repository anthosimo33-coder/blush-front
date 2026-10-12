import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * La couche de service du navigateur (src/services/api.ts), sans serveur : fetch est remplacé, et chaque test lit ce qui
 * serait parti (la méthode, l’adresse, les en-têtes, le corps) et ce que l’écran recevrait. Les captures ne sont pas
 * réduites (il faudrait une toile) : le préparateur les rend telles quelles.
 */
vi.mock("@/services/preparer-captures", () => ({ preparerCaptures: async (fichiers: File[]) => fichiers.map((f) => new Blob([f], { type: "image/jpeg" })) }));

import { addToFiche, getAccount, getAchats, getChatHistory, modeVocalChat, rejoindreAttente, retirerDeLaListe, sendToBlush, startAnalysis, updateFiche } from "@/services/api";
import { ENTETE_CONV, poserConvDeLaPage } from "@/services/session";
import { ErreurApi } from "@/types/erreurs-api";
import type { Fiche, FicheFact } from "@/types";

/** Ce qu’un appel a envoyé : l’adresse et les options de fetch. */
type Envoi = { url: string; init: RequestInit & { headers: Headers } };
let envois: Envoi[] = [];
/** Ce que le faux serveur répond à chaque appel (une réponse, ou une coupure du réseau). */
let repondre: (url: string) => Response | Promise<Response> = () => Response.json({});

beforeEach(() => {
  envois = [];
  repondre = () => Response.json({});
  vi.stubGlobal("fetch", async (url: string, init: RequestInit & { headers: Headers }) => {
    envois.push({ url, init });
    return repondre(url);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  poserConvDeLaPage(null);
});

/* Une fiche inventée (le dépôt est public) */
const FICHE: Fiche = { person: { id: "p0", name: "Sam", initial: "S" }, portrait: "", updatedLabel: "", facts: [], summary: "", summaryShort: "" };
const qui = { guess: "vus", goal: "comprendre" } as const;

describe("une requête du contrat (requete, appel)", () => {
  it("prend la méthode et l’adresse dans la clé de la route, et ajoute sa recherche", async () => {
    repondre = () => Response.json({ echanges: [], plus: false });
    await getChatHistory(12);
    await getChatHistory();
    expect(envois.map((e) => [e.init.method, e.url])).toEqual([
      ["GET", "/api/chat?avant=12"],
      ["GET", "/api/chat"],
    ]);
    expect(envois[0]!.init).toMatchObject({ credentials: "same-origin", cache: "no-store" });
    expect(envois[0]!.init.body).toBeUndefined();
  });

  it("envoie un corps JSON en JSON, avec son content-type", async () => {
    repondre = () => Response.json(FICHE);
    const facts: FicheFact[] = [{ id: "f1", section: "aime", text: "Le ski de fond.", sourceLabel: "ajouté par toi", sources: [] }];
    expect(await updateFiche(facts)).toEqual(FICHE);
    const { url, init } = envois[0]!;
    expect({ url, method: init.method, type: init.headers.get("content-type"), corps: JSON.parse(String(init.body)) }).toEqual({
      url: "/api/fiche",
      method: "PUT",
      type: "application/json",
      corps: { facts },
    });
  });

  it("laisse un formulaire tel quel : pas de content-type posé à la main (le navigateur met le sien, avec sa frontière)", async () => {
    repondre = () => Response.json({ fiche: FICHE, added: [] });
    await addToFiche([new File(["x"], "capture.png", { type: "image/png" })]);
    const { url, init } = envois[0]!;
    expect({ url, method: init.method, formulaire: init.body instanceof FormData, type: init.headers.get("content-type") }).toEqual({
      url: "/api/fiche",
      method: "POST",
      formulaire: true,
      type: null,
    });
    expect((init.body as FormData).getAll("captures")).toHaveLength(1);
  });

  it("désigne la conv de la page dans son en-tête, quand la page en montre une", async () => {
    repondre = () => Response.json({ email: null, bulles: 0, client: false, equipe: false, storyDeleted: false });
    await getAccount();
    poserConvDeLaPage("conv-a");
    await getAccount();
    expect(envois.map((e) => e.init.headers.get(ENTETE_CONV))).toEqual([null, "conv-a"]);
  });

  it("une erreur du serveur : une ErreurApi avec son code et son statut", async () => {
    repondre = () => Response.json({ erreur: "connexion" }, { status: 401 });
    const e = await getAccount().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurApi);
    expect(e).toMatchObject({ code: "connexion", status: 401 });
  });

  it("une réponse qui n’est pas du JSON (une page d’erreur du serveur) : ErreurApi « erreur », avec son statut", async () => {
    repondre = () => new Response("<html>Bad Gateway</html>", { status: 502, headers: { "content-type": "text/html" } });
    const e = await getAccount().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurApi);
    expect(e).toMatchObject({ code: "erreur", status: 502 });
  });
});

describe("« Qui es-tu ? » (startAnalysis)", () => {
  it.each(["p2", "Léa", ""])("toi = %j, ni p0 ni p1 : « qui » (422), sans appeler le serveur", async (me) => {
    const e = await startAnalysis({ me, ...qui }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErreurApi);
    expect(e).toMatchObject({ code: "qui", status: 422 });
    expect(envois).toEqual([]);
  });

  it("p0 ou p1 : la lecture part, le pronom « il » par défaut, sans prénom vide", async () => {
    repondre = () => Response.json({ ok: true });
    await startAnalysis({ me: "p1", ...qui, pronom: null, prenom: null });
    await startAnalysis({ me: "p0", ...qui, pronom: "elle", prenom: "Léa" });
    expect(envois.map((e) => [e.init.method, e.url, JSON.parse(String(e.init.body))])).toEqual([
      ["POST", "/api/analyse", { me: "p1", ...qui, pronom: "il" }],
      ["POST", "/api/analyse", { me: "p0", ...qui, pronom: "elle", prenom: "Léa" }],
    ]);
  });
});

describe("les bulles (sendToBlush, getAchats)", () => {
  it("plus de bulles (402 « bulles ») : BLUSH le dit, et la réponse le marque, pour que l’accueil ouvre la recharge", async () => {
    repondre = () => Response.json({ erreur: "bulles" }, { status: 402 });
    const r = await sendToBlush({ text: "allô ?" });
    expect(r.plusDeBulles).toBe(true);
    expect(r.bubbles.map((b) => b.text)).toEqual(["plus de bulles pour l’instant 🫧", "recharge, et je te réponds"]);
  });

  it("une autre erreur : BLUSH la dit, sans recharge", async () => {
    repondre = () => Response.json({ erreur: "trop" }, { status: 429 });
    expect((await sendToBlush({ text: "allô ?" })).plusDeBulles).toBeUndefined();
  });

  it("« Tes achats » : la liste que rend GET /api/achats", async () => {
    const achat = { id: "a1", offre: "pack80", centimes: 990, bulles: 120, statut: "paye", le: "2026-10-12T10:00:00.000Z" } as const;
    repondre = () => Response.json({ achats: [achat] });
    expect(await getAchats()).toEqual([achat]);
    expect(envois[0]!.url).toBe("/api/achats");
  });
});

describe("le chat en vocal (modeVocalChat)", () => {
  it("part en keepalive (« Repasser à l’écrit » part même si la page se ferme), avec le mode voulu", async () => {
    repondre = () => Response.json({ modeVocal: false });
    await modeVocalChat(false);
    const { url, init } = envois[0]!;
    expect({ url, method: init.method, keepalive: init.keepalive, corps: JSON.parse(String(init.body)) }).toEqual({
      url: "/api/chat/vocal",
      method: "POST",
      keepalive: true,
      corps: { actif: false },
    });
  });

  it.each([
    ["le serveur a gardé le vocal", true, true, () => Response.json({ modeVocal: true })],
    ["le serveur a gardé l’écrit", false, true, () => Response.json({ modeVocal: false })],
    ["le serveur répond un autre mode", true, false, () => Response.json({ modeVocal: false })],
    ["une erreur du serveur (500)", true, false, () => Response.json({ erreur: "erreur" }, { status: 500 })],
    ["une erreur de la requête (422)", false, false, () => Response.json({ erreur: "invalide" }, { status: 422 })],
    ["une réponse qui n’est pas du JSON", true, false, () => new Response("<html></html>", { status: 502 })],
    ["le réseau qui coupe", true, false, () => Promise.reject(new TypeError("Failed to fetch"))],
  ] as const)("%s (vocal voulu : %s) : gardé = %s, sans jamais échouer", async (_, actif, garde, reponse) => {
    repondre = reponse;
    await expect(modeVocalChat(actif)).resolves.toBe(garde);
  });
});

describe("la liste d’attente (rejoindreAttente, retirerDeLaListe)", () => {
  it("s’inscrire : l’email part en JSON par la route du contrat ; un refus est une erreur", async () => {
    repondre = () => Response.json({ ok: true });
    await rejoindreAttente("sam@exemple.fr");
    const { url, init } = envois[0]!;
    expect({ url, method: init.method, corps: JSON.parse(String(init.body)) }).toEqual({ url: "/api/attente", method: "POST", corps: { email: "sam@exemple.fr" } });
    repondre = () => Response.json({ erreur: "email" }, { status: 422 });
    await expect(rejoindreAttente("sam")).rejects.toBeInstanceOf(ErreurApi);
    repondre = () => Promise.reject(new TypeError("Failed to fetch"));
    await expect(rejoindreAttente("sam@exemple.fr")).rejects.toThrow();
  });

  it.each([
    ["retiré", "retire", () => Response.json({ ok: true })],
    ["un lien qui ne mène plus à rien (404)", "lien", () => Response.json({ erreur: "lien" }, { status: 404 })],
    ["une erreur du serveur (500)", "echec", () => Response.json({ erreur: "erreur" }, { status: 500 })],
    ["une requête refusée (403)", "echec", () => Response.json({ erreur: "origine" }, { status: 403 })],
    ["le réseau qui coupe", "echec", () => Promise.reject(new TypeError("Failed to fetch"))],
  ] as const)("se retirer, %s : %s, sans jamais échouer", async (_, issue, reponse) => {
    repondre = reponse;
    await expect(retirerDeLaListe({ id: "i1", cle: "c1" })).resolves.toBe(issue);
    expect(envois.map((e) => [e.init.method, e.url, JSON.parse(String(e.init.body))])).toEqual([["POST", "/api/attente/retrait", { id: "i1", cle: "c1" }]]);
  });
});
