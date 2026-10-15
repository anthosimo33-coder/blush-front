import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Le réveil du son (src/lib/sound.ts) : le tout premier contexte audio de la visite bloque le fil principal 0,1 à 0,2 s
 * (mesuré dans Chromium et WebKit). Il naît au repos sur une page qui joue des sons, jamais dans le premier toucher, et
 * jamais sur une page qui n’en joue pas (la landing, un verdict partagé, les pages légales). Le contexte audio et le
 * repos du navigateur (requestIdleCallback) sont simulés ; chaque test repart d’un module neuf.
 */

/** Un nœud Web Audio simulé : ses réglages, et `connect` qui rend sa cible, comme le vrai. */
const noeud = () => ({
  gain: { value: 0 },
  threshold: { value: 0 },
  knee: { value: 0 },
  ratio: { value: 0 },
  attack: { value: 0 },
  release: { value: 0 },
  frequency: { value: 0 },
  Q: { value: 0 },
  type: "",
  buffer: null as unknown,
  connect: <T>(cible: T) => cible,
  start: vi.fn(),
});

/** Un contexte audio simulé : il naît suspendu (hors d’un geste, comme Safari), et compte ses naissances. */
class FauxContexte {
  static crees: FauxContexte[] = [];
  state = "suspended";
  sampleRate = 48000;
  destination = {};
  sources: ReturnType<typeof noeud>[] = [];
  resume = vi.fn(async () => {
    this.state = "running";
  });
  constructor() {
    FauxContexte.crees.push(this);
  }
  createGain = noeud;
  createDynamicsCompressor = noeud;
  createBiquadFilter = noeud;
  createConvolver = noeud;
  createBufferSource = () => {
    const s = noeud();
    this.sources.push(s);
    return s;
  };
  createBuffer = (_canaux: number, longueur: number) => ({ getChannelData: () => new Float32Array(longueur) });
}

/** Ce qui attend que la page soit au repos. */
let auRepos: (() => void)[] = [];
/** La page passe au repos : ce qui attendait se fait (et ce que cela met en attente, au repos suivant). */
const repos = () => {
  for (const faire of auRepos.splice(0)) faire();
};
const toucher = () => window.dispatchEvent(new Event("pointerdown"));

beforeEach(() => {
  vi.resetModules();
  FauxContexte.crees = [];
  auRepos = [];
  localStorage.clear();
  vi.stubGlobal("AudioContext", FauxContexte);
  vi.stubGlobal("requestIdleCallback", (faire: () => void) => auRepos.push(faire));
  vi.stubGlobal("cancelIdleCallback", (id: number) => {
    auRepos[id - 1] = () => {};
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Le son d’un onglet neuf : ses écouteurs posés (SoundBoot), sur la page `chemin`. */
async function sonSur(chemin: string) {
  const son = await import("@/lib/sound");
  son.bootSound();
  son.sonsDeLaPage(chemin);
  return son;
}

describe("le premier toucher ne crée plus le son", () => {
  it.each(["/", "/v/abc123", "/conditions", "/confidentialite", "/mentions-legales"])(
    "%s, une page sans son : aucun contexte audio, ni au repos, ni au toucher",
    async (chemin) => {
      await sonSur(chemin);
      repos();
      toucher();
      repos();
      expect(FauxContexte.crees).toHaveLength(0);
    },
  );

  it("une page qui joue des sons : le contexte naît au repos, suspendu, et le premier toucher ne fait que le reprendre", async () => {
    await sonSur("/app");
    expect(FauxContexte.crees).toHaveLength(0);
    repos();
    expect(FauxContexte.crees).toHaveLength(1);
    const ac = FauxContexte.crees[0]!;
    expect(ac.state).toBe("suspended");
    toucher();
    expect(FauxContexte.crees).toHaveLength(1);
    expect(ac.resume).toHaveBeenCalledTimes(1);
    /* iPhone : le son vide qui ouvre la sortie part dans le geste, une seule fois */
    expect(ac.sources.map((s) => s.start.mock.calls.length)).toEqual([1]);
    toucher();
    expect(ac.sources).toHaveLength(1);
  });

  it("de la landing au parcours (sans recharger) : rien sur la landing, le son se prépare au repos sur la page suivante", async () => {
    const son = await sonSur("/");
    toucher();
    expect(FauxContexte.crees).toHaveLength(0);
    son.sonsDeLaPage("/commencer");
    repos();
    expect(FauxContexte.crees).toHaveLength(1);
  });

  it("touché avant le repos : le contexte naît dans le geste, comme avant, et le repos n’en crée pas un second", async () => {
    await sonSur("/rapport");
    toucher();
    expect(FauxContexte.crees).toHaveLength(1);
    repos();
    expect(FauxContexte.crees).toHaveLength(1);
  });

  it("le réglage « Sons et vibrations » coupé : rien au repos, rien au toucher", async () => {
    localStorage.setItem("blush.sons.v1", "0");
    await sonSur("/app");
    repos();
    toucher();
    expect(FauxContexte.crees).toHaveLength(0);
  });
});
