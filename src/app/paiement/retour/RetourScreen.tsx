"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CATALOGUE } from "@/contenu/offres";
import { RETOUR_PAIEMENT } from "@/contenu/paiement";
import { cn } from "@/lib/cn";
import { codeDe } from "@/lib/messages-erreur";
import { delai } from "@/lib/motion";
import { suiteDuPaiement } from "@/lib/paiement";
import { apresDeblocage } from "@/lib/requetes";
import { etatDuPaiement } from "@/services/api";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Grappe } from "@/components/bulles/perles";
import { ButtonLink } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icons";
import { Screen } from "@/components/shell/Screen";
import type { OffreId } from "@/types";
import type { EtatAchat } from "@/types/api";

/** Toutes les combien relire l’achat, et combien de fois avant de dire que ça prend du temps (une minute). */
const PAS_MS = 1_000;
const ESSAIS = 60;
/** Ensuite, plus lentement, et pas sans fin : toutes les 5 secondes, jusqu’à 10 minutes en tout. */
const PAS_LONG_MS = 5_000;
const ESSAIS_LONGS = ESSAIS + 108;
/** Le temps de voir les bulles reçues, avant de revenir là où le paiement a commencé. */
const RECU_MS = 1_800;

/** Ce que Whop ajoute à l’adresse du retour (`status=`) : le paiement passé, refusé, ou annulé sur sa page. */
export type StatutDuRetour = "succeeded" | "failed" | "canceled";

/** Ce que la page montre : l’attente, l’achat qui ne sera pas livré, ou les bulles reçues (`recu`) avant d’y retourner (`vers`). */
type Etat = { nom: "attente" | "long" | "echoue" | "abandon" | "annule" | "introuvable" } | { nom: "recu"; bulles: number; vers: Route };

/** Où mener une fois l’achat payé : « C’est débloqué » pour un rapport (qui reprend ensuite où le paiement a commencé). */
const versDebloque = (e: EtatAchat, suite: string | null): Route => `/rapport/debloque?achat=${e.achat}${suite ? `&suite=${encodeURIComponent(suite)}` : ""}`;

/** Où « Réessayer » mène : la feuille « Ta formule » pour un rapport ; sinon là où le paiement a commencé, ou l’accueil. */
const versReessayer = (offre: OffreId, suite: string | null): Route => (CATALOGUE[offre].conv ? "/rapport?paiement=1" : ((suite ?? "/app") as Route));

/** Le dessin de chaque état : la pastille ronde et son icône (les bulles reçues ont leur grappe, l’attente le logo). */
const PASTILLES = {
  echoue: { icone: "close", ton: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-danger" },
  abandon: { icone: "back", ton: "bg-plaque text-soft" },
  annule: { icone: "alert", ton: "bg-plaque text-soft" },
  introuvable: { icone: "alert", ton: "bg-plaque text-soft" },
} as const;

/**
 * Le retour du paiement, au dessin de l’appli : l’achat relu chaque seconde (GET /api/paiement/[achat], qui vérifie
 * chez Whop si le webhook tarde), puis la page qui suit. Un rapport : « C’est débloqué ». Des bulles (un pack, l’offre
 * ③) : elles se disent (« +80 bulles »), puis on revient là où le paiement a commencé (le chat). Refusé, annulé chez Whop
 * (`statut`, de son adresse), remboursé ou introuvable : on le dit, avec « Réessayer » ou le retour au rapport.
 */
export function RetourScreen({ achat, paiement, statut }: { achat: string | null; paiement: string | null; statut: StatutDuRetour | null }) {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>({ nom: achat ? "attente" : "introuvable" });
  /* L’offre de l’achat, une fois lue, et où le paiement a commencé (l’onglet le garde) : « Réessayer » en dépend */
  const [offre, setOffre] = useState<OffreId | null>(null);
  const [suite, setSuite] = useState<string | null>(null);
  useEffect(() => {
    if (!achat) return;
    let fini = false;
    let essais = 0;
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const finir = (e: Etat) => {
      fini = true;
      setEtat(e);
    };
    const relire = async () => {
      essais += 1;
      try {
        const e = await etatDuPaiement(achat, paiement);
        if (fini) return;
        /* La suite d’une recharge dit les bulles que le serveur a livrées (`?recharge=`), pas celles que la feuille a comptées */
        const suite = suiteDuPaiement(e.achat, e.bulles);
        setOffre(e.offre);
        setSuite(suite);
        if (e.statut === "paye") {
          fini = true;
          apresDeblocage();
          if (CATALOGUE[e.offre].conv) router.replace(versDebloque(e, suite));
          else {
            const vers = (suite ?? "/app") as Route;
            setEtat({ nom: "recu", bulles: e.bulles, vers });
            minuterie = setTimeout(() => router.replace(vers), RECU_MS);
          }
          return;
        }
        if (e.statut === "echoue") return finir({ nom: "echoue" });
        if (e.statut !== "en_attente") return finir({ nom: "annule" });
        /* Encore en attente, mais Whop a dit d’où l’on revient : annulé sur sa page, ou refusé (rien ne viendra plus) */
        if (statut === "canceled") return finir({ nom: "abandon" });
        if (statut === "failed") return finir({ nom: "echoue" });
      } catch (err) {
        if (fini) return;
        /* Pas son achat, ou plus de session : rien à attendre ; le réseau, on réessaie */
        if (codeDe(err) === "introuvable" || codeDe(err) === "connexion") return finir({ nom: "introuvable" });
      }
      if (essais >= ESSAIS_LONGS) return;
      if (essais >= ESSAIS) setEtat({ nom: "long" });
      minuterie = setTimeout(() => void relire(), essais >= ESSAIS ? PAS_LONG_MS : PAS_MS);
    };
    void relire();
    return () => {
      fini = true;
      clearTimeout(minuterie);
    };
  }, [achat, paiement, statut, router]);

  const textes = etat.nom === "recu" ? RETOUR_PAIEMENT.recu(etat.bulles) : RETOUR_PAIEMENT[etat.nom];
  const pied =
    etat.nom === "attente" ? undefined : etat.nom === "recu" ? (
      <ButtonLink href={etat.vers} arrow>
        {RETOUR_PAIEMENT.continuer}
      </ButtonLink>
    ) : (etat.nom === "echoue" || etat.nom === "abandon") && offre ? (
      <div className="flex flex-col gap-1">
        <ButtonLink href={versReessayer(offre, suite)} arrow>
          {RETOUR_PAIEMENT.reessayer}
        </ButtonLink>
        {CATALOGUE[offre].conv && (
          <ButtonLink href="/rapport" variant="link">
            {RETOUR_PAIEMENT.revenir}
          </ButtonLink>
        )}
      </div>
    ) : (
      <ButtonLink href="/rapport">{RETOUR_PAIEMENT.revenir}</ButtonLink>
    );
  return (
    <Screen mise="colonne" mainWidth={480} desktopTopPad={0} footer={pied}>
      <div className="isolate flex flex-1 flex-col items-center justify-center gap-4 pb-6 pt-10 text-center lg:flex-none lg:pt-[max(40px,calc(50dvh_-_300px))]">
        <div aria-hidden="true" className="relative flex h-[110px] w-[240px] items-center justify-center">
          <span className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,white,rgba(255,255,255,0))]" />
          {etat.nom === "attente" || etat.nom === "long" ? (
            <span className="flex flex-col items-center gap-3">
              <BubbleLogo size={76} animated />
              {etat.nom === "attente" && <TypingDots />}
            </span>
          ) : etat.nom === "recu" ? (
            <span data-float="">
              <Grappe taille={84} />
            </span>
          ) : (
            <span data-popin="" className={cn("flex size-[72px] items-center justify-center rounded-full", PASTILLES[etat.nom].ton)}>
              <Icon name={PASTILLES[etat.nom].icone} size={30} stroke={2.6} />
            </span>
          )}
        </div>
        {/* Ce qui se passe, annoncé à chaque changement : le titre, puis sa ligne */}
        <div role="status" className="flex flex-col items-center gap-2">
          <h1 data-rise="" style={delai(0.1)} className="m-0 max-w-[340px] text-[28px] font-black leading-[1.1] tracking-[-0.02em] [text-wrap:balance]">
            {textes.titre}
          </h1>
          {textes.texte && (
            <p data-rise="" style={delai(0.2)} className="m-0 max-w-[340px] text-corps font-extrabold leading-[1.45] text-soft">
              {textes.texte}
            </p>
          )}
        </div>
      </div>
    </Screen>
  );
}
