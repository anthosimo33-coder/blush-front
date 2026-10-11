"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { codeDe } from "@/lib/messages-erreur";
import { connexionPuis } from "@/lib/suite";
import { tracer } from "@/lib/tracer";
import { useSondage, type SuiteDuSondage } from "@/lib/useSondage";
import { getAnalysisProgress, resumeAnalysis } from "@/services/api";
import { lectureLancee } from "@/state/lecture";
import type { CodeApi } from "@/types/erreurs-api";
import type { AnalysisProgress } from "@/types";

/*
 * Le suivi de la lecture d’une conv (l’écran : LectureScreen.tsx) : la lancer (ou la relancer) en arrivant, puis relire
 * où elle en est chaque seconde (useSondage) jusqu’à son verdict, ou jusqu’à l’échec. Les règles du suivi (l’attente
 * après un appel raté, ce qu’un refus veut dire) sont des fonctions pures, testées à part (tests/client/lecture-suivi.test.ts).
 */

/** Où en est la lecture avant le premier suivi : rien de lu. */
const DEPART: AnalysisProgress = { progress: 0, messagesRead: 0, stepsDone: 0, discoveries: [], done: false };

/** L’avancée se relit chaque seconde. */
const INTERVALLE_SUIVI = 1000;

/** Le suivi tient bon : un appel raté (l’iPhone a mis la page en veille, le réseau a sauté) se refait, de plus en plus espacé. Au-delà, l’échec. */
export const RATES_MAX = 8;

/** L’attente avant de relire, après `rates` appels ratés de suite : 1, 2, 4 puis 8 s au plus. */
export const attenteApresRates = (rates: number) => Math.min(8000, 1000 * 2 ** (rates - 1));

/** Ce que fait le suivi après un appel raté : se reconnecter, l’échec (avec « Relancer »), ou relire un peu plus tard. */
type ApresUnRate = { faire: "connexion" } | { faire: "echec" } | { faire: "relire"; dans: number };

/**
 * Après `rates` appels ratés de suite, le dernier avec ce code d’erreur. Plus de session (expirée, ou ouverte ailleurs) :
 * on se reconnecte, la lecture reprend ensuite. La conv a disparu, ou le serveur ne répond plus depuis un moment : l’échec.
 */
export function apresUnRate(code: CodeApi | null, rates: number): ApresUnRate {
  if (code === "connexion") return { faire: "connexion" };
  if (code === "aucune" || rates >= RATES_MAX) return { faire: "echec" };
  return { faire: "relire", dans: attenteApresRates(rates) };
}

/**
 * Ce qu’un refus du lancement (POST /api/analyse) veut dire pour l’écran : « Qui es-tu ? » pas rempli, plus de session,
 * trop de relances aujourd’hui. null : une autre erreur, l’écran d’échec avec « Relancer ».
 */
export function refusDuLancement(code: CodeApi | null): "qui" | "connexion" | "trop" | null {
  return code === "qui" || code === "connexion" || code === "trop" ? code : null;
}

/** reading : la bulle écrit, l’anneau se remplit · leaving : l’anneau s’efface · done : la gerbe marque la fin. */
type Phase = "reading" | "leaving" | "done";

/**
 * Lance la lecture en arrivant, puis la suit (voir l’en-tête). `p` : où elle en est. `echec` : le serveur a tout essayé
 * (ou ne répond plus) ; `trop` : trop de relances aujourd’hui (chaque lecture coûte). `enDirect` : vrai dès qu’on voit la
 * lecture se faire (une lecture déjà finie à l’arrivée ne rejoue pas ses sons). `relancer` : « Relancer la lecture ».
 */
export function useSuiviLecture() {
  const router = useRouter();
  const [p, setP] = useState<AnalysisProgress>(DEPART);
  const [phase, setPhase] = useState<Phase>("reading");
  const [echec, setEchec] = useState(false);
  const [trop, setTrop] = useState(false);
  /* Le lancement : 0 à l’arrivée, puis un de plus à chaque « Relancer » */
  const [lancement, setLancement] = useState(0);
  /* Le lancement que l’on suit (null : pas encore lancé, ou relancé depuis) */
  const [suivi, setSuivi] = useState<number | null>(null);
  /* La fin vue en direct : l’anneau plein et la coche, puis la gerbe (sinon, la fin s’affiche directement) */
  const [finAnimee, setFinAnimee] = useState(false);
  const enDirect = useRef(false);
  const rates = useRef(0);
  const premier = useRef(true);
  /* Le suivi en cours, null une fois démonté ou relancé : une réponse arrivée après ne touche plus à rien (ni à l’écran, ni à la navigation) */
  const enCours = useRef<number | null>(null);

  /* Le routeur n’est lu qu’au moment de partir : le lancement ne se rejoue pas pour lui */
  const remplacer = useEffectEvent((url: Route) => router.replace(url));

  const relancer = () => {
    setEchec(false);
    setTrop(false);
    setP(DEPART);
    setSuivi(null);
    setLancement((l) => l + 1);
  };

  useEffect(() => {
    let vivant = true;
    void (async () => {
      /* Lancée juste avant d’arriver (« Qui es-tu ? », le code) : pas de second POST, on suit tout de suite */
      const deja = lancement === 0 && lectureLancee();
      /*
       * En arrivant (un rechargement, un onglet rouvert), on lit d’abord où en est la lecture. Arrêtée par le budget de
       * l’IA du jour (« souffle ») : pas de POST, qui userait une relance du jour et planifierait une lecture arrêtée
       * aussitôt ; ce suivi suffit à la reprendre après minuit (GET /api/analyse). Sinon, le POST la lance ou la relance,
       * comme avant
       */
      const avant =
        lancement === 0 && !deja
          ? await getAnalysisProgress().catch((e) => {
              /* Rien lu : le POST lance ou relance la lecture, comme avant */
              tracer("lecture:avancee", e);
              return null;
            })
          : null;
      if (!vivant) return;
      const rienARelancer = !!avant?.failed && avant.failReason === "souffle";
      /* Un refus du serveur : l’écran d’échec, avec « Relancer », plutôt qu’un anneau qui ne bouge plus */
      const lance =
        deja ||
        rienARelancer ||
        (await resumeAnalysis().then(
          () => true,
          (e: unknown) => refusDuLancement(codeDe(e)),
        ));
      if (!vivant) return;
      if (lance === "trop") {
        setTrop(true);
        setEchec(true);
        return;
      }
      /* Plus de session (expirée, ou ouverte ailleurs) : on se reconnecte, la lecture reprend ensuite */
      if (lance === "connexion") {
        remplacer(connexionPuis("/lecture"));
        return;
      }
      /* La conv ouverte n’est pas passée par « Qui es-tu ? » (la page le vérifie déjà avant) : rien à relancer, c’est là qu’on va */
      if (lance === "qui") {
        remplacer("/qui");
        return;
      }
      if (!lance) {
        setEchec(true);
        return;
      }
      rates.current = 0;
      premier.current = true;
      setSuivi(lancement);
    })();
    return () => {
      vivant = false;
    };
    /* Lancé à l’arrivée sur l’écran, puis à chaque « Relancer » */
  }, [lancement]);

  useEffect(() => {
    if (suivi === null) return;
    enCours.current = suivi;
    return () => {
      enCours.current = null;
    };
  }, [suivi]);

  /* Un tour du suivi : il relit l’avancée, et décide du suivant (useSondage) */
  const tour = async (): Promise<SuiteDuSondage> => {
    const pour = enCours.current;
    if (pour === null) return false;
    let suite: AnalysisProgress;
    try {
      suite = await getAnalysisProgress();
    } catch (e) {
      if (enCours.current !== pour) return false;
      rates.current += 1;
      const apres = apresUnRate(codeDe(e), rates.current);
      if (apres.faire === "connexion") router.replace(connexionPuis("/lecture"));
      if (apres.faire === "echec") setEchec(true);
      return apres.faire === "relire" ? apres.dans : false;
    }
    if (enCours.current !== pour) return false;
    rates.current = 0;
    setP(suite);
    const finieALArrivee = premier.current;
    premier.current = false;
    if (suite.failed) {
      setEchec(true);
      return false;
    }
    if (!suite.done) {
      enDirect.current = true;
      return;
    }
    /* Lecture déjà finie à l’arrivée, ou mouvement réduit : la fin s’affiche directement. */
    if (finieALArrivee || window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPhase("done");
    else setFinAnimee(true);
    return false;
  };
  useSondage(tour, { actif: suivi !== null && suivi === lancement, intervalle: INTERVALLE_SUIVI, immediat: true });

  /* Vue en direct, la fin laisse voir l’anneau plein et la coche « Ton verdict », puis la gerbe arrive. */
  useEffect(() => {
    if (!finAnimee) return;
    let ensuite: ReturnType<typeof setTimeout> | undefined;
    const minuteur = setTimeout(() => {
      setPhase("leaving");
      ensuite = setTimeout(() => setPhase("done"), 280);
    }, 700);
    return () => {
      clearTimeout(minuteur);
      clearTimeout(ensuite);
    };
  }, [finAnimee]);

  return { p, phase, echec, trop, enDirect, relancer };
}
