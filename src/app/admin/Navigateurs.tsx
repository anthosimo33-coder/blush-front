import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import type { SanteDesNavigateurs } from "@/server/navigateur";
import type { FamilleNavigateur, MetriqueWeb } from "@/types";
import { Bloc } from "./morceaux";

/*
 * Ce qui se passe chez les visiteurs (src/server/navigateur.ts, envoyé par src/lib/sentinelle.tsx) : la vitesse de
 * chaque écran, au 75e centile (ce que vit le visiteur lent : la mesure de Google), sur téléphone et sur ordinateur, et
 * les erreurs de l’appli dans les navigateurs, les plus fréquentes d’abord.
 */

/** Les mesures montrées, leur nom pour l’équipe, et les seuils de Google : bon jusqu’au premier, mauvais au-delà du second. */
const MESURES: { m: MetriqueWeb; nom: string; seuils: [number, number]; unite: "ms" | "" }[] = [
  { m: "LCP", nom: "Affichage", seuils: [2500, 4000], unite: "ms" },
  { m: "INP", nom: "Réponse au toucher", seuils: [200, 500], unite: "ms" },
  { m: "CLS", nom: "Sauts de page", seuils: [0.1, 0.25], unite: "" },
  { m: "TTFB", nom: "Serveur", seuils: [800, 1800], unite: "ms" },
];

const FAMILLES: Record<FamilleNavigateur, string> = {
  iphone: "iPhone",
  "iphone-appli": "iPhone (dans une appli)",
  android: "Android",
  "android-appli": "Android (dans une appli)",
  ordinateur: "ordinateur",
  autre: "autre",
};

function Valeur({ v, seuils, unite }: { v: number | undefined; seuils: [number, number]; unite: "ms" | "" }) {
  if (v === undefined) return <span className="text-soft">—</span>;
  const ton = v <= seuils[0] ? "text-vrai-ink" : v <= seuils[1] ? "text-attente-ink" : "text-danger";
  const texte = unite === "ms" ? (v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")}\u00a0s` : `${Math.round(v)}\u00a0ms`) : v.toFixed(2).replace(".", ",");
  return <span className={cn("font-black tabular-nums", ton)}>{texte}</span>;
}

/** Le bloc « Navigateurs » du pilotage. */
export function Navigateurs({ n }: { n: SanteDesNavigateurs }) {
  return (
    <Bloc id="navigateurs" titre="Navigateurs" sous="La vitesse ressentie et les erreurs, chez les visiteurs">
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="m-0 mb-2 text-note font-black">Vitesse par écran (75e centile)</h3>
          {n.vitesse.length === 0 ? (
            <p className="m-0 text-detail font-bold text-grey">Pas encore assez de pages mesurées (5 par écran).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-detail">
                <thead>
                  <tr className="text-micro font-extrabold text-grey">
                    <th className="py-1.5 pr-3 font-extrabold">Écran</th>
                    {MESURES.map((x) => (
                      <th key={x.m} className="py-1.5 pr-3 font-extrabold">
                        {x.nom}
                      </th>
                    ))}
                    <th className="py-1.5 font-extrabold">Pages</th>
                  </tr>
                </thead>
                <tbody>
                  {n.vitesse.map((e) => (
                    <tr key={`${e.etape}-${e.mobile}`} className="border-t border-sep">
                      <td className="py-2 pr-3 font-extrabold">
                        {e.etape} <span className="text-grey">· {e.mobile ? "téléphone" : "ordinateur"}</span>
                      </td>
                      {MESURES.map((x) => (
                        <td key={x.m} className="py-2 pr-3">
                          <Valeur v={e[x.m]} seuils={x.seuils} unite={x.unite} />
                        </td>
                      ))}
                      <td className="py-2 tabular-nums text-soft">{e.pages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="m-0 mb-2 text-note font-black">
            Erreurs dans les navigateurs <span className="text-grey">· {n.totalErreurs} sur la période</span>
          </h3>
          {n.erreurs.length === 0 ? (
            <p className="m-0 text-detail font-bold text-vrai-ink">Aucune.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {n.erreurs.map((e, k) => (
                <li key={k} className="flex flex-col gap-0.5 border-t border-sep py-2.5">
                  <span className="flex justify-between gap-3 text-detail">
                    <span className="min-w-0 break-words font-black">
                      {e.nom}
                      {NBSP}: <span className="font-bold">{e.message}</span>
                    </span>
                    <span className="shrink-0 font-black tabular-nums text-attente-ink">×{e.fois}</span>
                  </span>
                  <span className="text-micro font-extrabold text-grey">
                    {e.etape} · {FAMILLES[e.famille]}
                    {e.source && <span className="break-all font-mono"> · {e.source}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Bloc>
  );
}
