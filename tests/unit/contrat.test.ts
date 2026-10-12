import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import { sensDeTendance } from "@/lib/tendance";
import { ROUTES, type CleFixe, type CleJson, type CleRoute, type Moi, type Routes } from "@/types/api";

/*
 * Le contrat HTTP (src/types/api.ts) : chaque route de src/app/api y a sa ligne, et chaque ligne sa route ; chaque route
 * répond sous sa propre ligne (repondre) et lit son corps par le schéma de cette ligne (lireCorps). Le navigateur n’en
 * importe que des types (zod reste au serveur : ESLint, tests/lint.test.ts), et appelle les routes par la couche de
 * service, pas par un fetch à lui. Ce que le compilateur vérifie (les deux bouts sous le même type) est écrit plus bas, en @ts-expect-error :
 * `npm run check` (tsc) le relit. La couche de service elle-même : tests/unit/api-client.test.ts.
 */

const RACINE = process.cwd();
const API = join(RACINE, "src/app/api");
const METHODES = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

/** Les fichiers sous `dossier`, récursivement. */
async function fichiers(dossier: string): Promise<string[]> {
  const entrees = await readdir(dossier, { withFileTypes: true });
  const listes = await Promise.all(entrees.map((e) => (e.isDirectory() ? fichiers(join(dossier, e.name)) : [join(dossier, e.name)])));
  return listes.flat();
}

/** Une route de src/app/api : son adresse (« /api/vocal/chat/[id] »), son fichier, son code, et les méthodes qu’elle exporte. */
type Route = { chemin: string; fichier: string; source: string; methodes: string[] };
let routes: Route[] = [];

beforeAll(async () => {
  const handlers = (await fichiers(API)).filter((f) => /[/\\]route\.tsx?$/.test(f));
  routes = await Promise.all(
    handlers.map(async (fichier) => {
      const dossier = relative(join(RACINE, "src/app"), fichier).split(sep).slice(0, -1);
      const exports = (await import(fichier)) as Record<string, unknown>;
      return {
        /* Un groupe de routes, « (nom) », ne compte pas dans l’adresse */
        chemin: `/${dossier.filter((d) => !/^\(.*\)$/.test(d)).join("/")}`,
        fichier: relative(RACINE, fichier),
        source: await readFile(fichier, "utf8"),
        methodes: METHODES.filter((m) => typeof exports[m] === "function"),
      };
    }),
  );
}, 60_000);

const cles = () => routes.flatMap((r) => r.methodes.map((m) => `${m} ${r.chemin}`));
const lignes = Object.keys(ROUTES) as CleRoute[];
const routeDe = (cle: string) => routes.find((r) => r.chemin === cle.slice(cle.indexOf(" ") + 1))!;

/* Les routes qui répondent un audio ou une image : pas de repondre. Le compilateur vérifie que la liste est complète */
const BINAIRES = ["POST /api/partage/image", "GET /api/vocal/audio", "GET /api/vocal/chat/[id]"] as const satisfies readonly Exclude<CleRoute, CleJson>[];

describe("la table des routes", () => {
  it("a une ligne par méthode exportée de chaque route de src/app/api, et rien d’autre", () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(cles().sort()).toEqual([...lignes].sort());
  });

  it("chaque route répond sous sa propre ligne : son adresse, et une méthode qu’elle exporte", () => {
    for (const r of routes) {
      for (const [, methode, chemin] of r.source.matchAll(/repondre\(\s*"([A-Z]+) ([^"]+)"/g)) {
        expect({ fichier: r.fichier, chemin, exportee: r.methodes.includes(methode!) }).toEqual({ fichier: r.fichier, chemin: r.chemin, exportee: true });
      }
    }
  });

  it("chaque ligne qui répond du JSON y passe par repondre, les autres répondent un audio ou une image", () => {
    expectTypeOf<Exclude<Exclude<CleRoute, CleJson>, (typeof BINAIRES)[number]>>().toBeNever();
    for (const cle of lignes) {
      const { source, fichier } = routeDe(cle);
      expect({ cle, fichier, repond: source.includes(`repondre("${cle}"`) }).toEqual({ cle, fichier, repond: !(BINAIRES as readonly string[]).includes(cle) });
    }
  });

  it("une route lit son corps JSON par son schéma (lireCorps), son formulaire si sa ligne en reçoit un, jamais req.json() à la main", () => {
    for (const r of routes) {
      const entrees = r.methodes.map((m) => ROUTES[`${m} ${r.chemin}` as CleRoute] as { corps?: unknown; formulaire?: true });
      const verdict = { json: r.source.includes("lireCorps("), formulaire: r.source.includes(".formData()"), aLaMain: /\breq\.json\(/.test(r.source) };
      expect({ fichier: r.fichier, ...verdict }).toEqual({ fichier: r.fichier, json: entrees.some((e) => e.corps), formulaire: entrees.some((e) => e.formulaire), aLaMain: false });
    }
  });

  it("une route lit le corps de sa ligne par le schéma de cette ligne, ou par une constante qui l’étend (.extend), jamais par un autre", () => {
    for (const r of routes) {
      /* Les schémas tirés d’une ligne dans le fichier : `const Corps = ROUTES["…"].corps.extend(…)` */
      const etendus = new Map([...r.source.matchAll(/const\s+(\w+)\s*=\s*ROUTES\["([^"]+)"\]\.corps\s*\.extend\(/g)].map(([, nom, cle]) => [nom, cle]));
      /* La ligne de chaque schéma passé à lireCorps ; un schéma d’ailleurs garde son texte, entre parenthèses */
      const lues = [...r.source.matchAll(/lireCorps\(\s*\w+\s*,\s*([^)]*?)\s*\)/g)]
        .map((m) => m[1]!)
        .map((schema) => /^ROUTES\["([^"]+)"\]\.corps$/.exec(schema)?.[1] ?? etendus.get(schema) ?? `(${schema})`);
      const attendues = r.methodes.map((m) => `${m} ${r.chemin}`).filter((cle) => (ROUTES[cle as CleRoute] as { corps?: unknown }).corps);
      expect({ fichier: r.fichier, lues: [...new Set(lues)].sort() }).toEqual({ fichier: r.fichier, lues: attendues.sort() });
    }
  });

  it("le navigateur n’appelle par sa clé qu’une route sans segment à remplir : « /api/vocal/chat/[id] » n’est pas une adresse", () => {
    expectTypeOf<Exclude<CleRoute, CleFixe>>().toEqualTypeOf<"GET /api/vocal/chat/[id]" | "GET /api/paiement/[achat]">();
    // @ts-expect-error : une clé à segment dynamique
    const dynamique: CleFixe = "GET /api/vocal/chat/[id]";
    expect(dynamique).toBeDefined();
  });

  it("le corps de chaque ligne est un schéma qui refuse ce qui n’est pas un objet", () => {
    for (const cle of lignes) {
      const { corps } = ROUTES[cle] as { corps?: { safeParse: (v: unknown) => { success: boolean } } };
      if (!corps) continue;
      for (const mauvais of [null, "texte", 3, []]) expect({ cle, mauvais, lu: corps.safeParse(mauvais).success }).toEqual({ cle, mauvais, lu: false });
    }
  });
});

describe("« Qui es-tu ? » (POST /api/analyse)", () => {
  const qui = { me: "p1", pronom: "elle", guess: "vus", goal: "comprendre", prenom: " Léa " } satisfies Routes["POST /api/analyse"]["corps"];

  it("toi est l’un des deux participants, p0 ou p1 ; un corps vide est une relance", () => {
    expectTypeOf<Moi>().toEqualTypeOf<"p0" | "p1">();
    const schema = ROUTES["POST /api/analyse"].corps;
    expect(schema.safeParse(qui).data).toEqual({ ...qui, prenom: "Léa" });
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ ...qui, me: "p2" }).success).toBe(false);
    expect(schema.safeParse({ ...qui, me: "Léa" }).success).toBe(false);
    /* Ni « Qui es-tu ? » complet, ni vide : refusé (la route le prend pour une relance) */
    expect(schema.safeParse({ me: "p0" }).success).toBe(false);
  });

  it("le compilateur refuse au navigateur ce que la route refuserait", () => {
    // @ts-expect-error : ni p0 ni p1
    const autre: Routes["POST /api/analyse"]["corps"] = { ...qui, me: "p2" };
    // @ts-expect-error : un champ que la route ne connaît pas
    const inconnu: Routes["POST /api/analyse"]["corps"] = { relance: true };
    // @ts-expect-error : un message au chat sans texte
    const vide: Routes["POST /api/chat"]["corps"] = {};
    // @ts-expect-error : une route sans corps n’en reçoit pas
    const rien: Routes["GET /api/analyse"]["corps"] = {};
    // @ts-expect-error : la question du rapport se marque, elle ne se démarque pas
    const demarquee: Routes["POST /api/chat"]["corps"] = { texte: "…", question: false };
    expect([autre, inconnu, vide, rien, demarquee]).toHaveLength(5);
    expectTypeOf<Routes["POST /api/chat"]["corps"]>().toEqualTypeOf<{ texte: string; question?: true | undefined; cle?: string | undefined } | FormData>();
    expectTypeOf<Routes["POST /api/chat/vocal"]["reponse"]>().toEqualTypeOf<{ modeVocal: boolean }>();
  });
});

/* Hors du serveur, le contrat ne s’importe qu’en `import type` : une règle d’ESLint (CONTRAT, eslint.config.mjs), essayée dans tests/lint.test.ts */

describe("le navigateur appelle les routes par le contrat", () => {
  /* Le seul appel qui passe encore à côté, par un fetch direct : le réveil de la base, une balise dont la réponse n’est pas lue */
  const A_COTE = ["src/components/shell/Reveil.tsx"];

  it("hors du serveur, seule la couche de service (src/services/api.ts) passe une adresse /api/ à fetch", async () => {
    const appelants: string[] = [];
    for (const f of (await fichiers(join(RACINE, "src"))).filter((f) => /\.tsx?$/.test(f))) {
      const chemin = relative(RACINE, f).split(sep).join("/");
      if (chemin.startsWith("src/server/") || chemin.startsWith("src/app/api/") || chemin === "src/services/api.ts") continue;
      if (/\b(?:fetch|sendBeacon)\(\s*["'`]\/api\//.test(await readFile(f, "utf8"))) appelants.push(chemin);
    }
    expect(appelants.sort()).toEqual([...A_COTE].sort());
  });
});

describe("la tendance du verdict (sensDeTendance)", () => {
  it("se lit sur sa flèche, pas sur son texte", () => {
    expect(sensDeTendance("↗ ça se réchauffe")).toBe("monte");
    expect(sensDeTendance("↘ depuis le 2 mars")).toBe("baisse");
    expect(sensDeTendance("→")).toBe("stable");
    expect(sensDeTendance(" ↗ avec une espace devant")).toBe("monte");
  });

  it("sans flèche, pas de sens", () => {
    for (const t of ["", "ça se réchauffe", "↑ une autre flèche"]) expect(sensDeTendance(t)).toBeNull();
  });
});
