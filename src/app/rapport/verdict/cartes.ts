import { CHAPITRE_DE_LA_BASCULE, CHAPITRE_DU_VERDICT } from "@/contenu/chapitres";
import type { ReportPayload } from "@/services/api";
import type { Chapter, ChapterBlock, Confidence, Message, ScoreRow } from "@/types";

/*
 * Les cartes de la révélation du verdict, tirées du rapport. Les chiffres sont ceux de l’histoire ; le verdict et le
 * duel viennent du chapitre offert, le verdict (src/contenu/chapitres.ts) : tout le monde les voit. Le chapitre 2
 * (« Le moment où tout a basculé ») est payant : il ne sert que quand le rapport l’ouvre, débloqué et écrit. Sans
 * accès, il est fermé et vide, et rien de payant n’est montré avant le paiement.
 */

export type Card =
  | { id: "chiffres" }
  | { id: "verdict"; confidence?: { level: Confidence; text: string } }
  | { id: "duel"; rows: ScoreRow[]; meaning?: string }
  | { id: "moment"; kicker?: string; title: string; essential?: string; messages: Message[]; fact?: string }
  | { id: "jouer"; text?: string; quote?: string };

function blockOf<K extends ChapterBlock["kind"]>(c: Chapter | undefined, kind: K) {
  return c?.blocks.find((b): b is Extract<ChapterBlock, { kind: K }> => b.kind === kind);
}

/**
 * Les cartes : sans accès, les chiffres, le verdict, le duel et « Ton rapport est prêt. » ; avec le chapitre 2 ouvert,
 * en plus « le moment », et « à toi de jouer » prend son texte. Une carte sans contenu est simplement sautée.
 */
export function cardsOf({ report }: ReportPayload): Card[] {
  const [c1, c2] = [CHAPITRE_DU_VERDICT, CHAPITRE_DE_LA_BASCULE].map((n) => report.chapters.find((c) => c.number === n && !c.locked));
  const scores = blockOf(c1, "scores");
  const seen = blockOf(c2, "seen");
  const cards: Card[] = [{ id: "chiffres" }, { id: "verdict", confidence: blockOf(c1, "confidence") }];
  if (scores) cards.push({ id: "duel", rows: scores.rows, meaning: blockOf(c1, "meaning")?.text });
  if (c2 && seen?.messages?.length)
    cards.push({ id: "moment", kicker: c2.kicker, title: c2.title, essential: blockOf(c2, "essential")?.text, messages: seen.messages, fact: seen.factsAfter?.[0] });
  cards.push({ id: "jouer", text: blockOf(c2, "play")?.text, quote: seen?.messages?.find((m) => m.from === "elle")?.text });
  return cards;
}
