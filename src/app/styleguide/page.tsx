import type { Metadata } from "next";
import { Styleguide } from "./Styleguide";

export const metadata: Metadata = { title: "Design system" };

/** La page du design system : pour l’équipe et la galerie de revue, jamais sur Vercel (src/proxy.ts). */
export default function Page() {
  return <Styleguide />;
}
