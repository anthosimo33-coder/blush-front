import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEMANDE_PLAN,
  demandeMoitie,
  requeteChat,
  requeteMemoireCreation,
  requeteMemoireMaj,
  requeteRapport,
  requeteVerdict,
  requeteVocal,
  type Requete,
} from "@prompts/lib/contextes";
import { lire, rendre, type Histoire } from "@prompts/lib/conv";
import { Plan05, Sortie04, Sortie05, type Rapport, type Verdict } from "@prompts/lib/schemas";
import { profil } from "@prompts/lib/style";
import { memoireDeSecours } from "@/server/secours";
import { chapitre, memoire } from "../aide/fabriques";

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
  titres: null,
});
const plan = Plan05.parse({
  alerte: null,
  mode_sobre: false,
  these: "Deux timides qui se cherchent.",
  decouvertes: [],
  chapitres: [
    {
      numero: 1,
      titre: "Le verdict",
      titre_court: "Le verdict",
      surtitre: null,
      periode: "septembre",
      scenes: [{ quand: "le 8", quoi: "le ciné", preuves: ["m0001"] }],
      epice: "le jeudi",
    },
  ],
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
/** L’empreinte d’un texte : de quoi le figer à l’octet sans le recopier (le dépôt est public). */
const empreinte = (t: string) => createHash("sha256").update(t).digest("hex").slice(0, 16);

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
    expect(enCache).toContain(rendu.conversation);
    for (const id of rendu.lignes.keys()) expect(enCache).toContain(id);
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
    requeteChat({
      h,
      aujourdhui: Date.UTC(2026, 9, 1),
      chiffres: rendu.chiffres,
      fin: rendu.fin,
      etat,
      lignes,
      style: profil(h, lu.messages).bloc,
      fil: [],
      dit: "elle m’a répondu ok",
      ...autres,
    });
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
    const maj = textes(requeteMemoireMaj(h, Date.UTC(2026, 9, 1), etat, lignes, ["<nouveau>\n</nouveau>"]))[0]!;
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

/*
 * Le chat sur une mémoire de secours (src/server/secours.ts) : tirée du verdict et du rapport sans appel au modèle, elle
 * garde leur alerte dans son état, mais son « où on en est » (la thèse, le verdict court, la tendance) ne la dit pas.
 * C’est la ligne de l’alerte, que rendreMemoire écrit dans <memoire>, qui la donne au modèle, au chat comme à la mise à
 * jour de la mémoire : sans elle, le chat répondrait sur son ton de tous les jours à quelqu’un en danger, ou parlerait
 * séduction avec un mineur. Son texte n’est pas recopié ici (le dépôt est public) : on la reconnaît à la valeur qu’elle
 * porte et à sa place, la même mémoire sans alerte servant de témoin.
 */
describe("le chat d’une mémoire de secours : l’alerte du verdict est dans ce qu’il lit", () => {
  /* Avec une alerte « mineur », le verdict est vide (seul le mode sobre reste) et le rapport est le rapport doux */
  const vide = {
    emoji: null,
    court: null,
    titre: null,
    sous_titre: null,
    preuves: [],
    confiance: null,
    confiance_texte: null,
    niveau: null,
    niveau_pourquoi: null,
    tendance: null,
    prochain_pas: null,
  };
  const doux = Sortie05.parse({
    alerte: "mineur",
    mode_sobre: true,
    decouvertes: [],
    these: "Deux collégiens qui s’écrivent tard le soir.",
    chapitres: null,
    sobre: {
      intro: "On en parle.",
      titre: "Doucement",
      faits: "Vous avez treize ans.",
      preuves: [],
      reassurance: "Rien de grave.",
      gestes: ["En parler à un adulte"],
      brouillon: null,
    },
  });
  /** De quoi tirer la mémoire de secours : le verdict, et le rapport s’il est écrit. */
  type Sources = { verdict: Verdict; rapport: Rapport | null };
  const cas: Record<"danger" | "detresse" | "mineur", Sources> = {
    danger: { verdict: Sortie04.parse({ ...verdict, alerte: "danger" }), rapport: null },
    detresse: { verdict: Sortie04.parse({ ...verdict, alerte: "detresse" }), rapport: null },
    mineur: { verdict: Sortie04.parse({ ...verdict, ...vide, alerte: "mineur", mode_sobre: true }), rapport: doux },
  };
  /* La même mémoire de secours, sans alerte : le témoin */
  const sansAlerte = ({ verdict: v, rapport: r }: Sources): Sources => ({ verdict: { ...v, alerte: null }, rapport: r && { ...r, alerte: null } });
  const secours = (sources: Sources) => memoireDeSecours({ ...sources, lignes: rendu.lignes, suivant: lu.messages.length + 1, jour: "2026-10-01" });
  const enChat = (sources: Sources) => {
    const m = secours(sources);
    return requeteChat({
      h,
      aujourdhui: Date.UTC(2026, 9, 1),
      chiffres: rendu.chiffres,
      fin: rendu.fin,
      etat: m.etat,
      lignes: new Map(m.lignes),
      style: profil(h, lu.messages).bloc,
      fil: [],
      dit: "je lui réponds quoi ?",
    });
  };
  const enMaj = (sources: Sources) => {
    const m = secours(sources);
    return requeteMemoireMaj(h, Date.UTC(2026, 9, 1), m.etat, new Map(m.lignes), ["<nouveau>\n</nouveau>"]);
  };
  /* Les lignes de la mémoire et de la fiche dans le premier bloc, de <memoire> à </fiche> comprises */
  const memoireDe = (r: Requete) => {
    const l = textes(r)[0]!.split("\n");
    return l.slice(l.indexOf("<memoire>"), l.indexOf("</fiche>") + 1);
  };

  for (const [alerte, sources] of Object.entries(cas))
    it(`${alerte} : une ligne de plus dans <memoire>, qui porte l’alerte, juste avant « où on en est » ; le reste de la requête ne bouge pas`, () => {
      const ouOnEnEst = secours(sources).etat.memoire.ou_on_en_est;
      expect(ouOnEnEst).not.toBe("");
      expect(ouOnEnEst).not.toContain(alerte);
      for (const [requete, place] of [
        [enChat, 2],
        [enMaj, 1],
      ] as const) {
        const [avec, temoin] = [requete(sources), requete(sansAlerte(sources))];
        const [m, t] = [memoireDe(avec), memoireDe(temoin)];
        /* Au chat, après l’ouverture de <memoire> et la fin de la conv importée ; à la mise à jour, juste après l’ouverture */
        expect(m).toHaveLength(t.length + 1);
        expect(m[place]).toMatch(new RegExp(` : ${alerte}$`));
        expect(m.toSpliced(place, 1)).toEqual(t);
        expect(t[place]).toContain(ouOnEnEst);
        /* Rien d’autre ne change : ni les autres blocs, ni le reste du premier (l’histoire, les chiffres, l’aide) */
        expect(textes(avec)[0]!.replace(`${m[place]}\n`, "")).toBe(textes(temoin)[0]);
        expect(textes(avec).slice(1)).toEqual(textes(temoin).slice(1));
        expect(avec.blocs.map((b) => "cache" in b && b.cache)).toEqual(temoin.blocs.map((b) => "cache" in b && b.cache));
      }
    });

  /*
   * Sans alerte, la mémoire que lisent le chat et sa mise à jour reste celle d’avant la ligne de l’alerte, à l’octet :
   * ces empreintes ont été prises sur main (8345105) avant elle.
   */
  it("sans alerte : la mémoire que lisent le chat et sa mise à jour ne change pas d’un octet", () => {
    const sans = sansAlerte(cas.danger);
    expect(empreinte(memoireDe(enChat(sans)).join("\n"))).toBe("6790117e23af6ae3");
    expect(empreinte(memoireDe(enMaj(sans)).join("\n"))).toBe("ff45b1bb742a0f39");
    expect(empreinte(memoireDe(enChat(sansAlerte(cas.mineur))).join("\n"))).toBe("5ecf96e36380c1f1");
  });
});

describe("le montage partagé : la conv en cache une fois pour le verdict, le rapport et la mémoire", () => {
  /* Des consignes inventées : les vrais prompts restent dans le sous-module privé */
  const [c04, c05, c07] = ["consigne du verdict", "consigne du rapport", "consigne de la mémoire"];
  const rapport = { these: plan.these, chapitres: [chapitre(1)], sobre: null };
  const requetes = {
    verdict: requeteVerdict(rendu, c04),
    plan: requeteRapport(rendu, verdict, DEMANDE_PLAN, c05),
    premiere: requeteRapport(rendu, verdict, demandeMoitie(plan, "1 à 4"), c05),
    seconde: requeteRapport(rendu, verdict, demandeMoitie(plan, "5 à 8"), c05),
    memoire: requeteMemoireCreation(rendu, verdict, rapport, c07),
  };

  it("les cinq appels commencent par le même bloc, la conv et l’aide, mis en cache ; la consigne de chaque tâche vient après", () => {
    const [premier, ...autres] = Object.values(requetes).map((r) => r.blocs[0]);
    expect(premier).toMatchObject({ cache: true });
    for (const b of autres) expect(b).toEqual(premier);
    for (const r of Object.values(requetes)) expect(r.partage).toBe(true);
    const enCache = textes(requetes.verdict)[0]!;
    expect(enCache).toContain(rendu.conversation);
    for (const id of rendu.lignes.keys()) expect(enCache).toContain(id);
    expect(enCache).not.toContain(c04);
    expect(textes(requetes.verdict)[1]).toContain(c04);
    expect(textes(requetes.memoire)[1]).toContain(c07);
    for (const r of Object.values(requetes)) for (const t of textes(r)) expect(bienFermees(t)).toBe(true);
  });

  it("le plan et les deux moitiés partagent aussi la consigne et le verdict, en cache ; seule la demande change", () => {
    const [plan2, ...moities] = [requetes.plan, requetes.premiere, requetes.seconde].map((r) => r.blocs[1]);
    expect(plan2).toMatchObject({ cache: true });
    for (const b of moities) expect(b).toEqual(plan2);
    expect(textes(requetes.plan)[1]).toContain(c05);
    expect(new Set([requetes.plan, requetes.premiere, requetes.seconde].map((r) => textes(r)[2])).size).toBe(3);
  });

  it("ses blocs (instantané)", () => {
    expect({ verdict: structure(requetes.verdict), plan: structure(requetes.plan), memoire: structure(requetes.memoire) }).toMatchInlineSnapshot(`
      {
        "memoire": {
          "blocs": [
            {
              "balises": [
                "histoire",
                "chiffres",
                "conversation",
                "aide",
              ],
              "cache": true,
              "messages": "60 : m0001 … m0060",
            },
            {
              "balises": [
                "consigne",
                "format",
                "verdict",
                "rapport",
              ],
              "cache": false,
              "messages": "m0004, m0010",
            },
            {
              "balises": [],
              "cache": false,
              "messages": "aucun",
            },
          ],
          "tache": "07-memoire",
        },
        "plan": {
          "blocs": [
            {
              "balises": [
                "histoire",
                "chiffres",
                "conversation",
                "aide",
              ],
              "cache": true,
              "messages": "60 : m0001 … m0060",
            },
            {
              "balises": [
                "consigne",
                "format",
                "verdict",
              ],
              "cache": true,
              "messages": "m0004, m0010",
            },
            {
              "balises": [],
              "cache": false,
              "messages": "aucun",
            },
          ],
          "tache": "05-rapport",
        },
        "verdict": {
          "blocs": [
            {
              "balises": [
                "histoire",
                "chiffres",
                "conversation",
                "aide",
              ],
              "cache": true,
              "messages": "60 : m0001 … m0060",
            },
            {
              "balises": [
                "consigne",
                "format",
              ],
              "cache": false,
              "messages": "aucun",
            },
          ],
          "tache": "04-verdict",
        },
      }
    `);
  });

  it("le vocal : la consigne d’abord, puis ce qu’il dit, le même texte qu’avec le montage d’origine ; rien en cache (le socle, lui, l’est par le système)", () => {
    const args = { h, aujourdhui: Date.UTC(2026, 9, 1), verdict, rapport: { plan }, messages: [...rendu.lignes.values()].slice(0, 3) };
    const partage = requeteVocal({ ...args, consigne: "consigne du vocal" });
    const origine = requeteVocal(args);
    expect(partage.partage).toBe(true);
    expect(origine.partage).toBeUndefined();
    expect(origine.blocs).toHaveLength(1);
    expect(partage.blocs.some((b) => "cache" in b && b.cache)).toBe(false);
    expect(textes(partage)[0]).toContain("consigne du vocal");
    expect(textes(partage)[1]).toBe(textes(origine)[0]);
    expect(structure(partage).blocs.map((b) => ("balises" in b ? b.balises : []))).toEqual([
      ["consigne", "format"],
      ["histoire", "verdict", "rapport", "messages"],
    ]);
  });

  it("sans consigne, rien ne change : le montage d’origine", () => {
    expect(requeteVerdict(rendu).partage).toBeUndefined();
    expect(requeteRapport(rendu, verdict, DEMANDE_PLAN)).toEqual(requeteRapport(rendu, verdict, DEMANDE_PLAN, undefined));
  });
});
