import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { getRetour } from "@/services/serveur";

export const metadata: Metadata = {
  title: { absolute: "BLUSH · Ta conv en dit plus que tu crois" },
  robots: { index: false },
};

/*
 * La landing pour qui revient : next.config.ts sert cette page à la place de / quand le cookie de session est là
 * (l’adresse reste /). Connecté avec une conv, les boutons mènent à son accueil ; sinon, c’est la landing de toujours.
 * La landing elle-même reste statique : les nouveaux visiteurs ne paient pas cette lecture.
 */
export default async function Page() {
  return <Landing retour={await getRetour()} />;
}
