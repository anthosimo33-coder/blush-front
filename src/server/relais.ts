import "server-only";
import { env } from "./env";
import { journal, journalErreur } from "./journal";

/*
 * Le relais de la chaîne des tâches. Une fonction Vercel vit DUREE_FONCTION_S (800 s, src/server/echeance.ts) : une
 * lecture entière y tient d’habitude, et le relais ne sert plus qu’aux convs très longues, à une chaîne lancée tard dans
 * une fonction déjà entamée (le chat après sa réponse) et aux essais qui se répètent. Quand la prochaine étape d’une histoire ne
 * finirait pas avant l’échéance (la mémoire, après le rapport écrit dans la fonction qui a livré l’achat), la chaîne
 * passe la main à une nouvelle fonction (GET /api/cron/chaine, avec le secret CRON_SECRET), qui la reprend aussitôt,
 * avec tout son temps. Sans lui, l’étape attendait qu’un écran vienne la chercher, et la fiche d’une conv payée restait
 * vide. Le passage des 5 minutes (Vercel Cron) rattrape un relais raté (reprendreLesChainesEnPlan, src/server/pipeline.ts).
 */

/** Combien de relais d’affilée pour une histoire : chaque étape tient dans une fonction neuve, au-delà c’est une boucle. */
export const RELAIS_MAX = 5;

/** Le temps d’attendre la réponse du relais : il répond tout de suite, la chaîne tourne après sa réponse. */
const DELAI_RELAIS_MS = 10_000;

/**
 * Passe la chaîne de cette histoire à une nouvelle fonction. `relais` : le rang de ce relais (1 pour le premier), que la
 * route rend à la chaîne qu’elle relance. Vrai si la route l’a pris ; faux sans le secret (en local : la chaîne attend
 * le prochain écran, comme avant), au-delà de RELAIS_MAX, ou si l’appel échoue (la veille le rattrapera).
 */
export async function passerLaMain(storyId: string, relais: number): Promise<boolean> {
  const { CRON_SECRET, BLUSH_URL } = env();
  if (!CRON_SECRET) return false;
  if (relais > RELAIS_MAX) {
    journal("chaîne : trop de relais d’affilée", { histoire: storyId, relais }, "alerte");
    return false;
  }
  const adresse = new URL("/api/cron/chaine", BLUSH_URL);
  adresse.search = new URLSearchParams({ histoire: storyId, relais: String(relais) }).toString();
  try {
    const r = await fetch(adresse, { headers: { authorization: `Bearer ${CRON_SECRET}` }, signal: AbortSignal.timeout(DELAI_RELAIS_MS), cache: "no-store" });
    if (r.ok) return true;
    journal("chaîne : relais refusé", { histoire: storyId, relais, statut: r.status }, "erreur");
  } catch (e) {
    journalErreur("chaîne : relais impossible", e, { histoire: storyId, relais });
  }
  return false;
}
