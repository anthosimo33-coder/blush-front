import type { Route } from "next";
import type { Vue } from "./a-decider";
import type { BaseDeLAdmin } from "./EnTete";

/*
 * Les adresses d’/admin : le résumé à sa racine, chaque autre rubrique du pilotage par `?vue=`, le direct et le tournage
 * sur leur page. Pure (tests/unit/admin-adresses.test.ts).
 */

/** Où l’on est dans /admin : une rubrique du pilotage, le direct, ou le tournage. */
export type Ici = Vue | "direct" | "tournage";

/**
 * L’adresse d’une rubrique, la période gardée (`periode` : « p=30 », « du=…&au=… », ou rien pour les 7 jours d’office),
 * avec une ancre s’il en faut une. Le mode tournage n’a pas d’aperçu : il lit les convs du compte de l’équipe.
 */
export function adresseDe(base: BaseDeLAdmin, ici: Ici, periode = "", ancre = ""): Route {
  if (ici === "tournage") return "/admin/tournage";
  if (ici === "direct") return `${base}/direct`;
  const suite = [ici === "resume" ? "" : `vue=${ici}`, periode].filter(Boolean).join("&");
  return `${base}${suite ? `?${suite}` : ""}${ancre ? `#${ancre}` : ""}` as Route;
}
