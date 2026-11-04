import { citees, type EditionsFiche, type MemoireFaite } from "@prompts/lib/memoire";
import type { Rapport, Verdict } from "@prompts/lib/schemas";
import type { GenreDuHaut } from "@/contenu/haut-du-paywall";
import type { Chapter, ScoreRow, SoberReport, VocalLigne } from "@/types";

/*
 * Ce que la chaîne garde en base, chiffré : les formes que la chaîne (analyse.ts) écrit et que les écrans (donnees.ts),
 * le chat et les routes relisent. Le coffre (src/server/coffre.ts) les range par colonne, les chiffre, et relit celles
 * qui ont changé. Rien ici ne touche à la base ni au modèle : des types, la borne de ce qu’une mémoire envoie au
 * modèle, et sa banque de messages (lignesGardees, que les essais du vrai modèle lisent aussi : scripts/essai-*.mts).
 */

/** Le verdict (prompt 04), et les lignes de scores calculées par le code. */
export type DonneesVerdict = { sortie: Verdict; scores: ScoreRow[] };

/** Le rapport (prompt 05), tel que le front l’affiche : ses chapitres, sa partie sobre, son temps de lecture. */
export type DonneesRapport = { sortie: Rapport; chapitres: Chapter[]; sobre: SoberReport | null; lecture: { free: string; full: string } };

/**
 * La mémoire, sa banque de messages (les lignes citées), le prochain identifiant libre pour les messages ajoutés,
 * et ce que l’utilisateur a corrigé lui-même dans sa fiche. Une mémoire gardée est faite (sa mémoire et sa fiche) : la
 * création refuse une sortie sans elles, une mise à jour appliquée en rend une, et le coffre le vérifie à la lecture.
 * `secours` : une mémoire de secours (src/server/secours.ts), tirée du verdict et du rapport faute de la vraie ; ses
 * mises à jour la gardent telle, et la vraie la remplace dès qu’elle se fait.
 */
export type DonneesMemoire = { etat: MemoireFaite; lignes: [string, string][]; suivant: number; editions?: EditionsFiche; secours?: true };

/**
 * Ce qu’on garde de la conv une fois effacée (contexteDuCode, src/server/analyse.ts), et ce qu’elle a déjà lu après le
 * rapport (src/server/ajouts.ts). `dernier` : le dernier message d’un export (le curseur, à l’heure de l’export, sans
 * fuseau), d’où repartent les messages d’un export ajouté ; `vuJusqua` : le dernier instant lu tout compris (des
 * captures aussi) ; `lus` : ses derniers messages lus, leur empreinte (cleSecrete : jamais leur texte, la conv brute
 * effacée) et leur heure à la minute (ecrireLus, src/server/ajouts.ts). Ces deux-là manquent à une conv lue avant le 2 novembre 2026. `trouvailles` : ce que
 * la lecture montre (ecrans/trouvailles.ts). `accroche` : le titre du haut de son paywall (src/contenu/haut-du-paywall.ts),
 * compté avec son achat dans /admin ; absent avant le 17 octobre. `sansDate` : la conv lue ne montre aucune date
 * (Rendu.sansDate) : `fin` n’est que le jour de l’import, la mémoire du chat le dit, et un export ajouté n’a pas de
 * curseur tant qu’aucun export n’est lu (curseurDe, src/server/ajouts.ts) ; `finSansDate` : elle finit par des messages
 * sans date (Rendu.finSansDate) : `fin` et `dernier` sont ceux de son dernier message daté, la mémoire du chat le dit.
 * Ces deux-là manquent à une conv lue avant la PR 5 du chantier lecture.
 */
export type Contexte = {
  chiffres: string;
  style: string;
  fin: string;
  sansDate?: true;
  finSansDate?: true;
  dernier: number;
  vuJusqua?: number;
  lus?: string;
  trouvailles: string[];
  accroche?: GenreDuHaut;
};

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

/**
 * La banque de messages d’une mémoire (DonneesMemoire.lignes) : les lignes de `lignes` qu’elle cite (citees), une fois
 * chacune, dans l’ordre de leur première citation. Un identifiant cité absent de `lignes` (inventé par le modèle) n’y
 * entre pas. La création de la mémoire et chaque mise à jour la refont (src/server/analyse.ts), les essais aussi.
 */
export const lignesGardees = (etat: Parameters<typeof citees>[0], lignes: ReadonlyMap<string, string>): [string, string][] =>
  [...new Set(citees(etat))].flatMap((id) => {
    const ligne = lignes.get(id);
    return ligne === undefined ? [] : [[id, ligne] as [string, string]];
  });
