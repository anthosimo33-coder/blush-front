import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* L’écran 14 (son message) vit désormais dans le chat de l’accueil ; l’écran 15 (relire ma réponse) a été retiré */
  async redirects() {
    return [
      { source: "/app/message/:id", destination: "/app", permanent: false },
      { source: "/app/brouillon", destination: "/app", permanent: false },
    ];
  },
};

export default nextConfig;
