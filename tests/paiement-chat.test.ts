import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { COUT_EN_BULLES } from "@/contenu/offres";
import { refDeLEnvoi, rendre, soldeDe } from "@/server/bulles";
import { payer } from "@/server/paiement-chat";
import { compteDeTest, donnerDesBulles } from "./aide/fixtures";

/*
 * Le paiement d’une réponse du chat (payer, src/server/paiement-chat.ts), appelé seul, hors de sa route : le débit avant
 * le modèle, les bulles rendues d’une réponse en échec, la réponse verrouillée à 0 bulle, et l’envoi déjà payé sous sa
 * clé. Le chemin complet, par POST /api/chat, est dans tests/chat-bulles.test.ts. Une conv qui n’existe pas suffit : le
 * paiement ne lit d’elle que son id et son mode vocal.
 */
const conv = () => ({ id: randomUUID(), chatVocal: false });

describe("payer une réponse du chat", () => {
  it("des captures : 3 bulles débitées d’un coup ; la réponse échoue, elles reviennent une seule fois", async () => {
    const u = await compteDeTest("paiement-chat");
    await donnerDesBulles(u, 5);
    const p = await payer(u, conv(), { fichiers: true, vocal: false, cle: null });
    if (typeof p === "string" || "deja" in p) throw new Error("un paiement");
    expect([p.reglement.cout, p.reglement.verrouillee, await soldeDe(u.id)]).toEqual([COUT_EN_BULLES.ajout, false, 2]);
    await p.rendreSiPasReglee();
    await p.rendreSiPasReglee();
    expect(await soldeDe(u.id)).toBe(5);
  });

  it("à 0 bulle : la réponse s’écrira verrouillée, sans voix, au prix de ce qu’elle joint ; une seconde en même temps répond « bulles »", async () => {
    const u = await compteDeTest("paiement-chat");
    const p = await payer(u, conv(), { fichiers: true, vocal: true, cle: null });
    if (typeof p === "string" || "deja" in p) throw new Error("un paiement");
    expect([p.reglement.verrouillee, p.reglement.ecrit, p.reglement.cout]).toEqual([true, true, COUT_EN_BULLES.ajout]);
    expect(await payer(u, conv(), { fichiers: false, vocal: false, cle: null })).toBe("bulles");
    await p.rendreSiPasReglee();
    expect(await soldeDe(u.id)).toBe(0);
  });

  it("un envoi dont la clé a échoué (ses bulles rendues) : le nouvel essai se paie, une fois, sous la référence de sa réponse", async () => {
    const u = await compteDeTest("paiement-chat");
    await donnerDesBulles(u, 3);
    const story = conv();
    const cle = randomUUID();
    const premier = await payer(u, story, { fichiers: false, vocal: false, cle });
    if (typeof premier === "string" || "deja" in premier) throw new Error("un paiement");
    expect(await rendre(u, refDeLEnvoi(u.id, cle))).toBe(true);
    const second = await payer(u, story, { fichiers: false, vocal: false, cle });
    if (typeof second === "string" || "deja" in second) throw new Error("un nouvel essai payé");
    expect(await soldeDe(u.id)).toBe(2);
  });
});
