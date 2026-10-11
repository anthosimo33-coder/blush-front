import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { ChapitreAffiche } from "@prompts/lib/front";
import type { Memoire, Plan, Rapport, Verdict } from "@prompts/lib/schemas";
import { chiffrer } from "@/server/chiffrement";
import * as coffre from "@/server/coffre";
import * as schema from "@/server/db/schema";
import type { Meta } from "@/server/histoires";

/*
 * Le coffre (src/server/coffre.ts) : chaque colonne chiffrée a sa forme, s’écrit et se relit par elle. Les lignes
 * « d’avant » sont chiffrées ici comme le faisait le serveur avant le coffre (chiffrer, sans forme). Sans base.
 * Des exemples inventés : Tom importe sa conv avec Léa.
 */

const VERDICT: Verdict = {
  alerte: null,
  mode_sobre: false,
  emoji: "🔥",
  court: "ça chauffe",
  titre: "Elle attend que tu proposes",
  sous_titre: "Léa relance, Tom hésite.",
  preuves: ["m0003"],
  confiance: "probable",
  confiance_texte: "Trois relances en une semaine.",
  niveau: "voit",
  niveau_pourquoi: "Vous vous êtes vus deux fois.",
  tendance: "↗ ça monte",
  prochain_pas: "Propose un verre jeudi.",
  devinette: null,
};
const PLAN: Plan = {
  alerte: null,
  mode_sobre: false,
  these: "Elle avance, il recule.",
  decouvertes: [{ texte: "Elle écrit la première le matin.", preuves: ["m0001"] }],
  chapitres: [{ numero: 2, titre: "Le premier verre", titre_court: "Le verre", surtitre: null, periode: "mars", scenes: [{ quand: "2 mars", quoi: "le verre", preuves: ["m0002"] }], epice: "doux" }],
};
const RAPPORT: Rapport = {
  alerte: null,
  mode_sobre: false,
  decouvertes: [],
  these: "Elle avance, il recule.",
  chapitres: [{ numero: 2, titre: "Le premier verre", titre_court: "Le verre", surtitre: null, blocs: [{ type: "essentiel", texte: "Elle propose.", preuves: [], titre: null, niveau: null, items: null }] }],
  sobre: null,
};
const MEMOIRE: Memoire = {
  alerte: null,
  rien_de_neuf: false,
  memoire: { ou_on_en_est: "Ils se voient jeudi.", moments: [], son_mode: [], ton_mode: [], conseils: [], a_venir: [{ date: "2026-03-12", quoi: "le verre" }] },
  fiche: { portrait: "drôle et directe", phrase: "Elle aime les plans simples.", phrase_courte: "Directe.", faits: [{ section: "aime", texte: "le café", preuves: ["m0002"], statut: "nouveau" }] },
  niveau: null,
  questions: ["Tu lui proposes quoi ?"],
};
const CHAPITRE: ChapitreAffiche = { number: 2, title: "Le premier verre", tocTitle: "Le verre", free: false, blocks: [{ kind: "essential", text: "Elle propose." }] };
const META: Meta = {
  appli: "whatsapp",
  format: "whatsapp-ios",
  fichier: "WhatsApp Chat - Léa.zip",
  participants: [
    { nom: "Léa", prenom: "Léa", messages: 120 },
    { nom: "Tom", prenom: "Tom", messages: 100 },
  ],
  resume: { debut: "2026-03-01", fin: "2026-03-10", total: 220, vocaux: 2 },
  moi: 1,
  pronom: "il",
  devinette: "vus",
  objectif: "ensemble",
};

/* Un exemple par colonne : en ajouter une au registre sans son exemple ne compile pas */
const EXEMPLES: { [C in coffre.Colonne]: coffre.Formes[C] } = {
  "stories.meta": META,
  "stories.conv": "[02/03/2026 21:04:11] Léa: on se voit jeudi ?",
  "stories.context": { chiffres: "220 messages", style: "court", fin: "2026-03-10", dernier: Date.UTC(2026, 2, 10, 21, 4), trouvailles: ["Elle écrit la première le matin."] },
  "verdicts.data": { sortie: VERDICT, scores: [{ label: "Qui relance", winner: "elle", toiPercent: 35 }] },
  "reports.plan": PLAN,
  "reports.data": { sortie: RAPPORT, chapitres: [CHAPITRE], sobre: null, lecture: { free: "1 min", full: "9 min" } },
  "reports.partiel": [CHAPITRE],
  "memories.data": { etat: MEMOIRE, lignes: [["m0002", "m0002 2026-03-02 lun. 21:04 Léa : on se voit jeudi ?"]], suivant: 221, editions: { parToi: ["aime le café"], supprimees: [] } },
  "chat_messages.data:toi": { texte: "elle m’a répondu ok", lignes: ["m0221 2026-03-11 mar. 09:12 Léa : ok"], affiche: "(1 capture) elle m’a répondu ok" },
  "chat_messages.data:blush": { reponse: { kind: "bubbles", bubbles: [{ text: "Un « ok » le matin, c’est bon signe." }] }, resume: "Un « ok » le matin, c’est bon signe." },
  "tasks.input": { date: "2026-03-11", dit: "elle m’a répondu ok", reponse: ["Un « ok » le matin, c’est bon signe."] },
  "shares.data": { emoji: "🔥", title: "Elle attend que tu proposes", subtitle: "L. relance, Tom hésite." },
  "vocals.data": { sobre: false, lignes: [{ texte: "Elle relance.", punch: true, debut: 0, fin: 1.2, mots: [{ t: "Elle", debut: 0 }] }], version: 2 },
  "waitlist.email": "tom@exemple.fr",
};

describe("le coffre", () => {
  it("connaît toutes les colonnes chiffrées du schéma, et seulement elles", () => {
    const chiffrees = Object.values(schema)
      .filter((t) => is(t, PgTable))
      .flatMap((t) => Object.values(getTableColumns(t)).flatMap((c) => (c.getSQLType() === "bytea" ? [`${getTableName(t)}.${c.name}`] : [])));
    expect(chiffrees.length).toBeGreaterThan(10);
    expect(new Set(coffre.COLONNES.map((c) => c.split(":")[0]))).toEqual(new Set(chiffrees));
  });

  it("rend, colonne par colonne, ce qu’on y a écrit, sans rien laisser en clair", () => {
    for (const colonne of Object.keys(EXEMPLES) as coffre.Colonne[]) {
      const octets = coffre.ecrire(colonne, EXEMPLES[colonne]);
      expect(octets.toString("utf8"), colonne).not.toMatch(/Léa|Tom|tom@/);
      expect(coffre.lire(colonne, octets), colonne).toEqual(EXEMPLES[colonne]);
    }
  });

  it("compresse la conv brute avant de la chiffrer, et elle seule", () => {
    expect(coffre.ecrire("stories.conv", "Léa: coucou\n".repeat(1000))[0]).toBe(2);
    expect(coffre.ecrire("stories.meta", META)[0]).toBe(1);
  });

  it("garde l’audio tel quel, sans JSON", () => {
    const mp3 = Buffer.from("fffb9064", "hex");
    expect(coffre.lireAudio(coffre.ecrireAudio(mp3)).equals(mp3)).toBe(true);
    expect(() => coffre.lire("vocals.data", coffre.ecrireAudio(mp3))).toThrow();
  });

  it("relit les formes d’avant dans celle d’aujourd’hui", () => {
    /* Le contexte avant le 7 octobre : ni `dernier`, ni trouvailles */
    const contexte = coffre.lire("stories.context", chiffrer({ chiffres: "220 messages", style: "court", fin: "2026-03-10" }));
    expect(contexte.trouvailles).toEqual([]);
    expect(contexte.dernier).toBeUndefined();
    /* Le vocal avant le 8 octobre : sans version, c’est la version 1 (il se refera) */
    expect(coffre.lire("vocals.data", chiffrer({ sobre: false, lignes: [] })).version).toBe(1);
    /* Une mémoire sans corrections de la fiche (jamais corrigée, ou écrite avant le chat) */
    const { etat, lignes, suivant } = EXEMPLES["memories.data"];
    expect(coffre.lire("memories.data", chiffrer({ etat, lignes, suivant }))).toEqual({ etat, lignes, suivant });
    /* La meta des premiers imports : un export WhatsApp, avant « Qui es-tu ? » et les captures */
    const { appli, format, fichier, participants, resume } = META;
    const metaDAvant = { appli, format, fichier, participants, resume };
    expect(coffre.lire("stories.meta", chiffrer(metaDAvant))).toEqual(metaDAvant);
  });

  it("garde les champs qu’il ne connaît pas (écrits par une version plus récente)", () => {
    const plusRecente = { ...EXEMPLES["memories.data"], resumeHebdo: "jeudi" };
    expect(coffre.lire("memories.data", chiffrer(plusRecente))).toEqual(plusRecente);
  });

  it("refuse une ligne qui n’a pas la forme de sa colonne, en nommant les champs, jamais leur contenu", () => {
    const lire = () => coffre.lire("memories.data", chiffrer({ etat: MEMOIRE, lignes: "m0002 Léa : on se voit jeudi ?", suivant: 221 }));
    expect(lire).toThrow("memories.data : forme inattendue (lignes)");
    expect(lire).not.toThrow(/Léa/);
    expect(() => coffre.lire("stories.meta", chiffrer({ ...META, participants: [{ prenom: "Léa" }] }))).toThrow("stories.meta : forme inattendue (participants.0.nom)");
    expect(() => coffre.lire("reports.data", chiffrer({ test: true }))).toThrow(/^reports\.data : forme inattendue \(sortie, chapitres, sobre, lecture\)$/);
  });

  it("n’accepte à l’écriture que la forme de la colonne : le compilateur le vérifie (tsc, dans npm run check)", () => {
    // @ts-expect-error -- un lien partagé sans son titre
    coffre.ecrire("shares.data", { emoji: "🔥", subtitle: "" });
    // @ts-expect-error -- le verdict n’est pas le rapport
    coffre.ecrire("reports.data", EXEMPLES["verdicts.data"]);
    // @ts-expect-error -- une réponse de BLUSH n’est pas ton message
    coffre.ecrire("chat_messages.data:toi", EXEMPLES["chat_messages.data:blush"]);
  });
});
