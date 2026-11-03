import type { ReponseChat } from "@prompts/lib/schemas";
import type { BlushAnswer, BulleChat, Message } from "@/types";
import { resoudre } from "./messages";

/* Les bulles du chat, telles que les montre l’accueil (src/server/ecrans/messages.ts). */

/** Ce qui fait d’une citation la même qu’une autre : le même message (son côté, sa légende, son texte), quelle que soit la preuve qui le montre. */
const cleDeCitation = (m: Message) => `${m.from}\n${m.caption ?? ""}\n${m.text}`;

/** Les citations que ces réponses de BLUSH ont montrées (sous leurs bulles écrites comme sous leur vocal : l’accueil montre les deux). */
export const citationsMontrees = (reponses: Pick<BlushAnswer, "bubbles">[]): Set<string> =>
  new Set(reponses.flatMap((r) => r.bubbles.flatMap((b) => (b.messages ?? []).map(cleDeCitation))));

/**
 * Une bulle de la lecture, avec les messages qu’elle cite, sauf ceux que `montrees` a déjà (les dernières réponses du
 * chat, et les bulles d’avant dans la même réponse) : `montrees` grandit de ce qu’elle montre. La réponse au fil et la
 * réponse gardée lisent les mêmes bulles dans le même ordre, depuis les mêmes citations : elles montrent les mêmes.
 */
export function bulleAffichee(b: ReponseChat["lecture"][number], messages: Map<string, Message>, montrees: Set<string> = new Set()): BulleChat {
  const neufs: Message[] = [];
  for (const m of resoudre(b.preuves, messages)) {
    const cle = cleDeCitation(m);
    if (montrees.has(cle)) continue;
    montrees.add(cle);
    neufs.push(m);
  }
  return { text: b.texte, messages: neufs };
}

/**
 * La réponse en bulles : la lecture, puis ce qu’il peut envoyer (et pourquoi), la question, la réaction. `montrees` : les
 * citations déjà montrées (citationsMontrees), qui ne se remontrent pas.
 */
export function bullesAffichees(
  r: Pick<ReponseChat, "lecture" | "a_envoyer" | "pourquoi" | "question" | "reaction">,
  messages: Map<string, Message>,
  montrees: ReadonlySet<string> = new Set(),
): Pick<BlushAnswer, "kind" | "bubbles" | "send" | "why" | "ask" | "react"> {
  const vues = new Set(montrees);
  return {
    kind: "bubbles",
    bubbles: r.lecture.map((b) => bulleAffichee(b, messages, vues)),
    ...(r.a_envoyer ? { send: r.a_envoyer, ...(r.pourquoi ? { why: r.pourquoi } : {}) } : {}),
    ...(r.question ? { ask: r.question } : {}),
    ...(r.reaction ? { react: r.reaction } : {}),
  };
}
