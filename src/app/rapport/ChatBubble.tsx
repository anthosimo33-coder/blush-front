"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useEnVue } from "@/lib/hooks";
import { ID_PARLER_A_BLUSH } from "./ancres";

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
 * `sobre` : le rapport en mode sobre (encre et papier, pas de 3D) : une bulle à l’encre, calme, son nom toujours affiché.
 */
export function ChatBubble({ raised = false, sobre = false }: { raised?: boolean; sobre?: boolean }) {
  const vu = useChatOuvert();
  /* En mode sobre, rien ne s’agite */
  const ouvert = vu || sobre;
  /* Le bouton « Parler à BLUSH » du bas du rapport est à l’écran : la bulle s’efface pour ne pas passer dessus */
  const cachee = useEnVue(ID_PARLER_A_BLUSH);
  return (
    <Link
      href="/app?depuis=rapport"
      /* L’accueil se pose lui-même en bas de la conv : Next ne doit pas le remettre en haut */
      scroll={false}
      /* Préchargé en entier : l’accueil n’a pas d’écran de chargement (il casserait le glissé vers la fiche). Gardé 5 min, il relit son historique en s’ouvrant, sauf rendu de moins de 10 s sans écriture du chat depuis (accueil/conv/useChargerAnciens.ts) */
      prefetch
      onClick={marquerChatOuvert}
      aria-label="Parler à BLUSH"
      aria-hidden={cachee || undefined}
      tabIndex={cachee ? -1 : undefined}
      className={cn(
        "group fixed right-4 z-40 flex items-center gap-2.5 no-underline transition-[opacity,translate] duration-300 lg:bottom-8 lg:right-8",
        cachee && "pointer-events-none translate-y-3 opacity-0",
        raised ? "bottom-[calc(max(20px,env(safe-area-inset-bottom))+72px)]" : "bottom-[max(20px,env(safe-area-inset-bottom))]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "hidden rounded-full bg-ink px-3.5 py-2 text-[14px] font-black text-white shadow-[0_12px_28px_-12px_rgba(17,17,20,0.55)] transition-opacity duration-200 lg:block",
          vu && !sobre && "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {sobre ? "Parler à BLUSH" : "Parle à BLUSH"}
      </span>
      <span
        data-nudge={ouvert ? undefined : ""}
        className={cn(
          "relative flex size-[64px] items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-105 group-active:scale-95",
          sobre ? "bg-ink shadow-[0_14px_30px_-14px_rgba(17,17,20,0.6)]" : "bg-white shadow-[0_0_0_1px_rgba(17,17,20,0.05),0_16px_34px_-14px_rgba(17,17,20,0.45)]",
        )}
      >
        {/* Une fois le chat ouvert, la bulle se calme : ses perles ne tournent plus en fond pendant toute la lecture */}
        {sobre ? <Icon name="imessage" size={26} color="#FFFFFF" stroke={2.2} /> : <BubbleLogo size={40} animated={!ouvert} />}
        {!ouvert && <span aria-hidden="true" className="absolute right-1 top-1 size-3.5 rounded-full border-[2.5px] border-white bg-elle" />}
      </span>
    </Link>
  );
}
