import { describe, expect, it, vi } from "vitest";

/*
 * La note du rapport (POST /api/rapport/note, src/server/note-du-rapport.ts) : comptée une fois par conv, seulement sur
 * un rapport débloqué, et lue par le pilotage d’/admin. Le compte se connecte comme le ferait le navigateur, ses cookies
 * simulés.
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

import { POST as postNote } from "@/app/api/rapport/note/route";
import { nomDuCookie } from "@/lib/noms-cookies";
import { ouvrirSession } from "@/server/auth";
import { statsAdmin } from "@/server/stats";
import { compteDeTest, convRattachee, debloquerLaConv } from "./aide/fixtures";

const noter = (corps: unknown) =>
  postNote(
    new Request("http://localhost/api/rapport/note", {
      method: "POST",
      headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "x-forwarded-for": "10.71.3.9", "content-type": "application/json" },
      body: JSON.stringify(corps),
    }),
  );

/** Un compte connecté (sa session dans les cookies simulés) avec une conv, débloquée ou non. */
async function connecteAvecUneConv(prefixe: string, debloquee: boolean): Promise<string> {
  const u = await compteDeTest(prefixe);
  const conv = await convRattachee(u, "01-a-deux-doigts.txt");
  if (debloquee) await debloquerLaConv(conv.id);
  etat.cookies.clear();
  etat.cookies.set(nomDuCookie("session", false), (await ouvrirSession(u.id)).secret);
  return conv.id;
}

describe("la note du rapport (POST /api/rapport/note)", () => {
  it("la note, la raison et l’avis comptent une fois par conv, et le pilotage les lit", async () => {
    const avant = (await statsAdmin(1)).pilotage.note;
    await connecteAvecUneConv("note-une-fois", true);
    expect(await (await noter({ note: "bof" })).json()).toEqual({ ok: true });
    /* Changée après coup, ou envoyée d’un autre onglet : la première reste */
    await noter({ note: "oui" });
    await noter({ raison: "a_cote" });
    await noter({ raison: "dur" });
    expect((await noter({ avis: { prenom: "Inès", phrase: "Enfin compris." } })).status).toBe(200);
    await noter({ avis: { prenom: "Inès", phrase: "Encore une fois." } });
    const apres = (await statsAdmin(1)).pilotage.note;
    expect({ oui: apres.oui - avant.oui, bof: apres.bof - avant.bof, avis: apres.avis - avant.avis }).toEqual({ oui: 0, bof: 1, avis: 1 });
    const raison = (p: typeof avant, r: string) => p.raisons.find((x) => x.raison === r)?.n ?? 0;
    expect(raison(apres, "a_cote") - raison(avant, "a_cote")).toBe(1);
    expect(raison(apres, "dur") - raison(avant, "dur")).toBe(0);
  });

  it("un rapport pas débloqué ne se note pas (402 « acces »), et un corps inconnu est refusé", async () => {
    const avant = (await statsAdmin(1)).pilotage.note;
    await connecteAvecUneConv("note-verrou", false);
    const r = await noter({ note: "oui" });
    expect([r.status, await r.json()]).toEqual([402, { erreur: "acces" }]);
    expect((await noter({ note: "bof", raison: "dur" })).status).toBe(422);
    expect((await noter({ avis: { prenom: "", phrase: "x" } })).status).toBe(422);
    expect((await statsAdmin(1)).pilotage.note.oui).toBe(avant.oui);
  });
});
