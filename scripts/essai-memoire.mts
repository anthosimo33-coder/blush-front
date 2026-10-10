#!/usr/bin/env -S npx tsx
/*
 * La mise à jour de la mémoire avec le VRAI modèle, échange par échange (quelques centimes) : on part d’une mémoire
 * déjà créée (un résultat du 07), et on mesure ce que coûte chaque mise à jour.
 *   NODE_OPTIONS=--conditions=react-server DATABASE_URL=… BLUSH_CLE=… ANTHROPIC_API_KEY=… \
 *     npx tsx scripts/essai-memoire.mts <résultat 07 .json> <echanges .json> <cas .json>
 */
import { readFileSync } from "node:fs";
import { lire, rendre, type Histoire } from "@prompts/lib/conv";
import { appliquerMaj, citees, rendreNouveau, type Echange } from "@prompts/lib/memoire";
import { requeteMemoireMaj } from "@prompts/lib/contextes";
import { Maj07, type Memoire } from "@prompts/lib/schemas";
import { appeler } from "@/server/ia/claude";

const [fichier07, fichierEchanges, fichierCas] = process.argv.slice(2);
const r07 = JSON.parse(readFileSync(fichier07, "utf8"));
const cas = JSON.parse(readFileSync(fichierCas, "utf8")) as Histoire & { id: string; fichier: string };
let etat = r07.etapes.find((e: { moment: string }) => e.moment === "création").sortie as Memoire;
const h: Histoire = { ...cas, format: cas.format ?? "whatsapp-ios" };
const lu = lire(readFileSync(cas.fichier, "utf8"), h);
const tout = rendre(h, lu).lignes;
const lignes = new Map([...new Set(citees(etat))].filter((id) => tout.has(id)).map((id) => [id, tout.get(id)!]));
const suivant = { n: lu.messages.length + 1 };
let total = 0;
for (const ech of (JSON.parse(readFileSync(fichierEchanges, "utf8")) as Record<string, (Echange & { attendu?: string })[]>)[cas.id] ?? []) {
  const nouveau = rendreNouveau(ech, h, lignes, suivant);
  const a = await appeler(requeteMemoireMaj(h, Date.parse(`${ech.date}T00:00:00Z`), etat, lignes, nouveau), Maj07, { etiquette: "essai_memoire" });
  total += a.cout;
  const m = a.sortie;
  console.log(`\n${ech.date} · ${a.cout.toFixed(3)} $ · ${m?.rien_de_neuf ? "rien de neuf" : "mise à jour"}${ech.attendu ? `\n  attendu : ${ech.attendu}` : ""}`);
  if (m && !m.rien_de_neuf) {
    console.log(`  où on en est : ${m.ou_on_en_est ?? "(inchangé)"}`);
    console.log(`  moments : ${m.moments_ajoutes.map((x) => `${x.quand} ${x.quoi}`).join(" | ") || "—"}`);
    console.log(`  conseils : ${m.conseils ? m.conseils.map((c) => `${c.conseil} → ${c.suite}`).join(" | ") : "(inchangés)"}`);
    console.log(`  à venir : ${m.a_venir ? m.a_venir.map((x) => `${x.date} ${x.quoi}`).join(" | ") || "(vide)" : "(inchangé)"}`);
    console.log(`  fiche : +${m.faits_ajoutes.map((f) => f.texte).join(", +") || "—"} · −${m.faits_retires.join(", −") || "—"} · phrase : ${m.phrase ?? "(inchangée)"}`);
    console.log(`  niveau : ${m.niveau ? `${m.niveau.niveau} (${m.niveau.pourquoi})` : "(inchangé)"} · questions : ${m.questions?.join(" | ") ?? "(inchangées)"}`);
    etat = appliquerMaj(etat, m);
  }
}
console.log(`\ntotal : ${total.toFixed(3)} $`);
process.exit(0);
