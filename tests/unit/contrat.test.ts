import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import { sensDeTendance } from "@/lib/tendance";
import { ROUTES, type CleJson, type CleRoute, type Moi, type Routes } from "@/types/api";

/*
 * Le contrat HTTP (src/types/api.ts) : chaque route de src/app/api y a sa ligne, et chaque ligne sa route ; chaque route
 * répond sous sa propre ligne (repondre) et lit son corps par son schéma (lireCorps). Le navigateur n’en importe que des
 * types : zod reste au serveur. Ce que le compilateur vérifie (les deux bouts sous le même type) est écrit plus bas, en
 * @ts-expect-error : `npm run check` (tsc) le relit.
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
        expect({ fichier: r.fichier, chemin, exportee: r.methodes.includes(methode) }).toEqual({ fichier: r.fichier, chemin: r.chemin, exportee: true });
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
    expect([autre, inconnu, vide, rien]).toHaveLength(4);
    expectTypeOf<Routes["POST /api/chat"]["corps"]>().toEqualTypeOf<{ texte: string } | FormData>();
    expectTypeOf<Routes["POST /api/chat/vocal"]["reponse"]>().toEqualTypeOf<{ modeVocal: boolean }>();
  });
});

describe("le navigateur n’importe du contrat que des types", () => {
  it("hors du serveur (src/server, les routes /api), src/types/api.ts ne s’importe qu’en `import type` : zod n’entre pas dans les pages", async () => {
    const src = (await fichiers(join(RACINE, "src"))).filter((f) => /\.tsx?$/.test(f));
    const contrat = join(RACINE, "src/types/api");
    /* Le contrat, par l’alias ou en chemin relatif */
    const designeLeContrat = (f: string, chemin: string) => chemin === "@/types/api" || (chemin.startsWith(".") && resolve(dirname(f), chemin) === contrat);
    const fautifs: string[] = [];
    for (const f of src) {
      const chemin = relative(RACINE, f).split(sep).join("/");
      if (chemin.startsWith("src/server/") || chemin.startsWith("src/app/api/") || chemin === "src/types/api.ts") continue;
      const source = await readFile(f, "utf8");
      for (const [instruction, type, noms, vers] of source.matchAll(/(?:import|export)\s+(type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+["']([^"']+)["']/g)) {
        if (!designeLeContrat(f, vers)) continue;
        /* `import { type A, type B }` ne laisse rien non plus */
        const queDesTypes = !!type || (noms.startsWith("{") && noms.slice(1, -1).split(",").every((n) => !n.trim() || n.trim().startsWith("type ")));
        if (!queDesTypes) fautifs.push(`${chemin} : ${instruction}`);
      }
      /* Un import() dynamique, ou un import sans nom (pour ses effets) : du code aussi */
      for (const [instruction, dynamique, nu] of source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g)) {
        if (designeLeContrat(f, dynamique ?? nu)) fautifs.push(`${chemin} : ${instruction}`);
      }
    }
    expect(fautifs).toEqual([]);
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
