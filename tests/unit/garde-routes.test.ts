import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROUTES, type CleRoute } from "@/types/api";

/*
 * La garde commune des routes /api (src/server/requete.ts). D’abord en table, sur chaque route de la table du contrat
 * (src/types/api.ts) : une mutation venue d’ailleurs répond 403, une route qui demande un compte répond 401 sans session.
 * Une route ajoutée à la table y passe d’elle-même. Puis la garde seule : le plan, la conv, la limite, la session sans
 * le filtre de la bêta. Sans base : les cookies, le compte et sa conv, et les limites sont simulés.
 */

type Compte = { id: string; email: string; plan: "gratuit" | "rapport" | "blushplus" };
const etat = vi.hoisted(() => ({
  /** Ce que contexteRequete rend (le compte de la session, sa conv ouverte), et compteDeSession (sans le filtre de la bêta) */
  utilisateur: null as Compte | null,
  story: null as { id: string } | null,
  sansBeta: null as Compte | null,
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
  storyCourante: async () => null,
}));
vi.mock("@/server/auth", async (original) => ({ ...(await original<typeof import("@/server/auth")>()), compteDeSession: async () => etat.sansBeta }));
vi.mock("@/server/limites", async (original) => ({
  ...(await original<typeof import("@/server/limites")>()),
  sousLaLimite: async (cle: string) => (etat.comptees.push(cle), !etat.atteinte),
  limiteAtteinte: async () => false,
}));

import { garde, lecture } from "@/server/requete";
import { LIMITES } from "@/server/limites";

beforeEach(() => {
  Object.assign(etat, { utilisateur: null, story: null, sansBeta: null, comptees: [], atteinte: false });
});

const APPLI = "http://localhost";
const LECTURES = new Set(["GET", "HEAD"]);

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
/** Les routes qui ont leur propre garde, hors de la garde commune : le secret de Vercel Cron, et le réveil qui ne dit rien. */
const HORS_GARDE = new Set<CleRoute>(["GET /api/cron/purge", "GET /api/reveil"]);

const cles = Object.keys(ROUTES) as CleRoute[];
const mutations = cles.filter((c) => !LECTURES.has(c.split(" ")[0]));

/** Appelle la route de cette clé comme Next le ferait : son fichier, sa méthode, une requête vide (ou un formulaire vide). */
async function appeler(cle: CleRoute, entetes: Record<string, string> = {}): Promise<Response> {
  const [methode, chemin] = cle.split(" ");
  const route = (await import(join(process.cwd(), "src/app", chemin, "route.ts"))) as Record<string, (req: Request, ctx: unknown) => Promise<Response>>;
  const req = new Request(`${APPLI}${chemin.replace("[id]", "1")}`, { method: methode, headers: { "x-forwarded-for": "10.9.8.7", ...entetes } });
  return route[methode](req, { params: Promise.resolve({ id: "1" }) });
}

describe("chaque route de la table", () => {
  it("la table compte 24 mutations, et chaque route y est classée : avec compte, sans compte, ou hors de la garde", () => {
    expect(mutations).toHaveLength(24);
    for (const c of [...SANS_COMPTE, ...HORS_GARDE]) expect(cles, c).toContain(c);
  });

  it.each(mutations)("%s refuse (403) une requête venue d’un autre site, ou sans origine", async (cle) => {
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

  it.each([...SANS_COMPTE])("%s, depuis l’appli et sans session : ni 401, ni 403 (sa réponse vient de ce qu’on lui envoie)", async (cle) => {
    const r = await appeler(cle, { origin: APPLI, host: "localhost" });
    expect([401, 403], `${cle} : ${r.status}`).not.toContain(r.status);
  });
});

describe("la garde", () => {
  const post = (entetes: Record<string, string> = { origin: APPLI, host: "localhost", "x-forwarded-for": "2001:db8:1:2:3:4:5:6" }) => new Request(`${APPLI}/api/x`, { method: "POST", headers: entetes });
  const gratuit: Compte = { id: "c1", email: "Noe.Martin+test@gmail.com", plan: "gratuit" };

  it("une lecture (GET) ne regarde pas l’origine ; une mutation, si", async () => {
    etat.utilisateur = gratuit;
    expect(await garde(new Request(`${APPLI}/api/x`), { session: "requise" })).toEqual({ utilisateur: gratuit, story: null });
    const refus = await garde(post({}), { session: "aucune" });
    expect(refus instanceof Response && refus.status).toBe(403);
  });

  it("dans l’ordre : la session (401), le plan (402), la conv (404), puis la limite (429)", async () => {
    const statut = async (o: Parameters<typeof garde>[1]) => {
      const g = await garde(post(), o);
      return g instanceof Response ? [g.status, ((await g.json()) as { erreur: string }).erreur] : "ok";
    };
    const tout = { session: "requise", plan: "chat", histoire: true, limite: { cle: "image", limite: LIMITES.imageParCompte, par: "compte" } } as const;
    expect(await statut(tout)).toEqual([401, "connexion"]);
    etat.utilisateur = gratuit;
    expect(await statut(tout)).toEqual([402, "acces"]);
    etat.utilisateur = { ...gratuit, plan: "blushplus" };
    expect(await statut(tout)).toEqual([404, "aucune"]);
    etat.story = { id: "s1" };
    expect(await statut(tout)).toEqual("ok");
    etat.atteinte = true;
    expect(await statut(tout)).toEqual([429, "trop"]);
    /* Facultative : sans compte, rien ne manque */
    etat.utilisateur = null;
    expect(await statut({ session: "facultative" })).toEqual("ok");
  });

  it("une limite par compte se range sur son email canonique ; par adresse IP, une IPv6 sur son /64", async () => {
    etat.utilisateur = gratuit;
    await garde(post(), { session: "requise", limite: { cle: "image", limite: LIMITES.imageParCompte, par: "compte" } });
    await garde(post(), { session: "aucune", limite: { cle: "verif", limite: LIMITES.verificationParIp, par: "ip" } });
    await lecture({ session: "requise", limite: { cle: "image", limite: LIMITES.imageParCompte, par: "compte" } });
    expect(etat.comptees).toEqual(["image:compte:noemartin@gmail.com", "verif:2001:db8:1:2::/64", "image:compte:noemartin@gmail.com"]);
  });

  it("« sansBeta » : le compte de la session même retiré de la bêta, sans sa conv ; sans compte, 401", async () => {
    const r = await garde(post(), { session: "sansBeta" });
    expect(r instanceof Response && r.status).toBe(401);
    etat.sansBeta = gratuit;
    etat.story = { id: "s1" };
    expect(await garde(post(), { session: "sansBeta" })).toEqual({ utilisateur: gratuit, story: null });
  });
});
