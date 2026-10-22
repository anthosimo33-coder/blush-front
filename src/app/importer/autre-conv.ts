import { pasLaMemePersonne } from "@/lib/messages-erreur";
import { moiEtAutre } from "@/lib/participants";
import { lireLHistoire } from "@/services/api";

/*
 * Un morceau ajouté que le serveur refuse : il est avec quelqu’un d’autre (« autre_conv », src/server/morceaux.ts).
 * L’écran de l’export ou des captures le dit en nommant la personne de la conv, quand on sait qui c’est : « Qui es-tu ? »
 * rempli, ou un nom qui l’a désignée (story.other). Sinon, sans nom.
 */
export async function messagePasAvecElle(): Promise<string> {
  const story = await lireLHistoire().catch(() => null);
  const autre = story && (story.me ? moiEtAutre(story).autre : story.participants.find((p) => p.id === story.other));
  return pasLaMemePersonne(autre?.name ?? null);
}
