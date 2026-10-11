import { readFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Les vocaux du chat, bornés (S-13, S-15, S-17) : un vocal reçu se mesure avant d’être transcrit (sa durée, trame par
 * trame), un compte en envoie un nombre limité par jour, et des secondes limitées ; la voix dit un texte coupé, dans le
 * budget du compte et du mois, réservé avant l’appel, sinon la réponse reste écrite et le vocal du rapport attend le
 * lendemain sans écrire son script ; ce que le prestataire garde d’un appel est effacé après lui, et chaque appel est
 * noté dans le suivi des coûts, et dans la dépense du compte. La route est appelée comme le ferait le navigateur (cookies simulés, after() gardé pour
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

import type { Requete } from "@prompts/lib/contextes";
import { POST } from "@/app/api/chat/route";
import { ouvrirSession } from "@/server/auth";
import { cleDeDepense, noterDepense, oublierLeBudget, payeurDuCompte } from "@/server/budget";
import { db, schema } from "@/server/db";
import { cleDeLimiteDuCompte } from "@/server/email-canonique";
import { fournisseurFactice } from "@/server/ia/factice";
import { cleDuMoisDeLaVoix, COUPE_VOIX, dire, ErreurVoix, VOIX_PAR_MOIS } from "@/server/ia/voix";
import { DUREE_VOCAL_MAX_S, TAILLE_VOCAL_MAX } from "@/server/ia/duree-audio";
import { lireVocal, transcrire, type VocalLu } from "@/server/ia/transcription";
import { compteDe, compter, LIMITES } from "@/server/limites";
import { chiffrer, dechiffrer, empreinte } from "@/server/chiffrement";
import { executerChaine } from "@/server/pipeline";
import type { DonneesVocal } from "@/server/stockage/types";
import { planifier } from "@/server/taches";
import { aujourdhuiParis } from "@/server/temps";
import { vocalAJour } from "@/server/vocal";
import type { Utilisateur } from "@/server/auth";
import type { EvenementChat } from "@/types";
import { avecFactice, compteDeTest, histoireLue } from "./aide/fixtures";

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
const cle = (nom: "vocal" | "voix" | "vocal:secondes") => cleDeLimiteDuCompte(nom, compte.email);
/** Un vocal de tests/aide/vocaux, lu comme le lit la route (sa durée, et ce qui part à la transcription). */
const lu = async (nom: string) => (await lireVocal(vocal(nom))) as VocalLu;
const usages = () => db().select().from(schema.aiUsage).where(and(eq(schema.aiUsage.storyId, id), inArray(schema.aiUsage.task, ETIQUETTES)));
const oublierLesCompteurs = () =>
  db()
    .delete(schema.rateLimits)
    .where(inArray(schema.rateLimits.key, [empreinte(`limite:${cle("vocal")}`), empreinte(`limite:${cle("voix")}`), empreinte(`limite:${cle("vocal:secondes")}`)]));
/* Le mois de la voix : chaque test qui le remplit le vide ensuite (le mois du test, et ses alertes) */
const MOIS = { fenetreS: 40 * 86400 };
const oublierLeMois = () => db().delete(schema.rateLimits).where(inArray(schema.rateLimits.key, [cleDuMoisDeLaVoix(), `${cleDuMoisDeLaVoix()}:alerte:1`, `${cleDuMoisDeLaVoix()}:alerte:0.8`].map((c) => empreinte(`limite:${c}`))));

beforeAll(async () => {
  compte = await compteDeTest("vocal-chat", "blushplus");
  id = (await histoireLue(compte, "01-a-deux-doigts.txt", { qui: { moi: "Hugo" } })).id;
  await lancerApres();
  etat.cookies.set("blush-session", (await ouvrirSession(compte.id)).secret);
});
beforeEach(async () => {
  etat.prestataire = false;
  await oublierLesCompteurs();
  await oublierLeMois();
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
  await oublierLeMois();
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

  it(`au-delà de ${LIMITES.secondesVocalParCompte.max} secondes transcrites dans la journée : « trop », et ses secondes rendues`, async () => {
    await compter(cle("vocal:secondes"), LIMITES.secondesVocalParCompte, LIMITES.secondesVocalParCompte.max - 2);
    const r = await envoyerVocal(vocal("court.ogg", "audio/ogg"));
    expect([r.status, await r.json()]).toEqual([429, { erreur: "trop" }]);
    expect(await compteDe(cle("vocal:secondes"), LIMITES.secondesVocalParCompte)).toBe(LIMITES.secondesVocalParCompte.max - 2);
  });

  it("quand BLUSH souffle (le budget de l’IA du compte atteint) : rien n’est transcrit, ni compté", async () => {
    const appels = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", appels);
    etat.prestataire = true;
    const depense = cleDeDepense(payeurDuCompte(compte), aujourdhuiParis().iso);
    await noterDepense(payeurDuCompte(compte), 10_000_000);
    try {
      const r = await envoyerVocal(vocal("court.webm"));
      expect([r.status, await r.json()]).toEqual([503, { erreur: "souffle" }]);
      expect(appels).not.toHaveBeenCalled();
      expect(await compteDe(cle("vocal"), LIMITES.vocalParCompte)).toBe(0);
    } finally {
      await db().delete(schema.rateLimits).where(eq(schema.rateLimits.key, empreinte(`limite:${depense}`)));
      oublierLeBudget();
    }
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

  it(`le chat laisse au vocal du rapport sa coupe entière (${COUPE_VOIX.rapport} caractères) dans le jour du compte`, async () => {
    const avant = LIMITES.voixParCompte.max - COUPE_VOIX.rapport - 10;
    await compter(cle("voix"), LIMITES.voixParCompte, avant);
    await expect(dire("Bon. Hugo, assieds-toi.", "A", { sobre: false, storyId: id })).rejects.toMatchObject({ code: "voix_budget_compte" });
    const { alignement } = await dire("Bon. Hugo, assieds-toi.", "A", { sobre: false, storyId: id, pour: "rapport" });
    expect(await compteDe(cle("voix"), LIMITES.voixParCompte)).toBe(avant + alignement.characters.length);
  });

  it("deux vocaux en même temps, quand il n’en reste que pour un : un seul est dit (les caractères sont réservés d’un coup)", async () => {
    const phrase = "Elle t’a répondu ok, mais trois heures après, et toi tu cours encore derrière elle. ".repeat(3).trim();
    const plafond = LIMITES.voixParCompte.max - COUPE_VOIX.rapport;
    await compter(cle("voix"), LIMITES.voixParCompte, plafond - phrase.length - 10);
    const issues = await Promise.allSettled([1, 2].map(() => dire(phrase, "A", { sobre: false, storyId: id })));
    expect(issues.map((i) => i.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await compteDe(cle("voix"), LIMITES.voixParCompte)).toBe(plafond - 10);
  });

  it("au-delà du plafond du mois, pour tous : rien n’est dit (voix_budget_mois), l’équipe prévenue une fois", async () => {
    await compter(cleDuMoisDeLaVoix(), MOIS, VOIX_PAR_MOIS - 5);
    try {
      const sorties = [vi.spyOn(console, "log").mockImplementation(() => {}), vi.spyOn(console, "info").mockImplementation(() => {})];
      for (let i = 0; i < 2; i++) await expect(dire("Bon. Hugo, assieds-toi.", "A", { sobre: false, storyId: id })).rejects.toMatchObject({ code: "voix_budget_mois" });
      expect(await compteDe(cleDuMoisDeLaVoix(), MOIS)).toBe(VOIX_PAR_MOIS - 5);
      /* L’alerte (en développement, son mail écrit dans la console) : une seule fois */
      const alertes = sorties.flatMap((s) => s.mock.calls.flat()).filter((l) => String(l).includes("voix du mois atteinte"));
      expect(alertes).toHaveLength(1);
      /* Le compte du jour non plus n’a rien gardé */
      expect(await compteDe(cle("voix"), LIMITES.voixParCompte)).toBe(0);
    } finally {
      await oublierLeMois();
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

  it("le vocal du rapport, le budget de la voix du compte épuisé : son script n’est pas écrit, il attend sans user d’essai ni alerter, puis repart le lendemain", async () => {
    /* Un vocal d’une ancienne version du script : il est à refaire */
    const [brut] = await db().select().from(schema.vocals).where(eq(schema.vocals.storyId, id));
    await db()
      .update(schema.vocals)
      .set({ data: chiffrer({ ...dechiffrer<DonneesVocal>(brut.data), version: 1 }) })
      .where(eq(schema.vocals.storyId, id));
    expect(await vocalAJour(id)).toBe(false);
    const taches: string[] = [];
    const compteur = (req: Requete) => (taches.push(req.tache), fournisseurFactice(req));
    await compter(cle("voix"), LIMITES.voixParCompte, LIMITES.voixParCompte.max - COUPE_VOIX.rapport + 1);
    await planifier(id, "vocal");
    await avecFactice(compteur, () => executerChaine(id));
    const derniere = async () =>
      (await db().select().from(schema.tasks).where(and(eq(schema.tasks.storyId, id), eq(schema.tasks.kind, "vocal"))).orderBy(schema.tasks.createdAt)).at(-1)!;
    /* Le script du vocal (prompt 06) n’est pas écrit */
    expect(taches).not.toContain("06-vocal");
    expect(await derniere()).toMatchObject({ status: "echec", error: "voix_budget", attempts: 0 });
    expect(await vocalAJour(id)).toBe(false);
    /* Le lendemain : le jour du compte repart de zéro, la tâche aussi */
    await oublierLesCompteurs();
    await db().update(schema.tasks).set({ updatedAt: new Date(Date.now() - 2 * 86400e3) }).where(eq(schema.tasks.id, (await derniere()).id));
    await avecFactice(compteur, () => executerChaine(id));
    expect(taches.filter((t) => t === "06-vocal")).toHaveLength(1);
    expect(await derniere()).toMatchObject({ status: "fini" });
    expect(await vocalAJour(id)).toBe(true);
  });
});

describe("chez le prestataire (S-17) : rien de gardé, tout noté", () => {
  /** Le fichier reçu par la transcription simulée. */
  let envoye: File | undefined;
  /**
   * Le prestataire simulé : la voix rend un son et son élément d’historique, la transcription un texte et son
   * identifiant. Les variantes : sans identifiant, la voix en panne (`voix`) ou sans alignement, l’effacement qui répond
   * `effacement`, la transcription dont le dernier mot finit à `fin` secondes.
   */
  function simuler({ sansIdentifiant = false, voix = 200, sansAlignement = false, effacement = 200, fin }: { sansIdentifiant?: boolean; voix?: number; sansAlignement?: boolean; effacement?: number; fin?: number } = {}) {
    const appels: { url: string; methode: string; corps?: string; cle?: string }[] = [];
    envoye = undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        appels.push({ url, methode: init.method ?? "GET", corps: typeof init.body === "string" ? init.body : undefined, cle: new Headers(init.headers).get("xi-api-key") ?? undefined });
        if (init.method === "DELETE") return effacement === 200 ? Response.json({ status: "ok" }) : new Response(null, { status: effacement });
        if (url.includes("/v1/text-to-speech/")) {
          if (voix !== 200) return new Response(null, { status: voix });
          const { text } = JSON.parse(String(init.body)) as { text: string };
          const c = [...text];
          const alignment = { characters: c, character_start_times_seconds: c.map((_, i) => i * 0.05), character_end_times_seconds: c.map((_, i) => (i + 1) * 0.05) };
          return Response.json({ audio_base64: Buffer.from("son").toString("base64"), ...(sansAlignement ? {} : { alignment }) }, { headers: sansIdentifiant ? {} : { "history-item-id": "element42" } });
        }
        if (url.includes("/v1/speech-to-text")) {
          envoye = (init.body as FormData).get("file") as File;
          return Response.json({ text: " bon elle m’a répondu ", ...(sansIdentifiant ? {} : { transcription_id: "transcription42" }), ...(fin ? { words: [{ text: "bon", end: fin }] } : {}) });
        }
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

  it("un vocal transcrit : ce qui part est l’Ogg réécrit, la transcription est effacée après, sa durée et son coût sont notés", async () => {
    const appels = simuler();
    expect(await transcrire(await lu("court.webm"), { storyId: id, compte })).toBe("bon elle m’a répondu");
    expect(appels[0]).toMatchObject({ url: "https://api.elevenlabs.io/v1/speech-to-text", methode: "POST", cle: "cle-fictive" });
    expect(String.fromCharCode(...new Uint8Array(await envoye!.arrayBuffer()).subarray(0, 4))).toBe("OggS");
    expect(envoye!.name).toBe("vocal.ogg");
    await lancerApres();
    expect(appels.slice(1)).toEqual([{ url: "https://api.elevenlabs.io/v1/speech-to-text/transcripts/transcription42", methode: "DELETE", cle: "cle-fictive" }]);
    expect((await usages()).map((u) => [u.task, u.model, u.inputTokens, u.costMicros > 0])).toEqual([["vocal_transcription", "scribe_v1", 3, true]]);
    expect(await compteDe(cle("vocal:secondes"), LIMITES.secondesVocalParCompte)).toBe(4);
    await db().delete(schema.aiUsage).where(and(eq(schema.aiUsage.storyId, id), inArray(schema.aiUsage.task, ETIQUETTES)));
  });

  it("une transcription facturée plus longue que le vocal mesuré : la durée facturée est notée et comptée pour le compte", async () => {
    simuler({ fin: 600 });
    const alertes = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await transcrire(await lu("court.webm"), { storyId: id, compte })).toBe("bon elle m’a répondu");
    expect(alertes.mock.calls.flat().join("\n")).toContain("transcription plus longue que le vocal mesuré");
    expect((await usages()).map((u) => [u.task, u.inputTokens])).toEqual([["vocal_transcription", 600]]);
    expect(await compteDe(cle("vocal:secondes"), LIMITES.secondesVocalParCompte)).toBe(600);
    await db().delete(schema.aiUsage).where(and(eq(schema.aiUsage.storyId, id), inArray(schema.aiUsage.task, ETIQUETTES)));
  });

  it("une voix ou une transcription réussie sans identifiant : rien à effacer, une alerte au journal (une fois par jour)", async () => {
    const appels = simuler({ sansIdentifiant: true });
    const alertes = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 2; i++) await dire("Bon. Hugo, assieds-toi.", "A", { sobre: false, storyId: id });
    await transcrire(await lu("court.webm"), { storyId: id });
    await lancerApres();
    expect(appels.filter((a) => a.methode === "DELETE")).toEqual([]);
    const lignes = alertes.mock.calls.flat().filter((l) => String(l).includes("sans identifiant"));
    expect(lignes).toHaveLength(2);
    expect(lignes.join("\n")).toMatch(/voix[\s\S]*transcription/);
    await db().delete(schema.aiUsage).where(and(eq(schema.aiUsage.storyId, id), inArray(schema.aiUsage.task, ETIQUETTES)));
  });

  it("la voix en panne (rien de facturé) : les caractères sont rendus ; facturée mais illisible : ils restent comptés, et notés", async () => {
    simuler({ voix: 500 });
    await expect(dire("Bon. Hugo, assieds-toi.", "A", { sobre: false, storyId: id })).rejects.toMatchObject({ code: "voix_500" });
    expect(await compteDe(cle("voix"), LIMITES.voixParCompte)).toBe(0);
    expect(await compteDe(cleDuMoisDeLaVoix(), MOIS)).toBe(0);
    vi.unstubAllGlobals();
    simuler({ sansAlignement: true });
    await expect(dire("Bon. Hugo, assieds-toi.", "A", { sobre: false, storyId: id })).rejects.toMatchObject({ code: "voix_sans_alignement" });
    expect(await compteDe(cle("voix"), LIMITES.voixParCompte)).toBe("Bon. Hugo, assieds-toi.".length);
    expect((await usages()).map((u) => u.task)).toEqual(["vocal_voix"]);
    await db().delete(schema.aiUsage).where(and(eq(schema.aiUsage.storyId, id), inArray(schema.aiUsage.task, ETIQUETTES)));
    await oublierLeMois();
  });

  it("l’effacement : un 404 au bout n’est pas une fuite (information), une clé sans droit d’effacer a son alerte", async () => {
    for (const [statut, niveau, evenement] of [
      [404, "info", "rien de gardé à effacer"],
      [403, "warn", "clé sans droit d’effacement"],
    ] as const) {
      simuler({ effacement: statut });
      const sorties = { info: vi.spyOn(console, "info").mockImplementation(() => {}), warn: vi.spyOn(console, "warn").mockImplementation(() => {}) };
      await dire("Bon. Hugo, assieds-toi.", "A", { sobre: false, storyId: id });
      await lancerApres();
      expect(sorties[niveau].mock.calls.flat().join("\n")).toContain(evenement);
      expect(sorties.warn.mock.calls.flat().join("\n")).not.toContain("rien d’effacé");
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
    await db().delete(schema.aiUsage).where(and(eq(schema.aiUsage.storyId, id), inArray(schema.aiUsage.task, ETIQUETTES)));
    await oublierLeMois();
  });
});
