/**
 * L’histoire ouverte : un cookie, lu par le serveur seulement (src/server/cookies.ts). C’est la conv choisie dans « Tes
 * convs » (le serveur la pose aussi quand une nouvelle conv est lue, et vérifie qu’elle est bien au compte :
 * src/server/histoires.ts).
 */
export const STORY_COOKIE = "blush-story";

/**
 * La conv que montre la page ouverte dans cet onglet (posée par src/components/shell/ConvDeLaPage.tsx). Chaque appel
 * au serveur la désigne dans cet en-tête : un geste (supprimer, écrire à BLUSH, corriger sa fiche) vise la conv à
 * l’écran, même si un autre onglet en a ouvert une autre entre-temps (le cookie, lui, est commun aux onglets).
 */
export const ENTETE_CONV = "x-blush-conv";
let convDeLaPage: string | null = null;
export const poserConvDeLaPage = (id: string | null) => {
  convDeLaPage = id;
};
export const lireConvDeLaPage = () => convDeLaPage;

export function writeStoryCookie(storyId: string) {
  if (typeof document === "undefined") return;
  /* Secure en https, comme le serveur la pose (src/server/cookies.ts) : jamais envoyée en clair */
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${STORY_COOKIE}=${encodeURIComponent(storyId)}; path=/; max-age=31536000; samesite=lax${secure}`;
}

/** L’arrivée de l’accueil ne se joue qu’une fois par jour : ce cookie la saute jusqu’à minuit (heure du téléphone). */
export const ARRIVAL_COOKIE = "blush-arrivee";

export function markArrivalPlayed() {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const seconds = Math.max(60, Math.round((midnight.getTime() - Date.now()) / 1000));
  document.cookie = `${ARRIVAL_COOKIE}=1; path=/; max-age=${seconds}; samesite=lax`;
}
