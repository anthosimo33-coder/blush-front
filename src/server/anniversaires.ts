import { aujourdhuiParis } from "./temps";

/*
 * Les anniversaires notés dans une fiche (S8 des séquences, src/server/sequences.ts) : un fait de sa fiche qui parle
 * d’anniversaire (ou de naissance) et dit une date entière, jour et mois (« son anniv : le 23 mars », « née le 1er mai »,
 * « anniversaire 23/03 »). Sans date entière (« son anniv est en mars », « samedi »), rien : un rappel au mauvais jour
 * ferait pire que pas de rappel.
 */

const MOIS: [RegExp, number][] = [
  [/^janv/, 1],
  [/^f[ée]v/, 2],
  [/^mars/, 3],
  [/^avr/, 4],
  [/^mai/, 5],
  [/^juin/, 6],
  [/^juil/, 7],
  [/^ao[uû]t/, 8],
  [/^sept/, 9],
  [/^oct/, 10],
  [/^nov/, 11],
  [/^d[ée]c/, 12],
];

/** Un jour et un mois qui existent (le 29 février compris). */
const existe = (jour: number, mois: number) => mois >= 1 && mois <= 12 && jour >= 1 && jour <= new Date(Date.UTC(2024, mois, 0)).getUTCDate();

/** Le jour et le mois de l’anniversaire qu’écrit ce fait de la fiche, ou null : pas un anniversaire, ou pas de date entière. */
export function dateDAnniversaire(texte: string): { jour: number; mois: number } | null {
  const t = texte.normalize("NFC").toLowerCase();
  if (!/anniv|\bn(?:é|ée) (?:le|un)\b/.test(t)) return null;
  /* « 23 mars », « 1er mai », « 3 sept. » */
  const enLettres = /(?:^|[^\d])(\d{1,2})(?:er)?\s+([a-zéû]+)/g;
  for (const [, j, m] of t.matchAll(enLettres)) {
    const mois = MOIS.find(([re]) => re.test(m!))?.[1];
    if (mois && existe(Number(j), mois)) return { jour: Number(j), mois };
  }
  /* « 23/03 », « 23.03.2004 » */
  const enChiffres = /(?:^|[^\d])(\d{1,2})[/.](\d{1,2})(?:[/.]\d{2,4})?(?!\d)/.exec(t);
  if (enChiffres && existe(Number(enChiffres[1]), Number(enChiffres[2]))) return { jour: Number(enChiffres[1]), mois: Number(enChiffres[2]) };
  return null;
}

/**
 * Le prochain anniversaire à ce jour et ce mois, vu de Paris : dans combien de jours (0 : aujourd’hui), et comment le
 * dire (« jeudi », « jeudi 23 »). Un 29 février, les années sans lui, tombe le 1er mars.
 */
export function prochainAnniversaire({ jour, mois }: { jour: number; mois: number }, maintenant = new Date()) {
  const { iso, t } = aujourdhuiParis(maintenant);
  const annee = Number(iso.slice(0, 4));
  let date = Date.UTC(annee, mois - 1, jour);
  if (date < t) date = Date.UTC(annee + 1, mois - 1, jour);
  const d = new Date(date);
  const nomDuJour = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" }).format(d);
  return { dans: Math.round((date - t) / 86400e3), annee: d.getUTCFullYear(), jour: nomDuJour, date: `${nomDuJour} ${d.getUTCDate()}` };
}
