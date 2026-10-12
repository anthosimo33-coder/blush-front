#!/usr/bin/env -S npx tsx --conditions=react-server
/*
 * Test de fumée avec le VRAI modèle (environ 1 \$) : une conv de test courte traverse tout le back-end
 * (verdict, rapport, mémoire, chat) sur la base de DATABASE_URL, puis tout est effacé, même si un pas échoue. Avant une
 * mise en ligne :
 *   DATABASE_URL=… BLUSH_CLE=… ANTHROPIC_API_KEY=… npm run essai:vrai-modele
 * Avec BLUSH_IA_FACTICE=1 à la place de la clé : le même parcours sur le modèle factice, sans rien payer (pour vérifier
 * le script lui-même).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { repondre } from "@/server/chat";
import { db, schema } from "@/server/db";
import { donneesMemoire, donneesVerdict } from "@/server/depot";
import { CASE_IMPORT } from "@/contenu/consentements";
import { definirQui, importer, rattacherBrouillon } from "@/server/histoires";
import { depuisFichier } from "@/server/import";
import { executerChaine } from "@/server/pipeline";
import { planifier } from "@/server/taches";
import { coutDe, EVALS, rapportEnBase, tachesDe } from "../tests/aide/essai";

const email = `vrai-modele-${Date.now()}@blush.test`;
let id: string | null = null;
try {
  const f = new File([readFileSync(join(EVALS, "convs/11-conv-courte.txt"))], "11.txt", { type: "text/plain" });
  const imp = await importer(await depuisFichier(f), { version: CASE_IMPORT.version, le: new Date() });
  id = imp.id;
  const u = (await db().insert(schema.users).values({ email }).returning())[0]!;
  await rattacherBrouillon(u, imp.secret);
  /* Le rapport débloqué d’avance (comme payé) : toute la chaîne s’écrit après le verdict */
  await db().update(schema.stories).set({ debloqueLe: new Date() }).where(eq(schema.stories.id, id));
  await definirQui(id, { moi: imp.meta.participants.findIndex((p) => p.prenom === "Julie") as 0 | 1, pronom: "elle", devinette: "parle", objectif: "comprendre" });
  await planifier(id, "verdict");
  const t0 = Date.now();
  await executerChaine(id);
  const taches = await tachesDe(id);
  console.log("tâches :", taches.map((t) => `${t.kind}:${t.status}${t.error ? `(${t.error})` : ""}`).join(", "), `· ${Math.round((Date.now() - t0) / 1000)} s`);
  const v = await donneesVerdict(id);
  if (v) console.log("verdict :", v.sortie.emoji, v.sortie.titre, "·", v.sortie.sous_titre);
  const r = await rapportEnBase(id);
  if (r) {
    console.log("rapport :", r.chapitres.length, "chapitres ·", r.chapitres.map((c) => c.title).join(" | "));
    console.log("  ch.2 :", JSON.stringify(r.chapitres[1]?.blocks.slice(0, 2)).slice(0, 300));
  }
  const m = await donneesMemoire(id);
  if (m) {
    console.log("mémoire :", m.etat.fiche?.portrait, "· questions :", m.etat.questions?.join(" | "));
    const story = (await db().select().from(schema.stories).where(eq(schema.stories.id, id)))[0]!;
    console.log("conv effacée :", story.conv === null);
    const { reponse } = await repondre(story, m, m.etat.questions?.[0] ?? "il me calcule ou pas ?");
    console.log("chat :", JSON.stringify(reponse).slice(0, 500));
  }
} finally {
  /* Le coût d’abord, même quand un pas a échoué après des appels payés : effacer l’histoire le détache de ses appels (ai_usage.story_id passe à null) */
  if (id) {
    const cout = await coutDe(id).catch(() => null);
    if (cout) console.log(`coût : ${cout.dollars.toFixed(3)} $ en ${cout.appels} appels`);
  }
  /* Le compte emporte son histoire (en cascade) ; une histoire restée brouillon (un pas raté avant le rattachement) s’efface à part */
  await db().delete(schema.users).where(eq(schema.users.email, email));
  if (id) await db().delete(schema.stories).where(eq(schema.stories.id, id));
}
process.exit(0);
