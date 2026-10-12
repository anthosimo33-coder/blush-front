"use client";

import { useState } from "react";
import { Bubble } from "./messages";

/** Un message cité dans le rapport : au-delà de `limit` mots, on n’en montre que les `limit` premiers, et « Lire tout » le déplie. */
export function ClampedBubble({ from, caption, text, limit = 40 }: { from: "elle" | "toi"; caption?: string; text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  const words = text.split(/\s+/);
  const long = words.length > limit;
  return (
    <Bubble from={from} caption={caption}>
      {long && !open ? (
        <>
          {words.slice(0, limit).join(" ")}…{" "}
          <button type="button" aria-expanded={false} onClick={() => setOpen(true)} className="font-black underline decoration-2 underline-offset-2 opacity-80">
            Lire tout
          </button>
        </>
      ) : (
        text
      )}
    </Bubble>
  );
}
