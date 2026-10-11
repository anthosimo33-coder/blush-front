"use client";

import type { ComponentProps } from "react";
import { sendToBlush } from "@/services/api";
import type { BlushAnswer } from "@/types";
import { HomeScreen } from "../../app/HomeScreen";
import type { Msg } from "../../app/accueil/conv/modele";
import type { Envoyer } from "../../app/accueil/envois";

/** Ce que l’aperçu envoie au chat local du fil déjà échangé, au plus (la route en refuse davantage : ../demander/route.ts, FIL_MAX). */
const FIL_MAX = 6;

/**
 * L’accueil de l’aperçu (hors de Vercel seulement) : l’accueil de l’appli, qui répond autrement. Une question toute
 * prête a sa réponse déjà écrite (`answers`, posée après un temps de lecture) ; une autre question part au vrai chat
 * local (`liveUrl`, /apercu/demander), avec le fil déjà échangé ; le reste (des fichiers, ou sans chat local) part
 * comme dans l’appli.
 */
export function ApercuAccueil({ answers, liveUrl, ...accueil }: Omit<ComponentProps<typeof HomeScreen>, "envoyer"> & { answers: Record<string, BlushAnswer>; liveUrl?: string }) {
  const envoyer: Envoyer = async (payload, { msgs, suivi }) => {
    const ready = payload.text ? answers[payload.text] : undefined;
    if (ready) return new Promise<BlushAnswer>((ok) => setTimeout(() => ok(ready), 1600));
    if (liveUrl && payload.text && !payload.files) return askLive(liveUrl, payload.text, historyOf(msgs));
    return sendToBlush(payload, suivi);
  };
  return <HomeScreen {...accueil} envoyer={envoyer} />;
}

/** L’aperçu en local : ta question part au vrai chat, avec le fil déjà échangé (tes messages, et ce que BLUSH a répondu). */
async function askLive(url: string, text: string, history: { from: "toi" | "blush"; text: string }[]): Promise<BlushAnswer> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, history }) });
  return (await r.json()) as BlushAnswer;
}

function historyOf(msgs: Msg[]): { from: "toi" | "blush"; text: string }[] {
  return msgs
    .flatMap((m): { from: "toi" | "blush"; text: string }[] => {
      if (m.type === "texte") return [{ from: "toi", text: m.text }];
      if (m.type === "reponse") return [{ from: "blush", text: [...m.result.bubbles.map((b) => b.text), ...(m.result.send ?? []), m.result.ask ?? ""].filter(Boolean).join(" / ") }];
      return [];
    })
    .slice(-FIL_MAX);
}
