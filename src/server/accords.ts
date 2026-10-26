import "server-only";
import type { Pronom, Role } from "@prompts/lib/conv";
import { pronomOppose } from "@/lib/pronom";
import type { Meta, Participant } from "./histoires";

/*
 * Le pronom que la conv laisse lire de chacun : ses accords quand il parle de lui (« je suis rentrée », « désolé ») et
 * ceux de l’autre quand il lui parle (« t’es prête ? », « ma chérie »). « Qui es-tu ? » ne demande que le tien : c’est
 * ce qui dit, sans question de plus, que vous êtes deux filles ou deux garçons. Prudent, et pas pareil dans les deux
 * sens : beaucoup de filles écrivent « je suis rentré » ou « désolé » sans le e, aucun garçon « je suis rentrée » (sauf
 * pour rire). Le féminin se lit donc sur tous les accords ; le masculin demande au moins un accord qu’un e oublié ne
 * donne pas (« beau », « heureux », « mon chéri »), et jamais quand la conv a un féminin pour lui. Sinon rien n’est lu : l’autre
 * garde l’opposé du tien (pronomDeLAutre), et sa fiche le corrige.
 */

/**
 * Les mots qui s’accordent, sans accents : le masculin, puis le féminin. Aucun ne se lit autrement après « je suis » ou
 * « t’es ». D’abord ceux dont le féminin ne fait qu’ajouter un e (son oubli donne le masculin), puis les autres (FORTS).
 */
const ACCORDS: readonly [masculin: string, feminin: string][] = [
  ["pret", "prete"],
  ["content", "contente"],
  ["desole", "desolee"],
  ["fatigue", "fatiguee"],
  ["creve", "crevee"],
  ["epuise", "epuisee"],
  ["rentre", "rentree"],
  ["arrive", "arrivee"],
  ["parti", "partie"],
  ["sorti", "sortie"],
  ["venu", "venue"],
  ["alle", "allee"],
  ["tombe", "tombee"],
  ["leve", "levee"],
  ["couche", "couchee"],
  ["reveille", "reveillee"],
  ["endormi", "endormie"],
  ["occupe", "occupee"],
  ["mort", "morte"],
  ["certain", "certaine"],
  ["seul", "seule"],
  ["fier", "fiere"],
  ["chaud", "chaude"],
  ["inquiet", "inquiete"],
  ["nul", "nulle"],
  ["grand", "grande"],
  ["petit", "petite"],
  ["gentil", "gentille"],
  ["mignon", "mignonne"],
  ["chiant", "chiante"],
  ["marrant", "marrante"],
  ["gene", "genee"],
  ["choque", "choquee"],
  ["decu", "decue"],
  ["perdu", "perdue"],
  ["motive", "motivee"],
  ["bourre", "bourree"],
  ["vexe", "vexee"],
  ["enerve", "enervee"],
  ["stresse", "stressee"],
  ["presse", "pressee"],
  ["excite", "excitee"],
  ["blesse", "blessee"],
  ["coince", "coincee"],
];
/** Les accords dont le masculin ne vient pas d’un e oublié : eux seuls disent « il ». */
const FORTS: readonly [masculin: string, feminin: string][] = [
  ["beau", "belle"],
  ["heureux", "heureuse"],
  ["jaloux", "jalouse"],
  ["amoureux", "amoureuse"],
  ["curieux", "curieuse"],
  ["nerveux", "nerveuse"],
  ["serieux", "serieuse"],
  ["fou", "folle"],
  ["vieux", "vieille"],
  ["doux", "douce"],
];
/** Ce que dit un accord : son pronom, et s’il est fort (son masculin ne vient pas d’un e oublié). */
type Accord = { g: Pronom; fort: boolean };
const GENRE = new Map<string, Accord>(
  [...ACCORDS.map((p) => [p, false] as const), ...FORTS.map((p) => [p, true] as const)].flatMap(([[m, f], fort]) => [
    [m, { g: "il", fort }] as const,
    [f, { g: "elle", fort }] as const,
  ]),
);
const MOTS = [...GENRE.keys()].sort((a, b) => b.length - a.length).join("|");

/* Jusqu’à deux mots entre le verbe et l’accord : « je suis pas trop prête », « t’es grave belle » */
const ENTRE =
  "(?:(?:trop|tellement|si|grave|grv|super|vraiment|vrm|hyper|ultra|mega|vachement|tres|pas|plus|encore|deja|bien|tout|toute|assez|completement|carrement|juste|toujours|tjrs|jamais|enfin|presque|limite|un peu)\\s+){0,2}";
/** Celui qui écrit parle de lui. */
const SUR_SOI = new RegExp(
  `(?<![a-z'])(?:je suis|jsuis|j'suis|chuis|j'etais|jetais|je serai|je serais|je me suis|j'me suis|jme suis|je me sens|j'me sens|jme sens)\\s+${ENTRE}(${MOTS})(?![a-z'-])`,
  "g",
);
/** Celui qui écrit parle à l’autre (« tes trop belle » : la conv écrit souvent « t’es » ainsi). */
const SUR_L_AUTRE = new RegExp(
  `(?<![a-z'])(?:t'es|t es|tes|tu es|t'etais|tu etais|tu seras|tu serais|tu t'es|tu tes|t'as l'air|tas l'air|tu as l'air|tu te sens)\\s+${ENTRE}(${MOTS})(?![a-z'-])`,
  "g",
);
/** Un message qui s’ouvre sur une excuse : « désolée j’ai pas vu », « oups désolé ». Celui qui écrit parle de lui. */
const EXCUSE = /^[^a-z]*(?:(?:ah|oh|oups|oula|bon|ok|oui|non|pardon|ptn)[^a-z]+)?(desolee|desole)(?![a-z'-])/;
/** Celui qui écrit appelle l’autre : « ma chérie », « mon chéri », « coucou ma belle », « merci mon beau ». Tous forts. */
const APPELS: readonly [RegExp, Pronom][] = [
  [/(?<![a-z'])ma (?:petite |belle )?cherie(?![a-z])/, "elle"],
  [/(?<![a-z'])mon (?:petit |beau )?cheri(?![a-z])/, "il"],
  [/(?<![a-z'])ma belle(?![a-z'-])(?!\s+[a-z])/, "elle"],
  [/(?<![a-z'])mon beau(?![a-z'-])(?!\s+[a-z])/, "il"],
];

/** « elle » se lit avec au moins ces messages au féminin, et ce nombre de fois plus qu’au masculin. */
const ELLE_MIN = 3;
const ELLE_RAPPORT = 3;
/** « il » se lit sans aucun message au féminin, avec deux messages au masculin fort, ou un et quatre au masculin en tout. */
const IL_FORTS = 2;
const IL_UN_FORT_ET = 4;

/** Minuscules, sans accents, une seule apostrophe : « T’es RENTRÉE » → « t'es rentree ». */
const normaliser = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘`´]/g, "'");

const accords = (texte: string, motif: RegExp): Accord[] => [...texte.matchAll(motif)].map((m) => GENRE.get(m[1]!)!);

/** Combien de messages disent « elle », « il », et « il » par un accord fort. */
type Votes = { elle: number; il: number; ilFort: number };
const net = ({ elle, il, ilFort }: Votes): Pronom | undefined =>
  elle >= ELLE_MIN && elle >= ELLE_RAPPORT * il ? "elle" : elle === 0 && (ilFort >= IL_FORTS || (ilFort >= 1 && il >= IL_UN_FORT_ET)) ? "il" : undefined;

/**
 * Ce que la conv dit du pronom de chacun, par son rôle à la lecture (`toi` : le premier participant de l’import, `autre` :
 * le second), quand elle le dit nettement (voir plus haut). Un message compte une fois par personne et par pronom :
 * « désolée désolée désolée » ne vaut pas trois.
 */
export function pronomsLus(messages: readonly { role: Role; texte: string }[]): Partial<Record<"toi" | "autre", Pronom>> {
  const votes: Record<"toi" | "autre", Votes> = { toi: { elle: 0, il: 0, ilFort: 0 }, autre: { elle: 0, il: 0, ilFort: 0 } };
  for (const m of messages) {
    if (m.role === "inconnu" || !m.texte) continue;
    const t = normaliser(m.texte);
    const lAutre = m.role === "toi" ? "autre" : "toi";
    const vus = new Set<`${"toi" | "autre"}:${keyof Votes}`>();
    const noter = (qui: "toi" | "autre", { g, fort }: Accord) => {
      vus.add(`${qui}:${g}`);
      if (g === "il" && fort) vus.add(`${qui}:ilFort`);
    };
    for (const a of accords(t, SUR_SOI)) noter(m.role, a);
    const excuse = EXCUSE.exec(t)?.[1];
    if (excuse) noter(m.role, GENRE.get(excuse)!);
    for (const a of accords(t, SUR_L_AUTRE)) noter(lAutre, a);
    for (const [motif, g] of APPELS) if (motif.test(t)) noter(lAutre, { g, fort: true });
    for (const v of vus) {
      const [qui, cle] = v.split(":") as ["toi" | "autre", keyof Votes];
      votes[qui][cle] += 1;
    }
  }
  const toi = net(votes.toi);
  const autre = net(votes.autre);
  return { ...(toi ? { toi } : {}), ...(autre ? { autre } : {}) };
}

/**
 * Le pronom de l’autre : celui que tu as choisi sur sa fiche, sinon celui que la conv laisse lire, sinon l’opposé du
 * tien. La conv n’est pas crue sur l’autre quand elle se trompe sur toi (elle te lit « il », tu as dit « elle ») : ses
 * accords viennent alors d’ailleurs (des messages cités, un téléphone prêté).
 */
export function pronomDeLAutre(meta: Pick<Meta, "pronom" | "pronomAutre">, personnes: { moi: Participant; autre: Participant }): Pronom {
  return pronomDeLAutreLu(meta, personnes).pronom;
}

/** Le pronom de l’autre (pronomDeLAutre), et d’où il vient : sa fiche, la conv, ou l’opposé du tien (`devine`). */
export function pronomDeLAutreLu(
  meta: Pick<Meta, "pronom" | "pronomAutre">,
  { moi, autre }: { moi: Participant; autre: Participant },
): { pronom: Pronom; source: "fiche" | "conv" | "devine" } {
  if (meta.pronomAutre) return { pronom: meta.pronomAutre, source: "fiche" };
  const croire = !moi.pronomLu || !meta.pronom || moi.pronomLu === meta.pronom;
  if (croire && autre.pronomLu) return { pronom: autre.pronomLu, source: "conv" };
  return { pronom: pronomOppose(meta.pronom), source: "devine" };
}
