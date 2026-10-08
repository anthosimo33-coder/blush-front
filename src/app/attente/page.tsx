import type { Metadata } from "next";
import { AttenteScreen } from "./AttenteScreen";

export const metadata: Metadata = { title: "Bêta privée" };

/** La liste d’attente de la bêta fermée. `?inscrit=1` : refusé à l’écran email, déjà inscrit d’office. */
export default async function Page({ searchParams }: PageProps<"/attente">) {
  const { inscrit } = await searchParams;
  return <AttenteScreen inscrit={inscrit === "1"} />;
}
