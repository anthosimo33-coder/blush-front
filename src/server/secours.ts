import { alerteRetenue, reunirLesAlertes, type MemoireFaite } from "@prompts/lib/memoire";
import type { Rapport, Verdict } from "@prompts/lib/schemas";
import { lignesGardees, type DonneesMemoire } from "./stockage/types";

/*
 * La mémoire de secours : le chat répond toujours, même quand la vraie mémoire (prompt 07, écrite d’après la conv, le
 * verdict et le rapport) n’a pas pu se faire, ou ne s’est pas encore faite. Elle se tire, sans appel au modèle, de ce
 * qui est déjà écrit : le verdict, et le rapport s’il l’est. Sa fiche reste vide (l’écran la dit « pas encore remplie ») :
 * le verdict parle d’eux deux, pas d’elle. Des règles pures, sans la base : src/server/analyse.ts l’écrit
 * (garderUneMemoireDeSecours), la vraie mémoire la remplace dès qu’elle se fait (remplacerLeSecours), et
 * tests/unit/secours.test.ts les vérifie.
 */

/** Ce qu’elle garde au plus des moments (comme la vraie, MOMENTS_MAX de lib/memoire.ts) et des manières de chacun. */
const MOMENTS_MAX = 12;
const MANIERES_MAX = 6;

/** De quoi la tirer : le verdict, le rapport s’il est écrit, les messages de la conv qu’on peut citer, le prochain identifiant libre et le jour. */
export type SourcesDuSecours = { verdict: Verdict; rapport: Rapport | null; lignes: ReadonlyMap<string, string>; suivant: number; jour: string };

/**
 * La mémoire de secours. Où ils en sont : la thèse du rapport, le verdict court et sa tendance ; les moments et les
 * manières de chacun : ce que les chapitres du rapport datent ou attribuent à l’un ou à l’autre ; le conseil en cours :
 * le prochain pas du verdict ; leur niveau : celui du verdict. Les preuves qui ne sont pas dans `lignes` tombent. Son
 * alerte : celle du verdict ou du rapport, la règle de l’âge d’abord (alerteRetenue : un rapport en « detresse » ne cache
 * pas un verdict « mineur ») ; « où on en est » ne la dit pas, sa ligne dans <memoire> la donne au chat et à la mise à
 * jour de la mémoire (rendreMemoire, prompts/lib/memoire.ts).
 */
export function memoireDeSecours({ verdict, rapport, lignes, suivant, jour }: SourcesDuSecours): DonneesMemoire {
  const preuves = (ids: string[]) => ids.filter((id) => lignes.has(id));
  const items = (rapport?.chapitres ?? []).flatMap((c) => c.blocs.flatMap((b) => b.items ?? []));
  const moments = items
    .flatMap((i) => {
      const quoi = i.titre ?? i.texte;
      return i.quand && quoi ? [{ quand: i.quand, quoi, preuves: preuves(i.preuves) }] : [];
    })
    .slice(0, MOMENTS_MAX);
  const manieres = (cote: "toi" | "autre") => items.flatMap((i) => (i.cote === cote && i.texte ? [{ texte: i.texte, preuves: preuves(i.preuves) }] : [])).slice(0, MANIERES_MAX);
  const ouOnEnEst = [...new Set([rapport?.these, verdict.court ?? verdict.titre, verdict.tendance].flatMap((t) => (t?.trim() ? [t.trim()] : [])))].join(" ");
  const etat: MemoireFaite = {
    alerte: alerteRetenue(verdict.alerte, rapport?.alerte),
    rien_de_neuf: false,
    memoire: {
      ou_on_en_est: ouOnEnEst,
      moments,
      son_mode: manieres("autre"),
      ton_mode: manieres("toi"),
      conseils: verdict.prochain_pas ? [{ quand: jour, conseil: verdict.prochain_pas, suite: "en_attente", resultat: null }] : [],
      a_venir: [],
    },
    fiche: { portrait: "", phrase: "", phrase_courte: "", faits: [] },
    niveau: verdict.niveau ? { niveau: verdict.niveau, tendance: verdict.tendance, pourquoi: verdict.niveau_pourquoi ?? "", preuves: preuves(verdict.preuves) } : null,
    questions: null,
  };
  return { etat, lignes: lignesGardees(etat, lignes), suivant, secours: true };
}

/**
 * La vraie mémoire, à la place d’une mémoire de secours. Elle garde ce qu’il a corrigé lui-même dans sa fiche entre-temps :
 * ses corrections, les faits qu’il a ajoutés (s’ils n’y sont pas déjà), sans ceux qu’il a retirés. Et l’alerte de la
 * mémoire de secours (reunirLesAlertes, la règle de l’âge d’abord) : celle du verdict et du rapport reste lue, et celle
 * qu’une réponse du chat y a notée reste à trancher par la mise à jour suivante.
 * Ce que le chat a appris d’autre pendant le secours, lui, se perd : la vraie mémoire lit la conv entière et le rapport,
 * et le fil du chat garde les derniers échanges. Le prochain identifiant libre ne recule jamais (les messages ajoutés en
 * ont déjà pris).
 */
export function remplacerLeSecours(secours: DonneesMemoire, reelle: DonneesMemoire): DonneesMemoire {
  const suivant = Math.max(secours.suivant, reelle.suivant);
  const etat = reunirLesAlertes(reelle.etat, secours.etat);
  const editions = secours.editions;
  if (!editions) return { ...reelle, etat, suivant };
  const reels = etat.fiche.faits.filter((f) => !editions.supprimees.includes(f.texte));
  const ajoutes = secours.etat.fiche.faits.filter((f) => editions.parToi.includes(f.texte) && !reels.some((r) => r.texte === f.texte));
  return { ...reelle, etat: { ...etat, fiche: { ...etat.fiche, faits: [...reels, ...ajoutes] } }, suivant, editions };
}
