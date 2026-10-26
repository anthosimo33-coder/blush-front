import { useEffect, useState } from "react";
import { suggestionEmail } from "./domaines-email";

/*
 * La forme d’un email, vérifiée dans le navigateur avant d’envoyer quoi que ce soit (le parcours, la connexion, la liste
 * d’attente), et la saisie qui la lit (useSaisieEmail). Une règle, pas un composant : le champ (EmailField) l’affiche,
 * il ne la tient pas. Le serveur refait sa propre vérification (`Email`, src/server/auth.ts).
 */

/** Quelque chose, une arobase, un domaine avec un point et au moins deux lettres derrière, sans espace. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** L’email saisi a-t-il la forme d’un email (espaces du bord ignorés) ? */
export const emailValide = (email: string) => EMAIL_RE.test(email.trim());

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
  /**
   * L’adresse que l’email tapé voulait sans doute dire, son domaine corrigé (suggestionEmail, src/lib/domaines-email.ts),
   * une fois montrée : après une pause dans la frappe, le champ quitté, ou un premier envoi. null : rien à proposer.
   */
  suggestion: string | null;
  /** « Oui » : l’email devient la suggestion. */
  accepterSuggestion: () => void;
  /** « Non » : l’email reste tel quel, la suggestion ne revient plus pour lui. */
  ignorerSuggestion: () => void;
  /** Entrée dans le champ, ou le bouton du pied d’écran. */
  envoyer: () => Promise<void>;
};

/** La pause dans la frappe après laquelle la suggestion se montre : assez longue pour ne pas clignoter à chaque lettre. */
export const PAUSE_SUGGESTION_MS = 900;

/** Le champ en erreur : un envoi raté, ou un email mal formé, une fois le champ quitté et quelque chose d’écrit. */
export const champInvalide = ({ email, valide, probleme, touche }: { email: string; valide: boolean; probleme: string | null; touche: boolean }) =>
  !!probleme || (touche && email.length > 0 && !valide);

/**
 * La saisie d’un email, commune à l’envoi du code (useEnvoiCode) et à la liste d’attente : l’email vient de l’écran
 * (`email`, `setEmail`), avec ce que l’envoi en dit (`probleme`, `oublierProbleme`, `occupe`). Envoyer un email mal
 * formé, ou pendant un envoi, ne part pas : le champ est seulement marqué quitté, pour montrer l’erreur de forme.
 * Un domaine mal tapé (suggestionEmail) : le premier envoi montre la suggestion au lieu de partir, si elle n’était pas
 * déjà là ; un second envoi part tel quel (on l’a vue, c’est bien cet email). `envoyer` reçoit l’email sans les espaces du bord.
 */
export function useSaisieEmail(
  email: string,
  setEmail: (email: string) => void,
  { probleme, oublierProbleme, occupe, envoyer }: { probleme: string | null; oublierProbleme: () => void; occupe: boolean; envoyer: (email: string) => Promise<void> },
): SaisieEmail {
  const [touche, setTouche] = useState(false);
  /* La suggestion montrée (pour l’email d’alors), et l’email dont on a dit « Non » */
  const [vue, setVue] = useState<string | null>(null);
  const [ignore, setIgnore] = useState<string | null>(null);
  const valide = emailValide(email);
  const propre = email.trim();
  const possible = valide && ignore !== propre ? suggestionEmail(propre) : null;
  /* Une pause dans la frappe la montre */
  useEffect(() => {
    if (!possible) return;
    const t = setTimeout(() => setVue(possible), PAUSE_SUGGESTION_MS);
    return () => clearTimeout(t);
  }, [possible]);
  const suggestion = possible && vue === possible ? possible : null;
  return {
    email,
    changer: (v) => {
      setEmail(v);
      oublierProbleme();
    },
    quitter: () => {
      setTouche(true);
      if (possible) setVue(possible);
    },
    valide,
    invalide: champInvalide({ email, valide, probleme, touche }),
    probleme,
    suggestion,
    accepterSuggestion: () => {
      if (!suggestion) return;
      setEmail(suggestion);
      oublierProbleme();
    },
    ignorerSuggestion: () => setIgnore(propre),
    envoyer: async () => {
      if (!valide || occupe) {
        setTouche(true);
        return;
      }
      if (possible && !suggestion) {
        setVue(possible);
        return;
      }
      await envoyer(propre);
    },
  };
}
