import "server-only";
import { champsDErreur, ligneDuJournal, type Champs } from "@/lib/tracer";
import { surVercel } from "./drapeaux";

/*
 * Le journal du serveur : une ligne JSON par événement, dans les logs de Vercel (la sortie de la fonction). Un nom
 * d’événement, puis des champs courts : des codes, des identifiants, des nombres. Jamais de contenu : ni la conv, ni un
 * email, ni le message d’une erreur (champsDErreur, src/lib/tracer.ts, n’en garde que le nom et le code).
 * Le code du serveur écrit par ici : la règle no-console (eslint.config.mjs) ne laisse la console qu’à ce fichier, à
 * src/lib/tracer.ts (le navigateur) et aux aperçus locaux (src/app/apercu, jamais en ligne). Pour le nom d’une erreur
 * dans un code : nomErreur (src/lib/tracer.ts). Ce qui échappe encore au journal : une erreur qu’une route /api ne
 * rattrape pas (Next l’écrit entière ; l’enveloppe `route` de src/server/http.ts n’est pas encore posée, lot 8a).
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

/**
 * En local seulement, ce que le développeur lit en clair dans le terminal du serveur, à la place d’un mail que rien
 * n’envoie (sans clé de Resend ni boîte des tests) : le code de connexion, le sujet d’un mail, une alerte à l’équipe.
 * Pas une ligne du journal : un texte libre, que les tests lisent tel quel (console.log). Jamais en ligne : sur Vercel,
 * le texte est tu et une ligne du journal le dit (env() y exige déjà RESEND_API_KEY ; ceci ne compte pas sur lui). Ne
 * s’importe que dans email.ts et alertes.ts (eslint.config.mjs).
 */
export function enLocal(texte: string): void {
  if (surVercel()) return journal("sortie locale ignorée en ligne", {}, "alerte");
  console.log(texte);
}
