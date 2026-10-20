import { existsSync } from "node:fs";
import { NextRequest, type NextResponse } from "next/server";
import { getRewrittenUrl, isRewrite, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NOMS_DU_TOURNAGE } from "@/lib/noms-cookies";
import { config, proxy } from "@/proxy";

/*
 * Le proxy (src/proxy.ts) : le relais de PostHog et les adresses qui finissent par « / », les outils de l’équipe (et le faux Whop) introuvables sur Vercel et ouverts ailleurs, d’après un seul critère
 * (src/server/drapeaux.ts), à ce poste seulement (src/lib/hote-local.ts), et les variantes de la bêta fermée, qui ne changent pas. Sans base ni serveur : la requête
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

  it("bêta fermée : chaque page sert sa variante « fermee », sur Vercel comme ailleurs ; /commencer passe pour qui est connecté", () => {
    vi.stubEnv("BLUSH_BETA_FERMEE", "1");
    for (const vercel of ["1", undefined]) {
      vi.stubEnv("VERCEL", vercel);
      for (const [url, variante] of Object.entries(VARIANTES)) expect(reecriteVers(proxy(requete(url))), url).toBe(variante);
      /* La session sous ses deux noms : __Host- en https, sans préfixe en http (src/lib/noms-cookies.ts) */
      for (const session of ["__Host-blush-session", "blush-session"]) {
        expect(passe(proxy(requete("/commencer", { [session]: "une-session" }))), session).toBe(true);
        expect(reecriteVers(proxy(requete("/email/code", { [session]: "une-session" }))), session).toBe("/email/code/fermee");
      }
    }
  });
});

describe("le relais de PostHog (/ingest)", () => {
  /** L’en-tête que le proxy pose sur la requête relayée (NextResponse.rewrite, `request.headers`), ou null s’il l’a retiré. */
  const enTeteRelaye = (r: Response, nom: string) => {
    const poses = (r.headers.get("x-middleware-override-headers") ?? "").split(",");
    return poses.includes(nom) ? r.headers.get(`x-middleware-request-${nom}`) : null;
  };

  it("le proxy passe par lui (sa barre finale comprise), et pas par une adresse qui commence pareil", () => {
    for (const url of ["/ingest", "/ingest/e/", "/ingest/i/v0/e/", "/ingest/static/array.js"]) expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
    for (const url of ["/", "/ingestion", "/_next/static/chunks/a.js"]) expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
  });

  it("avec la clé : vers le serveur européen de PostHog (ses fichiers à part), sa requête gardée, sans nos cookies", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_CLE", "phc_essai");
    const r = proxy(
      requete("/ingest/i/v0/e/?ip=0&ver=1.435.8", { "__Host-blush-session": "secret", "blush-autre": "x" }, "www.askblush.com", {
        authorization: "Bearer x",
        "x-forwarded-for": "203.0.113.7",
      }),
    );
    expect(isRewrite(r as NextResponse)).toBe(true);
    expect(getRewrittenUrl(r as NextResponse)).toBe("https://eu.i.posthog.com/i/v0/e/?ip=0&ver=1.435.8");
    expect(enTeteRelaye(r, "host")).toBe("eu.i.posthog.com");
    expect(enTeteRelaye(r, "cookie")).toBeNull();
    expect(enTeteRelaye(r, "authorization")).toBeNull();
    /* L’adresse IP passe : PostHog en tire son empreinte sans cookie */
    expect(enTeteRelaye(r, "x-forwarded-for")).toBe("203.0.113.7");
    expect(getRewrittenUrl(proxy(requete("/ingest/static/array.js")) as NextResponse)).toBe("https://eu-assets.i.posthog.com/static/array.js");
    /* Ses réglages (le projet, l’enregistrement) : de son serveur de fichiers aussi */
    expect(getRewrittenUrl(proxy(requete("/ingest/array/phc_essai/config")) as NextResponse)).toBe("https://eu-assets.i.posthog.com/array/phc_essai/config");
    expect(getRewrittenUrl(proxy(requete("/ingest/s/?ver=1")) as NextResponse)).toBe("https://eu.i.posthog.com/s/?ver=1");
  });

  it("en mode tournage, rien ne part (200, comme PostHog, pour qu’il ne réessaie pas) ; sans la clé, le relais n’existe pas", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_CLE", "phc_essai");
    for (const nom of NOMS_DU_TOURNAGE) {
      const r = proxy(requete("/ingest/e/", { [nom]: "un-lien" }));
      expect(r.status, nom).toBe(200);
      expect(await r.json()).toEqual({ status: 1 });
      expect(isRewrite(r as NextResponse)).toBe(false);
    }
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_CLE", undefined);
    expect(reecriteVers(proxy(requete("/ingest/e/")))).toBe("/introuvable");
  });

  it("une adresse du matcher qui finit par « / » : vers la même sans (308), sa requête gardée, avant sa variante de la bêta fermée", () => {
    vi.stubEnv("BLUSH_BETA_FERMEE", "1");
    expect(unstable_doesMiddlewareMatch({ config, url: "/commencer/" })).toBe(true);
    for (const [url, vers] of [
      ["/commencer/", "/commencer"],
      ["/email/code//", "/email/code"],
      ["/importer/captures/?app=hinge", "/importer/captures?app=hinge"],
    ]) {
      const r = proxy(requete(url!));
      expect(r.status, url).toBe(308);
      const location = new URL(r.headers.get("location")!);
      expect(`${location.pathname}${location.search}`, url).toBe(vers);
    }
  });
});
