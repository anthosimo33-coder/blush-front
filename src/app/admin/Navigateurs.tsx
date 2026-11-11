import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import type { SanteDesNavigateurs } from "@/server/navigateur";
import type { FamilleNavigateur, MetriqueWeb } from "@/types";
import { Bloc } from "./morceaux";

/*
 * Ce qui se passe chez les visiteurs (src/server/navigateur.ts, envoyé par src/lib/sentinelle.tsx) : la vitesse de
 * chaque écran, au 75e centile (ce que vit le visiteur lent : la mesure de Google), sur téléphone et sur ordinateur, les
 * erreurs de l’appli dans les navigateurs, les plus fréquentes d’abord, et les touchers lents (ce qui a été touché, où).
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

/** Où passe le temps d’un toucher lent, dit pour l’équipe : la plus grosse des trois parts. */
const PARTS = {
  attente: "le téléphone était déjà occupé",
  traitement: "notre code au toucher",
  affichage: "le dessin de l’écran après",
} as const;

const enMs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")}\u00a0s` : `${Math.round(v)}\u00a0ms`);

function Valeur({ v, seuils, unite }: { v: number | undefined; seuils: [number, number]; unite: "ms" | "" }) {
  if (v === undefined) return <span className="text-soft">—</span>;
  const ton = v <= seuils[0] ? "text-vrai-ink" : v <= seuils[1] ? "text-attente-ink" : "text-danger";
  const texte = unite === "ms" ? enMs(v) : v.toFixed(2).replace(".", ",");
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
      <div className="mt-6 min-w-0">
        <h3 className="m-0 mb-1 text-note font-black">
          Touchers lents <span className="text-grey">· 200{NBSP}ms ou plus, le pire de chaque page</span>
        </h3>
        <p className="m-0 mb-2 text-micro font-extrabold text-grey">
          Ce qui a été touché, sur quel écran, et où le temps passe en moyenne{NBSP}: l’attente (le téléphone occupé avant notre code), notre code, le dessin de l’écran.
        </p>
        {n.touchersLents.length === 0 ? (
          <p className="m-0 text-detail font-bold text-vrai-ink">Aucun sur la période.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {n.touchersLents.map((t, k) => {
              const pire = (["attente", "traitement", "affichage"] as const).reduce((a, b) => (t[b] > t[a] ? b : a));
              return (
                <li key={k} className="flex flex-col gap-0.5 border-t border-sep py-2.5">
                  <span className="flex justify-between gap-3 text-detail">
                    <span className="min-w-0 break-words font-black">
                      {t.etape} <span className="font-bold">· {t.cible ?? "un élément parti de la page"}</span>
                    </span>
                    <span className="shrink-0 font-black tabular-nums">
                      <Valeur v={t.p75} seuils={[200, 500]} unite="ms" /> <span className="text-attente-ink">×{t.fois}</span>
                    </span>
                  </span>
                  <span className="text-micro font-extrabold text-grey">
                    Surtout {PARTS[pire]} · attente {enMs(t.attente)}, code {enMs(t.traitement)}, dessin {enMs(t.affichage)} · {FAMILLES[t.famille]}
                    {t.script && <span className="break-all font-mono"> · {t.script}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Bloc>
  );
}
