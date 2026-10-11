import type { EditionsFiche, MemoireFaite } from "@prompts/lib/memoire";
import type { Rapport, Verdict } from "@prompts/lib/schemas";
import type { Chapter, ScoreRow, SoberReport, VocalLigne } from "@/types";

/*
 * Ce que la chaîne garde en base, chiffré : les formes que la chaîne (analyse.ts) écrit et que les écrans (donnees.ts),
 * le chat et les routes relisent. Le coffre (src/server/coffre.ts) les range par colonne, les chiffre, et relit celles
 * qui ont changé. Rien ici ne touche à la base ni au modèle : des types, et la borne de ce qu’une mémoire envoie au
 * modèle.
 */

/** Le verdict (prompt 04), et les lignes de scores calculées par le code. */
export type DonneesVerdict = { sortie: Verdict; scores: ScoreRow[] };

/** Le rapport (prompt 05), tel que le front l’affiche : ses chapitres, sa partie sobre, son temps de lecture. */
export type DonneesRapport = { sortie: Rapport; chapitres: Chapter[]; sobre: SoberReport | null; lecture: { free: string; full: string } };

/**
 * La mémoire, sa banque de messages (les lignes citées), le prochain identifiant libre pour les messages ajoutés,
 * et ce que l’utilisateur a corrigé lui-même dans sa fiche. Une mémoire gardée est faite (sa mémoire et sa fiche) : la
 * création refuse une sortie sans elles, une mise à jour appliquée en rend une, et le coffre le vérifie à la lecture.
 */
export type DonneesMemoire = { etat: MemoireFaite; lignes: [string, string][]; suivant: number; editions?: EditionsFiche };

/**
 * Ce qu’on garde de la conv une fois effacée. `dernier` : l’heure du dernier message lu (celle de l’export, sans
 * fuseau), d’où repartent les messages ajoutés ensuite. `trouvailles` : ce que la lecture montre (ecrans/trouvailles.ts).
 */
export type Contexte = { chiffres: string; style: string; fin: string; dernier: number; trouvailles: string[] };

/** Le script du vocal du rapport, minuté d’après l’audio. `version` : celle du script (VERSION_VOCAL, src/server/vocal.ts). */
export type DonneesVocal = { sobre: boolean; lignes: VocalLigne[]; version: number };

/** Les infos qu’il a retirées de sa fiche que la mémoire garde : les plus récentes (PUT /api/fiche coupe la liste). */
export const SUPPRIMEES_MAX = 100;

/**
 * Ses corrections de la fiche, telles que le modèle les reçoit : une mémoire écrite avant la borne peut garder une
 * liste plus longue, qui renchérirait chaque message du chat et chaque mise à jour.
 */
export const editionsBornees = (e?: EditionsFiche): EditionsFiche | undefined =>
  e && e.supprimees.length > SUPPRIMEES_MAX ? { ...e, supprimees: e.supprimees.slice(-SUPPRIMEES_MAX) } : e;
