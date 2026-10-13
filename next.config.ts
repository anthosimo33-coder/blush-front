import type { NextConfig } from "next";
import { NOMS_DE_SESSION } from "./src/lib/noms-cookies";

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

/*
 * Le cookie de session (src/server/cookies.ts) : sa seule présence choisit la variante d’une page, sans le vérifier. Il a
 * deux noms (__Host- en https : src/lib/noms-cookies.ts) ; `has` ne sait pas dire « l’un ou l’autre », d’où une règle
 * par nom.
 */
const avecSession = (source: string, destination: string) => NOMS_DE_SESSION.map((key) => ({ source, has: [{ type: "cookie" as const, key }], destination }));

/**
 * Le fichier qui fait vérifier askblush.com chez Apple, pour Apple Pay dans nos pages (les Elements de Whop) : servi à
 * l’adresse qu’Apple lit, tel que Whop le publie (sa doc, « Enable Apple Pay and Google Pay », la réécriture pour
 * Vercel), sans en garder une copie qui vieillirait. Le domaine s’enregistre ensuite chez Whop (BACKEND.md, « Le paiement »).
 */
export const FICHIER_APPLE_PAY = {
  source: "/.well-known/apple-developer-merchantid-domain-association",
  destination: "https://whop.com/.well-known/apple-platform-integrator/apple-developer-merchantid-domain-association",
};

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
    ];
  },
  /*
   * Qui revient connecté (cookie de session) voit la landing de src/app/retour, à la même adresse : ses boutons mènent à
   * son accueil. Sans le cookie, / reste la page statique.
   * Les pages du parcours d’arrivée sont statiques aussi (servies et préchargées tout de suite) ; ce qui y dépend de la
   * session est une variante servie à la même adresse : /commencer sans la liste d’attente, /connexion qui renvoie qui est
   * connecté vers son accueil. Ce qui dépend de la bêta fermée, lue à l’exécution et non au build, est servi par
   * src/proxy.ts, avant ces réécritures.
   */
  async rewrites() {
    return {
      beforeFiles: [...avecSession("/", "/retour"), ...avecSession("/commencer", "/commencer/connecte"), ...avecSession("/connexion", "/connexion/connecte"), FICHIER_APPLE_PAY],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITE }];
  },
};

export default nextConfig;
