"use client";

import { DESKTOP } from "@/lib/motion";
import { useHydrated } from "@/state/journey";

/*
 * La conv en bas dès la première image, comme l’effet de montage la pose ensuite (useDefilement, ./defilement.ts) : la
 * page du serveur est peinte bien avant l’hydratation (plusieurs secondes sur un téléphone lent), et montrait d’abord
 * les plus vieux messages. Lu juste après la barre de saisie, ce script la pose avant même la peinture. Dans la page du
 * serveur seulement : rendu par le navigateur (une navigation dans l’appli), un script ne s’exécute pas, et l’effet de
 * montage fait ce travail.
 */
const POSER_EN_BAS = `(function(){try{if(matchMedia(${JSON.stringify(DESKTOP)}).matches){var f=document.querySelector("[data-thread]");f=f&&f.parentElement;if(f)f.scrollTop=f.scrollHeight}else{var d=document.documentElement;scrollTo(0,Math.max(0,d.scrollHeight-innerHeight))}}catch(e){}})()`;

export function ConvEnBas() {
  /* Vrai au rendu serveur et à l’hydratation (le script est déjà passé), faux ensuite : le navigateur ne le crée jamais */
  const pageDuServeur = !useHydrated();
  return pageDuServeur ? <script dangerouslySetInnerHTML={{ __html: POSER_EN_BAS }} /> : null;
}
