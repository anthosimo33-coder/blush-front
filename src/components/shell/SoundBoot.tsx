"use client";

import { useEffect } from "react";
import { bootSound } from "@/lib/sound";

/** Les sons de BLUSH (src/lib/sound.ts) : chaque toucher garde le son éveillé, Safari refusant tout son avant le premier. */
export function SoundBoot() {
  useEffect(() => bootSound(), []);
  return null;
}
