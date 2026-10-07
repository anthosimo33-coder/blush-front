import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executerChaine, type DonneesMemoire, type DonneesRapport } from "@/server/analyse";
import { dechiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { definirQui, ErreurImport, importer, metaDe, rattacherBrouillon, storyAffichee } from "@/server/histoires";
import { definirFactice } from "@/server/ia/claude";
import { planifier } from "@/server/taches";
import { fournisseurFactice } from "@/server/ia/factice";

const conv = (f: string) => new File([readFileSync(`prompts/evals/convs/${f}`)], f, { type: "text/plain" });
const email = `test-${Date.now()}@blush.test`;

beforeAll(() => definirFactice(fournisseurFactice));
afterAll(async () => {
  await db().delete(schema.users).where(eq(schema.users.email, email));
  definirFactice(null);
});

describe("import", () => {
  it("refuse une conv de groupe et une conv trop courte", async () => {
    await expect(importer(conv("90-groupe.txt"))).rejects.toMatchObject({ code: "groupe" } satisfies Partial<ErreurImport>);
    await expect(importer(conv("91-trop-courte.txt"))).rejects.toMatchObject({ code: "courte" });
  });
});

describe("de l’import à la mémoire", () => {
  it("enchaîne verdict, plan, chapitres et mémoire, puis efface la conv", async () => {
    const { id, meta, secret } = await importer(conv("01-a-deux-doigts.txt"));
    expect(meta.participants).toHaveLength(2);
    expect(storyAffichee(id, meta).totalMessages).toBeGreaterThan(50);
    /* La conv est chiffrée en base */
    const [brute] = await db().select().from(schema.stories).where(eq(schema.stories.id, id));
    expect(brute.conv!.toString("utf8")).not.toContain(meta.participants[0].nom);

    const [u] = await db().insert(schema.users).values({ email, plan: "blushplus" }).returning();
    await rattacherBrouillon(u, secret);
    const moi = meta.participants.findIndex((p) => p.prenom === "Hugo") as 0 | 1;
    await definirQui(id, { moi, pronom: "il", devinette: "vus", objectif: "ensemble" });
    await planifier(id, "verdict");
    await executerChaine(id);

    const taches = await db().select().from(schema.tasks).where(eq(schema.tasks.storyId, id));
    expect(taches.map((t) => [t.kind, t.status])).toEqual([
      ["verdict", "fini"],
      ["rapport_plan", "fini"],
      ["rapport_chapitres", "fini"],
      ["memoire", "fini"],
    ]);
    const [r] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, id));
    const rapport = dechiffrer<DonneesRapport>(r.data!);
    expect(rapport.chapitres).toHaveLength(8);
    expect(rapport.chapitres[0].title).toBe("Le verdict");
    expect(rapport.chapitres[0].blocks.some((b) => b.kind === "scores")).toBe(true);
    /* Les preuves deviennent des messages datés */
    const recit = rapport.chapitres[1].blocks.find((b) => b.kind === "story");
    expect(recit && "messages" in recit && recit.messages?.[0]?.caption).toMatch(/· \d{2}\/\d{2}/);

    const [m] = await db().select().from(schema.memories).where(eq(schema.memories.storyId, id));
    const memoire = dechiffrer<DonneesMemoire>(m.data);
    expect(memoire.etat.questions).toHaveLength(4);
    expect(memoire.lignes.length).toBeGreaterThan(0);

    const [fin] = await db().select().from(schema.stories).where(eq(schema.stories.id, id));
    expect(fin.conv).toBeNull();
    expect(fin.convPurgedAt).not.toBeNull();
    expect(metaDe(fin).moi).toBe(moi);
  });
});
