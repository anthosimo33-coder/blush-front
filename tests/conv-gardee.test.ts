import { describe, expect, it } from "vitest";
import { fusion, idHistorique, memesMessages, remonter, type Conv } from "@/app/app/garde";

/* La conv de l’accueil gardée pendant la visite (src/app/app/garde.ts) : au retour, rien ne disparaît, rien ne double, rien ne bouge */

type M = { id: number; from: "toi" | "blush" | "event"; text?: string; answered?: boolean; reading?: string; images?: string[]; voice?: object; result?: { echange?: number }; intro?: string };

const intro: M[] = [
  { id: -2, from: "blush", intro: "next" },
  { id: -1, from: "blush", intro: "hint" },
];
/** Un échange de l’historique (ton message, puis la réponse de BLUSH). */
const echange = (e: number): M[] => [
  { id: idHistorique(e, false), from: "toi", text: `q${e}` },
  { id: idHistorique(e, true), from: "blush", result: { echange: e } },
];
const historique = (...es: number[]) => es.flatMap(echange);
const conv = (msgs: M[], plus = false): Conv<M> => ({ msgs, plus, plusAncien: msgs.find((m) => m.id <= -1_000_000) ? Math.floor((-1_000_000 - msgs.find((m) => m.id <= -1_000_000)!.id) / 2) : null });
const ids = (c: Conv<M>) => c.msgs.map((m) => m.id);

describe("remonter", () => {
  it("retire « BLUSH écrit » et ton message qui l’attendait, et ce qui montre un fichier local", () => {
    const c = remonter(
      conv([
        ...intro,
        { id: 1, from: "toi", images: ["blob:1"] },
        { id: 2, from: "blush", text: "lu", answered: true },
        { id: 3, from: "toi", voice: {} },
        { id: 4, from: "toi", text: "et là ?" },
        { id: 5, from: "blush", reading: "BLUSH analyse sa réponse" },
      ]),
    );
    expect(ids(c)).toEqual([-2, -1, 2]);
    expect(c.msgs[2].answered).toBe(false);
  });

  it("back-end : un échange de la visite prend son identifiant de l’historique", () => {
    const c = remonter(conv([...intro, ...historique(10), { id: 1, from: "toi", text: "q12" }, { id: 2, from: "blush", result: { echange: 12 }, answered: true }, { id: 3, from: "event" }]));
    expect(ids(c)).toEqual([-2, -1, idHistorique(10, false), idHistorique(10, true), idHistorique(12, false), idHistorique(12, true), 3]);
    expect(c.msgs.every((m) => !m.answered)).toBe(true);
  });

  it("garde les mêmes objets quand rien ne change (les bulles ne se refont pas)", () => {
    const c = conv([...intro, ...historique(10)]);
    const r = remonter(c);
    expect(r.msgs.every((m, i) => m === c.msgs[i])).toBe(true);
  });
});

describe("fusion", () => {
  it("revenu par l’historique (page d’avant la visite) : la conv gardée reste telle quelle", () => {
    const gardee = remonter(conv([...intro, ...historique(4, 6, 8), { id: 1, from: "toi", text: "q12" }, { id: 2, from: "blush", result: { echange: 12 } }], true));
    const r = fusion(gardee, conv([...intro, ...historique(4, 6, 8)], true));
    expect(memesMessages(r.msgs, gardee.msgs)).toBe(true);
    expect(r.plus).toBe(true);
    expect(r.plusAncien).toBe(4);
  });

  it("l’historique frais (fenêtre glissante) ne double pas les échanges de la visite ni ne perd les morceaux chargés", () => {
    /* Avant la visite : un morceau plus ancien chargé (2), puis la fenêtre du serveur (4, 6, 8) ; la visite a ajouté 12 */
    const gardee = remonter(conv([...intro, ...historique(2, 4, 6, 8), { id: 1, from: "toi", text: "q12" }, { id: 2, from: "blush", result: { echange: 12 } }], true));
    /* Le serveur renvoie ses derniers échanges : 6, 8 et 12 (4 est sorti de la fenêtre) */
    const r = fusion(gardee, conv(historique(6, 8, 12), true));
    expect(memesMessages(r.msgs, gardee.msgs)).toBe(true);
    expect(r.plusAncien).toBe(2);
  });

  it("un échange écrit ailleurs se range à sa place, un repère de la visite reste après son échange", () => {
    const s = conv([...intro, ...historique(4, 6), { id: 7, from: "event" }]);
    const r = fusion(s, conv(historique(4, 6, 9)));
    expect(ids(r)).toEqual([-2, -1, ...ids(conv(historique(4, 6))), 7, idHistorique(9, false), idHistorique(9, true)]);
    /* Les messages déjà affichés gardent leur objet */
    expect(r.msgs[2]).toBe(s.msgs[2]);
  });

  it("un trou (plus d’un morceau écrit ailleurs) : on repart de l’historique frais", () => {
    const s = conv([...intro, ...historique(2, 4), { id: 3, from: "event" }], true);
    const f: Conv<M> = { msgs: historique(20, 22), plus: true, plusAncien: 20 };
    const r = fusion(s, f);
    expect(ids(r)).toEqual([-2, -1, ...ids(conv(historique(20, 22)))]);
    expect(r.plus).toBe(true);
    expect(r.plusAncien).toBe(20);
  });

  it("un historique frais plus ancien que ce qui est affiché ne retire rien", () => {
    const s = conv([...intro, ...historique(4, 6, 8, 10)], true);
    const r = fusion(s, conv(historique(4, 6), true));
    expect(memesMessages(r.msgs, s.msgs)).toBe(true);
  });

  it("sans historique (démo) : la conv gardée revient telle quelle", () => {
    const s = conv([...intro, { id: 1, from: "toi", text: "q" }, { id: 2, from: "blush", text: "r" }]);
    const r = fusion(s, conv([...intro]));
    expect(memesMessages(r.msgs, s.msgs)).toBe(true);
    expect(r.plusAncien).toBeNull();
  });
});
