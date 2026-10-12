import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/*
 * lireCorps (src/server/http.ts) : le corps JSON d’une route, vérifié par son schéma (src/types/api.ts). Puis chaque route
 * qui lit un corps JSON : un corps mal formé répond le code qu’elle répondait déjà (aucun statut ne change), et un corps
 * qui n’est même pas un objet (null) aussi, au lieu de la faire tomber. Sans base : le compte, les limites, la session
 * et l’écriture en base sont simulés, ce qui se passe une fois le corps lu n’est pas l’objet de ce fichier.
 */

const etat = vi.hoisted(() => ({
  /** Les sessions fermées (fermerSession), et ce qui a été écrit en base (db().update().set()) */
  fermees: [] as { secret: string; partout: boolean }[],
  ecrit: [] as unknown[],
}));

vi.mock("@/server/donnees", async (original) => ({
  ...(await original<typeof import("@/server/donnees")>()),
  /* Un compte connecté (le chat lui est ouvert), et sa conv, où « Qui es-tu ? » reste à remplir */
  contexteRequete: async () => ({ utilisateur: { id: "compte", email: "toi@blush.test", bulles: 10 }, story: { id: "conv", chatVocal: false } }),
}));
/* Un client (sa fiche s’ouvre : S-26, src/server/droits.ts) */
vi.mock("@/server/droits", async (original) => ({ ...(await original<typeof import("@/server/droits")>()), estClient: async () => true }));
vi.mock("@/server/histoires", async (original) => ({ ...(await original<typeof import("@/server/histoires")>()), metaDe: () => ({}), quiRempli: () => false }));
vi.mock("@/server/limites", async (original) => ({ ...(await original<typeof import("@/server/limites")>()), sousLaLimite: async () => true, limiteAtteinte: async () => false }));
vi.mock("@/server/captures", async (original) => ({ ...(await original<typeof import("@/server/captures")>()), lecturePermise: async () => "ok" }));
vi.mock("@/server/cookies", async (original) => ({
  ...(await original<typeof import("@/server/cookies")>()),
  lireSession: async () => "secret",
  oublierCetAppareil: async () => {},
}));
vi.mock("@/server/auth", async (original) => ({
  ...(await original<typeof import("@/server/auth")>()),
  fermerSession: async (secret: string, { partout = false } = {}) => void etat.fermees.push({ secret, partout }),
}));
vi.mock("@/server/db", async (original) => ({
  ...(await original<typeof import("@/server/db")>()),
  db: () => ({ update: () => ({ set: (valeurs: unknown) => ({ where: async () => void etat.ecrit.push(valeurs) }) }) }),
}));

import { lireCorps } from "@/server/http";
import { POST as postAnalyse } from "@/app/api/analyse/route";
import { POST as postAttente } from "@/app/api/attente/route";
import { POST as postRetrait } from "@/app/api/attente/retrait/route";
import { POST as postCode } from "@/app/api/auth/code/route";
import { POST as postDeconnexion } from "@/app/api/auth/deconnexion/route";
import { POST as postVerifier } from "@/app/api/auth/verifier/route";
import { POST as postVideo } from "@/app/api/captures/video/route";
import { POST as postChat } from "@/app/api/chat/route";
import { POST as postVocal } from "@/app/api/chat/vocal/route";
import { PUT as putFiche } from "@/app/api/fiche/route";
import { POST as postImage } from "@/app/api/partage/image/route";
import { POST as postPaiement } from "@/app/api/paiement/route";
import { POST as postFauxWhop } from "@/app/api/paiement/factice/route";
import { POST as postOffre } from "@/app/api/paiement/offre/route";
import { POST as postEcoute } from "@/app/api/vocal/ecoute/route";

/** Une requête du navigateur (même origine), avec ce corps tel quel. */
const requete = (methode: string, corps?: string) =>
  new Request("http://localhost/api", {
    method: methode,
    headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": "10.0.0.1", "content-type": "application/json" },
    ...(corps === undefined ? {} : { body: corps }),
  });

beforeEach(() => {
  etat.fermees.length = 0;
  etat.ecrit.length = 0;
});

describe("lireCorps", () => {
  const Schema = z.object({ prenom: z.string().trim().min(1), age: z.number().optional() });

  it("rend le corps tel que le schéma le sort (ses transformations faites)", async () => {
    expect(await lireCorps(requete("POST", JSON.stringify({ prenom: "  Léa " })), Schema)).toEqual({ prenom: "Léa" });
  });

  it.each([
    ["pas du JSON", "{"],
    ["vide", ""],
    ["null", "null"],
    ["un tableau", "[]"],
    ["un objet qui ne suit pas le schéma", JSON.stringify({ prenom: 3 })],
    ["un champ qui ne passe pas", JSON.stringify({ prenom: "   " })],
  ])("refuse un corps %s : null, et la route répond son code", async (_, corps) => {
    expect(await lireCorps(requete("POST", corps), Schema)).toBeNull();
  });

  it("refuse une requête sans corps", async () => {
    expect(await lireCorps(requete("GET"), Schema)).toBeNull();
  });
});

/* Tous les champs des corps des routes, chacun du mauvais type ou hors de sa liste */
const TOUT_FAUX = JSON.stringify({
  me: "p2",
  pronom: "on",
  guess: 1,
  goal: 1,
  email: 3,
  code: 3,
  id: 3,
  cle: 3,
  partout: "oui",
  app: 3,
  lots: "x",
  texte: 3,
  question: "oui",
  actif: "oui",
  offre: "gratuit",
  conv: 3,
  renonciation: 3,
  achat: 3,
  issue: "x",
  facts: "x",
  type: "x",
  evenement: "x",
  position: "x",
});
const MAL_FORMES = [
  ["pas du JSON", "{"],
  ["null", "null"],
  ["un tableau", "[]"],
  ["un objet vide", "{}"],
  ["des champs faux", TOUT_FAUX],
] as const;

type Route = (req: Request) => Promise<Response>;

describe("un corps mal formé : chaque route répond le code qu’elle répondait", () => {
  const CODES: [string, Route, string, string, number][] = [
    /* « Qui es-tu ? » mal rempli est pris pour une relance : sans « Qui es-tu ? » en base, à remplir d’abord */
    ["POST /api/analyse", postAnalyse, "POST", "qui", 422],
    ["POST /api/attente", postAttente, "POST", "email", 422],
    ["POST /api/attente/retrait", postRetrait, "POST", "lien", 404],
    ["POST /api/auth/code", postCode, "POST", "email", 422],
    ["POST /api/captures/video", postVideo, "POST", "fichier", 422],
    ["POST /api/chat", postChat, "POST", "texte", 422],
    ["POST /api/chat/vocal", postVocal, "POST", "invalide", 422],
    ["POST /api/paiement", postPaiement, "POST", "offre", 422],
    ["POST /api/paiement/offre", postOffre, "POST", "offre", 422],
    ["POST /api/paiement/factice", postFauxWhop, "POST", "invalide", 422],
    ["PUT /api/fiche", putFiche, "PUT", "faits", 422],
    ["POST /api/partage/image", postImage, "POST", "cible", 422],
    ["POST /api/vocal/ecoute", postEcoute, "POST", "invalide", 422],
  ];

  it.each(CODES.flatMap(([cle, route, methode, code, status]) => MAL_FORMES.map(([quoi, corps]) => [cle, quoi, route, methode, corps, code, status] as const)))(
    "%s, %s",
    async (_, __, route, methode, corps, code, status) => {
      const r = await route(requete(methode, corps));
      expect({ status: r.status, corps: await r.json() }).toEqual({ status, corps: { erreur: code } });
    },
  );

  it.each(MAL_FORMES)("POST /api/auth/verifier, %s : « pas le bon code », comme un mauvais code", async (_, corps) => {
    const r = await postVerifier(requete("POST", corps));
    expect({ status: r.status, corps: await r.json() }).toEqual({ status: 200, corps: { ok: false } });
  });
});

describe("les routes qui font sans un corps mal formé", () => {
  it.each(MAL_FORMES)("POST /api/auth/deconnexion, %s : cet appareil seulement", async (_, corps) => {
    const r = await postDeconnexion(requete("POST", corps));
    expect({ status: r.status, corps: await r.json(), fermees: etat.fermees }).toEqual({ status: 200, corps: { ok: true }, fermees: [{ secret: "secret", partout: false }] });
  });

  it("POST /api/auth/deconnexion, partout : toutes les sessions du compte", async () => {
    await postDeconnexion(requete("POST", JSON.stringify({ partout: true })));
    expect(etat.fermees).toEqual([{ secret: "secret", partout: true }]);
  });

  it("POST /api/chat/vocal, un corps bien formé : le mode est écrit et rendu", async () => {
    const r = await postVocal(requete("POST", JSON.stringify({ actif: true })));
    expect({ status: r.status, corps: await r.json(), ecrit: etat.ecrit }).toEqual({ status: 200, corps: { modeVocal: true }, ecrit: [{ chatVocal: true }] });
  });
});
