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
let boite: string;
const charger = async () => {
  vi.resetModules();
  return { ...(await import("@/server/env")), ...(await import("@/server/email")) };
};
const mailsDeLaBoite = () => readdirSync(boite).map((f) => JSON.parse(readFileSync(join(boite, f), "utf8")) as Record<string, string>);

beforeEach(() => {
  boite = mkdtempSync(join(tmpdir(), "blush-boite-"));
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BLUSH_BOITE_MAILS", boite);
  vi.stubEnv("RESEND_API_KEY", undefined);
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
    expect(mails.find((m) => m.code)).toMatchObject({ pour: "noe@e2e.blush.test", code: "042917", sujet: "042917 : ton code BLUSH" });
    expect(mails.find((m) => !m.code)).toMatchObject({ pour: "noe@e2e.blush.test", sujet: "Un sujet", texte: "Un texte", html: "<p>Un texte</p>" });
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
    expect(envoi.mock.calls[0][0]).toBe("https://api.resend.com/emails");
    expect(readdirSync(boite)).toHaveLength(0);
  });
});
