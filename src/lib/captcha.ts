/*
 * Le CAPTCHA (Cloudflare Turnstile), ce que le navigateur et le serveur en partagent : l’en-tête qui porte le jeton, les
 * actions (ce que le widget protège, vérifié par le serveur) et les clés de test officielles de Cloudflare. Sans
 * server-only : le navigateur l’importe aussi. Le widget : src/components/ui/Captcha.tsx ; la vérification :
 * src/server/captcha.ts.
 */

/** Le script de Cloudflare, rendu à la main (explicit) : il ne dessine que les widgets qu’on lui demande (src/services/captcha.ts). */
export const SCRIPT_TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** L’en-tête où le navigateur envoie le jeton du widget : à la demande de code, et à l’échange contre un laissez-passer (/api/captcha). */
export const ENTETE_CAPTCHA = "x-blush-captcha";

/**
 * Ce qu’un jeton protège, écrit dans le widget (`action`) et revérifié par le serveur : un jeton tiré pour la demande de
 * code ne sert pas à un import, et l’inverse.
 */
export const ACTIONS_CAPTCHA = { code: "code", import: "import" } as const;
export type ActionCaptcha = keyof typeof ACTIONS_CAPTCHA;

/**
 * Les clés de test publiées par Cloudflare : en local et dans les tests de bout en bout, jamais en production (env()
 * les y refuse). Le serveur répond pour les secrètes sans appeler Cloudflare (src/server/captcha.ts), comme Cloudflare
 * le documente : la première passe toujours, la deuxième échoue toujours, la troisième dit le jeton déjà utilisé.
 */
export const CLES_DE_TEST_TURNSTILE = {
  /** Passe toujours (le widget visible), échoue toujours, passe toujours (invisible), demande toujours un geste. */
  publiques: ["1x00000000000000000000AA", "2x00000000000000000000AB", "1x00000000000000000000BB", "3x00000000000000000000FF"],
  secretes: ["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"],
} as const satisfies Record<string, readonly string[]>;

/** Est-ce une clé de test de Cloudflare (publique ou secrète) ? */
export const estCleDeTest = (cle: string): boolean => [...CLES_DE_TEST_TURNSTILE.publiques, ...CLES_DE_TEST_TURNSTILE.secretes].some((c) => c === cle);

/** Le jeton factice que rendent les clés publiques de test (et le faux widget des tests de bout en bout). */
export const JETON_DE_TEST = "XXXX.DUMMY.TOKEN.XXXX";
