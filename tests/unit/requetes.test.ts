import { describe, expect, it } from "vitest";
import { DEMANDE_PLAN, demandeMoitie, requeteChat, requeteMemoireMaj, requeteRapport, type Requete } from "@prompts/lib/contextes";
import { lire, rendre, type Histoire } from "@prompts/lib/conv";
import { Plan05, Sortie04 } from "@prompts/lib/schemas";
import { profil } from "@prompts/lib/style";
import { memoire } from "../aide/fabriques";

/*
 * Ce que reçoit le modèle pour le rapport (prompt 05) et le chat (prompt 10), bloc par bloc. Le premier bloc est mis
 * en cache : tant qu’il ne change pas d’un appel à l’autre (le plan puis les deux moitiés, un message du chat puis le
 * suivant), le modèle ne relit pas la conv ni la mémoire. Les instantanés figent la forme des blocs (leurs balises,
 * le cache, les messages qu’ils citent, leur ordre), jamais leur texte ni sa taille : le dépôt est public, et une
 * retouche de formulation dans le sous-module privé ne doit pas faire échouer un test du front. Que le préfixe en cache
 * reste le même d’un appel à l’autre, les tests d’égalité le prouvent. La conv et la mémoire sont inventées (Tom et Léa).
 */
const pad = (n: number) => String(n).padStart(2, "0");
const MOTS = ["ciné jeudi ?", "trop bien hier", "tu fais quoi ce soir", "jsp encore", "on se voit samedi", "ok 😊"];
/* Soixante messages sur trois semaines, l’un après l’autre, à des heures qui varient */
const texte = Array.from({ length: 60 }, (_, k) => {
  const d = new Date(Date.UTC(2026, 8, 8, 18, 0) + k * 8 * 3600e3 + (k % 5) * 17 * 60e3);
  return `[${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00] ${k % 3 ? "Léa" : "Tom"}: ${MOTS[k % MOTS.length]} (${k})`;
}).join("\n");
const h: Histoire = {
  utilisateur: { prenom: "Tom", pronom: "il", nomExport: "Tom" },
  autre: { prenom: "Léa", pronom: "elle", nomExport: "Léa" },
  devinette: "vus",
  objectif: "ensemble",
  appli: "whatsapp",
  format: "whatsapp-ios",
  aujourdhui: "2026-10-01",
};
const lu = lire(texte, h);
const rendu = rendre(h, lu);

const verdict = Sortie04.parse({
  alerte: null,
  mode_sobre: false,
  emoji: "🔥",
  court: "Ça chauffe.",
  titre: "Vous vous cherchez.",
  sous_titre: "Elle relance, tu réponds vite.",
  preuves: ["m0004", "m0010"],
  confiance: "probable",
  confiance_texte: "Trois semaines de messages.",
  niveau: "voit",
  niveau_pourquoi: "Ils se voient le samedi.",
  tendance: "en hausse",
  prochain_pas: "Propose le ciné.",
  devinette: null,
});
const plan = Plan05.parse({
  alerte: null,
  mode_sobre: false,
  these: "Deux timides qui se cherchent.",
  decouvertes: [],
  chapitres: [{ numero: 1, titre: "Le verdict", titre_court: "Le verdict", surtitre: null, periode: "septembre", scenes: [{ quand: "le 8", quoi: "le ciné", preuves: ["m0001"] }], epice: "le jeudi" }],
});

/** Un bloc tel que le test le fige : ses balises ouvrantes dans l’ordre, s’il est en cache, les messages qu’il cite. Jamais son texte. */
function structure(req: Requete) {
  return {
    tache: req.tache,
    ...(req.effort ? { effort: req.effort } : {}),
    blocs: req.blocs.map((b) => {
      if ("image" in b) return { image: b.image.media };
      const ids = [...new Set(b.texte.match(/\bm\d{4,}\b/g) ?? [])];
      return {
        cache: !!b.cache,
        balises: [...b.texte.matchAll(/<([a-z_]+)[ >]/g)].map((m) => m[1]),
        messages: ids.length > 4 ? `${ids.length} : ${ids[0]} … ${ids.at(-1)}` : ids.join(", ") || "aucun",
      };
    }),
  };
}
/** Chaque balise ouverte est fermée, sans en chevaucher une autre. */
function bienFermees(t: string): boolean {
  const pile: string[] = [];
  for (const [, fin, nom] of t.matchAll(/<(\/?)([a-z_]+)[ >]?/g)) {
    if (!fin) pile.push(nom!);
    else if (pile.pop() !== nom) return false;
  }
  return pile.length === 0;
}
const textes = (req: Requete) => req.blocs.flatMap((b) => ("texte" in b ? [b.texte] : []));

describe("le rapport (prompt 05) : le plan, puis deux moitiés", () => {
  const demandes = { plan: DEMANDE_PLAN, premiere: demandeMoitie(plan, "1 à 4"), seconde: demandeMoitie(plan, "5 à 8"), sobre: null };
  const requetes = Object.fromEntries(Object.entries(demandes).map(([k, d]) => [k, requeteRapport(rendu, verdict, d)])) as Record<keyof typeof demandes, Requete>;

  it("les trois appels, et le rapport sobre, commencent par le même bloc mis en cache : seule la demande, après lui, change", () => {
    const [premier, ...autres] = Object.values(requetes).map((r) => r.blocs[0]);
    expect(premier).toMatchObject({ cache: true });
    for (const b of autres) expect(b).toEqual(premier);
    for (const r of Object.values(requetes)) expect(r.blocs.slice(1).some((b) => "cache" in b && b.cache)).toBe(false);
    expect(new Set([requetes.plan, requetes.premiere, requetes.seconde].map((r) => textes(r)[1])).size).toBe(3);
    expect(requetes.sobre.blocs).toHaveLength(1);
    for (const r of Object.values(requetes)) for (const t of textes(r)) expect(bienFermees(t)).toBe(true);
    /* Le bloc en cache porte toute la conv rendue et ses chiffres, tels que lib/conv les rend (comparés à eux-mêmes, pas figés) */
    const enCache = textes(requetes.plan)[0];
    for (const l of rendu.lignes.values()) expect(enCache).toContain(l);
    expect(enCache).toContain(rendu.chiffres);
  });

  it("ses blocs : l’histoire, les chiffres, toute la conv, l’aide et le verdict, puis la demande (instantané)", () => {
    expect({ plan: structure(requetes.plan), premiere: structure(requetes.premiere), sobre: structure(requetes.sobre) }).toMatchInlineSnapshot(`
      {
        "plan": {
          "blocs": [
            {
              "balises": [
                "histoire",
                "chiffres",
                "conversation",
                "aide",
                "verdict",
              ],
              "cache": true,
              "messages": "60 : m0001 … m0060",
            },
            {
              "balises": [],
              "cache": false,
              "messages": "aucun",
            },
          ],
          "tache": "05-rapport",
        },
        "premiere": {
          "blocs": [
            {
              "balises": [
                "histoire",
                "chiffres",
                "conversation",
                "aide",
                "verdict",
              ],
              "cache": true,
              "messages": "60 : m0001 … m0060",
            },
            {
              "balises": [
                "plan",
              ],
              "cache": false,
              "messages": "m0001",
            },
          ],
          "tache": "05-rapport",
        },
        "sobre": {
          "blocs": [
            {
              "balises": [
                "histoire",
                "chiffres",
                "conversation",
                "aide",
                "verdict",
              ],
              "cache": true,
              "messages": "60 : m0001 … m0060",
            },
          ],
          "tache": "05-rapport",
        },
      }
    `);
  });
});

describe("le chat (prompt 10) : la mémoire à la place de la conv", () => {
  const etat = memoire({
    memoire: { moments: [{ quand: "le 8 sept.", quoi: "le premier ciné", preuves: ["m0001", "m0002"] }] },
    fiche: { faits: [{ section: "aime", texte: "le ciné", preuves: ["m0013"], statut: "garde" }] },
    niveau: { niveau: "voit", tendance: null, pourquoi: "Ils se voient le samedi.", preuves: ["m0040"] },
    questions: ["Elle a dit quoi samedi ?", "Tu l’as revue ?", "Elle t’a relancé ?", "Tu veux quoi ?"],
  });
  /* Les messages que garde la mémoire, une fois la conv effacée : ceux qu’elle cite ci-dessus */
  const lignes = new Map(["m0001", "m0002", "m0013", "m0040"].map((id) => [id, rendu.lignes.get(id)!]));
  const chat = (autres: Partial<Parameters<typeof requeteChat>[0]> = {}) =>
    requeteChat({ h, aujourdhui: Date.UTC(2026, 9, 1), chiffres: rendu.chiffres, fin: rendu.fin, etat, lignes, style: profil(h, lu.messages).bloc, fil: [], dit: "elle m’a répondu ok", ...autres });
  const suite = chat({
    fil: [
      { de: "toi", texte: "je lui dis quoi ?", lignes: [[...rendu.lignes.values()].at(-1)!] },
      { de: "blush", texte: "rien, attends" },
    ],
    dit: "elle a relancé",
    ajout: ["  m0061 2026-10-01 jeu. 10:02 Léa : alors ?"],
    vocal: true,
  });

  it("le premier bloc, mis en cache, ne dépend que de l’histoire et de la mémoire : le fil, ce qu’il dit, un ajout ou le vocal n’y changent rien", () => {
    const premier = chat();
    expect(premier.blocs[0]).toMatchObject({ cache: true });
    expect(suite.blocs[0]).toEqual(premier.blocs[0]);
    expect(textes(suite)[1]).not.toBe(textes(premier)[1]);
    for (const r of [premier, suite]) {
      expect(r.blocs.slice(1).some((b) => "cache" in b && b.cache)).toBe(false);
      for (const t of textes(r)) expect(bienFermees(t)).toBe(true);
    }
    /* La conv n’y est pas : seulement les messages que la mémoire garde, et les chiffres de la conv */
    expect(textes(premier)[0]).not.toContain("<conversation");
    expect([...new Set(textes(premier)[0]!.match(/\bm\d{4,}\b/g))].sort()).toEqual([...lignes.keys()].sort());
    for (const l of lignes.values()) expect(textes(premier)[0]).toContain(l);
    expect(textes(premier)[0]).toContain(rendu.chiffres);
  });

  /*
   * Deux lignes que seul le chat reçoit (le niveau du rapport, la fin de la conv importée), à leur place : la dernière de
   * <histoire> et la première de <memoire>. Leur texte n’est pas recopié ici (le dépôt est public) : on les reconnaît
   * à la valeur qu’elles portent, et la mise à jour de la mémoire, qui ne les reçoit pas, sert de témoin.
   */
  it("le niveau du rapport finit <histoire>, la fin de la conv importée ouvre <memoire> ; la mise à jour de la mémoire n’a ni l’un ni l’autre", () => {
    /* Les lignes d’un bloc, de sa balise ouvrante à sa balise fermante comprises */
    const bloc = (t: string, ouvre: string, ferme: string) => {
      const l = t.split("\n");
      return l.slice(l.indexOf(ouvre), l.indexOf(ferme) + 1);
    };
    const enChat = textes(chat())[0]!;
    const maj = textes(requeteMemoireMaj(h, Date.UTC(2026, 9, 1), etat, lignes, "<nouveau>\n</nouveau>"))[0]!;
    const histoire = { chat: bloc(enChat, "<histoire>", "</histoire>"), maj: bloc(maj, "<histoire>", "</histoire>") };
    const memoire = { chat: bloc(enChat, "<memoire>", "</fiche>"), maj: bloc(maj, "<memoire>", "</fiche>") };
    /* Le chat : une ligne de plus juste avant </histoire>, qui porte le niveau ; le reste est celui de la mise à jour */
    expect(histoire.chat.at(-2)).toMatch(/ : voit$/);
    expect(histoire.chat.toSpliced(-2, 1)).toEqual(histoire.maj);
    /* Et une ligne de plus juste après <memoire>, qui porte la date du dernier message de la conv importée */
    expect(memoire.chat[1]).toContain(rendu.fin);
    expect(memoire.chat.toSpliced(1, 1)).toEqual(memoire.maj);
    expect(memoire.maj.some((l) => l.includes(rendu.fin))).toBe(false);
    /* Sans niveau (une mémoire du mode sobre), la ligne reste, et le dit */
    expect(bloc(textes(chat({ etat: { ...etat, niveau: null } }))[0]!, "<histoire>", "</histoire>").at(-2)).toMatch(/ : mode sobre$/);
  });

  it("ses blocs : l’histoire, les chiffres, la mémoire et l’aide, puis le style et le nouveau (instantané)", () => {
    expect({ premier: structure(chat()), suite: structure(suite) }).toMatchInlineSnapshot(`
      {
        "premier": {
          "blocs": [
            {
              "balises": [
                "histoire",
                "chiffres",
                "memoire",
                "fiche",
                "aide",
              ],
              "cache": true,
              "messages": "m0001, m0002, m0040, m0013",
            },
            {
              "balises": [
                "style",
                "nouveau",
              ],
              "cache": false,
              "messages": "aucun",
            },
          ],
          "tache": "10-chat",
        },
        "suite": {
          "blocs": [
            {
              "balises": [
                "histoire",
                "chiffres",
                "memoire",
                "fiche",
                "aide",
              ],
              "cache": true,
              "messages": "m0001, m0002, m0040, m0013",
            },
            {
              "balises": [
                "style",
                "nouveau",
                "vocal",
              ],
              "cache": false,
              "messages": "m0060, m0061",
            },
          ],
          "tache": "10-chat",
        },
      }
    `);
  });
});
