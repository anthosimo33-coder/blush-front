/*
 * Les noms des cookies httpOnly du back-end, écrits une fois et sans server-only : le serveur les pose et les lit
 * (src/server/cookies.ts), src/proxy.ts et next.config.ts regardent seulement si la session est là. En https, ils portent
 * le préfixe __Host- : le navigateur ne prend un tel cookie que Secure, pour tout le site (path /) et posé par le site
 * lui-même, sans Domain. Un sous-domaine (un CNAME oublié) ou une page en http ne peuvent donc pas en glisser un à la
 * place du nôtre, une session à eux par exemple (S-32 de l’audit de sécurité). En http (le dev, et le serveur des tests
 * de bout en bout, où le WebKit de Linux refuse un cookie Secure), les noms sans préfixe.
 */

const NOMS = {
  /** La session : le secret d’une ligne de `sessions`. */
  session: "blush-session",
  /** Le brouillon : la conv importée avant l’email. */
  brouillon: "blush-brouillon",
  /** Le navigateur qui a demandé un code de connexion : le code ne vaut que là (src/server/auth.ts). */
  code: "blush-code",
  /** Le laissez-passer du CAPTCHA : un import sans compte (src/server/captcha.ts). */
  humain: "blush-humain",
} as const;

export type CookieDuServeur = keyof typeof NOMS;

/** Le nom de ce cookie, en https (`securise`, avec le préfixe __Host-) ou en http. */
export const nomDuCookie = (cookie: CookieDuServeur, securise: boolean) => (securise ? `__Host-${NOMS[cookie]}` : NOMS[cookie]);

/** Les deux noms que peut avoir le cookie de session : sa seule présence choisit la variante d’une page. */
export const NOMS_DE_SESSION = [nomDuCookie("session", true), nomDuCookie("session", false)] as const;
