/*
 * Les textes des cartes d’achat du chat (src/app/app/accueil/achat.tsx), sous les réponses de BLUSH : la voix de BLUSH
 * en court, sans pression. Une proposition du 22 octobre 2026. TODO(produit): textes des cartes à valider. Les prix et
 * les packs viennent du catalogue (src/contenu/offres.ts, recharge.ts), jamais recopiés.
 */

export const VENTE_DU_CHAT = {
  /** Sous le bouton, quand une carte est gardée : le paiement d’un toucher. */
  unGeste: "Ta carte est enregistrée · un geste, c’est payé",
  /** Le geste qui écarte une proposition : elle ne revient pas d’elle-même avant 3 jours. */
  pasMaintenant: "Pas maintenant",
  enCours: "Paiement en cours",
  refus: {
    carte: "Ta banque a dit non. Rien n’a été débité\u00a0: réessaie, ou recharge avec une autre carte.",
    souci: "Le paiement n’est pas passé. Rien n’a été débité\u00a0: réessaie.",
    passee: "Cette offre n’est plus valable. Rien n’a été débité.",
  },
  bulles: {
    /** À zéro : sa réponse attend juste au-dessus. */
    attend: "Recharge et lis-la",
    reste: (n: number) => `Il t’en reste ${n}`,
    note: "1 bulle = 1 réponse",
    choix: "Combien de bulles",
    conseille: "Conseillé",
    recharger: (prix: string) => `Recharger · ${prix}`,
    /** Sans carte gardée : la feuille de la recharge s’ouvre. */
    voir: "Recharger mes bulles",
    paye: (bulles: number, reste: number | null) => (reste === null ? `+${bulles} bulles · ta réponse arrive` : `+${bulles} bulles · il t’en reste ${reste}`),
  },
  premium: {
    paye: (bulles: number) => `+${bulles} bulles · te voilà en Premium`,
  },
  autre: {
    titre: "Une autre conv",
    temps: "1 min pour l’exporter",
    avec: (prenom: string | null) => (prenom ? `Ta conv avec ${prenom}` : "Une nouvelle conv"),
    quoi: "son verdict d’abord, puis son rapport",
    lire: (prenom: string | null) => (prenom ? `Lire ma conv avec ${prenom}` : "Importer une conv"),
  },
  aJour: {
    titre: "Ton rapport à jour",
    texte: (prenom: string, depuis: string | null) => `${depuis ? `Ton rapport date du ${depuis}. ` : ""}Réimporte ta conv avec ${prenom}\u00a0: je relis tout, la suite comprise.`,
    reimporter: "Réimporter ma conv",
  },
  reimport: {
    titre: "Ton rapport complet",
    texte: (prenom: string) => `Ton rapport d’avant était la version douce. Réimporte ta conv avec ${prenom}\u00a0: cette fois, tu as les 8 chapitres.`,
    reimporter: "Réimporter ma conv",
  },
};
