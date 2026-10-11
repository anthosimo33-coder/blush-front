import type { ReponseChat } from "@prompts/lib/schemas";
import type { BlushAnswer, BulleChat, Message } from "@/types";
import { resoudre } from "./messages";

/* Les bulles du chat, telles que les montre l’accueil (src/server/ecrans/messages.ts). */

/** Une bulle de la lecture, avec les messages qu’elle cite (seule, pendant que la réponse s’écrit). */
export const bulleAffichee = (b: ReponseChat["lecture"][number], messages: Map<string, Message>): BulleChat => ({ text: b.texte, messages: resoudre(b.preuves, messages) });

/** La réponse en bulles : la lecture, puis ce qu’il peut envoyer (et pourquoi), la question, la réaction. */
export function bullesAffichees(
  r: Pick<ReponseChat, "lecture" | "a_envoyer" | "pourquoi" | "question" | "reaction">,
  messages: Map<string, Message>,
): Pick<BlushAnswer, "kind" | "bubbles" | "send" | "why" | "ask" | "react"> {
  return {
    kind: "bubbles",
    bubbles: r.lecture.map((b) => bulleAffichee(b, messages)),
    ...(r.a_envoyer ? { send: r.a_envoyer, ...(r.pourquoi ? { why: r.pourquoi } : {}) } : {}),
    ...(r.question ? { ask: r.question } : {}),
    ...(r.reaction ? { react: r.reaction } : {}),
  };
}
