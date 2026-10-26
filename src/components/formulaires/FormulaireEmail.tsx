"use client";

import { Button } from "@/components/ui/Button";
import { Captcha } from "@/components/ui/Captcha";
import { EmailField } from "@/components/ui/EmailField";
import type { SaisieEmail } from "@/lib/email";
import { NBSP } from "@/lib/format";
import type { EnvoiCode } from "@/lib/useEnvoiCode";

/*
 * Le formulaire « ton email, puis un code », commun au parcours (EmailScreen) et à la connexion (ConnexionScreen) : le
 * champ dans le contenu de l’écran, le bouton dans son pied (Screen `footer`). Les deux lisent le même envoi
 * (useEnvoiCode) : Entrée dans le champ et le bouton font la même chose. La liste d’attente pose le même champ.
 */

/** Le champ de l’email, dans un formulaire : Entrée envoie. Sous lui, l’adresse qu’un domaine mal tapé voulait dire. */
export function FormulaireEmail({ envoi }: { envoi: SaisieEmail }) {
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void envoi.envoyer();
      }}
    >
      <EmailField
        value={envoi.email}
        onChange={envoi.changer}
        onBlur={envoi.quitter}
        invalid={envoi.invalide}
        errorText={envoi.probleme ?? "Vérifie ton email\u00a0: il manque quelque chose."}
      />
      <div aria-live="polite">{envoi.suggestion && !envoi.invalide && <SuggestionEmail envoi={envoi} suggestion={envoi.suggestion} />}</div>
    </form>
  );
}

/**
 * « Tu voulais dire alex@gmail.com ? » : le domaine corrigé en rose. « Oui » met la suggestion dans le champ, « Non » la
 * retire pour cet email (src/lib/email.ts). TODO(produit): texte nouveau, à valider (maquette du 26 octobre).
 */
function SuggestionEmail({ envoi, suggestion }: { envoi: SaisieEmail; suggestion: string }) {
  const arobase = suggestion.lastIndexOf("@");
  return (
    <div className="mt-2 flex items-center gap-2 rounded-[14px] bg-[#FFF1F7] py-1 pr-1.5 pl-3.5">
      <p className="m-0 min-w-0 flex-1 text-note font-extrabold break-words text-ink">
        Tu voulais dire {suggestion.slice(0, arobase + 1)}
        <span className="font-black text-elle-ink">{suggestion.slice(arobase + 1)}</span>
        {NBSP}?
      </p>
      <button type="button" onClick={envoi.ignorerSuggestion} className="inline-flex min-h-11 items-center px-2 text-note font-black text-soft">
        Non
      </button>
      <button type="button" onClick={envoi.accepterSuggestion} className="inline-flex min-h-9 items-center rounded-full bg-elle-ink px-4 text-note font-black text-white">
        Oui
      </button>
    </div>
  );
}

/**
 * « Recevoir mon code » : grisé tant que l’email n’a pas sa forme, des points pendant l’envoi. Au-dessus, le widget du
 * CAPTCHA, invisible tant qu’il ne demande pas de geste : son jeton part avec la demande (sendLoginCode).
 */
export function BoutonRecevoirCode({ envoi }: { envoi: EnvoiCode }) {
  return (
    <>
      <Captcha action="code" />
      <Button arrow loading={envoi.occupe} loadingLabel="Envoi du code" disabled={!envoi.valide || envoi.occupe} onClick={() => void envoi.envoyer()}>
        Recevoir mon code
      </Button>
    </>
  );
}
