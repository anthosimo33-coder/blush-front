import { readFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Les vocaux du chat, bornés (S-13, S-15, S-17) : un vocal reçu se mesure avant d’être transcrit (sa durée, trame par
 * trame), un compte en envoie un nombre limité par jour ; la voix dit un texte coupé, dans le budget du compte et du
 * mois, sinon la réponse reste écrite ; ce que le prestataire garde d’un appel est effacé après lui, et chaque appel est
 * noté dans le suivi des coûts. La route est appelée comme le ferait le navigateur (cookies simulés, after() gardé pour
 * être lancé à la main). Le prestataire est simulé (fetch) : aucun appel ne sort.
 */
const etat = vi.hoisted(() => ({ cookies: new Map<string, string>(), apres: [] as (() => unknown)[], prestataire: false }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (etat.cookies.has(n) ? { name: n, value: etat.cookies.get(n)! } : undefined),
    has: (n: string) => etat.cookies.has(n),
    set: (n: string, v: string) => etat.cookies.set(n, v),
    delete: (n: string | { name: string }) => etat.cookies.delete(typeof n === "string" ? n : n.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (f: () => unknown) => etat.apres.push(f) }));
/* Le prestataire branché : une clé et une voix fictives, sans le modèle factice (seules la voix et la transcription sont appelées) */
vi.mock("@/server/env", async (original) => {
  const o = await original<typeof import("@/server/env")>();
  return {
    ...o,
    env: () => (etat.prestataire ? { ...o.env(), BLUSH_IA_FACTICE: false, ELEVENLABS_API_KEY: "cle-fictive", BLUSH_VOIX_A: "voix-fictive", MISTRAL_API_KEY: undefined } : o.env()),
  };
});

import { POST } from "@/app/api/chat/route";
import { ouvrirSession } from "@/server/auth";
import { db, schema } from "@/server/db";
import { cleDeLimiteDuCompte } from "@/server/email-canonique";
import { COUPE_VOIX, dire, ErreurVoix, VOIX_PAR_MOIS } from "@/server/ia/voix";
import { DUREE_VOCAL_MAX_S, TAILLE_VOCAL_MAX, transcrire } from "@/server/ia/transcription";
import { compteDe, compter, LIMITES } from "@/server/limites";
import { empreinte } from "@/server/chiffrement";
import type { Utilisateur } from "@/server/auth";
import type { EvenementChat } from "@/types";
import { compteDeTest, histoireLue } from "./aide/fixtures";

let id = "";
let compte: Utilisateur;
const ETIQUETTES = ["vocal_voix", "vocal_transcription"];

/** Un vocal de tests/aide/vocaux (voir tests/unit/voix.test.ts), en fichier comme l’envoie le navigateur. */
const vocal = (nom: string, type = nom.endsWith(".webm") ? "audio/webm" : "audio/mp4") => new File([readFileSync(`tests/aide/vocaux/${nom}`)], nom, { type });
const envoyerVocal = (f: File, flux = false) => {
  const fd = new FormData();
  fd.append("vocal", f);
  return POST(new Request("http://localhost/api/chat", { method: "POST", headers: { origin: "http://localhost", "x-forwarded-host": "localhost", ...(flux ? { accept: "application/x-ndjson" } : {}) }, body: fd }));
};
const envoyerTexte = (texte: string) =>
  POST(new Request("http://localhost/api/chat", { method: "POST", headers: { origin: "http://localhost", "x-forwarded-host": "localhost", "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ texte }) }));
const lancerApres = async () => {
  while (etat.apres.length) await etat.apres.shift()!();
};
const cle = (nom: "vocal" | "voix") => cleDeLimiteDuCompte(nom, compte.email);
const usages = () => db().select().from(schema.aiUsage).where(and(eq(schema.aiUsage.storyId, id), inArray(schema.aiUsage.task, ETIQUETTES)));
const oublierLesCompteurs = () => db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, [empreinte(`limite:${cle("vocal")}`), empreinte(`limite:${cle("voix")}`)]));

beforeAll(async () => {
  compte = await compteDeTest("vocal-chat", "blushplus");
  id = (await histoireLue(compte, "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id;
  await lancerApres();
  etat.cookies.set("blush-session", (await ouvrirSession(compte.id)).secret);
});
beforeEach(async () => {
  etat.prestataire = false;
  await oublierLesCompteurs();
  await db().update(schema.stories).set({ chatVocal: false }).where(eq(schema.stories.id, id));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await lancerApres();
  etat.prestataire = false;
});
afterAll(async () => {
  await db().delete(schema.aiUsage).where(and(eq(schema.aiUsage.storyId, id), inArray(schema.aiUsage.task, ETIQUETTES)));
  await oublierLesCompteurs();
});

describe("un vocal reçu (S-15) : mesuré avant d’être transcrit", () => {
  it("un vocal de 3 s est transcrit et lu comme un message ; il compte dans les vocaux du jour", async () => {
    const r = await envoyerVocal(vocal("court.webm"));
    expect(r.status).toBe(200);
    expect(await compteDe(cle("vocal"), LIMITES.vocalParCompte)).toBe(1);
  });

  it(`un vocal de 140 s, même très léger : refusé (« vocal »), sans transcription ni vocal compté (au plus ${DUREE_VOCAL_MAX_S} s)`, async () => {
    const f = vocal("long.webm");
    expect(f.size).toBeLessThan(200_000);
    const r = await envoyerVocal(f);
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ erreur: "vocal" });
    expect(await compteDe(cle("vocal"), LIMITES.vocalParCompte)).toBe(0);
  });

  it("un fichier qui n’est pas un vocal d’enregistreur : « vocal_vide », et trop lourd : « vocal », sans être lu", async () => {
    const bruit = new File([Uint8Array.from({ length: 4096 }, (_, i) => (i * 7919) % 251)], "vocal.webm", { type: "audio/webm" });
    let r = await envoyerVocal(bruit);
    expect([r.status, await r.json()]).toEqual([422, { erreur: "vocal_vide" }]);
    r = await envoyerVocal(new File([new Uint8Array(TAILLE_VOCAL_MAX + 1)], "vocal.webm", { type: "audio/webm" }));
    expect([r.status, await r.json()]).toEqual([422, { erreur: "vocal" }]);
  });

  it(`au-delà de ${LIMITES.vocalParCompte.max} vocaux dans la journée : « trop »`, async () => {
    await compter(cle("vocal"), LIMITES.vocalParCompte, LIMITES.vocalParCompte.max);
    const r = await envoyerVocal(vocal("court.m4a"));
    expect([r.status, await r.json()]).toEqual([429, { erreur: "trop" }]);
  });
});

describe("la voix (S-13) : un texte coupé, dans le budget du compte et du mois", () => {
  const long = "Elle t’a répondu ok. Mais trois heures après, franchement. ".repeat(20);

  it(`un texte trop long est coupé (${COUPE_VOIX.chat} caractères pour le chat) ; ce qui est dit compte pour le compte`, async () => {
    const { alignement } = await dire(long, "A", { sobre: false, storyId: id });
    expect(alignement.characters.length).toBeLessThanOrEqual(COUPE_VOIX.chat);
    /* À la fin d’une phrase */
    expect(alignement.characters.join("")).toMatch(/(ok|franchement)\.$/);
    expect(await compteDe(cle("voix"), LIMITES.voixParCompte)).toBe(alignement.characters.length);
  });

  it("au-delà des caractères du jour du compte : rien n’est dit (voix_budget_compte)", async () => {
    await compter(cle("voix"), LIMITES.voixParCompte, LIMITES.voixParCompte.max - 10);
    const essai = dire("Bon. Hugo, assieds-toi.", "A", { sobre: false, storyId: id });
    await expect(essai).rejects.toBeInstanceOf(ErreurVoix);
    await expect(essai).rejects.toMatchObject({ code: "voix_budget_compte" });
    expect(await compteDe(cle("voix"), LIMITES.voixParCompte)).toBe(LIMITES.voixParCompte.max - 10);
  });

  it("au-delà du plafond du mois, pour tous : rien n’est dit (voix_budget_mois)", async () => {
    const [ligne] = await db()
      .insert(schema.aiUsage)
      .values({ storyId: id, task: "vocal_voix", model: "test", outputTokens: VOIX_PAR_MOIS - 5 })
      .returning({ id: schema.aiUsage.id });
    try {
      await expect(dire("Bon. Hugo, assieds-toi.", "A", { sobre: false, storyId: id })).rejects.toMatchObject({ code: "voix_budget_mois" });
    } finally {
      await db().delete(schema.aiUsage).where(eq(schema.aiUsage.id, ligne.id));
    }
  });

  it("en mode vocal, le budget du compte épuisé : la réponse reste écrite, sans vocal", async () => {
    await db().update(schema.stories).set({ chatVocal: true }).where(eq(schema.stories.id, id));
    await compter(cle("voix"), LIMITES.voixParCompte, LIMITES.voixParCompte.max);
    const r = await envoyerTexte("et là je lui dis quoi ?");
    const evenements = (await r.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as EvenementChat);
    expect(evenements.map((e) => Object.keys(e)[0])).toEqual(["reponse", "vocal"]);
    const [fin, voix] = evenements;
    if (!("reponse" in fin) || fin.reponse.kind !== "bubbles") throw new Error("une réponse en bulles");
    expect(fin.reponse.bubbles.length).toBeGreaterThan(0);
    expect(voix).toEqual({ vocal: null });
  });
});

describe("chez le prestataire (S-17) : rien de gardé, tout noté", () => {
  /** Le prestataire simulé : la voix rend un son et son élément d’historique, la transcription un texte et son identifiant. */
  function simuler() {
    const appels: { url: string; methode: string; corps?: string; cle?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        appels.push({ url, methode: init.method ?? "GET", corps: typeof init.body === "string" ? init.body : undefined, cle: new Headers(init.headers).get("xi-api-key") ?? undefined });
        if (init.method === "DELETE") return Response.json({ status: "ok" });
        if (url.includes("/v1/text-to-speech/")) {
          const { text } = JSON.parse(String(init.body)) as { text: string };
          const c = [...text];
          return Response.json(
            { audio_base64: Buffer.from("son").toString("base64"), alignment: { characters: c, character_start_times_seconds: c.map((_, i) => i * 0.05), character_end_times_seconds: c.map((_, i) => (i + 1) * 0.05) } },
            { headers: { "history-item-id": "element42" } },
          );
        }
        if (url.includes("/v1/speech-to-text")) return Response.json({ text: " bon elle m’a répondu ", transcription_id: "transcription42" });
        return new Response(null, { status: 404 });
      }),
    );
    etat.prestataire = true;
    return appels;
  }

  it("un vocal dit : le texte coupé part avec les réglages nommés, son élément d’historique est effacé après, son coût est noté", async () => {
    const appels = simuler();
    await dire("Elle t’a répondu ok. Mais trois heures après, franchement. ".repeat(20), "A", { sobre: true, storyId: id });
    const [voix] = appels;
    expect(voix.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voix-fictive/with-timestamps?output_format=mp3_44100_96");
    const corps = JSON.parse(voix.corps!) as { text: string; voice_settings: unknown };
    expect(corps.text.length).toBeLessThanOrEqual(COUPE_VOIX.chat);
    expect(corps.voice_settings).toEqual({ stability: 0.5, similarity_boost: 0.75, style: 0.2 });
    await lancerApres();
    expect(appels.slice(1)).toEqual([{ url: "https://api.elevenlabs.io/v1/history/element42", methode: "DELETE", cle: "cle-fictive" }]);
    expect((await usages()).map((u) => [u.task, u.model, u.outputTokens, u.costMicros > 0])).toEqual([["vocal_voix", "eleven_v4", corps.text.length, true]]);
    await db().delete(schema.aiUsage).where(and(eq(schema.aiUsage.storyId, id), inArray(schema.aiUsage.task, ETIQUETTES)));
  });

  it("un vocal transcrit : la transcription est effacée après, sa durée et son coût sont notés", async () => {
    const appels = simuler();
    expect(await transcrire(vocal("court.webm"), { storyId: id, duree: 3.02 })).toBe("bon elle m’a répondu");
    expect(appels[0]).toMatchObject({ url: "https://api.elevenlabs.io/v1/speech-to-text", methode: "POST", cle: "cle-fictive" });
    await lancerApres();
    expect(appels.slice(1)).toEqual([{ url: "https://api.elevenlabs.io/v1/speech-to-text/transcripts/transcription42", methode: "DELETE", cle: "cle-fictive" }]);
    expect((await usages()).map((u) => [u.task, u.model, u.inputTokens, u.costMicros > 0])).toEqual([["vocal_transcription", "scribe_v1", 3, true]]);
    await db().delete(schema.aiUsage).where(and(eq(schema.aiUsage.storyId, id), inArray(schema.aiUsage.task, ETIQUETTES)));
  });
});
