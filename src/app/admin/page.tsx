import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LANCEMENT_LE } from "@/contenu/pilotage";
import { jourDeParis, plageLue } from "@/lib/jours";
import { delivrabilite } from "@/server/delivrabilite";
import { direct } from "@/server/direct";
import { estAdmin } from "@/server/env";
import { ErreurInvariant } from "@/server/erreurs";
import { journalErreur } from "@/server/journal";
import { santeDesNavigateurs } from "@/server/navigateur";
import { contexte } from "@/server/requete";
import { statsAdmin, type Periode, type PeriodeDemandee } from "@/server/stats";
import { AdminScreen } from "./AdminScreen";
import { Pilotage } from "./Pilotage";

export const metadata: Metadata = { title: "Admin" };

/**
 * Les chiffres du tableau de bord, sans rien dans les logs qu’un nom et un code s’ils échouent (un délai, la base
 * coupée) : l’erreur d’une page remonte jusqu’à Next, qui l’écrit entière, et celle de Drizzle cite sa requête et ses
 * paramètres. Le journal en garde le nom et le code (journalErreur) ; la page d’erreur reçoit une ErreurInvariant nue.
 */
async function chiffres(periode: PeriodeDemandee) {
  try {
    return await statsAdmin(periode);
  } catch (e) {
    journalErreur("admin:stats", e);
    throw new ErreurInvariant("admin:stats");
  }
}

/**
 * Le tableau de bord, réservé aux emails de BLUSH_ADMINS. Pour tous les autres, la page n’existe pas. Le pilotage
 * (`?p=1|7|30`, 7 jours d’office ; ou `?du=&au=`, des jours de Paris choisis au calendrier, du lancement à aujourd’hui :
 * une période mal écrite ou hors de ces bornes laisse les 7 jours) ; `?version=actuelle` : l’écran d’avant, gardé
 * jusqu’à la décision (il ne connaît que les trois périodes d’office).
 */
export default async function Page({ searchParams }: PageProps<"/admin">) {
  const { utilisateur } = await contexte();
  if (!utilisateur || !estAdmin(utilisateur.email)) notFound();
  const q = await searchParams;
  const p = Number(q.p);
  const jours: Periode = p === 1 || p === 30 ? p : 7;
  if (q.version === "actuelle") return <AdminScreen s={await chiffres(jours)} />;
  const periode = plageLue(q.du, q.au, { premier: LANCEMENT_LE, dernier: jourDeParis() }) ?? jours;
  /* Le direct n’empêche jamais le pilotage : lu ici pour le premier rendu, il se relit seul dans la page en cas d’échec */
  const [s, d, n, m] = await Promise.all([
    chiffres(periode),
    direct().catch((e: unknown) => {
      journalErreur("admin:direct", e);
      return null;
    }),
    /* Les navigateurs non plus : sans eux, le pilotage s’affiche sans leur bloc */
    santeDesNavigateurs(periode).catch((e: unknown) => {
      journalErreur("admin:navigateurs", e);
      return null;
    }),
    /* Ni la délivrabilité des mails (toujours sur 7 jours : la fenêtre de ses seuils) */
    delivrabilite(7).catch((e: unknown) => {
      journalErreur("admin:delivrabilite", e);
      return null;
    }),
  ]);
  return <Pilotage s={s} direct={d} navigateurs={n} delivrabilite={m} />;
}
