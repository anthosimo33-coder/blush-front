import { estLigneProfil, lireLigne } from "@prompts/lib/ligne";
import type { MemoireFaite } from "@prompts/lib/memoire";
import type { Fiche, FicheFact, Person } from "@/types";

/* Sa fiche, telle que la montre son écran (src/server/ecrans/messages.ts). */

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/**
 * Les infos de sa fiche, chacune avec sa source (« votre conv · 12 sept. », « votre conv · 2 mars 2024 » quand ce n’est
 * pas l’année du dernier message, ou « d’après toi »).
 */
export function faitsAffiches(etat: Pick<MemoireFaite, "fiche">, lignes: Map<string, string>, fin = ""): FicheFact[] {
  /* Le jour du dernier message de la conv (`fin`), ou d’une ligne plus récente ; pas d’une ligne de son profil, datée du jour où on l’a ajoutée */
  const derniere = [...lignes.values()].reduce((a, ligne) => {
    const l = lireLigne(ligne);
    return l && !l.profil && l.jour > a ? l.jour : a;
  }, fin);
  const source = (ids: string[]) => {
    const brute = ids.map((id) => lignes.get(id)).find(Boolean);
    const l = brute ? lireLigne(brute) : null;
    const annee = l && l.jour.slice(0, 4) !== derniere.slice(0, 4) ? ` ${l.jour.slice(0, 4)}` : "";
    return l ? `${l.profil ? "son profil" : "votre conv"} · ${+l.jour.slice(8, 10)} ${MOIS[+l.jour.slice(5, 7) - 1]}${annee}` : "d’après toi";
  };
  const genre = (ids: string[]) => (!ids.length ? "note" : ids.some((id) => estLigneProfil(lignes.get(id) ?? "")) ? "capture" : "conv");
  return etat.fiche.faits.map((f, k) => ({ id: `f${k}`, section: f.section, text: f.texte, sourceLabel: source(f.preuves), sources: [genre(f.preuves)] }));
}

/**
 * Sa fiche, remplie par la mémoire : son portrait (une majuscule au début), sa phrase, et ses infos avec leurs sources.
 * `quand` : le jour de sa dernière mise à jour, dit comme dans Messages (jourRelatif : « aujourd’hui », « lun. », « 12 mars »).
 * `fin` : le dernier jour de la conv (resume.fin), auquel se compare l’année des sources.
 */
export function ficheAffichee(person: Person, etat: Pick<MemoireFaite, "fiche">, lignes: Map<string, string>, quand?: string, fin?: string): Fiche {
  const { fiche } = etat;
  const portrait = fiche.portrait.replace(/^\p{Ll}/u, (l) => l.toUpperCase());
  const updatedLabel = !quand ? "mise à jour" : /^\d/.test(quand) ? `mise à jour le ${quand}` : `mise à jour ${quand}`;
  return { person, portrait, updatedLabel, facts: faitsAffiches(etat, lignes, fin), summary: fiche.phrase, summaryShort: fiche.phrase_courte };
}
