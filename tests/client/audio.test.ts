import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { arreterLeVocal, chargerEnMemoire, creerAudioContext, useLecteurAudio } from "@/lib/audio";

/*
 * L’audio du navigateur (src/lib/audio.ts) : le contexte Web Audio, et le lecteur des vocaux (un seul à la fois, le son
 * forcé tenu pendant qu’il joue). L’élément audio et la session de Safari sont simulés : le test dit quand le son
 * finit, ou ne vient pas.
 */

/** Un élément audio simulé : il joue quand on le lui demande (ou refuse), et finit ou échoue quand le test le dit. */
class FauxAudio {
  static tous: FauxAudio[] = [];
  /** Le navigateur refuse de jouer (pas de toucher, par exemple). */
  static refuse = false;
  preload = "";
  paused = true;
  currentTime = 0;
  duration = Number.NaN;
  error: { code: number } | null = null;
  onplay: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onwaiting: (() => void) | null = null;
  onstalled: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onended: (() => void) | null = null;
  constructor(readonly src: string) {
    FauxAudio.tous.push(this);
  }
  play() {
    if (FauxAudio.refuse) return Promise.reject(new DOMException("refusé", "NotAllowedError"));
    this.paused = false;
    this.onplay?.();
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.onpause?.();
  }
  /** Le son avance (timeupdate) ; il apprend sa durée. */
  avancer(t: number, duree: number) {
    this.currentTime = t;
    this.duration = duree;
    this.ontimeupdate?.();
  }
  /** Comme le navigateur au bout du son : la pause, puis la fin. */
  finir() {
    this.currentTime = this.duration;
    this.paused = true;
    this.onpause?.();
    this.onended?.();
  }
  /** Le son ne vient pas (réseau coupé). */
  echouer() {
    this.error = { code: 2 };
    this.onerror?.();
  }
}

let session: { type: string };

beforeEach(() => {
  FauxAudio.tous = [];
  FauxAudio.refuse = false;
  vi.stubGlobal("Audio", FauxAudio);
  session = { type: "ambient" };
  Object.defineProperty(navigator, "audioSession", { value: session, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "audioSession");
});

const lecteur = (options: Parameters<typeof useLecteurAudio>[0]) => renderHook(() => useLecteurAudio(options));

describe("useLecteurAudio", () => {
  it("l’élément naît au premier toucher, pas avant", () => {
    const source = vi.fn(() => "/son.mp3");
    const { result } = lecteur({ source });
    expect(result.current.element.current).toBeNull();
    expect(source).not.toHaveBeenCalled();
    act(() => result.current.jouer());
    expect(FauxAudio.tous).toHaveLength(1);
    expect(FauxAudio.tous[0].src).toBe("/son.mp3");
    expect(FauxAudio.tous[0].preload).toBe("auto");
    expect(result.current.joue).toBe(true);
  });

  it("un seul vocal à la fois : en lancer un arrête celui qui jouait, et le son forcé reste tenu", () => {
    const a = lecteur({ source: () => "/a.mp3", forcerSon: true });
    const b = lecteur({ source: () => "/b.mp3", forcerSon: true });
    act(() => a.result.current.jouer());
    expect(session.type).toBe("playback");
    act(() => b.result.current.jouer());
    expect(a.result.current.joue).toBe(false);
    expect(b.result.current.joue).toBe(true);
    /* Le premier, arrêté, a lâché le son forcé ; le second le tient encore */
    expect(session.type).toBe("playback");
    act(() => b.result.current.basculer());
    expect(b.result.current.joue).toBe(false);
    expect(session.type).toBe("ambient");
  });

  it("arreterLeVocal arrête celui qui joue (on ne s’enregistre pas par-dessus)", () => {
    const { result } = lecteur({ source: () => "/a.mp3" });
    act(() => result.current.jouer());
    act(() => arreterLeVocal());
    expect(result.current.joue).toBe(false);
  });

  it("sans `forcerSon`, le mode silencieux garde la main", () => {
    const { result } = lecteur({ source: () => "/a.mp3" });
    act(() => result.current.jouer());
    expect(session.type).toBe("ambient");
  });

  it("la fin : la pause recale le temps, puis surFin ; le son forcé est lâché", () => {
    const surFin = vi.fn();
    const { result } = lecteur({ source: () => "/a.mp3", forcerSon: true, suivreTemps: true, surFin });
    act(() => result.current.jouer());
    const a = FauxAudio.tous[0];
    act(() => a.avancer(3, 12));
    expect(result.current.temps).toBe(3);
    expect(result.current.duree).toBe(12);
    act(() => a.finir());
    expect(result.current.joue).toBe(false);
    expect(result.current.temps).toBe(12);
    expect(surFin).toHaveBeenCalledWith(a);
    expect(session.type).toBe("ambient");
  });

  it("sans `suivreTemps`, le temps ne change qu’à la pause, aux sauts et par poserTemps", () => {
    const { result } = lecteur({ source: () => "/a.mp3" });
    act(() => result.current.jouer(4));
    expect(result.current.temps).toBe(4);
    const a = FauxAudio.tous[0];
    act(() => a.avancer(6, 12));
    expect(result.current.temps).toBe(4);
    act(() => result.current.poserTemps(5));
    expect(result.current.temps).toBe(5);
    act(() => result.current.aller(8));
    expect(a.currentTime).toBe(8);
    expect(result.current.temps).toBe(8);
    act(() => result.current.pause());
    expect(result.current.temps).toBe(8);
  });

  it("le son ne vient pas : coupé, le son forcé lâché ; rejouer refait un élément, sur le réseau", () => {
    const source = vi.fn((refait: boolean) => (refait ? "/reseau.mp3" : "blob:memoire"));
    const { result } = lecteur({ source, forcerSon: true });
    act(() => result.current.jouer());
    act(() => FauxAudio.tous[0].echouer());
    expect(result.current.coupe).toBe(true);
    expect(result.current.joue).toBe(false);
    expect(session.type).toBe("ambient");
    act(() => result.current.basculer());
    expect(FauxAudio.tous.map((a) => a.src)).toEqual(["blob:memoire", "/reseau.mp3"]);
    expect(result.current.coupe).toBe(false);
    expect(result.current.joue).toBe(true);
    expect(session.type).toBe("playback");
    act(() => result.current.pause());
  });

  it("la lecture refusée : rien ne joue, et le son forcé est lâché", async () => {
    FauxAudio.refuse = true;
    const { result } = lecteur({ source: () => "/a.mp3", forcerSon: true });
    await act(async () => result.current.jouer());
    expect(result.current.joue).toBe(false);
    expect(session.type).toBe("ambient");
  });

  it("l’écran s’en va : le son s’arrête, et le son forcé est lâché", () => {
    const { result, unmount } = lecteur({ source: () => "/a.mp3", forcerSon: true });
    act(() => result.current.jouer());
    const a = FauxAudio.tous[0];
    unmount();
    expect(a.paused).toBe(true);
    expect(session.type).toBe("ambient");
  });
});

describe("creerAudioContext", () => {
  it("le contexte du navigateur, sinon son ancien nom (anciens Safari), sinon null", () => {
    class Contexte {
      constructor(readonly options?: AudioContextOptions) {}
    }
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    expect(creerAudioContext()).toBeNull();
    vi.stubGlobal("webkitAudioContext", Contexte);
    expect(creerAudioContext({ latencyHint: "interactive" })).toEqual(new Contexte({ latencyHint: "interactive" }));
    vi.stubGlobal("AudioContext", Contexte);
    expect(creerAudioContext()).toBeInstanceOf(Contexte);
  });

  it("le navigateur en refuse un de plus : null, sans lever", () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new DOMException("trop", "NotSupportedError");
        }
      },
    );
    expect(creerAudioContext()).toBeNull();
  });
});

describe("chargerEnMemoire", () => {
  it("le son en mémoire : une adresse locale ; une réponse en erreur ou le réseau coupé : null", async () => {
    const creer = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:son");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["son"]))));
    expect(await chargerEnMemoire("/son.mp3", new AbortController().signal)).toBe("blob:son");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(await chargerEnMemoire("/son.mp3", new AbortController().signal)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("réseau coupé"))));
    expect(await chargerEnMemoire("/son.mp3", new AbortController().signal)).toBeNull();
    expect(creer).toHaveBeenCalledTimes(1);
    creer.mockRestore();
  });

  it("arrêté pendant le chargement : rien en mémoire", async () => {
    const creer = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:son");
    const arret = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        arret.abort();
        return new Response(new Blob(["son"]));
      }),
    );
    expect(await chargerEnMemoire("/son.mp3", arret.signal)).toBeNull();
    expect(creer).not.toHaveBeenCalled();
    creer.mockRestore();
  });
});
