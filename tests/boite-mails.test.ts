import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * La boîte à mails des tests de bout en bout (BLUSH_BOITE_MAILS) : avec le modèle factice et hors de Vercel, les mails y
 * sont écrits au lieu de partir, et la production n’exige plus Resend ; sans le modèle factice, ou sur Vercel, elle est
 * ignorée (et le modèle factice aussi, sur Vercel). env() garde ses variables au premier appel : chaque cas recharge les
 * modules après avoir posé les siennes.
 */
/* Le quota des mails se compte dans la base (src/server/limites.ts) : ces tests sans base disent ce qu’il répond */
const quota = vi.hoisted(() => ({ libre: true, rendus: [] as number[] }));
vi.mock("@/server/limites", async (original) => ({
  ...(await original<typeof import("@/server/limites")>()),
  dansLeQuotaDesMails: async () => quota.libre,
  rendreAuQuotaDesMails: async (n: number) => void quota.rendus.push(n),
}));

let boite: string;
const charger = async () => {
  vi.resetModules();
  return { ...(await import("@/server/env")), ...(await import("@/server/email")) };
};
const mailsDeLaBoite = () => readdirSync(boite).map((f) => JSON.parse(readFileSync(join(boite, f), "utf8")) as Record<string, string>);

beforeEach(() => {
  quota.libre = true;
  quota.rendus = [];
  boite = mkdtempSync(join(tmpdir(), "blush-boite-"));
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BLUSH_BOITE_MAILS", boite);
  vi.stubEnv("RESEND_API_KEY", undefined);
  vi.stubEnv("RESEND_API_KEY_CODES", undefined);
  vi.stubEnv("BLUSH_EMAIL_FROM_CODES", undefined);
  vi.stubEnv("BLUSH_EMAIL_FROM", undefined);
  vi.stubEnv("BLUSH_EMAIL_FROM_MARKETING", undefined);
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("BLUSH_IA_FACTICE", "1");
  vi.stubEnv("ANTHROPIC_API_KEY", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(boite, { recursive: true, force: true });
});

describe("la boîte à mails des tests de bout en bout", () => {
  it("hors de Vercel : chaque mail est écrit dans la boîte (le code à part), rien ne part, et la production n’exige pas Resend", async () => {
    const envoi = vi.spyOn(globalThis, "fetch");
    const { env, envoyerCodeParEmail, envoyerMail } = await charger();
    expect(() => env()).not.toThrow();
    await envoyerCodeParEmail("noe@e2e.blush.test", "042917");
    await envoyerMail("noe@e2e.blush.test", { sujet: "Un sujet", texte: "Un texte", html: "<p>Un texte</p>" });
    expect(envoi).not.toHaveBeenCalled();
    const mails = mailsDeLaBoite();
    expect(mails).toHaveLength(2);
    expect(mails.find((m) => m.code)).toMatchObject({ pour: "noe@e2e.blush.test", code: "042917", sujet: "042917\u00a0: ton code BLUSH" });
    expect(mails.find((m) => !m.code)).toMatchObject({ pour: "noe@e2e.blush.test", sujet: "Un sujet", texte: "Un texte", html: "<p>Un texte</p>" });
  });

  it("un mail à plusieurs destinataires (les alertes de l’équipe) : un fichier pour chacun ; à personne, rien", async () => {
    const { envoyerMail } = await charger();
    await envoyerMail(["equipe@e2e.blush.test", "nuit@e2e.blush.test"], { sujet: "BLUSH · une alerte", texte: "Tâche t1" });
    await envoyerMail([], { sujet: "Personne", texte: "Rien" });
    const mails = mailsDeLaBoite();
    expect(mails.map((m) => m.pour).sort()).toEqual(["equipe@e2e.blush.test", "nuit@e2e.blush.test"]);
    for (const m of mails) expect(m).toEqual({ pour: m.pour, sujet: "BLUSH · une alerte", texte: "Tâche t1", envoye: expect.any(String) });
  });

  it("sans le modèle factice : la boîte est ignorée, et la production exige Resend", async () => {
    vi.stubEnv("BLUSH_IA_FACTICE", "0");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-cle-fictive");
    await expect(charger().then(({ env }) => env())).rejects.toThrow("RESEND_API_KEY manque en production");
  });

  it("sur Vercel : le modèle factice et la boîte sont ignorés, la production exige le vrai modèle et Resend, et les mails partent par Resend", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(charger().then(({ env }) => env())).rejects.toThrow("ANTHROPIC_API_KEY manque");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-cle-fictive");
    await expect(charger().then(({ env }) => env())).rejects.toThrow("RESEND_API_KEY manque en production");

    vi.stubEnv("RESEND_API_KEY", "re_cle_fictive");
    const envoi = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const { env, envoyerCodeParEmail } = await charger();
    expect(env().BLUSH_IA_FACTICE).toBe(false);
    await envoyerCodeParEmail("noe@e2e.blush.test", "042917");
    expect(envoi).toHaveBeenCalledOnce();
    expect(envoi.mock.calls[0]![0]).toBe("https://api.resend.com/emails");
    expect(readdirSync(boite)).toHaveLength(0);
  });

  it("S-09 · avec une clé réservée aux codes (RESEND_API_KEY_CODES) : les codes partent avec elle, les autres mails avec RESEND_API_KEY", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-cle-fictive");
    vi.stubEnv("RESEND_API_KEY", "re_cle_fictive");
    vi.stubEnv("RESEND_API_KEY_CODES", "re_cle_des_codes");
    const envoi = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 200 }));
    const { envoyerCodeParEmail, envoyerMail, ErreurResend } = await charger();
    await envoyerCodeParEmail("noe@e2e.blush.test", "042917");
    await envoyerMail(["equipe@blush.test", "nuit@blush.test"], { sujet: "BLUSH · une alerte", texte: "Tâche t1" });
    const appels = envoi.mock.calls.map(([, init]) => ({ cle: new Headers(init?.headers).get("authorization"), corps: JSON.parse(String(init?.body)) as Record<string, unknown> }));
    expect(appels[0]).toMatchObject({ cle: "Bearer re_cle_des_codes", corps: { to: ["noe@e2e.blush.test"], subject: "042917\u00a0: ton code BLUSH" } });
    expect(appels[1]).toMatchObject({ cle: "Bearer re_cle_fictive", corps: { to: ["equipe@blush.test", "nuit@blush.test"], text: "Tâche t1" } });
    /* Une alerte n’a que sa version texte */
    expect(appels[1]!.corps).not.toHaveProperty("html");
    /* Un refus du prestataire rejette, avec son statut seul, et rend sa place au quota */
    envoi.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    await expect(envoyerMail("noe@e2e.blush.test", { sujet: "Un sujet", texte: "Un texte" })).rejects.toEqual(new ErreurResend(429));
    expect(quota.rendus).toEqual([1]);
    /* Les codes partent de l’expéditeur de tous les mails, faute du leur */
    expect(appels[0]!.corps.from).toBe("BLUSH <bonjour@askblush.com>");
  });

  it("S-09 · les codes partent de leur propre expéditeur (BLUSH_EMAIL_FROM_CODES), vérifié sur le compte de leur clé", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-cle-fictive");
    vi.stubEnv("RESEND_API_KEY", "re_cle_fictive");
    vi.stubEnv("RESEND_API_KEY_CODES", "re_cle_des_codes");
    vi.stubEnv("BLUSH_EMAIL_FROM_CODES", "BLUSH <code@codes.askblush.com>");
    const envoi = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 200 }));
    const { envoyerCodeParEmail, envoyerMail } = await charger();
    await envoyerCodeParEmail("noe@e2e.blush.test", "042917");
    await envoyerMail("noe@e2e.blush.test", { sujet: "Un sujet", texte: "Un texte" });
    const de = envoi.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { from: string }).from);
    expect(de).toEqual(["BLUSH <code@codes.askblush.com>", "BLUSH <bonjour@askblush.com>"]);
  });

  it("S-09 · au-delà de sa part du quota, un mail ne part pas : la réponse le dit, et le journal aussi", async () => {
    vi.stubEnv("VERCEL", "1");
    /* Le modèle factice des tests serait ignoré sur Vercel, et le journal le dirait (env()) : ici, il n’y est pas */
    vi.stubEnv("BLUSH_IA_FACTICE", "0");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-cle-fictive");
    vi.stubEnv("RESEND_API_KEY", "re_cle_fictive");
    const envoi = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 200 }));
    const journal = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { envoyerMail } = await charger();
    expect(await envoyerMail(["equipe@blush.test", "nuit@blush.test"], { sujet: "BLUSH · une alerte", texte: "Tâche t1" }, { sorte: "alerte" })).toBe(true);
    quota.libre = false;
    expect(await envoyerMail("noe@e2e.blush.test", { sujet: "Un sujet", texte: "Un texte" }, { sorte: "attente" })).toBe(false);
    expect(envoi).toHaveBeenCalledOnce();
    /* Les lignes du journal (du JSON) */
    const lignes = journal.mock.calls.map(([l]) => String(l)).filter((l) => l.startsWith("{"));
    expect(lignes.map((l) => JSON.parse(l) as Record<string, unknown>)).toEqual([expect.objectContaining({ evenement: "mail retenu", sorte: "attente", destinataires: 1 })]);
  });
});

describe("l’expéditeur de chaque mail, et son tag pour la délivrabilité", () => {
  it("expediteurDe : les relances (séquences, relance ②) partent du sous-domaine, la réponse au domaine principal ; tous les autres du domaine principal", async () => {
    const { expediteurDe } = await charger();
    const reglages = { BLUSH_EMAIL_FROM: "BLUSH <bonjour@askblush.com>", BLUSH_EMAIL_FROM_MARKETING: "BLUSH <bonjour@news.askblush.com>" };
    expect(expediteurDe("relance", reglages)).toEqual({ de: "BLUSH <bonjour@news.askblush.com>", repondreA: "bonjour@askblush.com" });
    for (const sorte of ["rapport", "alerte", "attente"] as const) expect(expediteurDe(sorte, reglages), sorte).toEqual({ de: "BLUSH <bonjour@askblush.com>" });
    /* Sans la variable (avant que le sous-domaine existe) : tout part du domaine principal, sans reply_to */
    expect(expediteurDe("relance", { BLUSH_EMAIL_FROM: "BLUSH <bonjour@askblush.com>", BLUSH_EMAIL_FROM_MARKETING: undefined })).toEqual({ de: "BLUSH <bonjour@askblush.com>" });
    /* Un expéditeur sans nom : l’adresse telle quelle */
    expect(expediteurDe("relance", { BLUSH_EMAIL_FROM: "bonjour@askblush.com", BLUSH_EMAIL_FROM_MARKETING: "news@news.askblush.com" })).toEqual({
      de: "news@news.askblush.com",
      repondreA: "bonjour@askblush.com",
    });
  });

  it("chez Resend : la relance part de BLUSH_EMAIL_FROM_MARKETING avec reply_to, le rapport et le code du domaine principal ; chacun avec son tag « sorte »", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-cle-fictive");
    vi.stubEnv("RESEND_API_KEY", "re_cle_fictive");
    vi.stubEnv("BLUSH_EMAIL_FROM_MARKETING", "BLUSH <bonjour@news.askblush.com>");
    const envoi = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 200 }));
    const { envoyerCodeParEmail, envoyerMail } = await charger();
    await envoyerMail("noe@e2e.blush.test", { sujet: "S1", texte: "Le titre de ton paywall" }, { sorte: "relance", suivi: "sequence-s1_haut" });
    await envoyerMail("noe@e2e.blush.test", { sujet: "Relance", texte: "Ton rapport t’attend" }, { sorte: "relance" });
    await envoyerMail("noe@e2e.blush.test", { sujet: "Rapport", texte: "Ton rapport est prêt" });
    await envoyerCodeParEmail("noe@e2e.blush.test", "042917");
    const corps = envoi.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(corps.map((c) => [c.from, c.reply_to, c.tags])).toEqual([
      ["BLUSH <bonjour@news.askblush.com>", "bonjour@askblush.com", [{ name: "sorte", value: "sequence-s1_haut" }]],
      ["BLUSH <bonjour@news.askblush.com>", "bonjour@askblush.com", [{ name: "sorte", value: "relance" }]],
      ["BLUSH <bonjour@askblush.com>", undefined, [{ name: "sorte", value: "rapport" }]],
      ["BLUSH <bonjour@askblush.com>", undefined, [{ name: "sorte", value: "code" }]],
    ]);
  });
});

describe("les cookies Secure", () => {
  const securise = async () => {
    vi.resetModules();
    return (await import("@/server/cookies")).cookieSecurise();
  };

  it("en production : Secure, même avec le modèle factice ou la boîte seuls", async () => {
    vi.stubEnv("BLUSH_BOITE_MAILS", undefined);
    expect(await securise()).toBe(true);
    vi.stubEnv("BLUSH_BOITE_MAILS", boite);
    vi.stubEnv("BLUSH_IA_FACTICE", "0");
    expect(await securise()).toBe(true);
  });

  it("sur Vercel : toujours Secure, même si les variables des tests y traînent", async () => {
    vi.stubEnv("VERCEL", "1");
    expect(await securise()).toBe(true);
  });

  it("sur le serveur des tests de bout en bout (http://localhost) : pas Secure, sans quoi le WebKit de Linux refuse la session", async () => {
    expect(await securise()).toBe(false);
  });

  it("en dev : pas Secure, comme avant", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BLUSH_BOITE_MAILS", undefined);
    expect(await securise()).toBe(false);
  });
});
