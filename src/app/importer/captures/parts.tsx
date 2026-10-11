"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { estImage } from "@/lib/limites";
import { Icon } from "@/components/ui/icons";
import { NotePrivee } from "@/components/ui/NotePrivee";
import { NOTE_ENREGISTREMENT } from "@/contenu/confidentialite";

/*
 * Les morceaux de l’écran des captures (CapturesScreen.tsx) : les vignettes de la grille, la zone d’ajout, la carte
 * d’un enregistrement, comment filmer sa conv, la barre de lecture. Ils ne font que montrer : l’état (les captures
 * choisies, leur ordre, leur envoi) reste à l’écran.
 */

/** Une capture choisie (ou l’enregistrement) : son fichier, et son aperçu une fois prêt (null : la vignette arrive). */
export type Shot = { id: string; file: File; url: string | null };

/** Ce que la grille des captures dit aux lecteurs d’écran (src/components/ui/ReorderGrid.tsx). */
export const TEXTES_GRILLE = {
  liste: "Tes captures, dans l’ordre",
  element: (position: number, total: number) => `Capture ${position} sur ${total}`,
  retirer: (position: number) => `Retirer la capture ${position}`,
  deplacee: (position: number) => `Capture déplacée en position ${position}.`,
  ajouter: "Ajouter des captures",
};

/** Une case de la grille : la capture numérotée, son aperçu, ou en attendant deux bulles grises. */
export function VignetteCapture({ shot, position }: { shot: Shot; position: number }) {
  return (
    <Thumb selected number={position} image={shot.url} video={shot.file.type.startsWith("video/")}>
      {!shot.url && (
        <>
          <Bar side="l" width={70} />
          <Bar side="r" width={45} />
        </>
      )}
    </Thumb>
  );
}

/** La dernière case de la grille : un plus, pour ajouter des captures. */
export function CaseAjout() {
  return (
    <Thumb>
      <span className="absolute inset-0 flex items-center justify-center">
        <Icon name="plus" size={26} stroke={2.6} className="text-muted" />
      </span>
    </Thumb>
  );
}

/**
 * Pendant la lecture des captures : une barre qui avance d’après une durée prudente (13 s, plus 3 s par capture),
 * ralentit vers 90 % et n’arrive au bout qu’avec la réponse (l’écran suivant). En transform : le compositeur la fait
 * avancer, sans rien recalculer ni repeindre.
 */
export function BarreLecture({ captures }: { captures: number }) {
  const barre = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const a = barre.current?.animate([{ transform: "scaleX(0.04)" }, { transform: "scaleX(0.9)" }], {
      duration: (13 + 3 * captures) * 1000,
      easing: "cubic-bezier(0.3, 0.55, 0.45, 1)",
      fill: "forwards",
    });
    return () => a?.cancel();
  }, [captures]);
  return (
    <span aria-hidden="true" className="mx-auto mt-3 block h-1 w-[calc(100%_-_48px)] overflow-hidden rounded-full bg-[rgba(17,17,20,0.08)]">
      <span ref={barre} className="block h-full origin-left bg-ink" style={{ transform: "scaleX(0.04)" }} />
    </span>
  );
}

/** Une case de la grille : une capture (son aperçu en fond, son numéro), un enregistrement (sa première image), ou la case d’ajout. */
function Thumb({ children, selected, number, image, video }: { children?: ReactNode; selected?: boolean; number?: number; image?: string | null; video?: boolean }) {
  /* Un enregistrement : sa première image (l’ancre #t pour que Safari en affiche une), et le signe lecture */
  if (video && image)
    return (
      <div className={cn("relative h-[108px] overflow-hidden rounded-2xl bg-[#111114]", selected ? "shadow-selected" : "shadow-thin")}>
        <video src={`${image}#t=0.6`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover object-top" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-[rgba(17,17,20,0.6)]">
            <Icon name="play" size={15} fill="currentColor" stroke={0} className="translate-x-px text-white" />
          </span>
        </span>
      </div>
    );
  return (
    <div
      className={cn(
        "relative flex h-[108px] flex-col justify-end gap-[5px] overflow-hidden rounded-2xl bg-white px-2 pb-2 pt-[18px]",
        selected ? "shadow-selected" : "shadow-thin",
      )}
      style={image ? { backgroundImage: `url(${image})`, backgroundSize: "cover", backgroundPosition: "center top" } : undefined}
    >
      {number !== undefined && (
        <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-xl bg-ink text-micro font-black text-white">{number}</span>
      )}
      {children}
    </div>
  );
}

/** Une bulle grise, à gauche ou à droite : une capture dont la vignette n’est pas encore prête. */
function Bar({ side, width }: { side: "l" | "r"; width: number }) {
  return <span className={cn("h-[11px] rounded-md", side === "l" ? "self-start" : "self-end", side === "r" ? "bg-toi" : "bg-skeleton")} style={{ width: `${width}%` }} />;
}

/** Le bouton d’enregistrement de l’écran du Centre de contrôle : un rond blanc cerclé, un point rouge. */
function BoutonRec() {
  return (
    <span aria-label="le bouton d’enregistrement" role="img" className="mx-0.5 inline-flex size-[1.15em] items-center justify-center rounded-full border-2 border-current align-[-0.2em]">
      <span className="size-[0.5em] rounded-full bg-[#FF3B30]" />
    </span>
  );
}

/** L’enregistrement choisi : son aperçu, sa durée, et de quoi en changer (pas pendant sa lecture : `onChange` absent). */
export function CarteEnregistrement({ shot, onChange }: { shot: Shot; onChange?: () => void }) {
  const [duree, setDuree] = useState<number | null>(null);
  return (
    <div className="flex items-center gap-4 rounded-card bg-white p-3.5 shadow-soft">
      <span className="relative h-[112px] w-[64px] shrink-0 overflow-hidden rounded-[14px] bg-[#111114]">
        {shot.url && (
          <video src={`${shot.url}#t=0.6`} muted playsInline preload="metadata" onLoadedMetadata={(e) => setDuree(e.currentTarget.duration)} className="absolute inset-0 size-full object-cover object-top" />
        )}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-7 items-center justify-center rounded-full bg-[rgba(17,17,20,0.6)]">
            <Icon name="play" size={12} fill="currentColor" stroke={0} className="translate-x-px text-white" />
          </span>
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-corps font-black">Ton enregistrement</span>
        <span className="text-legende font-extrabold text-grey">
          {duree && Number.isFinite(duree) ? `${duree >= 60 ? `${Math.floor(duree / 60)}\u00a0min ` : ""}${Math.round(duree % 60)}\u00a0s · ` : ""}prêt
        </span>
      </span>
      <button type="button" onClick={onChange} disabled={!onChange} className="lift lift-sm h-9 shrink-0 rounded-full bg-plaque px-3.5 text-legende font-black text-ink disabled:opacity-50">
        Changer
      </button>
    </div>
  );
}

/** iMessage : comment filmer sa conv sur iPhone, en quatre gestes, puis la choisir. */
export function CommentFilmer({ onPick }: { onPick: () => void }) {
  const etapes: ReactNode[] = [
    "Ouvre votre conv dans Messages",
    <>
      Ouvre le Centre de contrôle, et touche <BoutonRec /> (Enregistrement de l’écran)
    </>,
    "Reviens sur la conv, et remonte-la doucement jusqu’au début",
    "Arrête l’enregistrement, puis choisis-le ici",
  ];
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onPick} className="lift flex flex-col gap-4 rounded-card bg-white p-5 text-left text-ink shadow-soft">
        <span className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[rgba(255,90,96,0.12)]">
            <span className="size-4 rounded-full bg-[#FF5A60] shadow-[0_0_0_4px_rgba(255,90,96,0.22)]" />
          </span>
          <span className="flex flex-col">
            <span className="text-accent font-black">Enregistre ton écran</span>
            <span className="text-legende font-extrabold text-grey">Toute votre conv, en une minute</span>
          </span>
        </span>
        <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
          {etapes.map((e, k) => (
            <li key={k} className="flex items-start gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-micro font-black text-white">{k + 1}</span>
              <span className="pt-0.5 text-note font-extrabold leading-[1.4]">{e}</span>
            </li>
          ))}
        </ol>
      </button>
      <NotePrivee petite className="px-1 leading-[1.45]">
        {NOTE_ENREGISTREMENT} Pas de bouton <BoutonRec />{NBSP}? Ajoute-le dans Réglages, Centre de contrôle.
      </NotePrivee>
    </div>
  );
}

/** Zone d’ajout (avant sélection) : un vrai appel à déposer, pas de fausses captures. Accepte aussi le glisser-déposer. */
export function Dropzone({ onPick, onFiles }: { onPick: () => void; onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onClick={onPick}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const images = Array.from(e.dataTransfer.files).filter(estImage);
        if (images.length) onFiles(images);
      }}
      className={cn(
        "lift group flex flex-col items-center justify-center gap-5 rounded-card bg-white px-6 pb-7 pt-9 text-center text-ink",
        over ? "shadow-selected" : "shadow-soft",
      )}
    >
      <ScreensArt />
      <span className="flex flex-col gap-1">
        <span className="text-accent font-black">Ajoute tes captures</span>
        <span className="text-legende font-extrabold text-grey">Dans l’ordre, de la plus ancienne à la plus récente</span>
      </span>
    </button>
  );
}

/** Trois écrans de conv en éventail ; ils s’écartent au survol. */
function ScreensArt() {
  const shots = [
    { x: -38, y: 10, r: -11, rows: [["l", 64], ["r", 46], ["l", 74], ["r", 38]] },
    { x: 38, y: 10, r: 11, rows: [["r", 52], ["l", 70], ["r", 40], ["l", 56]] },
    { x: 0, y: 0, r: 0, rows: [["l", 60], ["r", 48], ["l", 72], ["r", 36], ["l", 50]] },
  ] as const;
  return (
    <span aria-hidden="true" className="relative block h-[108px] w-[170px]">
      {shots.map((s, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-0 -ml-[29px] flex h-[100px] w-[58px] flex-col gap-1 rounded-[12px] bg-white p-1.5 shadow-[0_0_0_1px_rgba(17,17,20,0.07),0_10px_22px_-10px_rgba(17,17,20,0.35)] transition-transform duration-500 ease-out [transform:translate(var(--x),var(--y))_rotate(var(--r))] group-hover:[transform:translate(calc(var(--x)*1.25),calc(var(--y)-2px))_rotate(calc(var(--r)*1.4))]"
          style={{ "--x": `${s.x}px`, "--y": `${s.y}px`, "--r": `${s.r}deg` }}
        >
          <span className="mx-auto mb-1 h-[3px] w-4 rounded-full bg-skeleton" />
          {s.rows.map(([side, w], k) => (
            <span key={k} className={cn("h-[7px] rounded-full", side === "l" ? "self-start bg-bubble-her" : "self-end bg-toi")} style={{ width: `${w}%` }} />
          ))}
          {i === 2 && (
            <span className="absolute -bottom-2 -right-2 flex size-6 items-center justify-center rounded-full bg-ink shadow-[0_4px_10px_-4px_rgba(17,17,20,0.5)]">
              <Icon name="plus" size={14} stroke={3} className="text-white" />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
