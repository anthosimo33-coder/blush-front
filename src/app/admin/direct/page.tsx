import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { direct } from "@/server/direct";
import { estAdmin } from "@/server/env";
import { contexte } from "@/server/requete";
import { PageEnDirect } from "../PageEnDirect";

export const metadata: Metadata = { title: "En direct · Admin" };

/** /admin en direct, réservé aux emails de BLUSH_ADMINS comme le tableau de bord : pour tous les autres, la page n’existe pas. */
export default async function Page() {
  const { utilisateur } = await contexte();
  if (!utilisateur || !estAdmin(utilisateur.email)) notFound();
  return <PageEnDirect d={await direct()} />;
}
