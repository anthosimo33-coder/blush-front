/*
 * Qui répond dans l’accueil de l’aperçu (./ApercuAccueil.tsx), à la place du vrai chat : la prop `envoyer` de l’accueil
 * (src/app/app/accueil/envois.ts). À part de l’écran : il se teste sans lui (tests/client/envois.test.tsx).
 */
import { sendToBlush } from "@/services/api";
import type { BlushAnswer } from "@/types";
import type { Msg } from "../../app/accueil/conv/modele";
import type { Envoyer } from "../../app/accueil/envois";
import { FIL_MAX, PAS_DE_REPONSE, TEXTE_MAX } from "../demander/bornes";

/** Le temps de lecture avant une réponse toute prête, en ms. */
const LECTURE_MS = 1600;

/**
 * Qui répond dans l’aperçu : une question toute prête a sa réponse déjà écrite (`answers`, posée après un temps de
 * lecture) ; une autre question part au vrai chat local (`liveUrl`, /apercu/demander), avec le fil déjà échangé ; le
 * reste (des fichiers, ou sans chat local) part comme dans l’appli.
 */
export function repondeurDeLApercu(answers: Record<string, BlushAnswer>, liveUrl?: string): Envoyer {
  return async (payload, { msgs, suivi }) => {
    const ready = payload.text ? answers[payload.text] : undefined;
    if (ready) return new Promise<BlushAnswer>((ok) => setTimeout(() => ok(ready), LECTURE_MS));
    if (liveUrl && payload.text && !payload.files) return askLive(liveUrl, payload.text, historyOf(msgs));
    return sendToBlush(payload, suivi);
  };
}

/**
 * L’aperçu en local : ta question part au vrai chat, avec le fil déjà échangé (tes messages, et ce que BLUSH a répondu).
 * Une demande refusée (une question trop longue : 400) ou un réseau coupé : BLUSH le dit, comme la route quand le
 * lanceur échoue, et la conv reste utilisable (une erreur levée ici laisserait « BLUSH écrit » à l’écran).
 */
async function askLive(url: string, text: string, history: { from: "toi" | "blush"; text: string }[]): Promise<BlushAnswer> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, history }) });
    return r.ok ? ((await r.json()) as BlushAnswer) : PAS_DE_REPONSE;
  } catch {
    return PAS_DE_REPONSE;
  }
}

/** Le fil qui part avec la question : ses FIL_MAX derniers messages, chacun coupé à TEXTE_MAX (une longue réponse de BLUSH, ses bulles jointes). */
function historyOf(msgs: Msg[]): { from: "toi" | "blush"; text: string }[] {
  return msgs
    .flatMap((m): { from: "toi" | "blush"; text: string }[] => {
      if (m.type === "texte") return [{ from: "toi", text: m.text }];
      if (m.type === "reponse") return [{ from: "blush", text: [...m.result.bubbles.map((b) => b.text), ...(m.result.send ?? []), m.result.ask ?? ""].filter(Boolean).join(" / ") }];
      return [];
    })
    .slice(-FIL_MAX)
    .map((m) => ({ ...m, text: m.text.slice(0, TEXTE_MAX) }));
}
