"use client";

/**
 * États de démo par paramètre d’URL :
 *   ?verdict=difficile        → mode sobre à la place du rapport
 *   ?erreur=fichier|groupe|courte|lecture|capture → écran d’erreur
 *   ?plan=gratuit|rapport|crushplus → droits d’accès
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { mockServer } from "@/mocks/server";
import { invalidate } from "@/lib/query";
import type { DemoError, Plan } from "@/types";
import { ErrorScreen } from "@/components/screens/ErrorScreen";

const PLANS: Plan[] = ["gratuit", "rapport", "crushplus"];
const ERRORS: DemoError[] = ["fichier", "groupe", "courte", "lecture", "capture"];

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function DemoParams() {
  const params = useSearchParams();
  const plan = params.get("plan");
  const verdict = params.get("verdict");
  const erreur = params.get("erreur");

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
    if (changed) invalidate("report", "account");
  }, [plan, verdict]);

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
