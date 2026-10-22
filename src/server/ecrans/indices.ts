import type { Message } from "@prompts/lib/conv";
import type { IndiceDuPaywall, MomentDuPaywall, TendanceDuPaywall } from "@/types";

/*
 * Les indices et les moments cachés du paywall (une proposition du 22 octobre 2026) : ce que le code trouve dans leurs
 * messages, sans le modèle (le paywall passe avant toute lecture), pour que la question qu’on est venu poser ait déjà
 * des éléments, et qu’il reste quelque chose de caché à découvrir.
 * Les indices : des mots qu’ils s’écrivent, comptés de chaque côté, en messages qui les contiennent (« tu me manques » :
 * lui 3 fois, toi jamais), seulement quand l’écart est net. Les moments : de vrais messages de leur conv, que le paywall
 * montre floutés (le tien qu’il a mis le plus de temps à te répondre, son plus long, le sien du jour où ça a changé).
 * TODO(produit): avant la mise en ligne, les montrer en clair dans le rapport payé : ce qui est flouté doit s’y débloquer.
 */

const H = 3600e3;
const JOUR = 24 * H;

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

/** Un message écrit (pas un média seul), assez long pour dire quelque chose. */
const ecrit = (m: Message) => !m.media && m.texte.trim().split(/\s+/).length >= 3;
const mots = (m: Message) => m.texte.trim().split(/\s+/).length;
/** Le jour d’un message (AAAA-MM-JJ) : ses heures sont « naïves », en millisecondes UTC. */
const jourDe = (m: Message) => new Date(m.t).toISOString().slice(0, 10);
/** Le texte d’un moment : 160 caractères au plus, coupé à un mot. */
function extrait(texte: string): string {
  const t = texte.trim().replace(/\s+/g, " ");
  if (t.length <= 160) return t;
  return `${t.slice(0, 160).replace(/\s+\S*$/, "")}…`;
}

/** Les seuils des moments : une attente qui compte (2 h à 7 jours : au-delà, c’est une autre conversation), un message long. */
const SEUILS_MOMENTS = { attenteMin: 2 * H, attenteMax: 7 * JOUR, motsLong: 25 } as const;

/** Les moments cachés de la conv, trois au plus : le jour où ça a changé, la plus longue attente, son plus long message. */
export function moments(messages: Message[], tendance: TendanceDuPaywall | null): MomentDuPaywall[] {
  const S = SEUILS_MOMENTS;
  const liste: MomentDuPaywall[] = [];
  const pris = new Set<string>();
  const ajouter = (m: Message | undefined, moment: Omit<MomentDuPaywall, "texte" | "jour" | "de">) => {
    if (!m || pris.has(m.id)) return;
    pris.add(m.id);
    liste.push({ ...moment, de: m.role === "toi" ? "toi" : "elle", texte: extrait(m.texte), jour: jourDe(m) });
  };

  /* Le jour où ses messages ont chuté : son premier message écrit, ce jour-là ou après */
  if (tendance) {
    const depuis = Date.parse(`${tendance.depuis}T00:00:00Z`);
    ajouter(
      messages.find((m) => m.role === "autre" && m.t >= depuis && ecrit(m)),
      { id: "bascule" },
    );
  }

  /* Le tien qu’il a mis le plus de temps à te répondre : ton dernier message avant sa réponse, aux heures sûres */
  let attente: { m: Message; ms: number } | null = null;
  for (let i = 1; i < messages.length; i++) {
    const avant = messages[i - 1]!;
    const reponse = messages[i]!;
    if (avant.role !== "toi" || reponse.role !== "autre" || avant.approx || reponse.approx || !ecrit(avant)) continue;
    const ms = reponse.t - avant.t;
    if (ms >= S.attenteMin && ms <= S.attenteMax && (!attente || ms > attente.ms)) attente = { m: avant, ms };
  }
  if (attente) ajouter(attente.m, { id: "attente", valeur: attente.ms });

  /* Son message le plus long, 25 mots au moins */
  let long: Message | undefined;
  for (const m of messages) if (m.role === "autre" && ecrit(m) && mots(m) >= S.motsLong && (!long || mots(m) > mots(long))) long = m;
  if (long) ajouter(long, { id: "long", valeur: mots(long) });

  return liste;
}
