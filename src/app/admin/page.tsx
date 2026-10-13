import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { direct } from "@/server/direct";
import { estAdmin } from "@/server/env";
import { journalErreur } from "@/server/journal";
import { contexte } from "@/server/requete";
import { statsAdmin, type Periode } from "@/server/stats";
import { AdminScreen } from "./AdminScreen";
import { Pilotage } from "./Pilotage";

export const metadata: Metadata = { title: "Admin" };

/**
 * Le tableau de bord, réservé aux emails de BLUSH_ADMINS. Pour tous les autres, la page n’existe pas. Le pilotage
 * (`?p=1|7|30`, 7 jours d’office) ; `?version=actuelle` : l’écran d’avant, gardé jusqu’à la décision.
 */
export default async function Page({ searchParams }: PageProps<"/admin">) {
  const { utilisateur } = await contexte();
  if (!utilisateur || !estAdmin(utilisateur.email)) notFound();
  const q = await searchParams;
  const p = Number(q.p);
  const jours: Periode = p === 1 || p === 30 ? p : 7;
  if (q.version === "actuelle") return <AdminScreen s={await statsAdmin(jours)} />;
  /* Le direct n’empêche jamais le pilotage : lu ici pour le premier rendu, il se relit seul dans la page en cas d’échec */
  const [s, d] = await Promise.all([
    statsAdmin(jours),
    direct().catch((e: unknown) => {
      journalErreur("admin:direct", e);
      return null;
    }),
  ]);
  return <Pilotage s={s} direct={d} />;
}
