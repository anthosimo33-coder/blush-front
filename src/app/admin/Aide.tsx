"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AIDES_DU_PILOTAGE, type AideDuPilotage, type CleDAide } from "@/contenu/aide-pilotage";
import { cn } from "@/lib/cn";
import { bloquerDefilement } from "@/lib/defilement";

/*
 * Les « ? » du pilotage : un bouton rond sur chaque carte et chaque chiffre clé, qui ouvre un panneau sur le côté (un
 * dialogue modal : le focus y entre, Échap et le voile le ferment, puis le focus revient au bouton). Le panneau dit la
 * valeur du moment, puis ce qu’est le chiffre, son calcul, le bon repère et quoi faire s’il bouge
 * (src/contenu/aide-pilotage.ts).
 */

/** Le « ? » d’une carte : `valeur` et `contexte`, ce que vaut le chiffre en ce moment ; `sombre` : sur la carte noire du direct. */
export function BoutonAide({ cle, valeur, contexte, sombre = false }: { cle: CleDAide; valeur: string; contexte?: string; sombre?: boolean }) {
  const aide = AIDES_DU_PILOTAGE[cle];
  const [ouvert, setOuvert] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  return (
    <>
      {/* 28 px à l’œil, 44 px sous le doigt (after) */}
      <button
        ref={bouton}
        type="button"
        aria-label={`Comment lire ${aide.de}`}
        aria-haspopup="dialog"
        onClick={() => setOuvert(true)}
        className={cn(
          "relative flex size-7 shrink-0 items-center justify-center rounded-full text-note font-black transition-colors after:absolute after:-inset-2 after:content-['']",
          sombre ? "bg-white/12 text-white hover:bg-white hover:text-ink" : "bg-sep text-soft hover:bg-ink hover:text-white",
        )}
      >
        ?
      </button>
      {ouvert && (
        <Panneau
          aide={aide}
          valeur={valeur}
          contexte={contexte}
          fermer={() => {
            setOuvert(false);
            bouton.current?.focus();
          }}
        />
      )}
    </>
  );
}

function Panneau({ aide, valeur, contexte, fermer }: { aide: AideDuPilotage; valeur: string; contexte?: string; fermer: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    /* Modal : le reste de la page devient inerte, le focus va au premier bouton du panneau (Fermer) */
    if (!d.open) d.showModal();
    const liberer = bloquerDefilement();
    return () => {
      liberer();
      if (d.open) d.close();
    };
  }, []);
  /* Le dialogue se ferme d’abord : la page n’est plus inerte, le focus peut revenir au « ? » */
  const fermerTout = () => {
    ref.current?.close();
    fermer();
  };
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-titre`}
      onCancel={(e) => {
        e.preventDefault();
        fermerTout();
      }}
      /*
       * overflow-clip, pas hidden : un dialogue en hidden défile encore. showModal() donne le focus à « Fermer » pendant que
       * le panneau arrive de la droite, hors de l’écran : Safari faisait défiler le dialogue pour le montrer, et tout le
       * panneau glissait décalé à gauche, par-dessus le voile (le toucher y tombait sur le panneau), puis sautait à sa place
       * en fin d’animation. Même précaution que les feuilles (src/components/ui/surfaces.tsx)
       */
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-clip bg-transparent p-0 text-ink backdrop:bg-transparent"
    >
      {/* Le voile : un clic dessus ferme (au clavier, Échap ou « Fermer ») */}
      <div aria-hidden="true" onClick={fermerTout} className="absolute inset-0 cursor-pointer bg-ink/28 motion-safe:[animation:fadeIn_0.25s_ease-out_both]" />
      <div className="absolute inset-y-3 right-3 flex w-[min(410px,calc(100%-24px))] flex-col gap-[18px] overflow-y-auto rounded-card bg-white p-6 shadow-[0_30px_60px_-20px_rgba(17,17,20,0.45),0_0_0_1px_rgba(17,17,20,0.06)] motion-safe:[animation:vtFromRight_0.35s_cubic-bezier(0.2,0.8,0.2,1)] md:p-7">
        <button
          type="button"
          aria-label="Fermer"
          onClick={fermerTout}
          className="flex size-11 shrink-0 items-center justify-center self-end rounded-full bg-sep text-[22px] font-black leading-none transition-colors hover:bg-track"
        >
          <span aria-hidden="true">×</span>
        </button>
        <div>
          <p className="m-0 text-micro font-black uppercase tracking-[0.08em] text-elle-ink">Comment le lire</p>
          <h2 id={`${id}-titre`} className="m-0 mt-1 text-[28px] font-black leading-[1.1] tracking-[-0.02em]">
            {aide.titre}
          </h2>
        </div>
        <p className="m-0 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-[16px] bg-paper px-4 py-3.5">
          <b className="text-[26px] font-black tracking-[-0.02em] tabular-nums">{valeur}</b>
          {contexte && <span className="text-legende font-bold text-grey">{contexte}</span>}
        </p>
        <Bloc titre="C’est quoi" texte={aide.quoi} />
        <Bloc titre="Le calcul" texte={aide.calcul} />
        <Bloc titre="Le bon repère" texte={aide.repere} />
        <Bloc titre="Si ça bouge" texte={aide.siCaBouge} sombre />
      </div>
    </dialog>
  );
}

function Bloc({ titre, texte, sombre = false }: { titre: string; texte: string; sombre?: boolean }) {
  return (
    <section className={cn(sombre && "rounded-[16px] bg-ink p-4 text-white")}>
      <h3 className={cn("m-0 mb-1 text-legende font-black uppercase tracking-[0.06em]", sombre ? "text-white/70" : "text-grey")}>{titre}</h3>
      <p className="m-0 text-corps font-bold leading-[1.5]">{texte}</p>
    </section>
  );
}
