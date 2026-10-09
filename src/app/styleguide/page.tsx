import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Styleguide } from "./Styleguide";

export const metadata: Metadata = { title: "Design system" };

/** La page du design system : pour l’équipe et la galerie de revue (en local), pas sur le site en ligne. */
export default function Page() {
  if (process.env.VERCEL) notFound();
  return <Styleguide />;
}
