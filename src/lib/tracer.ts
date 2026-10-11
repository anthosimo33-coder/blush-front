/*
 * Ce qu’on garde d’une erreur, dans le navigateur comme sur le serveur (src/server/journal.ts) : son nom, son code, son
 * empreinte (digest), jamais son message. Le message d’une erreur SQL cite ses paramètres (un email), celui d’un JSON
 * illisible un morceau de la conv, celui d’une erreur du navigateur une adresse avec ses paramètres.
 * Dans le navigateur, tracer() écrit seulement dans sa console (décidé) : rien n’est envoyé au serveur. Une route
 * /api/journal bornée serait un ajout à décider. Les `catch {}` des écrans y passeront au lot 8.
 */

/** Un champ d’une ligne du journal : un nom, un code, un identifiant, un nombre. Jamais un texte venu de l’utilisateur. */
type Champ = string | number | boolean | null | undefined;
export type Champs = Record<string, Champ>;

/** Un code qu’on peut écrire tel quel : court, sans espace (« refus:cyber », « 23505 », « ECONNRESET »). Le reste est tu. */
const CODE_SUR = /^[\w:.-]{1,60}$/;

/** Le nom d’une erreur (« TypeError », « DrizzleQueryError ») ; pour ce qui n’en est pas une, son type. */
const nomDe = (e: unknown): string => (e instanceof Error ? e.name : e === null ? "null" : typeof e);

/** Le champ `cle` de `e`, s’il est un code sûr à écrire. */
function codeSur(e: unknown, cle: "code" | "digest"): string | undefined {
  if (typeof e !== "object" || e === null || !(cle in e)) return undefined;
  const v = (e as Record<string, unknown>)[cle];
  const s = typeof v === "number" ? String(v) : v;
  return typeof s === "string" && CODE_SUR.test(s) ? s : undefined;
}

/**
 * Ce qu’une ligne du journal dit d’une erreur : son nom, son code (celui d’une ErreurTache, d’une ErreurPublique, d’une
 * erreur de Postgres ou de Node), son empreinte (`digest`, que Next pose et que la page d’erreur montre), et le nom et le
 * code de sa cause (une erreur de Drizzle enveloppe celle de Postgres). Jamais son message ni sa pile.
 */
export function champsDErreur(e: unknown): Champs {
  const cause = e instanceof Error ? e.cause : undefined;
  return {
    erreur: nomDe(e),
    code: codeSur(e, "code"),
    digest: codeSur(e, "digest"),
    ...(cause === undefined ? {} : { cause: nomDe(cause), codeCause: codeSur(cause, "code") }),
  };
}

/** Une chaîne d’un champ, bornée : un identifiant ou un code tient en 120 caractères, un texte ne s’y glisse pas en entier. */
const LONGUEUR_MAX = 120;

/** La ligne JSON d’un événement : son nom, puis ses champs (bornés, sans les vides). */
export function ligneDuJournal(evenement: string, champs: Champs): string {
  const bornes = Object.fromEntries(
    Object.entries(champs)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, typeof v === "string" ? v.slice(0, LONGUEUR_MAX) : v]),
  );
  return JSON.stringify({ evenement: evenement.slice(0, LONGUEUR_MAX), ...bornes });
}

/**
 * Dans le navigateur : une erreur attrapée qu’on ne montre pas (un son qui ne part pas, un préchargement raté) laisse
 * une ligne dans la console, au lieu de disparaître dans un `catch {}`. `e` : l’erreur, réduite à son nom et à son code.
 */
export function tracer(evenement: string, e?: unknown, champs: Champs = {}): void {
  console.warn(ligneDuJournal(evenement, { ...champs, ...(e === undefined ? {} : champsDErreur(e)) }));
}
