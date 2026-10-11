/*
 * Les noms de ce poste, pour les outils de l’équipe (/apercu, /styleguide) : le proxy (src/proxy.ts) ne les sert qu’à une
 * requête qui demande l’un d’eux. Pur (ni server-only, ni client-only) : le proxy et ses tests l’importent tels quels.
 */

/** Les noms de ce poste, et tout nom en `.localhost`, qui mène toujours à la boucle locale (Next les accepte déjà par défaut). */
const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "[::1]"]);
const estLocal = (nom: string) => HOTES_LOCAUX.has(nom) || nom.endsWith(".localhost");

/**
 * La requête demande-t-elle ce poste ? L’hôte qu’elle demande (Host, et X-Forwarded-Host s’il y en a un) doit en être un
 * nom. Cela arrête les navigateurs : une page d’un site qui fait pointer son domaine sur 127.0.0.1 (DNS rebinding)
 * demande son propre nom, et un téléphone du Wi-Fi honnête demande l’adresse du poste sur le réseau. Pas un client qui
 * écrit ses en-têtes lui-même (curl) : Host se falsifie. Les outils ne restent à ce poste que si le serveur n’écoute que
 * lui (scripts/developper.mjs : 127.0.0.1, et refus d’écouter le réseau avec BLUSH_APERCU ou BLUSH_DEMANDER).
 */
export function hoteLocal(entetes: Headers): boolean {
  const hotes = [entetes.get("host"), entetes.get("x-forwarded-host")].filter((h) => h !== null);
  if (!hotes.length) return false;
  return hotes.every((h) => {
    try {
      return estLocal(new URL(`http://${h}`).hostname);
    } catch {
      return false;
    }
  });
}
