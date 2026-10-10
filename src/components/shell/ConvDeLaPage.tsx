import "server-only";
import { contexteRequete } from "@/server/donnees";
import { PoseConv } from "./PoseConv";

/**
 * La conv que montre cette page : ses appels au serveur la désignent (src/services/session.ts, ENTETE_CONV), pour
 * qu’un geste vise la conv à l’écran même si un autre onglet en a ouvert une autre. À poser en tête des pages d’une conv.
 */
export async function ConvDeLaPage() {
  const { story } = await contexteRequete();
  return <PoseConv id={story?.id ?? null} />;
}
