"use client";

import { IlOuElle } from "@/lib/pronom";
import Link from "next/link";
import {
  createContext,
  memo,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  ViewTransition,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@/lib/cn";
import { copyText, useFilePicker } from "@/lib/hooks";
import { bumpPearl, flipFrom, flyBox, flyText, pearlsOf, prefersReducedMotion, restingBox, snapshotTops, spring, textWidth, visible, wavePearls, type BubbleLook, type Box, type Spring } from "@/lib/motion";
import { play } from "@/lib/sound";
import { getChatHistory, modeVocalChat, sendToBlush, sendVoiceToBlush, type BlushAnswer } from "@/services/api";
import { BACKEND } from "@/services/mode";
import { markArrivalPlayed } from "@/services/session";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import { FileInput, TypingDots } from "@/components/ui/FileInput";
import { Icon, type IconName } from "@/components/ui/icons";
import { marquerChatOuvert } from "../rapport/ChatBubble";
import { Bubble as MessageBubble, ConfidenceLine, BlushTyping, Tag } from "@/components/ui/messages";
import { ClampedBubble } from "@/components/ui/clamp";
import { scaleOf } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/surfaces";
import { AppScreen } from "@/components/shell/AppScreen";
import type { ConvSummary, Fiche, LevelId, Reply, Report } from "@/types";
import { RecordingBar, useVoiceRecorder, VocalBlush, VoiceNote, type VoiceClip, type VoiceError } from "./voice";

/** Ce que l’accueil montre de votre histoire : elle comme un contact, le verdict, où vous en êtes, ton prochain pas. */
export type HomeContact = {
  report: Pick<Report, "verdict" | "level" | "trend" | "nextStep">;
  fiche: Pick<Fiche, "person" | "summaryShort">;
  period: string;
  /** Où mène sa fiche (l’aperçu a la sienne). */
  ficheHref?: string;
};

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
  quickListeners.forEach((l) => l());
}

function useQuickHidden() {
  return useSyncExternalStore(
    (l) => {
      quickListeners.add(l);
      return () => quickListeners.delete(l);
    },
    quickHiddenNow,
    () => false,
  );
}

const ContactContext = createContext<HomeContact | null>(null);

function useContact() {
  const contact = use(ContactContext);
  if (!contact) throw new Error("useContact : hors de HomeScreen");
  return contact;
}

/**
 * L’accueil en mouvement (proposition ; ?anim=avant montre l’accueil d’avant).
 * `on` : les animations et les gestes. `arriving` : l’arrivée du jour se joue. `desktop` : inconnu au rendu serveur.
 * « Réduire les animations » coupe tout ce qui bouge : globals.css pour le CSS, prefersReducedMotion() pour le reste.
 */
type HomeMotion = { on: boolean; arriving: boolean; desktop: boolean | null };

const MotionContext = createContext<HomeMotion>({ on: false, arriving: false, desktop: null });

const useHomeMotion = () => use(MotionContext);

const DESKTOP = "(min-width: 1024px)";

function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(DESKTOP);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => null,
  );
}

/** Largeur de la fenêtre de conv sur desktop ; l’en-tête (logo, « Mon compte ») s’aligne dessus. */
const WINDOW_W = 720;

/** `at` : l’heure du message. `seed` : pour l’intro, un moment fixé par rapport à l’ouverture (hier soir). `answered` : la réponse qui remplace « BLUSH écrit ». */
type Stamp = { at?: number; seed?: { day: number; h: number; m: number }; answered?: boolean };

/** `about` : le point d’une réponse de BLUSH que tu creuses (glissé vers la droite). `event` : un repère dans la conv (un niveau franchi). */
type Msg = (
  | { id: number; from: "blush"; intro: "next" | "hint" }
  | { id: number; from: "blush"; reading: string; leaving?: boolean; vocal?: boolean }
  | { id: number; from: "blush"; result: BlushAnswer; fromCapture?: boolean }
  | { id: number; from: "toi"; text: string; about?: string }
  | { id: number; from: "toi"; images: string[] }
  | { id: number; from: "toi"; file: { name: string; size: number } }
  | { id: number; from: "toi"; voice: Pick<VoiceClip, "url" | "seconds" | "peaks"> }
  | { id: number; from: "blush"; notice: string }
  | { id: number; from: "event"; level: LevelId }
) &
  Stamp;

/** Un échange de l’historique (back-end : avec son id et sa vraie heure ; aperçu : sans). */
type EchangeScript = { id?: number; mine?: string; answer: BlushAnswer; at?: number };

/**
 * Les échanges de l’historique, en messages de la conv. Avec un id (back-end), leurs identifiants en dérivent :
 * stables d’un chargement à l’autre, et les morceaux plus anciens se posent devant sans doublon.
 */
function echangesEnMsgs(script: EchangeScript[]): Msg[] {
  return script.flatMap((ex, k): Msg[] => {
    const id = ex.id ? -1_000_000 - 2 * ex.id : -100 - 2 * k;
    return [
      /* L’historique du back-end a ses vraies heures ; l’aperçu, des heures posées hier soir */
      ...(ex.mine ? [{ id, from: "toi" as const, text: ex.mine, ...(ex.at ? { at: ex.at } : { seed: { day: -1, h: 22, m: 2 * k } }) }] : []),
      { id: id - 1, from: "blush" as const, result: ex.answer, ...(ex.at ? { at: ex.at + 1000 } : { seed: { day: -1, h: 22, m: 2 * k + 1 } }) },
    ];
  });
}
/** Les messages de l’historique (pas ceux de la visite, ni l’intro). */
const DE_L_HISTORIQUE = (m: Msg) => m.id <= -1_000_000;

/** Un message sans son identifiant (il est attribué au moment de l’ajouter à la conv). */
type NewMsg = Msg extends infer T ? (T extends Msg ? Omit<T, "id"> : never) : never;

const INTRO: Msg[] = [
  { id: -2, from: "blush", intro: "next", seed: { day: -1, h: 21, m: 40 } },
  { id: -1, from: "blush", intro: "hint", seed: { day: -1, h: 21, m: 41 } },
];
/** Le groupe de l’intro (les clés des lignes viennent de rowsOf) : c’est lui que l’arrivée du jour écrit. */
const INTRO_GROUP = "-2-0";
const INTRO_DAY = "jour--2";

/*
 * 3 · 4 · Une bulle qui vole jusqu’à sa place : depuis la pastille touchée, ou depuis le champ.
 * 5 · La bulle qui écrit vole jusqu’à l’avatar de la réponse.
 */
type Flight = { kind: "text"; bubble: string; text: string; from: Box; start: BubbleLook } | { kind: "logo"; bubble: string; from: Box };

const CHIP_LOOK: BubbleLook = { background: "#FFFFFF", ring: "inset 0 0 0 1.5px rgba(26, 102, 219, 0.28)", radius: 999, color: "#1A66DB", size: 14, weight: 800, pad: 14 };
const FIELD_LOOK: BubbleLook = { background: "rgba(26, 102, 219, 0)", radius: 20, color: "#121214", size: 16, weight: 800, pad: 16 };
const BUBBLE_LOOK: BubbleLook = { background: "#1A66DB", radius: 20, color: "#FFFFFF", size: 16, weight: 700, pad: 16 };

/** La feuille « Ce que BLUSH voit » monte en 0,35 s : le logo et l’avatar y volent au même rythme. */
const SHEET_IN: Spring = { duration: 380, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };
const SHEET_OUT: Spring = { duration: 300, easing: "cubic-bezier(0.3, 0, 0.2, 1)" };

/* L’heure d’ouverture de l’écran, lue dans le navigateur seulement : rien au rendu serveur, donc pas d’écart à l’hydratation */
let openedAt: number | null = null;
const readOpenedAt = () => (openedAt ??= Date.now());
const noSubscription = () => () => {};
function useOpenedAt() {
  return useSyncExternalStore(noSubscription, readOpenedAt, () => null);
}

/*
 * Écran 13 — Accueil. Au quotidien, tout passe par le chat avec BLUSH : écrire, ajouter des captures,
 * importer un nouvel export. Le rapport et sa fiche restent à un toucher,
 * dans les détails du contact (comme la fiche d’un contact dans Messages).
 * Mobile : plein écran. Desktop : une fenêtre de conv.
 *
 * En mouvement (sauf ?anim=avant), onze idées : 1 l’arrivée du jour, 2 BLUSH t’écoute, 3 la question qui s’envole,
 * 4 l’envoi façon Messages, 5 les perles deviennent la réponse, 6 glisse pour l’heure, 7 glisse pour creuser,
 * 8 l’en-tête qui se replie, 9 la bulle s’ouvre, 10 Sophie en glissé (page.tsx et la fiche), 11 le niveau qui monte.
 */
export function HomeScreen({
  quick = [],
  answers = {},
  liveUrl,
  script = [],
  plusAnciens = false,
  contact,
  motion = true,
  arrive = false,
  fromReport = false,
  others = [],
}: {
  quick?: string[];
  /** Des réponses déjà prêtes, par question (l’aperçu des vraies réponses du chat). */
  answers?: Record<string, BlushAnswer>;
  /** En local : l’adresse qui pose ce que tu écris au vrai chat (l’aperçu). */
  liveUrl?: string;
  /** En local : des échanges déjà joués, posés dans la conv dès l’ouverture (l’aperçu des vraies réponses). */
  script?: EchangeScript[];
  /** Back-end : l’historique a des échanges plus anciens que ceux de `script` (chargés en remontant la conv). */
  plusAnciens?: boolean;
  contact: HomeContact;
  motion?: boolean;
  arrive?: boolean;
  /** Arrivé par la bulle du rapport : sur mobile, le retour au rapport remplace le bouton du compte. */
  fromReport?: boolean;
  /** Proposition « plusieurs convs » : les autres convs du compte. En haut à gauche, un bouton ramène à leur liste. */
  others?: ConvSummary[];
}) {
  const shots = useFilePicker();
  const exp = useFilePicker();
  const [msgs, setMsgs] = useState<Msg[]>(() => [...INTRO, ...echangesEnMsgs(script)]);
  /* L’historique se charge par morceaux : y en a-t-il de plus anciens, et le plus ancien déjà affiché */
  const [plus, setPlus] = useState(plusAnciens);
  const [anciens, setAnciens] = useState(false);
  const plusAncien = useRef<number | null>(script[0]?.id ?? null);
  const chargement = useRef(false);
  const derniers = useRef(msgs);
  const devant = useRef<{ desk: boolean; h: number; y: number } | null>(null);
  const haut = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [details, setDetails] = useState(false);
  /* 7 · Le point creusé : ta prochaine question porte dessus */
  const [about, setAbout] = useState<string | null>(null);
  /* Le chat en vocal : BLUSH répond en vocal tant qu’il ne repasse pas à l’écrit (la dernière réponse le dit) */
  const [modeVocal, setModeVocal] = useState(() => !!script.at(-1)?.answer.modeVocal);
  /* 11 · Où vous en êtes : un message peut vous faire passer un cap pendant la visite */
  const [level, setLevel] = useState(contact.report.level);
  const levelNow = useRef(contact.report.level);
  const [cheer, setCheer] = useState(0);
  /* 1 · L’arrivée, une fois par jour (le serveur le sait par un cookie) */
  const [arriving, setArriving] = useState(arrive);
  const signed = useRef(false);
  const nextId = useRef(1);
  const thread = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  /* Avant chaque changement de la conv : où étaient ses lignes (pour les faire glisser), et la bulle qui doit voler */
  const before = useRef<Map<string, number> | null>(null);
  const flight = useRef<Flight | null>(null);
  const shown = useRef(msgs);
  const listen = useRef({ k: 0, idle: 0 });
  const typed = text.trim().length > 0;
  /* Les questions toutes prêtes déjà posées pendant la visite disparaissent de la rangée */
  const [asked, setAsked] = useState<string[]>([]);
  /* Les questions toutes prêtes se masquent d’un geste, et reviennent par « Idées de questions » (retenu sur cet appareil) */
  const quickHidden = useQuickHidden();
  const hideQuick = setQuickHidden;
  /* BLUSH « écrit » : sa bulle s’anime en haut de la conv */
  const busy = msgs.some((m) => "reading" in m);
  const opened = useOpenedAt();
  const desktop = useDesktop();
  const live = useMemo(() => ({ ...contact, report: { ...contact.report, level } }), [contact, level]);
  const moving = useMemo(() => ({ on: motion, arriving, desktop }), [motion, arriving, desktop]);

  /* Le chat est ouvert : la bulle du rapport arrête de s’agiter */
  useEffect(() => marquerChatOuvert(), []);

  useEffect(() => {
    if (!arrive) return;
    markArrivalPlayed();
    /* La signature tombe avec le « coucou » des perles (0,85 s, une perle toutes les 0,11 s). Ouverte à froid, Safari la garde muette */
    if (!signed.current) play("signature", 0.85, 0.11);
    signed.current = true;
    const t = window.setTimeout(() => setArriving(false), 3700);
    return () => window.clearTimeout(t);
  }, [arrive]);

  /*
   * Chaque nouveau message fait défiler la conv jusqu’en bas (la page sur mobile, la fenêtre sur desktop).
   * En mouvement : la conv saute d’un coup en bas, puis chaque ligne repart de là où elle était (FLIP) : le défilement devient un ressort,
   * et la bulle qui vole part juste avant.
   */
  useLayoutEffect(() => {
    if (shown.current === msgs) return;
    shown.current = msgs;
    const box = thread.current;
    if (!box) return;
    /* Des messages plus anciens posés devant : on garde la conv là où on la lisait */
    const d = devant.current;
    if (d) {
      devant.current = null;
      if (d.desk) box.scrollTop = box.scrollHeight - d.h + d.y;
      else window.scrollTo({ top: document.documentElement.scrollHeight - d.h + d.y });
      return;
    }
    const desk = window.matchMedia(DESKTOP).matches;
    const reduced = prefersReducedMotion();
    const toBottom = (behavior: ScrollBehavior) =>
      desk ? box.scrollTo({ top: box.scrollHeight, behavior }) : window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
    const tops = before.current;
    const f = flight.current;
    before.current = null;
    flight.current = null;
    if (!motion || reduced) {
      toBottom(reduced ? "auto" : "smooth");
      return;
    }
    toBottom("auto");
    if (f) launch(box, f);
    if (tops) flipFrom(tops, box.querySelectorAll<HTMLElement>("[data-row]"), (el) => el.dataset.row, spring("soft"));
  }, [msgs, motion]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  useEffect(() => {
    derniers.current = msgs;
  }, [msgs]);

  /*
   * L’historique, frais du serveur, à chaque ouverture : un retour en arrière remontre la page telle qu’elle était
   * (sans les derniers échanges), et un onglet laissé ouvert peut dater. Rien n’est remplacé si la visite a déjà
   * ajouté des messages (les siens sont les plus récents).
   */
  useEffect(() => {
    if (!BACKEND) return;
    let fini = false;
    const recharger = () =>
      getChatHistory()
        .then((h) => {
          if (fini || derniers.current.some((m) => m.id > 0)) return;
          const affiches = derniers.current.filter(DE_L_HISTORIQUE).map((m) => m.id);
          const frais = echangesEnMsgs(h.echanges);
          /* Le même historique que celui affiché : rien ne bouge */
          if (affiches.join() === frais.map((m) => m.id).join()) return;
          plusAncien.current = h.echanges[0]?.id ?? null;
          setPlus(h.plus);
          setMsgs([...INTRO, ...frais]);
          /* Le mode vocal suit la réponse la plus récente */
          setModeVocal(!!h.echanges.at(-1)?.answer.modeVocal);
        })
        .catch(() => {});
    recharger();
    /* Revenu sur la page par le bouton retour du navigateur (la page gardée en mémoire) */
    const auRetour = (e: PageTransitionEvent) => {
      if (e.persisted) recharger();
    };
    window.addEventListener("pageshow", auRetour);
    return () => {
      fini = true;
      window.removeEventListener("pageshow", auRetour);
    };
  }, []);

  /** Les échanges d’avant le plus ancien affiché, posés devant (la conv garde sa place). */
  const chargerAnciens = useCallback(async () => {
    const avant = plusAncien.current;
    if (!BACKEND || !avant || chargement.current) return;
    chargement.current = true;
    setAnciens(true);
    try {
      const h = await getChatHistory(avant);
      if (h.echanges.length) {
        plusAncien.current = h.echanges[0].id;
        const box = thread.current;
        const desk = window.matchMedia(DESKTOP).matches;
        devant.current = desk && box ? { desk, h: box.scrollHeight, y: box.scrollTop } : { desk: false, h: document.documentElement.scrollHeight, y: window.scrollY };
        setMsgs((prev) => {
          const deja = new Set(prev.map((m) => m.id));
          const intro = prev.filter((m) => "intro" in m);
          return [...intro, ...echangesEnMsgs(h.echanges).filter((m) => !deja.has(m.id)), ...prev.filter((m) => !("intro" in m))];
        });
      }
      setPlus(h.plus && h.echanges.length > 0);
    } catch {
      /* Réseau coupé : le bouton reste là, on réessaiera */
    } finally {
      chargement.current = false;
      setAnciens(false);
    }
  }, []);

  /* En remontant tout en haut de la conv, les échanges plus anciens arrivent d’eux-mêmes (pas dès l’ouverture) */
  useEffect(() => {
    const el = haut.current;
    if (!BACKEND || !plus || !el) return;
    let pret = false;
    const t = window.setTimeout(() => (pret = true), 1000);
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && pret) void chargerAnciens();
      },
      { rootMargin: "240px 0px 0px 0px" },
    );
    obs.observe(el);
    return () => {
      window.clearTimeout(t);
      obs.disconnect();
    };
  }, [plus, chargerAnciens]);

  useHeaderCollapse(head, motion);

  /* 11 · La fête quand un niveau tombe : l’anneau se remplit (CSS), Sophie rebondit, des éclats partent */
  useEffect(() => {
    if (cheer && motion && !prefersReducedMotion()) celebrate();
  }, [cheer, motion]);

  const id = () => nextId.current++;

  /** Toute modification de la conv passe par ici : on note d’abord où sont ses lignes, pour les faire glisser ensuite. */
  const update = (fn: (m: Msg[]) => Msg[]) => {
    if (motion && !before.current && thread.current) before.current = snapshotTops(thread.current.querySelectorAll<HTMLElement>("[data-row]"), (el) => el.dataset.row);
    setMsgs(fn);
  };

  /** 11 · Un cran de plus sur votre échelle : une seule fois par niveau. */
  const levelUp = (to: LevelId) => {
    const now = scaleOf(levelNow.current);
    const next = scaleOf(to);
    if (next.temperature !== now.temperature || next.index <= now.index) return;
    levelNow.current = to;
    setLevel(to);
    play("niveau", next.temperature);
    update((m) => [...m, { id: id(), from: "event", level: to, at: Date.now() }]);
    setCheer((c) => c + 1);
  };

  /** Ton message part, BLUSH tape « … », puis sa réponse remplace les trois points. */
  const exchange = async (mine: Msg, label: string, answer: () => Promise<NewMsg>, vocal = false) => {
    const readingId = id();
    const sent = Date.now();
    update((m) => [...m, { ...mine, at: sent }, { id: readingId, from: "blush", reading: label, vocal, at: sent }]);
    const next = await answer();
    if (!prefersReducedMotion()) {
      if (motion) {
        /* 5 · La bulle qui écrit se pose en avatar, et la réponse se déplie depuis elle, sans temps mort */
        const typing = thread.current?.querySelector(`[data-reading="${readingId}-ecrit"] svg`);
        if (typing) flight.current = { kind: "logo", bubble: `${readingId}-0`, from: typing.getBoundingClientRect() };
      } else {
        /* « BLUSH écrit » se replie d’abord vers sa pointe, puis la réponse monte à sa place */
        update((m) => m.map((x) => (x.id === readingId ? { ...x, leaving: true } : x)));
        await new Promise((r) => setTimeout(r, 190));
      }
    }
    update((m) => m.map((x) => (x.id === readingId ? ({ ...next, id: readingId, at: Date.now(), answered: true } as Msg) : x)));
    /* Un pop quand la réponse remplace les perles, deux avec ta meilleure réponse. Rien si tu écris déjà la suite */
    if (!input.current?.value) play("reponse", "result" in next && (next.result.kind === "analysis" || next.result.kind === "best"));
    if ("result" in next && next.result.modeVocal !== undefined) setModeVocal(next.result.modeVocal);
    const up = "result" in next ? next.result.levelUp : undefined;
    if (up) window.setTimeout(() => levelUp(up), 700);
  };

  const ask = (mine: Msg, payload: { text?: string; files?: File[]; about?: string }, fromCapture = false) => {
    play("envoi");
    return exchange(mine, modeVocal ? "BLUSH enregistre un vocal" : "BLUSH analyse sa réponse", async () => {
      const ready = payload.text ? answers[payload.text] : undefined;
      const result = ready
        ? await new Promise<BlushAnswer>((ok) => setTimeout(() => ok(ready), 1600))
        : liveUrl && payload.text && !payload.files
          ? await askLive(liveUrl, payload.text, historyOf(msgs))
          : await sendToBlush(payload);
      return { from: "blush", result, fromCapture };
    }, modeVocal);
  };

  /* Une question toute prête part tout de suite, comme si tu l’avais écrite. 3 · La pastille elle-même devient ta bulle */
  const sendQuick = (q: string, chip?: HTMLElement) => {
    setAsked((a) => [...a, q]);
    const mine = id();
    if (motion && chip && !prefersReducedMotion()) flight.current = { kind: "text", bubble: `${mine}-0`, text: q, from: chip.getBoundingClientRect(), start: CHIP_LOOK };
    ask({ id: mine, from: "toi", text: q }, { text: q });
  };

  const sendText = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const mine = id();
    const field = input.current;
    /* 4 · L’envoi façon Messages : ton texte quitte le champ et devient une bulle bleue */
    if (motion && field && !about && !prefersReducedMotion()) {
      const r = field.getBoundingClientRect();
      const w = textWidth(t, field);
      if (w <= r.width) flight.current = { kind: "text", bubble: `${mine}-0`, text: t, from: { left: r.left - 16, top: r.top + r.height / 2 - 21, width: w + 32, height: 42 }, start: FIELD_LOOK };
    }
    const point = about ?? undefined;
    setText("");
    setAbout(null);
    ask({ id: mine, from: "toi", text: t, about: point }, { text: t, about: point });
  };

  const sendImages = (files: File[]) => {
    const list = files.map((f) => URL.createObjectURL(f));
    urls.current.push(...list);
    ask({ id: id(), from: "toi", images: list }, { files }, true);
  };

  const sendExport = ([file]: File[]) => ask({ id: id(), from: "toi", file: { name: file.name, size: file.size } }, { files: [file] });

  /* Le vocal : le micro est demandé au premier toucher ; sans micro, BLUSH le dit dans la conv */
  const micRefused = (e: VoiceError) =>
    update((m) => [
      ...m,
      {
        id: id(),
        from: "blush",
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
      update((m) => [...m, { id: id(), from: "blush", at: Date.now(), notice: "Je n’ai rien entendu. Vérifie ton micro et réessaie, ou écris-moi." }]);
      return;
    }
    if (!clip) return;
    play("vocalEnvoye");
    urls.current.push(clip.url);
    /* Tu lui parles en vocal : elle te répond en vocal */
    exchange(
      { id: id(), from: "toi", voice: { url: clip.url, seconds: clip.seconds, peaks: clip.peaks } },
      "BLUSH enregistre un vocal",
      async () => ({ from: "blush", result: await sendVoiceToBlush({ audio: clip.blob, seconds: clip.seconds }) }),
      true,
    );
  };

  /* 2 · BLUSH t’écoute : chaque lettre fait sauter une perle, et la bulle se penche vers toi */
  const bump = (soft: boolean) => {
    if (!motion || busy || prefersReducedMotion()) return;
    const logo = visible<HTMLElement>("[data-blush-logo]");
    if (!logo) return;
    bumpPearl(logo, listen.current.k++ % 3, soft);
    logo.setAttribute("data-lean", "");
    window.clearTimeout(listen.current.idle);
    listen.current.idle = window.setTimeout(() => logo.removeAttribute("data-lean"), 900);
  };
  const onType = (e: ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    bump(((e.nativeEvent as InputEvent).inputType ?? "").startsWith("delete"));
  };

  /* … et en vocal, les perles suivent ta voix */
  useEffect(() => {
    if (!motion || !recording || prefersReducedMotion()) return;
    const logo = visible<HTMLElement>("[data-blush-logo]");
    if (!logo) return;
    const { pearls, shades } = pearlsOf(logo);
    const lv = voice.levels;
    logo.setAttribute("data-listen", "");
    logo.setAttribute("data-lean", "");
    pearls.forEach((p, i) => {
      const v = Math.min(1, (lv[lv.length - 1 - i] ?? 0) * 1.4);
      p.style.transform = `translateY(${(-v * 26).toFixed(1)}%) scale(${(1 + v * 0.28).toFixed(3)})`;
      if (shades[i]) shades[i].style.transform = `scale(${(1 - v * 0.4).toFixed(3)})`;
    });
  }, [voice.levels, recording, motion]);
  useEffect(() => {
    if (recording) return;
    document.querySelectorAll<HTMLElement>("[data-blush-logo][data-listen]").forEach((logo) => {
      logo.removeAttribute("data-listen");
      logo.removeAttribute("data-lean");
      const { pearls, shades } = pearlsOf(logo);
      [...pearls, ...shades].forEach((p) => (p.style.transform = ""));
    });
  }, [recording]);

  /* 7 · Glisse pour creuser : la réponse glissée se cale au-dessus du champ, et le clavier s’ouvre */
  const dig = (quote: string) => {
    play("creuser");
    setAbout(quote);
    input.current?.focus({ preventScroll: true });
  };
  useThreadGestures(thread, motion, dig);

  return (
    <ContactContext value={live}>
      <MotionContext value={moving}>
        <AppScreen
          requires="blushplus"
          aside={null}
          mainWidth={WINDOW_W}
          frameWidth={WINDOW_W}
          contentGap={0}
          desktopTopPad={0}
          className={cn("home-page", arriving && "home-arrive")}
          mobileTop={
            /* En haut : BLUSH en grand au centre (sa bulle flotte et s’anime quand il répond), Sophie à droite comme un contact.
               Le fond s’efface vers le bas : les messages passent dessous en douceur. 8 · Quand tu remontes dans l’historique, tout se range dans une barre fine. */
            <header ref={head} className={cn("pointer-events-none sticky top-0 z-20 shrink-0 lg:hidden", motion && "home-head")}>
              <span aria-hidden="true" data-c="bg" className="absolute inset-0 bg-[rgba(244,242,237,0.84)] backdrop-blur-xl [mask-image:linear-gradient(180deg,#000_calc(100%_-_22px),transparent)]" />
              <div className="relative grid grid-cols-[1fr_auto_1fr] items-start px-4 pb-5 pt-[max(6px,env(safe-area-inset-top))]">
                <div data-c="acc" className="pointer-events-auto mt-3 flex">
                  <span data-a="acc" className="flex">
                    {fromReport ? (
                      <IconButton href="/rapport" icon="back" label="Revenir au rapport" iconSize={19} className="!size-10 !shadow-soft" />
                    ) : others.length > 0 ? (
                      <ConvsButton others={others} />
                    ) : (
                      <IconButton href="/compte" icon="user" label="Mon compte" iconSize={19} className="!size-10 !shadow-soft" />
                    )}
                  </span>
                </div>
                <BlushTitle big busy={busy} onClick={() => setDetails(true)} />
                <div className="mt-2 flex justify-end">
                  <SophieButton shared={desktop === false} />
                </div>
              </div>
            </header>
          }
        >
          <h1 className="sr-only">Ta conv avec BLUSH</h1>
          <div className="-mx-[22px] -mt-1 flex flex-1 flex-col lg:mx-0 lg:mt-0 lg:h-[clamp(540px,calc(100dvh_-_132px),700px)] lg:flex-none lg:overflow-hidden lg:rounded-[32px] lg:bg-white lg:shadow-[0_0_0_1px_rgba(17,17,20,0.05),0_2px_6px_rgba(17,17,20,0.03),0_48px_90px_-48px_rgba(17,17,20,0.32)]">
            {/* Desktop : la barre de la fenêtre, comme sur mobile (BLUSH au centre, Sophie à droite) */}
            <div className="hidden h-[112px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-[rgba(17,17,20,0.06)] px-5 lg:grid">
              {/* Le rapport, à un clic : la place à gauche de la barre était vide. Avec plusieurs convs, le retour à leur liste */}
              <span className="flex">
                {others.length > 0 ? (
                  <ConvsButton others={others} flat />
                ) : (
                  <Link href="/rapport" className="back-nudge flex items-center gap-1.5 rounded-full px-3 py-2 text-[14px] font-black text-ink no-underline transition-colors hover:bg-[rgba(17,17,20,0.05)]">
                    <Icon name="back" size={16} color="#121214" stroke={2.6} />
                    Ton rapport
                  </Link>
                )}
              </span>
              <BlushTitle busy={busy} onClick={() => setDetails(true)} />
              <div className="flex justify-end">
                <SophieButton shared={desktop === true} />
              </div>
            </div>

            {/* La conv : les messages se posent en bas, groupés par expéditeur. 6 · 7 · Elle se glisse au doigt (à gauche l’heure, à droite pour creuser) */}
            <div
              ref={thread}
              role="log"
              aria-label="Ta conv avec BLUSH"
              aria-live="polite"
              className={cn(
                "flex flex-1 flex-col px-[18px] pb-4 pt-8 lg:overflow-y-auto lg:bg-[#F7F5F1] lg:px-7 lg:pb-6",
                motion && "overflow-x-clip [touch-action:pan-y_pinch-zoom] lg:overflow-x-hidden",
              )}
            >
              {/* L’historique plus ancien : il arrive en remontant, ou d’un toucher */}
              {plus && (
                <div ref={haut} className="flex min-h-11 justify-center pb-4">
                  {anciens ? (
                    <TypingDots label="Chargement des messages plus anciens" />
                  ) : (
                    <button type="button" onClick={() => void chargerAnciens()} className="rounded-full px-3 text-[13px] font-black text-grey transition-colors hover:text-ink">
                      Voir les messages plus anciens
                    </button>
                  )}
                </div>
              )}
              <Thread msgs={msgs} opened={opened} />
            </div>

            {/* La barre de saisie : « + » pour des captures ou un export, ou un message à BLUSH */}
            <form
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
                      <button type="button" aria-label="Ne plus creuser ce point" onClick={() => setAbout(null)} className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#F1EFEA]">
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
                      onClick={() => {
                        setModeVocal(false);
                        modeVocalChat(false);
                      }}
                      className="h-[26px] rounded-full bg-white px-2.5 text-[12px] font-black text-ink shadow-[0_1px_2px_rgba(17,17,20,0.1)]"
                    >
                      Repasser à l’écrit
                    </button>
                  </span>
                </div>
              )}
              {/* Les questions toutes prêtes, au-dessus du champ (rien pendant que tu écris, que BLUSH répond, que tu enregistres ou que tu creuses) */}
              {quickLeft.length > 0 && !typed && !busy && !menu && !about && voice.phase === "idle" && quickHidden && (
                <button
                  type="button"
                  onClick={() => hideQuick(false)}
                  className="mb-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-extrabold text-toi-ink shadow-[inset_0_0_0_1.5px_rgba(26,102,219,0.28)] lg:bg-[#F3F7FF]"
                >
                  <Icon name="sparkle" size={14} color="currentColor" />
                  Idées de questions
                </button>
              )}
              {quickLeft.length > 0 && !typed && !busy && !menu && !about && voice.phase === "idle" && !quickHidden && (
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
                      onClick={(e) => sendQuick(e.currentTarget.value, e.currentTarget)}
                      data-popin=""
                      data-a={arriving ? "chip" : undefined}
                      style={{ "--d": `${i * 0.05}s`, "--i": i } as CSSProperties}
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
                    <span className="sr-only">{about ? "Ta question sur ce point" : "Écris à BLUSH, ou colle sa réponse"}</span>
                    <input
                      ref={input}
                      value={text}
                      onChange={onType}
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
              <FileInput inputRef={shots.ref} accept="image/*" multiple onFiles={sendImages} label="Captures d’écran de sa réponse" />
              <FileInput inputRef={exp.ref} accept=".zip,.txt,.json,.html,application/zip,text/plain,application/json,text/html" onFiles={sendExport} label="Export de votre conv" />
            </form>
          </div>

          <ContactSheet open={details} onClose={() => setDetails(false)} />
        </AppScreen>
      </MotionContext>
    </ContactContext>
  );
}

/** 3 · 4 · 5 · Le vol, juste après le rendu : la vraie bulle (ou l’avatar) reste cachée jusqu’à l’atterrissage. */
function launch(box: HTMLElement, f: Flight) {
  const target = box.querySelector<HTMLElement>(`[data-bubble="${f.bubble}"]`);
  if (!target) return;
  if (f.kind === "text") {
    const row = target.parentElement;
    row?.setAttribute("data-flown", "");
    const to = target.getBoundingClientRect();
    /* Sur plusieurs lignes, la bulle monte simplement */
    if (to.height > 48) {
      row?.removeAttribute("data-flown");
      return;
    }
    target.style.visibility = "hidden";
    void flyText(f.text, f.from, to, f.start, BUBBLE_LOOK, { spring: spring("soft") }).then(() => {
      target.style.visibility = "";
    });
    return;
  }
  const avatar = target.closest("[data-group]")?.querySelector<HTMLElement>("[data-avatar]");
  const logo = avatar?.querySelector("svg");
  if (!avatar || !logo) return;
  const to = avatar.getBoundingClientRect();
  avatar.style.visibility = "hidden";
  const el = logo.cloneNode(true) as SVGSVGElement;
  void flyBox(el, f.from, to, { spring: spring("pop") }).then(() => {
    avatar.style.visibility = "";
  });
}

/** 11 · Sophie rebondit dans son anneau, son badge se retourne, des éclats partent ; BLUSH saute de joie. */
const SPARKS = ["#FF7DBA", "#3D8BFF", "#12C08A", "#FFC49B", "#E4B2FF", "#E8358A"];

function celebrate() {
  const logo = visible<HTMLElement>("[data-blush-logo]");
  if (logo) {
    wavePearls(logo);
    logo.animate([{ translate: "0 0" }, { translate: "0 -9px", offset: 0.35 }, { translate: "0 0" }], { duration: 640, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" });
  }
  const sophie = visible<HTMLElement>("[data-sophie]");
  if (!sophie) return;
  sophie
    .querySelector("[data-glow-ring]")
    ?.animate([{ opacity: 0, transform: "scale(0.9)" }, { opacity: 1, transform: "scale(1.05)", offset: 0.4 }, { opacity: 0, transform: "scale(1.18)" }], { duration: 1300, easing: "ease-out" });
  sophie.querySelector("[data-sophie-avatar]")?.animate([{ scale: 1 }, { scale: 1.16, offset: 0.35 }, { scale: 1 }], { duration: 620, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" });
  sophie
    .querySelector("[data-badge]")
    ?.animate([{ transform: "rotateY(0deg) scale(1)" }, { transform: "rotateY(180deg) scale(1.35)", offset: 0.5 }, { transform: "rotateY(360deg) scale(1)" }], { duration: 760, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" });
  const r = sophie.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < 14; i++) {
    const p = document.createElement("span");
    const size = 4 + Math.random() * 5;
    p.className = "level-spark";
    Object.assign(p.style, { left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px`, background: SPARKS[i % SPARKS.length] });
    document.body.append(p);
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const d = 34 + Math.random() * 34;
    p.animate(
      [
        { transform: "translate(0, 0) scale(0.4)", opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${Math.cos(a) * d * 1.15}px, ${Math.sin(a) * d * 1.15 + 8}px) scale(0.6)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 300, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)", fill: "forwards" },
    ).onfinish = () => p.remove();
  }
}

/** 8 · L’en-tête se replie quand tu remontes dans l’historique (--c : 0 en bas de la conv, 1 replié). Mobile seulement. */
function useHeaderCollapse(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || prefersReducedMotion()) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      /* Les 60 premiers pixels ne comptent pas : une conv à peine plus haute que l’écran garde son grand en-tête */
      const d = document.documentElement;
      const c = Math.max(0, Math.min(1, (d.scrollHeight - window.scrollY - window.innerHeight - 60) / 140));
      el.style.setProperty("--c", c.toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    measure();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
      el.style.removeProperty("--c");
    };
  }, [ref, enabled]);
}

const rubber = (d: number, max: number) => (d <= max ? d : max + (d - max) * 0.2);

/**
 * 6 · Glisse la conv vers la gauche : l’heure de chaque bulle apparaît, puis tout revient en place (comme dans Messages).
 * 7 · Glisse une réponse de BLUSH vers la droite : passé le cran, elle se cale au-dessus du champ.
 * Au doigt seulement : à la souris, on garde la sélection du texte. Un geste vertical reste un défilement normal.
 */
function useThreadGestures(ref: RefObject<HTMLElement | null>, enabled: boolean, onDig: (quote: string) => void) {
  const dig = useRef(onDig);
  useEffect(() => {
    dig.current = onDig;
  });
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    const ARMED = 56;
    type Drag = { id: number; x: number; y: number; mode: "?" | "time" | "dig" | "off"; el?: HTMLElement; icon?: HTMLElement | null; v: number; armed: boolean };
    let g: Drag | null = null;
    let swiped = 0;
    const settle = (el: HTMLElement, v: number) => {
      el.style.transform = "";
      if (v && !prefersReducedMotion()) el.animate([{ transform: `translateX(${v}px)` }, { transform: "translateX(0)" }], spring("pop"));
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || g) return;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: "?", v: 0, armed: false };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id || g.mode === "off") return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (g.mode === "?") {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          g.mode = "off";
          return;
        }
        if (Math.abs(dx) < 10) return;
        const bubble = dx > 0 ? (e.target as Element | null)?.closest<HTMLElement>("[data-quote]") : null;
        if (dx > 0 && !bubble) {
          g.mode = "off";
          return;
        }
        g.mode = dx < 0 ? "time" : "dig";
        g.el = (dx < 0 ? root.querySelector<HTMLElement>("[data-thread]") : bubble) ?? undefined;
        g.icon = bubble?.parentElement?.querySelector<HTMLElement>("[data-dig-icon]");
        g.x += Math.sign(dx) * 10;
        try {
          root.setPointerCapture(e.pointerId);
        } catch {
          /* Pas de capture : le geste suit quand même tant que le doigt reste sur la conv */
        }
      }
      const d = e.clientX - g.x;
      if (!g.el) return;
      if (g.mode === "time") {
        g.v = -rubber(Math.max(0, -d), 64);
        g.el.style.transform = `translateX(${g.v}px)`;
        return;
      }
      g.v = rubber(Math.max(0, d), 76);
      g.el.style.transform = `translateX(${g.v}px)`;
      const p = Math.min(1, g.v / ARMED);
      if (g.icon) {
        g.icon.style.opacity = String(p);
        g.icon.style.transform = `translateY(-50%) scale(${0.4 + 0.6 * p})`;
      }
      const armed = g.v >= ARMED;
      if (armed !== g.armed) {
        g.armed = armed;
        g.icon?.toggleAttribute("data-armed", armed);
        if (armed) {
          g.icon?.animate([{ scale: 1 }, { scale: 1.3 }, { scale: 1 }], { duration: 260 });
          play("cran");
        }
      }
    };
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!g || e.pointerId !== g.id) return;
      const done = g;
      g = null;
      if (done.mode !== "time" && done.mode !== "dig") return;
      swiped = performance.now();
      if (done.el) settle(done.el, done.v);
      if (done.icon) {
        done.icon.style.opacity = "";
        done.icon.style.transform = "";
        done.icon.removeAttribute("data-armed");
      }
      const quote = done.el?.dataset.quote;
      if (done.mode === "dig" && done.armed && !cancelled && quote) dig.current(quote);
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);
    /* Après un glissé, relâcher le doigt ne « clique » pas ce qui est dessous */
    const click = (e: MouseEvent) => {
      if (performance.now() - swiped < 400) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    root.addEventListener("pointerdown", down);
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", cancel);
    root.addEventListener("click", click, true);
    return () => {
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up);
      root.removeEventListener("pointercancel", cancel);
      root.removeEventListener("click", click, true);
    };
  }, [ref, enabled]);
}

/* ———— En-tête : BLUSH en grand, comme le personnage de la conv (sa bulle, son nom en pastille) ———— */
function BlushTitle({ busy, onClick, big = false }: { busy: boolean; onClick: () => void; big?: boolean }) {
  const { arriving } = useHomeMotion();
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label="BLUSH, ce qu’il voit de vous deux" className="group pointer-events-auto relative flex flex-col items-center px-1 text-ink">
      {/* 1 · À l’arrivée, un halo rose s’allume derrière lui puis s’efface */}
      {arriving && (
        <span
          aria-hidden="true"
          data-a="aura"
          className={cn(
            "pointer-events-none absolute left-1/2 size-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,125,186,0.5),rgba(255,125,186,0)_64%)] opacity-0",
            big ? "top-[44px]" : "top-[32px]",
          )}
        />
      )}
      <span data-c="logo" className="relative block">
        <span data-float="" className="block" style={{ "--r": "-3deg" } as CSSProperties}>
          <span data-a="logo" data-blush-logo="" className="block drop-shadow-[0_16px_18px_rgba(232,53,138,0.26)] group-hover:scale-105 group-active:scale-95">
            <BubbleLogo size={big ? 88 : 64} animated={busy} layered />
          </span>
        </span>
      </span>
      <span data-c="pill" className="relative -mt-1 block">
        <span
          data-a="pill"
          className={cn(
            "inline-flex items-center gap-1 rounded-full bg-white font-black leading-none tracking-[-0.02em] shadow-[0_0_0_1px_rgba(17,17,20,0.08),0_6px_14px_-6px_rgba(17,17,20,0.3)]",
            big ? "h-[30px] pl-3.5 pr-2 text-[15px]" : "h-[26px] pl-2.5 pr-1.5 text-[14px]",
          )}
        >
          blush
          <Icon name="chevron" size={big ? 13 : 12} color="#8A8780" stroke={3} />
        </span>
      </span>
    </button>
  );
}

/**
 * Proposition « plusieurs convs » : le retour à la liste, avec les autres personnes en petit (deux au plus, puis « +n »),
 * pour qu’on voie d’un coup d’œil qu’il y a d’autres convs. `flat` : dans la barre de la fenêtre (desktop), sans ombre.
 */
function ConvsButton({ others, flat = false }: { others: ConvSummary[]; flat?: boolean }) {
  const { on } = useHomeMotion();
  const shown = others.slice(0, 2);
  const more = others.length - shown.length;
  return (
    <Link
      href="/app/convs"
      transitionTypes={on ? ["nav-back"] : undefined}
      aria-label={`Tes convs (${others.map((o) => o.person.name).join(", ")})`}
      className={cn(
        "back-nudge pointer-events-auto flex h-10 items-center gap-1 rounded-full pl-2 pr-1.5 no-underline",
        flat ? "transition-colors hover:bg-[rgba(17,17,20,0.05)]" : "lift lift-sm lift-card bg-white shadow-soft",
      )}
    >
      <Icon name="back" size={17} color="#121214" stroke={2.6} />
      <span aria-hidden="true" className="flex">
        {shown.map((o, i) => (
          <span key={o.storyId} className={cn("rounded-full shadow-[0_0_0_2px_#FFFFFF]", i > 0 && "-ml-2")}>
            <Avatar tone="elle" size={26} fontSize={11}>
              {o.person.initial}
            </Avatar>
          </span>
        ))}
        {more > 0 && <span className="-ml-2 flex size-[26px] items-center justify-center rounded-full bg-[#F1EFEA] text-[11px] font-black text-soft shadow-[0_0_0_2px_#FFFFFF]">+{more}</span>}
      </span>
    </Link>
  );
}

/**
 * Sophie, comme un contact : son avatar dans l’anneau de votre niveau, le verdict en badge, son prénom dessous. Un toucher ouvre sa fiche.
 * `shared` : 10 · c’est cet avatar (celui qu’on voit, mobile ou desktop) qui passe sur la fiche pendant le glissé.
 */
function SophieButton({ shared = false }: { shared?: boolean }) {
  const { report, fiche, ficheHref = "/app/fiche" } = useContact();
  const { on } = useHomeMotion();
  const { levels, index: idx, temperature } = scaleOf(report.level);
  const share = (idx + 1) / levels.length;
  const ring = 2 * Math.PI * 21;
  const where = temperature ? levels[idx].label : `niveau ${idx + 1} sur ${levels.length}`;
  const avatar = (
    <span data-sophie-avatar="" data-a="av" className="block rounded-full">
      <Avatar tone="elle" size={36} fontSize={15}>
        {fiche.person.initial}
      </Avatar>
    </span>
  );
  return (
    <Link
      href={ficheHref}
      prefetch={on ? true : undefined}
      transitionTypes={on ? ["nav-forward"] : undefined}
      aria-label={`${fiche.person.name}, voir sa fiche (${report.verdict.short}, ${where})`}
      className="group pointer-events-auto flex flex-col items-center gap-1 text-ink no-underline"
    >
      <span data-sophie="" data-c="so" className="relative flex size-12 items-center justify-center transition-[scale] duration-300 [transition-timing-function:var(--ease-pop)] group-active:scale-95">
        {/* 11 · Le halo vert quand un niveau tombe (un calque à part : il s’anime sur le compositeur) */}
        <span aria-hidden="true" data-glow-ring="" className="pointer-events-none absolute -inset-1 rounded-full opacity-0 shadow-[0_0_14px_3px_rgba(18,192,138,0.7)]" />
        <svg aria-hidden="true" viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
          <circle cx="24" cy="24" r="21" fill="none" stroke="#E6E3DC" strokeWidth="3.5" />
          <circle data-a="ring" data-ring-fill="" cx="24" cy="24" r="21" fill="none" stroke="#12C08A" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${ring * share} ${ring}`} />
        </svg>
        {shared && on ? (
          <ViewTransition name="sophie-avatar" share={{ "nav-forward": "avatar-morph", default: "none" }} default="none">
            {avatar}
          </ViewTransition>
        ) : (
          avatar
        )}
        <span
          aria-hidden="true"
          data-badge=""
          data-a="badge"
          className="absolute -bottom-1 -right-1.5 flex size-[22px] items-center justify-center rounded-full bg-white text-[12px] leading-none shadow-[0_0_0_1px_rgba(17,17,20,0.06),0_3px_8px_-3px_rgba(17,17,20,0.35)]"
        >
          {report.verdict.emoji}
        </span>
      </span>
      <span data-c="nm" data-a="nm" className="text-[12px] font-black leading-none">
        {fiche.person.name}
      </span>
    </Link>
  );
}

/* ———— La conv ———— */
type Pos = "single" | "first" | "middle" | "last";

/** Une bulle de la conv : `at` son heure (6 · glisse pour l’heure), `fresh` une réponse qui vient d’arriver (5 · elle se déplie). */
type Item = { key: string; node: BubbleNode; at: number | null; fresh: boolean };

/** Une ligne de la conv : la date d’un nouveau jour, un niveau franchi, ou un groupe de bulles d’un même expéditeur (l’heure dessous). */
type Row =
  | { kind: "day"; key: string; at: number | null }
  | { kind: "event"; key: string; level: LevelId }
  | { kind: "group"; key: string; from: Msg["from"]; at: number | null; landed: boolean; items: Item[] };

/** Ce que les bulles lisent autour d’elles : ton prochain pas, l’arrivée du jour (il s’écrit mot par mot), le mouvement. */
type BubbleEnv = { nextStep: string; arriving: boolean; motion: boolean; autre?: "il" | "elle" };

/** L’heure d’un message. L’intro se cale sur l’ouverture de l’écran (inconnue au rendu serveur : l’heure reste vide). */
function timeOf(m: Msg, opened: number | null) {
  if (m.at) return m.at;
  if (!m.seed || opened === null) return null;
  const d = new Date(opened);
  d.setDate(d.getDate() + m.seed.day);
  d.setHours(m.seed.h, m.seed.m, 0, 0);
  return d.getTime();
}

function rowsOf(msgs: Msg[], opened: number | null, env: BubbleEnv) {
  const rows: Row[] = [];
  let prev: number | null | undefined;
  for (const m of msgs) {
    if (m.from === "event") {
      rows.push({ kind: "event", key: `niveau-${m.id}`, level: m.level });
      continue;
    }
    const at = timeOf(m, opened);
    /* Chaque nouveau jour s’annonce par sa date, comme dans Messages */
    if (prev === undefined || (at !== null && prev !== null && dayStart(at) !== dayStart(prev))) rows.push({ kind: "day", key: `jour-${m.id}`, at });
    prev = at;
    /* « BLUSH écrit » a sa propre clé : à la réponse, le groupe repart de zéro et ses bulles montent */
    const items = bubblesOf(m, env).map((node, k) => ({ key: node.tone === "typing" ? `${m.id}-ecrit` : `${m.id}-${k}`, node, at, fresh: !!m.answered }));
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

/* Mémorisée : taper une lettre ou parler (le niveau du micro, 14 fois par seconde) ne recalcule pas toute la conv */
const Thread = memo(function Thread({ msgs, opened }: { msgs: Msg[]; opened: number | null }) {
  const { report, fiche } = useContact();
  const { on, arriving } = useHomeMotion();
  const rows = rowsOf(msgs, opened, { nextStep: report.nextStep, arriving, motion: on, autre: fiche.person.pronoun });
  /* « Aujourd’hui » se compte depuis le message le plus récent (une conv ouverte avant minuit reste juste) */
  const now = Math.max(opened ?? 0, ...rows.map((r) => (r.kind === "event" ? 0 : (r.at ?? 0))));
  return (
    /* mt-auto pose les messages en bas sans justify-end, qui rend le haut d’une conv longue inaccessible au défilement */
    <div data-thread="" className="mt-auto flex flex-col gap-4">
      {rows.map((r) =>
        r.kind === "day" ? (
          <p key={r.key} data-row={r.key} data-a={arriving && r.key === INTRO_DAY ? "day" : undefined} className="m-0 h-4 text-center text-[12px] font-bold leading-4 text-grey first:-mt-2">
            {r.at === null ? (
              " "
            ) : (
              <time dateTime={new Date(r.at).toISOString()}>
                <span className="font-black">{dayLabel(r.at, now)}</span> {clock(r.at)}
              </time>
            )}
          </p>
        ) : r.kind === "event" ? (
          <LevelEvent key={r.key} row={r.key} level={r.level} />
        ) : (
          <Group key={r.key} row={r} />
        ),
      )}
    </div>
  );
});

/** 11 · Un niveau franchi pendant la visite : un repère au milieu de la conv (texte relu le 8 octobre). */
function LevelEvent({ row, level }: { row: string; level: LevelId }) {
  const { levels, index, temperature } = scaleOf(level);
  return (
    <p data-row={row} className="m-0 flex justify-center">
      <span data-popin="" className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-[#E3F6EE] px-3 text-[13px] font-extrabold text-vrai-ink">
        <Icon name="sparkle" size={14} color="#087A56" stroke={2.6} />
        {temperature ? "Nouvelle température" : "Nouveau niveau"} · <b className="font-black">{levels[index].label}</b>
      </span>
    </p>
  );
}

/** Les bulles d’un même expéditeur : l’avatar de BLUSH sous la dernière, l’heure dessous (ou « BLUSH écrit » à la place). */
function Group({ row }: { row: Extract<Row, { kind: "group" }> }) {
  const { on, arriving } = useHomeMotion();
  /* 1 · L’arrivée : BLUSH écrit un instant, puis l’intro se pose */
  const intro = arriving && row.key === INTRO_GROUP;
  const typing = row.items.find((it) => it.node.tone === "typing");
  const bubbles = row.items.filter((it) => it !== typing);
  const n = bubbles.length;
  /* 5 · Une réponse qui vient d’arriver se déplie depuis l’avatar, de la dernière bulle à la première */
  const fresh = on ? bubbles.filter((it) => it.fresh) : [];
  return (
    <div data-row={row.key} data-group="" className="relative flex flex-col gap-[3px]">
      {bubbles.map((it, i) => {
        const pos: Pos = n === 1 ? "single" : i === 0 ? "first" : i === n - 1 ? "last" : "middle";
        const unfold = fresh.includes(it) ? (fresh.length - 1 - fresh.indexOf(it)) * 0.12 : null;
        /* 6 · L’heure de chaque bulle attend hors champ, à droite */
        const time =
          on && it.at !== null ? (
            <span aria-hidden="true" className="swipe-time">
              {clock(it.at)}
            </span>
          ) : null;
        return row.from === "blush" ? (
          <div
            key={it.key}
            data-rise={unfold === null ? "" : undefined}
            data-a={intro ? "intro" : undefined}
            className="relative flex items-end gap-2"
            style={{ "--d": `${i * 0.06}s`, "--i": i } as CSSProperties}
          >
            {i === n - 1 ? (
              /* Juste après « BLUSH écrit », sa petite bulle arrive d’un bond avec la réponse (en mouvement : elle y vole) */
              <span data-avatar="" data-land={row.landed && !on ? "" : undefined} data-a={intro ? "intro-av" : undefined} className="-mb-0.5 block shrink-0">
                <BubbleLogo size={34} />
              </span>
            ) : (
              <span aria-hidden="true" className="w-[34px] shrink-0" />
            )}
            {/* 7 · La flèche pour creuser, cachée derrière la bulle */}
            {on && it.node.quote && (
              <span aria-hidden="true" data-dig-icon="">
                <Icon name="reply" size={16} color="currentColor" stroke={2.6} />
              </span>
            )}
            <BubbleShape side="blush" pos={pos} node={it.node} id={it.key} unfold={unfold} />
            {time}
          </div>
        ) : (
          <div key={it.key} data-rise="" className="relative flex justify-end">
            <BubbleShape side="toi" pos={pos} node={it.node} id={it.key} />
            {time}
          </div>
        );
      })}
      {intro && (
        <span aria-hidden="true" data-a="ghost" className="pointer-events-none absolute bottom-[18px] left-0 block">
          <BubbleLogo size={62} animated layered />
        </span>
      )}
      {typing ? (
        <div key={typing.key} data-reading={typing.key} className="flex items-end pt-1">
          {typing.node.body}
        </div>
      ) : (
        <span data-a={intro ? "intro-tm" : undefined} className={cn("mt-0.5 h-3.5 text-[11px] font-bold leading-[14px] text-grey", row.from === "blush" ? "pl-[46px]" : "pr-1.5 text-right")}>
          {row.at === null ? " " : <time dateTime={new Date(row.at).toISOString()}>{clock(row.at)}</time>}
        </span>
      )}
    </div>
  );
}

/** Une bulle : sa forme vient de sa place dans le groupe, son style de son contenu. `quote` : 7 · ce qu’on creuse en la glissant. */
type BubbleNode = { body: ReactNode; tone?: "plain" | "accent" | "toi" | "bare" | "typing"; className?: string; quote?: string };

function BubbleShape({ side, pos, node, id, unfold = null }: { side: "blush" | "toi"; pos: Pos; node: BubbleNode; id: string; unfold?: number | null }) {
  const { on } = useHomeMotion();
  const tone = node.tone ?? (side === "toi" ? "toi" : "plain");
  const quote = on && side === "blush" ? node.quote : undefined;
  const corners =
    side === "blush"
      ? { single: "", first: "rounded-bl-[6px]", middle: "rounded-l-[6px]", last: "rounded-tl-[6px]" }[pos]
      : { single: "", first: "rounded-br-[6px]", middle: "rounded-r-[6px]", last: "rounded-tr-[6px]" }[pos];
  return (
    <div
      data-bubble={id}
      data-quote={quote}
      data-unfold={unfold !== null ? "" : undefined}
      style={unfold !== null ? ({ "--d": `${unfold}s` } as CSSProperties) : undefined}
      className={cn(
        "relative z-[1] flex max-w-[318px] flex-col rounded-[20px] text-left",
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

function VerdictEmoji() {
  return useContact().report.verdict.emoji;
}

/** 1 · Ton prochain pas, mot par mot pendant l’arrivée (les espaces insécables gardent « pas : » ensemble). */
function Words({ text }: { text: string }) {
  return text.split(" ").map((w, i) => (
    <span key={i}>
      {i > 0 && " "}
      <span data-a="w" style={{ "--i": i } as CSSProperties}>
        {w}
      </span>
    </span>
  ));
}

function bubblesOf(m: Exclude<Msg, { from: "event" }>, env: BubbleEnv): BubbleNode[] {
  if ("intro" in m)
    return m.intro === "next"
      ? [
          {
            tone: "accent",
            quote: env.nextStep,
            body: (
              <span className="flex items-start gap-2.5">
                <Icon name="bolt" size={18} color="#3D8BFF" className="mt-0.5 shrink-0" />
                <span className="flex flex-col gap-[3px]">
                  <span className="text-[12px] font-black text-toi-ink">À toi de jouer</span>
                  <span className="text-[16px] font-black leading-[1.35]">{env.arriving ? <Words text={env.nextStep} /> : env.nextStep}</span>
                </span>
              </span>
            ),
          },
        ]
      : [
          {
            body: (
              <span className="flex flex-col gap-1">
                <span className="text-[16px] font-black leading-[1.3]">{IlOuElle(env.autre)} vient de répondre ?</span>
                <span className="text-[14px] font-extrabold leading-[1.45] text-soft">Ajoute sa réponse : capture, export ou texte. BLUSH reconnaît tout seul.</span>
              </span>
            ),
          },
        ];
  if ("reading" in m) return [{ tone: "typing", body: <BlushTyping label={m.reading} leaving={m.leaving} vocal={m.vocal} /> }];
  if ("notice" in m) return [{ body: <span className="text-[15px] font-extrabold leading-[1.45]">{m.notice}</span> }];
  if ("voice" in m) return [{ className: "py-2 pl-2 pr-3.5", body: <VoiceNote clip={m.voice} /> }];
  if ("text" in m)
    return [
      {
        body: (
          <span className="flex min-w-0 flex-col">
            {/* 7 · Le point creusé, rappelé au-dessus de ta question */}
            {m.about && <span className="mb-1 truncate border-l-2 border-[rgba(255,255,255,0.55)] pl-2 text-[13px] font-extrabold leading-[1.35] text-[rgba(255,255,255,0.82)]">{m.about}</span>}
            <span className="whitespace-pre-wrap text-[16px] font-bold leading-[1.4]">{m.text}</span>
          </span>
        ),
      },
    ];
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
  /* 5 · La meilleure réponse d’une réponse qui vient d’arriver brille une fois */
  const shine = env.motion && !!m.answered;
  /* Le message qu’il a lu (une capture, ou son dernier message pour « ça veut dire quoi ? ») */
  const incoming = (reply: Reply): BubbleNode => ({
    className: "pb-2.5 pt-3",
    quote: reply.incoming.text,
    body: (
      <MessageBubble from="elle" caption={reply.incoming.caption}>
        {reply.incoming.text}
      </MessageBubble>
    ),
  });
  /* Une réponse dite en vocal : la bulle vocale à la place des bulles écrites ; les messages qu’elle cite et la réponse à envoyer restent */
  if (r.kind === "bubbles" && r.vocal)
    return [
      ...(r.incoming ?? []).map(
        (msg): BubbleNode => ({
          className: "pb-2.5 pt-3",
          quote: msg.text,
          body: (
            <MessageBubble from={msg.from} caption={msg.caption}>
              {msg.text}
            </MessageBubble>
          ),
        }),
      ),
      { className: "py-2.5 pl-2.5 pr-3.5", quote: r.bubbles.map((b) => b.text).join(" "), body: <VocalBlush vocal={r.vocal} /> },
      ...r.bubbles.flatMap((b) =>
        (b.messages ?? []).map((msg) => ({ className: "pb-2.5 pt-3", quote: msg.text, body: <ClampedBubble from={msg.from} caption={msg.caption} text={msg.text} limit={25} /> })),
      ),
      ...(r.send ? [{ quote: r.send.join("\n"), body: <SendReply lines={r.send} why={r.why} shine={shine} /> }] : []),
    ];
  /* La réponse en bulles : chaque bulle, puis les messages qu’elle cite, comme dans un vrai fil */
  if (r.kind === "bubbles")
    return [
      /* Le message qu’il a reçu, montré d’abord */
      ...(r.incoming ?? []).map(
        (msg): BubbleNode => ({
          className: "pb-2.5 pt-3",
          quote: msg.text,
          body: (
            <MessageBubble from={msg.from} caption={msg.caption}>
              {msg.text}
            </MessageBubble>
          ),
        }),
      ),
      ...r.bubbles.flatMap((b): BubbleNode[] => [
        { quote: b.text, body: <span className="text-[16px] font-bold leading-[1.4]">{b.text}</span> },
        ...(b.messages ?? []).map((msg) => ({
          className: "pb-2.5 pt-3",
          quote: msg.text,
          body: <ClampedBubble from={msg.from} caption={msg.caption} text={msg.text} limit={25} />,
        })),
      ]),
      ...(r.send ? [{ quote: r.send.join("\n"), body: <SendReply lines={r.send} why={r.why} shine={shine} /> }] : []),
      ...(r.ask ? [{ quote: r.ask, body: <span className="text-[16px] font-bold leading-[1.4]">{r.ask}</span> }] : []),
      ...(r.react ? [{ quote: r.react, body: <span className="text-[16px] font-bold leading-[1.4]">{r.react}</span> }] : []),
    ];
  if (r.kind === "best") return [incoming(r.reply), { quote: r.reply.best, body: <BestReply reply={r.reply} shine={shine} /> }];
  if (r.kind === "level")
    return [
      {
        quote: r.answer.title,
        body: (
          <span className="flex items-start gap-2.5">
            <span aria-hidden="true" className="text-[30px] leading-none">
              <VerdictEmoji />
            </span>
            <span className="text-[17px] font-black leading-[1.3]">{r.answer.title}</span>
          </span>
        ),
      },
      {
        quote: r.answer.evidence,
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
        quote: r.answer.title,
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
    /* Sur une capture (ou une question sur son dernier message), BLUSH montre d’abord le message qu’il a lu */
    ...(m.fromCapture || r.quoted ? [incoming(r.reply)] : []),
    {
      quote: r.reply.meaningTitle,
      body: (
        <span className="flex flex-col gap-1">
          <span className="text-[12px] font-black text-grey">Ce que ça veut dire</span>
          <span className="text-[17px] font-black leading-[1.3]">{r.reply.meaningTitle}</span>
          <span className="text-[14px] font-extrabold leading-[1.45] text-soft">{r.reply.meaningProof}</span>
        </span>
      ),
    },
    { quote: r.reply.best, body: <BestReply reply={r.reply} shine={shine} /> },
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

/** La meilleure réponse à lui envoyer : une vraie bulle, à copier en un geste. La coche « Copié » confirme. `shine` : elle brille une fois en arrivant. */
function BestReply({ reply, shine = false }: { reply: Reply; shine?: boolean }) {
  return (
    <span className="flex flex-col gap-2">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-black text-vrai-ink">Ta meilleure réponse</span>
        <Tag tone="recommandee" />
      </span>
      <span data-shine={shine ? "" : undefined} className="self-start rounded-[18px] rounded-br-[6px] bg-toi-ink px-3.5 py-2 font-message text-[15px] font-bold leading-[1.35] text-white">
        {reply.best}
      </span>
      <span className="text-[13px] font-extrabold leading-[1.45] text-grey">{reply.why}</span>
      <span className="mt-1 flex">
        <CopyPill text={reply.best} label="Copier" />
      </span>
    </span>
  );
}

/** L’aperçu en local : ta question part au vrai chat, avec le fil déjà échangé (tes messages, et ce que BLUSH a répondu). */
async function askLive(url: string, text: string, history: { from: "toi" | "blush"; text: string }[]): Promise<BlushAnswer> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, history }) });
  return (await r.json()) as BlushAnswer;
}

function historyOf(msgs: Msg[]): { from: "toi" | "blush"; text: string }[] {
  return msgs
    .flatMap((m): { from: "toi" | "blush"; text: string }[] => {
      if (m.from === "toi" && "text" in m) return [{ from: "toi", text: m.text }];
      if (m.from === "blush" && "result" in m && m.result.kind === "bubbles") return [{ from: "blush", text: [...m.result.bubbles.map((b) => b.text), ...(m.result.send ?? []), m.result.ask ?? ""].filter(Boolean).join(" / ") }];
      return [];
    })
    .slice(-6);
}

/** Les messages à lui envoyer, une bulle chacun, à copier en un geste. */
function SendReply({ lines, why, shine = false }: { lines: string[]; why?: string; shine?: boolean }) {
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

/**
 * 9 · L’écran recule derrière la feuille, comme sur iPhone (mobile seulement) : il rétrécit un peu, s’arrondit, et le noir apparaît autour.
 * « reset » remet tout en place sans animation (fermeture, départ vers une autre page).
 */
function recede(state: "in" | "out" | "reset", timing?: Spring) {
  const page = document.querySelector<HTMLElement>(".home-page");
  /* Le fond noir vit sur <body> : on l’enlève toujours, même quand l’accueil a déjà disparu
     (depuis la feuille, on part vers le rapport ou sa fiche : l’accueil est retiré avant ce nettoyage) */
  if (state === "reset" || !page || window.matchMedia(DESKTOP).matches) {
    document.body.style.removeProperty("background");
    if (!page) return;
    page.getAnimations().forEach((a) => a.cancel());
    page.parentElement?.style.removeProperty("background");
    page.style.removeProperty("background");
    page.style.removeProperty("background-color");
    page.style.removeProperty("clip-path");
    return;
  }
  page.getAnimations().forEach((a) => a.cancel());
  const y = window.scrollY - page.offsetTop;
  const vh = window.innerHeight;
  const below = Math.max(0, page.offsetHeight - y - vh);
  /* Accroché en haut : la carte touche la barre d’état de Safari (qui garde sa couleur), le noir n’apparaît que sur les côtés.
     La découpe arrondie est posée d’un coup, seule l’échelle s’anime : le compositeur la joue seul, même sur une longue conv */
  page.style.transformOrigin = `50% ${y}px`;
  page.style.background = "var(--paper-light)";
  page.style.backgroundColor = "var(--paper)";
  page.style.clipPath = `inset(${y}px 0 ${below}px 0 round 24px)`;
  const rest: Keyframe = { transform: "none" };
  const back: Keyframe = { transform: "scale(0.94)" };
  page.animate(state === "in" ? [rest, back] : [back, rest], { duration: timing?.duration ?? 300, easing: timing?.easing, fill: state === "in" ? "forwards" : "none" });
  /* Le noir autour : sur la page et sur son cadre (qui a son propre fond pour le glissé vers la fiche) */
  if (state === "in") {
    document.body.style.background = "#000";
    page.parentElement?.style.setProperty("background", "#000");
  }
}

/** Cache ou remontre un élément sans changer la mise en page (pendant qu’un double vole à sa place). */
function shown(el: HTMLElement | SVGElement, on: boolean) {
  el.style.visibility = on ? "" : "hidden";
}

/* ———— Les détails du contact : où vous en êtes, le rapport, sa fiche ———— */
function ContactSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { report, fiche, period, ficheHref = "/app/fiche" } = useContact();
  const { on } = useHomeMotion();
  const logoRef = useRef<HTMLSpanElement>(null);
  const avRef = useRef<HTMLSpanElement>(null);
  /* 9 · Ce qui a quitté l’en-tête pour la feuille : la bulle et l’avatar de Sophie, et d’où ils venaient (pour y revenir) */
  const moved = useRef<{ src: HTMLElement; from: Box; target: HTMLElement | SVGElement }[]>([]);
  const closing = useRef(false);

  useEffect(() => {
    if (!open || !on || prefersReducedMotion()) return;
    const logoBox = logoRef.current;
    const avBox = avRef.current;
    const panel = logoBox?.closest<HTMLElement>("[tabindex='-1']");
    const still = panel?.offsetParent as HTMLElement | null | undefined;
    const dialog = logoBox?.closest("dialog");
    const logo = logoBox?.querySelector("svg");
    const av = avBox?.firstElementChild as HTMLElement | null | undefined;
    if (!logoBox || !avBox || !panel || !still || !dialog || !logo || !av) return;
    const pairs = [
      { src: visible<HTMLElement>("[data-blush-logo]"), measure: logoBox, target: logo as SVGElement },
      { src: visible<HTMLElement>("[data-sophie-avatar]"), measure: avBox, target: av },
    ];
    moved.current = [];
    for (const p of pairs) {
      if (!p.src) continue;
      const from = p.src.getBoundingClientRect();
      const to = restingBox(p.measure, still);
      const clone = p.target.cloneNode(true) as HTMLElement | SVGElement;
      shown(p.src, false);
      shown(p.target, false);
      const target = p.target;
      void flyBox(clone, from, to, { spring: SHEET_IN, host: dialog, settle: 1 }).then(() => {
        if (!closing.current) shown(target, true);
      });
      moved.current.push({ src: p.src, from, target: p.target });
    }
    recede("in", SHEET_IN);
    return () => {
      /* La feuille est fermée (ou on part vers le rapport, sa fiche) : tout reprend sa place */
      for (const m of moved.current) {
        shown(m.src, true);
        shown(m.target, true);
      }
      moved.current = [];
      closing.current = false;
      recede("reset");
    };
  }, [open, on]);

  /* La fermeture : la feuille redescend, la bulle et l’avatar regagnent l’en-tête, l’écran revient */
  const close = () => {
    if (closing.current) return;
    const panel = logoRef.current?.closest<HTMLElement>("[tabindex='-1']");
    const dialog = logoRef.current?.closest("dialog");
    if (!on || prefersReducedMotion() || !moved.current.length || !panel || !dialog) {
      onClose();
      return;
    }
    closing.current = true;
    const desk = window.matchMedia(DESKTOP).matches;
    panel.animate(desk ? [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(16px) scale(0.98)" }] : [{ transform: "none" }, { transform: "translateY(100%)" }], { ...SHEET_OUT, fill: "forwards" });
    panel.parentElement?.previousElementSibling?.animate([{ opacity: 1 }, { opacity: 0 }], { ...SHEET_OUT, fill: "forwards" });
    for (const m of moved.current) {
      const from = m.target.getBoundingClientRect();
      const clone = m.target.cloneNode(true) as HTMLElement | SVGElement;
      shown(m.target, false);
      void flyBox(clone, from, m.from, { spring: SHEET_OUT, host: dialog, settle: 1 });
    }
    recede("out", SHEET_OUT);
    window.setTimeout(onClose, SHEET_OUT.duration);
  };

  return (
    <Sheet open={open} onClose={close} labelledBy="contact-titre">
      <div className="relative flex flex-col items-center gap-2 pt-1 text-center">
        <IconButton icon="close" label="Fermer" onClick={close} className="!absolute right-0 top-0" />
        <span className="flex items-center gap-1.5 text-[13px] font-black text-grey">
          <span ref={logoRef} className="-my-2 block">
            <BubbleLogo size={36} />
          </span>
          Ce que BLUSH voit
        </span>
        <span ref={avRef} className="block">
          <Avatar tone="elle" size={72} fontSize={28}>
            {fiche.person.initial}
          </Avatar>
        </span>
        <h2 id="contact-titre" className="m-0 text-[22px] font-black tracking-[-0.01em]">
          {fiche.person.name} et toi
        </h2>
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-black">
            {report.verdict.emoji} {report.verdict.short}
          </span>
          <Tag tone="verite">{report.trend}</Tag>
        </span>
      </div>
      <div className="rounded-[20px] bg-white px-3 pb-3 pt-4 shadow-card">
        <LevelStepper />
      </div>
      <div className="flex flex-col overflow-hidden rounded-[20px] bg-white shadow-card">
        <DetailRow href="/rapport" icon={<span className="text-[20px] leading-none">{report.verdict.emoji}</span>} title="Le rapport de votre histoire" sub={period} />
        <DetailRow
          href={ficheHref}
          icon={
            <Avatar tone="elle" size={36} fontSize={15}>
              {fiche.person.initial}
            </Avatar>
          }
          title="Sa fiche"
          sub={fiche.summaryShort}
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

/** Les 4 niveaux en version compacte : un fil, des points, les noms dessous. En couple, la température : juste où vous êtes, sans coches. */
function LevelStepper({ className }: { className?: string }) {
  const { report } = useContact();
  const { levels, index: idx, temperature } = scaleOf(report.level);
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
              <span className="sr-only">{now ? (temperature ? " : vous en êtes là" : " : niveau en cours") : done ? " : réussi" : temperature ? "" : " : à venir"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
