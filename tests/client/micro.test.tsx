import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "@/app/app/accueil/Composer";

/*
 * Le vocal de la barre de saisie (src/app/app/voice.tsx, dans accueil/Composer.tsx), sur un micro simulé : l’enregistreur
 * au débit de la voix (S-15), et le direct de l’enregistrement (le temps, l’onde, les perles du logo) qui ne refait que
 * la barre d’enregistrement, jamais la barre de saisie ni l’accueil qui la porte (Q64).
 *
 * Le micro : getUserMedia, MediaRecorder et AudioContext simulés ; le volume que l’analyseur lit, le test le choisit.
 * Les images (requestAnimationFrame) et le minuteur du temps, le test les fait passer à la main.
 */
const rendus = vi.hoisted(() => ({ saisie: 0, barre: 0 }));

/* Chaque rendu de la barre de saisie rend ses deux champs fichier : ils comptent ses rendus */
vi.mock("@/components/ui/FileInput", async (vrai) => {
  const m = await vrai<typeof import("@/components/ui/FileInput")>();
  return { ...m, FileInput: (p: Parameters<typeof m.FileInput>[0]) => (rendus.saisie++, m.FileInput(p)) };
});
vi.mock("@/app/app/voice", async (vrai) => {
  const m = await vrai<typeof import("@/app/app/voice")>();
  return { ...m, RecordingBar: (p: Parameters<typeof m.RecordingBar>[0]) => (rendus.barre++, m.RecordingBar(p)) };
});
vi.mock("@/lib/sound", () => ({ play: vi.fn(), setRecording: vi.fn(), setForceSound: vi.fn() }));
vi.mock("@/components/shell/Reveil", () => ({ reveiller: vi.fn() }));

/* Le volume que lit l’analyseur, de 0 (silence) à 127 (le plus fort) */
let volume = 0;
/* Les options passées à chaque MediaRecorder créé ; `refuseOptions` : un navigateur qui ne connaît pas audioBitsPerSecond */
let options: (MediaRecorderOptions | undefined)[] = [];
let refuseOptions = false;
/* Les images en attente (requestAnimationFrame) */
let images: FrameRequestCallback[] = [];

class FauxEnregistreur {
  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: MediaStream, opts?: MediaRecorderOptions) {
    if (opts && refuseOptions) throw new DOMException("Option inconnue", "NotSupportedError");
    options.push(opts);
  }
  start() {
    this.state = "recording";
  }
  requestData() {
    this.ondataavailable?.({ data: new Blob(["son"], { type: this.mimeType }) });
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

class FauxContexte {
  resume = () => Promise.resolve();
  close = () => Promise.resolve();
  createMediaStreamSource = () => ({ connect: () => {} });
  createAnalyser = () => ({ fftSize: 0, getByteTimeDomainData: (buf: Uint8Array) => buf.fill(128 + volume) });
}

beforeEach(() => {
  volume = 0;
  options = [];
  refuseOptions = false;
  images = [];
  rendus.saisie = 0;
  rendus.barre = 0;
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
  vi.stubGlobal("MediaRecorder", FauxEnregistreur);
  vi.stubGlobal("AudioContext", FauxContexte);
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => images.push(f));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop: () => {} }] }) } }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.querySelectorAll("[data-blush-logo]").forEach((el) => el.remove());
});

/* Des images passent, une toutes les 80 ms (l’onde relève le micro toutes les 70 ms au moins), chacune rendue à part */
function images80(n: number) {
  for (let i = 0; i < n; i++)
    act(() => {
      vi.advanceTimersByTime(80);
      const attente = images;
      images = [];
      attente.forEach((f) => f(performance.now()));
    });
}

/* Le logo de BLUSH, avec ses trois perles et leurs ombres, à l’écran (visible : il a une boîte) */
function logo() {
  const el = document.createElement("div");
  el.setAttribute("data-blush-logo", "");
  el.innerHTML = '<span data-pearl=""></span><span data-pearl=""></span><span data-pearl=""></span><span data-shade=""></span><span data-shade=""></span><span data-shade=""></span>';
  el.getClientRects = () => ({ length: 1 }) as DOMRectList;
  document.body.append(el);
  return el;
}

function monter() {
  const props: ComponentProps<typeof Composer> = {
    formRef: createRef<HTMLFormElement>(),
    inputRef: createRef<HTMLInputElement>(),
    quick: [],
    ideesMasquees: false,
    entree: false,
    about: null,
    onAboutClear: vi.fn(),
    modeVocal: false,
    onEcrit: vi.fn(),
    busy: false,
    onText: vi.fn(),
    onQuick: vi.fn(),
    onImages: vi.fn(),
    onExport: vi.fn(),
    onVoice: vi.fn(),
    onMicError: vi.fn(),
    arriving: false,
  };
  render(<Composer {...props} />);
  return props;
}

async function enregistrer() {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Enregistrer un vocal" })));
  expect(screen.getByRole("status").textContent).toBe("Enregistrement du vocal en cours");
}

/* Les barres de l’onde, de gauche à droite : leur échelle (3/25 au repos, 25/25 au plus fort) */
const onde = () => [...document.querySelectorAll<HTMLElement>("[data-onde] > *")].map((b) => b.style.transform);

describe("le vocal de la barre de saisie", () => {
  it("s’enregistre au débit de la voix, 32 kb/s (S-15)", async () => {
    monter();
    await enregistrer();
    expect(options).toEqual([{ audioBitsPerSecond: 32_000 }]);
  });

  it("un navigateur qui refuse le débit enregistre quand même, à son débit à lui", async () => {
    refuseOptions = true;
    const props = monter();
    await enregistrer();
    expect(options).toEqual([undefined]);
    expect(props.onMicError).not.toHaveBeenCalled();
  });

  it("le temps et l’onde ne refont que la barre d’enregistrement ; les perles du logo suivent la voix (Q64)", async () => {
    const perles = logo();
    monter();
    await enregistrer();
    const saisie = rendus.saisie;
    const barre = rendus.barre;
    expect(perles.hasAttribute("data-listen")).toBe(true);
    expect(onde().every((t) => t === "scaleY(0.12)")).toBe(true);

    /* Une voix forte, pendant une seconde : environ 12 relevés du micro, et le temps qui passe à 0:01 */
    volume = 32;
    images80(13);
    expect(rendus.barre - barre).toBeGreaterThanOrEqual(12);
    expect(onde().slice(-12)).toEqual(Array(12).fill("scaleY(0.868)"));
    expect(screen.getByText("0:01")).toBeTruthy();
    /* Les perles suivent la voix, hors de React */
    const [premiere] = perles.querySelectorAll<HTMLElement>("[data-pearl]");
    expect(premiere.style.transform).toBe("translateY(-26.0%) scale(1.280)");
    /* La barre de saisie (et l’accueil qui la porte) ne s’est pas refaite une seule fois */
    expect(rendus.saisie).toBe(saisie);
  });

  it("« Envoyer le vocal » : il part avec sa durée ; le logo se redresse, ses perles reviennent à leur place", async () => {
    const perles = logo();
    const props = monter();
    await enregistrer();
    volume = 64;
    images80(25);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Envoyer le vocal" })));
    expect(props.onVoice).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ seconds: 2, peaks: expect.any(Array) }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(perles.hasAttribute("data-listen")).toBe(false);
    expect(perles.hasAttribute("data-lean")).toBe(false);
    expect([...perles.querySelectorAll<HTMLElement>("[data-pearl], [data-shade]")].map((p) => p.style.transform)).toEqual(Array(6).fill(""));
  });

  it("à 2 minutes, le vocal part tout seul, une seule fois, avec ses 120 secondes", async () => {
    const props = monter();
    await enregistrer();
    /* Le minuteur du temps et l’horloge avancent ensemble jusqu’à la limite : le vocal part par la fonction rendue au début de l’enregistrement */
    await act(async () => void vi.advanceTimersByTime(120_000));
    expect(props.onVoice).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ seconds: 120 }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Enregistrer un vocal" })).toBeTruthy();
    /* Le minuteur est arrêté : le temps qui passe ne renvoie rien */
    await act(async () => void vi.advanceTimersByTime(5_000));
    expect(props.onVoice).toHaveBeenCalledTimes(1);
  });
});
