import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Le second canal des alertes (src/server/telegram.ts, src/server/alertes.ts) : Telegram, qui ne dépend pas du
 * prestataire de mails (OPS-3). Les mails, les limites et la configuration sont simulés ; Telegram, sur un faux fetch.
 */
const etat = vi.hoisted(() => ({ mailEchoue: false, mails: [] as string[], telegram: true }));
vi.mock("@/server/env", async (original) => {
  const m = await original<typeof import("@/server/env")>();
  return {
    ...m,
    env: () => ({
      ...m.env(),
      BLUSH_ALERTES: ["equipe@exemple.fr"],
      RESEND_API_KEY: "re_test",
      ...(etat.telegram ? { TELEGRAM_BOT_TOKEN: "123456:ABCdefGHIjklMNOpqrSTUvwx", TELEGRAM_CHAT_ID: "-100987" } : {}),
    }),
  };
});
vi.mock("@/server/email", async (original) => ({
  ...(await original<typeof import("@/server/email")>()),
  envoyerMail: async (_pour: unknown, mail: { sujet: string }) => {
    if (etat.mailEchoue) throw new Error("Resend a répondu 500");
    etat.mails.push(mail.sujet);
    return true;
  },
}));
vi.mock("@/server/limites", async (original) => ({ ...(await original<typeof import("@/server/limites")>()), sousLaLimite: async () => true, limiteAtteinte: async () => false }));

import { alerter } from "@/server/alertes";

const envois: { url: string; corps: { chat_id: string; text: string; disable_web_page_preview: boolean } }[] = [];
beforeEach(() => {
  Object.assign(etat, { mailEchoue: false, mails: [], telegram: true });
  envois.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      envois.push({ url, corps: JSON.parse(init.body as string) });
      return Response.json({ ok: true });
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("le second canal des alertes : Telegram", () => {
  it("une alerte importante part par mail et sur Telegram, en texte brut, sans aperçu de lien ; une ordinaire, par mail seulement", async () => {
    await alerter("budget de l’IA atteint", ["Le budget du jour est atteint."], { importante: true });
    expect(etat.mails).toEqual(["BLUSH · budget de l’IA atteint"]);
    expect(envois).toHaveLength(1);
    expect(envois[0]!.url).toBe("https://api.telegram.org/bot123456:ABCdefGHIjklMNOpqrSTUvwx/sendMessage");
    expect(envois[0]!.corps).toMatchObject({ chat_id: "-100987", disable_web_page_preview: true });
    expect(envois[0]!.corps.text).toContain("BLUSH · budget de l’IA atteint\nLe budget du jour est atteint.");
    expect(envois[0]!.corps).not.toHaveProperty("parse_mode");
    envois.length = 0;
    await alerter("repli sur un autre modèle", ["catégorie : cyber"]);
    expect(envois).toHaveLength(0);
  });

  it("le mail qui ne part pas (Resend en panne) : même une alerte ordinaire part sur Telegram, et dit que le mail manque", async () => {
    etat.mailEchoue = true;
    await alerter("code de connexion non envoyé", ["Le mail du code n’est pas parti."]);
    expect(envois).toHaveLength(1);
    expect(envois[0]!.corps.text).toContain("Le mail de cette alerte n’est pas parti");
  });

  it("sans bot branché, rien ne part sur Telegram ; Telegram qui refuse ne fait jamais échouer l’alerte", async () => {
    etat.telegram = false;
    await alerter("budget de l’IA atteint", ["x"], { importante: true });
    expect(envois).toHaveLength(0);
    etat.telegram = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("non", { status: 401 })),
    );
    await expect(alerter("budget de l’IA atteint", ["x"], { importante: true })).resolves.toBeUndefined();
    /* Les deux mails sont partis (sans bot, puis avec un bot refusé) */
    expect(etat.mails).toHaveLength(2);
  });
});
