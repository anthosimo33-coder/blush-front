/*
 * Le vocal du rapport : ce que dit BLUSH, et quand elle le dit, calé sur l’audio.
 * Le serveur minute le script une fois (d’après l’alignement que renvoie la voix) ; le front n’a plus qu’à suivre le temps.
 */
import type { VocalLigne } from "@/types";

/** Une ligne du script, telle que l’écrit le modèle (prompt 06). */
export type LigneScript = { jeu: string | null; texte: string; punch: boolean; preuve: string | null };

/** L’alignement que renvoie la voix : un temps de début et de fin (en secondes) pour chaque caractère du texte envoyé. */
export type Alignement = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };

/** Le texte envoyé à la voix : chaque ligne précédée de son jeu entre crochets. `debuts` : où commence le texte de chaque ligne. */
export function texteDit(lignes: LigneScript[]): { texte: string; debuts: number[] } {
  let texte = "";
  const debuts: number[] = [];
  lignes.forEach((l, i) => {
    if (i) texte += " ";
    const jeu = l.jeu?.replace(/[[\]]/g, "").trim();
    if (jeu) texte += `[${jeu}] `;
    debuts.push(texte.length);
    texte += l.texte.replace(/\[[^\]]*\]/g, "").trim();
  });
  return { texte, debuts };
}

const arrondi = (s: number) => Math.round(s * 100) / 100;

/**
 * Les lignes minutées : le début et la fin de chaque ligne, et le début de chaque mot (les sous-titres karaoké).
 * Si l’alignement ne correspond pas caractère pour caractère au texte envoyé, on le ramène à la même longueur.
 */
export function minuter(lignes: LigneScript[], al: Alignement): Omit<VocalLigne, "recu">[] {
  const { texte, debuts } = texteDit(lignes);
  const n = al.characters.length;
  if (!n) return [];
  const ratio = n === texte.length ? 1 : n / Math.max(1, texte.length);
  const debut = (i: number) => al.character_start_times_seconds[Math.min(n - 1, Math.floor(i * ratio))];
  const fin = (i: number) => al.character_end_times_seconds[Math.min(n - 1, Math.floor(i * ratio))];
  let avant = 0;
  return lignes.map((l, k) => {
    const propre = l.texte.replace(/\[[^\]]*\]/g, "").trim();
    const d = debuts[k];
    const mots: VocalLigne["mots"] = [];
    let ouvrant = "";
    for (const m of propre.matchAll(/\S+/g)) {
      /* La ponctuation seule ne fait pas un mot : « s’attache au mot qui suit, : ; ! ? » au mot d’avant (espace insécable) */
      if (/^[«“]$/.test(m[0])) {
        ouvrant += `${m[0]} `;
        continue;
      }
      if (/^[»”:;!?…][»”:;!?….,]*$/.test(m[0]) && mots.length) {
        mots[mots.length - 1].t += ` ${m[0]}`;
        continue;
      }
      /* Un mot ne commence jamais avant le précédent : l’alignement peut hésiter sur une ponctuation */
      avant = Math.max(avant, debut(d + m.index!));
      mots.push({ t: ouvrant + m[0], debut: arrondi(avant) });
      ouvrant = "";
    }
    return {
      texte: mots.map((m) => m.t).join(" "),
      punch: l.punch,
      debut: mots[0]?.debut ?? arrondi(debut(d)),
      fin: arrondi(Math.max(avant, fin(d + Math.max(0, propre.length - 1)))),
      mots,
    };
  });
}

/**
 * L’onde d’un vocal (`n` barres de 0,15 à 1) : là où elle parle, la barre monte, dans un silence elle retombe. La
 * densité de la parole varie peu d’une barre à l’autre : les lettres de chaque tranche lui donnent un relief stable.
 */
export function ondeDe(al: Alignement, n = 28): number[] {
  const fin = Math.max(0.1, ...al.character_end_times_seconds);
  const compte = Array.from({ length: n }, () => 0);
  const lettres = Array.from({ length: n }, () => 0);
  al.characters.forEach((c, i) => {
    if (!/\S/.test(c)) return;
    const k = Math.min(n - 1, Math.floor((al.character_start_times_seconds[i] / fin) * n));
    compte[k]++;
    lettres[k] = (lettres[k] * 31 + c.charCodeAt(0)) % 997;
  });
  const max = Math.max(1, ...compte);
  return compte.map((x, k) => (x ? Math.round((0.3 + 0.35 * (x / max) + 0.35 * (lettres[k] / 997)) * 100) / 100 : 0.15));
}

/** La ligne dite à l’instant `t` : la dernière commencée (entre deux lignes, la précédente reste affichée). */
export function ligneA(lignes: Pick<VocalLigne, "debut">[], t: number): number {
  let i = 0;
  lignes.forEach((l, k) => {
    if (t >= l.debut - 0.05) i = k;
  });
  return i;
}
