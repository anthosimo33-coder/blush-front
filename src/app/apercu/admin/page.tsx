import type { Metadata, Route } from "next";
import Link from "next/link";
import type { Changement } from "@/contenu/changements";
import { cn } from "@/lib/cn";
import { repereDe } from "@/lib/jours";
import type { Periode, StatsAdmin } from "@/server/stats";
import { AdminScreen } from "@/app/admin/AdminScreen";
import { periodeGardee } from "@/app/admin/dates";
import { Pilotage } from "@/app/admin/Pilotage";
import { PilotagePropre, vueDe } from "@/app/admin/PilotagePropre";
import { PREMIER_JOUR_D_EXEMPLE, avecPeuDeVentes, delivrabiliteDExemple, directDExemple, navigateursDExemple, plageDExemple, statsDExemple } from "./exemple";

export const metadata: Metadata = { title: "Admin" };

/** Des changements du produit d’exemple, dans la semaine d’exemple (le jour figé des chiffres d’exemple : le 13 octobre 2026). */
const CHANGEMENTS_D_EXEMPLE: readonly Changement[] = [
  { le: "2026-10-09", quoi: "Paywall\u00a0: le titre tiré des chiffres de la conv, pour tout le monde" },
  { le: "2026-10-11", quoi: "Prix\u00a0: le rapport passe à 9,90\u00a0€" },
];

/**
 * Les chiffres d’exemple avec un canal qui amène du monde sans vendre (Facebook) et un trafic qui a doublé : ce que le
 * résumé du pilotage rangé sait dire, et que la semaine d’exemple ne montre pas d’elle-même.
 */
function avecUnCanalSansVente(s: StatsAdmin): StatsAdmin {
  const p = s.pilotage;
  const enPlus = Math.round(p.visiteurs.valeur * 0.45);
  const facebook = {
    source: "facebook" as const,
    visiteurs: enPlus,
    importent: Math.round(enPlus * 0.05),
    comptes: Math.round(enPlus * 0.03),
    paywall: Math.round(enPlus * 0.03),
    acheteurs: 0,
    centimes: 0,
  };
  return {
    ...s,
    pilotage: {
      ...p,
      visiteurs: { valeur: p.visiteurs.valeur + enPlus, avant: Math.round(p.visiteurs.avant * 0.6) },
      tunnel: { ...p.tunnel, visiteurs: p.tunnel.visiteurs + enPlus, imports: p.tunnel.imports + facebook.importent, paywall: p.tunnel.paywall + facebook.paywall },
      sources: [...p.sources.filter((x) => x.source !== "facebook"), facebook].sort((a, b) => b.centimes - a.centimes),
    },
  };
}

/**
 * Hors de Vercel seulement (src/proxy.ts) : le pilotage rangé avec des chiffres d’exemple, le résumé ou une rubrique
 * (`?vue=acquisition|tunnel|ventes|couts|sante|outils`) ; `?p=1|7|30` ; `&calme=1` : sans souci de santé ; `&suivi=0` :
 * avant que les visites se comptent ; `&ventes=1` ou `2` : trop peu de ventes pour lire la marge ; `?du=&au=` : une
 * période choisie au calendrier, parmi les jours de l’exemple (du 31 juillet au 13 octobre 2026). `?version=pilotage` :
 * le pilotage d’avant, sur une seule page ; `?version=actuelle` : l’écran d’encore avant. Le direct y reste figé : rien
 * ne sonde le réseau. En bas, la bascule Avant / Après, qui garde la période.
 */
export default async function Page({ searchParams }: PageProps<"/apercu/admin">) {
  const q = await searchParams;
  const p = Number(q.p);
  const plage = plageDExemple(q.du, q.au);
  const jours: Periode = plage ? repereDe(plage) : p === 1 || p === 30 ? p : 7;
  const s = avecPeuDeVentes(statsDExemple(jours, { calme: q.calme === "1", suivi: q.suivi !== "0" }, plage ?? undefined), Number(q.ventes));
  if (q.version === "actuelle") return <AdminScreen s={s} base="/apercu/admin" />;
  const calme = q.calme === "1";
  const ancien = q.version === "pilotage";
  const periode = periodeGardee(s);
  const commun = {
    s: avecUnCanalSansVente(s),
    direct: directDExemple(),
    navigateurs: navigateursDExemple({ calme }),
    delivrabilite: delivrabiliteDExemple({ calme }),
    base: "/apercu/admin",
    sonder: false,
    premierJour: PREMIER_JOUR_D_EXEMPLE,
  } as const;
  return (
    <>
      {ancien ? <Pilotage {...commun} garde="version=pilotage" /> : <PilotagePropre {...commun} vue={vueDe(q.vue)} changements={CHANGEMENTS_D_EXEMPLE} />}
      {/* La bascule de l’aperçu : le pilotage d’avant, ou le pilotage rangé */}
      <nav
        aria-label="Avant ou après"
        className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-4 z-10 flex rounded-full bg-ink p-1 shadow-[0_18px_40px_-16px_rgba(17,17,20,0.6)] md:bottom-5"
      >
        {(
          [
            ["Avant", `/apercu/admin?version=pilotage${periode && `&${periode}`}` as Route, ancien],
            ["Après", `/apercu/admin${periode && `?${periode}`}` as Route, !ancien],
          ] as const
        ).map(([nom, lien, ici]) => (
          <Link
            key={nom}
            href={lien}
            aria-current={ici ? "page" : undefined}
            className={cn("flex min-h-9 items-center rounded-full px-4 text-note font-black no-underline", ici ? "bg-white text-ink" : "text-white/75 hover:text-white")}
          >
            {nom}
          </Link>
        ))}
      </nav>
    </>
  );
}
