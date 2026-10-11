"use client";

import { Button } from "@/components/ui/Button";
import { EmailField } from "@/components/ui/EmailField";
import { TypingDots } from "@/components/ui/FileInput";
import type { SaisieEmail } from "@/lib/email";
import type { EnvoiCode } from "@/lib/useEnvoiCode";

/*
 * Le formulaire « ton email, puis un code », commun au parcours (EmailScreen) et à la connexion (ConnexionScreen) : le
 * champ dans le contenu de l’écran, le bouton dans son pied (Screen `footer`). Les deux lisent le même envoi
 * (useEnvoiCode) : Entrée dans le champ et le bouton font la même chose. La liste d’attente pose le même champ.
 */

/** Le champ de l’email, dans un formulaire : Entrée envoie. */
export function FormulaireEmail({ envoi }: { envoi: SaisieEmail }) {
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void envoi.envoyer();
      }}
    >
      <EmailField value={envoi.email} onChange={envoi.changer} onBlur={envoi.quitter} invalid={envoi.invalide} errorText={envoi.probleme ?? "Vérifie ton email\u00a0: il manque quelque chose."} />
    </form>
  );
}

/** « Recevoir mon code » : grisé tant que l’email n’a pas sa forme, des points pendant l’envoi. */
export function BoutonRecevoirCode({ envoi }: { envoi: EnvoiCode }) {
  return (
    <Button arrow={!envoi.occupe} disabled={!envoi.valide || envoi.occupe} aria-busy={envoi.occupe} onClick={() => void envoi.envoyer()}>
      {envoi.occupe ? <TypingDots color="#FFFFFF" label="Envoi du code" /> : "Recevoir mon code"}
    </Button>
  );
}
