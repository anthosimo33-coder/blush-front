"use client";

import { useEffect, useState } from "react";
import { codeRevenu } from "@/services/api";
import { CODE_MINUTES } from "./limites";

/*
 * Le mail du code est-il revenu ? Une adresse qui n’existe pas (une faute avant le @) fait rebondir le mail en quelques
 * secondes, et le webhook de Resend le note sur le code (src/server/delivrabilite.ts). L’écran du code le demande au
 * serveur (GET /api/auth/code) : toutes les ECOUTE.intervalleMs pendant ECOUTE.dureeMs après l’envoi, onglet visible,
 * puis à chaque retour sur l’onglet tant que le code vaut (on est allé voir ses mails, rien n’est venu).
 */

/** Combien de temps, et à quel rythme, l’écran du code demande si son mail est revenu après chaque envoi. */
export const ECOUTE = { dureeMs: 45_000, intervalleMs: 3_000 } as const;

/**
 * Le mail du code est revenu : vrai dès que le serveur le dit, pour l’envoi `envoi` (un compteur que chaque nouvel envoi
 * augmente : l’écoute repart de zéro, et un retour d’avant ne compte plus).
 */
export function useCodeRevenu(envoi: number): boolean {
  const [revenuPour, setRevenuPour] = useState<number | null>(null);
  useEffect(() => {
    const debut = Date.now();
    let fini = false;
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    const demander = async () => {
      if (fini || document.visibilityState === "hidden") return;
      try {
        if ((await codeRevenu()) && !fini) {
          fini = true;
          setRevenuPour(envoi);
        }
      } catch {
        /* Le réseau : la prochaine demande, ou le prochain retour sur l’onglet */
      }
    };
    const suivante = () => {
      if (fini || Date.now() - debut >= ECOUTE.dureeMs) return;
      minuteur = setTimeout(() => void demander().then(suivante), ECOUTE.intervalleMs);
    };
    suivante();
    const auRetour = () => {
      if (document.visibilityState === "visible" && Date.now() - debut < CODE_MINUTES * 60e3) void demander();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      fini = true;
      clearTimeout(minuteur);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, [envoi]);
  return revenuPour === envoi;
}
