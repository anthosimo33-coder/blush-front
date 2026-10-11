import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import type { CleJson, ReponseErreur, Routes } from "@/types/api";
import { codePublic, ERREURS_API, type CodeErreur } from "@/types/erreurs-api";
import { ErreurPublique, ErreurTache } from "./erreurs";

/*
 * Les réponses des routes /api : du JSON, celui que dit leur ligne du contrat (src/types/api.ts), et des erreurs qui ne
 * disent jamais rien d’interne.
 */
const json = (corps: unknown, status: number, entetes: Record<string, string>) => Response.json(corps, { status, headers: { "cache-control": "no-store", ...entetes } });

/**
 * La réponse d’une route, sous le type de sa ligne du contrat (Routes, src/types/api.ts) : le compilateur vérifie
 * qu’elle le suit, et le navigateur la lit sous ce même type (appel, src/services/api.ts). La clé nomme la route qui
 * répond : tests/unit/contrat.test.ts vérifie que c’est bien la sienne. Le type ne retire rien : un objet qui a des
 * champs en plus (une variable, pas un littéral) passe, et ses champs partent avec lui. Une route n’envoie que ce que
 * dit sa ligne en l’écrivant champ par champ.
 */
export const repondre = <K extends CleJson>(_route: K, corps: Routes[K]["reponse"], status = 200, entetes: Record<string, string> = {}) => json(corps, status, entetes);

/** Une erreur de la liste (src/types/erreurs-api.ts), avec son statut : un code a toujours le même. */
export const erreur = (code: CodeErreur) => json({ erreur: code } satisfies ReponseErreur, ERREURS_API[code], {});

/**
 * La réponse d’une erreur levée pendant une route, la même partout. Une ErreurPublique (un import refusé, un ajout sans
 * rien de neuf, un partage pas prêt…) répond son code. Une erreur d’étape (ErreurTache) son code public : le refus du
 * modèle, le vocal, ou la panne ; son code interne reste dans l’alerte que la route envoie à l’équipe. Le reste (un bug,
 * la base) répond « panne », sans rien en dire au navigateur : l’erreur va aux logs. Les erreurs de Next lui-même
 * (redirect, notFound, le rendu dynamique) repartent telles quelles.
 */
export function reponseErreur(e: unknown): Response {
  unstable_rethrow(e);
  if (e instanceof ErreurPublique) return erreur(e.code);
  if (e instanceof ErreurTache) return erreur(codePublic(e.code));
  console.error(e);
  return erreur("panne");
}

/**
 * Fait oublier au navigateur ce qu’il garde de BLUSH : son cache, et son stockage (où tu t’étais arrêté dans le rapport,
 * le parcours de l’onglet, les clés de src/state/cles.ts…), à la déconnexion et quand on efface tout. Pas les cookies :
 * l’en-tête les effacerait aussi sur les autres sous-domaines ; ceux de BLUSH s’effacent un par un.
 */
export const OUBLIER_LE_NAVIGATEUR = { "clear-site-data": '"cache", "storage"' };

/** Une requête qui modifie quelque chose doit venir de l’appli elle-même (contre les requêtes forgées depuis un autre site). */
export function memeOrigine(req: Request): boolean {
  const origine = req.headers.get("origin");
  const hote = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origine || !hote) return false;
  try {
    return new URL(origine).host === hote;
  } catch {
    return false;
  }
}

/**
 * Le corps JSON d’une requête, vérifié par un schéma (celui de sa ligne du contrat, src/types/api.ts, que la route peut
 * resserrer) : null s’il n’est pas du JSON ou ne le suit pas. La route répond alors son propre code (texte, email,
 * invalide…), ou fait sans (une relance, une déconnexion de cet appareil seulement).
 */
export async function lireCorps<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S> | null> {
  let brut: unknown;
  try {
    brut = await req.json();
  } catch {
    return null;
  }
  const lu = schema.safeParse(brut);
  return lu.success ? lu.data : null;
}

/**
 * Un audio (MP3) à lire dans le navigateur. Il cite la conv : le navigateur ne le garde pas (sur un appareil partagé,
 * il ne resterait pas lisible après la déconnexion). Safari lit l’audio par morceaux : on répond aux plages (Range).
 */
export function reponseAudio(req: Request, audio: Buffer): Response {
  const entetes = { "content-type": "audio/mpeg", "accept-ranges": "bytes", "cache-control": "private, no-store" };
  const plage = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (plage && (plage[1] || plage[2])) {
    const total = audio.length;
    const debut = plage[1] ? +plage[1] : Math.max(0, total - +plage[2]);
    const fin = plage[1] && plage[2] ? Math.min(+plage[2], total - 1) : total - 1;
    if (debut >= total || debut > fin) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
    return new Response(new Uint8Array(audio.subarray(debut, fin + 1)), {
      status: 206,
      headers: { ...entetes, "content-range": `bytes ${debut}-${fin}/${total}`, "content-length": String(fin - debut + 1) },
    });
  }
  return new Response(new Uint8Array(audio), { headers: { ...entetes, "content-length": String(audio.length) } });
}
