#!/usr/bin/env -S npx tsx --conditions=react-server
/*
 * Le prompt 01 (lire des captures) avec le VRAI modèle, comparé mot pour mot à la vérité (prompts/evals/captures/fabriquer.mjs).
 *   DATABASE_URL=… BLUSH_CLE=… ANTHROPIC_API_KEY=… npm run essai:captures -- <dossier des captures> [ordre=1,2,3…]
 * Le dossier se lit depuis le dossier où la commande est tapée.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { versTexteCaptures } from "@prompts/lib/captures";
import { requeteCaptures } from "@prompts/lib/contextes";
import { lire } from "@prompts/lib/conv";
import { Sortie01 } from "@prompts/lib/schemas";
import { appeler } from "@/server/ia/claude";
import { cheminDonne } from "../tests/aide/essai";

const [dossierDonne, ordreArg] = process.argv.slice(2);
const dossier = cheminDonne(dossierDonne);
/* Sans vérité (de vraies captures) : on affiche seulement la transcription */
const sansVerite = !existsSync(join(dossier, "verite.json"));
const verite = (sansVerite ? { aujourdhui: new Date().toISOString().slice(0, 10), autre: "", blocs: [] } : JSON.parse(readFileSync(join(dossier, "verite.json"), "utf8"))) as {
  aujourdhui: string;
  autre: string;
  blocs: { repere: { date: string; heure: string }; messages: { de: "moi" | "autre"; texte: string; media: string | null; reaction: string | null }[] }[];
};
const fichiers = readdirSync(dossier).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort((a, b) => +(a.match(/\d+/)?.[0] ?? 0) - +(b.match(/\d+/)?.[0] ?? 0));
const type = (f: string) => (/\.webp$/i.test(f) ? "image/webp" : /\.jpe?g$/i.test(f) ? "image/jpeg" : "image/png") as "image/png";
const ordre = ordreArg ? ordreArg.split(",").map(Number) : fichiers.map((_, k) => k + 1);
const images = ordre.map((k) => ({ media: type(fichiers[k - 1]!), base64: readFileSync(join(dossier, fichiers[k - 1]!)).toString("base64") }));

const t0 = Date.now();
const a = await appeler(requeteCaptures({ prenom: "Sarah", autre: null, appli: "instagram", aujourdhui: Date.parse(`${verite.aujourdhui}T00:00:00Z`), images }), Sortie01, { etiquette: "essai_captures" });
const c = a.sortie;
if (!c) throw new Error(`sortie illisible (${a.stop})`);

if (sansVerite) {
  console.log(`${Math.round((Date.now() - t0) / 1000)} s · ${a.cout.toFixed(3)} $ · appli ${c.appli} · autre ${c.autre} · doutes : ${c.doutes.join(" ; ") || "aucun"}`);
  console.log(c.captures.map((x) => `capture ${x.numero} → place ${x.place}${x.hors_sujet ? " (hors sujet)" : ""}`).join(" · "));
  for (const b of c.blocs) {
    console.log(b.repere ? `== ${b.repere.date} ${b.repere.heure ?? ""}` : "== (sans repère)");
    for (const m of b.messages) console.log(`  ${m.de === "moi" ? "moi  " : "autre"} : ${m.media ? `[${m.media}] ` : ""}${m.texte}${m.coupe ? "  ⟨coupé⟩" : ""}${m.reaction ? `  ${m.reaction}` : ""}`);
  }
  console.log(`profil : ${c.profil.length ? `\n  ${c.profil.join("\n  ")}` : "rien"}`);
  process.exit(0);
}
/* Comparaison mot pour mot, dans l’ordre (plus longue sous-suite commune) */
/* Une espace entre deux emojis (« 😭 😭 ») ne compte pas comme une erreur */
const norm = (s: string) =>
  s
    .normalize("NFC")
    .replace(/[’‘]/g, "'")
    .replace(/(\p{Extended_Pictographic})\s+(?=\p{Extended_Pictographic})/gu, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const cle = (m: { de: string; texte: string; media: string | null }) => `${m.de}|${m.media ? `[${m.media}]` : norm(m.texte)}`;
const vrais = verite.blocs.flatMap((b) => b.messages);
const lus = c.blocs.flatMap((b) => b.messages);
const A = vrais.map(cle);
const B = lus.map(cle);
const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i]![j] = A[i] === B[j] ? L[i + 1]![j + 1] + 1 : Math.max(L[i + 1]![j], L[i]![j + 1]);
const manques: string[] = [];
const enTrop: string[] = [];
for (let i = 0, j = 0; i < A.length || j < B.length; ) {
  if (i < A.length && j < B.length && A[i] === B[j]) {
    i++;
    j++;
  }
  else if (j < B.length && (i === A.length || L[i]![j + 1] >= L[i + 1]![j])) enTrop.push(B[j++]!);
  else manques.push(A[i++]!);
}
const reperes = c.blocs.filter((b) => b.repere).map((b) => `${b.repere!.date} ${b.repere!.heure ?? ""}`.trim());
const reperesVrais = verite.blocs.map((b) => `${b.repere.date} ${b.repere.heure}`);
const reactions = lus.filter((m) => m.reaction).length;
const texte = versTexteCaptures(c, { aujourdhui: verite.aujourdhui });
const lu = lire(texte.texte, { utilisateur: { prenom: "Sarah", pronom: "elle", nomExport: "Moi" }, autre: { prenom: texte.autre, pronom: "il", nomExport: texte.autre }, format: "captures" });

console.log(`ordre d’envoi ${ordre.join(",")} · ${Math.round((Date.now() - t0) / 1000)} s · ${a.cout.toFixed(3)} $`);
console.log(`messages : ${L[0]![0]} / ${A.length} retrouvés mot pour mot · ${lus.length} écrits · manquants ${manques.length} · en trop ${enTrop.length}`);
console.log(`repères : ${reperes.filter((r) => reperesVrais.includes(r)).length} / ${reperesVrais.length} justes (${reperes.join(" | ")})`);
console.log(`réactions : ${reactions} / 2 · places : ${c.captures.map((x) => `${x.numero}→${x.place}`).join(" ")} · autre : ${c.autre} · doutes : ${c.doutes.join(" ; ") || "aucun"}`);
console.log(`profil : ${c.profil.length ? c.profil.join(" | ") : "rien"} (attendu : rien)`);
console.log(`relu par la lecture : ${lu.messages.length} messages, ${lu.problemes.length} problème(s)`);
for (const m of manques) console.log(`  − manque : ${m}`);
for (const m of enTrop) console.log(`  + en trop : ${m}`);
process.exit(0);
