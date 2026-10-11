import "server-only";
import { champsDErreur, ligneDuJournal, type Champs } from "@/lib/tracer";

/*
 * Le journal du serveur : une ligne JSON par événement, dans les logs de Vercel (la sortie de la fonction). Un nom
 * d’événement, puis des champs courts : des codes, des identifiants, des nombres. Jamais de contenu : ni la conv, ni un
 * email, ni le message d’une erreur (champsDErreur, src/lib/tracer.ts, n’en garde que le nom et le code).
 * Le lot 7 y fera passer les console.* qui restent (et la règle no-console).
 */

/** info : ce qui s’est passé ; alerte : ce qui mérite un coup d’œil (un repli, un refus du modèle) ; erreur : ce qui a échoué. */
type Niveau = "info" | "alerte" | "erreur";

const SORTIES: Record<Niveau, (ligne: string) => void> = {
  info: (l) => console.info(l),
  alerte: (l) => console.warn(l),
  erreur: (l) => console.error(l),
};

/** Écrit une ligne du journal. */
export function journal(evenement: string, champs: Champs = {}, niveau: Niveau = "info"): void {
  SORTIES[niveau](ligneDuJournal(evenement, { niveau, ...champs }));
}

/** Écrit une erreur au journal : son nom et son code (champsDErreur), jamais son message ; `champs` : ce qui situe l’erreur. */
export function journalErreur(evenement: string, e: unknown, champs: Champs = {}): void {
  journal(evenement, { ...champs, ...champsDErreur(e) }, "erreur");
}

/**
 * Un travail qui ne doit jamais faire échouer ce qui l’appelle (le battement de cœur d’une tâche, une alerte, le suivi
 * des coûts) : son échec laisse une ligne au journal, au lieu de disparaître dans un `.catch(() => {})`. La promesse
 * rendue ne rejette jamais : on peut l’attendre, ou la laisser filer (`void`).
 */
export async function auMieux(travail: Promise<unknown> | (() => Promise<unknown>), evenement: string, champs: Champs = {}): Promise<void> {
  try {
    await (typeof travail === "function" ? travail() : travail);
  } catch (e) {
    journalErreur(evenement, e, champs);
  }
}
