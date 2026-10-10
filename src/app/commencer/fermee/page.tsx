import type { Metadata } from "next";
import { CommencerScreen } from "../CommencerScreen";

export const metadata: Metadata = { title: "Vous vous parlez où\u00a0?" };

/*
 * /commencer en bêta fermée, sans session (src/proxy.ts sert cette page à la même adresse, la bêta lue à l’exécution) :
 * on le dit dès le début, avec la liste d’attente, plutôt qu’après l’import. Statique, comme /commencer.
 */
export default function Page() {
  return <CommencerScreen fermee />;
}
