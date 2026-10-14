import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Le budget d’octets des imports (S-02, octetsDansLeBudget de src/server/requete.ts) : la taille du fichier reçu,
 * comptée en Ko avant de le lire, par adresse IP (24 h) et pour tous (le jour de Paris, seulement les imports devenus
 * brouillons). La route est appelée comme le ferait le
 * navigateur (ses cookies simulés), et les alertes de l’équipe relevées au lieu de partir. Les compteurs sont posés près
 * de leur plafond plutôt que remplis à coups d’imports, puis effacés : ceux de tous avant chaque test (les fichiers
 * déjà passés ont importé), et tous à la fin.
 */
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
const alertes = vi.hoisted(() => [] as { sujet: string; importante: boolean }[]);
vi.mock("@/server/alertes", async (original) => ({
  ...(await original<typeof import("@/server/alertes")>()),
  alerter: async (sujet: string, _lignes: string[], o?: { importante?: boolean }) => void alertes.push({ sujet, importante: !!o?.importante }),
}));

import { CASE_IMPORT } from "@/contenu/consentements";
import { POST as postImport } from "@/app/api/import/route";
import { POST as postVideo } from "@/app/api/captures/video/route";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { compteDe, LIMITES } from "@/server/limites";
import { aujourdhuiParis } from "@/server/temps";
import { lotVideo } from "./aide/fabriques";
import { convDeTest } from "./aide/fichiers";
import { creees } from "./aide/nettoyage";

const n = Date.now();
let k = 0;
/** Une adresse IP à soi, à chaque appel : les comptes d’un test ne se mélangent pas à ceux d’un autre. */
const nouvelleIp = () => `10.${(n >> 16) % 250}.${(n >> 8) % 250}.${++k}`;
const CONV = "01-a-deux-doigts.txt";
/** Les Ko que compte l’import de CONV (arrondis au-dessus). */
const KO = Math.ceil(convDeTest(CONV).size / 1024);

const JOUR = aujourdhuiParis().iso;
const TOUS = `brouillons:ko:${JOUR}`;
/* La veille : ses alertes ne retiennent pas celles du jour */
const HIER = `brouillons:ko:${aujourdhuiParis(new Date(Date.now() - 86400e3)).iso}`;
const cles = new Set([TOUS, `${TOUS}:alerte:0.8`, `${TOUS}:alerte:1`, `${HIER}:alerte:1`]);
const empreintes = () => [...cles].map((c) => empreinte(`limite:${c}`));

/** Le compte d’une limite, posé à `count` pour une fenêtre qui commence maintenant. */
async function poser(cle: string, count: number): Promise<void> {
  cles.add(cle);
  const fenetre = { windowStart: new Date(), expiresAt: new Date(Date.now() + 86400e3), count };
  await db()
    .insert(schema.rateLimits)
    .values({ key: empreinte(`limite:${cle}`), ...fenetre })
    .onConflictDoUpdate({ target: schema.rateLimits.key, set: fenetre });
}

/** Un import de `fichier` (CONV) depuis cette adresse : le code d’erreur, ou null s’il est passé (son brouillon est effacé à la fin). */
async function importer(ip: string, fichier = convDeTest(CONV)): Promise<string | null> {
  cles.add(`import:ip:${ip}`).add(`import:ko:ip:${ip}`);
  const fd = new FormData();
  fd.append("fichier", fichier);
  fd.append("consentement", CASE_IMPORT.version);
  const r = await postImport(
    new Request("http://localhost/api/import", { method: "POST", body: fd, headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": ip } }),
  );
  const corps = (await r.json()) as { erreur?: string; story?: { id: string } };
  if (corps.story) creees.histoires.push(corps.story.id);
  return corps.erreur ?? null;
}

/** Un enregistrement d’écran (deux lots) depuis cette adresse : le code d’erreur, ou null s’il est passé. */
async function envoyerVideo(ip: string): Promise<string | null> {
  cles.add(`import:ip:${ip}`).add(`import:ko:ip:${ip}`);
  const r = await postVideo(
    new Request("http://localhost/api/captures/video", {
      method: "POST",
      body: JSON.stringify({ app: "imessage", consentement: CASE_IMPORT.version, lots: [lotVideo("Léa"), lotVideo("Léa", 100)] }),
      headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": ip, "content-type": "application/json" },
    }),
  );
  const corps = (await r.json()) as { erreur?: string; story?: { id: string } };
  if (corps.story) creees.histoires.push(corps.story.id);
  return corps.erreur ?? null;
}

beforeEach(async () => {
  await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, empreintes()));
  alertes.length = 0;
});
afterAll(async () => {
  await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, empreintes()));
});

describe("le budget d’octets des imports (S-02)", () => {
  it("compte la taille du fichier pour l’adresse, et refuse au-delà de son plafond du jour ; une autre adresse importe encore", async () => {
    const ip = nouvelleIp();
    expect(await importer(ip)).toBeNull();
    expect(await compteDe(`import:ko:ip:${ip}`, LIMITES.koImportParIp)).toBe(KO);
    expect(await compteDe(TOUS, LIMITES.koBrouillonsParJour)).toBe(KO);

    /* Juste de quoi passer une fois de plus : le compte arrive pile au plafond */
    await poser(`import:ko:ip:${ip}`, LIMITES.koImportParIp.max - KO);
    expect(await importer(ip)).toBeNull();
    expect(await importer(ip)).toBe("trop_jour");
    expect(await importer(nouvelleIp())).toBeNull();
    expect(alertes).toEqual([]);
  });

  it("un fichier illisible compte pour son adresse (sa lecture coûte), jamais pour tous : il n’entre pas en base", async () => {
    const ip = nouvelleIp();
    const illisible = new File([Uint8Array.from({ length: 3000 }, (_, i) => (i * 7919) % 251)], "conv.zip", { type: "application/zip" });
    expect(await importer(ip, illisible)).toBe("fichier");
    expect(await compteDe(`import:ko:ip:${ip}`, LIMITES.koImportParIp)).toBe(3);
    expect(await compteDe(TOUS, LIMITES.koBrouillonsParJour)).toBe(0);
  });

  it("refuse tout le monde au plafond de tous, sans garder la place du refusé, et prévient l’équipe à 80 % puis au plafond, une fois chacun", async () => {
    const { max, alerteA } = LIMITES.koBrouillonsParJour;
    /* Sous les 80 % d’un Ko : cet import les passe */
    await poser(TOUS, Math.ceil(alerteA * max) - 1);
    expect(await importer(nouvelleIp())).toBeNull();
    expect(alertes).toEqual([{ sujet: "imports : 80 % du plafond du jour", importante: true }]);
    expect(await importer(nouvelleIp())).toBeNull();
    expect(alertes).toHaveLength(1);

    /* À un Ko du plafond : le suivant le passerait, il est refusé ; ni le compte de tous, ni celui de son adresse ne bougent */
    await poser(TOUS, max - 1);
    const ip = nouvelleIp();
    expect(await importer(ip)).toBe("trop_jour");
    expect(await compteDe(TOUS, LIMITES.koBrouillonsParJour)).toBe(max - 1);
    expect(await compteDe(`import:ko:ip:${ip}`, LIMITES.koImportParIp)).toBe(0);
    expect(await importer(nouvelleIp())).toBe("trop_jour");
    expect(alertes.slice(1)).toEqual([{ sujet: "imports : plafond du jour atteint", importante: true }]);
  });

  it("un jour rempli pile au plafond : le premier refusé prévient l’équipe, même si la veille l’a déjà été", async () => {
    await poser(`${HIER}:alerte:1`, 1);
    await poser(TOUS, LIMITES.koBrouillonsParJour.max);
    expect(await importer(nouvelleIp())).toBe("trop_jour");
    expect(alertes).toEqual([{ sujet: "imports : plafond du jour atteint", importante: true }]);
  });

  it("un enregistrement d’écran compte son texte dans le même budget (SEC-1) : il ne contourne plus le plafond de l’adresse ni celui de tous", async () => {
    const ip = nouvelleIp();
    expect(await envoyerVideo(ip)).toBeNull();
    const ko = await compteDe(`import:ko:ip:${ip}`, LIMITES.koImportParIp);
    expect(ko).toBeGreaterThan(0);
    expect(await compteDe(TOUS, LIMITES.koBrouillonsParJour)).toBe(ko);
    /* L’adresse au plafond : refusée, comme un export */
    await poser(`import:ko:ip:${ip}`, LIMITES.koImportParIp.max);
    expect(await envoyerVideo(ip)).toBe("trop_jour");
    /* Tous au plafond : une autre adresse aussi, et l’équipe est prévenue */
    await poser(TOUS, LIMITES.koBrouillonsParJour.max);
    expect(await envoyerVideo(nouvelleIp())).toBe("trop_jour");
    expect(alertes).toEqual([{ sujet: "imports : plafond du jour atteint", importante: true }]);
  });

  it("un envoi sans fichier ne compte rien", async () => {
    const ip = nouvelleIp();
    cles.add(`import:ko:ip:${ip}`);
    const r = await postImport(
      new Request("http://localhost/api/import", {
        method: "POST",
        body: new FormData(),
        headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": ip },
      }),
    );
    expect(await r.json()).toEqual({ erreur: "fichier" });
    const [ligne] = await db()
      .select()
      .from(schema.rateLimits)
      .where(eq(schema.rateLimits.key, empreinte(`limite:import:ko:ip:${ip}`)));
    expect(ligne).toBeUndefined();
  });
});
