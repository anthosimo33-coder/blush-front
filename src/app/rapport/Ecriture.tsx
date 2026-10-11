"use client";

import { cn } from "@/lib/cn";
import { useEnVue } from "@/lib/hooks";
import type { EcritureRapport, EtatChapitre } from "@/types/api";
import { DoneCheck, TypingDots } from "@/components/ui/feedback";
import { SUITE_ECRITURE } from "./ancres";

/*
 * Pendant que BLUSH écrit le rapport : la vraie avancée, lue sur ce que le modèle écrit (le plan, puis les deux
 * moitiés du rapport en même temps, chapitre par chapitre). Textes relus le 8 octobre (voix de BLUSH).
 */

const pct = (p: number) => `${Math.round(Math.min(1, Math.max(0, p)) * 100)}\u00a0%`;

/** Ce qui s’écrit en ce moment, dit simplement : « Il prépare le plan », « Chapitres 3 et 7 en cours ». */
export function enCours(e: EcritureRapport): string {
  if (e.etape === "plan") return "Il prépare le plan";
  const n = e.chapitres.filter((c) => c.etat === "en_cours").map((c) => c.number);
  if (!n.length) return e.progres < 0.95 ? "Il prépare les chapitres" : "Il assemble ton rapport";
  return n.length === 1 ? `Chapitre ${n[0]} en cours` : `Chapitres ${n.slice(0, -1).join(", ")} et ${n.at(-1)} en cours`;
}

/** En haut du sommaire (grand écran) : la barre de l’écriture, son pourcentage et le temps qui reste. */
export function BarreEcriture({ ecriture }: { ecriture: EcritureRapport }) {
  return (
    <div className="mb-2 mt-2.5 flex flex-col gap-1.5" role="status">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-legende font-black text-ink">BLUSH écrit ton rapport</span>
        <span className="text-legende font-black tabular-nums text-ink">{pct(ecriture.progres)}</span>
      </div>
      <span className="h-[5px] overflow-hidden rounded-full bg-[#ECE9E2]">
        {/* Une échelle plutôt qu’une largeur : la barre avance sans recalculer la page */}
        <span
          className="block h-full w-full origin-left rounded-full transition-transform duration-[900ms] ease-linear"
          style={{ transform: `scaleX(${Math.min(1, Math.max(0, ecriture.progres))})`, background: "var(--degrade-lecture)" }}
        />
      </span>
      <span className="text-micro font-extrabold text-grey">
        {enCours(ecriture)}
        {ecriture.restant ? ` · encore ≈\u00a0${ecriture.restant}` : ""}
      </span>
    </div>
  );
}

/**
 * L’état d’un chapitre, à droite de sa ligne : prêt, en cours d’écriture, ou en attente. Les trois états se disent de la
 * même façon aux lecteurs d’écran (une image nommée) ; `decorative` les tait quand un texte visible dit déjà l’état à côté
 * (la ligne de « La suite s’écrit »), pour ne pas l’annoncer deux fois.
 */
export function MarqueChapitre({ etat, decorative = false }: { etat: EtatChapitre; decorative?: boolean }) {
  const nom = (label: string) => (decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": label });
  if (etat === "ecrit") return <DoneCheck size={20} ombre={false} label={decorative ? undefined : "prêt"} />;
  if (etat === "en_cours")
    return (
      <span className="flex h-5 shrink-0 items-center" {...nom("en cours d’écriture")}>
        <TypingDots size={4} />
      </span>
    );
  return <span className="size-5 shrink-0 rounded-full border-2 border-track" {...nom("en attente")} />;
}

/** Dans la colonne du rapport (tous les écrans) : un chapitre qui s’écrit, avec ses lignes qui se remplissent. */
export function LigneEcriture({ number, title, etat, last = false }: { number: number; title: string; etat: EtatChapitre; last?: boolean }) {
  return (
    <div className={cn("flex w-full items-center gap-3 py-3", !last && "border-b-2 border-sep")}>
      <span
        className={cn("flex size-7 shrink-0 items-center justify-center rounded-[14px] text-micro font-black", etat === "attente" ? "bg-plaque text-grey" : "bg-ink text-white")}
      >
        {number}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={cn("block text-corps font-black", etat === "attente" && "text-grey")}>{title}</span>
        <span aria-hidden="true" className="mt-1.5 flex flex-col gap-1">
          {[88, 64].map((w, k) => (
            <span key={w} className="relative h-[7px] overflow-hidden rounded bg-skeleton" style={{ width: `${w}%` }}>
              {etat !== "attente" && (
                <span
                  data-ecrit={etat === "en_cours" ? "" : undefined}
                  className="absolute inset-0 rounded"
                  style={{ background: etat === "ecrit" ? "rgba(18,192,138,0.35)" : "var(--degrade-lecture)", "--k": `${k * 0.6}s` }}
                />
              )}
            </span>
          ))}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-micro font-black">
        <span className={cn(etat === "ecrit" ? "text-vrai-ink" : etat === "en_cours" ? "text-ink" : "text-grey")}>
          {etat === "ecrit" ? "Prêt" : etat === "en_cours" ? "S’écrit" : "En attente"}
        </span>
        <MarqueChapitre etat={etat} decorative />
      </span>
    </div>
  );
}

/** En bas de l’écran : un petit anneau qui se remplit, ce qui s’écrit, et le temps qui reste. */
export function PastilleEcriture({ ecriture }: { ecriture: EcritureRapport }) {
  const r = 13;
  const c = 2 * Math.PI * r;
  /* La liste « La suite s’écrit » est à l’écran : elle dit déjà tout, la pastille s’efface pour ne pas flotter dessus */
  const cachee = useEnVue(SUITE_ECRITURE);
  return (
    <div
      role="status"
      aria-hidden={cachee || undefined}
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-50 flex justify-center px-4 transition-[opacity,translate] duration-300 lg:bottom-8",
        cachee && "translate-y-3 opacity-0",
      )}
    >
      <span className="flex max-w-[420px] items-center gap-3 rounded-full bg-ink py-2 pl-2 pr-5 text-white shadow-[0_18px_40px_-14px_rgba(17,17,20,0.6)]">
        <span className="relative flex size-[34px] shrink-0 items-center justify-center">
          <svg viewBox="0 0 34 34" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <defs>
              <linearGradient id="ecriture-anneau" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" style={{ stopColor: "var(--toi)" }} />
                <stop offset="0.6" style={{ stopColor: "var(--elle)" }} />
                <stop offset="1" style={{ stopColor: "var(--vrai)" }} />
              </linearGradient>
            </defs>
            <circle cx="17" cy="17" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="3" />
            <circle
              cx="17"
              cy="17"
              r={r}
              fill="none"
              stroke="url(#ecriture-anneau)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - ecriture.progres)}
              className="transition-[stroke-dashoffset] duration-[900ms] ease-linear"
            />
          </svg>
          <span className="text-[10px] font-black tabular-nums">{Math.round(ecriture.progres * 100)}</span>
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-note font-black leading-tight">BLUSH écrit ton rapport</span>
          <span className="truncate text-micro font-extrabold leading-tight text-[rgba(255,255,255,0.72)]">
            {enCours(ecriture)}
            {ecriture.restant ? ` · encore ≈\u00a0${ecriture.restant}` : ""}
          </span>
        </span>
      </span>
    </div>
  );
}
