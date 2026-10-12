"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { INVITATIONS_PAR_LOT } from "@/lib/limites";
import { gesteDeLEquipe } from "@/services/api";
import type { GesteDeLEquipe } from "@/types/api";
import { ErreurApi } from "@/types/erreurs-api";

/*
 * Les gestes de l’équipe dans /admin (POST /api/admin) : donner des bulles à un compte, débloquer le rapport de sa
 * dernière conv (ou de toutes), inviter la liste d’attente par lots. Chacun va au journal de l’équipe (actions_equipe) ;
 * sa réponse ne dit que des nombres. Une fois fait, le tableau de bord se relit (ses chiffres et ses dernières actions).
 * Au clavier : chaque formulaire s’envoie par Entrée, et sa réponse s’annonce (role="status").
 */

/** Une réponse d’un geste : un texte, et s’il a marché. */
type Issue = { ok: boolean; texte: string };

const nombre = (v: number) => v.toLocaleString("fr-FR");
const s = (n: number) => (Math.abs(n) > 1 ? "s" : "");

/** Ce qu’un geste a fait, dit en clair. */
function issueDe(r: GesteDeLEquipe): Issue {
  if (r.action === "bulles")
    return r.solde === null
      ? { ok: false, texte: "Aucun compte pour cet email (la personne doit s’être connectée une fois)." }
      : { ok: true, texte: `C’est fait. Son solde\u00a0: ${nombre(r.solde)} bulle${s(r.solde)}.` };
  if (r.action === "debloquer")
    return r.convs === null
      ? { ok: false, texte: "Aucun compte pour cet email (la personne doit s’être connectée une fois)." }
      : r.convs === 0
        ? { ok: false, texte: "Rien à débloquer\u00a0: pas de conv, ou déjà ouverte." }
        : { ok: true, texte: `C’est fait\u00a0: ${r.convs} conv${s(r.convs)} débloquée${s(r.convs)}. Le rapport s’écrit à sa prochaine ouverture.` };
  const fin = r.plafond ? " Le plafond des mails du jour est atteint\u00a0: la suite demain." : "";
  return { ok: r.invites > 0, texte: `${nombre(r.invites)} invitation${s(r.invites)} partie${s(r.invites)}, ${nombre(r.restent)} à inviter.${fin}` };
}

/** Un refus du serveur, dit en clair. */
function refus(e: unknown): Issue {
  const code = e instanceof ErreurApi ? e.code : "erreur";
  if (code === "email") return { ok: false, texte: "Cet email n’en est pas un." };
  if (code === "invalide") return { ok: false, texte: "Ce nombre n’est pas accepté." };
  if (code === "connexion" || code === "introuvable") return { ok: false, texte: "Ta session n’ouvre pas ces gestes\u00a0: reconnecte-toi avec l’email de l’équipe." };
  return { ok: false, texte: "Ça n’a pas marché. Vérifie ta connexion et réessaie." };
}

function Champ({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-micro font-black text-soft">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

const CHAMP = "h-11 w-full min-w-0 rounded-[14px] bg-[#F8F7F4] px-3.5 text-note font-extrabold text-ink outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--elle)]";

/** Un geste : son titre, ce qu’il fait, ses champs, son bouton et sa réponse annoncée. */
function Geste({ titre, aide, bouton, envoyer, children }: { titre: string; aide: string; bouton: string; envoyer: () => Promise<GesteDeLEquipe>; children: ReactNode }) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [issue, setIssue] = useState<Issue | null>(null);
  const id = useId();
  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    if (envoi) return;
    setEnvoi(true);
    setIssue(null);
    try {
      setIssue(issueDe(await envoyer()));
      router.refresh();
    } catch (err) {
      setIssue(refus(err));
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <form aria-labelledby={`${id}-titre`} onSubmit={(e) => void soumettre(e)} className="flex flex-col gap-3 rounded-[18px] border-2 border-sep p-4">
      <div className="flex flex-col gap-0.5">
        <h3 id={`${id}-titre`} className="m-0 text-note font-black">
          {titre}
        </h3>
        <p className="m-0 text-micro font-extrabold text-grey">{aide}</p>
      </div>
      {children}
      <Button type="submit" variant="secondary" size="md" loading={envoi}>
        {bouton}
      </Button>
      <p role="status" className={cn("m-0 min-h-[18px] text-micro font-black", issue?.ok ? "text-vrai-ink" : "text-danger")}>
        {issue?.texte}
      </p>
    </form>
  );
}

/** `invitables` : les inscrits pas encore invités ; `mailsPossibles` : les mails de la liste qui peuvent encore partir aujourd’hui. */
export function GestesDeLEquipe({ invitables, mailsPossibles }: { invitables: number; mailsPossibles: number }) {
  const [emailBulles, setEmailBulles] = useState("");
  const [n, setN] = useState("10");
  const [emailConv, setEmailConv] = useState("");
  const [cible, setCible] = useState<"derniere" | "toutes">("derniere");
  const conseille = Math.max(1, Math.min(INVITATIONS_PAR_LOT, invitables, mailsPossibles));
  const [lot, setLot] = useState(String(conseille));
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Geste
        titre="Donner des bulles"
        aide="À un compte, par son email. Noté au journal de l’équipe."
        bouton="Donner"
        envoyer={() => gesteDeLEquipe({ action: "bulles", email: emailBulles, n: Number(n) })}
      >
        <Champ label="Email du compte">
          {(id) => (
            <input id={id} type="email" required autoComplete="off" spellCheck={false} value={emailBulles} onChange={(e) => setEmailBulles(e.target.value)} className={CHAMP} />
          )}
        </Champ>
        <Champ label="Bulles (1 à 1 000)">
          {(id) => <input id={id} type="number" required min={1} max={1000} step={1} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} className={CHAMP} />}
        </Champ>
      </Geste>
      <Geste
        titre="Débloquer une conv"
        aide="Le rapport complet, offert. Noté au journal de l’équipe."
        bouton="Débloquer"
        envoyer={() => gesteDeLEquipe({ action: "debloquer", email: emailConv, cible })}
      >
        <Champ label="Email du compte">
          {(id) => <input id={id} type="email" required autoComplete="off" spellCheck={false} value={emailConv} onChange={(e) => setEmailConv(e.target.value)} className={CHAMP} />}
        </Champ>
        <Champ label="Quelle conv">
          {(id) => (
            <select id={id} value={cible} onChange={(e) => setCible(e.target.value === "toutes" ? "toutes" : "derniere")} className={CHAMP}>
              <option value="derniere">Sa dernière conv</option>
              <option value="toutes">Toutes ses convs</option>
            </select>
          )}
        </Champ>
      </Geste>
      <Geste
        titre="Inviter la liste d’attente"
        aide={`Les plus anciens d’abord, avec le mail «\u00a0Ta place est prête\u00a0». ${nombre(invitables)} à inviter, ${nombre(mailsPossibles)} mail${s(mailsPossibles)} possible${s(mailsPossibles)} aujourd’hui.`}
        bouton="Inviter"
        envoyer={() => gesteDeLEquipe({ action: "inviter", n: Number(lot) })}
      >
        <Champ label={`Combien (1 à ${INVITATIONS_PAR_LOT})`}>
          {(id) => (
            <input
              id={id}
              type="number"
              required
              min={1}
              max={INVITATIONS_PAR_LOT}
              step={1}
              inputMode="numeric"
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              className={CHAMP}
            />
          )}
        </Champ>
      </Geste>
    </div>
  );
}
