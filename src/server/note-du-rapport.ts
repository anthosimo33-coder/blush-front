import "server-only";
import type { NoteDuRapport, RaisonDeLaNote } from "@/types";
import { envoyerALEquipe } from "./alertes";
import { CLES_DE_LA_NOTE, compter } from "./compteurs";
import { auMieux } from "./journal";
import { sousLaLimite } from "./limites";

/*
 * La note d’un rapport écrit (src/app/rapport/NoteDuRapport.tsx, POST /api/rapport/note) : « Oui, grave » ou « Bof »,
 * puis ce qui n’allait pas, ou un avis. Rien n’est gardé avec la conv ni avec le compte : des compteurs par jour
 * (src/server/compteurs.ts, CLES_DE_LA_NOTE), que /admin lit, et l’avis part à l’équipe par mail, qui le relit avant de
 * le mettre sur le site (les témoignages, src/contenu/landing.ts). Chaque chose se compte une fois par conv : une note
 * changée après coup, ou envoyée de deux onglets, ne compte pas deux fois.
 */

/** Ce que l’écran envoie : la note, la raison d’un « Bof », ou l’avis d’un « Oui, grave ». */
export type CorpsDeLaNote = { note: NoteDuRapport } | { raison: RaisonDeLaNote } | { avis: { prenom: string; phrase: string } };

/** Une fois par conv, pour de bon (la fenêtre de la limite : un an). */
const UNE_FOIS = { max: 1, fenetreS: 365 * 86400 };

/** Note le rapport de cette conv (voir l’en-tête). Rien ne fait échouer : la note perdue ne se dit pas à l’écran. */
export async function noterLeRapport(storyId: string, corps: CorpsDeLaNote): Promise<void> {
  if ("note" in corps) {
    if (await sousLaLimite(`note:${storyId}`, UNE_FOIS)) await compter(CLES_DE_LA_NOTE[corps.note]);
    return;
  }
  if ("raison" in corps) {
    if (await sousLaLimite(`note:raison:${storyId}`, UNE_FOIS)) await compter(CLES_DE_LA_NOTE[corps.raison]);
    return;
  }
  if (!(await sousLaLimite(`note:avis:${storyId}`, UNE_FOIS))) return;
  await compter(CLES_DE_LA_NOTE.avis);
  const { prenom, phrase } = corps.avis;
  await auMieux(
    () => envoyerALEquipe("Un avis à relire", [`Prénom\u00a0: ${prenom}`, `«\u00a0${phrase}\u00a0»`, "", "Rien de sa conv. À relire avant de le mettre sur le site."]),
    "avis non envoyé",
  );
}
