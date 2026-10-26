/*
 * L’email canonique : la boîte où arrive un email, quelle que soit la façon de l’écrire. `Noe+1@gmail.com`,
 * `n.o.e@googlemail.com` et `noe@gmail.com` arrivent dans la même boîte : les limites anti-abus s’y rangent, pour qu’un
 * alias ne remette pas leurs compteurs à zéro : les codes de connexion, et tout ce que compte un compte (cleDuCompte). Le
 * compte, lui, garde l’email tel qu’il a été tapé. Module pur, sans server-only : tests/unit et les aides des tests de bout
 * en bout le lisent sans base.
 */

import type { LIMITES } from "./limites";

/** Les domaines de Gmail : une seule boîte pour les deux, où les points du nom ne comptent pas. */
const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/**
 * L’email canonique : en minuscules, sans le `+suffixe` du nom (la plupart des messageries l’ignorent), et pour Gmail
 * sans les points du nom, sur gmail.com. Un texte qui n’est pas un email revient seulement en minuscules.
 */
export function emailCanonique(email: string): string {
  const propre = email.trim().toLowerCase();
  const arobase = propre.lastIndexOf("@");
  if (arobase < 1 || arobase === propre.length - 1) return propre;
  const domaine = propre.slice(arobase + 1);
  /* Un nom qui commence par « + » n’a pas de suffixe à retirer : il resterait vide */
  const nom = propre.slice(0, arobase).replace(/(?<=.)\+.*$/, "");
  return GMAIL.has(domaine) ? `${nom.replaceAll(".", "") || nom}@gmail.com` : `${nom}@${domaine}`;
}

/**
 * L’email canonique en SQL, la même règle, en une expression à plat sur `colonne` (du SQL brut : un nom de colonne) :
 * sans sous-requête, rien que des fonctions immuables, pour la colonne générée users.email_canonique
 * (src/server/db/schema.ts) et emailCanoniqueEnSQL (src/server/population.ts). Les blancs autour retirés (`\s` de
 * Postgres), en minuscules ; le nom jusqu’au dernier « @ », sans son `+suffixe` à partir du deuxième caractère ; un texte
 * sans nom ou sans domaine revient en minuscules. tests/population.test.ts compare les deux à emailCanonique cas par cas.
 */
export function emailCanoniqueEnSQLBrut(colonne: string): string {
  const propre = `lower(regexp_replace(${colonne}, '^\\s+|\\s+$', '', 'g'))`;
  const nom = `substring(${propre} from '^(.*)@[^@]*$')`;
  const domaine = `substring(${propre} from '@([^@]*)$')`;
  const court = `regexp_replace(${nom}, '^(.[^+]*)\\+.*$', '\\1')`;
  return `(case when position('@' in ${propre}) = 0 or ${nom} = '' or ${domaine} = '' then ${propre}
    when ${domaine} in ('gmail.com', 'googlemail.com') then coalesce(nullif(replace(${court}, '.', ''), ''), ${court}) || '@gmail.com'
    else ${court} || '@' || ${domaine} end)`;
}

/**
 * Ce qui range les limites d’un compte (src/server/limites.ts) : son email canonique, pas son identifiant. Supprimer son
 * compte puis le recréer, ou en ouvrir un sous un alias, ne remet pas ses compteurs du jour à zéro (rate_limits survit au
 * compte). La clé d’une limite : cleDeLimiteDuCompte.
 */
export const cleDuCompte = (email: string) => `compte:${emailCanonique(email)}`;

/**
 * Les limites rangées par compte (cleDuCompte) : le nom que porte leur clé, et le plafond qu’il suit (LIMITES,
 * src/server/limites.ts). sousLaLimiteDuCompte n’en compte pas d’autre, et n’a besoin que du nom. Les tests de bout en
 * bout les remettent à zéro quand ils reprennent un email (oublierEmail). Deux noms peuvent suivre le même plafond : la
 * relance d’un verdict et celle d’un rapport se comptent à part.
 */
export const LIMITES_DU_COMPTE = {
  analyse: "analyseParCompte",
  tournage: "tournageParCompte",
  "relance:verdict": "relanceParCompte",
  relance: "relanceParCompte",
  chat: "chatParCompte",
  vocal: "vocalParCompte",
  "vocal:secondes": "secondesVocalParCompte",
  voix: "voixParCompte",
  ajout: "ajoutParCompte",
  fiche: "ficheParCompte",
  image: "imageParCompte",
  "partage-compte": "imageParCompte",
  /* Le rapport en PDF : dessiné à la demande, comme une image, sous le même plafond */
  pdf: "imageParCompte",
  ecoute: "ecouteParCompte",
  capturesParCompte: "capturesParCompte",
  lotsParCompte: "lotsParCompte",
  commande: "commandeParCompte",
  verification: "verificationParCompte",
} as const satisfies Record<string, keyof typeof LIMITES>;

/** Le nom d’une limite rangée par compte. */
export type LimiteDuCompte = keyof typeof LIMITES_DU_COMPTE;

/**
 * La clé d’une limite de ce compte, écrite ici seulement : `<nom>:<cleDuCompte>`, par exemple
 * `analyse:compte:noe@gmail.com`. Le serveur la compte (sousLaLimiteDuCompte), les tests la posent ou l’effacent.
 */
export const cleDeLimiteDuCompte = (nom: LimiteDuCompte, email: string) => cleDeLimiteDeLaCle(nom, cleDuCompte(email));

/** La même clé, d’après la clé du compte (cleDuCompte) déjà connue : le payeur d’un appel (src/server/budget.ts) en est une. */
export const cleDeLimiteDeLaCle = (nom: LimiteDuCompte, cle: string) => `${nom}:${cle}`;
