import type { VocalRapport } from "@/types";
import demo from "./vocal-demo.json";

type Pret = Extract<VocalRapport, { etat: "pret" }>;

/** Les vocaux de la démo (scripts/vocal-demo.mts) : Hugo & Sophie et sa version sobre, dans les deux voix de l’A/B test. */
const VOCAUX = demo as unknown as Record<"hugo-A" | "hugo-B" | "sobre-A" | "sobre-B", Pret>;

/** Le vocal de la démo : voix A ; `?voix=b` dans l’adresse fait entendre la B. */
export function vocalDemo(sobre: boolean): Pret {
  const b = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("voix") === "b";
  return VOCAUX[`${sobre ? "sobre" : "hugo"}-${b ? "B" : "A"}`];
}

type VocalChat = NonNullable<import("@/types").BlushAnswer["vocal"]>;
const CHAT = demo as unknown as Record<"chat-A" | "chat-B" | "mode-A" | "mode-B", VocalChat>;

/** Démo du chat en vocal : la réponse à son vocal (sur le dernier message de Sophie), et « je passe en vocal ». */
export function chatVocalDemo(quoi: "chat" | "mode"): VocalChat {
  const b = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("voix") === "b";
  return CHAT[`${quoi}-${b ? "B" : "A"}`];
}
