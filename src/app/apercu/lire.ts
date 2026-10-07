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
    script?: { mine?: string; answer: BlushAnswer }[];
    fiche: Pick<Fiche, "person" | "summaryShort">;
  } | null;
};

/**
 * En local seulement : BLUSH_APERCU désigne un fichier (une conv) ou un dossier (une conv par fichier, `?cas=01`).
 * Renvoie null en production ou sans aperçu.
 */
export async function lireApercu(cas?: string): Promise<{ data: Apercu; cas: string | null; tous: string[] } | null> {
  const chemin = process.env.BLUSH_APERCU;
  if (process.env.NODE_ENV === "production" || !chemin) return null;
  if (!(await stat(chemin)).isDirectory()) return { data: JSON.parse(await readFile(chemin, "utf8")), cas: null, tous: [] };
  const tous = (await readdir(chemin)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  const choisi = cas && tous.includes(cas) ? cas : tous[0];
  if (!choisi) return null;
  return { data: JSON.parse(await readFile(join(chemin, `${choisi}.json`), "utf8")), cas: choisi, tous };
}

/** Tous les aperçus du dossier, pour la liste. */
export async function lireTous(): Promise<{ cas: string; data: Apercu }[]> {
  const premier = await lireApercu();
  if (!premier?.cas) return premier ? [{ cas: "", data: premier.data }] : [];
  return Promise.all(premier.tous.map(async (cas) => ({ cas, data: (await lireApercu(cas))!.data })));
}
