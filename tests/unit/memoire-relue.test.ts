import { describe, expect, it } from "vitest";
import { appliquerMaj, noterAlerteDuChat } from "@prompts/lib/memoire";
import { alertesNoteesDepuis, surLaRelue } from "@/server/memoire-relue";
import type { DonneesMemoire } from "@/server/stockage/types";
import { echange, maj, memoire } from "../aide/fabriques";

/*
 * Une mise à jour de la mémoire relue après son appel au modèle (src/server/memoire-relue.ts) : si le chat n’y a noté que
 * des alertes, sa sortie s’applique encore, ces alertes rejouées par-dessus ; sinon, elle est à refaire. Sans base ni
 * modèle.
 */

const LIGNES: DonneesMemoire["lignes"] = [["m0002", "m0002 2026-03-02 lun. 21:04 Léa : on se voit jeudi ?"]];
const lue: DonneesMemoire = { etat: memoire(), lignes: LIGNES, suivant: 221 };
/** La mémoire avec cette alerte notée par le chat (noterLAlerte), sur cette réponse. */
const notee = (m: DonneesMemoire, alerte: "mineur" | "danger" | "detresse", reponse: number): DonneesMemoire => ({ ...m, etat: noterAlerteDuChat(m.etat, alerte, reponse) });

describe("alertesNoteesDepuis : ce qui a changé dans la mémoire relue", () => {
  it("rien : aucune alerte à rejouer", () => {
    expect(alertesNoteesDepuis(lue, structuredClone(lue))).toEqual([]);
  });

  it("des alertes notées par le chat, l’une après l’autre : les voici, dans l’ordre où les rejouer", () => {
    const relue = notee(notee(lue, "detresse", 41), "danger", 42);
    expect(alertesNoteesDepuis(lue, relue)).toEqual([
      { alerte: "danger", reponse: 42 },
      { alerte: "detresse", reponse: 41 },
    ]);
    /* Une de plus, sur une mémoire qui en avait déjà une : seule la nouvelle */
    expect(alertesNoteesDepuis(notee(lue, "detresse", 41), notee(notee(lue, "detresse", 41), "detresse", 43))).toEqual([{ alerte: "detresse", reponse: 43 }]);
  });

  it("autre chose : une fiche corrigée, une autre mise à jour, une alerte lue qui change, la mémoire de secours remplacée", () => {
    const corrigee = { ...lue, etat: { ...lue.etat, fiche: { ...lue.etat.fiche, phrase: "Une autre phrase" } } };
    expect(alertesNoteesDepuis(lue, corrigee)).toBeNull();
    expect(alertesNoteesDepuis(lue, { ...lue, suivant: 230 })).toBeNull();
    expect(alertesNoteesDepuis(lue, { ...lue, etat: { ...lue.etat, alerte: "danger" } })).toBeNull();
    expect(alertesNoteesDepuis({ ...lue, secours: true }, lue)).toBeNull();
    /* Une alerte notée, et une correction en même temps : à refaire */
    expect(alertesNoteesDepuis(lue, { ...notee(lue, "danger", 42), suivant: 230 })).toBeNull();
  });
});

describe("surLaRelue : ce que la mise à jour écrit sur la relue", () => {
  it("sa sortie, les alertes notées rejouées par-dessus : comme si le chat les avait notées juste après elle", () => {
    const apres: DonneesMemoire = { ...lue, etat: appliquerMaj(lue.etat, maj({ phrase: "Ils se voient jeudi" }), [echange(1)]) };
    const notees = [{ alerte: "danger" as const, reponse: 42 }];
    expect(surLaRelue(apres, notees)).toEqual(notee(apres, "danger", 42));
    expect(surLaRelue(apres, [])).toBe(apres);
  });

  it("une mise à jour qui ne changeait rien : rien à écrire, la relue est déjà la bonne", () => {
    expect(surLaRelue(null, [{ alerte: "danger", reponse: 42 }])).toBeNull();
  });
});
