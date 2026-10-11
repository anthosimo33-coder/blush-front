"use client";

import type { ComponentProps } from "react";
import type { BlushAnswer } from "@/types";
import { HomeScreen } from "../../app/HomeScreen";
import { repondeurDeLApercu } from "./repondeur";

/** L’accueil de l’aperçu (hors de Vercel seulement) : l’accueil de l’appli, qui répond autrement (./repondeur.ts). */
export function ApercuAccueil({ answers, liveUrl, ...accueil }: Omit<ComponentProps<typeof HomeScreen>, "envoyer"> & { answers: Record<string, BlushAnswer>; liveUrl?: string }) {
  return <HomeScreen {...accueil} envoyer={repondeurDeLApercu(answers, liveUrl)} />;
}
