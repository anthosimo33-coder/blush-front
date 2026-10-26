import { isDeepStrictEqual } from "node:util";
import { noterAlerteDuChat, type AlerteVue } from "@prompts/lib/memoire";
import type { DonneesMemoire } from "./stockage/types";

/*
 * Une mise à jour de la mémoire se fait sur la mémoire qu’elle a lue, et ne s’écrit que si personne n’y a écrit
 * entre-temps (modifierMemoire, src/server/depot.ts). Depuis le 25 octobre 2026, le chat y note l’alerte d’une réponse
 * tout de suite (noterLAlerte, src/server/chat.ts) : une réponse en alerte arrivée pendant qu’une mise à jour s’écrit
 * (20 à 60 s en direct, des minutes en lot) la faisait rappeler le modèle en entier, pour une ligne d’alerte. Or une alerte
 * notée par le chat n’est tranchée que par la mise à jour qui relit son échange (aTrancher, prompts/lib/memoire.ts) : celle
 * qui tourne ne l’a pas. Sa sortie s’applique donc encore, les alertes notées rejouées par-dessus : le résultat est celui
 * que la mémoire aurait eu si le chat les avait notées juste après elle, un ordre qui arrive déjà. Ce que lit le modèle ne
 * change pas : seul le second appel disparaît. Toute autre écriture (une fiche corrigée, une autre mise à jour, la vraie
 * mémoire à la place de celle de secours) la fait refaire, comme avant. Sans base ni modèle : tests/unit/memoire-relue.test.ts.
 */

/** Une alerte que le chat a notée dans la mémoire : laquelle, et la réponse qui l’a levée (chat_messages.id). */
type AlerteNotee = { alerte: AlerteVue["alerte"]; reponse: number };

/** La mémoire sans ses alertes : ce qu’une mise à jour a lu, et que rien d’autre qu’elle ne doit avoir changé. */
const sansSesAlertes = ({ etat, ...reste }: DonneesMemoire) => {
  const sansElles: Partial<DonneesMemoire["etat"]> = { ...etat };
  delete sansElles.alerte;
  delete sansElles.alerte_lue;
  delete sansElles.alertes_vues;
  return { ...reste, etat: sansElles };
};

/** Les alertes notées une à une, comme le chat les a notées. */
const rejouer = <E extends DonneesMemoire["etat"]>(etat: E, notees: readonly AlerteNotee[]): E => notees.reduce((e, n) => noterAlerteDuChat(e, n.alerte, n.reponse), etat);

/**
 * Ce qui a changé dans la mémoire relue (`relue`) depuis celle qu’une mise à jour a lue (`lue`) : rien (une liste vide),
 * seulement des alertes que le chat y a notées (les voici, dans l’ordre où les rejouer), ou autre chose (null : la mise à
 * jour est à refaire sur la relue). Seulement des alertes notées : rejouées sur la mémoire lue, elles redonnent la relue,
 * à l’identique.
 */
export function alertesNoteesDepuis(lue: DonneesMemoire, relue: DonneesMemoire): AlerteNotee[] | null {
  if (isDeepStrictEqual(lue, relue)) return [];
  if (!isDeepStrictEqual(sansSesAlertes(lue), sansSesAlertes(relue))) return null;
  const deja = new Set((lue.etat.alertes_vues ?? []).flatMap((v) => v.reponses.map((r) => `${v.alerte}:${r}`)));
  const notees = (relue.etat.alertes_vues ?? []).flatMap((v) => v.reponses.filter((r) => !deja.has(`${v.alerte}:${r}`)).map((reponse) => ({ alerte: v.alerte, reponse })));
  return notees.length && isDeepStrictEqual(rejouer(lue.etat, notees), relue.etat) ? notees : null;
}

/**
 * Ce qu’une mise à jour écrit sur la relue : `apres` (ce qu’elle a fait de la mémoire lue ; null, elle n’y changeait rien),
 * avec les alertes notées depuis rejouées par-dessus. Null : rien à écrire, la relue est déjà la bonne (la mémoire lue,
 * et ses alertes). Les messages gardés ne bougent pas : une alerte n’en cite aucun (lignesGardees).
 */
export function surLaRelue(apres: DonneesMemoire | null, notees: readonly AlerteNotee[]): DonneesMemoire | null {
  if (!apres) return null;
  return notees.length ? { ...apres, etat: rejouer(apres.etat, notees) } : apres;
}
