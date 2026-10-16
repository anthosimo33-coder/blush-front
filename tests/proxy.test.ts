import { existsSync } from "node:fs";
import { NextRequest, type NextResponse } from "next/server";
import { getRewrittenUrl, isRewrite, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NOMS_DE_SESSION, NOMS_DU_TOURNAGE } from "@/lib/noms-cookies";
import { config, proxy } from "@/proxy";
import nextConfig from "../next.config";

/*
 * Le proxy (src/proxy.ts) : les outils de l’équipe (et le faux Whop) introuvables sur Vercel et ouverts ailleurs, d’après un seul critère
 * (src/server/drapeaux.ts), à ce poste seulement (src/lib/hote-local.ts), les variantes de la bêta fermée, qui ne changent pas, et
 * celles de la session et du tournage, d’après la seule présence de leur cookie, jamais sa valeur. Sans base ni serveur : la requête
 * est construite ici, les variables posées par cas. (Le guide de Next appelle unstable_doesProxyMatch ce que cette
 * version exporte encore sous le nom unstable_doesMiddlewareMatch.)
 */
const OUTILS = [
  "/apercu",
  "/apercu/liste",
  "/apercu/accueil",
  "/apercu/fiche",
  "/apercu/admin",
  "/apercu/ecriture",
  "/apercu/instagram",
  "/apercu/carte",
  "/apercu/mail",
  "/apercu/demander",
  "/styleguide",
  /* Le faux Whop : sa page de paiement, et ses boutons */
  "/paiement/factice",
  "/api/paiement/factice",
];
const VARIANTES = {
  "/commencer": "/commencer/fermee",
  "/email/code": "/email/code/fermee",
  "/connexion/code": "/connexion/code/fermee",
  "/importer/captures": "/importer/captures/fermee",
};

/** Une requête pour `chemin`, qui demande `hote` (son en-tête Host, comme un navigateur), avec ces cookies et ces en-têtes. */
const requete = (chemin: string, cookies: Record<string, string> = {}, hote = "www.askblush.com", entetes: Record<string, string> = {}) => {
  const r = new NextRequest(`https://${hote}${chemin}`, { headers: { host: hote, ...entetes } });
  for (const [nom, valeur] of Object.entries(cookies)) r.cookies.set(nom, valeur);
  return r;
};
/** Le proxy laisse passer la requête telle quelle (NextResponse.next()). */
const passe = (r: Response) => r.headers.get("x-middleware-next") === "1" && !isRewrite(r as NextResponse);
const reecriteVers = (r: Response) => (isRewrite(r as NextResponse) ? new URL(getRewrittenUrl(r as NextResponse)!).pathname : null);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("les outils de l’équipe : jamais sur Vercel", () => {
  it("le proxy passe par chacun d’eux, et par aucune page du produit", () => {
    for (const url of OUTILS) expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
    for (const url of ["/", "/app", "/rapport", "/admin", "/api/auth/code", "/v/abc", "/paiement/retour", "/api/paiement", "/api/paiement/whop"])
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
  });

  it("sur Vercel, en ligne comme en préversion : la page introuvable (404), bêta fermée ou non", () => {
    vi.stubEnv("VERCEL", "1");
    const cibles = new Set<string | null>();
    for (const [vercel, beta] of [
      ["production", "1"],
      ["production", "0"],
      ["preview", "0"],
    ]) {
      vi.stubEnv("VERCEL_ENV", vercel);
      vi.stubEnv("BLUSH_BETA_FERMEE", beta);
      for (const url of OUTILS) {
        const r = proxy(requete(url));
        expect(passe(r), `${url} (${vercel}, bêta ${beta})`).toBe(false);
        cibles.add(reecriteVers(r));
      }
    }
    /* Une seule adresse, sans page (Next y sert src/app/not-found.tsx, en 404) et hors du matcher (le proxy n’y repasse pas) */
    expect(cibles.size).toBe(1);
    const [cible] = cibles;
    expect(cible).toMatch(/^\/[a-z-]+$/);
    expect(existsSync(`src/app${cible}`), cible!).toBe(false);
    expect(unstable_doesMiddlewareMatch({ config, url: cible! })).toBe(false);
  });

  it("hors de Vercel (en local, le serveur des tests) : ils s’ouvrent à ce poste, sous chacun de ses noms", () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("NODE_ENV", "production");
    for (const hote of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "localhost", "blush.localhost:3000"])
      for (const url of OUTILS) expect(passe(proxy(requete(url, {}, hote))), `${hote}${url}`).toBe(true);
  });

  it("hors de Vercel, une requête qui ne demande pas ce poste : la page introuvable, comme sur Vercel", () => {
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("NODE_ENV", "production");
    const introuvable = reecriteVers(proxy(requete("/apercu", {}, "www.askblush.com")));
    expect(introuvable).not.toBeNull();
    const cas: [string, Record<string, string>][] = [
      /* DNS rebinding : une page de attaquant.example, son domaine pointé sur 127.0.0.1, lit l’aperçu depuis ton navigateur */
      ["attaquant.example:3000", {}],
      /* Un téléphone du Wi-Fi, quand le serveur écoute le réseau (-H 0.0.0.0) ou que next start écoute tout */
      ["192.168.1.20:3000", {}],
      ["mon-mac.local:3000", {}],
      /* Un nom qui finit par « localhost » sans en être un sous-domaine */
      ["evil-localhost:3000", {}],
      /* Derrière un relais qui dit un autre hôte */
      ["localhost:3000", { "x-forwarded-host": "attaquant.example" }],
    ];
    for (const [hote, entetes] of cas)
      for (const url of OUTILS) {
        const r = proxy(requete(url, {}, hote, entetes));
        expect(passe(r), `${hote}${url}`).toBe(false);
        expect(reecriteVers(r), `${hote}${url}`).toBe(introuvable);
      }
  });
});

describe("la bêta fermée : ses variantes, inchangées", () => {
  it("le proxy passe par les quatre pages du parcours d’arrivée", () => {
    for (const url of Object.keys(VARIANTES)) expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
  });

  it("bêta ouverte (ou sans la variable) : tout passe, sur Vercel comme ailleurs", () => {
    for (const vercel of ["1", undefined]) {
      vi.stubEnv("VERCEL", vercel);
      for (const beta of ["0", undefined]) {
        vi.stubEnv("BLUSH_BETA_FERMEE", beta);
        for (const url of Object.keys(VARIANTES)) expect(passe(proxy(requete(url))), `${url} (Vercel ${vercel}, bêta ${beta})`).toBe(true);
      }
    }
  });

  it("bêta fermée : chaque page sert sa variante « fermee », sur Vercel comme ailleurs ; à qui est connecté, /commencer sert la sienne", () => {
    vi.stubEnv("BLUSH_BETA_FERMEE", "1");
    for (const vercel of ["1", undefined]) {
      vi.stubEnv("VERCEL", vercel);
      for (const [url, variante] of Object.entries(VARIANTES)) expect(reecriteVers(proxy(requete(url))), url).toBe(variante);
      /* La session sous ses deux noms : __Host- en https, sans préfixe en http (src/lib/noms-cookies.ts) */
      for (const session of ["__Host-blush-session", "blush-session"]) {
        expect(reecriteVers(proxy(requete("/commencer", { [session]: "une-session" }))), session).toBe("/commencer/connecte");
        expect(reecriteVers(proxy(requete("/email/code", { [session]: "une-session" }))), session).toBe("/email/code/fermee");
      }
    }
  });
});

/** La valeur d’un cookie, reconnaissable : elle ne reparaît ni dans la destination, ni dans un en-tête de la réponse. */
const SECRET = "valeur-du-cookie-a-ne-jamais-recopier";
/** Les pages servies sous un cookie, ses deux noms (__Host- en https, sans préfixe en http) et leur variante. */
const SOUS_UN_COOKIE = [
  ["/", NOMS_DE_SESSION, "/retour"],
  ["/commencer", NOMS_DE_SESSION, "/commencer/connecte"],
  ["/connexion", NOMS_DE_SESSION, "/connexion/connecte"],
  ["/importer/export", NOMS_DU_TOURNAGE, "/importer/export/tournage"],
] as const;

describe("la session et le tournage : leur variante d’après la présence du cookie, jamais sa valeur", () => {
  it("le proxy passe par ces pages sous chacun des noms de leur cookie ; sans lui, /, /connexion et l’export ne passent pas par le proxy", () => {
    for (const [url, noms] of SOUS_UN_COOKIE)
      for (const nom of noms) expect(unstable_doesMiddlewareMatch({ config, url, cookies: { [nom]: SECRET } }), `${url} sous ${nom}`).toBe(true);
    for (const url of ["/", "/connexion", "/importer/export"]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
      /* Un cookie qui n’est ni la session ni le tournage, ou leur nom à un caractère près */
      for (const nom of ["blush-brouillon", "__Host-blush-humain", "blush-session-x", "Blush-Session"])
        expect(unstable_doesMiddlewareMatch({ config, url, cookies: { [nom]: SECRET } }), `${url} sous ${nom}`).toBe(false);
    }
  });

  it("chaque page sert sa variante, bêta ouverte comme fermée : la destination ne garde que la requête du navigateur", () => {
    for (const beta of ["0", "1"]) {
      vi.stubEnv("BLUSH_BETA_FERMEE", beta);
      for (const [url, noms, variante] of SOUS_UN_COOKIE)
        for (const nom of noms) {
          const r = proxy(requete(`${url}?app=whatsapp`, { [nom]: SECRET }));
          const qui = `${url} sous ${nom} (bêta ${beta})`;
          expect(reecriteVers(r), qui).toBe(variante);
          expect(new URL(getRewrittenUrl(r as NextResponse)!).search, qui).toBe("?app=whatsapp");
          for (const [entete, valeur] of r.headers) expect(valeur, `${qui} : ${entete}`).not.toContain(SECRET);
        }
    }
  });

  it("le cookie de l’une ne sert pas la variante de l’autre ; sans cookie, la page elle-même", () => {
    vi.stubEnv("BLUSH_BETA_FERMEE", "0");
    for (const [url, noms] of SOUS_UN_COOKIE) {
      const autres = noms === NOMS_DE_SESSION ? NOMS_DU_TOURNAGE : NOMS_DE_SESSION;
      for (const nom of autres) expect(passe(proxy(requete(url, { [nom]: SECRET }))), `${url} sous ${nom}`).toBe(true);
      expect(passe(proxy(requete(url))), url).toBe(true);
    }
  });

  it("next.config.ts ne réécrit ni ne redirige d’après un cookie : Next en recopierait la valeur dans la destination", async () => {
    const reecritures = await nextConfig.rewrites!();
    const regles = [
      ...(Array.isArray(reecritures) ? reecritures : [reecritures.beforeFiles, reecritures.afterFiles, reecritures.fallback].flatMap((phase) => phase ?? [])),
      ...(await nextConfig.redirects!()),
    ];
    expect(regles.length).toBeGreaterThan(0);
    for (const regle of regles) expect(regle.has ?? [], regle.source).not.toContainEqual(expect.objectContaining({ type: "cookie" }));
  });
});
