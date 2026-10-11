import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

/* « Partager en image » est appelé comme par le navigateur : les cookies de la requête sont simulés */
const cookies = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (cookies.has(n) ? { name: n, value: cookies.get(n)! } : undefined),
    has: (n: string) => cookies.has(n),
    set: (n: string, v: string) => cookies.set(n, v),
    delete: (n: string | { name: string }) => cookies.delete(typeof n === "string" ? n : n.name),
  }),
  headers: async () => new Headers(),
}));

import { POST as imageDuPartage } from "@/app/api/partage/image/route";
import { ouvrirSession } from "@/server/auth";
import { chiffrer } from "@/server/chiffrement";
import * as coffre from "@/server/coffre";
import { cleDeLimiteDuCompte } from "@/server/email-canonique";
import { db, schema } from "@/server/db";
import type { Ligne, Meta } from "@/server/histoires";
import { compter, LIMITES } from "@/server/limites";
import { arreterPartage, ErreurPartage, masqueDe, masquerPrenoms, partager, verdictPartage } from "@/server/partages";
import type { DonneesVerdict } from "@/server/stockage/types";
import type { Chapter } from "@/types";
import { compteDeTest, histoireLue, ligneEnBase } from "./aide/fixtures";

describe("les prénoms dans ce qui se partage", () => {
  it("deviennent des initiales, sans toucher aux mots qui les contiennent", () => {
    expect(masquerPrenoms("Sophie attend que tu parles, Hugo.", ["Hugo", "Sophie"])).toBe("S. attend que tu parles, H.");
    expect(masquerPrenoms("sophie t’attend. Huguette aussi.", ["Hugo", "Sophie"])).toBe("S. t’attend. Huguette aussi.");
    /* Le nom complet de l’export d’abord, puis le prénom seul */
    expect(masquerPrenoms("Inès Martin, ou Inès.", ["Inès", "Inès Martin"])).toBe("I., ou I.");
  });

  it("gardent en clair ceux à garder, même composés d’un nom masqué ; un nom des deux côtés reste masqué", () => {
    expect(masquerPrenoms("Sophie attend que tu parles, Hugo.", ["Sophie"], ["Hugo"])).toBe("S. attend que tu parles, Hugo.");
    expect(masquerPrenoms("Marie t’attend, Jean-Marie.", ["Marie"], ["Jean-Marie"])).toBe("M. t’attend, Jean-Marie.");
    expect(masquerPrenoms("Alex attend Alex.", ["Alex"], ["Alex"])).toBe("A. attend A.");
  });

  it("le masque d’une histoire : l’autre en initiale, ton prénom en clair ; sans « Qui es-tu ? », tout le monde masqué", () => {
    /* Une vraie ligne d’histoire, sans base : un export WhatsApp de 19 messages, sauf ce que `m` change */
    const histoire = (m: Pick<Meta, "participants"> & Partial<Meta>): Ligne => {
      const meta: Meta = { appli: "whatsapp", format: "whatsapp-ios", fichier: "conv.txt", resume: { debut: "2026-09-01", fin: "2026-09-30", total: 19, vocaux: 0 }, ...m };
      const t = new Date();
      return { id: randomUUID(), userId: null, draftToken: null, messageCount: 19, nextMessage: null, meta: chiffrer(meta), context: null, convPurgedAt: null, chatVocal: false, createdAt: t, updatedAt: t };
    };
    const deux = [
      { nom: "Hugo Lemaire", prenom: "Hugo", messages: 10 },
      { nom: "Sophie B", prenom: "Sophie", messages: 9 },
    ];
    expect(masqueDe(histoire({ participants: deux, moi: 0 }))("Sophie B attend Hugo Lemaire.")).toBe("S. attend Hugo Lemaire.");
    expect(masqueDe(histoire({ participants: deux }))("Sophie attend Hugo.")).toBe("S. attend H.");
    /* Des captures : tu es « Moi », ton prénom vient de « Qui es-tu ? » */
    const captures = [
      { nom: "Moi", prenom: "Karim", messages: 10 },
      { nom: "Inès", prenom: "Inès", messages: 9 },
    ];
    expect(masqueDe(histoire({ appli: "instagram", format: "captures", captures: 2, participants: captures, moi: 0 }))("Inès attend Karim, dis-moi.")).toBe("I. attend Karim, dis-moi.");
  });
});

/** Change le verdict gardé de la conv (par le coffre, comme la chaîne l’écrit). */
async function changerVerdict(storyId: string, f: (v: DonneesVerdict) => void) {
  const [{ data }] = await db().select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, storyId));
  const v = coffre.lire("verdicts.data", data);
  f(v);
  await db().update(schema.verdicts).set({ data: coffre.ecrire("verdicts.data", v) }).where(eq(schema.verdicts.storyId, storyId));
}

/** Le lien de partage de l’histoire, s’il existe (lu en base : rien d’autre ne le relit, la feuille le reçoit en le créant). */
async function lienDe(storyId: string): Promise<string | null> {
  const [l] = await db().select({ id: schema.shares.id }).from(schema.shares).where(eq(schema.shares.storyId, storyId));
  return l?.id ?? null;
}

describe("le lien de partage du verdict", () => {
  let story: Ligne;

  beforeAll(async () => {
    const imp = await histoireLue(await compteDeTest("partage"), "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } });
    story = await ligneEnBase(imp.id);
    await changerVerdict(story.id, (v) => (v.sortie.sous_titre = "Sophie attend que tu parles, Hugo."));
  });

  it("montre le verdict seul, le prénom de l’autre masqué (le tien en clair), et reste le même lien", async () => {
    const id = (await partager(story)).id;
    expect(id).toMatch(/^[a-zA-Z0-9]{12}$/);
    expect((await partager(story)).id).toBe(id);
    expect(await lienDe(story.id)).toBe(id);
    const v = await verdictPartage(id);
    expect(Object.keys(v!).sort()).toEqual(["emoji", "subtitle", "title"]);
    expect(v!.subtitle).toBe("S. attend que tu parles, Hugo.");
    /* La feuille de partage reçoit ce que montre le lien, sans le relire */
    expect(await partager(story)).toEqual({ id, verdict: v });
    /* Rien en clair dans la base */
    const [ligne] = await db().select().from(schema.shares).where(eq(schema.shares.id, id));
    expect(ligne.data.toString("utf8")).not.toContain("attend");
  });

  it("repartagé, le même lien montre le verdict tel qu’on le masque aujourd’hui", async () => {
    const id = (await partager(story)).id;
    /* Un lien d’avant : ton prénom y était masqué aussi */
    await db().update(schema.shares).set({ data: chiffrer({ emoji: "🤔", title: "x", subtitle: "S. attend que tu parles, H." }) }).where(eq(schema.shares.id, id));
    expect((await partager(story)).id).toBe(id);
    expect((await verdictPartage(id))!.subtitle).toBe("S. attend que tu parles, Hugo.");
  });

  it("se désactive : le lien ne montre plus rien, et le suivant est un autre lien", async () => {
    const avant = (await partager(story)).id;
    await arreterPartage(story.id);
    expect(await verdictPartage(avant)).toBeNull();
    expect(await lienDe(story.id)).toBeNull();
    const apres = (await partager(story)).id;
    expect(apres).not.toBe(avant);
    await arreterPartage(story.id);
  });

  it("refuse une situation difficile (mode sobre), et un identifiant mal formé", async () => {
    await changerVerdict(story.id, (v) => (v.sortie.mode_sobre = true));
    /* Le verdict redevient partageable même si le test échoue : les autres tests le partagent */
    try {
      await expect(partager(story)).rejects.toEqual(new ErreurPartage("sobre"));
    } finally {
      await changerVerdict(story.id, (v) => (v.sortie.mode_sobre = false));
    }
    expect(await verdictPartage("../../etc")).toBeNull();
  });
});

/*
 * « Partager en image » (POST /api/partage/image) : l’image ne montre jamais ce que l’écran ne montre pas (S-25). La chute
 * d’un chapitre ne se dessine qu’avec l’accès au rapport (sans lui, l’écran ne montre que le verdict, sans chute), et
 * jamais d’une situation difficile (le mode sobre) ; une réponse du chat se dessine comme le fil la montre, mode sobre
 * compris. Un refus ne consomme pas la limite du jour.
 */
describe("partager un moment en image", () => {
  let story: Ligne;
  let compte: { id: string; email: string };
  /** L’échange du chat déjà en base : l’id de ton message. */
  let echange: number;
  /** La chute d’un chapitre, déjà écrit (le rapport en cours d’écriture garde ses chapitres finis). */
  const chute = (n: number): Chapter => ({ number: n, title: `Chapitre ${n}`, tocTitle: `Ch. ${n}`, free: n === 1, blocks: [{ kind: "punchline", text: `La chute ${n}.` }] });
  const dessiner = (corps: unknown) =>
    imageDuPartage(new Request("http://localhost/api/partage/image", { method: "POST", headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "content-type": "application/json" }, body: JSON.stringify(corps) }));
  const passerAuPlan = (plan: "gratuit" | "blushplus") => db().update(schema.users).set({ plan }).where(eq(schema.users.id, compte.id));
  const sobre = (oui: boolean) => changerVerdict(story.id, (v) => (v.sortie.mode_sobre = oui));
  /** Les images comptées aujourd’hui pour ce compte (le passage compté pour les lire compris). */
  const imagesComptees = () => compter(cleDeLimiteDuCompte("image", compte.email), LIMITES.imageParCompte);

  beforeAll(async () => {
    const u = await compteDeTest("partage-image");
    compte = u;
    story = await ligneEnBase((await histoireLue(u, "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id);
    await db()
      .insert(schema.reports)
      .values({ storyId: story.id, partiel: chiffrer([chute(1), chute(2)]) })
      .onConflictDoUpdate({ target: schema.reports.storyId, set: { partiel: chiffrer([chute(1), chute(2)]) } });
    const [toi] = await db()
      .insert(schema.chatMessages)
      .values({ storyId: story.id, role: "toi", data: coffre.ecrire("chat_messages.data:toi", { texte: "Elle m’attend ?" }) })
      .returning({ id: schema.chatMessages.id });
    await db()
      .insert(schema.chatMessages)
      .values({ storyId: story.id, role: "blush", data: coffre.ecrire("chat_messages.data:blush", { reponse: { kind: "bubbles", bubbles: [{ text: "Oui." }] }, resume: "oui" }) });
    echange = toi.id;
    cookies.set("blush-session", (await ouvrirSession(u.id)).secret);
  });

  it("sans l’accès : aucune chute ne se dessine (402), ni celle du chapitre 1, ni un chapitre payant déjà écrit", async () => {
    await passerAuPlan("gratuit");
    for (const chapitre of [1, 2]) {
      const r = await dessiner({ type: "moment", chapitre, bloc: 0 });
      expect(r.status, `chapitre ${chapitre}`).toBe(402);
      expect(await r.json()).toEqual({ erreur: "acces" });
    }
  });

  it("avec l’accès : les chutes se dessinent ; une chute qui n’existe pas reste introuvable", async () => {
    await passerAuPlan("blushplus");
    try {
      for (const chapitre of [1, 2]) {
        const r = await dessiner({ type: "moment", chapitre, bloc: 0 });
        expect(r.status, `chapitre ${chapitre}`).toBe(200);
        expect(r.headers.get("content-type")).toBe("image/png");
      }
      expect((await dessiner({ type: "moment", chapitre: 3, bloc: 0 })).status).toBe(404);
    } finally {
      await passerAuPlan("gratuit");
    }
  });

  it("une réponse du chat se dessine, avec ou sans l’accès ; un échange qui n’est pas là reste introuvable", async () => {
    const r = await dessiner({ type: "reponse", echange });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect((await dessiner({ type: "reponse", echange: echange + 1000 })).status).toBe(404);
  });

  it("en mode sobre : aucune chute ne se partage (409), même avec l’accès ; une réponse du chat, si, comme le fil la montre", async () => {
    await passerAuPlan("blushplus");
    await sobre(true);
    try {
      const chapitre = await dessiner({ type: "moment", chapitre: 1, bloc: 0 });
      expect(chapitre.status).toBe(409);
      expect(await chapitre.json()).toEqual({ erreur: "sobre" });
      const reponse = await dessiner({ type: "reponse", echange });
      expect(reponse.status).toBe(200);
      expect(reponse.headers.get("content-type")).toBe("image/png");
    } finally {
      await sobre(false);
      await passerAuPlan("gratuit");
    }
  });

  it("un refus ne consomme pas la limite du jour ; une image dessinée, si", async () => {
    const avant = await imagesComptees();
    expect((await dessiner({ type: "moment", chapitre: 2, bloc: 0 })).status).toBe(402);
    expect((await dessiner({ type: "reponse", echange: echange + 1000 })).status).toBe(404);
    expect(await imagesComptees()).toBe(avant + 1);
    expect((await dessiner({ type: "reponse", echange })).status).toBe(200);
    expect(await imagesComptees()).toBe(avant + 3);
  });
});
