"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { tracer } from "@/lib/tracer";
import { lireLeDirect } from "@/services/api";
import type { Direct } from "@/types/api";
import { ilYa, nombre } from "./calculs";
import { Pouls } from "./morceaux";

/*
 * Le direct d’/admin, relu toutes les 5 secondes (GET /api/admin/direct) et partagé par ce qui le montre : le nombre en
 * ligne dans l’onglet, la carte noire du pilotage, la page En direct. Une lecture à la fois (la suivante part 5 s après la
 * fin de la précédente), en pause quand l’onglet est caché, relancée dès qu’il revient. Une lecture ratée garde le
 * dernier direct et le dit ; la suivante réessaie. L’aperçu (/apercu/admin) ne sonde pas : son direct reste figé.
 */

/** Tous les combien le direct se relit, en ms. */
const PERIODE_DU_DIRECT_MS = 5000;

/**
 * Le direct partagé : le dernier lu (null : pas encore), les secondes écoulées depuis son calcul (d’après l’horloge du
 * navigateur, pour dire « il y a 12 s » sans croire l’heure du serveur), et si la dernière lecture a raté.
 */
type DirectPartage = { d: Direct | null; ecoule: number; panne: boolean };

const Contexte = createContext<DirectPartage>({ d: null, ecoule: 0, panne: false });

/** Le direct lu par la sonde au-dessus. */
export const useDirect = () => useContext(Contexte);

/** Les secondes entre un geste (ISO) et maintenant, d’après le calcul du direct et le temps écoulé depuis. */
export const secondesDepuis = (d: Direct, le: string, ecoule: number) => Math.max(0, (Date.parse(d.le) - Date.parse(le)) / 1000 + ecoule);

/** `initial` : le direct lu par la page (null : pas lu, la sonde le lit tout de suite) ; `sonder` faux : l’aperçu, figé. */
export function SondeDuDirect({ initial, sonder = true, children }: { initial: Direct | null; sonder?: boolean; children: ReactNode }) {
  const [d, setD] = useState(initial);
  /* Sans direct lu par la page, la sonde le lit tout de suite ; sinon, dans 5 s */
  const [aLireToutDeSuite] = useState(initial === null);
  const [panne, setPanne] = useState(false);
  /*
   * Quand le dernier direct est arrivé, et l’heure qu’il est, d’après le navigateur. Au rendu du serveur comme au premier
   * du navigateur : 0 et 0 (rien d’écoulé). Le direct lu par la page est arrivé au chargement : le premier battement de
   * l’horloge, une seconde plus tard, le date d’une seconde.
   */
  const [horloge, setHorloge] = useState({ recuA: 0, maintenant: 0 });

  useEffect(() => {
    if (!sonder) return;
    let arrete = false;
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    let enCours: AbortController | null = null;
    const visible = () => document.visibilityState === "visible";
    const planifier = () => {
      clearTimeout(minuteur);
      if (!arrete && visible()) minuteur = setTimeout(() => void lire(), PERIODE_DU_DIRECT_MS);
    };
    const lire = async () => {
      if (arrete || enCours || !visible()) return;
      enCours = new AbortController();
      try {
        const lu = await lireLeDirect(enCours.signal);
        if (arrete) return;
        const t = Date.now();
        setD(lu);
        setHorloge({ recuA: t, maintenant: t });
        setPanne(false);
      } catch (e) {
        if (arrete) return;
        tracer("admin:direct", e);
        setPanne(true);
      } finally {
        enCours = null;
        planifier();
      }
    };
    /* L’onglet revient : une lecture tout de suite (la précédente date peut-être) ; il se cache : plus rien ne part */
    const auChangement = () => {
      if (visible()) {
        clearTimeout(minuteur);
        void lire();
      } else clearTimeout(minuteur);
    };
    document.addEventListener("visibilitychange", auChangement);
    if (aLireToutDeSuite) void lire();
    else planifier();
    /* L’horloge des « il y a » : une fois par seconde, onglet visible */
    const battement = setInterval(() => {
      if (!visible()) return;
      const t = Date.now();
      setHorloge((h) => (h.recuA === 0 ? { recuA: t - 1000, maintenant: t } : { recuA: h.recuA, maintenant: t }));
    }, 1000);
    return () => {
      arrete = true;
      clearTimeout(minuteur);
      clearInterval(battement);
      enCours?.abort();
      document.removeEventListener("visibilitychange", auChangement);
    };
  }, [sonder, aLireToutDeSuite]);

  return <Contexte.Provider value={{ d, ecoule: Math.max(0, (horloge.maintenant - horloge.recuA) / 1000), panne }}>{children}</Contexte.Provider>;
}

/** Le nombre en ligne, dans l’onglet « En direct » : un point rose qui bat, et le nombre (« … » avant la première lecture). */
export function NombreEnLigne() {
  const { d } = useDirect();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink py-0.5 pl-[7px] pr-[9px] text-legende font-black text-white tabular-nums">
      <Pouls taille={8} />
      {d ? nombre(d.enLigne) : "…"}
      <span className="sr-only"> en ligne</span>
    </span>
  );
}

/** « Mis à jour il y a 2 s · toutes les 5 s », ou la panne. */
export function MisAJour({ className }: { className?: string }) {
  const { d, ecoule, panne } = useDirect();
  return (
    <p className={className}>
      {panne ? "Hors ligne, nouvel essai toutes les 5\u00a0s" : d ? `Mis à jour ${ecoule < 1 ? "à l’instant" : ilYa(ecoule)} · toutes les 5\u00a0s` : "Lecture du direct…"}
    </p>
  );
}
