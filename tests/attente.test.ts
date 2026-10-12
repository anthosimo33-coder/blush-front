import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { alerter } from "@/server/alertes";
import { resumerLaVeille } from "@/server/veille";
import { ATTENTE_GARDEE_JOURS, inscrire, purgerLaListe } from "@/server/attente";
import { empreinteDeLaListe } from "@/server/invitations";
import { empreinte } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { dansLeQuotaDesMails, partDesAutresMails, plafondsDesMails } from "@/server/limites";

const n = Date.now();
const email = `pote-${n}@exemple.fr`;
/* L’inscription du résumé de la veille : la sienne, pour qu’il ait toujours de quoi parler, quel que soit l’ordre des tests */
const emailDeLaVeille = `pote-veille-${n}@exemple.fr`;
/* Les inscriptions de la purge : une trop vieille, une encore gardée */
const [ancien, recent] = [`pote-ancien-${n}@exemple.fr`, `pote-recent-${n}@exemple.fr`];
afterAll(async () => {
  await db()
    .delete(schema.waitlist)
    .where(
      inArray(
        schema.waitlist.emailHash,
        [email, emailDeLaVeille, ancien, recent].map((e) => empreinte(`attente:${e}`)),
      ),
    );
});

describe("la liste d’attente", () => {
  it("inscrit un email une seule fois, quelle que soit sa casse, et le garde chiffré", async () => {
    await inscrire(email.toUpperCase(), "accueil");
    await inscrire(email, "connexion");
    const lignes = await db()
      .select()
      .from(schema.waitlist)
      .where(eq(schema.waitlist.emailHash, empreinte(`attente:${email}`)));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.source).toBe("accueil");
    expect(Buffer.from(lignes[0]!.email).toString("utf8")).not.toContain("exemple");
    expect(empreinteDeLaListe(` ${email.toUpperCase()} `)).toBe(empreinte(`attente:${email}`));
  });

  it("S-30 · une inscription est gardée un an (ATTENTE_GARDEE_JOURS) : la purge de nuit efface les plus vieilles", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await inscrire(ancien, "accueil");
    await inscrire(recent, "accueil");
    const ligne = (e: string) => eq(schema.waitlist.emailHash, empreinteDeLaListe(e));
    const maintenant = new Date();
    const il_y_a = (jours: number) => new Date(maintenant.getTime() - jours * 86400e3);
    await db()
      .update(schema.waitlist)
      .set({ createdAt: il_y_a(ATTENTE_GARDEE_JOURS + 1) })
      .where(ligne(ancien));
    await db()
      .update(schema.waitlist)
      .set({ createdAt: il_y_a(ATTENTE_GARDEE_JOURS - 1) })
      .where(ligne(recent));
    expect(ATTENTE_GARDEE_JOURS).toBe(365);
    await purgerLaListe(maintenant);
    expect(await db().select().from(schema.waitlist).where(ligne(ancien))).toHaveLength(0);
    expect(await db().select().from(schema.waitlist).where(ligne(recent))).toHaveLength(1);
  });
});

describe("S-09 · le quota des mails autres que les codes (plafondsDesMails)", () => {
  const cle = empreinte("limite:mails:autres");
  const poser = (count: number) =>
    db()
      .insert(schema.rateLimits)
      .values({ key: cle, windowStart: new Date(), count })
      .onConflictDoUpdate({ target: schema.rateLimits.key, set: { count, windowStart: new Date() } });
  const compte = async () => (await db().select().from(schema.rateLimits).where(eq(schema.rateLimits.key, cle)))[0]?.count ?? 0;
  beforeEach(async () => {
    await db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, cle));
  });
  afterAll(async () => {
    await db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, cle));
  });

  it("la liste d’attente s’arrête la première, puis les alertes (chaque destinataire compté), les rapports en dernier ; un mail retenu ne prend rien", async () => {
    const part = partDesAutresMails(false);
    const { laisse } = plafondsDesMails();
    const codesAvec = { codesAPart: false };
    /* La liste d’attente laisse sa part aux autres */
    await poser(part - laisse.attente - 1);
    expect(await dansLeQuotaDesMails("attente", 1, codesAvec)).toBe(true);
    expect(await dansLeQuotaDesMails("attente", 1, codesAvec)).toBe(false);
    expect(await compte()).toBe(part - laisse.attente);
    /* Une alerte passe encore ; à deux destinataires, il en faut deux places */
    await poser(part - laisse.alerte - 1);
    expect(await dansLeQuotaDesMails("alerte", 2, codesAvec)).toBe(false);
    expect(await compte()).toBe(part - laisse.alerte - 1);
    expect(await dansLeQuotaDesMails("alerte", 1, codesAvec)).toBe(true);
    expect(await dansLeQuotaDesMails("alerte", 1, codesAvec)).toBe(false);
    /* Les rapports vont jusqu’au bout de la part, pas au-delà */
    expect(await dansLeQuotaDesMails("rapport", laisse.alerte, codesAvec)).toBe(true);
    expect(await compte()).toBe(part);
    expect(await dansLeQuotaDesMails("rapport", 1, codesAvec)).toBe(false);
    /* Avec la clé des codes, les autres mails ont tout le quota */
    expect(await dansLeQuotaDesMails("rapport", 1, { codesAPart: true })).toBe(true);
    expect(await compte()).toBe(part + 1);
  });
});

describe("les alertes", () => {
  it("préviennent l’équipe d’un échec, et résument la veille (sans aucun contenu)", async () => {
    /* Le plafond de 30 alertes par jour, et celui de 5 par sujet, se comptent aussi dans la base de test : on les remet à zéro */
    await db()
      .delete(schema.rateLimits)
      .where(
        inArray(
          schema.rateLimits.key,
          ["limite:alertes", "limite:alertes:sujet:verdict en échec"].map((c) => empreinte(c)),
        ),
      );
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await alerter("verdict en échec", ["Tâche verdict (t1)", "Erreur : refus"]);
    expect(log.mock.calls.flat().join("\n")).toContain("BLUSH · verdict en échec");
    log.mockClear();
    /* Un résumé sans rien de neuf ne part pas : une inscription du jour lui donne de quoi dire */
    await inscrire(emailDeLaVeille, "accueil");
    await resumerLaVeille();
    const resume = log.mock.calls.flat().join("\n");
    expect(resume).toContain("Nouveaux sur la liste d’attente : ");
    expect(resume).toMatch(/Coût de l’IA : \d+\.\d{2} \$/);
  });
});
