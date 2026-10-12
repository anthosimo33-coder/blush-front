import type { Account } from "@/types/api";

/*
 * Ce que le compte ouvre, côté écran (la coque des écrans, AppScreen) : depuis le paiement à l’unité, plus de plan. Le
 * rapport s’ouvre conv par conv (ReportPayload.debloque) ; le chat, à tout compte connecté (ses réponses se paient en
 * bulles) ; sa fiche, à un client. Le serveur tient les mêmes droits (src/server/droits.ts) : il refuse la lecture, la
 * correction et l’ajout à la fiche (GET, PUT et POST /api/fiche) à qui n’est pas client (402 « acces », S-26 de l’audit).
 */

/** Ce que chaque besoin d’un écran demande au compte : sa fiche, un client (un rapport débloqué, un achat payé, ou l’équipe). */
const REQUIS = {
  fiche: (compte: Pick<Account, "client">) => compte.client,
};

export type Besoin = keyof typeof REQUIS;

/** Le compte ouvre-t-il ce besoin ? */
export const peut = (compte: Pick<Account, "client">, besoin: Besoin) => REQUIS[besoin](compte);
