"use client";

/*
 * Ce que l’enregistrement des visites ne lit jamais (src/lib/analytique.ts, maskTextFn) : le texte des zones privées
 * (`data-prive` : le chat, le rapport, la fiche, la lecture, le haut du paywall, les avatars…), et partout ailleurs les
 * secrets de la page (les prénoms de la conv ouverte, l’email du compte : retenirSecrets) et tout email. Sans import :
 * le client de l’API (src/services/api.ts) et les écrans y retiennent leurs secrets sans rien charger de PostHog.
 */

/* Les secrets de la page : gardés le temps de la page, jamais envoyés ; ils ne servent qu’à masquer leur texte */
const secrets = new Set<string>();
let motifDesSecrets: RegExp | null = null;

/** Retient des textes à masquer partout dans l’enregistrement (un prénom, un email), jusqu’à la page quittée. */
export function retenirSecrets(textes: readonly (string | null | undefined)[]): void {
  /* Rendu sur le serveur : rien à retenir (il n’enregistre rien, et sa mémoire est partagée entre les visiteurs) */
  if (typeof window === "undefined") return;
  let neuf = false;
  for (const t of textes) {
    const s = t?.trim();
    if (s && s.length >= 2 && !secrets.has(s)) {
      secrets.add(s);
      neuf = true;
    }
  }
  if (!neuf) return;
  const echappes = [...secrets].sort((a, b) => b.length - a.length).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  /* Un prénom entier, pas un bout de mot (« Léa » ne masque pas « Léandre ») */
  motifDesSecrets = new RegExp(`(?<![\\p{L}\\p{N}])(?:${echappes.join("|")})(?![\\p{L}\\p{N}])`, "giu");
}

/** Un email, où qu’il soit dans un texte. */
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu;
/** Les zones dont tout le texte est masqué : marquées par l’écran (`data-prive`, ou la classe de PostHog), et le titre de la page. */
const ZONES_PRIVEES = "[data-prive], .ph-mask, title";
/** Ce qui se lit même dans une zone privée : un message d’erreur (Alert, src/components/ui/feedback.tsx), ses secrets masqués. */
const ZONES_PUBLIQUES = "[data-public]";
const etoiles = (t: string) => t.replace(/\S/g, "*");

/**
 * Le texte d’un élément, tel qu’il part dans l’enregistrement (maskTextFn, appelé pour chaque texte) : masqué en entier
 * dans une zone privée (sauf une zone publique posée dedans : une erreur) ; ailleurs, lisible, sauf les emails et les
 * secrets de la page (retenirSecrets).
 */
export function masquerTexte(texte: string, element?: Element | null): string {
  const prive = element?.closest?.(ZONES_PRIVEES);
  const publique = element?.closest?.(ZONES_PUBLIQUES);
  if (prive && !(publique && prive.contains(publique))) return etoiles(texte);
  let sur = texte.replace(EMAIL, etoiles);
  if (motifDesSecrets) sur = sur.replace(motifDesSecrets, etoiles);
  return sur;
}
