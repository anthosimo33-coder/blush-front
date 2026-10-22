#!/usr/bin/env -S npx tsx --conditions=react-server
/*
 * La mise à jour de la mémoire groupée, comparée à une mise à jour par échange, avec le VRAI modèle (2 à 3 $) : le même
 * chat (prompts/evals/memoire-groupee.json : ses messages, ses jours, ses pauses) joué deux fois en même temps, sur une
 * mémoire déjà créée (un résultat du 07). « par échange » : la règle d’avant le 22 octobre 2026, une mise à jour après
 * chaque échange qui apporte du neuf. « groupée » : celle de retenir (src/server/memoire-groupee.ts), les échanges réunis
 * jusqu’à ce que le chat se calme. Les deux en même temps : ni l’un ni l’autre ne profite du cache écrit par l’autre. On
 * compare ce que coûtent le chat et la mémoire (le suivi des coûts, ai_usage, dans la base de DATABASE_URL), et la
 * mémoire finale : ce qu’elle doit savoir (« attendus »), ses preuves, son niveau, ses conseils.
 *   DATABASE_URL=… BLUSH_CLE=… ANTHROPIC_API_KEY=… npm run essai:memoire-groupee -- <résultat 07 .json> [sortie .json]
 * Le cas est celui du résultat 07 ; les chemins se lisent depuis le dossier où la commande est tapée.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { blocAjout, messagesDeLExport, numeroter, type Ajout } from "@prompts/lib/ajouts";
import { requeteChat, requeteMemoireMaj, type Fil, type Requete } from "@prompts/lib/contextes";
import { lire, rendre, type Histoire } from "@prompts/lib/conv";
import { parIdentifiant, rangDe } from "@prompts/lib/ligne";
import { appliquerMaj, citees, estFaite, rendreNouveaux, type Echange, type MemoireFaite } from "@prompts/lib/memoire";
import { introuvables, preuvesChat, preuvesMaj } from "@prompts/lib/preuves";
import { Maj07, Sortie10, type Memoire, type ReponseChat } from "@prompts/lib/schemas";
import { profil as style } from "@prompts/lib/style";
import { pourLaMemoire } from "@/server/chat";
import { db, schema } from "@/server/db";
import { appeler, type Partie } from "@/server/ia/claude";
import { partTout } from "@/server/memoire-groupee";
import { lignesGardees } from "@/server/stockage/types";
import { cheminDonne, EVALS } from "../tests/aide/essai";

type Pas = { jour: string; dit: string; calme?: boolean; suite?: string[] };
type Attendu = { quoi: string; ou: "fiche" | "memoire" | "moments" | "conseils_faits" | "a_venir_sans" | "niveau" | "tout"; motif: string };
type Mode = "par_echange" | "groupee";

const [fichier07, fichierSortie] = process.argv.slice(2);
const r07 = JSON.parse(readFileSync(cheminDonne(fichier07), "utf8"));
const cas = (JSON.parse(readFileSync(join(EVALS, "cas.json"), "utf8")) as (Histoire & { id: string; fichier: string })[]).find((c) => c.id === r07.cas)!;
const scenario = (JSON.parse(readFileSync(join(EVALS, "memoire-groupee.json"), "utf8")) as Record<string, { pas: Pas[]; attendus: Attendu[] }>)[cas.id];
if (!scenario) throw new Error(`pas de chat pour le cas ${cas.id} dans memoire-groupee.json`);
const creation = r07.etapes.find((e: { moment: string }) => e.moment === "création").sortie as Memoire;
if (!estFaite(creation)) throw new Error("la création du 07 n’a ni mémoire ni fiche");
const h: Histoire = { ...cas, format: cas.format ?? "whatsapp-ios" };
const texte = readFileSync(join(EVALS, cas.fichier), "utf8");
const lu = lire(texte, h);
const rendu = rendre(h, lu);
const bloc = style(h, lu.messages).bloc;
/* Le premier identifiant des messages envoyés dans le chat : leurs preuves se comptent à part */
const premierAjoute = lu.messages.length + 1;
const t0 = Date.now();

/* Comme chat.ts (resume) : ce que le fil garde d’une réponse */
const resume = (r: ReponseChat) => [...r.lecture.map((b) => b.texte), ...(r.a_envoyer ?? []), r.question ?? "", r.reaction ?? ""].filter(Boolean).join(" / ");

/** Un appel dont les preuves doivent exister : rejoué une fois sinon, comme appelVerifie (sans conv en base). */
async function verifie<S extends z.ZodType>(req: Requete, format: S, preuves: (s: z.infer<S>) => string[], lignes: Map<string, string>, etiquette: string, partie?: Partie) {
  for (let essai = 0; ; essai++) {
    const a = await appeler(req, format, { etiquette, ...(partie ? { partie } : {}) });
    if (a.sortie && (essai === 1 || !introuvables(preuves(a.sortie), lignes).length)) return a.sortie as z.infer<S>;
    if (essai === 1) throw new Error(`${etiquette} : pas de sortie (${a.stop})`);
  }
}

type Journal = { pas: number; type: string; niveau: string | null; neuf: boolean; maintenant: boolean; maj: string | null };

async function jouer(mode: Mode) {
  let m = { etat: creation as MemoireFaite, lignes: new Map(lignesGardees(creation, rendu.lignes)), suivant: premierAjoute };
  let prochain = premierAjoute;
  let exportTexte = texte;
  let curseur = lu.messages.at(-1)!.t;
  const fil: { toi: Fil[number]; blush: string }[] = [];
  let attente: Echange[] = [];
  const majs: { echanges: number; rienDeNeuf: boolean }[] = [];
  const journal: Journal[] = [];
  const etiquette = (quoi: "chat" | "memoire") => `essai_groupe_${t0}_${mode}_${quoi}`;

  const mettreAJour = async (echanges: Echange[]) => {
    const nouveau = rendreNouveaux(echanges, h, m.suivant);
    const lignes = new Map([...m.lignes, ...nouveau.lignes]);
    const jour = Date.parse(`${echanges.at(-1)!.date}T00:00:00Z`);
    const maj = await verifie(
      requeteMemoireMaj(h, jour, m.etat, lignes, nouveau.blocs),
      Maj07,
      (x) => (x.rien_de_neuf ? [] : preuvesMaj(x)),
      lignes,
      etiquette("memoire"),
      "mise à jour",
    );
    majs.push({ echanges: echanges.length, rienDeNeuf: maj.rien_de_neuf });
    if (!maj.rien_de_neuf) {
      const etat = appliquerMaj(m.etat, maj);
      m = { etat, lignes: new Map(lignesGardees(etat, lignes)), suivant: nouveau.suivant };
    }
    return maj.rien_de_neuf ? `${echanges.length} échange(s) : rien de neuf` : `${echanges.length} échange(s) : mise à jour`;
  };

  for (const [k, pas] of scenario!.pas.entries()) {
    /* Le chat s’est calmé : la mise à jour qui attendait part (le passage des 5 minutes) */
    if (mode === "groupee" && pas.calme && attente.length) {
      journal.push({ pas: k, type: "(calme)", niveau: null, neuf: false, maintenant: false, maj: await mettreAJour(attente) });
      attente = [];
    }
    let ajout: Ajout | null = null;
    if (pas.suite) {
      exportTexte = `${exportTexte.trimEnd()}\n${pas.suite.join("\n")}`;
      const nouveaux = messagesDeLExport(exportTexte, h, curseur);
      if (typeof nouveaux === "string") throw new Error(nouveaux);
      ajout = numeroter(nouveaux, [], h, { debut: prochain, aujourdhui: pas.jour });
      prochain += ajout.lignes.length;
      curseur = ajout.dernier ?? curseur;
    }
    const nouvelles = ajout?.lignes ?? [];
    const leFil: Fil = fil.slice(-6).flatMap((e) => [e.toi, { de: "blush" as const, texte: e.blush }]);
    const lignes = new Map([...parIdentifiant(leFil.flatMap((x) => x.lignes ?? [])), ...m.lignes, ...parIdentifiant(nouvelles)]);
    const req = requeteChat({
      h,
      aujourdhui: Date.parse(`${pas.jour}T00:00:00Z`),
      chiffres: rendu.chiffres,
      fin: rendu.fin,
      etat: m.etat,
      lignes,
      style: bloc,
      fil: leFil,
      dit: pas.dit,
      ...(ajout ? { ajout: blocAjout(ajout) } : {}),
      vocal: false,
    });
    const sortie = await verifie(req, Sortie10, preuvesChat, lignes, etiquette("chat"));
    fil.push({ toi: { de: "toi", texte: pas.dit, ...(nouvelles.length ? { lignes: nouvelles.slice(-15) } : {}) }, blush: resume(sortie) });
    const echange: Echange = {
      date: pas.jour,
      dit: pas.dit,
      reponse: sortie.lecture.map((b) => b.texte).concat(sortie.a_envoyer ?? []),
      ...(nouvelles.length ? { lignes: nouvelles } : {}),
    };
    const { neuf, maintenant } = pourLaMemoire(sortie, nouvelles.length);
    let maj: string | null = null;
    if (mode === "par_echange" && neuf) maj = await mettreAJour([echange]);
    if (mode === "groupee" && (neuf || attente.length)) {
      attente.push(echange);
      if (partTout(attente.length, { maintenant, due: false })) {
        maj = await mettreAJour(attente);
        attente = [];
      }
    }
    journal.push({ pas: k, type: sortie.type, niveau: sortie.niveau_atteint ?? null, neuf, maintenant, maj });
  }
  /* La fin du chat : il se calme, ce qui attendait part */
  if (attente.length) journal.push({ pas: scenario!.pas.length, type: "(calme)", niveau: null, neuf: false, maintenant: false, maj: await mettreAJour(attente) });
  return { mode, etat: m.etat, lignes: m.lignes, majs, journal };
}

const [a, b] = await Promise.all([jouer("par_echange"), jouer("groupee")]);

/* ———— Ce que ça a coûté (ai_usage, par étiquette) ———— */
const usages = await db()
  .select({
    tache: schema.aiUsage.task,
    appels: sql<number>`count(*)::int`,
    micros: sql<number>`sum(${schema.aiUsage.costMicros})::int`,
    entree: sql<number>`sum(${schema.aiUsage.inputTokens})::int`,
    sortie: sql<number>`sum(${schema.aiUsage.outputTokens})::int`,
    lu: sql<number>`sum(${schema.aiUsage.cacheReadTokens})::int`,
    ecrit: sql<number>`sum(${schema.aiUsage.cacheWriteTokens})::int`,
  })
  .from(schema.aiUsage)
  .where(
    inArray(
      schema.aiUsage.task,
      (["par_echange", "groupee"] as const).flatMap((mode) => [`essai_groupe_${t0}_${mode}_chat`, `essai_groupe_${t0}_${mode}_memoire`]),
    ),
  )
  .groupBy(schema.aiUsage.task);
const usage = (mode: Mode, quoi: "chat" | "memoire") =>
  usages.find((u) => u.tache === `essai_groupe_${t0}_${mode}_${quoi}`) ?? { appels: 0, micros: 0, entree: 0, sortie: 0, lu: 0, ecrit: 0 };
const dollars = (micros: number) => (micros / 1e6).toFixed(3);

/* ———— La mémoire finale ———— */
const parties = (e: MemoireFaite) => ({
  fiche: JSON.stringify(e.fiche),
  memoire: JSON.stringify(e.memoire),
  moments: JSON.stringify(e.memoire.moments),
  conseils_faits: JSON.stringify(e.memoire.conseils.filter((c) => c.suite === "fait")),
  a_venir: JSON.stringify(e.memoire.a_venir),
  niveau: JSON.stringify(e.niveau),
  tout: JSON.stringify(e),
});
const trouve = (e: MemoireFaite, x: Attendu) => {
  const p = parties(e);
  const motif = new RegExp(x.motif, "i");
  return x.ou === "a_venir_sans" ? !motif.test(p.a_venir) : motif.test(p[x.ou]);
};
const preuves = (r: { etat: MemoireFaite; lignes: Map<string, string> }) => {
  const toutes = [...new Set(citees(r.etat))];
  return { toutes: toutes.length, ajoutees: toutes.filter((id) => rangDe(id) >= premierAjoute).length, introuvables: introuvables(toutes, r.lignes).length };
};

const lignes = [
  "| | Par échange (avant) | Groupée (après) |",
  "|---|---|---|",
  `| Mises à jour de la mémoire | ${a.majs.length} (${a.majs.filter((x) => x.rienDeNeuf).length} « rien de neuf ») | ${b.majs.length} (${b.majs.filter((x) => x.rienDeNeuf).length} « rien de neuf ») |`,
  `| Coût de la mémoire | ${dollars(usage("par_echange", "memoire").micros)} $ | ${dollars(usage("groupee", "memoire").micros)} $ |`,
  `| Coût du chat (10 réponses) | ${dollars(usage("par_echange", "chat").micros)} $ | ${dollars(usage("groupee", "chat").micros)} $ |`,
  `| Cache du chat : écrit / lu (tokens) | ${usage("par_echange", "chat").ecrit} / ${usage("par_echange", "chat").lu} | ${usage("groupee", "chat").ecrit} / ${usage("groupee", "chat").lu} |`,
  `| **Total** | **${dollars(usage("par_echange", "chat").micros + usage("par_echange", "memoire").micros)} $** | **${dollars(usage("groupee", "chat").micros + usage("groupee", "memoire").micros)} $** |`,
  `| Attendus retrouvés | ${scenario.attendus.filter((x) => trouve(a.etat, x)).length}/${scenario.attendus.length} | ${scenario.attendus.filter((x) => trouve(b.etat, x)).length}/${scenario.attendus.length} |`,
  ...scenario.attendus.map((x) => `| · ${x.quoi} | ${trouve(a.etat, x) ? "oui" : "non"} | ${trouve(b.etat, x) ? "oui" : "non"} |`),
  `| Preuves (dont messages envoyés au chat, introuvables) | ${preuves(a).toutes} (${preuves(a).ajoutees}, ${preuves(a).introuvables}) | ${preuves(b).toutes} (${preuves(b).ajoutees}, ${preuves(b).introuvables}) |`,
  `| Niveau | ${a.etat.niveau ? `${a.etat.niveau.niveau} · ${a.etat.niveau.tendance}` : "—"} | ${b.etat.niveau ? `${b.etat.niveau.niveau} · ${b.etat.niveau.tendance}` : "—"} |`,
  `| Conseils (faits / en attente / pas faits) | ${["fait", "en_attente", "pas_fait"].map((s) => a.etat.memoire.conseils.filter((c) => c.suite === s).length).join(" / ")} | ${["fait", "en_attente", "pas_fait"].map((s) => b.etat.memoire.conseils.filter((c) => c.suite === s).length).join(" / ")} |`,
  `| Moments / infos de la fiche | ${a.etat.memoire.moments.length} / ${a.etat.fiche.faits.length} | ${b.etat.memoire.moments.length} / ${b.etat.fiche.faits.length} |`,
];
console.log(`\n${lignes.join("\n")}\n`);
for (const r of [a, b]) {
  console.log(`\n———— ${r.mode} ————`);
  for (const j of r.journal)
    console.log(`  pas ${j.pas + 1} · ${j.type}${j.niveau ? ` · niveau ${j.niveau}` : ""} · neuf ${j.neuf} · maintenant ${j.maintenant}${j.maj ? ` → ${j.maj}` : ""}`);
  const e = r.etat;
  console.log(`  où on en est : ${e.memoire.ou_on_en_est}`);
  console.log(
    `  moments récents : ${e.memoire.moments
      .slice(-5)
      .map((x) => `${x.quand} ${x.quoi}`)
      .join(" | ")}`,
  );
  /* La fiche depuis la création : ce qui s’y est ajouté, ce qui en est sorti */
  const avant = new Set(creation.fiche.faits.map((f) => f.texte));
  const apres = new Set(e.fiche.faits.map((f) => f.texte));
  console.log(`  fiche : +${[...apres].filter((t) => !avant.has(t)).join(", +") || "—"} · −${[...avant].filter((t) => !apres.has(t)).join(", −") || "—"}`);
  console.log(`  conseils : ${e.memoire.conseils.map((c) => `${c.conseil} → ${c.suite}${c.resultat ? ` (${c.resultat})` : ""}`).join(" | ")}`);
  console.log(`  à venir : ${e.memoire.a_venir.map((x) => `${x.date} ${x.quoi}`).join(" | ") || "—"}`);
  console.log(`  niveau : ${e.niveau ? `${e.niveau.niveau} · ${e.niveau.tendance} · ${e.niveau.pourquoi}` : "—"}`);
  console.log(`  questions : ${e.questions?.join(" | ") ?? "—"}`);
}
if (fichierSortie)
  writeFileSync(cheminDonne(fichierSortie), JSON.stringify({ cas: cas.id, tableau: lignes, usages, modes: [a, b].map((r) => ({ ...r, lignes: [...r.lignes] })) }, null, 2));
process.exit(0);
