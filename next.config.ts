import type { NextConfig } from "next";

/* Les en-têtes de sécurité, sur toutes les pages et toutes les routes /api */
const SECURITE = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  /* Le micro sert aux vocaux ; rien d’autre */
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  /* L’écran 14 (son message) vit désormais dans le chat de l’accueil ; l’écran 15 (relire ma réponse) a été retiré */
  async redirects() {
    return [
      { source: "/app/message/:id", destination: "/app", permanent: false },
      { source: "/app/brouillon", destination: "/app", permanent: false },
    ];
  },
  /*
   * Qui revient connecté (cookie de session, src/server/cookies.ts) voit la landing de src/app/retour, à la même
   * adresse : ses boutons mènent à son accueil. Sans le cookie, / reste la page statique.
   */
  async rewrites() {
    return { beforeFiles: [{ source: "/", has: [{ type: "cookie", key: "blush-session" }], destination: "/retour" }], afterFiles: [], fallback: [] };
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITE }];
  },
};

export default nextConfig;
