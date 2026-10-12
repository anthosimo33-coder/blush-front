import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENTETE_CAPTCHA, SCRIPT_TURNSTILE } from "@/lib/captcha";

/*
 * Le widget du CAPTCHA dans le navigateur (src/components/ui/Captcha.tsx, src/services/captcha.ts) : le script de
 * Cloudflare chargé par l’écran qui monte le widget, et lui seul ; le jeton pris une fois, puis un neuf ; le widget qui ne
 * prend de place que s’il demande un geste ; et les appels qui portent le jeton (la demande de code) ou prennent d’abord
 * le laissez-passer (un import). Le script de Cloudflare est un faux `window.turnstile`, et le réseau un `fetch` simulé.
 * Chaque test recharge les modules : le widget monté et le script chargé ne passent pas d’un test à l’autre.
 */
const CLE = "0x4AAAAAAAcle-publique-fictive";

type Options = Record<string, unknown> & { callback: (jeton: string) => void };
/** Le faux script de Cloudflare : ce qu’on lui a demandé de dessiner, et de quoi faire répondre le widget. */
function fauxTurnstile() {
  const rendus: { conteneur: HTMLElement; options: Options }[] = [];
  const turnstile = {
    render: vi.fn((conteneur: HTMLElement, options: Options) => {
      rendus.push({ conteneur, options });
      return `w${rendus.length}`;
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = turnstile;
  return { turnstile, rendus, repondre: (jeton: string) => act(() => rendus.at(-1)!.options.callback(jeton)) };
}

const charger = async () => {
  vi.resetModules();
  return { ...(await import("@/components/ui/Captcha")), ...(await import("@/services/captcha")), api: await import("@/services/api") };
};
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });
/** Laisse passer les promesses en attente (le chargement du script, l’effet du widget). */
const laisser = () => act(async () => {});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", CLE);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  delete window.turnstile;
  document.head.querySelectorAll("script").forEach((s) => s.remove());
});

describe("le widget", () => {
  it("se dessine géré et discret, avec la clé publique et l’action de l’écran ; démonté, il s’en va", async () => {
    const { turnstile, rendus } = fauxTurnstile();
    const { Captcha } = await charger();
    const { unmount } = render(<Captcha action="code" />);
    await laisser();
    expect(rendus).toHaveLength(1);
    expect(rendus[0]!.options).toMatchObject({ sitekey: CLE, action: "code", appearance: "interaction-only", "refresh-expired": "auto", language: "fr" });
    unmount();
    expect(turnstile.remove).toHaveBeenCalledWith("w1");
  });

  it("ne prend de la place que s’il demande un geste", async () => {
    const { rendus } = fauxTurnstile();
    const { Captcha } = await charger();
    const { container } = render(<Captcha action="import" />);
    await laisser();
    const boite = container.querySelector("[data-captcha]")!;
    expect(boite.className).not.toContain("mb-3");
    act(() => (rendus[0]!.options["before-interactive-callback"] as () => void)());
    expect(boite.className).toContain("mb-3");
    act(() => (rendus[0]!.options["after-interactive-callback"] as () => void)());
    expect(boite.className).not.toContain("mb-3");
  });

  it("sans clé publique : rien, ni script ni place, et aucun jeton à attendre", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const { Captcha, jetonCaptcha } = await charger();
    const { container } = render(<Captcha action="code" />);
    await laisser();
    expect(container.innerHTML).toBe("");
    expect(document.head.querySelector("script")).toBeNull();
    expect(await jetonCaptcha()).toBeNull();
  });

  it("le script de Cloudflare se charge à la demande de l’écran, une fois ; s’il ne vient pas, l’écran reste là et le suivant réessaie", async () => {
    /* Les scripts ajoutés à la page sont retenus ici, sans se charger (happy-dom ne charge rien, et le dirait en erreur) */
    const ajoutes: HTMLScriptElement[] = [];
    vi.spyOn(document.head, "appendChild").mockImplementation(<T extends Node>(n: T) => (ajoutes.push(n as unknown as HTMLScriptElement), n));
    const { Captcha } = await charger();
    const premier = render(<Captcha action="code" />);
    render(<Captcha action="code" />);
    await laisser();
    expect(ajoutes.map((s) => s.src)).toEqual([SCRIPT_TURNSTILE]);
    /* Bloqué (une extension, le réseau) : rien n’est dessiné */
    act(() => ajoutes[0]!.dispatchEvent(new Event("error")));
    await laisser();
    premier.unmount();
    /* L’écran suivant réessaie ; cette fois le script vient, et le widget se dessine */
    render(<Captcha action="import" />);
    await laisser();
    expect(ajoutes).toHaveLength(2);
    const { turnstile } = fauxTurnstile();
    act(() => ajoutes[1]!.dispatchEvent(new Event("load")));
    await laisser();
    expect(turnstile.render).toHaveBeenCalledOnce();
  });
});

describe("le jeton", () => {
  it("attendu s’il n’est pas encore là, pris une fois : le widget en tire un neuf", async () => {
    const { turnstile, repondre } = fauxTurnstile();
    const { Captcha, jetonCaptcha } = await charger();
    render(<Captcha action="code" />);
    await laisser();
    const attendu = jetonCaptcha();
    repondre("jeton-1");
    expect(await attendu).toBe("jeton-1");
    expect(turnstile.reset).toHaveBeenCalledTimes(1);
    /* Déjà là : pris tout de suite */
    repondre("jeton-2");
    expect(await jetonCaptcha()).toBe("jeton-2");
    expect(turnstile.reset).toHaveBeenCalledTimes(2);
  });

  it("un jeton expiré ne part pas ; personne ne répond : null après le délai (le serveur dira « captcha »)", async () => {
    const { rendus, repondre } = fauxTurnstile();
    const { Captcha, jetonCaptcha } = await charger();
    render(<Captcha action="code" />);
    await laisser();
    repondre("jeton-perime");
    act(() => (rendus[0]!.options["expired-callback"] as () => void)());
    vi.useFakeTimers();
    const attendu = jetonCaptcha(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await attendu).toBeNull();
  });
});

describe("les appels", () => {
  it("la demande de code porte le jeton du widget dans son en-tête", async () => {
    const { repondre } = fauxTurnstile();
    const { Captcha, api } = await charger();
    render(<Captcha action="code" />);
    await laisser();
    repondre("jeton-du-code");
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ email: "noe@exemple.fr" }));
    await api.sendLoginCode("noe@exemple.fr");
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("/api/auth/code");
    expect(new Headers(init?.headers).get(ENTETE_CAPTCHA)).toBe("jeton-du-code");
  });

  it("un import prend d’abord le laissez-passer (le jeton dans l’en-tête), puis envoie ; refusé, il le dit", async () => {
    const { repondre } = fauxTurnstile();
    const { Captcha, api } = await charger();
    render(<Captcha action="import" />);
    await laisser();
    repondre("jeton-de-l-import");
    const appels: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      appels.push(`${String(url)} ${new Headers(init?.headers).get(ENTETE_CAPTCHA) ?? "-"}`);
      return url === "/api/captcha" ? json({ ok: true }) : json({ source: { kind: "export", app: "whatsapp" }, story: { id: "s1" } });
    });
    const conv = new File(["[01/09/2026 10:00:00] Léa: salut\n[01/09/2026 10:01:00] Tom: hey\n"], "_chat.txt", { type: "text/plain" });
    await api.uploadExport(conv);
    expect(appels).toEqual(["/api/captcha jeton-de-l-import", "/api/import -"]);

    /* Le laissez-passer refusé : l’import ne part pas, l’erreur dit « captcha » */
    repondre("jeton-refuse");
    appels.length = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      appels.push(String(url));
      return json({ erreur: "captcha" }, 403);
    });
    await expect(api.uploadExport(conv)).rejects.toMatchObject({ code: "captcha", status: 403 });
    expect(appels).toEqual(["/api/captcha"]);
  });

  it("sans clé publique, ni laissez-passer ni en-tête : les appels partent comme avant", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const { api } = await charger();
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ email: "noe@exemple.fr" }));
    await api.sendLoginCode("noe@exemple.fr");
    expect(f).toHaveBeenCalledOnce();
    expect(new Headers(f.mock.calls[0]![1]?.headers).has(ENTETE_CAPTCHA)).toBe(false);
  });
});
