import { MIN_MESSAGES, MIN_MESSAGES_CAPTURES } from "@prompts/lib/conv";
import type { Story } from "@/types";

/*
 * Une conv en plusieurs morceaux, côté écrans (le serveur : src/server/morceaux.ts) : sa lecture ne part qu’assez
 * longue. La même règle que le serveur (minimumDe, src/server/histoires.ts), lue dans ses sources : moins de messages
 * suffisent dès qu’un morceau est fait de captures, qui en montrent moins.
 */

/** Le minimum de messages de la conv pour sa lecture. */
export const minimumDeMessages = (story: Pick<Story, "sources">) => (story.sources.some((s) => s.mode === "captures") ? MIN_MESSAGES_CAPTURES : MIN_MESSAGES);

/** La conv est encore trop courte : elle attend un morceau de plus avant « Qui es-tu ? ». */
export const tropCourte = (story: Pick<Story, "sources" | "totalMessages">) => story.totalMessages < minimumDeMessages(story);

/** Les applis de la conv : un morceau par source, mais deux exports WhatsApp ne font qu’une appli. */
export const nombreDApplis = (story: Pick<Story, "sources">) => new Set(story.sources.map((s) => s.app)).size;
