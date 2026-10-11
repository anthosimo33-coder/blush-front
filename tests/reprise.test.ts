import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Un envoi de captures coupé par le réseau (Safari en arrière-plan, le Wi-Fi qui passe en 4G) : le navigateur réessaie
 * avec la même clé, et le serveur rend la lecture déjà faite, sans rappeler le modèle. Les cookies sont simulés.
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

import { POST as postCaptures } from "@/app/api/captures/route";
import { POST as postVideo } from "@/app/api/captures/video/route";
import { ouvrirSession } from "@/server/auth";
import { db, schema } from "@/server/db";
import { fournisseurFactice } from "@/server/ia/factice";
import { lotVideo } from "./aide/fabriques";
import { compteDeTest, facticePourChaqueTest } from "./aide/fixtures";

const n = Date.now();
let ip = 0;
const requete = (chemin: string, init: RequestInit) =>
  new Request(`http://localhost${chemin}`, {
    ...init,
    headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": `11.${n % 250}.${(n >> 8) % 250}.${++ip}`, ...init.headers },
  });
/* Les appels au modèle (factice) pendant les tests : une lecture reprise n’en refait pas */
const appelsAuModele: unknown[] = [];
facticePourChaqueTest((req) => (appelsAuModele.push(req), fournisseurFactice(req)));
const sessions: string[] = [];
const histoires: string[] = [];

beforeAll(async () => {
  for (const prefixe of ["reprise-a", "reprise-b"]) sessions.push((await ouvrirSession((await compteDeTest(prefixe)).id)).secret);
});
/* Les brouillons de ces envois, restés sans compte (leurs comptes partent à la fin du fichier, avec ce qui leur est rattaché) */
afterAll(async () => {
  if (histoires.length) await db().delete(schema.stories).where(inArray(schema.stories.id, histoires));
});

const captures = (cle?: string) => {
  const fd = new FormData();
  fd.append("captures", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "c.png", { type: "image/png" }));
  fd.append("app", "instagram");
  if (cle) fd.append("cle", cle);
  return requete("/api/captures", { method: "POST", body: fd });
};
const lue = async (r: Response) => {
  expect(r.status).toBe(200);
  const corps = (await r.json()) as { story: { id: string }; messagesRead: number };
  histoires.push(corps.story.id);
  return corps;
};

describe("un envoi de captures repris après une coupure", () => {
  it("le même envoi, renvoyé : la lecture déjà faite revient, et le cookie du brouillon est reposé", async () => {
    etat.cookies.clear();
    etat.cookies.set("blush-session", sessions[0]!);
    const cle = crypto.randomUUID();
    const avant = appelsAuModele.length;
    const premier = await lue(await postCaptures(captures(cle)));
    expect(appelsAuModele.length).toBe(avant + 1);
    const brouillon = etat.cookies.get("blush-brouillon");
    expect(brouillon).toBeTruthy();
    /* La réponse s’est perdue : le cookie n’est jamais arrivé */
    etat.cookies.delete("blush-brouillon");
    const second = await lue(await postCaptures(captures(cle)));
    expect(appelsAuModele.length).toBe(avant + 1);
    expect(second.story.id).toBe(premier.story.id);
    expect(second.messagesRead).toBeGreaterThan(0);
    expect(etat.cookies.get("blush-brouillon")).toBe(brouillon);
  });

  it("deux essais en même temps : une seule lecture", async () => {
    etat.cookies.set("blush-session", sessions[0]!);
    const cle = crypto.randomUUID();
    const avant = appelsAuModele.length;
    const [a, b] = await Promise.all([postCaptures(captures(cle)), postCaptures(captures(cle))]);
    const [x, y] = [await lue(a), await lue(b)];
    expect(x.story.id).toBe(y.story.id);
    expect(appelsAuModele.length).toBe(avant + 1);
  });

  it("la clé d’un autre compte ne rend pas sa lecture ; sans clé, chaque envoi est lu", async () => {
    const cle = crypto.randomUUID();
    etat.cookies.set("blush-session", sessions[0]!);
    const a = await lue(await postCaptures(captures(cle)));
    etat.cookies.set("blush-session", sessions[1]!);
    const b = await lue(await postCaptures(captures(cle)));
    expect(b.story.id).not.toBe(a.story.id);
    const avant = appelsAuModele.length;
    const c = await lue(await postCaptures(captures()));
    const d = await lue(await postCaptures(captures()));
    expect(c.story.id).not.toBe(d.story.id);
    expect(appelsAuModele.length).toBe(avant + 2);
  });

  it("l’enregistrement d’écran : le dernier envoi renvoyé retrouve la même histoire", async () => {
    etat.cookies.set("blush-session", sessions[0]!);
    const lot = (k0: number) => lotVideo("Léa", k0);
    const corps = JSON.stringify({ app: "imessage", lots: [lot(0), lot(100)], cle: crypto.randomUUID() });
    const envoi = () => postVideo(requete("/api/captures/video", { method: "POST", headers: { "content-type": "application/json" }, body: corps }));
    const a = await lue(await envoi());
    const b = await lue(await envoi());
    expect(b.story.id).toBe(a.story.id);
    const [ligne] = await db().select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.id, a.story.id));
    expect(ligne).toBeTruthy();
    /* Des lots de six : un long enregistrement en compte plus de vingt, toujours acceptés */
    const long = await postVideo(
      requete("/api/captures/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app: "imessage", lots: Array.from({ length: 24 }, (_, k) => lot(k * 100)) }),
      }),
    );
    await lue(long);
  });
});
