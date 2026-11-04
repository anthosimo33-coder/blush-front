/*
 * Un export Instagram en HTML dont des dates ne se lisent pas (un mois d’une langue qu’on ne lit pas encore) : ses blocs
 * sont perdus, mais plus en silence. Une ligne au journal, leur nombre et la forme de la première date, chiffres masqués,
 * rien de ce qu’ils disent ; l’export lu repart sans ce compte. Par un fichier comme par le paquet du navigateur. Les
 * messages sont inventés.
 */
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { depuisFichier, depuisPaquet } from "@/server/import";

const bloc = (nom: string, texte: string, quand: string) =>
  `<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">${nom}</h2><div class="_3-95 _a6-p"><div><div>${texte}</div></div></div><div class="_3-94 _a6-o">${quand}</div></div>`;
/* Du plus récent au plus ancien, comme Instagram : deux blocs datés en allemand, un en anglais */
const html = `<html><body><main>${[bloc("Léa", "bis morgen", "Okt 19, 2026 7:00 pm"), bloc("Tom", "hola", "Sep 18, 2026 6:58 pm"), bloc("Léa", "hallo du", "Okt 18, 2026 6:57 pm")].join("\n")}</main></body></html>`;
const paquet = () => new File([gzipSync(JSON.stringify({ nom: "message_1.html", parties: [{ nom: "message_1.html", contenu: html }] }))], "export.json.gz");

afterEach(() => vi.restoreAllMocks());

describe("un export Instagram aux dates illisibles", () => {
  it.each([
    ["un fichier", () => depuisFichier(new File([html], "message_1.html"))],
    ["le paquet du navigateur", () => depuisPaquet(paquet())],
  ])("%s : une ligne au journal, sans un mot des messages, et l’export lu repart sans ce compte", async (_, lireLExport) => {
    const lignes: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((...l: unknown[]) => void lignes.push(l.join(" ")));
    const lu = await lireLExport();
    expect(lu).not.toHaveProperty("datesIllisibles");
    expect(lu.texte.split("\n")).toHaveLength(1);
    expect(lignes).toHaveLength(1);
    expect(JSON.parse(lignes[0]!)).toEqual({ evenement: "import : blocs Instagram sans date lisible", niveau: "alerte", blocs: 2, forme: "Okt 00, 0000 0:00 pm" });
    for (const mot of ["hallo", "morgen", "Léa"]) expect(lignes[0]).not.toContain(mot);
  });
});
