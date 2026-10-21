#!/usr/bin/env -S npx tsx --conditions=react-server
/*
 * Ce que coûte une lecture payée, étape par étape, avec le VRAI modèle : une conv traverse la chaîne entière (verdict,
 * plan, chapitres, vocal, mémoire) sur la base de DATABASE_URL, comme un rapport débloqué, puis tout est effacé.
 *   DATABASE_URL=… BLUSH_CLE=… ANTHROPIC_API_KEY=… npx tsx --conditions=react-server scripts/mesure-cout-lecture.mts \
 *     <conv.txt> <moi> <pronom de l’autre> <devinette> <objectif> estimer|lancer [plafond en dollars]
 * « estimer » ne paie rien : il compte les jetons d’entrée de chaque appel (count_tokens, gratuit) et en tire un coût
 * probable. « lancer » fait la vraie lecture ; avant chaque appel, il regarde ce que la base a déjà noté (ai_usage,
 * toutes convs confondues) et coupe tout au-delà du plafond (9 $ par défaut).
 * La voix n’est jamais appelée : ses requêtes reçoivent une fausse réponse, et le suivi des coûts note ses caractères
 * au tarif de l’abonnement, comme en ligne. Avec BLUSH_IA_FACTICE=1, le même parcours sur le modèle factice (rien à payer).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { lire, rendre } from "@prompts/lib/conv";
import { AIDE, systeme } from "@prompts/lib/contextes";
import { Etape05, Sortie04, Sortie06, Sortie07 } from "@prompts/lib/schemas";
import { CASE_IMPORT } from "@/contenu/consentements";
import { db, schema } from "@/server/db";
import { iaFactice } from "@/server/env";
import { convDe, definirQui, histoireDe, importer, metaDe, rattacherBrouillon } from "@/server/histoires";
import { definirFournisseur, prestataireSDK } from "@/server/ia/claude";
import { TEXTES } from "@/server/ia/textes.generated";
import { depuisFichier } from "@/server/import";
import { executerChaine } from "@/server/pipeline";
import { planifier } from "@/server/taches";
import { aujourdhuiParis } from "@/server/temps";
import { cheminDonne, rapportEnBase, tachesDe } from "../tests/aide/essai";

const [fichier, moiNom, pronom, devinette, objectif, mode = "estimer", plafondTexte = "9"] = process.argv.slice(2);
const chemin = cheminDonne(fichier);
const PLAFOND_MICROS = Number(plafondTexte) * 1e6;
const MODELE = "claude-opus-5-5";

/* ———— La voix : une fausse réponse, sans jamais appeler le prestataire ———— */
const vraiFetch = globalThis.fetch;
let caracteresDits = 0;
globalThis.fetch = async (entree, init) => {
  const url = typeof entree === "string" ? entree : entree instanceof URL ? entree.href : entree.url;
  if (!url.startsWith("https://api.elevenlabs.io")) return vraiFetch(entree, init);
  if (init?.method === "DELETE") return new Response("{}", { status: 200 });
  const { text } = JSON.parse(String(init?.body)) as { text: string };
  caracteresDits += text.length;
  const chars = [...text];
  const alignment = {
    characters: chars,
    character_start_times_seconds: chars.map((_, i) => i * 0.06),
    character_end_times_seconds: chars.map((_, i) => (i + 1) * 0.06),
  };
  return new Response(JSON.stringify({ audio_base64: Buffer.from("audio factice").toString("base64"), alignment }), {
    status: 200,
    headers: { "content-type": "application/json", "history-item-id": "faux" },
  });
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const depenseEnBase = async () =>
  Number(
    (
      await db()
        .select({ m: sql<string | null>`sum(${schema.aiUsage.costMicros})` })
        .from(schema.aiUsage)
    )[0]?.m ?? 0,
  );

/*
 * Le vrai prestataire, avec le plafond de l’essai : avant de partir, chaque appel réserve son coût au pire (toute son
 * entrée au prix d’une écriture du cache, à 1,6 caractère par jeton (mesuré : 1,7 sur les convs, 2,2 sur les prompts), et tout son max_tokens en sortie). Il ne part que
 * si ce qui est noté en base, les appels en cours et le sien tiennent sous le plafond. Un appel qui échoue garde sa
 * réserve comme dépensée : un appel coupé n’est pas noté en base, mais il est facturé.
 */
const sdk = prestataireSDK(() => client);
let enCours = 0;
let perdus = 0;
definirFournisseur({
  async envoyer(demande, options, envoi) {
    const { params } = demande;
    /* MESURE_SANS=07-memoire,chapitres : ces appels ne partent pas (leur entrée se compte à part, par « estimer ») */
    const sans = process.env.MESURE_SANS?.split(",") ?? [];
    if (sans.includes(demande.requete.tache) || (demande.partie?.startsWith("chapitres") && sans.includes("chapitres")))
      throw new Error(`${demande.requete.tache} ${demande.partie ?? ""} sauté par MESURE_SANS`);
    const caracteres = JSON.stringify(params.system).length + JSON.stringify(params.messages).length + JSON.stringify(params.output_config).length;
    const auPire = Math.round(((caracteres / 1.6) * 5 + params.max_tokens * 20) * (params.model === MODELE ? 1 : 2.5));
    const deja = await depenseEnBase();
    if (deja + perdus + enCours + auPire > PLAFOND_MICROS)
      throw new Error(
        `plafond de l’essai : ${((deja + perdus) / 1e6).toFixed(2)} $ dépensés, ${(enCours / 1e6).toFixed(2)} $ en cours, cet appel jusqu’à ${(auPire / 1e6).toFixed(2)} $`,
      );
    enCours += auPire;
    const nom = `${demande.requete.tache}${demande.partie ? ` (${demande.partie})` : ""}`;
    const t = Date.now();
    try {
      const m = await sdk.envoyer(demande, options, envoi);
      console.log(`  appel ${nom} : ${m.stop_reason}, ${m.model}, ${Math.round((Date.now() - t) / 1000)} s`);
      return m;
    } catch (e) {
      perdus += auPire;
      console.log(`  appel ${nom} en échec après ${Math.round((Date.now() - t) / 1000)} s : ${(e as Error).name} ${(e as { status?: number }).status ?? ""}`);
      throw e;
    } finally {
      enCours -= auPire;
    }
  },
});

const format = (s: z.ZodType) => {
  const { type, schema: json } = betaZodOutputFormat(s);
  return { type, schema: json };
};

/** Les jetons d’entrée d’un appel (count_tokens, gratuit) : le système de la tâche, son texte, son format de sortie. */
async function jetons(tache: "04-verdict" | "05-rapport" | "06-vocal" | "07-memoire", texte: string, schemaSortie: z.ZodType): Promise<number> {
  const cle = tache === "04-verdict" ? "04-verdict" : tache === "05-rapport" ? "05-rapport" : tache === "06-vocal" ? "06-vocal" : "07-memoire";
  const r = await client.beta.messages.countTokens({
    model: MODELE,
    system: [{ type: "text", text: systeme(TEXTES.socle, TEXTES[cle]) }],
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: format(schemaSortie) },
    messages: [{ role: "user", content: [{ type: "text", text: texte }] }],
  });
  return r.input_tokens;
}

const email = `mesure-${Date.now()}@blush.test`;
let id: string | null = null;
const resultat: Record<string, unknown> = { conv: basename(chemin), mode };
try {
  const f = new File([readFileSync(chemin)], basename(chemin), { type: "text/plain" });
  const imp = await importer(await depuisFichier(f), { version: CASE_IMPORT.version, le: new Date() });
  id = imp.id;
  const u = (await db().insert(schema.users).values({ email }).returning())[0]!;
  await rattacherBrouillon(u, imp.secret);
  await db().update(schema.stories).set({ debloqueLe: new Date() }).where(eq(schema.stories.id, id));
  const moi = imp.meta.participants.findIndex((p) => p.prenom === moiNom);
  if (moi < 0) throw new Error(`${moiNom} n’est pas dans la conv (${imp.meta.participants.map((p) => p.prenom).join(", ")})`);
  await definirQui(id, { moi: moi as 0 | 1, pronom: pronom as "il", devinette: devinette as "flou", objectif: objectif as "ensemble" });

  /* La conv telle que la lit le modèle (comme relire, src/server/analyse.ts) */
  const story = (await db().select().from(schema.stories).where(eq(schema.stories.id, id)))[0]!;
  const h = { ...histoireDe(metaDe(story)), aujourdhui: aujourdhuiParis(story.createdAt).iso };
  /* Un seul fichier importé : la conv est en un morceau (plusieurs morceaux, src/server/morceaux.ts, ne passent pas ici) */
  const conv = convDe(story);
  if (typeof conv !== "string") throw new Error("une conv en un seul morceau attendue");
  const lu = lire(conv, h, { autresEnTexte: true });
  const rendu = rendre(h, lu);
  const coupee = rendu.conversation.includes("ne sont pas montrés ici");
  Object.assign(resultat, { messages: lu.messages.length, caracteresLus: rendu.texte.length, coupee });
  console.log(`${basename(chemin)} : ${lu.messages.length} messages, ${rendu.texte.length} caractères lus${coupee ? " (coupée à CONV_MAX)" : ""}`);

  if (mode === "estimer") {
    /* Les blocs que le code ajoute après la conv (verdict, plan, rapport court) : comptés à part, à leur taille habituelle */
    const conv = `${rendu.texte}\n${AIDE}`;
    const verdict = await jetons("04-verdict", conv, Sortie04);
    const rapport = await jetons("05-rapport", conv, Etape05);
    const memoire = await jetons("07-memoire", conv, Sortie07);
    const vocal = await jetons("06-vocal", "x".repeat(12_000), Sortie06);
    const AJOUT = { verdict: 2500, plan: 3000, rapportCourt: 4000 };
    /* Ce que le modèle écrit (réflexion comprise) : une hypothèse prudente, plus le plafond de chaque appel */
    const SORTIE = { verdict: 10_000, plan: 10_000, moitie: 20_000, vocal: 5_000, memoire: 20_000 };
    const PLAFOND = { verdict: 16_000, plan: 64_000, moitie: 64_000, vocal: 12_000, memoire: 32_000 };
    const e = (n: number) => (n * 4) / 1e6;
    const s = (n: number) => (n * 20) / 1e6;
    const entree = {
      verdict: e(verdict),
      /* Le plan écrit le cache (conv + verdict), les deux moitiés le relisent */
      plan: ((rapport + AJOUT.verdict) * 5) / 1e6,
      moities: 2 * (((rapport + AJOUT.verdict) * 0.2) / 1e6 + e(AJOUT.plan + 100)),
      vocal: e(vocal),
      memoire: e(memoire + AJOUT.verdict + AJOUT.rapportCourt),
    };
    const sortieProbable = s(SORTIE.verdict + SORTIE.plan + 2 * SORTIE.moitie + SORTIE.vocal + SORTIE.memoire);
    const sortieMax = s(PLAFOND.verdict + PLAFOND.plan + 2 * PLAFOND.moitie + PLAFOND.vocal + PLAFOND.memoire);
    const totalEntree = Object.values(entree).reduce((a, b) => a + b, 0);
    Object.assign(resultat, {
      jetons: { verdict, rapport, memoire, vocal },
      entree,
      probable: totalEntree + sortieProbable,
      auPire: totalEntree + sortieMax,
    });
    console.log(`jetons d’entrée : verdict ${verdict}, rapport ${rapport}, mémoire ${memoire}, vocal ${vocal}`);
    console.log(`coût probable ${(totalEntree + sortieProbable).toFixed(2)} $ (entrée ${totalEntree.toFixed(2)} $), au pire ${(totalEntree + sortieMax).toFixed(2)} $`);
  } else {
    if (!iaFactice()) console.log(`déjà dépensé dans cette base : ${((await depenseEnBase()) / 1e6).toFixed(3)} $, plafond ${PLAFOND_MICROS / 1e6} $`);
    await planifier(id, "verdict");
    const t0 = Date.now();
    /* Sans le secret du relais, la chaîne s’arrête à l’échéance d’une fonction (300 s) : on la relance comme le ferait le relais */
    for (let relais = 0; relais < 8; relais++) {
      await executerChaine(id, { relais });
      const taches = await tachesDe(id);
      if (!taches.some((t) => t.status === "attente" || t.status === "en_cours")) break;
      console.log(`  relais ${relais + 1}`);
    }
    const taches = await tachesDe(id);
    const s = Math.round((Date.now() - t0) / 1000);
    console.log("tâches :", taches.map((t) => `${t.kind}:${t.status}${t.error ? `(${t.error})` : ""}×${t.attempts}`).join(", "), `· ${s} s`);
    const r = await rapportEnBase(id);
    const appels = await db().select().from(schema.aiUsage).where(eq(schema.aiUsage.storyId, id)).orderBy(schema.aiUsage.createdAt);
    Object.assign(resultat, {
      secondes: s,
      taches: taches.map((t) => ({ genre: t.kind, statut: t.status, erreur: t.error, essais: t.attempts })),
      chapitres: r?.chapitres.length ?? 0,
      caracteresDits,
      reserveDesAppelsEnEchec: perdus / 1e6,
      appels: appels.map((a) => ({
        tache: a.task,
        modele: a.model,
        entree: a.inputTokens,
        cacheLu: a.cacheReadTokens,
        cacheEcrit: a.cacheWriteTokens,
        sortie: a.outputTokens,
        dollars: a.costMicros / 1e6,
        secondes: Math.round(a.ms / 100) / 10,
      })),
      total: appels.reduce((n, a) => n + a.costMicros, 0) / 1e6,
    });
    console.table((resultat.appels as object[]).map((a) => a));
    console.log(`total : ${(resultat.total as number).toFixed(3)} $ en ${appels.length} appels · ${r?.chapitres.length ?? 0} chapitres`);
  }
} finally {
  writeFileSync(`${process.env.MESURE_SORTIE ?? "."}/mesure-${basename(chemin, ".txt")}-${mode}.json`, JSON.stringify(resultat, null, 2));
  /* Le compte emporte son histoire ; une histoire restée brouillon s’efface à part. Les lignes d’ai_usage restent (sans histoire) : le plafond les compte encore */
  await db().delete(schema.users).where(eq(schema.users.email, email));
  if (id) await db().delete(schema.stories).where(eq(schema.stories.id, id));
}
process.exit(0);
