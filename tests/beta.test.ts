import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { inscrire, lienRetrait, retirer } from "@/server/attente";
import { prendreCode, verifierCode } from "@/server/auth";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { mailAttente } from "@/server/mail-attente";

const email = `curieux-${Date.now()}@exemple.fr`;
const hash = empreinte(`attente:${email}`);
afterAll(async () => {
  await db().delete(schema.waitlist).where(eq(schema.waitlist.emailHash, hash));
});

describe("la bêta fermée, sans dire qui est invité", () => {
  it("un email sans code (hors de la bêta, il n’en reçoit jamais) : la vérification répond comme un mauvais code, sans créer de compte", async () => {
    expect(await prendreCode(email, "123456")).toBe(false);
    expect(await verifierCode(email, "123456")).toBeNull();
    expect(await db().select().from(schema.users).where(eq(schema.users.email, email))).toHaveLength(0);
  });

  it("le mail de la liste : de quoi se retirer, et la conv qui n’a pas été gardée ; celui d’un invité : sa place est prête", () => {
    const retrait = "https://www.askblush.com/attente/retirer?id=abc&cle=xyz";
    const liste = mailAttente({ base: "https://www.askblush.com", place: "liste", retrait, convEffacee: true });
    expect(liste.sujet).toBe("Tu es sur la liste de BLUSH");
    expect(liste.html).toContain('href="https://www.askblush.com/attente/retirer?id=abc&amp;cle=xyz"');
    expect(liste.texte).toContain(retrait);
    expect(liste.texte).toContain("n’a pas été gardée");
    const prete = mailAttente({ base: "https://www.askblush.com", place: "prete", retrait });
    expect(prete.sujet).toBe("Ta place BLUSH est prête");
    expect(prete.html).not.toContain("retirer");
    expect(prete.html + liste.html).not.toContain("undefined");
  });

  it("chaque inscription écrit à l’email (trois mails par jour au plus), et on ne s’en retire qu’avec le lien de son mail", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    for (let k = 0; k < 4; k++) await inscrire(email, "accueil");
    expect(log.mock.calls.flat().filter((l) => String(l).includes(`pour ${email}`))).toHaveLength(3);
    log.mockRestore();
    const lien = new URL(lienRetrait(hash));
    expect(await retirer(lien.searchParams.get("id")!, "pas-la-bonne-cle")).toBe(false);
    expect(await db().select().from(schema.waitlist).where(eq(schema.waitlist.emailHash, hash))).toHaveLength(1);
    expect(await retirer(lien.searchParams.get("id")!, lien.searchParams.get("cle")!)).toBe(true);
    expect(await db().select().from(schema.waitlist).where(eq(schema.waitlist.emailHash, hash))).toHaveLength(0);
  });
});
