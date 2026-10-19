/*
 * La configuration publique, que le navigateur lit : les variables NEXT_PUBLIC_, que Next écrit en dur dans les pages
 * au build (il ne remplace que `process.env.NEXT_PUBLIC_…` écrit en entier). Rien de secret ici. Le serveur les relit
 * dans le schéma d’env.ts, qui vérifie qu’elles vont avec leurs clés secrètes.
 */

/** La clé publique du CAPTCHA (Cloudflare Turnstile), ou null : pas de widget, et rien à prouver (src/components/ui/Captcha.tsx). */
export const cleDuSiteCaptcha = (): string | null => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;

/**
 * La clé du projet PostHog (« phc_… », faite pour être lue par le navigateur), ou null : pas de mesure d’audience chez
 * PostHog (src/lib/analytique.ts), et son relais /ingest répond 404 (src/proxy.ts). Jamais en local ni dans les tests.
 */
export const cleDePostHog = (): string | null => process.env.NEXT_PUBLIC_POSTHOG_CLE || null;
