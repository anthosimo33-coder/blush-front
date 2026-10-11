"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sendLoginCode } from "@/services/api";
import { useJourney } from "@/state/journey";
import { emailValide } from "./email";
import { messageErreur } from "./messages-erreur";

/** Ce que le champ d’un formulaire email lit et appelle (FormulaireEmail) : le parcours, la connexion, la liste d’attente. */
export type SaisieEmail = {
  email: string;
  /** Une saisie : l’email change, et le souci d’un envoi raté s’efface. */
  changer: (email: string) => void;
  /** Le champ quitté : une erreur de forme peut se montrer. */
  quitter: () => void;
  /** L’email a la forme d’un email (emailValide). */
  valide: boolean;
  /** Le champ est en erreur : un envoi raté, ou un email mal formé une fois le champ quitté. */
  invalide: boolean;
  /** Pourquoi l’envoi a raté, ou null : le champ le dit à la place de l’erreur de forme. */
  probleme: string | null;
  /** Entrée dans le champ, ou le bouton du pied d’écran. */
  envoyer: () => Promise<void>;
};

/** L’envoi du code : la saisie, et l’envoi en cours (BoutonRecevoirCode). Le problème : pourquoi le code n’est pas parti (textes relus le 8 octobre). */
export type EnvoiCode = SaisieEmail & { occupe: boolean };

/** Le champ en erreur : un envoi raté, ou un email mal formé, une fois le champ quitté et quelque chose d’écrit. */
export const champInvalide = ({ email, valide, probleme, touche }: { email: string; valide: boolean; probleme: string | null; touche: boolean }) => !!probleme || (touche && email.length > 0 && !valide);

/**
 * L’envoi du code de connexion, commun au parcours (EmailScreen) et à la connexion (ConnexionScreen) : l’email du
 * parcours (gardé d’un écran à l’autre), sa vérification, l’envoi, puis l’écran du code `versCode`. Cet écran est
 * statique : préchargé pendant qu’on tape son email, il s’ouvre tout de suite après l’envoi. Un envoi raté dit pourquoi,
 * et le bouton se libère.
 */
export function useEnvoiCode(versCode: string): EnvoiCode {
  const router = useRouter();
  const [j, set] = useJourney();
  const [touche, setTouche] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  const valide = emailValide(j.email);
  useEffect(() => {
    router.prefetch(versCode);
  }, [router, versCode]);

  const envoyer = async () => {
    if (!valide || occupe) {
      setTouche(true);
      return;
    }
    setOccupe(true);
    setProbleme(null);
    try {
      await sendLoginCode(j.email.trim());
      router.push(versCode);
    } catch (e) {
      setProbleme(messageErreur("code", e));
      setOccupe(false);
    }
  };

  return {
    email: j.email,
    changer: (email) => {
      set({ email });
      setProbleme(null);
    },
    quitter: () => setTouche(true),
    valide,
    invalide: champInvalide({ email: j.email, valide, probleme, touche }),
    probleme,
    occupe,
    envoyer,
  };
}
