"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sendLoginCode } from "@/services/api";
import { useJourney } from "@/state/journey";
import { type SaisieEmail, useSaisieEmail } from "./email";
import { messageErreur } from "./messages-erreur";

/** L’envoi du code : la saisie, et l’envoi en cours (BoutonRecevoirCode). Le problème : pourquoi le code n’est pas parti (textes relus le 8 octobre). */
export type EnvoiCode = SaisieEmail & { occupe: boolean };

/**
 * L’envoi du code de connexion, commun au parcours (EmailScreen) et à la connexion (ConnexionScreen) : l’email du
 * parcours (gardé d’un écran à l’autre), sa vérification, l’envoi, puis l’écran du code `versCode`. Cet écran est
 * statique : préchargé pendant qu’on tape son email, il s’ouvre tout de suite après l’envoi. Un envoi raté dit pourquoi,
 * et le bouton se libère.
 */
export function useEnvoiCode(versCode: string): EnvoiCode {
  const router = useRouter();
  const [j, set] = useJourney();
  const [occupe, setOccupe] = useState(false);
  const [probleme, setProbleme] = useState<string | null>(null);
  useEffect(() => {
    router.prefetch(versCode);
  }, [router, versCode]);

  const saisie = useSaisieEmail(j.email, (email) => set({ email }), {
    probleme,
    oublierProbleme: () => setProbleme(null),
    occupe,
    envoyer: async (email) => {
      setOccupe(true);
      setProbleme(null);
      try {
        await sendLoginCode(email);
        router.push(versCode);
      } catch (e) {
        setProbleme(messageErreur("code", e));
        setOccupe(false);
      }
    },
  });
  return { ...saisie, occupe };
}
