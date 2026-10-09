import Link from "next/link";
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { IlOuElle } from "@/lib/pronom";
import type { LevelId, ScoreRow } from "@/types";
import { Icon } from "./icons";
import { Dot } from "./messages";

/* Couleur du nom du gagnant : les teintes foncées, lisibles en petit (au moins 4,5:1) */
const SIDE_COLOR = { toi: "#1A66DB", elle: "#C81D6B", pareil: "#087A56" } as const;

/* ———— Barre de score toi / elle ———— */
/** `autre` : le pronom de l’autre personne (« il » quand une utilisatrice parle d’un garçon) ; « elle » par défaut. */
export function ScoreBar({ row, delay = 0, autre }: { row: ScoreRow; delay?: number; autre?: "il" | "elle" }) {
  const lui = IlOuElle(autre).toLowerCase();
  return (
    <div className="flex flex-col gap-2 py-2.5 lg:gap-1.5 lg:py-2">
      <div className="flex justify-between gap-3 text-[15px] font-black">
        <span>{row.label}</span>
        <span style={{ color: SIDE_COLOR[row.winner] }}>{row.winner === "elle" ? lui : row.winner}</span>
      </div>
      <div
        className="flex h-3.5 overflow-hidden rounded-[7px] bg-[rgba(255,79,154,0.35)]"
        role="img"
        aria-label={`${row.label} : toi ${row.toiPercent} %, ${lui} ${100 - row.toiPercent} %`}
      >
        <span data-grow="" className="bg-toi" style={{ width: `${row.toiPercent}%`, "--d": `${delay}s` } as CSSProperties} />
      </div>
      {(row.captionLeft || row.captionRight) && (
        <div className="flex justify-between text-[12px] font-extrabold text-grey">
          <span>{row.captionLeft}</span>
          <span>{row.captionRight}</span>
        </div>
      )}
    </div>
  );
}

/** Carte de scores avec la légende « ● Toi / Elle ● ». */
export function ScoreCard({ rows, className, autre }: { rows: ScoreRow[]; className?: string; autre?: "il" | "elle" }) {
  return (
    <div className={cn("flex flex-col rounded-card bg-white px-4 py-3.5 shadow-card", className)}>
      <div className="flex justify-between text-[12px] font-black">
        <span className="inline-flex items-center gap-1 text-toi-ink">
          <Dot color="#3D8BFF" size={8} />
          Toi
        </span>
        <span className="inline-flex items-center gap-1 text-elle-ink">
          {IlOuElle(autre)}
          <Dot color="#FF4F9A" size={8} />
        </span>
      </div>
      {rows.map((r, i) => (
        <ScoreBar key={r.label} row={r} delay={0.1 + i * 0.12} autre={autre} />
      ))}
    </div>
  );
}

/* ———— Chemin des niveaux ———— */
type Level = { id: LevelId; label: string };

/** Avant d’être ensemble : des étapes, qu’on franchit l’une après l’autre. */
export const LEVELS: Level[] = [
  { id: "parle", label: "On se parle" },
  { id: "voit", label: "On se voit" },
  { id: "dit", label: "On se le dit" },
  { id: "ensemble", label: "On est ensemble" },
];

/** En couple : une température, du plus froid au plus chaud. On y est quelque part, sans étape à franchir. */
export const TEMPERATURE: Level[] = [
  { id: "eloigne", label: "On s’éloigne" },
  { id: "coince", label: "Ça coince" },
  { id: "va", label: "Ça va" },
  { id: "soudes", label: "On est soudés" },
];

/** L’échelle d’un niveau : les étapes, ou la température en couple. */
export function scaleOf(level: LevelId) {
  const temperature = TEMPERATURE.some((l) => l.id === level);
  const levels = temperature ? TEMPERATURE : LEVELS;
  return { levels, index: levels.findIndex((l) => l.id === level), temperature };
}

/** Les étapes (franchies en vert, la tienne en bleu, les suivantes verrouillées), ou la température (juste où vous êtes). */
export function LevelPath({ current, className }: { current: LevelId; className?: string }) {
  const { levels, index: idx, temperature } = scaleOf(current);
  const pct = (n: number) => `${Math.round((n / (levels.length - 1)) * 100)}%`;
  return (
    <div className={cn("relative flex justify-between", className)}>
      <div
        aria-hidden="true"
        className="absolute inset-x-[38px] top-6 h-1 rounded-sm"
        style={{
          background: temperature
            ? "#E6E3DC"
            : `linear-gradient(90deg, #12C08A 0%, #12C08A ${pct(idx - 1)}, #3D8BFF ${pct(idx - 1)}, #3D8BFF ${pct(idx)}, #E6E3DC ${pct(idx)})`,
        }}
      />
      <ol className="contents">
        {levels.map((l, i) => {
          const now = i === idx;
          const done = !temperature && i < idx;
          return (
            <li
              key={l.id}
              className="relative flex w-[76px] flex-col items-center gap-2 text-center"
              aria-current={now ? "step" : undefined}
            >
              <span
                data-pulse={now ? "" : undefined}
                className={cn("flex size-[50px] items-center justify-center rounded-[25px]", done && "bg-vrai-ink", now && "bg-toi-ink", !done && !now && "bg-white shadow-thin")}
              >
                {done && <Icon name="check" size={20} color="#FFFFFF" stroke={3.2} />}
                {now && (temperature ? <span className="size-3 rounded-full bg-white" /> : <span className="text-[18px] font-black text-white">{i + 1}</span>)}
                {!done && !now && !temperature && <Icon name="lock" size={18} color="#B4B1A9" />}
              </span>
              <span className={cn("text-[13px] font-black leading-[1.2]", !done && !now ? "text-muted" : "text-ink")}>
                {l.label}
                <span className="sr-only">{now ? (temperature ? " : vous en êtes là" : " : niveau en cours") : done ? " : réussi" : temperature ? "" : " : à venir"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ———— Points de progression du parcours (haut à droite) ———— */
export function ProgressDots({ total = 3, current }: { total?: number; current: number }) {
  return (
    <div aria-hidden="true" className="flex w-[72px] gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("h-1.5 flex-1 rounded-[3px]", i < current ? "bg-ink" : "bg-track")} />
      ))}
    </div>
  );
}

/* ———— Chapitre verrouillé ———— */
export function LockRow({ number, title, last = false, onClick }: { number: number; title: string; last?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[14px] bg-plaque text-[12px] font-black text-soft">{number}</span>
      <span className="flex-1 text-left">
        <span className="block text-[16px] font-black">{title}</span>
        <span aria-hidden="true" className="mt-1.5 flex flex-col gap-1 blur-[2px]">
          <span className="h-[7px] w-[88%] rounded bg-skeleton" />
          <span className="h-[7px] w-[64%] rounded bg-skeleton" />
        </span>
      </span>
      <Icon name="lock" size={18} color="#8A8780" />
      <span className="sr-only">(verrouillé)</span>
    </>
  );
  const cls = cn("flex w-full items-center gap-3 py-3", !last && "border-b-2 border-sep", onClick && "row-hover");
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  return <div className={cls}>{inner}</div>;
}

/* ———— Étapes du parcours (colonne d’appoint desktop) ———— */
const FLOW = [
  { title: "Ta conv", sub: "Export ou captures" },
  { title: "Qui est qui", sub: "Et ce que tu veux" },
  { title: "Ton email", sub: "Puis BLUSH analyse votre histoire" },
];

export function FlowSteps({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex flex-col gap-1 rounded-card bg-white p-5 shadow-card">
      <div className="text-[13px] font-black text-grey">Trois étapes, puis ton verdict</div>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {FLOW.map((s, i) => {
          const n = i + 1;
          const on = n === step;
          const done = n < step;
          return (
            <li key={s.title} className="flex items-start gap-3 py-2" aria-current={on ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-[30px] shrink-0 items-center justify-center rounded-[15px] text-[14px] font-black",
                  on ? "bg-ink text-white" : done ? "text-white" : "bg-white text-grey shadow-thin",
                )}
                style={done ? { background: "var(--gloss), #12C08A", boxShadow: "0 3px 8px -3px rgba(18,192,138,0.6)" } : undefined}
              >
                {done ? <Icon name="check" size={16} color="#FFFFFF" stroke={3.4} /> : n}
              </span>
              <div>
                <div className={cn("text-[16px] font-black", on || done ? "text-ink" : "text-grey")}>{s.title}</div>
                <div className="text-[13px] font-extrabold text-grey">{s.sub}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Lien texte avec flèche (« Revoir le rapport → »). */
export function ArrowLink({ href, children, className }: { href: string; children: string; className?: string }) {
  return (
    <Link href={href} className={cn("arrow-nudge inline-flex min-h-11 items-center gap-1 text-[14px] font-black text-soft no-underline transition-colors hover:text-ink", className)}>
      {children}
      <span className="arrow" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
