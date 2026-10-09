import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ChapterBlock } from "@/types";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Icon } from "./icons";
import { PlayCard } from "./cards";
import { ConfidenceLine, Fact, Tag } from "./messages";
import { ClampedBubble } from "./clamp";
import { ScoreCard } from "./progress";

/* ———— En-tête de chapitre : pastille encre + surtitre + titre ———— */
export function ChapterHeader({ number, kicker, title, id }: { number: number; kicker?: string; title: string; id?: string }) {
  return (
    /* La pastille se centre sur le titre et déborde de 6 px (compensés par les marges) : le surtitre reste à 2 px du titre, sur une ligne comme sur deux */
    <div className="mb-1.5 mt-3.5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5">
      {kicker && <div className="col-start-2 row-start-1 text-[13px] font-black text-grey">{kicker}</div>}
      <span
        className={cn("col-start-1 -my-1.5 flex h-[38px] min-w-[38px] items-center justify-center rounded-[19px] bg-ink px-2.5 text-[16px] font-black text-white shadow-ink", kicker && "row-start-2")}
        aria-hidden="true"
      >
        {number}
      </span>
      <h2 id={id} className={cn("col-start-2 m-0 text-[24px] font-black leading-[1.1] tracking-[-0.02em]", kicker && "row-start-2")}>
        <span className="sr-only">Chapitre {number} : </span>
        {title}
      </h2>
    </div>
  );
}

/** Séparateur entre chapitres. */
export function ChapterRule() {
  return <div aria-hidden="true" className="my-4 h-0.5 bg-line lg:my-1.5" />;
}

/* ———— Les blocs d’un chapitre ———— */
export function Essential({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[21px] font-black leading-[1.2] tracking-[-0.01em]">{children}</p>;
}

export function Seen({ title = "Ce qu’on voit", facts, messages, factsAfter }: Extract<ChapterBlock, { kind: "seen" }>) {
  return (
    <div className="flex flex-col gap-2 rounded-card bg-white p-3.5 shadow-card">
      <div className="text-[13px] font-black text-grey">{title}</div>
      {facts?.map((f) => <Fact key={f}>{f}</Fact>)}
      {messages && messages.length > 0 && (
        <div className="flex flex-col gap-2">
          {messages.map((m, i) => (
            <ClampedBubble key={i} from={m.from} caption={m.caption ?? (m.from === "toi" ? "" : undefined)} text={m.text} />
          ))}
        </div>
      )}
      {factsAfter?.map((f) => <Fact key={f}>{f}</Fact>)}
    </div>
  );
}

export function Meaning({ children, label = "Ce que ça veut dire" }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[13px] font-black text-grey">{label}</div>
      <p className="m-0 text-[16px] font-extrabold leading-[1.45]">{children}</p>
    </div>
  );
}

function Timeline({ items }: Extract<ChapterBlock, { kind: "timeline" }>) {
  return (
    <>
      {items.map((it) => (
        <div key={it.title} className="flex flex-col gap-1.5 rounded-card bg-white p-3.5 shadow-card">
          <div className="text-[13px] font-black text-grey">{it.title}</div>
          <div className="text-[14px] font-extrabold leading-[1.45]">{it.text}</div>
          {it.message && <ClampedBubble from={it.message.from} caption="" text={it.message.text} />}
        </div>
      ))}
    </>
  );
}

function Duo({ title, text, trophies }: Extract<ChapterBlock, { kind: "duo" }>) {
  return (
    <>
      <div className="flex flex-col gap-2 rounded-card bg-white p-4 shadow-selected">
        <div className="flex items-center gap-2.5">
          <BubbleLogo size={44} />
          <span className="text-[22px] font-black">{title}</span>
        </div>
        <div className="text-[14px] font-extrabold leading-[1.45]">{text}</div>
      </div>
      {trophies.map((t) => (
        <div key={t.title} data-pop="" className="flex items-center gap-3 rounded-card bg-white px-3.5 py-3 shadow-card">
          <span
            aria-hidden="true"
            className="flex size-[42px] shrink-0 items-center justify-center rounded-[21px] text-[20px]"
            style={{ background: t.side === "toi" ? "rgba(61,139,255,0.14)" : "rgba(255,79,154,0.14)" }}
          >
            🏆
          </span>
          <div className="flex-1">
            <div className="text-[15px] font-black">{t.title}</div>
            <div className="text-[12px] font-extrabold text-grey">{t.text}</div>
          </div>
        </div>
      ))}
    </>
  );
}

function Scenarios({ items }: Extract<ChapterBlock, { kind: "scenarios" }>) {
  return (
    <>
      {items.map((s) => (
        <div key={s.title} className="flex flex-col gap-1.5 rounded-card bg-white p-3.5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-black">{s.title}</span>
            <Tag tone={s.tag} />
          </div>
          <div className="text-[14px] font-bold leading-[1.45] text-soft">{s.text}</div>
        </div>
      ))}
    </>
  );
}

function Plan({ items }: Extract<ChapterBlock, { kind: "plan" }>) {
  return (
    <ol className="flex flex-col rounded-card bg-white px-4 py-1 shadow-card">
      {items.map((p) => (
        <li key={p.when} className="flex gap-3 border-b border-[rgba(17,17,20,0.07)] py-2.5">
          <span className="w-[78px] shrink-0 text-[13px] font-black text-toi-ink">{p.when}</span>
          <div>
            <div className="text-[15px] font-black">{p.title}</div>
            <div className="text-[12px] font-extrabold text-grey">{p.text}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ———— Le rapport raconté ———— */
/** Des paragraphes séparés par un saut de ligne. */
function Paragraphs({ text, className }: { text: string; className: string }) {
  return (
    <>
      {text.split(/\n+/).filter(Boolean).map((p, i) => (
        <p key={i} className={cn("m-0", className)}>
          {p}
        </p>
      ))}
    </>
  );
}

function Lead({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Paragraphs text={text} className="text-[18px] font-extrabold leading-[1.5] tracking-[-0.005em]" />
    </div>
  );
}

function Story({ text, messages }: Extract<ChapterBlock, { kind: "story" }>) {
  return (
    <div className="flex flex-col gap-3">
      <Paragraphs text={text} className="text-[16px] font-bold leading-[1.6] text-ink" />
      {messages && messages.length > 0 && (
        <div className="flex flex-col gap-2 rounded-card bg-white p-3.5 shadow-card">
          {messages.map((m, i) => (
            <ClampedBubble key={i} from={m.from} caption={m.caption} text={m.text} />
          ))}
        </div>
      )}
    </div>
  );
}

function Punchline({ text, onShare }: { text: string; onShare?: () => void }) {
  return (
    <div className="relative rounded-card bg-ink px-4 py-3.5 text-white shadow-ink">
      <p className={cn("m-0 text-[18px] font-black leading-[1.3] tracking-[-0.01em]", onShare && "pr-10")}>{text}</p>
      {/* La chute se partage en image (story), prénoms masqués */}
      {onShare && (
        <button
          type="button"
          onClick={onShare}
          aria-label="Partager cette phrase en image"
          className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 after:absolute after:-inset-1 after:content-['']"
        >
          <Icon name="share" size={16} color="#FFFFFF" stroke={2.4} />
        </button>
      )}
    </div>
  );
}

function Stop({ items }: Extract<ChapterBlock, { kind: "stop" }>) {
  return (
    <>
      {items.map((s) => (
        <div key={s.title} className="flex flex-col gap-2 rounded-card bg-white p-3.5 shadow-card">
          <div className="flex items-center gap-2.5">
            <span aria-hidden="true" className="flex size-[34px] shrink-0 items-center justify-center rounded-[17px] bg-[rgba(255,79,154,0.14)] text-[16px]">
              ✋
            </span>
            <span className="text-[15px] font-black">{s.title}</span>
          </div>
          <div className="text-[14px] font-bold leading-[1.45] text-soft">{s.text}</div>
          {s.messages?.map((m, i) => (
            <ClampedBubble key={i} from={m.from} caption={m.caption} text={m.text} />
          ))}
        </div>
      ))}
    </>
  );
}

function Ending({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-white p-4 shadow-selected">
      <div className="flex items-center gap-2.5">
        <BubbleLogo size={36} />
        <span className="text-[13px] font-black text-grey">Le mot de la fin</span>
      </div>
      <Paragraphs text={text} className="text-[16px] font-extrabold leading-[1.55]" />
    </div>
  );
}

/** Rend un bloc de chapitre. `renderQuestion` permet à l’écran de brancher le bouton « Copier ». */
/** `autre` : le pronom de l’autre personne, pour la légende des scores (« Il » ou « Elle »). */
export function Block({
  block,
  renderQuestion,
  onShare,
  autre,
}: {
  block: ChapterBlock;
  renderQuestion?: (b: Extract<ChapterBlock, { kind: "question" }>) => ReactNode;
  onShare?: () => void;
  autre?: "il" | "elle";
}) {
  switch (block.kind) {
    case "essential":
      return <Essential>{block.text}</Essential>;
    case "seen":
      return <Seen {...block} />;
    case "meaning":
      return <Meaning>{block.text}</Meaning>;
    case "play":
      return <PlayCard>{block.text}</PlayCard>;
    case "confidence":
      return <ConfidenceLine level={block.level}>{block.text}</ConfidenceLine>;
    case "scores":
      return <ScoreCard rows={block.rows} autre={autre} />;
    case "timeline":
      return <Timeline {...block} />;
    case "duo":
      return <Duo {...block} />;
    case "scenarios":
      return <Scenarios {...block} />;
    case "plan":
      return <Plan {...block} />;
    case "question":
      return renderQuestion ? <>{renderQuestion(block)}</> : null;
    case "lead":
      return <Lead text={block.text} />;
    case "story":
      return <Story {...block} />;
    case "punchline":
      return <Punchline text={block.text} onShare={onShare} />;
    case "stop":
      return <Stop {...block} />;
    case "ending":
      return <Ending text={block.text} />;
  }
}

/** `onShare` : partager un bloc en image (aujourd’hui, la chute d’un chapitre), d’après sa place dans le chapitre. */
export function Blocks({
  blocks,
  className,
  renderQuestion,
  onShare,
  autre,
}: {
  blocks: ChapterBlock[];
  className?: string;
  renderQuestion?: Parameters<typeof Block>[0]["renderQuestion"];
  onShare?: (index: number) => void;
  autre?: "il" | "elle";
}) {
  return (
    <div className={cn("contents", className)}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} renderQuestion={renderQuestion} onShare={onShare && b.kind === "punchline" ? () => onShare(i) : undefined} autre={autre} />
      ))}
    </div>
  );
}
