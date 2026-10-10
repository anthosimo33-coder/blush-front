import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BlushAnswer, ReportPayload } from "@/services/api";
import type { Fiche, Story } from "@/types";

/** Ce que vers-front.mjs écrit pour une conv : le rapport, et (avec la mémoire) sa fiche et l’accueil. */
export type Apercu = {
  payload: ReportPayload;
  story: Story;
  these?: string;
  fiche: Fiche | null;
  home: {
    quick: string[];
    answers: Record<string, BlushAnswer>;
    script?: { mine?: string; answer: BlushAnswer; at?: number }[];
    fiche: Pick<Fiche, "person" | "summaryShort">;
  } | null;
};

/**
 * Hors de Vercel seulement (src/proxy.ts) : `chemin` désigne un fichier (une conv) ou un dossier (une conv par fichier,
 * `?cas=01`). C’est BLUSH_APERCU, que la page lit (cheminDesApercus) et passe ici : ce fichier ne lit rien du serveur.
 * Renvoie null sans aperçu.
 */
export async function lireApercu(chemin: string | null, cas?: string): Promise<{ data: Apercu; cas: string | null; tous: string[] } | null> {
  if (!chemin) return null;
  if (!(await stat(chemin)).isDirectory()) return { data: JSON.parse(await readFile(chemin, "utf8")), cas: null, tous: [] };
  const tous = (await readdir(chemin)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  const choisi = cas && tous.includes(cas) ? cas : tous[0];
  if (!choisi) return null;
  return { data: JSON.parse(await readFile(join(chemin, `${choisi}.json`), "utf8")), cas: choisi, tous };
}

/** Tous les aperçus du dossier, pour la liste. */
export async function lireTous(chemin: string | null): Promise<{ cas: string; data: Apercu }[]> {
  const premier = await lireApercu(chemin);
  if (!premier?.cas) return premier ? [{ cas: "", data: premier.data }] : [];
  return Promise.all(premier.tous.map(async (cas) => ({ cas, data: (await lireApercu(chemin, cas))!.data })));
}
