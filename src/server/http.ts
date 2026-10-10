import "server-only";
import { ERREURS_API, type CodeErreur } from "@/types/erreurs-api";

/* Les réponses des routes /api : du JSON, et des erreurs qui ne disent jamais rien d’interne. */
export const json = (corps: unknown, status = 200) => Response.json(corps, { status, headers: { "cache-control": "no-store" } });
/** Une erreur de la liste (src/types/erreurs-api.ts), avec son statut : un code a toujours le même. */
export const erreur = (code: CodeErreur) => json({ erreur: code }, ERREURS_API[code]);

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

/** Lit un corps JSON sans faire planter la route. */
export async function corps<T = Record<string, unknown>>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
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
