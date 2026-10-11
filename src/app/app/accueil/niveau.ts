"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { play } from "@/lib/sound";
import { scaleOf } from "@/contenu/niveaux";
import type { LevelId } from "@/types";
import { celebrate } from "./mouvement/fete";
import type { RegistreEntete } from "./mouvement/registre";

/**
 * 11 · Où vous en êtes : un message peut vous faire passer un cap pendant la visite. `level`, le niveau à montrer (parti
 * de celui du rapport) ; `monter(to)`, un cran de plus sur votre échelle, une seule fois par niveau : le son, puis la
 * fête (l’anneau se remplit en CSS, Sophie rebondit, des éclats partent). Vrai si le cap est passé : l’accueil le marque
 * alors dans la conv.
 */
export function useNiveauQuiMonte(initial: LevelId, entete: RegistreEntete) {
  const [level, setLevel] = useState(initial);
  const levelNow = useRef(initial);
  const [cheer, setCheer] = useState(0);

  useEffect(() => {
    if (cheer && !prefersReducedMotion()) celebrate(entete);
  }, [cheer, entete]);

  const monter = (to: LevelId) => {
    const now = scaleOf(levelNow.current);
    const next = scaleOf(to);
    if (next.temperature !== now.temperature || next.index <= now.index) return false;
    levelNow.current = to;
    setLevel(to);
    play("niveau", next.temperature);
    setCheer((c) => c + 1);
    return true;
  };

  return { level, monter };
}
