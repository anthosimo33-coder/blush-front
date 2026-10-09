import type { Metadata } from "next";
import { AttenteScreen } from "./AttenteScreen";

export const metadata: Metadata = { title: "Bêta privée" };

/** La liste d’attente de la bêta fermée. */
export default function Page() {
  return <AttenteScreen />;
}
