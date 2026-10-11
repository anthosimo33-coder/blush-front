"use client";

/*
 * Les deux barres du haut de l’accueil : sur mobile, l’en-tête qui flotte au-dessus de la conv (EnTeteMobile) ; sur
 * desktop, la barre de la fenêtre de conv (BarreDeLaFenetre). Les deux posent BLUSH au centre (sa bulle s’anime quand il
 * répond, un toucher ouvre la feuille du contact), l’autre à droite comme un contact, et à gauche un retour (au rapport,
 * à la liste des convs, au compte). Leurs pièces (BlushTitle, SophieButton, ConvsButton) sont dans ./Entetes.tsx, et ce
 * qui en part ou s’y anime s’inscrit au registre de l’en-tête (./mouvement/registre.ts).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore, type RefObject } from "react";
import { DESKTOP } from "@/lib/motion";
import { pagePrecedente } from "@/lib/navigation";
import { IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icons";
import type { ConvSummary } from "@/types";
import type { HomeContact } from "./contact";
import { BlushTitle, ConvsButton, SophieButton } from "./Entetes";
import type { RegistreEntete } from "./mouvement/registre";

/** Grand écran (DESKTOP) : vrai ou faux dans le navigateur, null au rendu serveur et à l’hydratation. */
function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(DESKTOP);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => null,
  );
}

/** Ce que les deux barres montrent : l’autre (son niveau suivi pendant la visite), les autres convs, BLUSH qui écrit. */
type Barre = {
  contact: HomeContact;
  /** Plusieurs convs : les autres convs du compte (à gauche, le retour à leur liste). */
  others: ConvSummary[];
  /** BLUSH écrit : sa bulle s’anime. */
  busy: boolean;
  /** Un toucher sur BLUSH : la feuille du contact. */
  ouvrirDetails: () => void;
  entete: RegistreEntete;
};

/**
 * Mobile : BLUSH en grand au centre (sa bulle flotte et s’anime quand il répond), l’autre à droite comme un contact. Le
 * fond s’efface vers le bas : les messages passent dessous en douceur. 8 · Quand tu remontes dans l’historique, tout se
 * range dans une barre fine (`headRef`, accueil/mouvement/entete.ts). `fromReport` : arrivé par la bulle du rapport, le
 * retour au rapport remplace le bouton du compte.
 */
export function EnTeteMobile({ headRef, fromReport, contact, others, busy, ouvrirDetails, entete }: Barre & { headRef: RefObject<HTMLElement | null>; fromReport: boolean }) {
  const router = useRouter();
  const desktop = useDesktop();
  return (
    <header ref={headRef} className="pointer-events-none sticky top-0 z-20 shrink-0 lg:hidden home-head">
      <span
        aria-hidden="true"
        data-c="bg"
        className="absolute inset-0 bg-[rgba(244,242,237,0.84)] backdrop-blur-xl [mask-image:linear-gradient(180deg,#000_calc(100%_-_22px),transparent)]"
      />
      <div className="relative grid grid-cols-[1fr_auto_1fr] items-start px-4 pb-5 pt-[max(6px,env(safe-area-inset-top))]">
        <div data-c="acc" className="pointer-events-auto mt-3 flex">
          <span data-a="acc" className="flex">
            {fromReport ? (
              <IconButton
                onClick={() => (pagePrecedente() === "/rapport" ? router.back() : router.push("/rapport"))}
                icon="back"
                label="Revenir au rapport"
                iconSize={19}
                className="!size-10 !shadow-soft"
              />
            ) : others.length > 0 ? (
              <ConvsButton others={others} />
            ) : (
              <IconButton href="/compte" icon="user" label="Mon compte" iconSize={19} className="!size-10 !shadow-soft" />
            )}
          </span>
        </div>
        <BlushTitle big busy={busy} onClick={ouvrirDetails} logoRef={entete.inscrire.logo} />
        <div className="mt-2 flex justify-end">
          {/* Rendu serveur compris (desktop encore inconnu) : un iPhone ne remonte pas l’avatar à l’hydratation */}
          <SophieButton contact={contact} anneauRef={entete.inscrire.anneau} avatarRef={entete.inscrire.avatar} shared={desktop !== true} />
        </div>
      </div>
    </header>
  );
}

/** Desktop : la barre de la fenêtre, comme sur mobile (BLUSH au centre, l’autre à droite). */
export function BarreDeLaFenetre({ contact, others, busy, ouvrirDetails, entete }: Barre) {
  const desktop = useDesktop();
  return (
    <div className="hidden h-[112px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[rgba(17,17,20,0.06)] px-5 lg:grid">
      {/* Le rapport, à un clic : la place à gauche de la barre était vide. Avec plusieurs convs, le retour à leur liste */}
      <span className="flex">
        {others.length > 0 ? (
          <ConvsButton others={others} flat />
        ) : (
          <Link
            href="/rapport"
            className="back-nudge flex items-center gap-1.5 rounded-full px-3 py-2 text-note font-black text-ink no-underline transition-colors hover:bg-[rgba(17,17,20,0.05)]"
          >
            <Icon name="back" size={16} stroke={2.6} className="text-ink" />
            Ton rapport
          </Link>
        )}
      </span>
      <BlushTitle busy={busy} onClick={ouvrirDetails} logoRef={entete.inscrire.logo} />
      <div className="flex justify-end">
        <SophieButton contact={contact} anneauRef={entete.inscrire.anneau} avatarRef={entete.inscrire.avatar} shared={desktop === true} />
      </div>
    </div>
  );
}
