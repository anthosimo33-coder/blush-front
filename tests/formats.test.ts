import { describe, expect, it } from "vitest";
import { CONV_MAX, detecterFormat, estLigneMessage, idDeLigne, lire, MESSAGE_MAX, participantsDe, rendre, type Histoire } from "@prompts/lib/conv";

/* Deux prénoms inventés, et l’heure de chaque message : le 13 octobre 2023 à 9 h, puis toutes les 47 minutes */
const debut = Date.UTC(2023, 9, 13, 9, 0, 0);
const t = (k: number) => new Date(debut + k * 47 * 60e3);
const PHRASES = ["tu fais quoi ce soir", "trop bien ahah", "on se voit samedi ?", "ok ça marche", "mdr", "j’arrive dans 10 min"];
const pad = (n: number) => String(n).padStart(2, "0");
const h12 = (d: Date) => `${d.getUTCHours() % 12 || 12}:${pad(d.getUTCMinutes())}`;
const ap = (d: Date) => (d.getUTCHours() < 12 ? "AM" : "PM");
const [j, mo, a, aa, hh, mi, s] = [(d: Date) => d.getUTCDate(), (d: Date) => d.getUTCMonth() + 1, (d: Date) => d.getUTCFullYear(), (d: Date) => String(d.getUTCFullYear()).slice(2), (d: Date) => d.getUTCHours(), (d: Date) => pad(d.getUTCMinutes()), (d: Date) => pad(d.getUTCSeconds())];

/** Les en-têtes WhatsApp selon le téléphone et sa langue (U+202F avant AM/PM, comme les exports récents). */
const FORMATS: Record<string, (d: Date) => string> = {
  "iOS français": (d) => `[${pad(j(d))}/${pad(mo(d))}/${a(d)} ${pad(hh(d))}:${mi(d)}:${s(d)}] `,
  "iOS anglais (Royaume-Uni)": (d) => `[${pad(j(d))}/${pad(mo(d))}/${a(d)}, ${pad(hh(d))}:${mi(d)}:${s(d)}] `,
  "iOS sans zéros": (d) => `[${j(d)}/${mo(d)}/${a(d)}, ${hh(d)}:${mi(d)}:${s(d)}] `,
  "iOS américain": (d) => `[${mo(d)}/${j(d)}/${aa(d)}, ${h12(d)}:${s(d)} ${ap(d)}] `,
  "iOS année courte": (d) => `[${pad(j(d))}/${pad(mo(d))}/${aa(d)} ${pad(hh(d))}:${mi(d)}:${s(d)}] `,
  "Android français": (d) => `${pad(j(d))}/${pad(mo(d))}/${a(d)} ${pad(hh(d))}:${mi(d)} - `,
  "Android français, avec « à »": (d) => `${pad(j(d))}/${pad(mo(d))}/${a(d)} à ${pad(hh(d))}:${mi(d)} - `,
  "Android anglais (Royaume-Uni)": (d) => `${pad(j(d))}/${pad(mo(d))}/${a(d)}, ${pad(hh(d))}:${mi(d)} - `,
  "Android sans zéros": (d) => `${j(d)}/${mo(d)}/${a(d)} ${pad(hh(d))}:${mi(d)} - `,
  "Android américain": (d) => `${mo(d)}/${j(d)}/${aa(d)}, ${h12(d)} ${ap(d)} - `,
  "Android allemand": (d) => `${pad(j(d))}.${pad(mo(d))}.${aa(d)}, ${pad(hh(d))}:${mi(d)} - `,
};

const exporter = (entete: (d: Date) => string, n: number, texte = (k: number) => PHRASES[k % PHRASES.length]) =>
  Array.from({ length: n }, (_, k) => `${entete(t(k))}${k % 2 ? "Léa" : "Tom"}: ${texte(k)}`).join("\n");

const histoire = (format: Histoire["format"]): Histoire => ({
  utilisateur: { prenom: "Tom", pronom: "il", nomExport: "Tom" },
  autre: { prenom: "Léa", pronom: "elle", nomExport: "Léa" },
  devinette: "vus",
  objectif: "ensemble",
  appli: "whatsapp",
  format,
});

describe("les formats d’export WhatsApp", () => {
  it.each(Object.entries(FORMATS))("%s : chaque message lu, à la bonne minute", (_, entete) => {
    const texte = exporter(entete, 600);
    const format = detecterFormat(texte);
    expect(format).toBe(entete(t(0)).startsWith("[") ? "whatsapp-ios" : "whatsapp-android");
    expect(participantsDe(texte).map((p) => p.nom)).toEqual(["Tom", "Léa"]);
    const lu = lire(texte, histoire(format!));
    expect(lu.messages).toHaveLength(600);
    expect(lu.messages.every((m, k) => Math.floor(m.t / 60e3) === Math.floor(t(k).getTime() / 60e3))).toBe(true);
    expect(lu.messages[1]).toMatchObject({ role: "autre", texte: "trop bien ahah" });
  });
});

describe("une conv très longue", () => {
  it("le modèle en lit le début et la fin, sous le plafond, avec les identifiants de la conv entière", () => {
    const n = 30000;
    const lu = lire(exporter(FORMATS["iOS français"], n), histoire("whatsapp-ios"));
    const r = rendre(histoire("whatsapp-ios"), lu);
    expect(r.conversation.length).toBeLessThan(CONV_MAX + 1000);
    const lignes = r.conversation.split("\n");
    const coupe = lignes.find((l) => l.startsWith("[… "));
    expect(coupe).toMatch(/^\[… \d+ messages ne sont pas montrés ici \(du \d{4}-\d{2}-\d{2} au \d{4}-\d{2}-\d{2}\)/);
    /* Le premier et le dernier message sont là, sans renumérotation ; les chiffres comptent toute la conv */
    expect(idDeLigne(lignes.find(estLigneMessage)!)).toBe("m0001");
    expect(idDeLigne(lignes.findLast(estLigneMessage)!)).toBe(`m${n}`);
    expect(r.lignes.has(`m${n}`)).toBe(true);
    expect([...r.lignes.keys()].every((id) => /^m\d{4,}$/.test(id))).toBe(true);
    expect(r.lignes.size + Number(coupe!.match(/\d+/)![0])).toBe(n);
    expect(r.conversation).toContain(`messages="${n}"`);
  });

  it("une conv normale n’est pas coupée, un message géant l’est", () => {
    const lu = lire(
      exporter(FORMATS["Android français"], 300, (k) => (k === 7 ? "bla ".repeat(5000) : PHRASES[k % PHRASES.length])),
      histoire("whatsapp-android"),
    );
    const r = rendre(histoire("whatsapp-android"), lu);
    expect(r.conversation).not.toContain("ne sont pas montrés");
    expect(r.lignes.size).toBe(300);
    const geant = r.lignes.get("m0008")!;
    expect(geant.endsWith(" […]")).toBe(true);
    expect(geant.length).toBeLessThan(MESSAGE_MAX + 100);
  });
});
