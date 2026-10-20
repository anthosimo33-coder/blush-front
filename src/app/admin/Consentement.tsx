"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { NBSP } from "@/lib/format";
import { autoriserLaConnexion } from "@/services/api";
import type { Routes } from "@/types/api";

/**
 * Ce que la page de consentement montre (src/app/admin/connecter/page.tsx) : la demande à autoriser (qui la fait, où
 * part le code, avec quel compte), ou ce qui l’empêche (pas de session, une demande qui ne vaut plus).
 */
export type DemandeAffichee =
  { genre: "connexion" } | { genre: "perdue" } | { genre: "ok"; nom: string; hote: string; claude: boolean; boucleLocale: boolean; refus: string; compte: string };

type Parametres = Routes["POST /api/oauth/autoriser"]["corps"];

/** La carte de la page, au milieu de l’écran. */
function Carte({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <section className="flex w-full max-w-[460px] flex-col gap-5 rounded-[28px] bg-white p-6 shadow-soft md:p-8">
        <span className="self-start rounded-full bg-ink px-2.5 py-1 text-legende font-black text-white">Admin</span>
        <h1 className="m-0 text-[28px] font-black leading-[1.1] tracking-[-0.03em]">{titre}</h1>
        {children}
      </section>
    </main>
  );
}

/**
 * Autoriser Claude (ou un autre client MCP) à lire /admin. « Autoriser » envoie la demande (POST /api/oauth/autoriser)
 * puis suit le retour, qui porte le code ; « Refuser » renvoie au client son refus (access_denied).
 */
export function Consentement({ demande, parametres }: { demande: DemandeAffichee; parametres: Parametres }) {
  const [envoi, setEnvoi] = useState<"repos" | "en_cours" | "echec">("repos");
  if (demande.genre === "connexion")
    return (
      <Carte titre="Connecte-toi d’abord">
        <p className="m-0 text-detail font-extrabold text-grey">
          Ouvre BLUSH dans ce navigateur avec ton email de l’équipe, puis reviens sur cet onglet et recharge-le{NBSP}: la demande de connexion t’y attend.
        </p>
        <div className="flex flex-col gap-2">
          <a
            href="/connexion"
            target="_blank"
            rel="noopener"
            className="flex h-[52px] items-center justify-center rounded-[26px] bg-ink px-5 text-corps font-black text-white no-underline"
          >
            Me connecter à BLUSH
          </a>
          <Button variant="link" onClick={() => window.location.reload()}>
            Recharger cette page
          </Button>
        </div>
      </Carte>
    );
  if (demande.genre === "perdue")
    return (
      <Carte titre="Cette demande ne vaut plus">
        <p className="m-0 text-detail font-extrabold text-grey">Elle a expiré, ou elle vient d’un client que BLUSH ne connaît pas. Relance la connexion depuis Claude.</p>
      </Carte>
    );
  const qui = demande.claude ? "Claude" : `«\u00a0${demande.nom || demande.hote}\u00a0»`;
  const autoriser = async () => {
    setEnvoi("en_cours");
    try {
      const { redirection } = await autoriserLaConnexion(parametres);
      window.location.assign(redirection);
    } catch {
      setEnvoi("echec");
    }
  };
  return (
    <Carte titre={`Connecter ${qui} à BLUSH\u00a0?`}>
      <div className="flex flex-col gap-3 text-detail font-extrabold text-grey">
        <p className="m-0">
          {qui} pourra lire les chiffres de /admin en ton nom (<span className="text-ink">{demande.compte}</span>){NBSP}: le pilotage, les ventes, les coûts de l’IA, la santé, les
          mails et le direct.
        </p>
        <p className="m-0">Il ne pourra rien changer{NBSP}: ni bulles, ni déblocage, ni invitation, ni tournage. Aucune conv, aucun message, aucun email n’en sort.</p>
        <p className="m-0">
          Le code de connexion partira vers <span className="text-ink">{demande.hote}</span>
          {demande.boucleLocale ? " (un outil sur ton ordinateur, comme Claude Code)" : ""}. L’accès s’arrête quand tu déconnectes BLUSH dans Claude, quand ton email quitte
          l’équipe, ou après 30 jours sans servir.
        </p>
      </div>
      {envoi === "echec" && (
        <p role="alert" className="m-0 text-detail font-black text-danger">
          La connexion n’a pas pu se faire. Relance-la depuis Claude.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button size="md" onClick={() => void autoriser()} loading={envoi === "en_cours"} disabled={envoi === "echec"}>
          Autoriser
        </Button>
        <Button variant="secondary" size="md" onClick={() => window.location.assign(demande.refus)} disabled={envoi === "en_cours"}>
          Refuser
        </Button>
      </div>
    </Carte>
  );
}
