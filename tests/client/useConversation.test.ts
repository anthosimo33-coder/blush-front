import { act, renderHook, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoupureChat, getChatHistory, modeVocalChat, type SuiviChat } from "@/services/api";
import type { BlushAnswer, BulleChat } from "@/types";
import type { HistoriqueChat } from "@/types/api";
import { nouvelId, useConversation, type Scene } from "@/app/app/accueil/conv/useConversation";
import type { Devant } from "@/app/app/accueil/conv/useChargerAnciens";
import { idHistorique, type EchangeScript, type Msg, type NewMsg } from "@/app/app/accueil/conv/modele";
import { chaqueTestASonHeure, renduNeuf } from "./temps";

/*
 * La conv de l’accueil, vivante (src/app/app/accueil/conv/useConversation.ts) : ses actions, le mode vocal et
 * l’historique, sans l’écran. Le serveur est simulé : l’historique (GET /api/chat) et le mode vocal (POST
 * /api/chat/vocal) ; chaque réponse de BLUSH est la demande que le test passe lui-même.
 */
vi.mock("@/services/api", async (vrai) => ({ ...(await vrai<typeof import("@/services/api")>()), getChatHistory: vi.fn(), modeVocalChat: vi.fn() }));

const historique = vi.mocked(getChatHistory);
const modeVocal = vi.mocked(modeVocalChat);

chaqueTestASonHeure();

beforeEach(() => {
  historique.mockReset();
  historique.mockResolvedValue({ echanges: [], plus: false });
  modeVocal.mockReset();
  modeVocal.mockResolvedValue(true);
});

/* Une réponse de BLUSH, en quelques bulles */
const reponse = (textes: string[], plus: Partial<BlushAnswer> = {}): BlushAnswer => ({ kind: "bubbles", bubbles: textes.map((text) => ({ text })), ...plus });
const enMsg = (r: BlushAnswer): NewMsg => ({ type: "reponse", from: "blush", result: r });

/* Un échange de l’historique du back-end : ton message et la réponse de BLUSH, à l’heure `at` */
const echange = (id: number): EchangeScript & { id: number; mine: string; at: number } => ({
  id,
  mine: `question n° ${id}`,
  answer: reponse([`réponse n° ${id}`]),
  at: 1_700_000_000_000 + id * 60_000,
});

/* Une promesse qu’on tient à la main : la réponse de BLUSH arrive quand le test le décide */
function retenue<T>() {
  let tenir!: (v: T) => void;
  let rompre!: (e: unknown) => void;
  const promesse = new Promise<T>((ok, ko) => {
    tenir = ok;
    rompre = ko;
  });
  return { promesse, tenir, rompre };
}

/* La scène de l’écran, simulée : ce que HomeScreen fait pendant que la conv change, noté par des espions */
function scene(): Scene {
  return {
    devant: { current: null },
    mesurer: (marque) => ({ desk: false, h: 0, marque }),
    auRepos: () => Promise.resolve(),
    avantChangement: vi.fn(),
    echangeCommence: vi.fn(),
    ecritCede: vi.fn(),
    reponsePosee: vi.fn(),
    annoncer: vi.fn(),
    anciensPoses: vi.fn(),
    niveau: vi.fn(),
  };
}

type Options = Parameters<typeof useConversation>[0];

/*
 * Le hook, comme HomeScreen le monte : au rendu qui pose des messages attendus (Devant), la conv est recalée, puis le
 * chargement est prévenu (useConvSuitLeBas dans accueil/mouvement/defilement.ts, l’effet de mise en page sur `msgs`).
 */
function monter(options: Partial<Options> = {}) {
  const s = options.scene ?? scene();
  const props: Options = { script: [], plusAnciens: false, ...options, scene: s };
  return {
    scene: s,
    ...renderHook(
      (p: Options) => {
        const conv = useConversation(p);
        useLayoutEffect(() => {
          const d: Devant | null = p.scene.devant.current;
          if (!d || (d.marque !== undefined && !conv.msgs.some((m) => m.id === d.marque))) return;
          p.scene.devant.current = null;
          d.pose?.();
        }, [conv.msgs, p.scene]);
        return conv;
      },
      { initialProps: props },
    ),
  };
}

/*
 * Charge le morceau d’avant, hors d’un `act` qui l’attendrait : il ne finit qu’au rendu qui pose ses messages, et `act`
 * ne rend qu’à sa sortie.
 */
async function chargerAnciens(conv: { current: ReturnType<typeof useConversation> }) {
  let fini = false;
  act(() => {
    void conv.current.chargerAnciens().then(() => (fini = true));
  });
  await waitFor(() => expect(fini).toBe(true));
}

/* Les messages de la conv, en abrégé : leur type, et pour « BLUSH écrit » s’il est coupé */
const types = (msgs: Msg[]) => msgs.map((m) => (m.type === "ecrit" && m.coupee ? "ecrit coupé" : m.type));
const texteDe = (texte: string): Msg => ({ type: "texte", id: nouvelId(), from: "toi", text: texte });
/* Un échange que BLUSH analyse (voir Echange) */
const analyse = (demande: (suivi: SuiviChat) => Promise<NewMsg>) => ({ label: "BLUSH analyse sa réponse", demande });
/* La page revenue à l’écran (`persisted` : gardée en mémoire par le navigateur, le bouton retour). happy-dom ne remplit pas `persisted` */
const pageshow = (persisted: boolean) => void window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));
/* Une conv en base (la conv gardée n’est reprise que pour la même clé : chaque test a la sienne) */
let convs = 0;
const uneCle = () => `conv-${++convs}`;

describe("useConversation : un échange", () => {
  it("ton message part avec « BLUSH écrit », puis sa réponse prend la place des perles", async () => {
    const { result, scene: s } = monter();
    const r = retenue<NewMsg>();
    const mine = texteDe("elle m’a vu ?");
    let fini!: Promise<void>;
    act(() => {
      fini = result.current.envoyer(
        mine,
        analyse(() => r.promesse),
      );
    });
    expect(types(result.current.msgs)).toEqual(["intro", "intro", "texte", "ecrit"]);
    expect(result.current.occupe).toBe(true);
    expect(s.echangeCommence).toHaveBeenCalledTimes(1);
    expect(s.avantChangement).toHaveBeenCalled();
    const ecrit = result.current.msgs.at(-1)!;
    expect(ecrit).toMatchObject({ type: "ecrit", reading: "BLUSH analyse sa réponse", vocal: false });
    await act(async () => {
      r.tenir(enMsg(reponse(["oui, elle a vu", "et elle réfléchit"])));
      await fini;
    });
    expect(types(result.current.msgs)).toEqual(["intro", "intro", "texte", "reponse"]);
    /* La réponse garde l’identifiant de « BLUSH écrit » : sa bulle se déplie depuis la même place */
    expect(result.current.msgs.at(-1)).toMatchObject({ id: ecrit.id, answered: true });
    expect(result.current.occupe).toBe(false);
    expect(s.ecritCede).toHaveBeenCalledWith(ecrit.id);
    expect(s.reponsePosee).toHaveBeenCalledTimes(1);
    /* Le serveur n’a pas été relu pour ça */
    expect(modeVocal).not.toHaveBeenCalled();
  });

  it("au fil de l’eau : les bulles reçues se posent, BLUSH écrit encore, puis la réponse validée les complète", async () => {
    const { result, scene: s } = monter();
    const r = retenue<NewMsg>();
    let suivi!: SuiviChat;
    let fini!: Promise<void>;
    act(() => {
      fini = result.current.envoyer(
        texteDe("je fais quoi ?"),
        analyse((sv) => {
          suivi = sv;
          return r.promesse;
        }),
      );
    });
    const premiere: BulleChat = { text: "attends" };
    await act(async () => {
      suivi.bulles?.([premiere]);
      await Promise.resolve();
    });
    expect(result.current.msgs.at(-1)).toMatchObject({ type: "ecrit", recues: [premiere], answered: true, vagues: [0] });
    expect(result.current.occupe).toBe(true);
    expect(s.reponsePosee).toHaveBeenCalledTimes(1);
    await act(async () => {
      r.tenir(enMsg(reponse(["attends", "laisse-la venir"])));
      await fini;
    });
    /* Une bulle était déjà posée : la suite est une nouvelle arrivée, ce qui est posé ne se redéplie pas */
    expect(result.current.msgs.at(-1)).toMatchObject({ type: "reponse", vagues: [0, 1] });
    expect(s.reponsePosee).toHaveBeenCalledTimes(1);
  });

  it("le réseau coupe : les bulles reçues restent, « Réessayer » relance la même demande à la même place", async () => {
    const { result } = monter();
    const recue: BulleChat = { text: "bon, écoute" };
    let essais = 0;
    const demande = vi.fn(async () => {
      essais++;
      if (essais === 1) throw new CoupureChat([recue]);
      return enMsg(reponse(["bon, écoute", "relance-la samedi"]));
    });
    await act(() => result.current.envoyer(texteDe("je la relance ?"), analyse(demande)));
    expect(types(result.current.msgs)).toEqual(["intro", "intro", "texte", "ecrit coupé"]);
    const coupee = result.current.msgs.at(-1)!;
    expect(coupee).toMatchObject({ recues: [recue], vagues: [0, 1] });
    /* Une réponse coupée n’occupe plus BLUSH : on peut écrire la suite */
    expect(result.current.occupe).toBe(false);

    let relancee = false;
    act(() => {
      relancee = result.current.relancer(coupee.id);
    });
    await waitFor(() => expect(result.current.msgs.at(-1)?.type).toBe("reponse"));
    expect(relancee).toBe(true);
    expect(demande).toHaveBeenCalledTimes(2);
    expect(types(result.current.msgs)).toEqual(["intro", "intro", "texte", "reponse"]);
    expect(result.current.msgs.at(-1)?.id).toBe(coupee.id);
    /* Plus rien à relancer : la demande est partie */
    expect(result.current.relancer(coupee.id)).toBe(false);
  });

  it("une erreur qui n’est pas une coupure coupe la réponse aussi : « BLUSH écrit » ne reste pas bloqué, « Réessayer » la relance", async () => {
    const { result, scene: s } = monter();
    const avertir = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      let essais = 0;
      const demande = vi.fn(async () => {
        essais++;
        if (essais === 1) throw new Error("bug");
        return enMsg(reponse(["me revoilà"]));
      });
      await act(() => result.current.envoyer(texteDe("allô ?"), analyse(demande)));
      expect(types(result.current.msgs)).toEqual(["intro", "intro", "texte", "ecrit coupé"]);
      expect(result.current.msgs.at(-1)).toMatchObject({ recues: [], coupee: true });
      expect(result.current.occupe).toBe(false);
      /* Laissée en trace (son nom seulement), et annoncée aux lecteurs d’écran comme une coupure */
      expect(avertir).toHaveBeenCalledWith(expect.stringContaining("conv:echange"));
      expect(s.annoncer).toHaveBeenLastCalledWith(expect.objectContaining({ type: "ecrit", coupee: true }));
      const coupee = result.current.msgs.at(-1)!;
      act(() => void result.current.relancer(coupee.id));
      await waitFor(() => expect(result.current.msgs.at(-1)?.type).toBe("reponse"));
      expect(demande).toHaveBeenCalledTimes(2);
    } finally {
      avertir.mockRestore();
    }
  });

  it("la réponse posée en entier, et un mot de BLUSH, sont annoncés à l’écran (pour les lecteurs d’écran)", async () => {
    const { result, scene: s } = monter();
    await act(() =>
      result.current.envoyer(
        texteDe("et maintenant ?"),
        analyse(async () => enMsg(reponse(["maintenant tu attends"]))),
      ),
    );
    expect(s.annoncer).toHaveBeenCalledTimes(1);
    expect(s.annoncer).toHaveBeenLastCalledWith(result.current.msgs.at(-1));
    act(() => result.current.direMot("Je n’ai rien entendu."));
    expect(s.annoncer).toHaveBeenLastCalledWith(expect.objectContaining({ type: "mot", notice: "Je n’ai rien entendu." }));
  });

  it("une réponse qui fait passer un cap prévient l’écran, 0,7 s après elle", async () => {
    const { result, scene: s } = monter();
    await act(() =>
      result.current.envoyer(
        texteDe("on en est où ?"),
        analyse(async () => enMsg(reponse(["vous vous voyez"], { levelUp: "voit" }))),
      ),
    );
    expect(s.niveau).not.toHaveBeenCalled();
    await waitFor(() => expect(s.niveau).toHaveBeenCalledWith("voit"), { timeout: 2000 });
  });

  it("l’accueil quitté avant les 0,7 s : le minuteur du cap est nettoyé, l’écran n’est pas prévenu", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const { result, scene: s, unmount } = monter();
      await act(() =>
        result.current.envoyer(
          texteDe("on en est où ?"),
          analyse(async () => enMsg(reponse(["vous vous voyez"], { levelUp: "voit" }))),
        ),
      );
      unmount();
      vi.advanceTimersByTime(1000);
      expect(s.niveau).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("un mot de BLUSH et un niveau franchi s’ajoutent au bout de la conv", () => {
    const { result, scene: s } = monter();
    act(() => result.current.direMot("Je n’ai rien entendu."));
    act(() => result.current.marquerNiveau("dit"));
    expect(result.current.msgs.slice(-2)).toMatchObject([
      { type: "mot", from: "blush", notice: "Je n’ai rien entendu." },
      { type: "niveau", from: "event", level: "dit" },
    ]);
    expect(s.avantChangement).toHaveBeenCalledTimes(2);
    /* Des messages de la visite : ils font leur entrée */
    expect(result.current.msgs.slice(-2).every((m) => m.id >= result.current.depuis)).toBe(true);
  });
});

describe("useConversation : le mode vocal, un seul propriétaire", () => {
  /* Une réponse qui passe (ou laisse) le chat en vocal */
  const repondre = (vocal: boolean) => async () => enMsg(reponse(["ok"], { modeVocal: vocal }));

  it("part de la page, puis suit les réponses de BLUSH", async () => {
    const { result } = monter({ modeVocalInitial: false });
    expect(result.current.modeVocal).toBe(false);
    await act(() => result.current.envoyer(texteDe("parle-moi en vocal"), analyse(repondre(true))));
    expect(result.current.modeVocal).toBe(true);
  });

  it("sans la base (l’aperçu), d’après la dernière réponse du script", () => {
    const { result } = monter({ script: [{ answer: reponse(["ok"], { modeVocal: true }) }] });
    expect(result.current.modeVocal).toBe(true);
  });

  it("« Repasser à l’écrit » : l’écran change tout de suite, et reste à l’écrit quand le serveur l’a gardé", async () => {
    const { result } = monter({ cle: uneCle(), modeVocalInitial: true });
    const r = retenue<boolean>();
    modeVocal.mockReturnValueOnce(r.promesse);
    let garde!: Promise<boolean>;
    act(() => {
      garde = result.current.repasserAEcrit();
    });
    expect(result.current.modeVocal).toBe(false);
    expect(modeVocal).toHaveBeenCalledWith(false);
    await act(async () => {
      r.tenir(true);
      expect(await garde).toBe(true);
    });
    expect(result.current.modeVocal).toBe(false);
  });

  it("« Repasser à l’écrit » refusé par le serveur : le chat reste en vocal, le bandeau revient", async () => {
    const { result } = monter({ cle: uneCle(), modeVocalInitial: true });
    modeVocal.mockResolvedValueOnce(false);
    let garde = true;
    await act(async () => {
      garde = await result.current.repasserAEcrit();
    });
    expect(garde).toBe(false);
    expect(result.current.modeVocal).toBe(true);
  });

  it("refusé, mais une réponse de BLUSH a parlé entre-temps : c’est elle qui l’emporte", async () => {
    const { result } = monter({ cle: uneCle(), modeVocalInitial: true });
    const r = retenue<boolean>();
    modeVocal.mockReturnValueOnce(r.promesse);
    let garde!: Promise<boolean>;
    act(() => {
      garde = result.current.repasserAEcrit();
    });
    await act(() => result.current.envoyer(texteDe("et là ?"), analyse(repondre(false))));
    await act(async () => {
      r.tenir(false);
      await garde;
    });
    expect(result.current.modeVocal).toBe(false);
  });

  it("une réponse partie avant « Repasser à l’écrit » ne le défait pas (le serveur l’a lu avant le geste)", async () => {
    const { result } = monter({ cle: uneCle(), modeVocalInitial: true });
    const r = retenue<NewMsg>();
    let fini!: Promise<void>;
    act(() => {
      fini = result.current.envoyer(texteDe("dis-moi tout"), { label: "BLUSH enregistre un vocal", demande: () => r.promesse, vocal: true });
    });
    await act(async () => {
      expect(await result.current.repasserAEcrit()).toBe(true);
    });
    expect(result.current.modeVocal).toBe(false);
    await act(async () => {
      r.tenir(enMsg(reponse(["ok"], { modeVocal: true })));
      await fini;
    });
    expect(result.current.modeVocal).toBe(false);
  });

  it("l’historique relu, parti avant « Repasser à l’écrit », ne le défait pas non plus", async () => {
    const h = retenue<HistoriqueChat>();
    historique.mockReturnValueOnce(h.promesse);
    const { result } = monter({ cle: uneCle(), script: [echange(5)], modeVocalInitial: true });
    expect(historique).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.repasserAEcrit();
    });
    await act(async () => {
      h.tenir({ echanges: [echange(5)], plus: false, modeVocal: true });
      await h.promesse;
    });
    expect(result.current.modeVocal).toBe(false);
  });

  it("l’aperçu (sans conv en base) : « Repasser à l’écrit » ne demande rien au serveur, et reste à l’écrit", async () => {
    const { result } = monter({ script: [{ answer: reponse(["ok"], { modeVocal: true }) }] });
    modeVocal.mockResolvedValue(false);
    expect(result.current.modeVocal).toBe(true);
    let garde = false;
    await act(async () => {
      garde = await result.current.repasserAEcrit();
    });
    expect(garde).toBe(true);
    expect(modeVocal).not.toHaveBeenCalled();
    expect(result.current.modeVocal).toBe(false);
  });
});

describe("useConversation : l’historique (useChargerAnciens)", () => {
  it("rendu par la page à l’instant, il n’est pas relu à l’ouverture (Q63)", async () => {
    const { result } = monter({ cle: uneCle(), script: [echange(5)], rendu: renduNeuf(), modeVocalInitial: false });
    await act(() => Promise.resolve());
    expect(historique).not.toHaveBeenCalled();
    expect(types(result.current.msgs)).toEqual(["intro", "intro", "texte", "reponse"]);
  });

  it("rendu à l’instant, mais le chat a été écrit depuis (une page préchargée avant la question du rapport) : il est relu", async () => {
    /* La page est préchargée (son rendu), puis tu écris au chat ailleurs (une autre conv montée, ici), puis tu l’ouvres */
    const rendu = renduNeuf();
    const ailleurs = monter();
    await act(() =>
      ailleurs.result.current.envoyer(
        texteDe("et maintenant ?"),
        analyse(async () => enMsg(reponse(["maintenant tu attends"]))),
      ),
    );
    ailleurs.unmount();
    historique.mockClear();
    historique.mockResolvedValue({ echanges: [echange(5), echange(6)], plus: false });
    const { result } = monter({ cle: uneCle(), script: [echange(5)], rendu, modeVocalInitial: false });
    await waitFor(() => expect(result.current.msgs).toHaveLength(6));
    expect(historique).toHaveBeenCalledTimes(1);
  });

  it("une écriture bien avant le rendu (plus de 2 s) ne le rend pas dépassé : il n’est pas relu", async () => {
    const ailleurs = monter();
    await act(() =>
      ailleurs.result.current.envoyer(
        texteDe("allô ?"),
        analyse(async () => enMsg(reponse(["oui"]))),
      ),
    );
    ailleurs.unmount();
    historique.mockClear();
    vi.setSystemTime(Date.now() + 5_000);
    monter({ cle: uneCle(), script: [echange(5)], rendu: renduNeuf(), modeVocalInitial: false });
    await act(() => Promise.resolve());
    expect(historique).not.toHaveBeenCalled();
  });

  it("revenu par le bouton retour (la page gardée en mémoire par le navigateur) : relu, et fondu dans la conv", async () => {
    const { result } = monter({ cle: uneCle(), script: [echange(5)], rendu: renduNeuf(), modeVocalInitial: false });
    await act(() => Promise.resolve());
    expect(historique).not.toHaveBeenCalled();
    historique.mockResolvedValue({ echanges: [echange(5), echange(6)], plus: false, modeVocal: true });
    act(() => pageshow(true));
    await waitFor(() => expect(result.current.msgs).toHaveLength(6));
    expect(result.current.msgs.slice(2).map((m) => m.id)).toEqual([idHistorique(5, false), idHistorique(5, true), idHistorique(6, false), idHistorique(6, true)]);
    expect(result.current.modeVocal).toBe(true);
    /* Une page simplement affichée (pas gardée en mémoire) ne relit rien de plus */
    act(() => pageshow(false));
    expect(historique).toHaveBeenCalledTimes(1);
  });

  it("sans heure de rendu, un rendu ancien, ou le même rendu revu (retour par l’historique) : il est relu", async () => {
    monter({ cle: uneCle(), script: [echange(5)] });
    await waitFor(() => expect(historique).toHaveBeenCalledTimes(1));
    monter({ cle: uneCle(), script: [echange(5)], rendu: renduNeuf(-60_000) });
    await waitFor(() => expect(historique).toHaveBeenCalledTimes(2));
    const rendu = renduNeuf();
    monter({ cle: uneCle(), script: [echange(5)], rendu });
    monter({ cle: uneCle(), script: [echange(5)], rendu });
    await waitFor(() => expect(historique).toHaveBeenCalledTimes(3));
    expect(historique).toHaveBeenCalledWith();
  });

  it("l’aperçu de l’équipe (sans conv en base) ne relit jamais l’historique : ce serait celui du compte connecté", async () => {
    const { result } = monter({ script: [{ mine: "elle m’a vu ?", answer: reponse(["oui"]) }] });
    await act(() => Promise.resolve());
    act(() => pageshow(true));
    await act(() => Promise.resolve());
    expect(historique).not.toHaveBeenCalled();
    expect(types(result.current.msgs)).toEqual(["intro", "intro", "texte", "reponse"]);
  });

  it("relu : ce qui manque se fond dans la conv, et le mode vocal suit la base", async () => {
    historique.mockResolvedValue({ echanges: [echange(5), echange(6)], plus: false, modeVocal: true });
    const { result, scene: s } = monter({ cle: uneCle(), script: [echange(5)], modeVocalInitial: false });
    await waitFor(() => expect(result.current.msgs).toHaveLength(6));
    expect(result.current.msgs.slice(2).map((m) => m.id)).toEqual([idHistorique(5, false), idHistorique(5, true), idHistorique(6, false), idHistorique(6, true)]);
    expect(result.current.modeVocal).toBe(true);
    /* La conv a été mesurée avant d’être fondue (elle garde sa place), et recalée au rendu qui l’a posée */
    expect(s.devant.current).toBeNull();
  });

  it("relu, mais la visite a déjà écrit : rien ne bouge (ses messages sont les plus récents)", async () => {
    const h = retenue<HistoriqueChat>();
    historique.mockReturnValueOnce(h.promesse);
    const { result } = monter({ cle: uneCle(), script: [echange(5)] });
    await act(() =>
      result.current.envoyer(
        texteDe("coucou"),
        analyse(async () => enMsg(reponse(["salut"]))),
      ),
    );
    const avant = result.current.msgs;
    await act(async () => {
      h.tenir({ echanges: [echange(5), echange(6)], plus: false });
      await h.promesse;
    });
    expect(result.current.msgs).toBe(avant);
  });

  it("en remontant : les échanges d’avant se posent devant, après l’intro, et il n’en reste plus", async () => {
    historique.mockImplementation(async (avant?: number) => (avant === 10 ? { echanges: [echange(8)], plus: false } : { echanges: [echange(10)], plus: true }));
    const { result, scene: s } = monter({ cle: uneCle(), script: [echange(10)], plusAnciens: true, rendu: renduNeuf() });
    expect(result.current.plus).toBe(true);
    await chargerAnciens(result);
    expect(historique).toHaveBeenCalledWith(10);
    /* L’écran le dit aux lecteurs d’écran : ton message et la réponse de BLUSH, deux messages plus anciens */
    expect(s.anciensPoses).toHaveBeenCalledWith(2);
    expect(result.current.msgs.map((m) => m.id)).toEqual([-2, -1, idHistorique(8, false), idHistorique(8, true), idHistorique(10, false), idHistorique(10, true)]);
    expect(result.current.plus).toBe(false);
    expect(result.current.anciens).toBe(false);
    /* Plus rien à charger : aucune autre demande ne part */
    await chargerAnciens(result);
    expect(historique).toHaveBeenCalledTimes(1);
  });

  it("le morceau demandé d’avance sert au chargement, sans redemander", async () => {
    historique.mockImplementation(async (avant?: number) => (avant === 10 ? { echanges: [echange(8)], plus: true } : { echanges: [], plus: false }));
    const { result } = monter({ cle: uneCle(), script: [echange(10)], plusAnciens: true, rendu: renduNeuf() });
    act(() => {
      result.current.precharger();
      result.current.precharger();
    });
    await chargerAnciens(result);
    expect(historique.mock.calls.filter(([avant]) => avant === 10)).toHaveLength(1);
    /* Il en reste : le suivant est demandé d’avance à son tour */
    expect(historique).toHaveBeenLastCalledWith(8);
    expect(result.current.plus).toBe(true);
  });

  it("l’historique frais se fond pendant le chargement d’un morceau : ce morceau n’est plus le bon, il ne se pose pas", async () => {
    const morceau = retenue<HistoriqueChat>();
    /* Écrit ailleurs entre-temps : plus d’un morceau, l’historique frais ne rejoint pas ce qui est affiché */
    historique.mockImplementation((avant?: number) => (avant === 10 ? morceau.promesse : Promise.resolve({ echanges: [echange(20), echange(22)], plus: true })));
    const { result } = monter({ cle: uneCle(), script: [echange(10)], plusAnciens: true, rendu: renduNeuf() });
    let fini = false;
    act(() => {
      void result.current.chargerAnciens().then(() => (fini = true));
    });
    expect(result.current.anciens).toBe(true);
    act(() => pageshow(true));
    await waitFor(() => expect(result.current.msgs.at(-1)?.id).toBe(idHistorique(22, true)));
    await act(async () => {
      morceau.tenir({ echanges: [echange(8)], plus: false });
      await morceau.promesse;
    });
    await waitFor(() => expect(fini).toBe(true));
    expect(result.current.msgs.map((m) => m.id)).toEqual([-2, -1, idHistorique(20, false), idHistorique(20, true), idHistorique(22, false), idHistorique(22, true)]);
    expect(result.current.anciens).toBe(false);
    expect(result.current.plus).toBe(true);
    /* Le morceau suivant part du plus ancien affiché désormais */
    await chargerAnciens(result);
    expect(historique).toHaveBeenLastCalledWith(20);
  });

  it("le réseau coupé pendant le chargement : rien ne bouge, on pourra réessayer", async () => {
    historique.mockRejectedValueOnce(new Error("réseau"));
    const { result } = monter({ cle: uneCle(), script: [echange(10)], plusAnciens: true, rendu: renduNeuf() });
    await chargerAnciens(result);
    expect(result.current.plus).toBe(true);
    expect(result.current.anciens).toBe(false);
    expect(result.current.msgs).toHaveLength(4);
    historique.mockResolvedValueOnce({ echanges: [echange(9)], plus: false });
    await chargerAnciens(result);
    expect(result.current.msgs).toHaveLength(6);
  });
});

describe("useConversation : la conv gardée pendant la visite", () => {
  it("revenu sur l’accueil de la même conv, elle reprend ses messages et son mode vocal ; une autre conv repart de sa page", async () => {
    const premiere = monter({ cle: "conv-a", script: [echange(5)], rendu: renduNeuf() });
    act(() => premiere.result.current.direMot("Je n’ai rien entendu."));
    await act(() =>
      premiere.result.current.envoyer(
        texteDe("parle-moi en vocal"),
        analyse(async () => enMsg(reponse(["ok"], { modeVocal: true }))),
      ),
    );
    premiere.unmount();

    const retour = monter({ cle: "conv-a", script: [echange(5)], rendu: renduNeuf(-60_000), modeVocalInitial: undefined });
    expect(retour.result.current.msgs.some((m) => m.type === "mot")).toBe(true);
    expect(retour.result.current.modeVocal).toBe(true);
    retour.unmount();

    const autre = monter({ cle: "conv-b", script: [echange(7)], rendu: renduNeuf() });
    expect(autre.result.current.msgs.some((m) => m.type === "mot")).toBe(false);
    expect(autre.result.current.modeVocal).toBe(false);
  });

  it("la clé X puis la clé Y : rien de la conv X (sa visite, son historique relu, son mode vocal) n’est fondu dans Y", async () => {
    /* X : un historique relu (5 et 6), un mot de BLUSH et un échange de la visite, le chat passé en vocal */
    historique.mockResolvedValueOnce({ echanges: [echange(5), echange(6)], plus: false });
    const x = monter({ cle: "conv-x", script: [echange(5)] });
    await waitFor(() => expect(x.result.current.msgs).toHaveLength(6));
    act(() => x.result.current.direMot("Je n’ai rien entendu."));
    await act(() =>
      x.result.current.envoyer(
        texteDe("question de la conv X"),
        analyse(async () => enMsg(reponse(["réponse de la conv X"], { modeVocal: true }))),
      ),
    );
    const deX = new Set(x.result.current.msgs.filter((m) => m.type !== "intro").map((m) => m.id));
    x.unmount();

    /* Y : seulement sa page, et son historique (relu : le chat vient d’être écrit, par X) */
    historique.mockResolvedValue({ echanges: [echange(40)], plus: false, modeVocal: false });
    const y = monter({ cle: "conv-y", script: [echange(40)], rendu: renduNeuf(), modeVocalInitial: false });
    await act(() => Promise.resolve());
    expect(y.result.current.msgs.filter((m) => deX.has(m.id))).toEqual([]);
    expect(y.result.current.msgs.map((m) => m.id)).toEqual([-2, -1, idHistorique(40, false), idHistorique(40, true)]);
    expect(y.result.current.modeVocal).toBe(false);
    y.unmount();

    /* Y relue (une page plus ancienne) : son historique frais s’y fond, celui de X jamais */
    historique.mockResolvedValueOnce({ echanges: [echange(40), echange(41)], plus: false, modeVocal: false });
    const yRelue = monter({ cle: "conv-y", script: [echange(40)], rendu: renduNeuf(-60_000) });
    await waitFor(() => expect(yRelue.result.current.msgs).toHaveLength(6));
    expect(yRelue.result.current.msgs.filter((m) => deX.has(m.id))).toEqual([]);
    expect(yRelue.result.current.msgs.some((m) => m.type === "mot" || (m.type === "texte" && m.text === "question de la conv X"))).toBe(false);
  });

  it("revenu sur une page que le serveur vient de rendre : son mode vocal l’emporte sur celui de la conv gardée", async () => {
    const premiere = monter({ cle: "conv-c", script: [echange(5)], rendu: renduNeuf(), modeVocalInitial: true });
    expect(premiere.result.current.modeVocal).toBe(true);
    premiere.unmount();
    const retour = monter({ cle: "conv-c", script: [echange(5)], rendu: renduNeuf(), modeVocalInitial: false });
    await waitFor(() => expect(retour.result.current.modeVocal).toBe(false));
    expect(historique).not.toHaveBeenCalled();
  });
});
