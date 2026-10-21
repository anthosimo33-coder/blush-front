import { describe, expect, it, vi } from "vitest";
/* Lire des captures lit la session (le compte qui paie la lecture, src/server/budget.ts) : ici, sans compte */
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, has: () => false }), headers: async () => new Headers() }));
import { versTexteCaptures } from "@prompts/lib/captures";
import { rendre } from "@prompts/lib/conv";
import type { Captures } from "@prompts/lib/schemas";
import { storyAffichee } from "@/server/conv-affichee";
import {
  ajouterDesCaptures,
  ajouterUnExport,
  convDe,
  definirQui,
  histoireDe,
  importer,
  importerCaptures,
  metaDe,
  morceauDejaAjoute,
  provenancesDe,
  tropCourte,
  type Meta,
} from "@/server/histoires";
import { executerChaine } from "@/server/pipeline";
import { contactDuFichier, lectureReunie, memePrenom, reunir, type ConvEnMorceaux } from "@/server/morceaux";
import { planifier } from "@/server/taches";
import { captures, msg } from "./aide/fabriques";
import { accordDeTest, compteDeTest, convRattachee, ligneEnBase } from "./aide/fixtures";
import { creees } from "./aide/nettoyage";

/*
 * Une conv en plusieurs morceaux (src/server/morceaux.ts, histoires.ts) : un export, des captures, un autre export avec
 * la même personne, réunis en une seule conv, rangée par date et sans doublons, puis lue en entier par la chaîne. Les
 * convs sont inventées : Hugo et Léa, des messages numérotés.
 */

/** Un export WhatsApp d’iPhone inventé : un message par minute à partir de `debut` (AAAA-MM-JJTHH:MM), Hugo et Léa en alternance. */
function exportWhatsapp(debut: string, n: number, { toi = "Hugo", autre = "Léa", depuis = 0, fichier }: { toi?: string; autre?: string; depuis?: number; fichier?: string } = {}) {
  const t0 = Date.parse(`${debut}:00Z`);
  const p2 = (x: number) => String(x).padStart(2, "0");
  const lignes = Array.from({ length: n }, (_, k) => {
    const d = new Date(t0 + (depuis + k) * 60e3);
    const date = `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`;
    return `[${date}] ${(depuis + k) % 2 ? autre : toi}: message ${depuis + k}`;
  });
  return { appli: "whatsapp" as const, texte: lignes.join("\n"), nom: fichier ?? `Discussion WhatsApp avec ${autre}.txt` };
}

/** Des captures lues (prompt 01) le `jour` à 21:00 : `n` messages de lui (« Moi ») et d’elle en alternance, « capture k ». */
function capturesDu(jour: string, n: number, { autre = "Léa", texte = (k: number) => `capture ${k}` }: { autre?: string | null; texte?: (k: number) => string } = {}) {
  const c: Captures = captures({
    autre,
    blocs: [{ repere: { date: jour, heure: "21:00" }, messages: Array.from({ length: n }, (_, k) => msg(k % 2 ? "autre" : "moi", texte(k))) }],
  });
  return versTexteCaptures(c, { aujourdhui: "2026-10-22" });
}

/** Un brouillon d’export, effacé à la fin du fichier. */
async function brouillon(e: ReturnType<typeof exportWhatsapp>) {
  const imp = await importer(e, accordDeTest());
  creees.histoires.push(imp.id);
  return imp;
}
const meta = async (id: string): Promise<Meta> => metaDe(await ligneEnBase(id));
const conv = async (id: string) => convDe(await ligneEnBase(id)) as ConvEnMorceaux;

describe("réunir des morceaux", () => {
  it("deux exports qui se recouvrent : les messages en commun gardés une fois, autant de fois qu’ils sont écrits", () => {
    const m = (t: number, texte: string, role: "toi" | "autre" = "toi") => ({ id: "", t, nom: role, role, texte, approx: false as const, ligne: 0 });
    const a = [m(0, "ok"), m(0, "ok"), m(60e3, "salut"), m(120e3, "ça va", "autre")];
    const b = [m(0, "ok"), m(0, "ok"), m(0, "ok"), m(120e3, "Ça va !", "autre"), m(180e3, "nouveau")];
    const r = reunir([
      { messages: a, exact: true },
      { messages: b, exact: true },
    ]);
    /* Trois « ok » dans b, deux dans a : trois restent ; « Ça va ! » est « ça va » sans ponctuation */
    expect(r.messages.map((x) => x.texte)).toEqual(["ok", "ok", "ok", "salut", "ça va", "nouveau"]);
    expect(r).toMatchObject({ doublons: 3, gardes: [4, 2] });
    expect(r.messages.map((x) => x.id)).toEqual(["m0001", "m0002", "m0003", "m0004", "m0005", "m0006"]);
  });

  it("le prénom compare les noms d’une appli à l’autre, et le fichier WhatsApp désigne l’autre", () => {
    expect(memePrenom("Léa 🌸", "lea.dupont")).toBe(true);
    expect(memePrenom("Léa", "Elle")).toBe(false);
    expect(memePrenom("Moi", "Moi")).toBe(false);
    expect(contactDuFichier("Discussion WhatsApp avec Léa 🌸.txt", ["Hugo S", "Léa 🌸"])).toBe("Léa 🌸");
    expect(contactDuFichier("WhatsApp Chat - Léa.zip", ["Hugo", "Léa"])).toBe("Léa");
    expect(contactDuFichier("_chat.txt", ["Hugo", "Léa"])).toBeUndefined();
  });
});

describe("une conv en plusieurs morceaux", () => {
  it("un export court reste un brouillon : trop court pour la lecture, jusqu’à ce qu’on lui ajoute le début", async () => {
    const imp = await brouillon(exportWhatsapp("2026-09-01T10:00", 30));
    expect(imp.meta.resume.total).toBe(30);
    expect(tropCourte(imp.meta)).toBe(true);
    /* « Discussion WhatsApp avec Léa » : Léa est l’autre */
    expect(imp.meta.contact).toBe(imp.meta.participants.findIndex((p) => p.nom === "Léa"));
    await ajouterDesCaptures(imp.secret, { appli: "instagram", t: capturesDu("2026-08-20", 24) });
    const m = await meta(imp.id);
    /* Avec des captures, 20 messages suffisent : la conv réunie en a 54 */
    expect(m).toMatchObject({ format: "captures", resume: { debut: "2026-08-20", fin: "2026-09-01", total: 54 } });
    expect(tropCourte(m)).toBe(false);
  });

  it("des captures du début, puis un 2e export : rangés par date, les doublons retirés, « Moi » relié à Hugo", async () => {
    const imp = await brouillon(exportWhatsapp("2026-09-01T10:00", 60));
    await ajouterDesCaptures(imp.secret, { appli: "instagram", t: capturesDu("2026-08-20", 24) });
    /* Le 2e export reprend les 20 derniers messages du premier, puis 40 nouveaux */
    await ajouterUnExport(imp.secret, exportWhatsapp("2026-09-01T10:00", 60, { depuis: 40 }));
    const m = await meta(imp.id);
    expect(m.morceaux?.map((x) => [x.appli, x.captures ?? null, x.resume.total])).toEqual([
      ["whatsapp", null, 60],
      /* La fabrique lit une seule capture : 24 messages dessus */
      ["instagram", 1, 24],
      ["whatsapp", null, 60],
    ]);
    expect(m).toMatchObject({ doublons: 20, resume: { debut: "2026-08-20", total: 124 } });
    expect((await ligneEnBase(imp.id)).messageCount).toBe(124);
    /* L’écran de l’histoire réunie : les morceaux du plus ancien au plus récent, le nombre de doublons */
    const story = storyAffichee(imp.id, m);
    expect(story.sources.map((s) => [s.mode, s.messageCount])).toEqual([
      ["captures", 24],
      ["export", 60],
      ["export", 60],
    ]);
    expect(story).toMatchObject({ totalMessages: 124, duplicatesRemoved: 20, other: m.contact === 0 ? "p0" : "p1" });

    /* « Qui es-tu ? » : Hugo. Les captures se relisent avec lui à la place de « Moi » */
    const hugo = m.participants.findIndex((p) => p.nom === "Hugo") as 0 | 1;
    const apres = await definirQui(imp.id, { moi: hugo, pronom: "il", devinette: "vus", objectif: "ensemble" });
    const h = histoireDe(apres);
    const lu = lectureReunie(await conv(imp.id), h, { k: hugo, connu: true });
    expect(lu.messages).toHaveLength(124);
    expect(lu.participants.sort()).toEqual(["Hugo", "Léa"]);
    /* Le début vient des captures : heure approximative ; « Moi » y est Hugo, l’autre Léa */
    expect(lu.messages[0]).toMatchObject({ texte: "capture 0", role: "toi", approx: "heure" });
    expect(lu.messages[1]).toMatchObject({ texte: "capture 1", role: "autre" });
    expect(lu.messages.at(-1)).toMatchObject({ texte: "message 99", approx: false });
    /* Ce que lit le modèle (la conv compacte, le jour écrit une fois) : les captures en « ~21:00 », puis l’export à la minute */
    const rendu = rendre({ ...h, aujourdhui: "2026-10-22" }, lu);
    expect(rendu.conversation).toContain("# jeu. 2026-08-20\nm0001 ~21:00 Hugo : capture 0");
    expect(rendu.conversation).toContain("# mar. 2026-09-01\nm0025 10:00 Hugo : message 0");
    /* La banque des preuves garde la ligne entière */
    expect(rendu.lignes.get("m0001")).toBe("m0001 2026-08-20 jeu. ~21:00 Hugo : capture 0");
    expect(rendu.lignes.get("m0025")).toBe("m0025 2026-09-01 mar. 10:00 Hugo : message 0");
    expect(rendu.chiffres).toContain("24 messages lus sur des captures");
    /* Chaque message garde son morceau (dans l’ordre d’import) : le modèle lit d’où vient chacun, du plus ancien au plus récent */
    expect([lu.messages[0]!.morceau, lu.messages[24]!.morceau, lu.messages.at(-1)!.morceau]).toEqual([1, 0, 2]);
    const reunie = rendre({ ...h, aujourdhui: "2026-10-22" }, lu, { morceaux: provenancesDe(apres) }).conversation.split("\n");
    expect(reunie[0]).toContain(`appli="instagram, whatsapp" source="morceaux" morceaux="3"`);
    expect(reunie[1]).toContain("3 morceaux importés à part : Instagram (captures) le 2026-08-20, WhatsApp (export) le 2026-09-01, WhatsApp (export) le 2026-09-01.");
    expect(reunie.slice(2, 4)).toEqual(["# jeu. 2026-08-20", "m0001 ~21:00 Hugo : capture 0"]);
    /* Une conv d’un seul morceau : rien de plus */
    expect(provenancesDe(await meta((await brouillon(exportWhatsapp("2026-09-01T10:00", 60))).id))).toEqual([]);
  });

  it("le même fichier deux fois, ou le même envoi de captures, ne fait pas un morceau de plus", async () => {
    const e = exportWhatsapp("2026-09-01T10:00", 60);
    const imp = await brouillon(e);
    await ajouterUnExport(imp.secret, e);
    expect((await meta(imp.id)).morceaux).toBeUndefined();
    await ajouterDesCaptures(imp.secret, { appli: "instagram", t: capturesDu("2026-08-20", 24), cle: "0123456789abcdef0123" });
    /* Un nouvel essai de l’envoi : le modèle a lu autrement, mais la clé est la même */
    await ajouterDesCaptures(imp.secret, { appli: "instagram", t: capturesDu("2026-08-21", 30), cle: "0123456789abcdef0123" });
    expect((await meta(imp.id)).morceaux).toHaveLength(2);
    expect(await morceauDejaAjoute(imp.secret, "0123456789abcdef0123")).toMatchObject({ id: imp.id, messages: 24 });
    expect(await morceauDejaAjoute(imp.secret, "fedcba9876543210fedc")).toBeNull();
  });

  it("un morceau avec quelqu’un d’autre est refusé (« autre_conv ») ; un nom illisible ou un surnom passent", async () => {
    const imp = await brouillon(exportWhatsapp("2026-09-01T10:00", 60));
    /* Hugo et Sarah, « avec Sarah » : Hugo parle à quelqu’un d’autre */
    await expect(ajouterUnExport(imp.secret, exportWhatsapp("2026-09-10T10:00", 60, { autre: "Sarah" }))).rejects.toMatchObject({ code: "autre_conv" });
    /* Des captures en haut desquelles on lit Sarah, quand le fichier dit Léa */
    await expect(ajouterDesCaptures(imp.secret, { appli: "instagram", t: capturesDu("2026-08-20", 24, { autre: "Sarah" }) })).rejects.toMatchObject({ code: "autre_conv" });
    /* Un nom que la lecture n’a pas lu, et Léa sous son nom complet : la même conv */
    await ajouterDesCaptures(imp.secret, { appli: "hinge", t: capturesDu("2026-08-10", 24, { autre: null }) });
    await ajouterDesCaptures(imp.secret, { appli: "instagram", t: capturesDu("2026-08-20", 24, { autre: "Léa Dupont" }) });
    /* Hugo a changé de nom sur un autre téléphone : Léa, désignée par le fichier, reste la même */
    await ajouterUnExport(imp.secret, exportWhatsapp("2026-09-20T10:00", 60, { toi: "Hugo S" }));
    expect((await meta(imp.id)).morceaux).toHaveLength(4);
  });

  it("au plus 5 morceaux (« trop »), et un morceau sans rien de nouveau (« rien_de_neuf »)", async () => {
    const imp = await brouillon(exportWhatsapp("2026-09-01T10:00", 60));
    /* Des captures de messages déjà dans l’export (le même jour, le même texte) : rien de neuf */
    const dejaLa = capturesDu("2026-09-01", 24, { texte: (k) => `message ${k}` });
    await expect(ajouterDesCaptures(imp.secret, { appli: "whatsapp", t: dejaLa })).rejects.toMatchObject({ code: "rien_de_neuf" });
    for (const jour of ["2026-08-01", "2026-08-05", "2026-08-10", "2026-08-15"]) await ajouterDesCaptures(imp.secret, { appli: "instagram", t: capturesDu(jour, 24) });
    await expect(ajouterDesCaptures(imp.secret, { appli: "instagram", t: capturesDu("2026-08-20", 24) })).rejects.toMatchObject({ code: "trop" });
  });

  it("des captures d’abord, puis un export : ses noms deviennent ceux de la conv, et « Qui es-tu ? » les redemande", async () => {
    const imp = await importerCaptures({ appli: "instagram", t: capturesDu("2026-08-20", 24), consentement: accordDeTest() });
    creees.histoires.push(imp.id);
    expect(imp.meta.moi).toBe(0);
    await ajouterUnExport(imp.secret, exportWhatsapp("2026-09-01T10:00", 60));
    const m = await meta(imp.id);
    expect(m.participants.map((p) => p.nom)).toEqual(["Hugo", "Léa"]);
    expect(m.moi).toBeUndefined();
    /* Léa : le nom lu en haut des captures, et le fichier */
    expect(m.contact).toBe(1);
    expect(m.participants.map((p) => p.messages)).toEqual([42, 42]);
    expect(storyAffichee(imp.id, m).sources.map((s) => s.mode)).toEqual(["captures", "export"]);
  });

  it("la chaîne lit la conv réunie jusqu’au verdict", async () => {
    const u = await compteDeTest("morceaux");
    const imp = await brouillon(exportWhatsapp("2026-09-01T10:00", 40));
    await ajouterDesCaptures(imp.secret, { appli: "instagram", t: capturesDu("2026-08-20", 24) });
    await convRattachee(u, imp);
    const m = await meta(imp.id);
    await definirQui(imp.id, { moi: m.participants.findIndex((p) => p.nom === "Hugo") as 0 | 1, pronom: "il", devinette: "parle", objectif: "comprendre" });
    await planifier(imp.id, "verdict");
    await executerChaine(imp.id);
    const fin = await ligneEnBase(imp.id);
    expect(fin.context).not.toBeNull();
    expect(fin.messageCount).toBe(64);
  });
});
