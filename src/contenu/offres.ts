import type { Offer, Plan, Subscription } from "@/types";

/* Les offres, le paywall et les abonnements : les prix et les libellés que montrent l’appli et le serveur (Mon compte, /api/debloquer). */

/** Un prix : son montant en centimes, et sa période pour un abonnement (sans : payé une fois). */
type Prix = { centimes: number; periode?: "semaine" };

/** Les prix des offres, en nombres : les libellés en découlent (prixDe), jamais l’inverse. */
const PRIX: Record<Offer["id"], Prix> = {
  blushplus: { centimes: 799, periode: "semaine" },
  rapport: { centimes: 899 },
};

/** Ce que montre un prix : le montant (« 7,99 € ») et, à part, sa période (« semaine »), ou null. */
export type PrixAffiche = { montant: string; periode: string | null };

/** « 7,99 € » : des centimes en euros, la virgule française, l’espace simple des maquettes avant €. */
const enEuros = (centimes: number) => `${Math.floor(centimes / 100)},${String(centimes % 100).padStart(2, "0")} €`;

/** Le prix d’un plan, à afficher en deux morceaux ; le plan gratuit n’a pas de montant, seulement son nom. */
export function prixDe(plan: Plan): PrixAffiche {
  if (plan === "gratuit") return { montant: "Aperçu gratuit", periode: null };
  const p = PRIX[plan];
  return { montant: enEuros(p.centimes), periode: p.periode ?? null };
}

/** Le prix en une ligne : « 7,99 € / semaine », « 8,99 € ». */
const libelle = (plan: Plan) => {
  const { montant, periode } = prixDe(plan);
  return periode ? `${montant} / ${periode}` : montant;
};

/** Les offres, chacune par son plan (Mon compte lit celle du rapport). */
export const OFFRE_PAR_PLAN: Record<Offer["id"], Offer> = {
  blushplus: {
    id: "blushplus",
    title: "BLUSH+ · le rapport et l’aide à chaque message",
    titleDesktop: "BLUSH+ · rapport et aide à chaque message",
    price: libelle("blushplus"),
    note: "Sans engagement · le rapport s’enrichit à chaque message",
    noteDesktop: "Sans engagement",
    recommended: true,
  },
  rapport: {
    id: "rapport",
    title: "Le rapport complet",
    titleDesktop: "Le rapport complet",
    price: libelle("rapport"),
    note: "Une fois · à toi pour toujours",
    noteDesktop: "Une fois · à toi pour toujours",
    recommended: false,
  },
};

/** Les offres dans l’ordre du paywall : BLUSH+ (conseillé), puis le rapport. */
export const OFFERS: Offer[] = [OFFRE_PAR_PLAN.blushplus, OFFRE_PAR_PLAN.rapport];

export const PAYWALL = {
  title: (other?: string) => (other ? `La suite parle de vous deux\u00a0: toi et ${other}.` : "La suite parle de vous deux."),
  /** Le nombre de chapitres qui restent, quand on le sait (le rapport ouvert) ; sinon, la suite, sans compter. */
  subtitle: (chapitres?: number) => (chapitres ? `${chapitres} chapitres, ton plan et les phrases pour lui parler.` : "La suite de ton rapport, ton plan et les phrases pour lui parler."),
  payments: "Apple Pay, Google Pay ou carte · paiement sécurisé",
};

export const SUBSCRIPTIONS: Record<Subscription["plan"], Subscription> = {
  blushplus: { plan: "blushplus", priceLabel: libelle("blushplus"), renewLabel: "Renouvelé lundi · sans engagement", stopLabel: "En un geste, effectif lundi", active: true, paused: false },
  rapport: { plan: "rapport", priceLabel: libelle("rapport"), renewLabel: "Payé une fois · à toi pour toujours", stopLabel: "", active: true, paused: false },
  gratuit: { plan: "gratuit", priceLabel: libelle("gratuit"), renewLabel: "Chapitre 1", stopLabel: "", active: false, paused: false },
};
