"use client";

/*
 * L’historique de la conv de l’accueil : frais du serveur à l’ouverture (sauf quand la page vient de le rendre), et ses
 * morceaux plus anciens, demandés d’avance et posés devant en remontant la conv. Les messages eux-mêmes sont à
 * useConversation (./useConversation.ts), qui appelle ce hook : il ne les change que par les deux actions qu’elle lui
 * donne (fondre l’historique frais, poser des anciens devant). Ce qui touche à l’écran (mesurer la conv, attendre
 * qu’elle soit au repos, la recaler au rendu qui pose les anciens) est au défilement de l’accueil
 * (accueil/mouvement/defilement.ts : useDefilement et son `ecran`, useConvSuitLeBas), par `Devant` et ses fonctions.
 */
import { startTransition, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { getChatHistory } from "@/services/api";
import { ecritDepuis, FRAIS_DU_RENDU, renduFrais } from "@/lib/query";
import { tracer } from "@/lib/tracer";
import type { HistoriqueChat } from "@/types/api";
import { attenteArrivee, fusion, memesMessages, sansAttente, type Attente, type Conv } from "../../garde";
import { echangesEnMsgs, type Msg } from "./modele";

/**
 * Des messages posés devant (ou fondus dans la conv) : la hauteur d’avant, pour garder la conv là où on la lisait.
 * `marque` : un message du morceau, pour reconnaître le rendu qui le pose ; `pose` : prévient qu’il est posé.
 * useConvSuitLeBas (accueil/mouvement/defilement.ts) le lit au rendu qui suit, recale la conv, puis appelle `pose`.
 */
export type Devant = { desk: boolean; h: number; marque?: number; pose?: () => void };

/** Ce que le chargement demande à l’écran : où ranger la mesure d’avant, la prendre, et attendre que la conv soit au repos. */
export type EcranDeLHistorique = {
  devant: RefObject<Devant | null>;
  /** La hauteur de la conv avant d’y poser des messages (`marque` : voir Devant). */
  mesurer: (marque?: number) => Devant;
  /** Attend que la conv soit au repos (un morceau posé pendant l’élan d’un geste le couperait). */
  auRepos: () => Promise<void>;
};

/*
 * L’historique rendu par la page il y a moins de 10 s, et monté pour la première fois, dispense de le relire à
 * l’ouverture (Q63) : la même règle que les lectures de useQuery (renduFrais et FRAIS_DU_RENDU, src/lib/query.ts). Une
 * page revue par l’historique du navigateur repasse le même rendu : elle est relue. Comme `depart` pour useQuery, une
 * écriture du chat faite par ce navigateur depuis le rendu (un message, ici ou par la question du rapport ; le mode
 * vocal) le rend peut-être dépassé : une page préchargée (gardée 5 min par Next) est alors relue.
 */
const renduAJour = (rendu: number | undefined) => rendu !== undefined && renduFrais("chat", rendu, FRAIS_DU_RENDU) && !ecritDepuis("chat", rendu);

/*
 * Un échange parti avant de quitter l’accueil (garde.ts, Attente) : l’historique se relit toutes les 2,5 s jusqu’à ce
 * qu’il le rapporte, deux minutes au plus (une réponse met moins d’une minute ; le champ reste pris pendant ce temps).
 * Au-delà, ce qui l’attendait s’efface, comme une réponse qui a échoué : la prochaine visite relira l’historique.
 */
const PAS_DE_L_ATTENTE_MS = 2_500;
const DUREE_DE_L_ATTENTE_MS = 120_000;

export function useChargerAnciens({
  depart,
  depuis,
  derniers,
  attente,
  rendu,
  relire,
  modeVocalDuRendu,
  fondre,
  poserDevant,
  suivreModeVocal,
  ecran,
}: {
  /** La conv de départ (voir useConversation). */
  depart: Conv<Msg>;
  /** Le premier identifiant de cette visite : une visite qui a déjà écrit ne reprend pas l’historique frais. */
  depuis: number;
  /** La conv affichée, à jour après chaque rendu (pour ce qui arrive après coup). */
  derniers: RefObject<Conv<Msg>>;
  /** Un échange parti avant de quitter l’accueil, pas encore dans l’historique (garde.ts), ou null. */
  attente: Attente | null;
  /** L’heure du rendu serveur de la page (voir renduAJour). Sans elle, l’historique est toujours relu. */
  rendu?: number;
  /**
   * L’historique frais se relit (à l’ouverture, au retour par le bouton du navigateur). Faux pour l’aperçu de l’équipe
   * (sans conv en base) : il relirait l’historique du compte connecté, et le fondrait dans ses échanges inventés.
   */
  relire: boolean;
  /** Le mode vocal rendu par la page avec l’historique : il vaut celui qu’une relecture aurait rapporté. */
  modeVocalDuRendu?: boolean;
  /** L’historique frais, fondu dans la conv affichée : ses nouveaux messages. */
  fondre: (msgs: Msg[]) => void;
  /** Des échanges plus anciens, posés devant la conv (après l’intro). */
  poserDevant: (nouveaux: Msg[]) => void;
  /** Au départ d’une demande au serveur : de quoi suivre le mode vocal qu’elle rapportera (voir useModeVocal). */
  suivreModeVocal: () => (actif: boolean) => void;
  ecran: EcranDeLHistorique;
}) {
  /* L’historique se charge par morceaux : y en a-t-il de plus anciens, et le plus ancien déjà affiché */
  const [plus, setPlus] = useState(depart.plus);
  const [anciens, setAnciens] = useState(false);
  const plusAncien = useRef(depart.plusAncien);
  /* Le morceau d’avant, demandé d’avance : il se pose sans attendre le réseau quand le haut de la conv approche */
  const suivant = useRef<{ avant: number; reponse: Promise<HistoriqueChat> } | null>(null);
  const chargement = useRef(false);
  /* Reste-t-il plus ancien ? Comme `plus`, mais su tout de suite : le rendu qui retire le bouton peut tarder, et d’ici là
     l’élan du doigt redemanderait un morceau vide */
  const ilEnReste = useRef(depart.plus);
  const montage = useRef(true);
  /* Les actions et l’écran du dernier rendu : les lectures en route s’en servent à leur retour */
  const actions = useRef({ fondre, poserDevant, suivreModeVocal, ecran });
  useEffect(() => {
    actions.current = { fondre, poserDevant, suivreModeVocal, ecran };
  });
  const auMontage = useRef({ rendu, modeVocalDuRendu, relire, attente });

  /*
   * L’historique, frais du serveur, à chaque ouverture : un retour en arrière remontre la page telle qu’elle était
   * (sans les derniers échanges), et un onglet laissé ouvert peut dater. Il se fond dans la conv affichée (garde.ts) :
   * rien n’est remplacé ni déplacé, ce qui manque se pose à sa place, et la conv garde la sienne. Rien ne bouge si la
   * visite a déjà écrit (ses messages sont les plus récents). La page qui vient de le rendre n’est pas relue (renduAJour).
   */
  useEffect(() => {
    if (!auMontage.current.relire) return;
    let fini = false;
    /* L’échange encore en route au montage, et jusqu’à quand l’attendre */
    let enAttente = auMontage.current.attente;
    const finDeLAttente = Date.now() + DUREE_DE_L_ATTENTE_MS;
    let minuteur: number | undefined;
    const recharger = () => {
      const suivreModeVocal = actions.current.suivreModeVocal();
      return (
        getChatHistory()
          .then((h) => {
            if (fini) return;
            /* Le mode vocal suit la base, même quand l’historique n’a pas bougé (« Repasser à l’écrit » ailleurs) */
            if (h.modeVocal !== undefined) suivreModeVocal(h.modeVocal);
            let s = derniers.current;
            if (s.msgs.some((m) => m.id >= depuis)) return;
            if (enAttente) {
              const attendu = enAttente;
              if (attenteArrivee(attendu, h.echanges) || Date.now() >= finDeLAttente) {
                s = sansAttente(s, attendu);
                enAttente = null;
              } else {
                window.clearTimeout(minuteur);
                minuteur = window.setTimeout(() => void recharger(), PAS_DE_L_ATTENTE_MS);
              }
            }
            const r = fusion(s, { msgs: echangesEnMsgs(h.echanges), plus: h.plus, plusAncien: h.echanges[0]?.id ?? null });
            /* Le même historique que celui affiché : rien ne bouge */
            if (memesMessages(r.msgs, s.msgs)) return;
            plusAncien.current = r.plusAncien;
            ilEnReste.current = r.plus;
            suivant.current = null;
            /* Un morceau plus ancien attend d’être posé : sa mesure, prise avant, couvre aussi ce rendu */
            const { devant, mesurer } = actions.current.ecran;
            devant.current ??= mesurer();
            setPlus(r.plus);
            actions.current.fondre(r.msgs);
          })
          /* Pas de réseau : la conv affichée reste telle quelle ; l’échange attendu se relit encore, sinon le prochain retour relira */
          .catch((e) => {
            tracer("conv:historique", e);
            if (fini || !enAttente) return;
            window.clearTimeout(minuteur);
            minuteur = window.setTimeout(() => void recharger(), PAS_DE_L_ATTENTE_MS);
          })
      );
    };
    const premier = montage.current;
    montage.current = false;
    const page = auMontage.current;
    /* Un échange en route se relit toujours : la page, même fraîche, a pu être rendue avant qu’il finisse */
    if (premier && renduAJour(page.rendu) && !enAttente) {
      /* Ce que la relecture aurait rapporté : la conv de départ a déjà l’historique de la page, reste le mode vocal en base */
      if (page.modeVocalDuRendu !== undefined) actions.current.suivreModeVocal()(page.modeVocalDuRendu);
    } else void recharger();
    /* Revenu sur la page par le bouton retour du navigateur (la page gardée en mémoire) */
    const auRetour = (e: PageTransitionEvent) => {
      if (e.persisted) void recharger();
    };
    window.addEventListener("pageshow", auRetour);
    return () => {
      fini = true;
      window.clearTimeout(minuteur);
      window.removeEventListener("pageshow", auRetour);
    };
  }, [depuis, derniers]);

  /** Le morceau d’avant le plus ancien affiché, demandé d’avance (une seule fois). */
  const precharger = useCallback(() => {
    const avant = plusAncien.current;
    if (!avant || !ilEnReste.current || chargement.current || suivant.current?.avant === avant) return;
    const reponse = getChatHistory(avant);
    suivant.current = { avant, reponse };
    /* Raté (réseau coupé) : il sera redemandé */
    reponse.catch((e) => {
      tracer("conv:prechargement", e);
      if (suivant.current?.reponse === reponse) suivant.current = null;
    });
  }, []);

  /**
   * Les échanges d’avant le plus ancien affiché, posés devant (la conv garde sa place). Demandés d’avance, ils sont
   * souvent déjà là. Ils se posent quand la conv est au repos (tout de suite tout près du haut), dans une transition :
   * leur rendu ne bloque pas l’écran. Un morceau à la fois : le suivant n’est demandé qu’une fois celui-ci posé (sinon
   * sa mesure remplacerait la sienne, et la conv sauterait en bas au rendu du premier).
   */
  const chargerAnciens = useCallback(async () => {
    const avant = plusAncien.current;
    const { devant, mesurer, auRepos } = actions.current.ecran;
    if (!avant || !ilEnReste.current || chargement.current || devant.current) return;
    chargement.current = true;
    setAnciens(true);
    let h: HistoriqueChat;
    try {
      const deja = suivant.current?.avant === avant ? suivant.current.reponse : null;
      suivant.current = null;
      h = await (deja ?? getChatHistory(avant));
      await auRepos();
    } catch (e) {
      /* Réseau coupé : le bouton reste là, on réessaiera */
      tracer("conv:anciens", e);
      chargement.current = false;
      setAnciens(false);
      return;
    }
    /* Entre-temps, l’historique frais s’est fondu dans la conv : ce morceau n’est peut-être plus le bon */
    if (plusAncien.current !== avant) {
      chargement.current = false;
      setAnciens(false);
      return;
    }
    const nouveaux = echangesEnMsgs(h.echanges);
    const encore = h.plus && nouveaux.length > 0;
    ilEnReste.current = encore;
    const afficher = () => {
      setAnciens(false);
      setPlus(encore);
      if (nouveaux.length) actions.current.poserDevant(nouveaux);
    };
    const premier = nouveaux[0];
    if (premier) {
      plusAncien.current = h.echanges[0]?.id ?? null;
      /* Le rendu qui les pose recale la conv (voir Devant), puis prévient : alors seulement, le suivant peut partir */
      await new Promise<void>((pose) => {
        devant.current = { ...mesurer(premier.id), pose };
        startTransition(afficher);
      });
    } else startTransition(afficher);
    chargement.current = false;
    if (encore) precharger();
  }, [precharger]);

  return { plus, anciens, plusAncien, chargerAnciens, precharger };
}
