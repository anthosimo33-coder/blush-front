import "server-only";
import { CASE_IMPORT } from "@/contenu/consentements";
import { CHAMPS_EDITEUR, EDITEUR } from "@/contenu/mentions-legales";

/*
 * Ce que la loi demande au serveur : l’accord de l’import (la case « J’ai 18 ans ou plus… », données sensibles du
 * RGPD article 9), vérifié par chaque route qui reçoit une conv et gardé avec elle ; et l’identité de l’éditeur, sans
 * laquelle la production ne s’ouvre pas au public (les mentions légales l’affichent).
 */

/** L’accord d’un import : la version du texte de la case cochée, et l’heure où le serveur l’a reçu. */
export type Consentement = { version: string; le: Date };

/**
 * L’accord que porte un envoi (le champ `consentement` d’un import : la version de la case cochée), ou null : sans la
 * case, ou avec une version qui n’est plus celle d’aujourd’hui (un onglet ouvert avant une mise à jour). Les routes de
 * l’import répondent alors 422 `consentement`, avant toute limite et avant toute lecture.
 */
export function consentementImport(valeur: unknown, maintenant = new Date()): Consentement | null {
  return valeur === CASE_IMPORT.version ? { version: CASE_IMPORT.version, le: maintenant } : null;
}

/** Les champs de l’identité de l’éditeur encore vides (src/contenu/mentions-legales.ts, EDITEUR), dans l’ordre de la page. */
export function champsEditeurManquants(editeur: Record<keyof typeof EDITEUR, string> = EDITEUR): (keyof typeof EDITEUR)[] {
  const cles = [...CHAMPS_EDITEUR.map((c) => c.cle), "mediateur" as const];
  return cles.filter((cle) => !editeur[cle].trim());
}

/**
 * L’identité de l’éditeur est-elle complète (les mentions légales et le médiateur de la consommation) ? Tant qu’elle
 * ne l’est pas, la production ne s’ouvre pas au public : refusEnProduction (src/server/env.ts) refuse BLUSH_BETA_FERMEE=0
 * en nommant les champs vides (champsEditeurManquants).
 */
export const editeurComplet = (editeur: Record<keyof typeof EDITEUR, string> = EDITEUR) => champsEditeurManquants(editeur).length === 0;
