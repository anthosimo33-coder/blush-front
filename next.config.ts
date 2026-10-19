import type { NextConfig } from "next";

/* Les en-têtes de sécurité, sur toutes les pages et toutes les routes /api */
const SECURITE = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  /* Le micro sert aux vocaux ; rien d’autre */
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  /*
   * Une politique de contenu minimale, qui ne touche pas aux scripts de Next : la page ne s’affiche pas dans un cadre
   * d’un autre site, et ni <base>, ni <object>, ni un formulaire ne peuvent viser ailleurs.
   */
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
];

/**
 * Le fichier qui fait vérifier askblush.com chez Apple, pour Apple Pay dans nos pages (les Elements de Whop) : servi à
 * l’adresse qu’Apple lit, tel que Whop le publie (sa doc, « Enable Apple Pay and Google Pay », la réécriture pour
 * Vercel), sans en garder une copie qui vieillirait. Le domaine s’enregistre ensuite chez Whop (BACKEND.md, « Le paiement »).
 */
export const FICHIER_APPLE_PAY = {
  source: "/.well-known/apple-developer-merchantid-domain-association",
  destination: "https://whop.com/.well-known/apple-platform-integrator/apple-developer-merchantid-domain-association",
};

/*
 * Les anciennes adresses de Vercel, encore servies (un favori, un lien d’avant askblush.com) : leurs pages mènent au site.
 * Le CAPTCHA (Turnstile) et Apple Pay ne connaissent que askblush.com : ailleurs, le widget ne rend aucun jeton (erreur
 * 110200, « domaine inconnu ») et un visiteur sans compte ne peut rien importer. Les routes /api et les fichiers de Next
 * y restent servis : un cron, un webhook ou une page déjà ouverte qui les appelle n’a pas à suivre une redirection.
 * Temporaire (307) : rien ne reste en cache chez le visiteur si une de ces adresses doit resservir.
 */
export const ANCIENNES_ADRESSES = ["crush-front.vercel.app", "blush-front.vercel.app"];
/** Le site, où mènent les anciennes adresses : SITE_EN_LIGNE de src/server/env.ts (que ce fichier ne peut pas importer). */
const SITE = "https://www.askblush.com";

const nextConfig: NextConfig = {
  /* Les liens et les navigations (next/link, useRouter, redirect) ne visent qu’une route qui existe : tsc le vérifie */
  typedRoutes: true,
  async redirects() {
    return [
      /* L’écran 14 (son message) vit désormais dans le chat de l’accueil ; l’écran 15 (relire ma réponse) a été retiré */
      { source: "/app/message/:id", destination: "/app", permanent: false },
      { source: "/app/brouillon", destination: "/app", permanent: false },
      /* iMessage ne s’exporte pas (Messages sur Mac n’a pas de commande pour ça) : on filme son écran. ?app=imessage suit */
      { source: "/importer/export", has: [{ type: "query", key: "app", value: "imessage" }], destination: "/importer/captures", permanent: false },
      /* Les pages des anciennes adresses, vers le site (voir ANCIENNES_ADRESSES) ; la requête (?…) suit */
      ...ANCIENNES_ADRESSES.map((value) => ({
        source: "/:chemin((?!api/|_next/).*)",
        has: [{ type: "host" as const, value }],
        destination: `${SITE}/:chemin`,
        permanent: false,
      })),
    ];
  },
  /*
   * Aucune réécriture d’après un cookie : Next ajoute la valeur d’un `has` aux paramètres de la destination, que la page
   * relit (le secret de la session y devenait lisible par son JavaScript). Les variantes servies à la même adresse
   * (connecté, mode tournage, bêta fermée) sont choisies par src/proxy.ts ; tests/proxy.test.ts refuse ici tout `has` sur
   * un cookie.
   */
  async rewrites() {
    return {
      beforeFiles: [FICHIER_APPLE_PAY],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITE }];
  },
};

export default nextConfig;
