"use client";

import Link from "next/link";
import { NOMS_DES_ETAPES } from "@/contenu/pilotage";
import { cn } from "@/lib/cn";
import type { GenreFil } from "@/types";
import { etapesPeuplees, ilYa, nombre, texteDuGeste } from "./calculs";
import type { BaseDeLAdmin } from "./EnTete";
import { Barre, Bloc, Pouls } from "./morceaux";
import { secondesDepuis, useDirect } from "./SondeDuDirect";

/*
 * La carte noire « En direct » du pilotage : combien de personnes sont sur le site, les écrans où elles sont, et les
 * trois derniers gestes du fil. Elle suit la sonde (SondeDuDirect) ; la carte et le fil entier sont sur /admin/direct.
 */

/** La couleur du point d’un geste du fil (sur le noir de la carte, ou sur le blanc de la page En direct). */
export const POINTS_DU_FIL: Record<GenreFil, { noir: string; blanc: string }> = {
  achat: { noir: "bg-elle", blanc: "bg-[#e8358a]" },
  paiement: { noir: "bg-[#ffb35c]", blanc: "bg-[#e08600]" },
  import: { noir: "bg-[#5d9dff]", blanc: "bg-toi" },
  arrivee: { noir: "bg-muted", blanc: "bg-pale" },
  partage: { noir: "bg-vrai", blanc: "bg-[#0fa877]" },
};

export function CarteEnDirect({ base }: { base: BaseDeLAdmin }) {
  const { d, ecoule, panne } = useDirect();
  const etapes = d ? etapesPeuplees(d.etapes, 5) : [];
  return (
    <Bloc
      id="direct"
      sombre
      titre={
        <>
          <Pouls />
          En direct
        </>
      }
      sous={panne ? "Hors ligne, nouvel essai dans 5\u00a0s" : "Sur le site, cette minute"}
      aide={{ cle: "live", valeur: d ? `${nombre(d.enLigne)} en ligne` : "…", contexte: "en ce moment" }}
      className="grow basis-[320px]"
    >
      <p className="m-0 mt-3.5 flex items-baseline gap-2.5">
        <span className="text-[44px] font-black leading-none tracking-[-0.035em] tabular-nums md:text-affiche">{d ? nombre(d.enLigne) : "…"}</span>
        <span className="text-corps font-extrabold text-white/75">{d && d.enLigne > 1 ? "personnes en ligne" : "personne en ligne"}</span>
      </p>
      {etapes.length > 0 ? (
        <ul aria-label="Où ils en sont" className="m-0 mt-[18px] flex list-none flex-col gap-2.5 p-0">
          {etapes.map((e) => (
            <li key={e.etape} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_28px] items-center gap-3 text-note font-extrabold">
              <span className="truncate">{NOMS_DES_ETAPES[e.etape]}</span>
              <Barre part={d ? e.n / Math.max(1, d.enLigne) : 0} couleur="var(--elle)" piste="bg-white/12" hauteur="h-2" />
              <span className="text-right tabular-nums">{nombre(e.n)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-[18px] text-note font-extrabold text-white/70">{d ? "Personne sur le site en ce moment." : "Lecture du direct…"}</p>
      )}
      {d && d.fil.length > 0 && (
        <ul aria-label="Le fil des visiteurs" className="m-0 mt-[18px] flex list-none flex-col gap-2.5 border-0 border-t border-solid border-white/12 p-0 pt-4">
          {d.fil.slice(0, 3).map((g, k) => {
            const t = texteDuGeste(g);
            return (
              <li key={`${g.le}-${k}`} className="flex items-center gap-2.5 text-note font-extrabold">
                <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", POINTS_DU_FIL[g.genre].noir)} />
                <span className="min-w-0 flex-1 truncate">
                  {t.ville} · {t.quoi}
                  {t.prix && ` · ${t.prix}`}
                </span>
                <span className="whitespace-nowrap text-micro font-extrabold text-white/60">{ilYa(secondesDepuis(d, g.le, ecoule))}</span>
              </li>
            );
          })}
        </ul>
      )}
      <Link href={`${base}/direct`} className="mt-auto pt-[18px] text-detail font-black text-white no-underline hover:underline">
        Voir la carte en direct →
      </Link>
    </Bloc>
  );
}
