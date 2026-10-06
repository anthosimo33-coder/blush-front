"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { copyText, useFilePicker } from "@/lib/hooks";
import { sendToCrush, sendVoiceToCrush, type CrushAnswer } from "@/services/api";
import { REPORT } from "@/mocks/report";
import { FICHE } from "@/mocks/daily";
import { STORY } from "@/mocks/story";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import { FileInput } from "@/components/ui/FileInput";
import { Icon, type IconName } from "@/components/ui/icons";
import { Bubble as MessageBubble, ConfidenceLine, CrushTyping, Tag } from "@/components/ui/messages";
import { LEVELS } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/surfaces";
import { AppScreen } from "@/components/shell/AppScreen";
import type { Reply } from "@/types";
import { RecordingBar, useVoiceRecorder, VoiceNote, type VoiceClip, type VoiceError } from "./voice";

/** Largeur de la fenêtre de conv sur desktop ; l’en-tête (logo, « Mon compte ») s’aligne dessus. */
const WINDOW_W = 720;

/** `at` : l’heure du message. `seed` : pour l’intro, un moment fixé par rapport à l’ouverture (hier soir). `answered` : la réponse qui remplace « CRUSH écrit ». */
type Stamp = { at?: number; seed?: { day: number; h: number; m: number }; answered?: boolean };

type Msg = (
  | { id: number; from: "crush"; intro: "next" | "hint" }
  | { id: number; from: "crush"; reading: string; leaving?: boolean }
  | { id: number; from: "crush"; result: CrushAnswer; fromCapture?: boolean }
  | { id: number; from: "toi"; text: string }
  | { id: number; from: "toi"; images: string[] }
  | { id: number; from: "toi"; file: { name: string; size: number } }
  | { id: number; from: "toi"; voice: Pick<VoiceClip, "url" | "seconds" | "peaks"> }
  | { id: number; from: "crush"; notice: string }
) &
  Stamp;

/** Un message sans son identifiant (il est attribué au moment de l’ajouter à la conv). */
type NewMsg = Msg extends infer T ? (T extends Msg ? Omit<T, "id"> : never) : never;

const INTRO: Msg[] = [
  { id: -2, from: "crush", intro: "next", seed: { day: -1, h: 21, m: 40 } },
  { id: -1, from: "crush", intro: "hint", seed: { day: -1, h: 21, m: 41 } },
];

/* L’heure d’ouverture de l’écran, lue dans le navigateur seulement : rien au rendu serveur, donc pas d’écart à l’hydratation */
let openedAt: number | null = null;
const readOpenedAt = () => (openedAt ??= Date.now());
const noSubscription = () => () => {};
function useOpenedAt() {
  return useSyncExternalStore(noSubscription, readOpenedAt, () => null);
}

/*
 * Écran 13 — Accueil. Au quotidien, tout passe par le chat avec CRUSH : écrire, ajouter des captures,
 * importer un nouvel export. Le rapport et sa fiche restent à un toucher,
 * dans les détails du contact (comme la fiche d’un contact dans Messages).
 * Mobile : plein écran. Desktop : une fenêtre de conv.
 */
export function HomeScreen({ quick = [] }: { quick?: string[] }) {
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
  /* Les questions toutes prêtes déjà posées pendant la visite disparaissent de la rangée */
  const [asked, setAsked] = useState<string[]>([]);
  /* CRUSH « écrit » : sa bulle s’anime en haut de la conv */
  const busy = msgs.some((m) => "reading" in m);
  const opened = useOpenedAt();

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
    const sent = Date.now();
    setMsgs((m) => [...m, { ...mine, at: sent }, { id: readingId, from: "crush", reading: label, at: sent }]);
    const next = await answer();
    /* « CRUSH écrit » se replie d’abord vers sa pointe, puis la réponse monte à sa place */
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMsgs((m) => m.map((x) => (x.id === readingId ? { ...x, leaving: true } : x)));
      await new Promise((r) => setTimeout(r, 190));
    }
    setMsgs((m) => m.map((x) => (x.id === readingId ? ({ ...next, id: readingId, at: Date.now(), answered: true } as Msg) : x)));
  };

  const ask = (mine: Msg, payload: { text?: string; files?: File[] }, fromCapture = false) =>
    exchange(mine, "CRUSH analyse sa réponse", async () => {
      return { from: "crush", result: await sendToCrush(payload), fromCapture };
    });

  /* Une question toute prête part tout de suite, comme si tu l’avais écrite */
  const sendQuick = (q: string) => {
    setAsked((a) => [...a, q]);
    ask({ id: id(), from: "toi", text: q }, { text: q });
  };

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

  /* Le vocal : le micro est demandé au premier toucher ; sans micro, CRUSH le dit dans la conv */
  const micRefused = (e: VoiceError) =>
    setMsgs((m) => [
      ...m,
      {
        id: id(),
        from: "crush",
        at: Date.now(),
        notice:
          e === "denied"
            ? "Je n’ai pas accès à ton micro. Autorise-le dans les réglages de ton navigateur, ou écris-moi."
            : "Les vocaux ne marchent pas sur ce navigateur. Écris-moi, je te réponds pareil.",
      },
    ]);
  const voice = useVoiceRecorder({ onError: micRefused, onLimit: () => void sendVoice() });
  /* La barre d’enregistrement n’apparaît qu’une fois le micro ouvert (pendant la question d’autorisation, rien ne bouge) */
  const recording = voice.phase === "recording";
  const quickLeft = quick.filter((q) => !asked.includes(q));

  const sendVoice = async () => {
    const clip = await voice.stop(true);
    if (clip === "empty") {
      setMsgs((m) => [...m, { id: id(), from: "crush", at: Date.now(), notice: "Je n’ai rien entendu. Vérifie ton micro et réessaie, ou écris-moi." }]);
      return;
    }
    if (!clip) return;
    urls.current.push(clip.url);
    exchange({ id: id(), from: "toi", voice: { url: clip.url, seconds: clip.seconds, peaks: clip.peaks } }, "CRUSH écoute ton vocal", async () => ({
      from: "crush",
      result: await sendVoiceToCrush({ audio: clip.blob, seconds: clip.seconds }),
    }));
  };

  return (
    <AppScreen
      requires="crushplus"
      aside={null}
      mainWidth={WINDOW_W}
      frameWidth={WINDOW_W}
      contentGap={0}
      desktopTopPad={0}
      mobileTop={
        /* En haut : CRUSH en grand au centre (sa bulle flotte et s’anime quand il répond), Sophie à droite comme un contact.
           Le fond s’efface vers le bas : les messages passent dessous en douceur. */
        <header className="pointer-events-none sticky top-0 z-20 shrink-0 lg:hidden">
          <span aria-hidden="true" className="absolute inset-0 bg-[rgba(244,242,237,0.84)] backdrop-blur-xl [mask-image:linear-gradient(180deg,#000_calc(100%_-_22px),transparent)]" />
          <div className="relative grid grid-cols-[1fr_auto_1fr] items-start px-4 pb-5 pt-[max(6px,env(safe-area-inset-top))]">
            <div className="pointer-events-auto mt-3 flex">
              <IconButton href="/compte" icon="user" label="Mon compte" iconSize={19} className="!size-10 !shadow-soft" />
            </div>
            <CrushTitle big busy={busy} onClick={() => setDetails(true)} />
            <div className="mt-2 flex justify-end">
              <SophieButton />
            </div>
          </div>
        </header>
      }
    >
      <h1 className="sr-only">Ta conv avec CRUSH</h1>
      <div className="-mx-[22px] -mt-1 flex flex-1 flex-col lg:mx-0 lg:mt-0 lg:h-[clamp(540px,calc(100dvh_-_132px),700px)] lg:flex-none lg:overflow-hidden lg:rounded-[32px] lg:bg-white lg:shadow-[0_0_0_1px_rgba(17,17,20,0.05),0_2px_6px_rgba(17,17,20,0.03),0_48px_90px_-48px_rgba(17,17,20,0.32)]">
        {/* Desktop : la barre de la fenêtre, comme sur mobile (CRUSH au centre, Sophie à droite) */}
        <div className="hidden h-[112px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[rgba(17,17,20,0.06)] px-5 lg:grid">
          <span aria-hidden="true" />
          <CrushTitle busy={busy} onClick={() => setDetails(true)} />
          <div className="flex justify-end">
            <SophieButton />
          </div>
        </div>

        {/* La conv : les messages se posent en bas, groupés par expéditeur */}
        <div
          ref={thread}
          role="log"
          aria-label="Ta conv avec CRUSH"
          aria-live="polite"
          className="flex flex-1 flex-col justify-end px-[18px] pb-4 pt-8 lg:overflow-y-auto lg:bg-[#F7F5F1] lg:px-7 lg:pb-6"
        >
          <Thread msgs={msgs} opened={opened} />
        </div>

        {/* La barre de saisie : « + » pour des captures ou un export, ou un message à CRUSH */}
        <form
          onSubmit={sendText}
          className="sticky bottom-0 z-10 -mb-6 mt-auto border-t border-[rgba(17,17,20,0.06)] bg-[rgba(244,242,237,0.88)] px-[18px] pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:static lg:mb-0 lg:bg-white lg:px-6 lg:py-4 lg:backdrop-blur-none"
        >
          {/* Les questions toutes prêtes, au-dessus du champ (rien pendant que tu écris, que CRUSH répond ou que tu enregistres) */}
          {quickLeft.length > 0 && !typed && !busy && !menu && voice.phase === "idle" && (
            <div
              role="group"
              aria-label="Questions toutes prêtes"
              className="-mx-[18px] mb-2.5 flex gap-2 overflow-x-auto px-[18px] pb-px [mask-image:linear-gradient(90deg,#000_calc(100%_-_28px),transparent)] [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:gap-1.5 lg:overflow-visible lg:px-0 lg:[mask-image:none] [&::-webkit-scrollbar]:hidden"
            >
              {quickLeft.map((q, i) => (
                <button
                  key={q}
                  type="button"
                  value={q}
                  onClick={(e) => sendQuick(e.currentTarget.value)}
                  data-popin=""
                  style={{ "--d": `${i * 0.05}s` } as CSSProperties}
                  className="h-9 shrink-0 rounded-full bg-white px-3.5 text-[14px] font-extrabold text-toi-ink lg:px-3 shadow-[inset_0_0_0_1.5px_rgba(26,102,219,0.28)] transition-[box-shadow,background-color,color] duration-200 active:bg-toi-ink active:text-white lg:bg-[#F3F7FF] [@media(hover:hover)]:hover:shadow-[inset_0_0_0_1.5px_#1A66DB]"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2.5">
            {recording ? (
              /* En plein vocal : la corbeille remplace le « + » */
              <button
                type="button"
                aria-label="Annuler le vocal"
                onClick={() => void voice.stop(false)}
                data-popin=""
                className="lift lift-sm flex size-11 shrink-0 items-center justify-center rounded-full bg-white shadow-soft lg:bg-[#F4F2ED] lg:shadow-none"
              >
                <Icon name="trash" size={19} color="#D93036" stroke={2.4} />
              </button>
            ) : (
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
            )}
            {recording ? (
              <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-white pl-4 pr-1 shadow-[inset_0_0_0_1.5px_#121214] lg:bg-[#F4F2ED]">
                <RecordingBar seconds={voice.seconds} levels={voice.levels} onSend={() => void sendVoice()} />
              </div>
            ) : (
              <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-white pl-[18px] pr-1 shadow-[inset_0_0_0_1px_rgba(17,17,20,0.09)] transition-shadow focus-within:shadow-[inset_0_0_0_1.5px_#121214] lg:bg-[#F4F2ED] lg:shadow-none lg:focus-within:shadow-[inset_0_0_0_1.5px_#121214]">
                <span className="sr-only">Écris à CRUSH, ou colle sa réponse</span>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Écris à CRUSH"
                  enterKeyHint="send"
                  className="min-w-0 flex-1 bg-transparent text-[16px] font-extrabold text-ink outline-none placeholder:text-grey"
                />
                {/* Texte tapé : la flèche pour envoyer. Champ vide : le vocal, comme dans Messages */}
                {typed ? (
                  <button type="submit" aria-label="Envoyer" data-popin="" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink shadow-ink">
                    <Icon name="arrow" size={17} color="#FFFFFF" stroke={2.8} className="-rotate-90" />
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Enregistrer un vocal"
                    onClick={() => void voice.start()}
                    disabled={voice.phase === "starting"}
                    aria-busy={voice.phase === "starting" || undefined}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink shadow-ink transition-transform active:scale-95 disabled:animate-pulse"
                  >
                    <Icon name="wave" size={18} color="#FFFFFF" stroke={2.6} />
                  </button>
                )}
              </label>
            )}
          </div>
          <FileInput inputRef={shots.ref} accept="image/*" multiple onFiles={sendImages} label="Captures d’écran de sa réponse" />
          <FileInput inputRef={exp.ref} accept=".zip,.txt,application/zip,text/plain" onFiles={sendExport} label="Export de votre conv" />
        </form>
      </div>

      <ContactSheet open={details} onClose={() => setDetails(false)} />
    </AppScreen>
  );
}

/* ———— En-tête : CRUSH en grand, comme le personnage de la conv (sa bulle, son nom en pastille) ———— */
function CrushTitle({ busy, onClick, big = false }: { busy: boolean; onClick: () => void; big?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label="CRUSH, ce qu’il voit de vous deux" className="group pointer-events-auto flex flex-col items-center px-1 text-ink">
      <span data-float="" className="block" style={{ "--r": "-3deg" } as CSSProperties}>
        <span className="block drop-shadow-[0_16px_18px_rgba(232,53,138,0.26)] transition-transform duration-300 [transition-timing-function:var(--ease-pop)] group-hover:scale-105 group-active:scale-95">
          <BubbleLogo size={big ? 88 : 64} animated={busy} />
        </span>
      </span>
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-white font-black leading-none tracking-[-0.02em] shadow-[0_0_0_1px_rgba(17,17,20,0.08),0_6px_14px_-6px_rgba(17,17,20,0.3)]", big ? "-mt-1 h-[30px] pl-3.5 pr-2 text-[15px]" : "-mt-1 h-[26px] pl-2.5 pr-1.5 text-[14px]")}>
        crush
        <Icon name="chevron" size={big ? 13 : 12} color="#8A8780" stroke={3} />
      </span>
    </button>
  );
}

/** Sophie, comme un contact : son avatar dans l’anneau de votre niveau, le verdict en badge, son prénom dessous. Un toucher ouvre sa fiche. */
function SophieButton() {
  const idx = LEVELS.findIndex((l) => l.id === REPORT.level);
  const share = (idx + 1) / LEVELS.length;
  const ring = 2 * Math.PI * 21;
  return (
    <Link
      href="/app/fiche"
      aria-label={`${FICHE.person.name}, voir sa fiche (${REPORT.verdict.short}, niveau ${idx + 1} sur ${LEVELS.length})`}
      className="group pointer-events-auto flex flex-col items-center gap-1 text-ink no-underline"
    >
      <span className="relative flex size-12 items-center justify-center transition-transform duration-300 [transition-timing-function:var(--ease-pop)] group-active:scale-95">
        <svg aria-hidden="true" viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
          <circle cx="24" cy="24" r="21" fill="none" stroke="#E6E3DC" strokeWidth="3.5" />
          <circle cx="24" cy="24" r="21" fill="none" stroke="#12C08A" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${ring * share} ${ring}`} />
        </svg>
        <Avatar tone="elle" size={36} fontSize={15}>
          {FICHE.person.initial}
        </Avatar>
        <span aria-hidden="true" className="absolute -bottom-1 -right-1.5 flex size-[22px] items-center justify-center rounded-full bg-white text-[12px] leading-none shadow-[0_0_0_1px_rgba(17,17,20,0.06),0_3px_8px_-3px_rgba(17,17,20,0.35)]">
          {REPORT.verdict.emoji}
        </span>
      </span>
      <span className="text-[12px] font-black leading-none">{FICHE.person.name}</span>
    </Link>
  );
}

/* ———— La conv ———— */
type Pos = "single" | "first" | "middle" | "last";

/** Une ligne de la conv : la date d’un nouveau jour, ou un groupe de bulles d’un même expéditeur (l’heure dessous). */
type Row =
  | { kind: "day"; key: string; at: number | null }
  | { kind: "group"; key: string; from: Msg["from"]; at: number | null; landed: boolean; items: { key: string; node: BubbleNode }[] };

/** L’heure d’un message. L’intro se cale sur l’ouverture de l’écran (inconnue au rendu serveur : l’heure reste vide). */
function timeOf(m: Msg, opened: number | null) {
  if (m.at) return m.at;
  if (!m.seed || opened === null) return null;
  const d = new Date(opened);
  d.setDate(d.getDate() + m.seed.day);
  d.setHours(m.seed.h, m.seed.m, 0, 0);
  return d.getTime();
}

function rowsOf(msgs: Msg[], opened: number | null) {
  const rows: Row[] = [];
  let prev: number | null | undefined;
  for (const m of msgs) {
    const at = timeOf(m, opened);
    /* Chaque nouveau jour s’annonce par sa date, comme dans Messages */
    if (prev === undefined || (at !== null && prev !== null && dayStart(at) !== dayStart(prev))) rows.push({ kind: "day", key: `jour-${m.id}`, at });
    prev = at;
    /* « CRUSH écrit » a sa propre clé : à la réponse, le groupe repart de zéro et ses bulles montent */
    const items = bubblesOf(m).map((node, k) => ({ key: node.tone === "typing" ? `${m.id}-ecrit` : `${m.id}-${k}`, node }));
    const last = rows[rows.length - 1];
    if (last?.kind === "group" && last.from === m.from) {
      last.items.push(...items);
      last.at = at;
      last.landed = !!m.answered;
    } else rows.push({ kind: "group", key: items[0].key, from: m.from, at, landed: !!m.answered, items });
  }
  return rows;
}

function dayStart(at: number) {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const clock = (at: number) => new Date(at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** « Aujourd’hui », « Hier », le jour de la semaine, puis la date. */
function dayLabel(at: number, now: number) {
  const days = Math.round((dayStart(now) - dayStart(at)) / 86_400_000);
  if (days <= 0) return "Aujourd’hui";
  if (days === 1) return "Hier";
  const d = new Date(at);
  if (days < 7) {
    const w = d.toLocaleDateString("fr-FR", { weekday: "long" });
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function Thread({ msgs, opened }: { msgs: Msg[]; opened: number | null }) {
  const rows = rowsOf(msgs, opened);
  /* « Aujourd’hui » se compte depuis le message le plus récent (une conv ouverte avant minuit reste juste) */
  const now = Math.max(opened ?? 0, ...rows.map((r) => r.at ?? 0));
  return (
    <div className="flex flex-col gap-4">
      {rows.map((r) =>
        r.kind === "day" ? (
          <p key={r.key} className="m-0 h-4 text-center text-[12px] font-bold leading-4 text-grey first:-mt-2">
            {r.at === null ? (
              "\u00a0"
            ) : (
              <time dateTime={new Date(r.at).toISOString()}>
                <span className="font-black">{dayLabel(r.at, now)}</span> {clock(r.at)}
              </time>
            )}
          </p>
        ) : (
          <Group key={r.key} row={r} />
        ),
      )}
    </div>
  );
}

/** Les bulles d’un même expéditeur : l’avatar de CRUSH sous la dernière, l’heure dessous (ou « CRUSH écrit » à la place). */
function Group({ row }: { row: Extract<Row, { kind: "group" }> }) {
  const typing = row.items.find((it) => it.node.tone === "typing");
  const bubbles = row.items.filter((it) => it !== typing);
  const n = bubbles.length;
  return (
    <div className="flex flex-col gap-[3px]">
      {bubbles.map((it, i) => {
        const pos: Pos = n === 1 ? "single" : i === 0 ? "first" : i === n - 1 ? "last" : "middle";
        return row.from === "crush" ? (
          <div key={it.key} data-rise="" className="flex items-end gap-2" style={{ "--d": `${i * 0.06}s` } as CSSProperties}>
            {i === n - 1 ? (
              /* Juste après « CRUSH écrit », sa petite bulle arrive d’un bond avec la réponse */
              <span data-land={row.landed ? "" : undefined} className="-mb-0.5 block shrink-0">
                <BubbleLogo size={34} />
              </span>
            ) : (
              <span aria-hidden="true" className="w-[34px] shrink-0" />
            )}
            <BubbleShape side="crush" pos={pos} node={it.node} />
          </div>
        ) : (
          <div key={it.key} data-rise="" className="flex justify-end">
            <BubbleShape side="toi" pos={pos} node={it.node} />
          </div>
        );
      })}
      {typing ? (
        <div key={typing.key} className="flex items-end pt-1">
          {typing.node.body}
        </div>
      ) : (
        <span className={cn("mt-0.5 h-3.5 text-[11px] font-bold leading-[14px] text-grey", row.from === "crush" ? "pl-[46px]" : "pr-1.5 text-right")}>
          {row.at === null ? "\u00a0" : <time dateTime={new Date(row.at).toISOString()}>{clock(row.at)}</time>}
        </span>
      )}
    </div>
  );
}

/** Une bulle : sa forme vient de sa place dans le groupe, son style de son contenu. */
type BubbleNode = { body: ReactNode; tone?: "plain" | "accent" | "toi" | "bare" | "typing"; className?: string };

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
  if ("reading" in m) return [{ tone: "typing", body: <CrushTyping label={m.reading} leaving={m.leaving} /> }];
  if ("notice" in m) return [{ body: <span className="text-[15px] font-extrabold leading-[1.45]">{m.notice}</span> }];
  if ("voice" in m) return [{ className: "py-2 pl-2 pr-3.5", body: <VoiceNote clip={m.voice} /> }];
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
  /* Le message qu’il a lu (une capture, ou son dernier message pour « ça veut dire quoi ? ») */
  const incoming = (reply: Reply) => ({
    className: "pb-2.5 pt-3",
    body: (
      <MessageBubble from="elle" caption={reply.incoming.caption}>
        {reply.incoming.text}
      </MessageBubble>
    ),
  });
  if (r.kind === "best") return [incoming(r.reply), { body: <BestReply reply={r.reply} /> }];
  if (r.kind === "level")
    return [
      {
        body: (
          <span className="flex items-start gap-2.5">
            <span aria-hidden="true" className="text-[30px] leading-none">
              {REPORT.verdict.emoji}
            </span>
            <span className="text-[17px] font-black leading-[1.3]">{r.answer.title}</span>
          </span>
        ),
      },
      {
        body: (
          <span className="flex flex-col gap-3">
            <LevelStepper className="pt-1" />
            <span className="flex flex-col gap-0.5">
              <span className="text-[12px] font-black text-grey">{r.answer.evidenceLabel}</span>
              <span className="text-[14px] font-extrabold leading-[1.45]">{r.answer.evidence}</span>
            </span>
            <ConfidenceLine level={r.answer.confidence}>{r.answer.limits}</ConfidenceLine>
          </span>
        ),
      },
    ];
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
    /* Sur une capture (ou une question sur son dernier message), CRUSH montre d’abord le message qu’il a lu */
    ...(m.fromCapture || r.quoted ? [incoming(r.reply)] : []),
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
        <span className="flex items-center gap-1.5 text-[13px] font-black text-grey">
          <BubbleLogo size={22} />
          Ce que CRUSH voit
        </span>
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
            <span className={cn("px-0.5 text-[11.5px] font-black leading-[1.2]", !done && !now ? "text-grey" : "text-ink")}>
              {l.label}
              <span className="sr-only">{done ? " : réussi" : now ? " : niveau en cours" : " : à venir"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
