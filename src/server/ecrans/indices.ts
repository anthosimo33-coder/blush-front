import type { Message } from "@prompts/lib/conv";
import type { IndiceDuPaywall } from "@/types";

/*
 * Les indices du paywall (une proposition du 22 octobre 2026) : des mots qu’ils s’écrivent, comptés par le code de
 * chaque côté, en messages qui les contiennent (« tu me manques » : lui 3 fois, toi jamais), seulement quand l’écart est
 * net ; sans le modèle (le paywall passe avant toute lecture), pour que la question qu’on est venu poser ait déjà des
 * éléments.
 */

/** Un mot ou une expression, entier : ni collé à une lettre ni à un chiffre ; les apostrophes droites et courbes. */
const mot = (...variantes: string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${variantes.map((v) => v.replace(/['’]/g, "['’]")).join("|")})(?![\\p{L}\\p{N}])`, "iu");

/** Les mots des indices, dans l’ordre où ils comptent (le paywall n’en montre que les premiers nets). */
const MOTS: { id: IndiceDuPaywall["id"]; motif: RegExp }[] = [
  { id: "manques", motif: mot("tu me manques?", "tu m'manques?") },
  { id: "aime", motif: mot("je t'aime", "je taime", "jtm") },
  { id: "voir", motif: mot("on se voit", "on se voie", "on se capte", "on se rejoint", "t'es dispo quand", "dispo quand") },
  { id: "coeurs", motif: /❤|♥|😍|🥰|😘|💕|💖|💗|💘/u },
  { id: "nuit", motif: mot("bonne nuit", "bonne nuiit") },
  { id: "pardon", motif: mot("désolée?s?", "desolée?s?", "dsl", "pardon") },
];

/** Un écart net : 3 messages au moins en tout, et l’un 2 fois plus que l’autre (ou l’autre jamais). */
const SEUILS_INDICES = { total: 3, fois: 2 } as const;

/** Les indices nets de la conv, deux au plus, dans l’ordre de MOTS. */
export function indices(messages: Message[], nombre = 2): IndiceDuPaywall[] {
  const nets: IndiceDuPaywall[] = [];
  for (const { id, motif } of MOTS) {
    let toi = 0;
    let elle = 0;
    for (const m of messages) {
      if (!m.texte || !motif.test(m.texte)) continue;
      if (m.role === "toi") toi++;
      else if (m.role === "autre") elle++;
    }
    const plus = Math.max(toi, elle);
    const moins = Math.min(toi, elle);
    if (toi + elle >= SEUILS_INDICES.total && (moins === 0 || plus / moins >= SEUILS_INDICES.fois)) nets.push({ id, toi, elle });
    if (nets.length === nombre) break;
  }
  return nets;
}
