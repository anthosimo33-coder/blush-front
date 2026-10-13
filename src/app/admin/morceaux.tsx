import type { ReactNode } from "react";
import type { CleDAide } from "@/contenu/aide-pilotage";
import { cn } from "@/lib/cn";
import { BoutonAide } from "./Aide";
import type { Ecart } from "./calculs";

/*
 * Les morceaux du pilotage et du direct (/admin) : le point qui bat, la pastille d’un écart, et la carte d’un bloc avec
 * son titre et son « ? ». Sans état : ils servent aux pages du serveur comme aux écrans qui se relisent.
 */

/** Un point rose qui bat (le direct). Immobile quand l’appareil demande moins d’animations. */
export function Pouls({ taille = 9 }: { taille?: number }) {
  return (
    <span aria-hidden="true" className="relative inline-block shrink-0 rounded-full bg-elle" style={{ width: taille, height: taille }}>
      <span className="absolute inset-0 rounded-full bg-elle opacity-70 motion-safe:animate-ping" />
    </span>
  );
}

/** L’écart d’un chiffre avec la période d’avant : vert s’il va bien, rouge s’il va mal, gris sinon. « — » sans écart à dire. */
export function PastilleEcart({ e }: { e: Ecart | null }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-[9px] py-[3px] text-legende font-black tabular-nums",
        e?.ton === "bon" ? "bg-vrai/14 text-vrai-ink" : e?.ton === "mal" ? "bg-danger/10 text-danger" : "bg-sep text-soft",
      )}
    >
      {e?.fleche && <span aria-hidden="true">{e.fleche}</span>}
      {e ? e.texte : "—"}
    </span>
  );
}

/** Ce que dit le « ? » d’un bloc : quelle explication, et la valeur du moment. */
export type AideDuBloc = { cle: CleDAide; valeur: string; contexte?: string };

/** Une carte du pilotage : son titre (h2, nommé par `id`, aussi l’ancre des liens), sa ligne de dessous, son « ? ». */
export function Bloc({
  id,
  titre,
  sous,
  aide,
  sombre = false,
  className,
  children,
}: {
  id: string;
  titre: ReactNode;
  sous?: ReactNode;
  aide?: AideDuBloc;
  sombre?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titre`}
      className={cn("flex min-w-0 scroll-mt-6 flex-col rounded-card p-5 shadow-card md:p-6", sombre ? "bg-ink text-white" : "bg-white", className)}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-titre`} className="m-0 flex items-center gap-2.5 text-[19px] font-black tracking-[-0.01em]">
            {titre}
          </h2>
          {sous && <p className={cn("m-0 mt-[3px] text-note font-bold", sombre ? "text-white/70" : "text-grey")}>{sous}</p>}
        </div>
        {aide && <BoutonAide {...aide} sombre={sombre} />}
      </header>
      {children}
    </section>
  );
}

/** Une barre de progression : sa piste, et sa part remplie (de 0 à 1). Décorative : la valeur s’écrit à côté. */
export function Barre({ part, couleur, piste = "bg-paper", hauteur = "h-2.5" }: { part: number; couleur: string; piste?: string; hauteur?: string }) {
  const largeur = Number.isFinite(part) ? Math.min(1, Math.max(0, part)) : 0;
  return (
    <span aria-hidden="true" className={cn("block min-w-10 flex-1 overflow-hidden rounded-full", piste, hauteur)}>
      <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${largeur * 100}%`, background: couleur }} />
    </span>
  );
}
