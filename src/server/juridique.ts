import "server-only";
import { CASE_IMPORT, CASE_RENONCIATION } from "@/contenu/consentements";

/*
 * Ce que la loi demande au serveur : l’accord de l’import (que le geste du bouton donne, données sensibles du
 * RGPD article 9), vérifié par chaque route qui reçoit une conv et gardé avec elle ; la renonciation au droit de
 * rétractation, vérifiée avant de commencer un paiement et gardée avec l’achat. L’identité de l’éditeur, sans laquelle
 * la production reste fermée au public, se vérifie avec ses champs (champsEditeurManquants, editeurComplet :
 * src/contenu/mentions-legales.ts) : sans server-only, le proxy la lit aussi (src/server/drapeaux.ts).
 */

/** Un accord donné (par le geste de l’import, par la case de la renonciation) : la version de son texte, et l’heure où le serveur l’a reçu. */
export type Consentement = { version: string; le: Date };

/**
 * L’accord que porte un envoi (le champ `consentement` d’un import : la version du texte au-dessus du bouton), ou null : sans
 * lui, ou avec une version qui n’est plus celle d’aujourd’hui (un onglet ouvert avant une mise à jour). Les routes de
 * l’import répondent alors 422 `consentement`, avant toute limite et avant toute lecture.
 */
export function consentementImport(valeur: unknown, maintenant = new Date()): Consentement | null {
  return valeur === CASE_IMPORT.version ? { version: CASE_IMPORT.version, le: maintenant } : null;
}

/**
 * La renonciation au droit de rétractation que porte une commande (le champ `renonciation` de POST /api/paiement : la
 * version du texte sous le bouton), ou null : sans elle, ou avec une version qui n’est plus celle d’aujourd’hui. La route
 * répond alors 422 `renonciation`, avant toute limite et avant toute commande ; sinon, l’achat la garde (sa version et
 * son heure).
 */
export function renonciationPaiement(valeur: unknown, maintenant = new Date()): Consentement | null {
  return valeur === CASE_RENONCIATION.version ? { version: CASE_RENONCIATION.version, le: maintenant } : null;
}
