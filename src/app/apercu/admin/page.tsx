import type { Metadata } from "next";
import type { Periode } from "@/server/stats";
import { AdminScreen } from "@/app/admin/AdminScreen";
import { Pilotage } from "@/app/admin/Pilotage";
import { avecPeuDeVentes, delivrabiliteDExemple, directDExemple, navigateursDExemple, statsDExemple } from "./exemple";

export const metadata: Metadata = { title: "Admin" };

/**
 * Hors de Vercel seulement (src/proxy.ts) : le pilotage avec des chiffres d’exemple (`?p=1|7|30` ; `&calme=1` : sans
 * souci de santé ; `&suivi=0` : avant que les visites se comptent ; `&ventes=1` ou `2` : trop peu de ventes pour lire la
 * marge ; `?version=actuelle` : l’écran d’avant). Le direct y
 * reste figé : rien ne sonde le réseau.
 */
export default async function Page({ searchParams }: PageProps<"/apercu/admin">) {
  const q = await searchParams;
  const p = Number(q.p);
  const jours: Periode = p === 1 || p === 30 ? p : 7;
  const s = avecPeuDeVentes(statsDExemple(jours, { calme: q.calme === "1", suivi: q.suivi !== "0" }), Number(q.ventes));
  if (q.version === "actuelle") return <AdminScreen s={s} base="/apercu/admin" />;
  const calme = q.calme === "1";
  return (
    <Pilotage s={s} direct={directDExemple()} navigateurs={navigateursDExemple({ calme })} delivrabilite={delivrabiliteDExemple({ calme })} base="/apercu/admin" sonder={false} />
  );
}
