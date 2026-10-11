import { eq } from "drizzle-orm";
import { afterEach, beforeEach } from "vitest";
import type { Requete } from "@prompts/lib/contextes";
import { executerChaine } from "@/server/pipeline";
import type { Utilisateur } from "@/server/auth";
import { db, schema } from "@/server/db";
import { definirQui, importer, rattacherBrouillon, type LigneComplete, type Meta } from "@/server/histoires";
import { depuisFichier } from "@/server/import";
import { definirFactice } from "@/server/ia/claude";
import { planifier } from "@/server/taches";
import { convDeTest } from "./fichiers";
import { creees } from "./nettoyage";

/*
 * Les fixtures des tests avec la base (le projet `db` de vitest.config.mts) : un compte, une conv des évals importée,
 * rattachée au compte, « Qui es-tu ? » rempli, puis lue ; et le modèle factice remplacé le temps d’un test ou d’une
 * étape. Les comptes et les brouillons qu’elles créent sont effacés à la fin du fichier (tests/aide/isolation.ts) :
 * un test n’a ni email à inventer ni `afterAll` à écrire.
 */

/** Une conv importée : son histoire, sa meta, et le secret du cookie de son brouillon. */
export type Importee = Awaited<ReturnType<typeof importer>>;
type Qui = Parameters<typeof definirQui>[1];
/** « Qui es-tu ? » pour un test : seulement ce qui change ; `moi` est la place (0 ou 1), ou le prénom de l’utilisateur dans la conv. */
type QuiDeTest = Partial<Omit<Qui, "moi">> & { moi?: Qui["moi"] | string };
/* Par défaut : le premier participant, un garçon, ils se sont vus, il veut être avec elle */
const QUI: Qui = { moi: 0, pronom: "il", devinette: "vus", objectif: "ensemble" };

let comptes = 0;
/** Un compte neuf (gratuit, sauf `plan`), à l’email unique `<prefixe>-…@blush.test`, effacé à la fin du fichier. */
export async function compteDeTest(prefixe: string, plan: Utilisateur["plan"] = "gratuit"): Promise<Utilisateur> {
  const u = (await db()
    .insert(schema.users)
    .values({ email: `${prefixe}-${Date.now()}-${++comptes}@blush.test`, plan })
    .returning())[0]!;
  creees.comptes.push(u.id);
  return u;
}

/** La place de quelqu’un dans la conv (0 ou 1), d’après son prénom : le `moi` de « Qui es-tu ? ». */
export function moiDans(meta: Pick<Meta, "participants">, prenom: string): 0 | 1 {
  const k = meta.participants.findIndex((p) => p.prenom === prenom);
  if (k === 0 || k === 1) return k;
  throw new Error(`${prenom} n’est pas l’un des deux participants de la conv`);
}

/** Une conv des évals importée (prompts/evals/convs) : un brouillon, sans compte. */
export async function convImportee(nom: string): Promise<Importee> {
  const imp = await importer(await depuisFichier(convDeTest(nom)));
  creees.histoires.push(imp.id);
  return imp;
}

/** Une conv des évals (ou un brouillon de convImportee) rattachée au compte : « Qui es-tu ? » reste à remplir. */
export async function convRattachee(u: Utilisateur, conv: string | Importee): Promise<Importee> {
  const imp = typeof conv === "string" ? await convImportee(conv) : conv;
  if ((await rattacherBrouillon(u, imp.secret)) !== imp.id) throw new Error(`la conv ${imp.id} ne s’est pas rattachée au compte`);
  return imp;
}

/** Une conv rattachée au compte, « Qui es-tu ? » rempli : prête à être lue. */
export async function convPrete(u: Utilisateur, conv: string | Importee, qui: QuiDeTest = {}): Promise<Importee> {
  const imp = await convRattachee(u, conv);
  const moi = typeof qui.moi === "string" ? moiDans(imp.meta, qui.moi) : (qui.moi ?? QUI.moi);
  await definirQui(imp.id, { ...QUI, ...qui, moi });
  return imp;
}

/**
 * Une conv prête, puis lue : le verdict, et ce que le plan du compte ouvre ensuite (le rapport, le vocal, la mémoire).
 * `avant` : de quoi changer l’histoire juste avant la lecture.
 */
export async function histoireLue(u: Utilisateur, conv: string | Importee, { qui, avant }: { qui?: QuiDeTest; avant?: (id: string) => Promise<unknown> } = {}): Promise<Importee> {
  const imp = await convPrete(u, conv, qui);
  await avant?.(imp.id);
  await planifier(imp.id, "verdict");
  await executerChaine(imp.id);
  return imp;
}

/** La ligne d’une histoire telle qu’elle est en base, conv brute comprise. */
export const ligneEnBase = async (id: string): Promise<LigneComplete> => (await db().select().from(schema.stories).where(eq(schema.stories.id, id)))[0]!;

/** Un modèle factice : ce qu’il rend pour une requête (definirFactice, src/server/ia/claude.ts). */
type Factice = (req: Requete) => unknown;
/* Le modèle factice du test en cours (facticePourChaqueTest), que reprend avecFactice après son étape */
let facticeDuTest: Factice | null = null;

/** Pour chaque test du fichier (ou du describe) : le modèle factice `f`, puis de nouveau celui par défaut, que le test passe ou non. */
export function facticePourChaqueTest(f: Factice): void {
  beforeEach(() => definirFactice((facticeDuTest = f)));
  afterEach(() => definirFactice((facticeDuTest = null)));
}

/** Le temps de `etape` seulement : le modèle factice `f`, puis celui d’avant, même si l’étape échoue. */
export async function avecFactice<T>(f: Factice, etape: () => Promise<T>): Promise<T> {
  definirFactice(f);
  try {
    return await etape();
  } finally {
    definirFactice(facticeDuTest);
  }
}
