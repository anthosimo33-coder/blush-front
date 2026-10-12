import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { estMutation, ROUTES, type CleRoute } from "@/types/api";
import { auMoins } from "../aide/listes";

/*
 * La garde commune des routes /api (src/server/requete.ts). D’abord en table, sur chaque route de la table du contrat
 * (src/types/api.ts) : une mutation venue d’ailleurs répond 403, une route qui demande un compte répond 401 sans session.
 * Une route ajoutée à la table y passe d’elle-même. Puis la garde seule : le client, la conv, la limite, la session sans
 * le filtre de la bêta. Sans base : les cookies, le compte et sa conv, ses droits et les limites sont simulés.
 */

type Compte = { id: string; email: string };
const etat = vi.hoisted(() => ({
  /** Ce que contexteRequete rend (le compte de la session, sa conv ouverte), et compteDeSession (sans le filtre de la bêta) */
  utilisateur: null as Compte | null,
  story: null as { id: string } | null,
  sansBeta: null as Compte | null,
  /** Le compte est-il client (estClient, src/server/droits.ts) */
  client: false,
  /** Les limites comptées (leur clé), et si elles sont atteintes */
  comptees: [] as string[],
  atteinte: false,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("@/server/donnees", async (original) => ({
  ...(await original<typeof import("@/server/donnees")>()),
  contexteRequete: async () => ({ utilisateur: etat.utilisateur, story: etat.story }),
  utilisateurCourant: async () => etat.utilisateur,
}));
vi.mock("@/server/droits", async (original) => ({ ...(await original<typeof import("@/server/droits")>()), estClient: async () => etat.client }));
vi.mock("@/server/auth", async (original) => ({ ...(await original<typeof import("@/server/auth")>()), compteDeSession: async () => etat.sansBeta }));
vi.mock("@/server/limites", async (original) => ({
  ...(await original<typeof import("@/server/limites")>()),
  sousLaLimite: async (cle: string) => (etat.comptees.push(cle), !etat.atteinte),
  limiteAtteinte: async () => false,
}));

import { garde, lecture, sousLaLimiteDuCompte } from "@/server/requete";
import { LIMITES } from "@/server/limites";

beforeEach(() => {
  Object.assign(etat, { utilisateur: null, story: null, sansBeta: null, client: false, comptees: [], atteinte: false });
});

const APPLI = "http://localhost";

/**
 * Les routes qui ne demandent pas de compte : l’import avant l’email (un brouillon), la connexion, la liste d’attente, et
 * la conv du parcours (celle qu’on importe, ou un brouillon à supprimer). Toutes les autres répondent 401 sans session.
 */
const SANS_COMPTE = new Set<CleRoute>([
  "POST /api/attente",
  "POST /api/attente/retrait",
  "POST /api/auth/code",
  "POST /api/auth/deconnexion",
  "POST /api/auth/verifier",
  "POST /api/captures",
  "POST /api/captures/lot",
  "POST /api/captures/video",
  "POST /api/import",
  "GET /api/histoire",
  "DELETE /api/histoire",
]);
/**
 * Les routes qui ont leur propre garde, hors de la garde commune : le secret de Vercel Cron, le réveil qui ne dit rien,
 * et le webhook de Whop (sa signature : Whop n’est pas l’appli, sa requête n’a pas notre origine).
 */
const HORS_GARDE = new Set<CleRoute>(["GET /api/cron/purge", "GET /api/reveil", "POST /api/paiement/whop"]);

const cles = Object.keys(ROUTES) as CleRoute[];
const mutations = cles.filter((c) => estMutation(c.split(" ")[0]!));

/** Appelle la route de cette clé comme Next le ferait : son fichier, sa méthode, une requête vide (ou un formulaire vide). */
async function appeler(cle: CleRoute, entetes: Record<string, string> = {}): Promise<Response> {
  const [methode, chemin] = auMoins(cle.split(" "), 2);
  const route = (await import(join(process.cwd(), "src/app", chemin, "route.ts"))) as Record<string, (req: Request, ctx: unknown) => Promise<Response>>;
  const req = new Request(`${APPLI}${chemin.replace(/\[\w+\]/, "1")}`, { method: methode, headers: { "x-forwarded-for": "10.9.8.7", ...entetes } });
  return route[methode]!(req, { params: Promise.resolve({ id: "1", achat: "1" }) });
}

describe("chaque route de la table", () => {
  it("la table compte 27 mutations, et chaque route y est classée : avec compte, sans compte, ou hors de la garde", () => {
    expect(mutations).toHaveLength(27);
    for (const c of [...SANS_COMPTE, ...HORS_GARDE]) expect(cles, c).toContain(c);
  });

  it.each(mutations.filter((c) => !HORS_GARDE.has(c)))("%s refuse (403) une requête venue d’un autre site, ou sans origine", async (cle) => {
    for (const origine of [{ origin: "http://site-pirate.test", host: "localhost" }, { origin: "null", host: "localhost" }, { host: "localhost" }] as Record<string, string>[]) {
      const r = await appeler(cle, origine);
      expect([r.status, await r.json()], JSON.stringify(origine)).toEqual([403, { erreur: "origine" }]);
    }
    /* Le contrôle passe avant tout le reste : ni session lue, ni limite comptée */
    expect(etat.comptees).toEqual([]);
  });

  it.each(cles.filter((c) => !SANS_COMPTE.has(c) && !HORS_GARDE.has(c)))("%s, depuis l’appli mais sans session : 401 « connexion »", async (cle) => {
    const r = await appeler(cle, { origin: APPLI, host: "localhost" });
    expect([r.status, await r.json()]).toEqual([401, { erreur: "connexion" }]);
    expect(etat.comptees).toEqual([]);
  });

  it("POST /api/paiement/whop, la seule mutation hors de la garde : d’où qu’elle vienne, sans signature, 401 « interdit » ; ni session lue, ni limite comptée", async () => {
    for (const origine of [{ origin: "https://api.whop.com", host: "localhost" }, { host: "localhost" }, { origin: APPLI, host: "localhost" }] as Record<string, string>[]) {
      const r = await appeler("POST /api/paiement/whop", origine);
      expect([r.status, await r.json()], JSON.stringify(origine)).toEqual([401, { erreur: "interdit" }]);
    }
    expect(etat.comptees).toEqual([]);
  });

  it.each([...SANS_COMPTE])("%s, depuis l’appli et sans session : ni 401, ni 403 (sa réponse vient de ce qu’on lui envoie)", async (cle) => {
    const r = await appeler(cle, { origin: APPLI, host: "localhost" });
    expect([401, 403], `${cle} : ${r.status}`).not.toContain(r.status);
  });
});

describe("la garde", () => {
  const post = (entetes: Record<string, string> = { origin: APPLI, host: "localhost", "x-forwarded-for": "2001:db8:1:2:3:4:5:6" }) =>
    new Request(`${APPLI}/api/x`, { method: "POST", headers: entetes });
  const gratuit: Compte = { id: "c1", email: "Noe.Martin+test@gmail.com" };

  it("une lecture (GET) ne regarde pas l’origine ; une mutation, si", async () => {
    etat.utilisateur = gratuit;
    expect(await garde(new Request(`${APPLI}/api/x`), { session: "requise" })).toEqual({ utilisateur: gratuit, story: null });
    const refus = await garde(post({}), { session: "aucune" });
    expect(refus instanceof Response && refus.status).toBe(403);
  });

  it("dans l’ordre : la session (401), le client (402), la conv (404), puis la limite (429)", async () => {
    const statut = async (o: Parameters<typeof garde>[1]) => {
      const g = await garde(post(), o);
      return g instanceof Response ? [g.status, ((await g.json()) as { erreur: string }).erreur] : "ok";
    };
    const tout = { session: "requise", client: true, histoire: true, limite: { ip: "verif", limite: LIMITES.verificationParIp } } as const;
    expect(await statut(tout)).toEqual([401, "connexion"]);
    etat.utilisateur = gratuit;
    expect(await statut(tout)).toEqual([402, "acces"]);
    etat.client = true;
    expect(await statut(tout)).toEqual([404, "aucune"]);
    etat.story = { id: "s1" };
    expect(await statut(tout)).toEqual("ok");
    etat.atteinte = true;
    expect(await statut(tout)).toEqual([429, "trop"]);
    /* Facultative : sans compte, rien ne manque */
    etat.utilisateur = null;
    expect(await statut({ session: "facultative" })).toEqual("ok");
  });

  it("une limite par adresse IP se range sur l’adresse, une IPv6 sur son /64 ; celle d’un compte (comptée par la route), sur son email canonique", async () => {
    etat.utilisateur = gratuit;
    await garde(post(), { session: "aucune", limite: { ip: "verif", limite: LIMITES.verificationParIp } });
    await sousLaLimiteDuCompte(gratuit, "image");
    expect(etat.comptees).toEqual(["verif:ip:2001:db8:1:2::/64", "image:compte:noemartin@gmail.com"]);
  });

  it("une limite à l’entrée attend la requête : lecture n’en prend pas (refusée à la compilation, et « trop » sinon)", async () => {
    etat.utilisateur = gratuit;
    // @ts-expect-error lecture n’a pas d’adresse IP à compter
    const r = await lecture({ session: "requise", limite: { ip: "verif", limite: LIMITES.verificationParIp } });
    expect(r instanceof Response && r.status).toBe(429);
    expect(etat.comptees).toEqual([]);
  });

  it("une adresse forgée qui imite la clé d’un compte reste dans la famille des adresses IP : elle n’use pas les lectures d’un autre", async () => {
    for (const forgee of ["compte:noemartin@gmail.com", "compte:noemartin@gmail.com, 10.0.0.1"]) {
      etat.comptees = [];
      await garde(post({ origin: APPLI, host: "localhost", "x-forwarded-for": forgee }), { session: "aucune", limite: { ip: "analyse", limite: LIMITES.analyseParIp } });
      expect(etat.comptees).toEqual(["analyse:ip:compte:noemartin@gmail.com"]);
      expect(etat.comptees).not.toContain("analyse:compte:noemartin@gmail.com");
    }
  });

  it("POST /api/analyse : l’origine passe avant la lecture du corps (une requête venue d’ailleurs n’est même pas lue)", async () => {
    const { POST } = await import("@/app/api/analyse/route");
    const req = new Request(`${APPLI}/api/analyse`, { method: "POST", headers: { origin: "http://site-pirate.test", host: "localhost" }, body: JSON.stringify({ me: "p0" }) });
    const lu = vi.spyOn(req, "json");
    const r = await POST(req);
    expect([r.status, await r.json()]).toEqual([403, { erreur: "origine" }]);
    expect(lu).not.toHaveBeenCalled();
  });

  it("« sansBeta » : le compte de la session même retiré de la bêta, sans sa conv ; sans compte, 401", async () => {
    const r = await garde(post(), { session: "sansBeta" });
    expect(r instanceof Response && r.status).toBe(401);
    etat.sansBeta = gratuit;
    etat.story = { id: "s1" };
    expect(await garde(post(), { session: "sansBeta" })).toEqual({ utilisateur: gratuit, story: null });
  });
});
