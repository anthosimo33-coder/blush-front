import { etatDuNiveau, scaleOf } from "@/contenu/niveaux";
import { cn } from "@/lib/cn";
import { delai } from "@/lib/motion";
import { IlOuElle } from "@/lib/pronom";
import type { LevelId, Pronom, ScoreRow } from "@/types";
import { DoneCheck } from "./feedback";
import { Icon } from "./icons";
import { Dot } from "./messages";

/* Les niveaux vivent dans src/contenu/niveaux.ts : la réexportation garde l’accueil tel quel, le temps que 9a le bascule */
export { scaleOf } from "@/contenu/niveaux";

/* Couleur du nom du gagnant : les teintes foncées, lisibles en petit (au moins 4,5:1) */
const SIDE_COLOR = { toi: "#1A66DB", elle: "#C81D6B", pareil: "#087A56" } as const;

/* ———— Barre de score toi / elle ———— */
/* La couleur du gagnant sur le fond sombre de la révélation : les teintes vives, lisibles sur le noir */
const SIDE_CLASS_SOMBRE = { toi: "text-toi", elle: "text-elle", pareil: "text-vrai" } as const;

/**
 * Une ligne du duel toi / elle : le libellé, qui l’emporte, la barre (dite aux lecteurs d’écran par son role="img"), et
 * les deux légendes. `autre` : le pronom de l’autre personne (« il » quand une utilisatrice parle d’un garçon) ; « elle »
 * par défaut. `sombre` : sur le fond noir de la révélation du verdict (le duel), la barre fine qui glisse (data-bar) et
 * les teintes vives ; ses morceaux se posent dans l’élément de l’écran (un <li>), sans enveloppe à elle.
 */
export function ScoreBar({ row, delay = 0, autre, sombre = false }: { row: ScoreRow; delay?: number; autre?: Pronom; sombre?: boolean }) {
  const lui = IlOuElle(autre).toLowerCase();
  const gagnant = row.winner === "elle" ? lui : row.winner;
  const dite = `${row.label}\u00a0: toi ${row.toiPercent} %, ${lui} ${100 - row.toiPercent} %`;
  if (sombre)
    return (
      <>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[16px] font-black leading-tight">{row.label}</span>
          <span className={cn("shrink-0 text-[14px] font-black", SIDE_CLASS_SOMBRE[row.winner])}>{gagnant}</span>
        </div>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-elle" role="img" aria-label={dite}>
          <span data-bar="" style={{ "--w": `${row.toiPercent}%`, ...delai(delay) }} className="block h-full rounded-full border-r-2 border-ink bg-toi" />
        </div>
        {(row.captionLeft || row.captionRight) && (
          <div className="mt-1.5 flex justify-between gap-3 text-[12.5px] font-extrabold text-white/60 [@media(max-height:600px)]:hidden">
            <span>{row.captionLeft}</span>
            <span>{row.captionRight}</span>
          </div>
        )}
      </>
    );
  return (
    <div className="flex flex-col gap-2 py-2.5 lg:gap-1.5 lg:py-2">
      <div className="flex justify-between gap-3 text-[15px] font-black">
        <span>{row.label}</span>
        <span style={{ color: SIDE_COLOR[row.winner] }}>{gagnant}</span>
      </div>
      <div className="flex h-3.5 overflow-hidden rounded-[7px] bg-[rgba(255,79,154,0.35)]" role="img" aria-label={dite}>
        <span data-grow="" className="bg-toi" style={{ width: `${row.toiPercent}%`, ...delai(delay) }} />
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
export function ScoreCard({ rows, className, autre }: { rows: ScoreRow[]; className?: string; autre?: Pronom }) {
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
/**
 * Les étapes (franchies en vert, la tienne en bleu, les suivantes verrouillées), ou la température (juste où vous êtes).
 * `variant="compact"` : la version d’une feuille (le contact de l’accueil), un fil et des points, les noms dessous.
 */
export function LevelPath({ current, variant = "normal", className }: { current: LevelId; variant?: "normal" | "compact"; className?: string }) {
  if (variant === "compact") return <LevelPathCompact current={current} className={className} />;
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
                /* L’étape en cours bat par un anneau sur le compositeur (une ombre animée repeindrait la page à chaque image) */
                data-beat={now ? "doux" : undefined}
                className={cn("flex size-[50px] items-center justify-center rounded-[25px]", done && "bg-vrai-ink", now && "bg-toi-ink", !done && !now && "bg-white shadow-thin")}
              >
                {done && <Icon name="check" size={20} color="#FFFFFF" stroke={3.2} />}
                {now && (temperature ? <span className="size-3 rounded-full bg-white" /> : <span className="text-[18px] font-black text-white">{i + 1}</span>)}
                {!done && !now && !temperature && <Icon name="lock" size={18} color="#B4B1A9" />}
              </span>
              <span className={cn("text-[13px] font-black leading-[1.2]", !done && !now ? "text-muted" : "text-ink")}>
                {l.label}
                <span className="sr-only">{etatDuNiveau(i, idx, temperature)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Les niveaux en version compacte : un fil, des points, les noms dessous. En couple, la température : juste où vous êtes, sans coches. */
function LevelPathCompact({ current, className }: { current: LevelId; className?: string }) {
  const { levels, index: idx, temperature } = scaleOf(current);
  const last = levels.length - 1;
  const doneShare = idx > 0 ? ((idx - 1) / idx) * 100 : 0;
  return (
    <ol className={cn("relative m-0 grid list-none grid-cols-4 p-0", className)}>
      <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-2 h-0.5 -translate-y-1/2 rounded-full bg-[#E6E3DC]" />
      {!temperature && idx > 0 && (
        <span
          aria-hidden="true"
          className="absolute left-[12.5%] top-2 h-0.5 -translate-y-1/2 rounded-full"
          style={{
            width: `${(idx / last) * 75}%`,
            background: `linear-gradient(90deg, #12C08A 0%, #12C08A ${doneShare}%, #3D8BFF ${doneShare}%, #3D8BFF 100%)`,
          }}
        />
      )}
      {levels.map((l, i) => {
        const done = !temperature && i < idx;
        const now = i === idx;
        return (
          <li key={l.id} className="relative flex flex-col items-center gap-1.5 text-center" aria-current={now ? "step" : undefined}>
            <span
              data-beat={now ? "" : undefined}
              className={cn(
                "flex size-4 items-center justify-center rounded-full",
                done && "bg-vrai-ink",
                now && "bg-toi-ink",
                !done && !now && "bg-white shadow-[inset_0_0_0_1.5px_#D9D6CF]",
              )}
            >
              {done && <Icon name="check" size={9} color="#FFFFFF" stroke={4} />}
              {now && <span className="size-1.5 rounded-full bg-white" />}
            </span>
            <span className={cn("px-0.5 text-[11.5px] font-black leading-[1.2]", !done && !now ? "text-grey" : "text-ink")}>
              {l.label}
              <span className="sr-only">{etatDuNiveau(i, idx, temperature)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ———— Points de progression du parcours (haut à droite) ———— */
/** Les points se voient, l’étape se dit : « Étape n sur 3 » aux lecteurs d’écran (sur ordinateur, FlowSteps la porte). */
export function ProgressDots({ total = 3, current }: { total?: number; current: number }) {
  return (
    <>
      <div aria-hidden="true" className="flex w-[72px] gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-[3px]", i < current ? "bg-ink" : "bg-track")} />
        ))}
      </div>
      <span className="sr-only">{`Étape ${current} sur ${total}`}</span>
    </>
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
              {done ? (
                <DoneCheck size={30} />
              ) : (
                <span className={cn("flex size-[30px] shrink-0 items-center justify-center rounded-[15px] text-[14px] font-black", on ? "bg-ink text-white" : "bg-white text-grey shadow-thin")}>{n}</span>
              )}
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
