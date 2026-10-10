import type { Offer, Subscription } from "@/types";

/* Les offres, le paywall et les abonnements : les prix et les libellés que montrent l’appli et le serveur (Mon compte, /api/debloquer). */

export const OFFERS: Offer[] = [
  {
    id: "blushplus",
    title: "BLUSH+ · le rapport et l’aide à chaque message",
    titleDesktop: "BLUSH+ · rapport et aide à chaque message",
    price: "7,99 € / semaine",
    note: "Sans engagement · le rapport s’enrichit à chaque message",
    noteDesktop: "Sans engagement",
    recommended: true,
  },
  {
    id: "rapport",
    title: "Le rapport complet",
    titleDesktop: "Le rapport complet",
    price: "8,99 €",
    note: "Une fois · à toi pour toujours",
    noteDesktop: "Une fois · à toi pour toujours",
    recommended: false,
  },
];

export const PAYWALL = {
  title: (other?: string) => (other ? `La suite parle de vous deux : toi et ${other}.` : "La suite parle de vous deux."),
  /** Le nombre de chapitres qui restent, quand on le sait (le rapport ouvert) ; sinon, la suite, sans compter. */
  subtitle: (chapitres?: number) => (chapitres ? `${chapitres} chapitres, ton plan et les phrases pour lui parler.` : "La suite de ton rapport, ton plan et les phrases pour lui parler."),
  payments: "Apple Pay, Google Pay ou carte · paiement sécurisé",
};

export const SUBSCRIPTIONS: Record<Subscription["plan"], Subscription> = {
  blushplus: { plan: "blushplus", priceLabel: "7,99 € / semaine", renewLabel: "Renouvelé lundi · sans engagement", stopLabel: "En un geste, effectif lundi", active: true, paused: false },
  rapport: { plan: "rapport", priceLabel: "8,99 €", renewLabel: "Payé une fois · à toi pour toujours", stopLabel: "", active: true, paused: false },
  gratuit: { plan: "gratuit", priceLabel: "Aperçu gratuit", renewLabel: "Chapitres 1 et 2", stopLabel: "", active: false, paused: false },
};
