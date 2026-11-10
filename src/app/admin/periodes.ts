import { joursDeLaPlage, plusJours, type Plage } from "@/lib/jours";
import type { Periode } from "@/server/stats";
import { pluriel } from "./calculs";

/*
 * Les périodes du pilotage : les trois d’office (24 h, 7 jours, 30 jours, des fenêtres qui glissent jusqu’à maintenant),
 * et une période choisie au calendrier (des jours de Paris entiers). Ici, leurs noms, les raccourcis du sélecteur et le
 * calcul sur les jours (des « AAAA-MM-JJ », comptés sur le calendrier, jamais par « il y a 24 h » : src/lib/jours.ts).
 * Sans état ni navigateur : la page du serveur et le sélecteur (ChoixDeLaPeriode.tsx) s’en servent tous les deux.
 */

/** Une période : le nom de son lien, « sur … » et « vs … » (contre quoi se lit l’écart). */
export type NomsDeLaPeriode = { lien: string; sur: string; contre: string };

export const PERIODES: Record<Periode, NomsDeLaPeriode> = {
  1: { lien: "24 h", sur: "sur 24\u00a0h", contre: "vs les 24\u00a0h d’avant" },
  7: { lien: "7 jours", sur: "sur 7\u00a0jours", contre: "vs les 7\u00a0jours d’avant" },
  30: { lien: "30 jours", sur: "sur 30\u00a0jours", contre: "vs les 30\u00a0jours d’avant" },
};

const temps = (jour: string) => Date.parse(`${jour}T00:00:00Z`);

/** Le mois (AAAA-MM) `n` mois après `mois`. */
export const moisPlus = (mois: string, n: number) => {
  const [annee = 1970, m = 1] = mois.split("-").map(Number);
  return new Date(Date.UTC(annee, m - 1 + n, 1)).toISOString().slice(0, 7);
};
/** Le jour de la semaine d’un jour, lundi en tête (0) : la colonne du calendrier. */
export const colonneDe = (jour: string) => (new Date(temps(jour)).getUTCDay() + 6) % 7;
const COURT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const COMPLET = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const premier = (texte: string) => texte.replace(/^1(?=\s)/, "1er");

/** Le jour d’un mois, seul : « 20 », « 1er ». */
const quantieme = (jour: string) => (jour.endsWith("-01") ? "1er" : String(Number(jour.slice(8))));
/** « 20 oct. », « 1er août ». */
export const jourCourt = (jour: string) => premier(COURT.format(new Date(temps(jour))));
/** « mardi 20 octobre » : le nom d’un jour pour un lecteur d’écran, ou une info-bulle. */
export const jourComplet = (jour: string) => COMPLET.format(new Date(temps(jour))).replace(/(?<=\s)1(?=\s)/, "1er");
/** « Octobre 2026 ». */
export const nomDuMois = (mois: string) => {
  const nom = MOIS.format(new Date(temps(`${mois}-01`)));
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)}`;
};
/** Une période en peu de place : « 20 oct. », « 20 – 27 oct. », « 28 sept. – 4 oct. ». */
export function nomDeLaPlage({ du, au }: Plage): string {
  if (du === au) return jourCourt(du);
  if (du.slice(0, 7) === au.slice(0, 7)) return `${quantieme(du)} – ${jourCourt(au)}`;
  return `${jourCourt(du)} – ${jourCourt(au)}`;
}

/** Les noms d’une période choisie : « du 20 au 27 oct. », « vs les 8 jours d’avant ». */
function nomsDeLaPlage(plage: Plage): NomsDeLaPeriode {
  const n = joursDeLaPlage(plage);
  if (n === 1) return { lien: jourCourt(plage.du), sur: `le ${jourCourt(plage.du)}`, contre: "vs la veille" };
  const memeMois = plage.du.slice(0, 7) === plage.au.slice(0, 7);
  return {
    lien: nomDeLaPlage(plage),
    sur: `du ${memeMois ? quantieme(plage.du) : jourCourt(plage.du)} au ${jourCourt(plage.au)}`,
    contre: `vs les ${pluriel(n, "jour")} d’avant`,
  };
}

/** Les noms de la période d’un tableau de bord : celle choisie au calendrier, sinon l’une des trois d’office. */
export const nomsDeLaPeriode = (s: { jours: Periode; plage?: Plage }): NomsDeLaPeriode => (s.plage ? nomsDeLaPlage(s.plage) : PERIODES[s.jours]);

/**
 * Un raccourci du sélecteur. `p` : l’une des trois fenêtres glissantes (elle garde son adresse, `?p=`) ; sinon des jours
 * entiers (`?du=&au=`). `plage` : les jours qu’il couvre, pour le calendrier. `groupe` : sa place dans la liste.
 */
export type Raccourci = { cle: string; nom: string; groupe: 0 | 1 | 2; p?: Periode; plage: Plage };

/** Les raccourcis, d’après le jour de Paris et le premier jour qui a des chiffres. */
export function raccourcis(aujourdhui: string, premierJour: string): Raccourci[] {
  const depuis = (jour: string) => (jour < premierJour ? premierJour : jour);
  const mois = aujourdhui.slice(0, 7);
  const finDuMoisDernier = plusJours(`${mois}-01`, -1);
  const liste: (Raccourci | null)[] = [
    { cle: "24h", nom: "24 dernières heures", groupe: 0, p: 1, plage: { du: plusJours(aujourdhui, -1), au: aujourdhui } },
    { cle: "aujourdhui", nom: "Aujourd’hui", groupe: 0, plage: { du: aujourdhui, au: aujourdhui } },
    plusJours(aujourdhui, -1) >= premierJour ? { cle: "hier", nom: "Hier", groupe: 0, plage: { du: plusJours(aujourdhui, -1), au: plusJours(aujourdhui, -1) } } : null,
    { cle: "7j", nom: "7 derniers jours", groupe: 1, p: 7, plage: { du: depuis(plusJours(aujourdhui, -6)), au: aujourdhui } },
    { cle: "30j", nom: "30 derniers jours", groupe: 1, p: 30, plage: { du: depuis(plusJours(aujourdhui, -29)), au: aujourdhui } },
    { cle: "mois", nom: "Ce mois-ci", groupe: 2, plage: { du: depuis(`${mois}-01`), au: aujourdhui } },
    finDuMoisDernier >= premierJour ? { cle: "mois-dernier", nom: "Le mois dernier", groupe: 2, plage: { du: depuis(`${moisPlus(mois, -1)}-01`), au: finDuMoisDernier } } : null,
    { cle: "lancement", nom: "Depuis le lancement", groupe: 2, plage: { du: premierJour, au: aujourdhui } },
  ];
  return liste.filter((r): r is Raccourci => r !== null);
}

/** Le raccourci qui dit la période affichée, s’il y en a un : par sa fenêtre (`?p=`), ou par ses jours. */
export function raccourciDe(liste: Raccourci[], s: { jours: Periode; plage?: Plage }): Raccourci | undefined {
  const { plage } = s;
  if (!plage) return liste.find((r) => r.p === s.jours);
  return liste.find((r) => !r.p && r.plage.du === plage.du && r.plage.au === plage.au);
}
