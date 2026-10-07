import "server-only";

/* Les réponses des routes /api : du JSON, et des erreurs qui ne disent jamais rien d’interne. */
export const json = (corps: unknown, status = 200) => Response.json(corps, { status, headers: { "cache-control": "no-store" } });
export const erreur = (code: string, status: number) => json({ erreur: code }, status);

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
