import { inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { alerter } from "@/server/alertes";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { LIMITES } from "@/server/limites";

/*
 * Le budget des alertes à l’équipe (S-19, src/server/alertes.ts) : 5 par sujet et par jour, 30 en tout, dont les 10
 * dernières gardées pour les importantes. En local (sans RESEND_API_KEY), une alerte qui part s’écrit dans la console
 * (console.log) ; une alerte retenue laisse une ligne au journal (console.warn). Les compteurs du jour de ces sujets sont
 * remis à zéro avant chaque test : les fichiers déjà passés en ont compté.
 */
const SUJETS = ["sujet bruyant", "ordinaire 1", "ordinaire 2", "ordinaire 3", "ordinaire 4", "rapport_chapitres en échec"];
const cles = () => ["alertes", ...SUJETS.map((s) => `alertes:sujet:${s}`)].map((c) => empreinte(`limite:${c}`));

let parties: string[] = [];
let retenues: string[] = [];
beforeEach(async () => {
  await db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, cles()));
  parties = [];
  retenues = [];
  vi.spyOn(console, "log").mockImplementation((l: unknown) => void parties.push(String(l)));
  vi.spyOn(console, "warn").mockImplementation((l: unknown) => void retenues.push(String(l)));
});

const envoyees = (sujet: string) => parties.filter((l) => l.includes(`BLUSH · ${sujet}\n`)).length;

describe("le budget des alertes", () => {
  it("5 par sujet et par jour : la sixième est retenue, et le journal le dit", async () => {
    for (let i = 0; i < 6; i++) await alerter("sujet bruyant", ["Tâche t1"]);
    expect(envoyees("sujet bruyant")).toBe(LIMITES.alertesParSujet.max);
    expect(retenues.map((l) => JSON.parse(l) as Record<string, unknown>)).toEqual([expect.objectContaining({ evenement: "alerte retenue", sujet: "sujet bruyant" })]);
  });

  it("les ordinaires s’arrêtent avant la réserve ; une importante (l’échec d’un rapport) part encore", async () => {
    const { max, reserveImportantes } = LIMITES.alertesParJour;
    /* 20 ordinaires, sur quatre sujets (5 chacun) : la part des ordinaires est pleine */
    for (const sujet of SUJETS.slice(0, 4)) for (let i = 0; i < 5; i++) await alerter(sujet, ["Tâche t1"]);
    expect(parties).toHaveLength(max - reserveImportantes);
    await alerter("ordinaire 4", ["Tâche t1"]);
    expect(envoyees("ordinaire 4")).toBe(0);
    await alerter("rapport_chapitres en échec", ["Tâche t2"], { importante: true });
    expect(envoyees("rapport_chapitres en échec")).toBe(1);
  });
});
