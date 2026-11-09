import { jourDeParis, plageDAvant, type Plage } from "@/lib/jours";
import type { Periode } from "@/server/stats";

/*
 * Les dates d’une période du pilotage, écrites en toutes lettres : ce que couvrent
 * les chiffres, et la période d’avant, de même durée, contre laquelle se lit chaque écart. Une période choisie au
 * calendrier couvre des jours de Paris entiers (« du mer. 7 au mar. 13 octobre ») ; les trois d’office glissent jusqu’à
 * maintenant (« du mar. 6 oct. à 16:05 jusqu’à maintenant »), et leur heure se dit. Pure (tests/unit/admin-dates.test.ts).
 */

const PARIS = "Europe/Paris";
const HEURE_MS = 3600e3;

/** Un jour (AAAA-MM-JJ) en lettres : « mer. 7 », « jeu. 1er », avec son mois (« mer. 7 oct. », « mer. 7 octobre ») s’il le faut. */
const jour = (iso: string, { mois = false, long = false }: { mois?: boolean; long?: boolean } = {}) =>
  new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", ...(mois ? { month: long ? "long" : "short" } : {}), timeZone: "UTC" })
    .replace(/(?<=\s)1(?=\s|$)/, "1er");

/** « mer. 7 au mar. 13 octobre » : le mois du premier jour ne s’écrit que s’il n’est pas celui du dernier. */
const duAu = ({ du, au }: Plage, long: boolean) => `${jour(du, { mois: du.slice(0, 7) !== au.slice(0, 7), long })} au ${jour(au, { mois: true, long })}`;

/** Ce que l’adresse dit de la période (« p=7 », « du=…&au=… ») : gardé d’une rubrique à l’autre. */
const periodeDeLAdresse = (s: { jours: Periode; plage?: Plage }) => (s.plage ? `du=${s.plage.du}&au=${s.plage.au}` : `p=${s.jours}`);

/** La période à garder dans l’adresse d’une rubrique à l’autre : rien pour les 7 jours d’office (/admin reste /admin). */
export const periodeGardee = (s: { jours: Periode; plage?: Plage }) => (!s.plage && s.jours === 7 ? "" : periodeDeLAdresse(s));

/** Les dates de la période calculée à `le` : son texte, et celui de la période d’avant (après « comparé »). */
export function datesDeLaPeriode({ le, jours, plage }: { le: string; jours: Periode; plage?: Plage }): { periode: string; avant: string } {
  const maintenant = new Date(le);
  if (plage) {
    const enCours = plage.au === jourDeParis(maintenant) ? ", aujourd’hui en cours" : "";
    if (plage.du === plage.au)
      return { periode: `Le ${jour(plage.du, { mois: true, long: true })}${enCours}`, avant: `à la veille, ${jour(plageDAvant(plage).du, { mois: true })}` };
    return { periode: `Du ${duAu(plage, true)}${enCours}`, avant: `à la période du ${duAu(plageDAvant(plage), false)}` };
  }
  const heure = maintenant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: PARIS });
  if (jours === 1) return { periode: `Depuis hier ${heure}`, avant: "aux 24\u00a0h d’avant" };
  /* Une fenêtre qui glisse : elle commence il y a `jours` fois 24 h, à la même heure, et celle d’avant autant plus tôt */
  const debut = (fois: number) => jour(jourDeParis(new Date(maintenant.getTime() - fois * jours * 24 * HEURE_MS)), { mois: true });
  return { periode: `Du ${debut(1)} à ${heure} jusqu’à maintenant`, avant: `aux ${jours} jours d’avant, depuis le ${debut(2)}` };
}
