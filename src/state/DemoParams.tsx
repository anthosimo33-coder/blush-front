"use client";

/**
 * États de démo par paramètre d’URL :
 *   ?verdict=difficile        → mode sobre à la place du rapport
 *   ?erreur=fichier|groupe|courte|lecture|capture → écran d’erreur
 *   ?plan=gratuit|rapport|blushplus → droits d’accès
 *   ?histoire=couple|rencontre → l’histoire en couple, ou celle des maquettes
 *   ?convs=plusieurs|une      → le compte a trois convs (Sophie, Inès, Camille), ou une seule
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { readStoryCookie, writeStoryCookie } from "@/services/session";
import { readJourney, setJourney } from "@/state/journey";
import { invalidate } from "@/lib/query";
import type { DemoError, Plan } from "@/types";
import { ErrorScreen } from "@/components/screens/ErrorScreen";
import { BACKEND } from "@/services/mode";

const PLANS: Plan[] = ["gratuit", "rapport", "blushplus"];
const ERRORS: DemoError[] = ["fichier", "groupe", "courte", "lecture", "capture", "video", "longue"];

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function DemoParams() {
  const params = useSearchParams();
  const router = useRouter();
  const plan = params.get("plan");
  const verdict = params.get("verdict");
  const erreur = params.get("erreur");
  const histoire = params.get("histoire");
  const convs = params.get("convs");

  useIsoLayoutEffect(() => {
    /* Avec le vrai back-end, ces paramètres de démo ne touchent à rien (un lien ?histoire=couple changeait la conv ouverte). `?erreur=` reste : le vrai parcours s’en sert */
    if (BACKEND) return;
    const couple = histoire === "couple" || histoire === "rencontre";
    if (!plan && !verdict && !couple && !convs) return;
    /* Les mocks n’arrivent qu’ici, à la demande : ils ne pèsent sur aucune page du vrai site (ni de la démo sans paramètre) */
    let fini = false;
    void Promise.all([import("@/mocks/server"), convs ? import("@/mocks/convs") : null, couple ? import("@/mocks/stories") : null]).then(([{ mockServer }, mConvs, mStories]) => {
      if (fini) return;
      let changed = false;
      if (plan && PLANS.includes(plan as Plan)) {
        mockServer.set({ plan: plan as Plan });
        changed = true;
      }
      if (verdict) {
        mockServer.set({ verdict: verdict === "difficile" ? "difficile" : "normal" });
        changed = true;
      }
      /* Une autre histoire : les pages serveur la relisent (cookie), les données en cache aussi */
      const storyId = mStories && (histoire === "couple" || histoire === "rencontre") ? mStories.DEMO_STORY_IDS[histoire] : null;
      if (storyId) {
        /* Le parcours suit : « En couple » choisi pour l’histoire en couple, décoché sinon */
        const enCouple = histoire === "couple";
        if (enCouple !== (readJourney().guess === "ensemble")) setJourney(enCouple ? { guess: "ensemble", goal: "mieux" } : { guess: null, goal: null });
        if (readStoryCookie() !== storyId) {
          writeStoryCookie(storyId);
          invalidate("report", "account", "fiche", "question");
          router.refresh();
        }
      }
      /* Les pages serveur lisent déjà le paramètre ; le cookie le garde pour les pages suivantes */
      if (mConvs && convs === "plusieurs") document.cookie = `${mConvs.CONVS_COOKIE}=plusieurs; path=/; samesite=lax`;
      if (mConvs && convs === "une") document.cookie = `${mConvs.CONVS_COOKIE}=; path=/; max-age=0; samesite=lax`;
      if (changed) invalidate("report", "account");
    });
    return () => {
      fini = true;
    };
  }, [plan, verdict, histoire, convs, router]);

  const error = erreur && ERRORS.includes(erreur as DemoError) ? (erreur as DemoError) : null;

  useEffect(() => {
    const root = document.getElementById("app-root");
    if (!root) return;
    root.inert = !!error;
    return () => {
      root.inert = false;
    };
  }, [error]);

  return error ? <ErrorScreen kind={error} /> : null;
}
