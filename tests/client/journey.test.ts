import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLE_PARCOURS } from "@/state/cles";

/*
 * L’état du parcours (src/state/journey.tsx), gardé dans l’onglet (sessionStorage) : relu champ par champ. Ce qui manque,
 * ou n’a pas la bonne forme (une ancienne version, une main dans les outils du navigateur), prend sa valeur par défaut.
 * Le module garde l’état lu : chaque test le recharge (vi.resetModules).
 */

beforeEach(() => {
  sessionStorage.clear();
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const parcours = async () => (await import("@/state/journey")).readJourney();

describe("l’état du parcours relu de l’onglet", () => {
  it("garde les champs de la bonne forme, remet les autres par défaut", async () => {
    sessionStorage.setItem(
      CLE_PARCOURS,
      JSON.stringify({ app: "whatsapp", exportApp: "imessage", me: "p0", pronom: "lui", guess: "flou", goal: 3, capturesAdded: "oui", email: "a@b.test", inconnu: 1 }),
    );
    expect(await parcours()).toEqual({
      app: "whatsapp",
      exportApp: "whatsapp",
      exportFileName: null,
      capturesAdded: false,
      me: "p0",
      pronom: null,
      prenom: "",
      guess: "flou",
      goal: null,
      email: "a@b.test",
    });
  });

  it("une appli qui n’existe pas (ni une clé héritée d’Object) n’est pas gardée", async () => {
    sessionStorage.setItem(CLE_PARCOURS, JSON.stringify({ app: "toString", exportApp: "instagram" }));
    const etat = await parcours();
    expect(etat.app).toBeNull();
    expect(etat.exportApp).toBe("instagram");
  });

  it("un JSON abîmé, ou autre chose qu’un objet : le parcours part de zéro", async () => {
    for (const brut of ["{abîmé", "[1,2]", "null", "\"whatsapp\""]) {
      sessionStorage.setItem(CLE_PARCOURS, brut);
      vi.resetModules();
      expect((await parcours()).app).toBeNull();
    }
  });

  it("écrit ce qu’on lui donne, et le relit tel quel", async () => {
    const { setJourney } = await import("@/state/journey");
    setJourney({ app: "instagram", exportApp: "instagram", prenom: "Inventé", capturesAdded: true });
    vi.resetModules();
    const etat = await parcours();
    expect(etat).toMatchObject({ app: "instagram", exportApp: "instagram", prenom: "Inventé", capturesAdded: true });
  });

  it("le stockage refusé : les valeurs par défaut, et un changement vaut pour la page", async () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("refusé", "SecurityError");
    });
    const { readJourney, setJourney } = await import("@/state/journey");
    expect(readJourney().app).toBeNull();
    expect(() => setJourney({ me: "p1" })).not.toThrow();
    expect(readJourney().me).toBe("p1");
  });
});
