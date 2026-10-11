import "server-only";
import { auMieux, journalErreur } from "../journal";
import { noterDepense, type Payeur } from "../budget";
import { db, schema } from "../db";

/*
 * Le suivi des coûts (ai_usage) : une ligne par appel payant à un prestataire (le modèle, la voix, la transcription),
 * jamais de contenu. Le budget de l’IA du jour l’additionne (src/server/budget.ts), le résumé de la nuit aussi
 * (src/server/alertes.ts). Ce que mesure chaque colonne de quantité dépend du prestataire :
 *   - le modèle : les jetons lus, écrits et en cache ;
 *   - la voix (« vocal_voix ») : les caractères dits, en `sortie` (le plafond du mois les additionne, src/server/ia/voix.ts) ;
 *   - la transcription (« vocal_transcription ») : les secondes de son, en `entree`.
 */

/** Un appel à noter : sa conv s’il en a une, son étiquette, le modèle, ce qu’il a coûté (en millionièmes de dollar) et son temps. */
type Cout = {
  storyId?: string | null;
  tache: string;
  modele: string;
  entree?: number;
  sortie?: number;
  cacheLu?: number;
  cacheEcrit?: number;
  micros: number;
  ms: number;
  /** Qui paie, quand l’appel compte dans le budget du jour d’un compte (src/server/budget.ts) : la dépense s’y ajoute aussi. */
  payeur?: Payeur;
};

/**
 * Note un appel dans le suivi des coûts (et, avec `payeur`, dans la dépense du jour de qui paie). Ne lève jamais : le
 * suivi des coûts ne doit pas faire échouer une réponse, une ligne perdue part dans les logs (son étiquette seulement).
 */
export async function noterCout({ storyId, tache, modele, entree = 0, sortie = 0, cacheLu = 0, cacheEcrit = 0, micros, ms, payeur }: Cout): Promise<void> {
  if (payeur !== undefined) await auMieux(noterDepense(payeur, micros), "dépense non notée", { tache });
  try {
    await db()
      .insert(schema.aiUsage)
      .values({
        storyId: storyId ?? null,
        task: tache,
        model: modele,
        inputTokens: Math.round(entree),
        outputTokens: Math.round(sortie),
        cacheReadTokens: cacheLu,
        cacheWriteTokens: cacheEcrit,
        costMicros: Math.round(micros),
        ms: Math.round(ms),
      });
  } catch (e) {
    journalErreur("usage non noté", e, { tache });
  }
}
