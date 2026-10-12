import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { BLOC_HTML } from "@prompts/lib/instagram";
import { chiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { importer } from "@/server/histoires";
import { storyAffichee } from "@/server/conv-affichee";
import { depuisPaquet, LIGNES_MAX } from "@/server/import";
import { purger } from "@/server/purge";
import { analyserExport, garderLaFin } from "@/services/preparer-export";
import { lirePaquet } from "./aide/fichiers";
import { accordDeTest, compteDeTest, histoireLue } from "./aide/fixtures";

const pad = (n: number) => String(n).padStart(2, "0");
/** Une très longue conv WhatsApp : des messages qui ne se compressent pas (du hasard), une ligne par message. */
function tresLongue(n: number): string {
  const debut = Date.UTC(2023, 0, 1, 9, 0);
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(debut + k * 17 * 60e3);
    return `[${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00] ${k % 2 ? "Léa" : "Tom"}: ${randomBytes(48).toString("base64")}`;
  }).join("\n");
}

describe("une conv trop longue pour partir", () => {
  it("garde sa partie la plus récente, qui tient dans un envoi, et le dit", async () => {
    const texte = tresLongue(90_000);
    const pret = await analyserExport(new File([texte], "WhatsApp Chat - Léa.txt", { type: "text/plain" }));
    if (pret.type !== "un") throw new Error("un seul fichier attendu");
    expect(pret.paquet.size).toBeLessThanOrEqual(4.2 * 1024 * 1024);
    const p = await lirePaquet(pret.paquet);
    expect(p.coupe).toBe(true);
    const garde = p.parties[0]!.contenu;
    /* Coupée au début d’un message, et jusqu’au dernier */
    expect(garde).toMatch(/^\[\d{2}\/\d{2}\/\d{4} /);
    expect(texte.endsWith(garde)).toBe(true);
    expect(garde.length).toBeLessThan(texte.length);

    /* Le serveur relit le paquet : l’histoire sait qu’elle est coupée, et combien de mois elle couvre */
    const lu = await depuisPaquet(new File([await pret.paquet.arrayBuffer()], "export.json.gz"));
    expect(lu.coupe).toBe(true);
    const imp = await importer(lu, accordDeTest());
    const source = storyAffichee(imp.id, imp.meta).sources[0]!;
    expect(source.moisLus).toBeGreaterThan(0);
    await db().delete(schema.stories).where(eq(schema.stories.id, imp.id));
  });

  it("une longue conv qui se compresse bien (21 mois, 180 000 messages) part en entier, et le serveur la lit en entier", async () => {
    const debut = Date.UTC(2023, 0, 1, 9, 0);
    const mots = ["ok", "tu fais quoi", "mdr", "je suis crevé", "on se voit demain ?", "trop bien", "bonne nuit", "t’es où"];
    const texte = Array.from({ length: 180_000 }, (_, k) => {
      const d = new Date(debut + k * 5 * 60e3);
      return `[${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00] ${k % 2 ? "Léa" : "Tom"}: ${mots[k % mots.length]} ${k}`;
    }).join("\n");
    const pret = await analyserExport(new File([texte], "WhatsApp Chat - Léa.txt", { type: "text/plain" }));
    if (pret.type !== "un") throw new Error("un seul fichier attendu");
    expect((await lirePaquet(pret.paquet)).coupe).toBeUndefined();
    const lu = await depuisPaquet(new File([await pret.paquet.arrayBuffer()], "export.json.gz"));
    expect(lu.coupe).toBeUndefined();
    expect(lu.texte).toBe(texte);
  });

  it("une conv coupée par le serveur (borner, dans importer) le dit aussi : meta.coupe, et les mois lus", async () => {
    const debut = Date.UTC(2024, 0, 1, 9, 0);
    /* Des lignes illisibles par centaines de milliers, puis 120 messages, un par jour : seuls ces derniers restent */
    const messages = Array.from({ length: 120 }, (_, k) => {
      const d = new Date(debut + k * 86400e3);
      return `[${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} 10:00:00] ${k % 2 ? "Léa" : "Tom"}: message ${k}`;
    }).join("\n");
    const imp = await importer({ appli: "whatsapp", texte: `${"x\n".repeat(LIGNES_MAX + 5)}${messages}`, nom: "chat.txt" }, accordDeTest());
    expect(imp.meta.coupe).toBe(true);
    expect(imp.meta.resume.total).toBe(120);
    expect(storyAffichee(imp.id, imp.meta).sources[0]!.moisLus).toBe(4);
    await db().delete(schema.stories).where(eq(schema.stories.id, imp.id));
  });

  it("une conv qui tient part en entier, sans rien dire", async () => {
    const pret = await analyserExport(new File([tresLongue(200)], "chat.txt", { type: "text/plain" }));
    if (pret.type !== "un") throw new Error("un seul fichier attendu");
    expect((await lirePaquet(pret.paquet)).coupe).toBeUndefined();
  });

  it("Instagram : les fichiers les plus anciens partent d’abord, puis les plus anciens messages du dernier gardé", () => {
    const json = (n: number, k0: number) =>
      JSON.stringify({ messages: Array.from({ length: n }, (_, k) => ({ sender_name: "Léa", timestamp_ms: 1_800_000_000_000 - (k0 + k) * 60e3, content: "x".repeat(100) })) });
    const parties = [
      { nom: "inbox/lea/message_1.json", contenu: json(100, 0) },
      { nom: "inbox/lea/message_2.json", contenu: json(100, 100) },
    ];
    const garde = garderLaFin(parties, 0.75);
    expect(garde).toHaveLength(2);
    expect(garde[0]).toBe(parties[0]);
    const messages = (JSON.parse(garde[1]!.contenu) as { messages: { timestamp_ms: number }[] }).messages;
    /* Les plus récents du second fichier : son début */
    expect(messages.length).toBeGreaterThan(30);
    expect(messages.length).toBeLessThan(70);
    expect(messages[0]!.timestamp_ms).toBe(1_800_000_000_000 - 100 * 60e3);

    const html = `<html><header>en-tête</header>${Array.from({ length: 10 }, (_, k) => `${BLOC_HTML}message ${k}</div>`).join("")}`;
    const h = garderLaFin([{ nom: "message_1.html", contenu: html }], 0.5)[0]!.contenu;
    expect(h.startsWith("<html><header>en-tête</header>")).toBe(true);
    expect(h).toContain("message 0");
    expect(h).not.toContain("message 9");
  });
});

describe("la conv brute d’une histoire sans rapport", () => {
  it("reste gardée jusqu’au déblocage ; celle d’un rapport écrit sans mémoire part au bout de 30 jours", async () => {
    const u = await compteDeTest("longue");
    const sansRapport = (await histoireLue(u, "02-reciproque.txt")).id;
    const rapportSansMemoire = (await histoireLue(u, "03-elle-s-eloigne.txt")).id;
    await db()
      .insert(schema.reports)
      .values({ storyId: rapportSansMemoire, data: chiffrer({ test: true }) });
    const vieux = new Date(Date.now() - 40 * 86400e3);
    await db().update(schema.stories).set({ createdAt: vieux }).where(eq(schema.stories.userId, u.id));
    await purger();
    const conv = async (id: string) => (await db().select({ conv: schema.stories.conv }).from(schema.stories).where(eq(schema.stories.id, id)))[0]!.conv;
    expect(await conv(sansRapport)).not.toBeNull();
    expect(await conv(rapportSansMemoire)).toBeNull();
  });
});
