import { carteDuSite } from "@/server/carte-verdict";

/* L’image d’aperçu du site (src/server/carte-verdict.tsx, carteDuSite) : la landing et les pages publiques, quand leur lien est partagé ou montré par un moteur. Un verdict partagé (/v/…) a la sienne. */
export const alt = "BLUSH · Ta conv en dit plus que tu crois";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return carteDuSite();
}
