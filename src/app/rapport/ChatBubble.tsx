"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { BubbleLogo } from "@/components/brand/objects3d";
import { cn } from "@/lib/cn";

/* Le chat a-t-il déjà été ouvert une fois sur cet appareil ? Retenu dans le navigateur (une simple commodité) */
const CLE = "blush.chat.ouvert.v1";
const abonnes = new Set<() => void>();
const lire = () => {
  try {
    return localStorage.getItem(CLE) === "1";
  } catch {
    return true;
  }
};

/** À l’ouverture du chat (la bulle, ou l’accueil lui-même) : la bulle arrête de s’agiter. */
export function marquerChatOuvert() {
  try {
    localStorage.setItem(CLE, "1");
  } catch {
    /* Stockage refusé (navigation privée) : la bulle s’agitera encore, sans gravité */
  }
  abonnes.forEach((f) => f());
}

function useChatOuvert() {
  return useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    lire,
    /* Côté serveur : calme, la bulle ne s’agite qu’une fois le navigateur lu */
    () => true,
  );
}

/**
 * Le chat, toujours à portée depuis le rapport : la bulle de BLUSH en bas à droite, qui mène à l’accueil (la conv).
 * Tant qu’on ne l’a jamais ouverte, elle s’agite doucement, porte une pastille rose, et dit son nom sur grand écran.
 * `raised` : une autre pastille occupe le bas de l’écran (reprendre la lecture) ; sur mobile, la bulle passe au-dessus.
 */
export function ChatBubble({ raised = false }: { raised?: boolean }) {
  const ouvert = useChatOuvert();
  return (
    <Link
      href="/app?depuis=rapport"
      onClick={marquerChatOuvert}
      aria-label="Parler à BLUSH"
      className={cn(
        "group fixed right-4 z-40 flex items-center gap-2.5 no-underline lg:bottom-8 lg:right-8",
        raised ? "bottom-[calc(max(20px,env(safe-area-inset-bottom))+72px)]" : "bottom-[max(20px,env(safe-area-inset-bottom))]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "hidden rounded-full bg-ink px-3.5 py-2 text-[14px] font-black text-white shadow-[0_12px_28px_-12px_rgba(17,17,20,0.55)] transition-opacity duration-200 lg:block",
          ouvert && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        Parle à BLUSH
      </span>
      <span
        data-nudge={ouvert ? undefined : ""}
        className="relative flex size-[64px] items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_rgba(17,17,20,0.05),0_16px_34px_-14px_rgba(17,17,20,0.45)] transition-transform duration-200 group-hover:scale-105 group-active:scale-95"
      >
        <BubbleLogo size={40} animated />
        {!ouvert && <span aria-hidden="true" className="absolute right-1 top-1 size-3.5 rounded-full border-[2.5px] border-white bg-elle" />}
      </span>
    </Link>
  );
}
