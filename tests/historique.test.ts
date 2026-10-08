import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { historique } from "@/server/chat";
import { chiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { depuisFichier, importer, rattacherBrouillon } from "@/server/histoires";

describe("l’historique du chat avec BLUSH", () => {
  const email = `historique-${Date.now()}@blush.test`;
  let id = "";
  beforeAll(async () => {
    const imp = await importer(await depuisFichier(new File([readFileSync("prompts/evals/convs/01-a-deux-doigts.txt")], "01.txt", { type: "text/plain" })));
    id = imp.id;
    const [u] = await db().insert(schema.users).values({ email }).returning();
    await rattacherBrouillon(u, imp.secret);
    /* 50 échanges, gardés comme le fait le chat : ton message, puis la réponse de BLUSH */
    for (let k = 1; k <= 50; k++)
      await db()
        .insert(schema.chatMessages)
        .values([
          { storyId: id, role: "toi", data: chiffrer({ texte: `question ${k}` }) },
          { storyId: id, role: "blush", data: chiffrer({ reponse: { kind: "bubbles", bubbles: [{ text: `réponse ${k}` }] }, resume: `réponse ${k}` }) },
        ]);
  });
  afterAll(async () => {
    await db().delete(schema.users).where(eq(schema.users.email, email));
  });

  it("donne les derniers échanges, et dit qu’il en reste de plus anciens", async () => {
    const h = await historique(id);
    expect(h.echanges).toHaveLength(20);
    expect(h.echanges.at(-1)?.mine).toBe("question 50");
    expect(h.plus).toBe(true);
  });

  it("rend tout l’historique, morceau par morceau, dans l’ordre et sans doublon (même quand un morceau coupe un échange)", async () => {
    for (const limite of [40, 7]) {
      const vus: string[] = [];
      let h = await historique(id, { limite });
      let curseur = h.echanges[0].id;
      vus.unshift(...h.echanges.map((e) => e.mine));
      while (h.plus) {
        h = await historique(id, { avant: curseur, limite });
        if (h.echanges.length) curseur = h.echanges[0].id;
        vus.unshift(...h.echanges.map((e) => e.mine));
      }
      expect(vus).toEqual(Array.from({ length: 50 }, (_, k) => `question ${k + 1}`));
    }
  });
});
