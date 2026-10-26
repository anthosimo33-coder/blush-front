import { afterEach, describe, expect, it, vi } from "vitest";
import { domaineRecoitDuMail, emailRecoitDuMail } from "@/server/domaine-email";

/*
 * Le domaine d’un email reçoit-il du mail (src/server/domaine-email.ts) ? Le DNS est un faux : chaque test donne la
 * réponse de ses MX, une erreur, ou le silence. Chaque domaine est propre à son test (les réponses se gardent une heure).
 */
type Mx = { exchange: string; priority: number }[];
const dns = (reponse: Mx | { code: string } | "silence") => {
  const resolveMx = vi.fn(async (): Promise<Mx> => {
    if (reponse === "silence") return new Promise<Mx>(() => {});
    if ("code" in reponse) throw Object.assign(new Error(reponse.code), reponse);
    return reponse;
  });
  return { resolveMx };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("le domaine d’un email", () => {
  it("un domaine connu ne se demande pas au DNS", async () => {
    const d = dns({ code: "ENOTFOUND" });
    expect(await domaineRecoitDuMail("gmail.com", { dns: d })).toBe(true);
    expect(await domaineRecoitDuMail("Hotmail.FR", { dns: d })).toBe(true);
    expect(d.resolveMx).not.toHaveBeenCalled();
  });

  it("des serveurs de mail : oui ; le MX nul (gmail.fr), aucun MX, un domaine qui n’existe pas : non", async () => {
    expect(await domaineRecoitDuMail("avec-mx.fr", { dns: dns([{ exchange: "mx.avec-mx.fr", priority: 10 }]) })).toBe(true);
    expect(await domaineRecoitDuMail("mx-nul.fr", { dns: dns([{ exchange: "", priority: 0 }]) })).toBe(false);
    expect(await domaineRecoitDuMail("sans-mx.fr", { dns: dns({ code: "ENODATA" }) })).toBe(false);
    expect(await domaineRecoitDuMail("inexistant.nett", { dns: dns({ code: "ENOTFOUND" }) })).toBe(false);
  });

  it("le DNS en panne, ou qui ne répond pas en 1,5 s : le doute laisse passer, et ne se garde pas", async () => {
    expect(await domaineRecoitDuMail("panne.fr", { dns: dns({ code: "ESERVFAIL" }) })).toBe(true);
    vi.useFakeTimers();
    const lent = domaineRecoitDuMail("lent.fr", { dns: dns("silence") });
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await lent).toBe(true);
    vi.useRealTimers();
    /* Le doute ne s’est pas gardé : la vraie réponse, ensuite, compte */
    expect(await domaineRecoitDuMail("panne.fr", { dns: dns({ code: "ENOTFOUND" }) })).toBe(false);
  });

  it("une réponse se garde une heure : le même domaine ne se redemande pas", async () => {
    const t = Date.now();
    const d = dns({ code: "ENOTFOUND" });
    expect(await domaineRecoitDuMail("garde.fr", { dns: d, maintenant: t })).toBe(false);
    expect(await domaineRecoitDuMail("garde.fr", { dns: dns([{ exchange: "mx.garde.fr", priority: 10 }]), maintenant: t + 3_599_000 })).toBe(false);
    expect(d.resolveMx).toHaveBeenCalledTimes(1);
    expect(await domaineRecoitDuMail("garde.fr", { dns: dns([{ exchange: "mx.garde.fr", priority: 10 }]), maintenant: t + 3_601_000 })).toBe(true);
  });

  it("sans vrai envoi de mails (ni clé du prestataire, ici) : rien à demander, tout passe", async () => {
    expect(await emailRecoitDuMail("alex@inexistant.test")).toBe(true);
  });
});
