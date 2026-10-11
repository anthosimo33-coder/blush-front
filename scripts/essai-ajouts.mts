#!/usr/bin/env -S npx tsx --conditions=react-server
/*
 * Des messages et un profil envoyés après l’import, avec le VRAI modèle (quelques centimes) : la réponse du chat
 * (prompt 10), puis la mise à jour de la mémoire (prompt 07), sur une mémoire déjà créée (un résultat du 07).
 *   DATABASE_URL=… BLUSH_CLE=… ANTHROPIC_API_KEY=… npm run essai:ajouts -- <résultat 07 .json> <suite .txt> [ligne de profil…]
 * `suite` : la suite de leur conv, au format de l’export (les lignes d’après la fin de la conv de test). Les chemins se
 * lisent depuis le dossier où la commande est tapée ; la conv du cas, dans le banc d’essai (prompts/evals).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { blocAjout, messagesDeLExport, numeroter } from "@prompts/lib/ajouts";
import { requeteChat, requeteMemoireMaj } from "@prompts/lib/contextes";
import { lire, rendre, type Histoire } from "@prompts/lib/conv";
import { citees, estFaite, rendreNouveau } from "@prompts/lib/memoire";
import { introuvables, preuvesChat, preuvesMaj } from "@prompts/lib/preuves";
import { Maj07, Sortie10, type Memoire } from "@prompts/lib/schemas";
import { profil as style } from "@prompts/lib/style";
import { appeler } from "@/server/ia/claude";
import { cheminDonne, EVALS } from "../tests/aide/essai";

const [fichier07, fichierSuite, ...profil] = process.argv.slice(2);
const r07 = JSON.parse(readFileSync(cheminDonne(fichier07), "utf8"));
const cas = (JSON.parse(readFileSync(join(EVALS, "cas.json"), "utf8")) as (Histoire & { id: string; fichier: string })[]).find((c) => c.id === r07.cas)!;
const etat = r07.etapes.find((e: { moment: string }) => e.moment === "création").sortie as Memoire;
if (!estFaite(etat)) throw new Error("la création du 07 n’a ni mémoire ni fiche");
const h: Histoire = { ...cas, format: cas.format ?? "whatsapp-ios" };
const texte = readFileSync(join(EVALS, cas.fichier), "utf8");
const lu = lire(texte, h);
const rendu = rendre(h, lu);
const lignes = new Map([...new Set(citees(etat))].filter((id) => rendu.lignes.has(id)).map((id) => [id, rendu.lignes.get(id)!]));

/* La suite : les messages d’après le dernier lu, numérotés à la suite, et son profil */
const nouveaux = messagesDeLExport(`${texte}\n${readFileSync(cheminDonne(fichierSuite), "utf8").trim()}`, h, lu.messages.at(-1)!.t);
if (typeof nouveaux === "string") throw new Error(nouveaux);
const jour = new Date(Math.max(...nouveaux.map((m) => m.t)) + 86400e3).toISOString().slice(0, 10);
const ajout = numeroter(nouveaux, profil, h, { debut: lu.messages.length + 1, aujourdhui: jour });
const avec = new Map([...lignes, ...ajout.lignes.map((l) => [l.slice(0, l.indexOf(" ")), l] as [string, string])]);
console.log(`<nouveau> :\n${blocAjout(ajout).join("\n")}\n`);

/* Le chat : sans un mot de lui, la demande par défaut */
const chat = await appeler(
  requeteChat({ h, aujourdhui: Date.parse(`${jour}T00:00:00Z`), chiffres: rendu.chiffres, fin: rendu.fin, etat, lignes: avec, style: style(h, lu.messages).bloc, fil: [], dit: "ça veut dire quoi ? je lui réponds quoi ?", ajout: blocAjout(ajout) }),
  Sortie10,
  { etiquette: "essai_ajouts" },
);
const r = chat.sortie;
if (!r) throw new Error(`chat illisible (${chat.stop})`);
console.log(`chat · ${chat.cout.toFixed(3)} $ · type ${r.type} · coup ${r.coup ?? "—"} · mode ${r.mode}`);
for (const b of r.lecture) console.log(`  « ${b.texte} »${b.preuves.length ? `  [${b.preuves.join(", ")}]` : ""}`);
if (r.a_envoyer) console.log(`  à envoyer : ${r.a_envoyer.join(" / ")}${r.pourquoi ? `\n  pourquoi : ${r.pourquoi}` : ""}`);
if (r.question) console.log(`  question : ${r.question}`);
console.log(`  preuves introuvables : ${introuvables(preuvesChat(r), avec).join(", ") || "aucune"} · preuves parmi les nouveaux : ${preuvesChat(r).filter((id) => ajout.lignes.some((l) => l.startsWith(`${id} `))).join(", ") || "aucune"}`);

/* La mémoire relit ce qui est arrivé */
const nouveau = rendreNouveau({ date: jour, lignes: ajout.lignes, dit: "ça veut dire quoi ? je lui réponds quoi ?", reponse: r.lecture.map((b) => b.texte).concat(r.a_envoyer ?? []) }, h, 0);
const pourMaj = new Map([...lignes, ...nouveau.lignes]);
const maj = await appeler(requeteMemoireMaj(h, Date.parse(`${jour}T00:00:00Z`), etat, pourMaj, nouveau.texte), Maj07, { etiquette: "essai_ajouts", partie: "mise à jour" });
const m = maj.sortie;
if (!m) throw new Error(`mise à jour illisible (${maj.stop})`);
console.log(`\nmémoire · ${maj.cout.toFixed(3)} $ · ${m.rien_de_neuf ? "rien de neuf" : "mise à jour"}`);
if (!m.rien_de_neuf) {
  console.log(`  où on en est : ${m.ou_on_en_est ?? "(inchangé)"}`);
  console.log(`  moments : ${m.moments_ajoutes.map((x) => `${x.quand} ${x.quoi} [${x.preuves.join(", ")}]`).join(" | ") || "—"}`);
  console.log(`  fiche : ${m.faits_ajoutes.map((f) => `+[${f.section}] ${f.texte} [${f.preuves.join(", ")}]`).join(" · ") || "—"}`);
  console.log(`  preuves introuvables : ${introuvables(preuvesMaj(m), pourMaj).join(", ") || "aucune"}`);
}
console.log(`\ntotal : ${(chat.cout + maj.cout).toFixed(3)} $`);
process.exit(0);
