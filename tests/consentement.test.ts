import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

/*
 * L’accord de l’import (que le geste du bouton donne, src/contenu/consentements.ts) : chaque route qui reçoit une
 * conv la demande (src/server/juridique.ts). Sans elle, ou avec une version périmée, 422 `consentement`, avant toute
 * limite et avant tout appel au modèle ; avec elle, l’histoire garde l’heure et la version. Les routes sont appelées
 * comme le ferait le navigateur, ses cookies simulés.
 */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
    set: (n: string, v: string) => etat.cookies.set(n, v),
    delete: (n: string | { name: string }) => etat.cookies.delete(typeof n === "string" ? n : n.name),
  }),
  headers: async () => new Headers(),
}));

import { CASE_IMPORT } from "@/contenu/consentements";
import { POST as postCaptures } from "@/app/api/captures/route";
import { POST as postLot } from "@/app/api/captures/lot/route";
import { POST as postVideo } from "@/app/api/captures/video/route";
import { POST as postImport } from "@/app/api/import/route";
import { ouvrirSession } from "@/server/auth";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { fournisseurFactice } from "@/server/ia/factice";
import { lotVideo } from "./aide/fabriques";
import { convDeTest } from "./aide/fichiers";
import { compteDeTest, facticePourChaqueTest } from "./aide/fixtures";
import { creees } from "./aide/nettoyage";

const n = Date.now();
let k = 0;
/** Une adresse IP à soi, à chaque appel : les limites d’un envoi ne se mélangent pas à celles d’un autre. */
const nouvelleIp = () => `12.${n % 250}.${(n >> 8) % 250}.${++k}`;
const requete = (chemin: string, ip: string, init: RequestInit) =>
  new Request(`http://localhost${chemin}`, { ...init, headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": ip, ...init.headers } });

/* Les appels au modèle (factice) : un envoi refusé n’en fait aucun */
const appelsAuModele: unknown[] = [];
facticePourChaqueTest((req) => (appelsAuModele.push(req), fournisseurFactice(req)));
let session = "";
beforeAll(async () => {
  session = (await ouvrirSession((await compteDeTest("consentement")).id)).secret;
});

/** Le compte d’une limite de cette adresse (0 : rien compté). */
async function compteDeLIp(nom: "import" | "lot", ip: string): Promise<number> {
  const [ligne] = await db()
    .select()
    .from(schema.rateLimits)
    .where(eq(schema.rateLimits.key, empreinte(`limite:${nom}:ip:${ip}`)));
  return ligne?.count ?? 0;
}

/** L’accord gardé avec l’histoire que la réponse a créée (son brouillon est effacé à la fin du fichier). */
async function accordGarde(r: Response) {
  expect(r.status).toBe(200);
  const { story } = (await r.json()) as { story: { id: string } };
  creees.histoires.push(story.id);
  const [ligne] = await db().select({ le: schema.stories.consentementLe, version: schema.stories.consentementVersion }).from(schema.stories).where(eq(schema.stories.id, story.id));
  return ligne!;
}

/** L’heure de l’accord gardé est celle de l’envoi. */
const recent = (le: Date | null) => !!le && Math.abs(Date.now() - le.getTime()) < 60_000;

/* Ce que porte un envoi : la case cochée (la version d’aujourd’hui), une version périmée, ou rien */
const CAS = [
  ["sans la case", undefined],
  ["une version périmée", "2020-01-01"],
] as const;

describe("/api/import", () => {
  const importer = (ip: string, consentement?: string) => {
    const fd = new FormData();
    fd.append("fichier", convDeTest("01-a-deux-doigts.txt"));
    if (consentement !== undefined) fd.append("consentement", consentement);
    return postImport(requete("/api/import", ip, { method: "POST", body: fd }));
  };

  it.each(CAS)("%s : 422 consentement, rien n’est lu ni compté", async (_, consentement) => {
    const ip = nouvelleIp();
    const r = await importer(ip, consentement);
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ erreur: "consentement" });
    expect(await compteDeLIp("import", ip)).toBe(0);
  });

  it("avec la case : la conv entre, avec l’heure et la version de l’accord", async () => {
    const accord = await accordGarde(await importer(nouvelleIp(), CASE_IMPORT.version));
    expect(accord.version).toBe(CASE_IMPORT.version);
    expect(recent(accord.le)).toBe(true);
  });
});

describe("/api/captures", () => {
  const envoyer = (ip: string, consentement?: string) => {
    etat.cookies.set("blush-session", session);
    const fd = new FormData();
    fd.append("captures", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "c.png", { type: "image/png" }));
    fd.append("app", "instagram");
    if (consentement !== undefined) fd.append("consentement", consentement);
    return postCaptures(requete("/api/captures", ip, { method: "POST", body: fd }));
  };

  it.each(CAS)("%s : 422 consentement, avant la limite et le modèle", async (_, consentement) => {
    const [ip, avant] = [nouvelleIp(), appelsAuModele.length];
    const r = await envoyer(ip, consentement);
    expect(await r.json()).toEqual({ erreur: "consentement" });
    expect(appelsAuModele.length).toBe(avant);
    expect(await compteDeLIp("import", ip)).toBe(0);
  });

  it("avec la case : lues, et l’accord gardé avec l’histoire", async () => {
    const accord = await accordGarde(await envoyer(nouvelleIp(), CASE_IMPORT.version));
    expect(accord.version).toBe(CASE_IMPORT.version);
    expect(recent(accord.le)).toBe(true);
  });
});

describe("un enregistrement d’écran : /api/captures/lot puis /api/captures/video", () => {
  /* Un écran qu’aucun autre lancement ne recopie : un lot déjà lu reste dix minutes en base (src/server/lots.ts), et ne rappellerait pas le modèle */
  const lot = (ip: string, consentement?: string) => {
    etat.cookies.set("blush-session", session);
    const fd = new FormData();
    fd.append("captures", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47]), crypto.randomUUID()], "e.png", { type: "image/png" }));
    fd.append("app", "imessage");
    if (consentement !== undefined) fd.append("consentement", consentement);
    return postLot(requete("/api/captures/lot", ip, { method: "POST", body: fd }));
  };
  const video = (ip: string, consentement?: string) => {
    etat.cookies.set("blush-session", session);
    const corps = { app: "imessage", lots: [lotVideo("Léa"), lotVideo("Léa", 100)], ...(consentement === undefined ? {} : { consentement }) };
    return postVideo(requete("/api/captures/video", ip, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corps) }));
  };

  it.each(CAS)("%s : chaque lot répond 422 consentement, sans appel au modèle", async (_, consentement) => {
    const [ip, avant] = [nouvelleIp(), appelsAuModele.length];
    const r = await lot(ip, consentement);
    expect(await r.json()).toEqual({ erreur: "consentement" });
    expect(appelsAuModele.length).toBe(avant);
    expect(await compteDeLIp("lot", ip)).toBe(0);
  });

  it.each(CAS)("%s : leur fin répond 422 consentement, et rien n’entre", async (_, consentement) => {
    const ip = nouvelleIp();
    const r = await video(ip, consentement);
    expect(await r.json()).toEqual({ erreur: "consentement" });
    expect(await compteDeLIp("import", ip)).toBe(0);
  });

  it("avec la case : le lot est lu, puis la conv entre avec l’accord", async () => {
    const avant = appelsAuModele.length;
    expect((await lot(nouvelleIp(), CASE_IMPORT.version)).status).toBe(200);
    expect(appelsAuModele.length).toBe(avant + 1);
    const accord = await accordGarde(await video(nouvelleIp(), CASE_IMPORT.version));
    expect(accord.version).toBe(CASE_IMPORT.version);
    expect(recent(accord.le)).toBe(true);
  });
});
