import "server-only";
import { auMieux, journalErreur } from "../journal";
import { noterDepense, type Payeur } from "../budget";
import { db, schema } from "../db";
import { quiAFaitLAppel } from "../population";

/*
 * Le suivi des coûts (ai_usage) : une ligne par appel payant à un prestataire (le modèle, la voix, la transcription),
 * jamais de contenu. Le budget de l’IA du jour l’additionne (src/server/budget.ts), le résumé de la nuit aussi
 * (src/server/veille.ts). Ce que mesure chaque colonne de quantité dépend du prestataire :
 *   - le modèle : les jetons lus, écrits et en cache ;
 *   - la voix (« vocal_voix ») : les caractères dits, en `sortie` (le plafond du mois, lui, les compte dans rate_limits : voix:mois, src/server/ia/voix.ts) ;
 *   - la transcription (« vocal_transcription ») : les secondes de son, en `entree`.
 * Chaque ligne dit aussi qui a fait l’appel (`population`, la règle « qui est qui » : src/server/population.ts), jugée
 * dans l’insert même, une fois la réponse là, et si elle s’est jugée sans compte (`sans_compte`) ; jamais le compte
 * lui-même : l’IA des tests et celle du produit se lisent à part dans /admin.
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
  /** Une lecture d’avant l’import : l’empreinte de son envoi, que l’import retrouve (src/server/imports.ts). */
  envoi?: string | null;
  /** Un lot d’enregistrement : son empreinte, qu’un nouvel essai qui le reprend retrouve (src/server/lots.ts). */
  lot?: string | null;
  /** Sans conv : le compte connecté qui a fait l’appel (des captures lues avant l’import), pour sa population. */
  compte?: { id: string } | null;
};

/**
 * Note un appel dans le suivi des coûts (et, avec `payeur`, dans la dépense du jour de qui paie), avec qui l’a fait (sa
 * population, quiAFaitLAppel). Ne lève jamais : le suivi des coûts ne doit pas faire échouer une réponse. Une règle « qui
 * est qui » en échec, ou une conv effacée avant la note, ne perdent pas la ligne : elle se note sans population (sans sa
 * conv s’il le faut), que le passage des 5 minutes range à son heure (rangerLesCouts), et le journal dit pourquoi. Un
 * nouvel essai seulement sur un refus de la base qu’ils peuvent causer (refusParLaRegle) : une panne de la connexion ou un
 * délai dépassé arrêtent là, la ligne perdue part dans les logs (son étiquette seulement). Un insert peut avoir été écrit
 * avant que sa réponse se perde : le rejouer compterait l’appel deux fois (le budget du jour, /admin), et chaque essai
 * attendrait encore une connexion (30 s au plus) après un appel déjà payé.
 */
export async function noterCout({
  storyId,
  tache,
  modele,
  entree = 0,
  sortie = 0,
  cacheLu = 0,
  cacheEcrit = 0,
  micros: brut,
  ms,
  payeur,
  envoi,
  lot,
  compte,
}: Cout): Promise<void> {
  /*
   * Arrondi une fois pour les deux : la dépense du jour s’ajoute à un compteur entier (rate_limits.count). La voix est
   * comptée au caractère (22 $ pour 121 000), des millionièmes à virgule : sans l’arrondi, Postgres refusait chaque
   * dépense de voix (22P02), qui ne comptait jamais dans le budget du jour
   */
  const micros = Math.round(brut);
  if (payeur !== undefined) await auMieux(noterDepense(payeur, micros), "dépense non notée", { tache });
  const ligne = {
    storyId: storyId ?? null,
    task: tache,
    model: modele,
    inputTokens: Math.round(entree),
    outputTokens: Math.round(sortie),
    cacheReadTokens: cacheLu,
    cacheWriteTokens: cacheEcrit,
    costMicros: micros,
    ms: Math.round(ms),
    envoi: envoi ?? null,
    lot: lot ?? null,
  };
  const essais = [
    () => ({ ...ligne, ...quiAFaitLAppel({ storyId, compte, envoi }) }),
    /* La règle en échec (une panne de sa requête) : la ligne sans elle, que le rattrapage range, plutôt que rien */
    () => ligne,
    /* Sa conv effacée avant la note (la clé étrangère refusée) : la ligne sans conv (son coût compte encore pour le jour) */
    ...(storyId ? [() => ({ ...ligne, storyId: null })] : []),
  ];
  let premiere: unknown = null;
  for (const valeurs of essais) {
    try {
      await db().insert(schema.aiUsage).values(valeurs());
      if (premiere) journalErreur("usage noté sans sa population", premiere, { tache });
      return;
    } catch (e) {
      premiere ??= e;
      if (!refusParLaRegle(e)) break;
    }
  }
  journalErreur("usage non noté", premiere, { tache });
}

/**
 * Un refus de la base que la règle « qui est qui » ou une conv effacée peuvent causer, et qui n’a rien écrit : une clé
 * étrangère (23503), une sous-requête à plusieurs lignes (21000), une valeur refusée (la classe 22 : un identifiant qui
 * n’est pas un uuid, 22P02), une requête mal formée (la classe 42). Le code SQL est celui de l’erreur de Postgres, que
 * Drizzle enveloppe (sa `cause`). Une panne de la connexion, un délai, un verrou : rien de tout ça.
 */
function refusParLaRegle(e: unknown): boolean {
  const cause = e instanceof Error && e.cause !== undefined ? e.cause : e;
  const code = typeof cause === "object" && cause !== null && "code" in cause ? (cause as { code: unknown }).code : undefined;
  return typeof code === "string" && /^(23503|21000|22...|42...)$/.test(code);
}
