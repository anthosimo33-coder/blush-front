import { estLigneProfil, lireLigne } from "@prompts/lib/ligne";
import type { MemoireFaite } from "@prompts/lib/memoire";
import type { Fiche, FicheFact, Person } from "@/types";

/* Sa fiche, telle que la montre son écran (src/server/ecrans/messages.ts). */

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Les infos de sa fiche, chacune avec sa source (« votre conv · 12 sept. », ou « d’après toi »). */
export function faitsAffiches(etat: Pick<MemoireFaite, "fiche">, lignes: Map<string, string>): FicheFact[] {
  const source = (ids: string[]) => {
    const brute = ids.map((id) => lignes.get(id)).find(Boolean);
    const l = brute ? lireLigne(brute) : null;
    return l ? `${l.profil ? "son profil" : "votre conv"} · ${+l.jour.slice(8, 10)} ${MOIS[+l.jour.slice(5, 7) - 1]}` : "d’après toi";
  };
  const genre = (ids: string[]) => (!ids.length ? "note" : ids.some((id) => estLigneProfil(lignes.get(id) ?? "")) ? "capture" : "conv");
  return etat.fiche.faits.map((f, k) => ({ id: `f${k}`, section: f.section, text: f.texte, sourceLabel: source(f.preuves), sources: [genre(f.preuves)] }));
}

/** Sa fiche, remplie par la mémoire : son portrait (une majuscule au début), sa phrase, et ses infos avec leurs sources. */
export function ficheAffichee(person: Person, etat: Pick<MemoireFaite, "fiche">, lignes: Map<string, string>): Fiche {
  const { fiche } = etat;
  const portrait = fiche.portrait.replace(/^\p{Ll}/u, (l) => l.toUpperCase());
  return { person, portrait, updatedLabel: "mise à jour aujourd’hui", facts: faitsAffiches(etat, lignes), summary: fiche.phrase, summaryShort: fiche.phrase_courte };
}
