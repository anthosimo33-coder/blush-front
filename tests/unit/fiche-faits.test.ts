import { describe, expect, it } from "vitest";
import { fusionnerFaits, type FaitCorrige } from "@/server/fiche";
import { SUPPRIMEES_MAX, type DonneesMemoire } from "@/server/stockage/types";
import { memoire } from "../aide/fabriques";

/*
 * La fiche corrigée à la main, fusionnée dans la mémoire (fusionnerFaits, src/server/fiche.ts) : ce que la route
 * PUT /api/fiche écrit, sans la base. Les faits sont inventés.
 */

type Fait = NonNullable<DonneesMemoire["etat"]["fiche"]>["faits"][number];
const fait = (texte: string, autres: Partial<Fait> = {}): Fait => ({ section: "infos", texte, preuves: [], statut: "nouveau", ...autres });
const corrige = (text: string, section: FaitCorrige["section"] = "infos"): FaitCorrige => ({ section, text });
/** Une mémoire dont la fiche a ces faits, et ces éditions déjà faites. */
const avec = (faits: Fait[], editions?: DonneesMemoire["editions"]): DonneesMemoire => ({ etat: memoire({ fiche: { faits } }), lignes: [["m1", "Elle : salut"]], suivant: 12, ...(editions ? { editions } : {}) });
const faitsDe = (m: DonneesMemoire | null) => m?.etat.fiche?.faits;

describe("la fiche corrigée à la main", () => {
  it("rien à fusionner sans fiche", () => {
    const sansFiche: DonneesMemoire = { etat: { ...memoire(), fiche: null }, lignes: [], suivant: 1 };
    expect(fusionnerFaits(sansFiche, [corrige("Elle fait du piano")])).toBeNull();
  });

  it("garde les preuves et le statut d’un fait inchangé, dans l’ordre de l’écran, et ne touche à rien d’autre", () => {
    const piano = fait("Elle fait du piano", { preuves: ["m4"], statut: "confirme" });
    const chat = fait("Elle a un chat", { section: "aime", preuves: ["m9"] });
    const avant = avec([piano, chat]);
    const apres = fusionnerFaits(avant, [corrige("Elle a un chat", "aime"), corrige("Elle fait du piano")])!;
    expect(faitsDe(apres)).toEqual([chat, piano]);
    expect(apres.editions).toEqual({ parToi: [], supprimees: [] });
    /* Le reste de la mémoire et de la fiche ne bouge pas */
    expect({ ...apres, etat: { ...apres.etat, fiche: { ...apres.etat.fiche!, faits: [] } }, editions: undefined }).toEqual({ ...avant, etat: { ...avant.etat, fiche: { ...avant.etat.fiche!, faits: [] } }, editions: undefined });
  });

  it("un fait déplacé dans une autre section, ou réécrit, devient un fait à lui, sans preuve", () => {
    const piano = fait("Elle fait du piano", { preuves: ["m4"], statut: "confirme" });
    const apres = fusionnerFaits(avec([piano]), [corrige("Elle fait du piano", "aime"), corrige("Elle fait du violon")])!;
    expect(faitsDe(apres)).toEqual([
      { section: "aime", texte: "Elle fait du piano", preuves: [], statut: "garde" },
      { section: "infos", texte: "Elle fait du violon", preuves: [], statut: "garde" },
    ]);
    /* Son texte était déjà là : seul le nouveau est « par toi » ; aucun texte n’a disparu */
    expect(apres.editions).toEqual({ parToi: ["Elle fait du violon"], supprimees: [] });
  });

  it.each([
    {
      cas: "un ajout compte pour toi ; une suppression n’est plus remise par la mémoire",
      avant: [fait("A"), fait("B")],
      editions: undefined,
      faits: ["A", "C"],
      attendu: { parToi: ["C"], supprimees: ["B"] },
    },
    {
      cas: "un ajout retiré ensuite n’est plus « par toi », et devient supprimé",
      avant: [fait("A"), fait("C")],
      editions: { parToi: ["C"], supprimees: [] },
      faits: ["A"],
      attendu: { parToi: [], supprimees: ["C"] },
    },
    {
      cas: "un fait supprimé puis réécrit n’est plus supprimé, et compte pour toi",
      avant: [fait("A")],
      editions: { parToi: [], supprimees: ["B"] },
      faits: ["A", "B"],
      attendu: { parToi: ["B"], supprimees: [] },
    },
    {
      cas: "les éditions d’avant restent, sans doublon",
      avant: [fait("A"), fait("C")],
      editions: { parToi: ["C", "C"], supprimees: ["X", "X"] },
      faits: ["A", "C", "C"],
      attendu: { parToi: ["C"], supprimees: ["X"] },
    },
  ])("$cas", ({ avant, editions, faits, attendu }) => {
    expect(fusionnerFaits(avec(avant, editions), faits.map((t) => corrige(t)))?.editions).toEqual(attendu);
  });

  it("ne garde que les SUPPRIMEES_MAX dernières suppressions", () => {
    const anciennes = Array.from({ length: SUPPRIMEES_MAX }, (_, k) => `ancien ${k}`);
    const apres = fusionnerFaits(avec([fait("A"), fait("B")], { parToi: [], supprimees: anciennes }), [corrige("A")])!;
    expect(apres.editions?.supprimees).toHaveLength(SUPPRIMEES_MAX);
    expect(apres.editions?.supprimees.at(-1)).toBe("B");
    expect(apres.editions?.supprimees[0]).toBe("ancien 1");
  });
});
