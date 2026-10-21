import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { versTexteCaptures } from "@prompts/lib/captures";

/*
 * Le pronom de l’autre, de l’import à sa fiche : lu dans les accords de la conv (src/server/accords.ts), puis corrigé
 * sur sa fiche (PUT /api/fiche/pronom). Des convs inventées (deux filles), et une conv des évals pour la fiche ; les
 * routes sont appelées comme le ferait le navigateur, cookies simulés.
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

import { GET } from "@/app/api/fiche/route";
import { PUT } from "@/app/api/fiche/pronom/route";
import { ouvrirSession } from "@/server/auth";
import { storyAffichee } from "@/server/conv-affichee";
import { db, schema } from "@/server/db";
import { histoireDe, importer, importerCaptures, metaDe } from "@/server/histoires";
import type { Fiche } from "@/types";
import { captures, msg } from "./aide/fabriques";
import { accordDeTest, compteDeTest, convPrete, histoireLue, ligneEnBase } from "./aide/fixtures";

const lancerApres = async () => {
  while (etat.apres.length) await etat.apres.shift()!();
};

/* Léa et Inès, inventées : elles se disent au féminin, puis des messages sans accord jusqu’au minimum d’un export */
const LEA = "Léa Martin";
const INES = "Inès";
const ECHANGES: [string, string][] = [
  [LEA, "coucou ma belle"],
  [INES, "coucouuu"],
  [INES, "je suis rentrée du taff, je suis crevée"],
  [LEA, "t’es prête pour samedi ?"],
  [INES, "désolée j’ai pas répondu hier"],
  [LEA, "je suis trop contente qu’on y aille"],
  [INES, "je me suis endormie direct"],
  [INES, "t’es rentrée ?"],
  [LEA, "je suis sortie avec les filles"],
  [LEA, "je suis arrivée à l’instant"],
  ...Array.from({ length: 50 }, (_, k): [string, string] => [k % 2 ? LEA : INES, `message ${k + 1}`]),
];
const p2 = (n: number) => String(n).padStart(2, "0");
/** Un export WhatsApp (iPhone) de ces échanges, un message toutes les 7 minutes. */
const exportDe = (echanges: [string, string][]) =>
  echanges
    .map(([qui, texte], k) => {
      const d = new Date(Date.UTC(2026, 9, 1, 18, 0) + k * 7 * 60e3);
      return `[${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00] ${qui}: ${texte}`;
    })
    .join("\n");

describe("le pronom lu à l’import", () => {
  it("un export entre deux filles : chacune est lue « elle », et l’autre reste « elle » une fois « Qui es-tu ? » rempli", async () => {
    const u = await compteDeTest("pronom-export");
    const imp = await importer({ nom: "WhatsApp Chat.txt", appli: "whatsapp", texte: exportDe(ECHANGES) }, accordDeTest());
    expect(imp.meta.participants.map((p) => [p.prenom, p.pronomLu])).toEqual(
      expect.arrayContaining([
        ["Léa", "elle"],
        ["Inès", "elle"],
      ]),
    );
    await convPrete(u, imp, { moi: "Léa", pronom: "elle" });
    const meta = metaDe(await ligneEnBase(imp.id));
    expect(histoireDe(meta).autre).toMatchObject({ prenom: "Inès", pronom: "elle" });
    expect(storyAffichee(imp.id, meta).participants.map((p) => p.pronoun)).toEqual(["elle", "elle"]);
  });

  it("des captures entre deux filles : « Moi » et l’autre sont lues « elle »", async () => {
    const lignes = [
      msg("moi", "je suis trop contente"),
      msg("autre", "je suis rentrée"),
      msg("moi", "t’es prête ?"),
      msg("autre", "désolée j’étais au sport"),
      msg("moi", "je suis crevée"),
      msg("autre", "t’es arrivée ?"),
      msg("autre", "je suis prête"),
      ...Array.from({ length: 20 }, (_, k) => msg(k % 2 ? "moi" : "autre", `message ${k + 1}`)),
    ];
    const t = versTexteCaptures(captures({ appli: "instagram", autre: "Chloé", blocs: [{ repere: { date: "2026-10-08", heure: "21:00" }, messages: lignes }] }), {
      aujourdhui: "2026-10-13",
    });
    const { id, meta } = await importerCaptures({ appli: "instagram", t, consentement: accordDeTest() });
    try {
      expect(meta.participants.map((p) => [p.prenom, p.pronomLu])).toEqual([
        ["Moi", "elle"],
        ["Chloé", "elle"],
      ]);
    } finally {
      await db().delete(schema.stories).where(eq(schema.stories.id, id));
    }
  });
});

describe("le pronom corrigé sur sa fiche (PUT /api/fiche/pronom)", () => {
  let id = "";
  const changer = (corps: unknown) =>
    PUT(
      new Request("http://localhost/api/fiche/pronom", {
        method: "PUT",
        headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "content-type": "application/json" },
        body: JSON.stringify(corps),
      }),
    );
  const lire = async () => (await (await GET()).json()) as Fiche;

  beforeAll(async () => {
    const u = await compteDeTest("pronom-fiche", "debloque");
    id = (await histoireLue(u, "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id;
    await lancerApres();
    etat.cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
  });

  it("passe devant l’opposé du tien : sa fiche, l’histoire des prompts et les écrans le suivent", async () => {
    expect((await lire()).person.pronoun).toBe("elle");
    const r = await changer({ pronom: "il" });
    expect(r.status).toBe(200);
    expect(((await r.json()) as Fiche).person.pronoun).toBe("il");
    expect((await lire()).person.pronoun).toBe("il");
    const meta = metaDe(await ligneEnBase(id));
    expect(histoireDe(meta).autre).toMatchObject({ prenom: "Sophie", pronom: "il" });
    expect(histoireDe(meta).utilisateur.pronom).toBe("il");
    expect(storyAffichee(id, meta).participants.find((p) => p.name === "Sophie")?.pronoun).toBe("il");
    /* Et revient */
    expect((await changer({ pronom: "elle" })).status).toBe(200);
    expect(histoireDe(metaDe(await ligneEnBase(id))).autre.pronom).toBe("elle");
  });

  it("refuse un autre pronom que « il » ou « elle »", async () => {
    const r = await changer({ pronom: "iel" });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ erreur: "invalide" });
    expect((await lire()).person.pronoun).toBe("elle");
  });
});
