import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { contexteRequete } from "@/server/donnees";
import { estAdmin } from "@/server/env";
import { statsAdmin, type Periode } from "@/server/stats";
import { AdminScreen } from "./AdminScreen";

export const metadata: Metadata = { title: "Admin" };

/** Le tableau de bord, réservé aux emails de BLUSH_ADMINS. Pour tous les autres, la page n’existe pas. */
export default async function Page({ searchParams }: PageProps<"/admin">) {
  const { utilisateur } = await contexteRequete();
  if (!utilisateur || !estAdmin(utilisateur.email)) notFound();
  const p = Number((await searchParams).p);
  const jours: Periode = p === 1 || p === 30 ? p : 7;
  return <AdminScreen s={await statsAdmin(jours)} />;
}
