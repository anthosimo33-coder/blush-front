import type { Metadata } from "next";
import { CommencerScreen } from "./CommencerScreen";

export const metadata: Metadata = { title: "Vous vous parlez où ?" };

/*
 * Statique : servie tout de suite et préchargée depuis la landing. Bêta fermée : src/proxy.ts sert à la même adresse
 * /commencer/fermee, qui le dit dès le début, avec la liste d’attente. Pas à qui est déjà connecté (une autre conv) :
 * next.config.ts lui sert /commencer/connecte, d’après le cookie de session.
 */
export default function Page() {
  return <CommencerScreen />;
}
