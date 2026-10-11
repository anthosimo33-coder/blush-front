"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { copyText, useFilePicker } from "@/lib/hooks";
import { bumpPearl, delai, pearlsOf, prefersReducedMotion, visible } from "@/lib/motion";
import { play } from "@/lib/sound";
import { prechargerExport } from "@/services/api";
import { FileInput } from "@/components/ui/FileInput";
import { Icon, type IconName } from "@/components/ui/icons";
import { Tag } from "@/components/ui/messages";
import { reveiller } from "@/components/shell/Reveil";
import { IDEES_MASQUEES } from "../idees";
import { RecordingBar, useVoiceRecorder, type EcouteEnDirect, type VoiceClip, type VoiceError } from "../voice";

/*
 * La barre de saisie de l’accueil (Composer) et ce qui va avec : le menu du « + », les questions toutes prêtes (et leur
 * choix « masquées », retenu sur cet appareil), les perles du logo qui t’écoutent pendant que tu écris ou que tu parles,
 * et la réponse à lui envoyer (SendReply) et la taille d’un fichier (formatSize), que les bulles de l’accueil montrent.
 */

/** Les questions toutes prêtes, masquées par l’utilisateur (retenu sur cet appareil). */
const QUICK_HIDDEN = "blush.quick-hidden";
const quickListeners = new Set<() => void>();
let quickMemo: boolean | null = null;

function quickHiddenNow() {
  if (quickMemo === null) {
    try {
      quickMemo = localStorage.getItem(QUICK_HIDDEN) === "1";
    } catch {
      quickMemo = false;
    }
  }
  return quickMemo;
}

function setQuickHidden(hidden: boolean) {
  try {
    localStorage.setItem(QUICK_HIDDEN, hidden ? "1" : "0");
  } catch {
    /* Stockage refusé : le choix vaut pour la visite */
  }
  quickMemo = hidden;
  retenirIdees(hidden);
  quickListeners.forEach((l) => l());
}

/** Le cookie lu par la page (src/app/app/idees.ts) : le rendu serveur connaît le choix. */
function retenirIdees(hidden: boolean) {
  document.cookie = hidden ? `${IDEES_MASQUEES}=1; path=/; max-age=31536000; samesite=lax` : `${IDEES_MASQUEES}=; path=/; max-age=0; samesite=lax`;
}

/** `serveur` : le choix lu dans le cookie par la page, le même au rendu serveur et à l’hydratation. */
function useQuickHidden(serveur: boolean) {
  const hidden = useSyncExternalStore(
    (l) => {
      quickListeners.add(l);
      return () => quickListeners.delete(l);
    },
    quickHiddenNow,
    () => serveur,
  );
  /* Un choix fait avant le cookie : il le rejoint, le prochain rendu serveur sera juste */
  useEffect(() => {
    if (hidden !== serveur) retenirIdees(hidden);
  }, [hidden, serveur]);
  return hidden;
}

/**
 * La barre de saisie : « + » pour des captures ou un export, les questions toutes prêtes, le champ et le vocal.
 * Elle garde ce qui change à chaque lettre : seule elle se refait, pas tout l’accueil. Pendant un vocal, elle ne se
 * refait qu’à son début et à sa fin : le temps et l’onde (environ 14 relevés par seconde) ne refont que la barre
 * d’enregistrement, et les perles du logo les suivent hors de React. L’accueil reçoit ce qui part : ton texte, une
 * question, des fichiers, ton vocal.
 */
export function Composer({
  formRef,
  inputRef,
  quick,
  ideesMasquees,
  entree,
  about,
  onAboutClear,
  modeVocal,
  onEcrit,
  busy,
  onText,
  onQuick,
  onImages,
  onExport,
  onVoice,
  onMicError,
  arriving,
  children,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Les questions toutes prêtes pas encore posées. */
  quick: string[];
  ideesMasquees: boolean;
  /** Les questions font leur entrée (premier affichage de l’accueil, ou retour après une réponse). */
  entree: boolean;
  about: string | null;
  onAboutClear: () => void;
  modeVocal: boolean;
  /** « Repasser à l’écrit ». */
  onEcrit: () => void;
  busy: boolean;
  onText: (text: string) => void;
  onQuick: (q: string, chip: HTMLElement) => void;
  onImages: (files: File[]) => void;
  onExport: (files: File[]) => void;
  onVoice: (clip: VoiceClip | "empty") => void;
  onMicError: (e: VoiceError) => void;
  /** L’arrivée du jour se joue : les questions toutes prêtes y prennent part. */
  arriving: boolean;
  /** Ce qui vit dans la barre sans en faire partie (la feuille « Partager en image »). */
  children?: ReactNode;
}) {
  const shots = useFilePicker();
  const exp = useFilePicker();
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const typed = text.trim().length > 0;
  /* Les questions toutes prêtes se masquent d’un geste, et reviennent par « Idées de questions » (retenu sur cet appareil) */
  const quickHidden = useQuickHidden(ideesMasquees);
  const hideQuick = setQuickHidden;
  /* Le vocal : le micro est demandé au premier toucher ; sans micro, BLUSH le dit dans la conv */
  const voice = useVoiceRecorder({ onError: onMicError, onLimit: () => void sendVoice() });
  /* La barre d’enregistrement n’apparaît qu’une fois le micro ouvert (pendant la question d’autorisation, rien ne bouge) */
  const recording = voice.phase === "recording";
  const bump = usePerlesALEcoute({ busy, recording, ecoute: voice.ecoute });
  const idees = quick.length > 0 && !busy && !menu && !about && voice.phase === "idle";

  const sendText = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onText(t);
    setText("");
  };

  const sendVoice = async () => {
    const clip = await voice.stop(true);
    if (clip) onVoice(clip);
  };

  const onType = (e: ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    bump(((e.nativeEvent as InputEvent).inputType ?? "").startsWith("delete"));
  };

  return (
    <form
      ref={formRef}
      onSubmit={sendText}
      data-a="composer"
      className="sticky bottom-0 z-10 -mb-6 mt-auto border-t border-[rgba(17,17,20,0.06)] bg-[rgba(244,242,237,0.88)] px-[18px] pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:static lg:mb-0 lg:bg-white lg:px-6 lg:py-4 lg:backdrop-blur-none"
    >
      {/* 7 · Le point creusé, au-dessus du champ : ta question porte dessus (textes relus le 8 octobre) */}
      {about && (
        <div data-quote-strip="" className="mb-2.5">
          <div className="min-h-0 overflow-hidden">
            <div className="flex items-center gap-2.5 rounded-2xl bg-white py-2 pl-3 pr-2 shadow-[inset_0_0_0_1px_rgba(17,17,20,0.08)] lg:bg-[#F4F2ED] lg:shadow-none">
              <span aria-hidden="true" className="w-[3px] self-stretch rounded-full bg-[#E8358A]" />
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="text-[12px] font-black text-elle-ink">Tu creuses</span>
                <span className="truncate text-[14px] font-extrabold">{about}</span>
              </span>
              <button type="button" aria-label="Ne plus creuser ce point" onClick={onAboutClear} className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#F1EFEA]">
                <Icon name="close" size={13} color="#6B6862" stroke={2.8} />
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Le chat en vocal : BLUSH te répond en vocal, jusqu’à ce que tu repasses à l’écrit */}
      {modeVocal && (
        <div className="mb-2.5 flex">
          <span role="status" className="inline-flex h-[34px] items-center gap-2 rounded-full bg-[#FFE6F2] pl-3 pr-1.5 shadow-[inset_0_0_0_1px_rgba(232,53,138,0.22)]">
            <Icon name="sound" size={16} color="#C81D6B" />
            <span className="text-[13px] font-black text-[#A3135A]">BLUSH te répond en vocal</span>
            <button
              type="button"
              onClick={onEcrit}
              className="h-[26px] rounded-full bg-white px-2.5 text-[12px] font-black text-ink shadow-[0_1px_2px_rgba(17,17,20,0.1)]"
            >
              Repasser à l’écrit
            </button>
          </span>
        </div>
      )}
      {/* Les questions toutes prêtes, au-dessus du champ (rien pendant que tu écris, que BLUSH répond, que tu enregistres ou que tu creuses).
          Pendant que tu écris, elles gardent leur place, invisibles : la conv ne saute pas à la première lettre */}
      {idees && quickHidden && (
        <button
          type="button"
          onClick={() => hideQuick(false)}
          inert={typed || undefined}
          aria-hidden={typed || undefined}
          className={cn(
            "mb-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-extrabold text-toi-ink shadow-[inset_0_0_0_1.5px_rgba(26,102,219,0.28)] transition-[opacity,visibility] duration-150 lg:bg-[#F3F7FF]",
            typed && "pointer-events-none invisible opacity-0",
          )}
        >
          <Icon name="sparkle" size={14} color="currentColor" />
          Idées de questions
        </button>
      )}
      {idees && !quickHidden && (
        <div
          role="group"
          aria-label="Questions toutes prêtes"
          inert={typed || undefined}
          aria-hidden={typed || undefined}
          className={cn(
            "-mx-[18px] mb-2.5 flex gap-2 overflow-x-auto px-[18px] pb-px transition-[opacity,visibility] duration-150 [mask-image:linear-gradient(90deg,#000_calc(100%_-_28px),transparent)] [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:gap-1.5 lg:overflow-visible lg:px-0 lg:[mask-image:none] [&::-webkit-scrollbar]:hidden",
            typed && "pointer-events-none invisible opacity-0",
          )}
        >
          {quick.map((q, i) => (
            <button
              key={q}
              type="button"
              value={q}
              onClick={(e) => onQuick(e.currentTarget.value, e.currentTarget)}
              data-popin={entree ? "" : undefined}
              data-a={arriving ? "chip" : undefined}
              style={{ ...delai(i * 0.05), "--i": i }}
              className="h-9 shrink-0 rounded-full bg-white px-3.5 text-[14px] font-extrabold text-toi-ink lg:px-3 shadow-[inset_0_0_0_1.5px_rgba(26,102,219,0.28)] transition-[box-shadow,background-color,color] duration-200 active:bg-toi-ink active:text-white lg:bg-[#F3F7FF] [@media(hover:hover)]:hover:shadow-[inset_0_0_0_1.5px_#1A66DB]"
            >
              {q}
            </button>
          ))}
          <button
            type="button"
            aria-label="Masquer les idées de questions"
            onClick={() => hideQuick(true)}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-grey transition-colors [@media(hover:hover)]:hover:text-ink"
          >
            <Icon name="close" size={16} color="currentColor" stroke={2.4} />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2.5">
        {recording ? (
          /* En plein vocal : la corbeille remplace le « + » */
          <button
            type="button"
            aria-label="Annuler le vocal"
            onClick={() => {
              play("vocalJete");
              void voice.stop(false);
            }}
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
                  /* La préparation d’un export (src/services/preparer-export.ts) arrive à part : elle se charge pendant qu’on choisit le fichier */
                  if (what === "export") prechargerExport();
                  (what === "shots" ? shots : exp).open();
                }}
              />
            )}
          </div>
        )}
        {recording ? (
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-white pl-4 pr-1 shadow-[inset_0_0_0_1.5px_#121214] lg:bg-[#F4F2ED]">
            <RecordingBar ecoute={voice.ecoute} onSend={() => void sendVoice()} />
          </div>
        ) : (
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-white pl-[18px] pr-1 shadow-[inset_0_0_0_1px_rgba(17,17,20,0.09)] transition-shadow focus-within:shadow-[inset_0_0_0_1.5px_#121214] lg:bg-[#F4F2ED] lg:shadow-none lg:focus-within:shadow-[inset_0_0_0_1.5px_#121214]">
            <span className="sr-only">{about ? "Ta question sur ce point" : "Écris à BLUSH, ou colle sa réponse"}</span>
            <input
              ref={inputRef}
              value={text}
              onChange={onType}
              /* Le serveur se réveille pendant que tu écris : ton message ne paiera pas son démarrage */
              onFocus={() => reveiller()}
              placeholder={about ? "Ta question sur ce point" : modeVocal ? "Écris ou parle à BLUSH" : "Écris à BLUSH"}
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
                onClick={() => {
                  play("vocalDebut");
                  void voice.start();
                }}
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
      <FileInput inputRef={shots.ref} accept="image/*" multiple onFiles={onImages} label="Captures d’écran de sa réponse" />
      {children}
      <FileInput inputRef={exp.ref} accept=".zip,.txt,.json,.html,application/zip,text/plain,application/json,text/html" onFiles={onExport} label="Export de votre conv" />
    </form>
  );
}

/**
 * 2 · BLUSH t’écoute : chaque lettre fait sauter une perle du logo, et sa bulle se penche vers toi (`bump`, rendu à
 * l’appel à chaque lettre). En vocal, les perles suivent ta voix : abonnées au direct de l’enregistreur, elles bougent
 * à chaque relevé du micro sans rien refaire de React. Le logo et ses perles sont cherchés une fois, au début du vocal.
 */
function usePerlesALEcoute({ busy, recording, ecoute }: { busy: boolean; recording: boolean; ecoute: EcouteEnDirect }) {
  const listen = useRef({ k: 0, idle: 0 });

  useEffect(() => {
    if (!recording || prefersReducedMotion()) return;
    const logo = visible<HTMLElement>("[data-blush-logo]");
    if (!logo) return;
    const { pearls, shades } = pearlsOf(logo);
    logo.setAttribute("data-listen", "");
    logo.setAttribute("data-lean", "");
    const suivre = () => {
      const lv = ecoute.lire().levels;
      pearls.forEach((p, i) => {
        const v = Math.min(1, (lv[lv.length - 1 - i] ?? 0) * 1.4);
        p.style.transform = `translateY(${(-v * 26).toFixed(1)}%) scale(${(1 + v * 0.28).toFixed(3)})`;
        if (shades[i]) shades[i].style.transform = `scale(${(1 - v * 0.4).toFixed(3)})`;
      });
    };
    suivre();
    return ecoute.abonner(suivre);
  }, [recording, ecoute]);

  /* Le vocal fini (envoyé ou jeté) : le logo se redresse, ses perles reviennent à leur place */
  useEffect(() => {
    if (recording) return;
    document.querySelectorAll<HTMLElement>("[data-blush-logo][data-listen]").forEach((logo) => {
      logo.removeAttribute("data-listen");
      logo.removeAttribute("data-lean");
      const { pearls, shades } = pearlsOf(logo);
      [...pearls, ...shades].forEach((p) => (p.style.transform = ""));
    });
  }, [recording]);

  /** Une lettre tapée (`soft` : effacée). */
  return (soft: boolean) => {
    if (busy || prefersReducedMotion()) return;
    const logo = visible<HTMLElement>("[data-blush-logo]");
    if (!logo) return;
    bumpPearl(logo, listen.current.k++ % 3, soft);
    logo.setAttribute("data-lean", "");
    window.clearTimeout(listen.current.idle);
    listen.current.idle = window.setTimeout(() => logo.removeAttribute("data-lean"), 900);
  };
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

/** Les messages à lui envoyer, une bulle chacun, à copier en un geste. */
export function SendReply({ lines, why, shine = false }: { lines: string[]; why?: string; shine?: boolean }) {
  return (
    <span className="flex flex-col gap-2">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-black text-vrai-ink">Ta meilleure réponse</span>
        <Tag tone="recommandee" />
      </span>
      <span className="flex flex-col items-start gap-[3px]">
        {lines.map((l, i) => (
          <span key={i} data-shine={shine && i === 0 ? "" : undefined} className="rounded-[18px] rounded-br-[6px] bg-toi-ink px-3.5 py-2 font-message text-[15px] font-bold leading-[1.35] text-white">
            {l}
          </span>
        ))}
      </span>
      {why && <span className="text-[13px] font-extrabold leading-[1.45] text-grey">{why}</span>}
      <span className="mt-1 flex">
        <CopyPill text={lines.join("\n")} label="Copier" />
      </span>
    </span>
  );
}

/** La taille d’un fichier, à la française (« 340 ko », « 2,4 Mo »). */
export function formatSize(bytes: number) {
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
