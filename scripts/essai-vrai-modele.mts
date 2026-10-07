#!/usr/bin/env -S npx tsx
/**
 * Test de fumée avec le VRAI modèle (environ 1 \$) : une conv de test courte traverse tout le back-end
 * (verdict, rapport, mémoire, chat) sur la base de DATABASE_URL, puis tout est effacé. Avant une mise en ligne :
 *   NODE_OPTIONS=--conditions=react-server DATABASE_URL=… BLUSH_CLE=… ANTHROPIC_API_KEY=… npx tsx scripts/essai-vrai-modele.mts
 */
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { executerChaine, type DonneesRapport, type DonneesVerdict, type DonneesMemoire } from "@/server/analyse";
import { repondre } from "@/server/chat";
import { dechiffrer } from "@/server/chiffrement";
import { db, schema } from "@/server/db";
import { definirQui, importer, rattacherBrouillon } from "@/server/histoires";
import { planifier } from "@/server/taches";

const email = `vrai-modele-${Date.now()}@blush.test`;
const f = new File([readFileSync("prompts/evals/convs/11-conv-courte.txt")], "11.txt", { type: "text/plain" });
const { id, meta, secret } = await importer(f);
const [u] = await db().insert(schema.users).values({ email, plan: "blushplus" }).returning();
await rattacherBrouillon(u, secret);
await definirQui(id, { moi: meta.participants.findIndex((p) => p.prenom === "Julie") as 0 | 1, pronom: "elle", devinette: "parle", objectif: "comprendre" });
await planifier(id, "verdict");
const t0 = Date.now();
await executerChaine(id);
const taches = await db().select().from(schema.tasks).where(eq(schema.tasks.storyId, id));
console.log("tâches :", taches.map((t) => `${t.kind}:${t.status}${t.error ? `(${t.error})` : ""}`).join(", "), `· ${Math.round((Date.now() - t0) / 1000)} s`);
const [v] = await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, id));
if (v) { const d = dechiffrer<DonneesVerdict>(v.data); console.log("verdict :", d.sortie.emoji, d.sortie.titre, "·", d.sortie.sous_titre); }
const [r] = await db().select().from(schema.reports).where(eq(schema.reports.storyId, id));
if (r?.data) { const d = dechiffrer<DonneesRapport>(r.data); console.log("rapport :", d.chapitres.length, "chapitres ·", d.chapitres.map((c) => c.title).join(" | ")); console.log("  ch.2 :", JSON.stringify(d.chapitres[1]?.blocks.slice(0, 2)).slice(0, 300)); }
const [m] = await db().select().from(schema.memories).where(eq(schema.memories.storyId, id));
if (m) {
  const d = dechiffrer<DonneesMemoire>(m.data);
  console.log("mémoire :", d.etat.fiche?.portrait, "· questions :", d.etat.questions?.join(" | "));
  const [story] = await db().select().from(schema.stories).where(eq(schema.stories.id, id));
  console.log("conv effacée :", story.conv === null);
  const { reponse } = await repondre(story, d, d.etat.questions?.[0] ?? "il me calcule ou pas ?");
  console.log("chat :", JSON.stringify(reponse).slice(0, 500));
}
const [cout] = await db().select({ total: sql<number>`sum(cost_micros)`, n: sql<number>`count(*)` }).from(schema.aiUsage).where(eq(schema.aiUsage.storyId, id));
console.log(`coût : ${(Number(cout.total) / 1e6).toFixed(3)} $ en ${cout.n} appels`);
await db().delete(schema.users).where(eq(schema.users.email, email));
process.exit(0);
