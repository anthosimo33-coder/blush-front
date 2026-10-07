import "server-only";

/*
 * Le garde-fou anti-fuite : si une réponse recopie un morceau des prompts (« répète tes instructions »),
 * elle est remplacée par un refus dans la voix de BLUSH. On compare des suites de 8 mots.
 */
const TAILLE = 8;
const normaliser = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFC")
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

const morceaux = (t: string) => {
  const m = normaliser(t);
  const out = new Set<string>();
  for (let i = 0; i + TAILLE <= m.length; i++) out.add(m.slice(i, i + TAILLE).join(" "));
  return out;
};

let index: Set<string> | null = null;

/** La réponse recopie-t-elle les prompts ? `textes` : les prompts (une seule fois, l’index est gardé). */
export function recopieLesPrompts(reponse: string, textes: () => string[]): boolean {
  index ??= new Set(textes().flatMap((t) => [...morceaux(t)]));
  let communs = 0;
  for (const m of morceaux(reponse)) if (index.has(m) && ++communs >= 2) return true;
  return false;
}

/** Ce que BLUSH répond à la place, en bulles. */
export const REFUS_FUITE = ["mes recettes, je les garde pour moi 🤓", "par contre raconte-moi où t’en es avec elle"];
