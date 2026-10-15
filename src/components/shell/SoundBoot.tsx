"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { bootSound, sonsDeLaPage } from "@/lib/sound";

/**
 * Les sons de BLUSH (src/lib/sound.ts) : chaque toucher garde le son éveillé, Safari refusant tout son avant le premier.
 * À chaque page, le son se prépare au repos, ou pas du tout sur une page qui n’en joue pas (la landing, un verdict partagé).
 */
export function SoundBoot() {
  const chemin = usePathname();
  useEffect(() => bootSound(), []);
  /* L’adresse du navigateur plutôt que `chemin` : une page réécrite (la landing de qui revient, servie par /retour) garde la sienne */
  useEffect(() => sonsDeLaPage(window.location.pathname), [chemin]);
  return null;
}
