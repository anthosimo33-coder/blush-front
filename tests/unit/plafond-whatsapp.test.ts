import { afterEach, describe, expect, it, vi } from "vitest";
import { plafondDeWhatsApp } from "@prompts/lib/conv";
import { mesurerLExport } from "@/server/import";

/*
 * Le plafond de WhatsApp (plafondDeWhatsApp, prompts/lib/conv.ts ; mesurerLExport, src/server/import.ts) : un export
 * arrêté à ses 40 000 derniers messages (10 000 avec les médias) se repère à son nombre d’en-têtes. Exports inventés,
 * Tom et Léa.
 */

afterEach(() => vi.restoreAllMocks());

const pad = (n: number) => String(n).padStart(2, "0");
/** L’en-tête d’un message d’iPhone (« [20/09/2025 21:14:00] ») ou d’Android (« 20/09/2025 21:14 - »). */
const entete = (t: number, format: "ios" | "android") => {
  const d = new Date(t);
  const jour = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return format === "ios" ? `[${jour} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}]` : `${jour} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} -`;
};

/**
 * Un export de `n` en-têtes sur un an : un média tous les 25 messages (nommé avec `medias`, sinon « image absente » ou
 * « <Médias omis> »), la ligne du chiffrement en tête (`chiffrement`), des lignes système d’abord (`systeme`), une
 * deuxième ligne tous les 40 messages (`plusieursLignes`).
 */
function exporter(
  n: number,
  {
    format = "ios",
    medias = false,
    chiffrement = false,
    systeme = 0,
    plusieursLignes = false,
  }: { format?: "ios" | "android"; medias?: boolean; chiffrement?: boolean; systeme?: number; plusieursLignes?: boolean } = {},
): string {
  const debut = Date.UTC(2025, 8, 20, 21, 14);
  const pas = (365 * 86_400_000) / n;
  const lignes: string[] = [];
  if (chiffrement)
    lignes.push(
      format === "ios"
        ? `${entete(debut - 90e3, format)} Léa: \u200eLes messages et les appels sont chiffrés de bout en bout.`
        : `${entete(debut - 90e3, format)} Les messages et les appels sont chiffrés de bout en bout. Appuyez pour en savoir plus.`,
    );
  for (let k = 0; k < n - (chiffrement ? 1 : 0); k++) {
    const e = entete(debut + k * pas, format);
    const qui = k % 3 ? "Léa" : "Tom";
    if (k < systeme) lignes.push(format === "ios" ? `${e} Tom: \u200eLe code de sécurité de Tom a changé.` : `${e} Le code de sécurité de Tom a changé.`);
    else if (k % 25 === 0) {
      const joint =
        format === "ios"
          ? `\u200e<pièce jointe : ${String(k).padStart(8, "0")}-PHOTO-2026-01-01-10-00-00.jpg>`
          : `IMG-20260101-WA${String(k).padStart(4, "0")}.jpg (fichier joint)`;
      lignes.push(`${e} ${qui}: ${medias ? joint : format === "ios" ? "\u200eimage absente" : "<Médias omis>"}`);
    } else {
      lignes.push(`${e} ${qui}: message ${k} mdr`);
      if (plusieursLignes && k % 40 === 1) lignes.push("une deuxième ligne du même message");
    }
  }
  return lignes.join("\n");
}

describe("le plafond de WhatsApp", () => {
  it("40 000 en-têtes, ou jusqu’à 100 de moins : arrêté par WhatsApp ; 39 000 ou 40 002 : non", () => {
    expect(plafondDeWhatsApp(exporter(40_000)).plafond).toBe(40_000);
    expect(plafondDeWhatsApp(exporter(39_950)).plafond).toBe(40_000);
    expect(plafondDeWhatsApp(exporter(39_000)).plafond).toBeNull();
    expect(plafondDeWhatsApp(exporter(40_002)).plafond).toBeNull();
    expect(plafondDeWhatsApp(exporter(40_000, { format: "android" })).plafond).toBe(40_000);
  });

  it("10 000 en-têtes : arrêté seulement quand l’export nomme ses fichiers joints, sur iPhone comme sur Android", () => {
    expect(plafondDeWhatsApp(exporter(10_000, { medias: true }))).toMatchObject({ entetes: 10_000, avecMedias: true, plafond: 10_000 });
    expect(plafondDeWhatsApp(exporter(10_000))).toMatchObject({ avecMedias: false, plafond: null });
    expect(plafondDeWhatsApp(exporter(10_000, { format: "android", medias: true }))).toMatchObject({ avecMedias: true, plafond: 10_000 });
    expect(plafondDeWhatsApp(exporter(9_990, { format: "android" })).plafond).toBeNull();
  });

  it("les lignes système comptent, la suite d’un message sur plusieurs lignes non ; la ligne du chiffrement en tête se dit", () => {
    expect(plafondDeWhatsApp(exporter(40_000, { systeme: 5 })).entetes).toBe(40_000);
    expect(plafondDeWhatsApp(exporter(40_000, { format: "android", systeme: 5 })).entetes).toBe(40_000);
    expect(plafondDeWhatsApp(exporter(12_000, { plusieursLignes: true })).entetes).toBe(12_000);
    expect(plafondDeWhatsApp(exporter(40_000, { chiffrement: true }))).toMatchObject({ entetes: 40_000, chiffrementEnTete: true, plafond: 40_000 });
    expect(plafondDeWhatsApp(exporter(40_000, { format: "android", chiffrement: true })).chiffrementEnTete).toBe(true);
    expect(plafondDeWhatsApp(exporter(40_000)).chiffrementEnTete).toBe(false);
    /* Le BOM d’un fichier enregistré sur Windows ne cache pas le premier en-tête */
    expect(plafondDeWhatsApp(`\ufeff${exporter(10, { chiffrement: true })}`)).toMatchObject({ entetes: 10, chiffrementEnTete: true });
  });

  it("rien du texte : des nombres et des oui ou non", () => {
    const p = plafondDeWhatsApp(exporter(10));
    expect(Object.values(p).every((v) => v === null || typeof v === "number" || typeof v === "boolean")).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(/Léa|message/);
  });

  it("le journal : une ligne pour un long export WhatsApp, des nombres seulement ; rien pour un court, rien pour Instagram", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(mesurerLExport({ appli: "whatsapp", texte: exporter(9_000) }, "import")?.entetes).toBe(9_000);
    expect(info).toHaveBeenCalledTimes(1);
    const ligne = info.mock.calls[0]![0] as string;
    expect(JSON.parse(ligne)).toEqual({
      evenement: "import : export WhatsApp long",
      niveau: "info",
      ou: "import",
      format: "whatsapp-ios",
      entetes: 9_000,
      medias: false,
      chiffrement: false,
      plafond: null,
      coupe: false,
    });
    expect(ligne).not.toMatch(/Léa|Tom|mdr/);
    /* Un export coupé par la borne du texte, dit tel, ajouté à une conv : la même ligne, son `ou` et sa coupe */
    mesurerLExport({ appli: "whatsapp", texte: exporter(40_000, { format: "android" }), coupe: true }, "morceau");
    expect(JSON.parse(info.mock.calls[1]![0] as string)).toMatchObject({ ou: "morceau", format: "whatsapp-android", plafond: 40_000, coupe: true });
    info.mockClear();
    expect(mesurerLExport({ appli: "whatsapp", texte: exporter(8_999) }, "ajout")?.plafond).toBeNull();
    expect(mesurerLExport({ appli: "instagram", texte: exporter(40_000) }, "import")).toBeNull();
    expect(info).not.toHaveBeenCalled();
  });

  it("un million de lignes se comptent en moins de deux secondes", () => {
    const gros = exporter(1_000_000);
    const t0 = performance.now();
    expect(plafondDeWhatsApp(gros).entetes).toBe(1_000_000);
    expect(performance.now() - t0).toBeLessThan(2_000);
  });
});
