import { randomBytes } from "node:crypto";
import type { TestInfo } from "@playwright/test";
import { DOMAINE, INVITES } from "../reglages";
import { oublierEmail } from "./base";

/**
 * Un email neuf, jamais vu par le serveur : son compte paiera (il n’est pas dans BLUSH_ACCES_LIBRE : le chapitre 1 seul, 0 bulle). `prefixe` aide
 * à s’y retrouver dans les traces et la boîte à mails.
 */
export function emailLibre(testInfo: TestInfo, prefixe = "libre"): string {
  return `${prefixe}-${testInfo.parallelIndex}-${Date.now().toString(36)}${randomBytes(3).toString("hex")}@${DOMAINE}`;
}

/**
 * Un invité (BLUSH_ACCES_LIBRE : de l’équipe, tout ouvert, et seul à entrer en bêta fermée), effacé d’abord de la base
 * et de la boîte à mails : le test part d’un email jamais vu, et tous les mails qu’il lira ensuite viennent de lui. Deux par worker
 * (`k` : 0 ou 1) ; un worker ne fait qu’un test à la fois, donc deux tests en même temps n’ont jamais le même. À prendre
 * au début du test, avant le moindre geste.
 */
export async function nouvelInvite(testInfo: TestInfo, k: 0 | 1 = 0): Promise<string> {
  const email = `invite-${testInfo.parallelIndex}-${k}@${DOMAINE}`;
  if (!INVITES.includes(email)) throw new Error(`pas d’invité pour le worker ${testInfo.parallelIndex} : agrandis WORKERS_MAX (tests/e2e/reglages.ts)`);
  await oublierEmail(email);
  return email;
}
