"use client";

import { drapeauLocal, useDrapeau } from "@/lib/stockage";

/*
 * Le chat a-t-il déjà été ouvert une fois sur cet appareil ? Retenu dans le navigateur (une simple commodité). L’accueil
 * le pose à son ouverture (src/app/app/HomeScreen.tsx), le rapport au toucher de sa bulle ou de « Parler à BLUSH », et
 * la bulle du rapport le lit (src/app/rapport/ChatBubble.tsx). Stockage refusé (navigation privée), et côté serveur :
 * calme, la bulle ne s’agite qu’une fois le navigateur lu.
 */
const CHAT_OUVERT = drapeauLocal("blush.chat.ouvert.v1", { defaut: false, indisponible: true, serveur: true });

/** À l’ouverture du chat (la bulle, ou l’accueil lui-même) : la bulle arrête de s’agiter. */
export function marquerChatOuvert() {
  CHAT_OUVERT.poser(true);
}

/** Le chat a déjà été ouvert sur cet appareil (vrai au rendu serveur et quand le stockage est refusé : la bulle reste calme). */
export function useChatOuvert() {
  return useDrapeau(CHAT_OUVERT);
}
