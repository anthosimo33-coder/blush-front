"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { copyText, useFilePicker } from "@/lib/hooks";
import { sendToCrush, type CrushAnswer } from "@/services/api";
import { REPORT } from "@/mocks/report";
import { FICHE } from "@/mocks/daily";
import { STORY } from "@/mocks/story";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import { FileInput, TypingDots } from "@/components/ui/FileInput";
import { Icon, type IconName } from "@/components/ui/icons";
import { Bubble as MessageBubble, ConfidenceLine, Tag } from "@/components/ui/messages";
import { LEVELS } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/surfaces";
import { AppScreen } from "@/components/shell/AppScreen";
import type { Reply } from "@/types";

/** Largeur de la fenêtre de conv sur desktop ; l’en-tête (logo, « Mon compte ») s’aligne dessus. */
const WINDOW_W = 720;

type Msg =
  | { id: number; from: "crush"; intro: "next" | "hint" }
  | { id: number; from: "crush"; reading: string }
  | { id: number; from: "crush"; result: CrushAnswer; fromCapture?: boolean }
  | { id: number; from: "toi"; text: string }
  | { id: number; from: "toi"; images: string[] }
  | { id: number; from: "toi"; file: { name: string; size: number } };

/** Un message sans son identifiant (il est attribué au moment de l’ajouter à la conv). */
type NewMsg = Msg extends infer T ? (T extends Msg ? Omit<T, "id"> : never) : never;

const INTRO: Msg[] = [
  { id: -2, from: "crush", intro: "next" },
  { id: -1, from: "crush", intro: "hint" },
];

/*
 * Écran 13 — Accueil. Au quotidien, tout passe par le chat avec CRUSH : écrire, ajouter des captures,
 * importer un nouvel export. Le rapport et sa fiche restent à un toucher,
 * dans les détails du contact (comme la fiche d’un contact dans Messages).
 * Mobile : plein écran. Desktop : une fenêtre de conv.
 */
export function HomeScreen() {
  const shots = useFilePicker();
  const exp = useFilePicker();
  const [msgs, setMsgs] = useState<Msg[]>(INTRO);
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [details, setDetails] = useState(false);
  const nextId = useRef(1);
  const thread = useRef<HTMLDivElement>(null);
  const urls = useRef<string[]>([]);
  const typed = text.trim().length > 0;

  /* Chaque nouveau message fait défiler la conv jusqu’en bas (la page sur mobile, la fenêtre sur desktop) */
  useEffect(() => {
    if (msgs.length === INTRO.length) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (window.matchMedia("(min-width: 1024px)").matches) thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, [msgs]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const id = () => nextId.current++;

  /** Ton message part, CRUSH tape « … », puis sa réponse remplace les trois points. */
  const exchange = async (mine: Msg, label: string, answer: () => Promise<NewMsg>) => {
    const readingId = id();
    setMsgs((m) => [...m, mine, { id: readingId, from: "crush", reading: label }]);
    const next = await answer();
    setMsgs((m) => m.map((x) => (x.id === readingId ? ({ ...next, id: readingId } as Msg) : x)));
  };

  const ask = (mine: Msg, payload: { text?: string; files?: File[] }, fromCapture = false) =>
    exchange(mine, "CRUSH analyse sa réponse", async () => {
      return { from: "crush", result: await sendToCrush(payload), fromCapture };
    });

  const sendText = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    ask({ id: id(), from: "toi", text: t }, { text: t });
  };

  const sendImages = (files: File[]) => {
    const list = files.map((f) => URL.createObjectURL(f));
    urls.current.push(...list);
    ask({ id: id(), from: "toi", images: list }, { files }, true);
  };

  const sendExport = ([file]: File[]) => ask({ id: id(), from: "toi", file: { name: file.name, size: file.size } }, { files: [file] });

  return (
    <AppScreen
      requires="crushplus"
      aside={null}
      mainWidth={WINDOW_W}
      frameWidth={WINDOW_W}
      contentGap={0}
      desktopTopPad={0}
      mobileTop={
        /* La barre du haut, comme dans Messages : le contact au centre, translucide et toujours visible */
        <header className="sticky top-0 z-20 grid shrink-0 grid-cols-[1fr_auto_1fr] items-start border-b border-[rgba(17,17,20,0.06)] bg-[rgba(244,242,237,0.86)] px-4 pb-2.5 pt-2.5 backdrop-blur-xl lg:hidden">
          <Link href="/app" aria-label="CRUSH" className="mt-1.5 flex size-9 items-center justify-start">
            <BubbleLogo size={30} />
          </Link>
          <ContactButton onClick={() => setDetails(true)} />
          <div className="mt-0.5 flex justify-end">
            <IconButton href="/compte" icon="user" label="Mon compte" iconSize={19} className="!size-10 !shadow-soft" />
          </div>
        </header>
      }
    >
      <h1 className="sr-only">Ta conv avec CRUSH</h1>
      <div className="-mx-[22px] -mt-1 flex flex-1 flex-col lg:mx-0 lg:mt-0 lg:h-[clamp(540px,calc(100dvh_-_132px),700px)] lg:flex-none lg:overflow-hidden lg:rounded-[32px] lg:bg-white lg:shadow-[0_0_0_1px_rgba(17,17,20,0.05),0_2px_6px_rgba(17,17,20,0.03),0_48px_90px_-48px_rgba(17,17,20,0.32)]">
        {/* Desktop : la barre de la fenêtre */}
        <div className="hidden h-[76px] shrink-0 items-center border-b border-[rgba(17,17,20,0.06)] px-4 lg:flex">
          <ContactButton inline onClick={() => setDetails(true)} />
        </div>

        {/* La conv : les messages se posent en bas, groupés par expéditeur */}
        <div
          ref={thread}
          role="log"
          aria-label="Ta conv avec CRUSH"
          aria-live="polite"
          className="flex flex-1 flex-col justify-end px-[18px] pb-4 pt-8 lg:overflow-y-auto lg:bg-[#F7F5F1] lg:px-7 lg:pb-6"
        >
          <Thread msgs={msgs} />
        </div>

        {/* La barre de saisie : « + » pour des captures ou un export, ou un message à CRUSH */}
        <form
          onSubmit={sendText}
          className="sticky bottom-0 z-10 -mb-6 mt-auto border-t border-[rgba(17,17,20,0.06)] bg-[rgba(244,242,237,0.88)] px-[18px] pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:static lg:mb-0 lg:bg-white lg:px-6 lg:py-4 lg:backdrop-blur-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <button
                type="button"
                aria-label="Ajouter des captures ou un export"
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => setMenu((v) => !v)}
                className="lift lift-sm flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-soft lg:bg-[#F4F2ED] lg:shadow-none"
              >
                <Icon name="plus" size={21} color="#121214" stroke={2.8} className={cn("transition-transform duration-300 [transition-timing-function:var(--ease-pop)]", menu && "rotate-45")} />
              </button>
              {menu && (
                <AddMenu
                  onClose={() => setMenu(false)}
                  onPick={(what) => {
                    setMenu(false);
                    (what === "shots" ? shots : exp).open();
                  }}
                />
              )}
            </div>
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-white pl-[18px] pr-1 shadow-[inset_0_0_0_1px_rgba(17,17,20,0.09)] transition-shadow focus-within:shadow-[inset_0_0_0_1.5px_#121214] lg:bg-[#F4F2ED] lg:shadow-none lg:focus-within:shadow-[inset_0_0_0_1.5px_#121214]">
              <span className="sr-only">Écris à CRUSH, ou colle sa réponse</span>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Écris à CRUSH"
                enterKeyHint="send"
                className="min-w-0 flex-1 bg-transparent text-[16px] font-extrabold text-ink outline-none placeholder:text-grey"
              />
              {typed && (
                <button type="submit" aria-label="Envoyer" data-popin="" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink shadow-ink">
                  <Icon name="arrow" size={17} color="#FFFFFF" stroke={2.8} className="-rotate-90" />
                </button>
              )}
            </label>
          </div>
          <FileInput inputRef={shots.ref} accept="image/*" multiple onFiles={sendImages} label="Captures d’écran de sa réponse" />
          <FileInput inputRef={exp.ref} accept=".zip,.txt,application/zip,text/plain" onFiles={sendExport} label="Export de votre conv" />
        </form>
      </div>

      <ContactSheet open={details} onClose={() => setDetails(false)} />
    </AppScreen>
  );
}

/* ———— En-tête : le contact (un toucher ouvre ses détails) ———— */
function ContactButton({ inline, onClick }: { inline?: boolean; onClick: () => void }) {
  const status = (
    <span className="truncate text-[12px] font-extrabold text-grey">
      {REPORT.verdict.emoji} {REPORT.verdict.short} · <span className="text-vrai-ink">{REPORT.trend}</span>
    </span>
  );
  if (inline)
    return (
      <button type="button" onClick={onClick} aria-haspopup="dialog" className="lift flex items-center gap-3 rounded-[20px] py-1.5 pl-1.5 pr-3.5 text-left text-ink">
        <Avatar tone="elle" size={44} fontSize={18} className="lift-pop">
          {FICHE.person.initial}
        </Avatar>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1 text-[17px] font-black leading-tight">
            {FICHE.person.name} et toi
            <Icon name="chevron" size={14} color="#8A8780" stroke={2.8} className="lift-chev" />
          </span>
          {status}
        </span>
      </button>
    );
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" className="flex min-w-0 flex-col items-center gap-1 px-1 text-ink">
      <Avatar tone="elle" size={46} fontSize={19}>
        {FICHE.person.initial}
      </Avatar>
      <span className="flex items-center gap-0.5 text-[13px] font-black leading-tight">
        {FICHE.person.name} et toi
        <Icon name="chevron" size={12} color="#8A8780" stroke={3} />
      </span>
      {status}
    </button>
  );
}

/* ———— La conv ———— */
type Pos = "single" | "first" | "middle" | "last";

function Thread({ msgs }: { msgs: Msg[] }) {
  /* Chaque message peut donner plusieurs bulles ; on regroupe les bulles consécutives d’un même expéditeur */
  const items = msgs.flatMap((m) => bubblesOf(m).map((node, k) => ({ key: `${m.id}-${k}`, from: m.from, node })));
  const groups: { from: Msg["from"]; items: typeof items }[] = [];
  for (const it of items) {
    const g = groups[groups.length - 1];
    if (g && g.from === it.from) g.items.push(it);
    else groups.push({ from: it.from, items: [it] });
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g, gi) => (
        <div key={g.items[0].key} className="flex flex-col gap-[3px]">
          {g.from === "crush" && gi === 0 && <p className="m-0 mb-1.5 pl-[42px] text-[12px] font-black text-grey">CRUSH</p>}
          {g.items.map((it, i) => {
            const n = g.items.length;
            const pos: Pos = n === 1 ? "single" : i === 0 ? "first" : i === n - 1 ? "last" : "middle";
            return g.from === "crush" ? (
              <div key={it.key} data-rise="" className="flex items-end gap-2" style={{ "--d": `${i * 0.06}s` } as CSSProperties}>
                {i === n - 1 ? <BubbleLogo size={34} className="-mb-0.5 shrink-0" /> : <span aria-hidden="true" className="w-[34px] shrink-0" />}
                <BubbleShape side="crush" pos={pos} node={it.node} />
              </div>
            ) : (
              <div key={it.key} data-rise="" className="flex justify-end">
                <BubbleShape side="toi" pos={pos} node={it.node} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Une bulle : sa forme vient de sa place dans le groupe, son style de son contenu. */
type BubbleNode = { body: ReactNode; tone?: "plain" | "accent" | "toi" | "bare"; className?: string };

function BubbleShape({ side, pos, node }: { side: "crush" | "toi"; pos: Pos; node: BubbleNode }) {
  const tone = node.tone ?? (side === "toi" ? "toi" : "plain");
  const corners =
    side === "crush"
      ? { single: "", first: "rounded-bl-[6px]", middle: "rounded-l-[6px]", last: "rounded-tl-[6px]" }[pos]
      : { single: "", first: "rounded-br-[6px]", middle: "rounded-r-[6px]", last: "rounded-tr-[6px]" }[pos];
  return (
    <div
      className={cn(
        "flex max-w-[318px] flex-col rounded-[20px] text-left",
        corners,
        tone === "plain" && "bg-white px-4 py-3 text-ink shadow-[0_0_0_1px_rgba(17,17,20,0.045),0_1px_2px_rgba(17,17,20,0.06)]",
        tone === "accent" && "bg-[linear-gradient(180deg,#F3F8FF,#FFFFFF)] px-4 py-3.5 text-ink shadow-play",
        tone === "toi" && "max-w-[80%] bg-toi-ink px-4 py-2.5 text-white",
        tone === "bare" && "overflow-hidden",
        node.className,
      )}
    >
      {node.body}
    </div>
  );
}

function bubblesOf(m: Msg): BubbleNode[] {
  if ("intro" in m)
    return m.intro === "next"
      ? [
          {
            tone: "accent",
            body: (
              <span className="flex items-start gap-2.5">
                <Icon name="bolt" size={18} color="#3D8BFF" className="mt-0.5 shrink-0" />
                <span className="flex flex-col gap-[3px]">
                  <span className="text-[12px] font-black text-toi-ink">À toi de jouer</span>
                  <span className="text-[16px] font-black leading-[1.35]">{REPORT.nextStep}</span>
                </span>
              </span>
            ),
          },
        ]
      : [
          {
            body: (
              <span className="flex flex-col gap-1">
                <span className="text-[16px] font-black leading-[1.3]">Elle vient de répondre ?</span>
                <span className="text-[14px] font-extrabold leading-[1.45] text-soft">Ajoute sa réponse : capture, export ou texte. CRUSH reconnaît tout seul.</span>
              </span>
            ),
          },
        ];
  if ("reading" in m) return [{ className: "py-3.5", body: <TypingDots label={m.reading} /> }];
  if ("text" in m) return [{ body: <span className="whitespace-pre-wrap text-[16px] font-bold leading-[1.4]">{m.text}</span> }];
  if ("images" in m)
    return [
      {
        tone: "bare",
        body: (
          <span className={cn("grid gap-0.5", m.images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {m.images.slice(0, 4).map((u, i) => (
              <span key={u} className="relative block">
                {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local d’un fichier choisi */}
                <img src={u} alt={`Capture ${i + 1}`} className={cn("block object-cover object-top", m.images.length > 1 ? "h-[150px] w-[112px]" : "h-[230px] w-[172px]")} />
                {i === 3 && m.images.length > 4 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-[rgba(17,17,20,0.55)] text-[20px] font-black text-white">+{m.images.length - 4}</span>
                )}
              </span>
            ))}
          </span>
        ),
      },
    ];
  if ("file" in m)
    return [
      {
        className: "py-3 pl-3",
        body: (
          <span className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(255,255,255,0.18)]">
              <Icon name="file" size={20} color="#FFFFFF" stroke={2.2} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-black">{m.file.name}</span>
              <span className="text-[12px] font-extrabold text-[rgba(255,255,255,0.75)]">{formatSize(m.file.size)}</span>
            </span>
          </span>
        ),
      },
    ];
  const r = m.result;
  if (r.kind === "answer")
    return [
      {
        body: (
          <span className="flex flex-col gap-2">
            <span className="text-[17px] font-black leading-[1.3]">{r.answer.title}</span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[12px] font-black text-grey">{r.answer.evidenceLabel}</span>
              <span className="text-[14px] font-extrabold leading-[1.45]">{r.answer.evidence}</span>
            </span>
            <ConfidenceLine level={r.answer.confidence}>{r.answer.limits}</ConfidenceLine>
          </span>
        ),
      },
    ];
  return [
    /* Sur une capture, CRUSH montre d’abord le message qu’il a lu */
    ...(m.fromCapture
      ? [
          {
            className: "pb-2.5 pt-3",
            body: (
              <MessageBubble from="elle" caption={r.reply.incoming.caption}>
                {r.reply.incoming.text}
              </MessageBubble>
            ),
          },
        ]
      : []),
    {
      body: (
        <span className="flex flex-col gap-1">
          <span className="text-[12px] font-black text-grey">Ce que ça veut dire</span>
          <span className="text-[17px] font-black leading-[1.3]">{r.reply.meaningTitle}</span>
          <span className="text-[14px] font-extrabold leading-[1.45] text-soft">{r.reply.meaningProof}</span>
        </span>
      ),
    },
    { body: <BestReply reply={r.reply} /> },
  ];
}

/** Un bouton secondaire de bulle : il copie, puis confirme. */
function CopyPill({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await copyText(text))) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="lift lift-sm inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-black text-ink shadow-soft"
    >
      <Icon name={copied ? "check" : "copy"} size={14} color="#121214" stroke={2.6} />
      {copied ? "Copié" : label}
    </button>
  );
}

/** La meilleure réponse à lui envoyer : une vraie bulle, à copier en un geste. La coche « Copié » confirme. */
function BestReply({ reply }: { reply: Reply }) {
  return (
    <span className="flex flex-col gap-2">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-black text-vrai-ink">Ta meilleure réponse</span>
        <Tag tone="recommandee" />
      </span>
      <span className="self-start rounded-[18px] rounded-br-[6px] bg-toi-ink px-3.5 py-2 font-message text-[15px] font-bold leading-[1.35] text-white">{reply.best}</span>
      <span className="text-[13px] font-extrabold leading-[1.45] text-grey">{reply.why}</span>
      <span className="mt-1 flex">
        <CopyPill text={reply.best} label="Copier" />
      </span>
    </span>
  );
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} ko` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

/* ———— Le menu du « + » ———— */
function AddMenu({ onClose, onPick }: { onClose: () => void; onPick: (what: "shots" | "export") => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const items: { what: "shots" | "export"; icon: IconName; title: string; sub: string }[] = [
    { what: "shots", icon: "photo", title: "Ajoute tes captures", sub: "Dans l’ordre, de la plus ancienne à la plus récente" },
    { what: "export", icon: "file", title: "Exporte votre conv.", sub: "Le fichier WhatsApp ou iMessage" },
  ];
  return (
    <>
      <button type="button" aria-label="Fermer le menu" tabIndex={-1} onClick={onClose} className="fixed inset-0 z-30 cursor-default" />
      <div
        role="menu"
        aria-label="Ajouter"
        data-popin=""
        className="absolute bottom-[calc(100%+12px)] left-0 z-40 flex w-[300px] origin-bottom-left flex-col rounded-[22px] bg-white p-1.5 shadow-[0_0_0_1px_rgba(17,17,20,0.06),0_24px_48px_-20px_rgba(17,17,20,0.45)]"
      >
        {items.map((it, i) => (
          <button
            key={it.what}
            ref={i === 0 ? first : undefined}
            type="button"
            role="menuitem"
            onClick={() => onPick(it.what)}
            className="row-hover flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-ink"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F4F2ED]">
              <Icon name={it.icon} size={20} color="#121214" stroke={2.2} />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-black">{it.title}</span>
              <span className="text-[12px] font-extrabold leading-[1.35] text-grey">{it.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ———— Les détails du contact : où vous en êtes, le rapport, sa fiche ———— */
function ContactSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="contact-titre">
      <div className="relative flex flex-col items-center gap-2 pt-1 text-center">
        <IconButton icon="close" label="Fermer" onClick={onClose} className="!absolute right-0 top-0" />
        <Avatar tone="elle" size={72} fontSize={28}>
          {FICHE.person.initial}
        </Avatar>
        <h2 id="contact-titre" className="m-0 text-[22px] font-black tracking-[-0.01em]">
          {FICHE.person.name} et toi
        </h2>
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-black">
            {REPORT.verdict.emoji} {REPORT.verdict.short}
          </span>
          <Tag tone="verite">{REPORT.trend}</Tag>
        </span>
      </div>
      <div className="rounded-[20px] bg-white px-3 pb-3 pt-4 shadow-card">
        <LevelStepper />
      </div>
      <div className="flex flex-col overflow-hidden rounded-[20px] bg-white shadow-card">
        <DetailRow href="/rapport" icon={<span className="text-[20px] leading-none">{REPORT.verdict.emoji}</span>} title="Le rapport de votre histoire" sub={STORY.period} />
        <DetailRow
          href="/app/fiche"
          icon={
            <Avatar tone="elle" size={36} fontSize={15}>
              {FICHE.person.initial}
            </Avatar>
          }
          title="Sa fiche"
          sub={FICHE.summaryShort}
          divider
        />
      </div>
    </Sheet>
  );
}

function DetailRow({ href, icon, title, sub, divider }: { href: string; icon: ReactNode; title: string; sub: string; divider?: boolean }) {
  return (
    <Link href={href} className={cn("row-hover flex items-center gap-3 px-4 py-3.5 text-ink no-underline", divider && "border-t border-[rgba(17,17,20,0.06)]")}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F4F2ED]">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-black">{title}</span>
        <span className="truncate text-[13px] font-extrabold text-grey">{sub}</span>
      </span>
      <Icon name="chevron" size={16} color="#8A8780" stroke={2.6} />
    </Link>
  );
}

/** Les 4 niveaux en version compacte : un fil, des points, les noms dessous. */
function LevelStepper({ className }: { className?: string }) {
  const idx = LEVELS.findIndex((l) => l.id === REPORT.level);
  const last = LEVELS.length - 1;
  const doneShare = idx > 0 ? ((idx - 1) / idx) * 100 : 0;
  return (
    <ol className={cn("relative m-0 grid list-none grid-cols-4 p-0", className)}>
      <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-2 h-0.5 -translate-y-1/2 rounded-full bg-[#E6E3DC]" />
      {idx > 0 && (
        <span
          aria-hidden="true"
          className="absolute left-[12.5%] top-2 h-0.5 -translate-y-1/2 rounded-full"
          style={{
            width: `${(idx / last) * 75}%`,
            background: `linear-gradient(90deg, #12C08A 0%, #12C08A ${doneShare}%, #3D8BFF ${doneShare}%, #3D8BFF 100%)`,
          }}
        />
      )}
      {LEVELS.map((l, i) => {
        const done = i < idx;
        const now = i === idx;
        return (
          <li key={l.id} className="relative flex flex-col items-center gap-1.5 text-center" aria-current={now ? "step" : undefined}>
            <span
              data-pulse={now ? "" : undefined}
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
            <span className={cn("px-0.5 text-[11.5px] font-black leading-[1.2]", !done && !now ? "text-muted" : "text-ink")}>
              {l.label}
              <span className="sr-only">{done ? " : réussi" : now ? " : niveau en cours" : " : à venir"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
