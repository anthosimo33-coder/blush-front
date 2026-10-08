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
import { mockServer } from "@/mocks/server";
import { CONVS_COOKIE } from "@/mocks/convs";
import { DEMO_STORY_IDS } from "@/mocks/stories";
import { readStoryCookie, writeStoryCookie } from "@/services/session";
import { readJourney, setJourney } from "@/state/journey";
import { invalidate } from "@/lib/query";
import type { DemoError, Plan } from "@/types";
import { ErrorScreen } from "@/components/screens/ErrorScreen";

const PLANS: Plan[] = ["gratuit", "rapport", "blushplus"];
const ERRORS: DemoError[] = ["fichier", "groupe", "courte", "lecture", "capture"];

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
    const storyId = histoire === "couple" || histoire === "rencontre" ? DEMO_STORY_IDS[histoire] : null;
    if (storyId) {
      /* Le parcours suit : « En couple » choisi pour l’histoire en couple, décoché sinon */
      const couple = histoire === "couple";
      if (couple !== (readJourney().guess === "ensemble")) setJourney(couple ? { guess: "ensemble", goal: "mieux" } : { guess: null, goal: null });
      if (readStoryCookie() !== storyId) {
        writeStoryCookie(storyId);
        invalidate("report", "account", "fiche", "question");
        router.refresh();
      }
    }
    /* Les pages serveur lisent déjà le paramètre ; le cookie le garde pour les pages suivantes */
    if (convs === "plusieurs") document.cookie = `${CONVS_COOKIE}=plusieurs; path=/; samesite=lax`;
    if (convs === "une") document.cookie = `${CONVS_COOKIE}=; path=/; max-age=0; samesite=lax`;
    if (changed) invalidate("report", "account");
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
