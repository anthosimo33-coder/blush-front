/**
 * L’histoire ouverte : un cookie, lu par les pages côté serveur (src/services/session.server.ts) et par
 * src/services/api.ts dans le navigateur. Avec le back-end, c’est la conv choisie dans « Tes convs » (le serveur la pose
 * aussi quand une nouvelle conv est lue, et vérifie qu’elle est bien au compte : src/server/histoires.ts).
 */
export const STORY_COOKIE = "blush-story";

export function readStoryCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${STORY_COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(STORY_COOKIE.length + 1)) : undefined;
}

export function writeStoryCookie(storyId: string | null) {
  if (typeof document === "undefined") return;
  document.cookie = storyId
    ? `${STORY_COOKIE}=${encodeURIComponent(storyId)}; path=/; max-age=31536000; samesite=lax`
    : `${STORY_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** L’arrivée de l’accueil ne se joue qu’une fois par jour : ce cookie la saute jusqu’à minuit (heure du téléphone). */
export const ARRIVAL_COOKIE = "blush-arrivee";

export function markArrivalPlayed() {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const seconds = Math.max(60, Math.round((midnight.getTime() - Date.now()) / 1000));
  document.cookie = `${ARRIVAL_COOKIE}=1; path=/; max-age=${seconds}; samesite=lax`;
}
