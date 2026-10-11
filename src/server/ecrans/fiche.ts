import { estLigneProfil, lireLigne } from "@prompts/lib/ligne";
import type { Memoire } from "@prompts/lib/schemas";
import type { FicheFact } from "@/types";

/* Sa fiche, telle que la montre son écran (src/server/ecrans/messages.ts). */

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Les infos de sa fiche, chacune avec sa source (« votre conv · 12 sept. », ou « d’après toi »). */
export function faitsAffiches(etat: Pick<Memoire, "fiche">, lignes: Map<string, string>): FicheFact[] {
  const source = (ids: string[]) => {
    const brute = ids.map((id) => lignes.get(id)).find(Boolean);
    const l = brute ? lireLigne(brute) : null;
    return l ? `${l.profil ? "son profil" : "votre conv"} · ${+l.jour.slice(8, 10)} ${MOIS[+l.jour.slice(5, 7) - 1]}` : "d’après toi";
  };
  const genre = (ids: string[]) => (!ids.length ? "note" : ids.some((id) => estLigneProfil(lignes.get(id) ?? "")) ? "capture" : "conv");
  return (etat.fiche?.faits ?? []).map((f, k) => ({ id: `f${k}`, section: f.section, text: f.texte, sourceLabel: source(f.preuves), sources: [genre(f.preuves)] }));
}
