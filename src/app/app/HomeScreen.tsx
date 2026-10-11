"use client";

import { IlOuElle } from "@/lib/pronom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  memo,
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  ViewTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { basDePage } from "@/lib/defilement";
import { pagePrecedente } from "@/lib/navigation";
import { delai, DESKTOP, flipFrom, flyBox, flyText, prefersReducedMotion, snapshotTops, spring, textWidth, visible, wavePearls, type BubbleLook, type Box } from "@/lib/motion";
import { play } from "@/lib/sound";
import { sendToBlush, sendVoiceToBlush } from "@/services/api";
import { markArrivalPlayed } from "@/services/session";
import { BubbleLogo } from "@/components/brand/objects3d";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/FileInput";
import { Icon } from "@/components/ui/icons";
import { marquerChatOuvert } from "../rapport/ChatBubble";
import dynamic from "next/dynamic";
import { Bubble as MessageBubble, BlushTyping } from "@/components/ui/messages";
import { ClampedBubble } from "@/components/ui/clamp";
import { scaleOf } from "@/components/ui/progress";
import { AppScreen } from "@/components/shell/AppScreen";
import { figtree } from "@/lib/fonts";
import { useHydrated } from "@/state/journey";
import type { BlushAnswer, BulleChat, ConvSummary, LevelId, Pronom } from "@/types";
import { VocalBlush, VoiceNote, type VoiceClip, type VoiceError } from "./voice";
import { Composer, formatSize, SendReply } from "./accueil/Composer";
import {
  CLE_INTRO,
  CLE_JOUR_INTRO,
  cleBulle,
  cleDeBulle,
  clock,
  dayLabel,
  depli,
  maintenantDe,
  rowsOf,
  tapeEncore,
  typeInconnu,
  type EchangeScript,
  type Msg,
  type MsgABulles,
  type Row,
} from "./accueil/conv/modele";
import { nouvelId, useConversation } from "./accueil/conv/useConversation";
import { ContactSheet, departs, type Departs } from "./accueil/ContactSheet";
import type { HomeContact } from "./accueil/contact";
import type { Devant } from "./accueil/conv/useChargerAnciens";

/* « Partager en image » ne s’ouvre qu’au toucher : sa feuille (src/app/rapport/Partage.tsx) arrive à part, après l’affichage */
const PartageImageSheet = dynamic(() => import("../rapport/Partage").then((m) => m.PartageImageSheet), { ssr: false });


const ContactContext = createContext<HomeContact | null>(null);

function useContact() {
  const contact = use(ContactContext);
  if (!contact) throw new Error("useContact : hors de HomeScreen");
  return contact;
}

/**
 * L’accueil en mouvement. `arriving` : l’arrivée du jour se joue. Pas `desktop`, inconnu au rendu serveur : connu juste
 * après l’hydratation, il referait toute la conv.
 * « Réduire les animations » coupe tout ce qui bouge : globals.css pour le CSS, prefersReducedMotion() pour le reste.
 */
type HomeMotion = { arriving: boolean };

const MotionContext = createContext<HomeMotion>({ arriving: false });

const useHomeMotion = () => use(MotionContext);


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

/*
 * 3 · 4 · Une bulle qui vole jusqu’à sa place : depuis la pastille touchée, ou depuis le champ.
 * 5 · La bulle qui écrit vole jusqu’à l’avatar de la réponse.
 */
type Flight = { kind: "text"; bubble: string; text: string; from: Box; start: BubbleLook } | { kind: "logo"; bubble: string; from: Box };

const CHIP_LOOK: BubbleLook = { background: "#FFFFFF", ring: "inset 0 0 0 1.5px rgba(26, 102, 219, 0.28)", radius: 999, color: "#1A66DB", size: 14, weight: 800, pad: 14 };
const FIELD_LOOK: BubbleLook = { background: "rgba(26, 102, 219, 0)", radius: 20, color: "#121214", size: 16, weight: 800, pad: 16 };
const BUBBLE_LOOK: BubbleLook = { background: "#1A66DB", radius: 20, color: "#FFFFFF", size: 16, weight: 700, pad: 16 };

/*
 * L’arrivée du jour s’est jouée depuis l’ouverture de l’appli. Revenu par l’historique (le geste retour, « Retour » sur sa
 * fiche), l’accueil remonte depuis le cache de Next, avec le `arrive` d’avant le cookie : sans ce drapeau, l’arrivée et
 * sa signature se rejoueraient. Rien au rendu serveur ni à l’hydratation (le module est neuf) : pas d’écart.
 */
let arriveeJouee = false;

/*
 * Un retour par l’historique (le geste retour, « Retour » sur sa fiche) : l’adresse et le moment du dernier. Et où en
 * était la conv quand on a quitté l’accueil (mobile) ? Tout en bas, elle y revient ; lue plus haut, elle revient à
 * cette place (la conv gardée est la même, voir useConversation).
 */
let traversee: { href: string; at: number } | null = null;
let quittee = { enBas: true, y: 0 };
if (typeof window !== "undefined") window.addEventListener("popstate", () => (traversee = { href: location.href, at: performance.now() }));

/*
 * Les questions toutes prêtes déjà posées pendant la visite, gardées hors de l’accueil avec la conv (celle de la conv
 * ouverte seulement, voir useConversation) : revenu sur l’accueil, elles ne reviennent pas dans la rangée.
 * Seuls les effets l’écrivent : rien au rendu serveur ni à l’hydratation.
 */
let posees: { cle: string; asked: string[] } | null = null;
/* Les questions toutes prêtes ont fait leur entrée : revenu sur l’accueil, elles sont déjà là (elles la refont après une réponse) */
let pastillesPosees = false;

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
 * En mouvement, onze idées : 1 l’arrivée du jour, 2 BLUSH t’écoute, 3 la question qui s’envole,
 * 4 l’envoi façon Messages, 5 les perles deviennent la réponse, 6 glisse pour l’heure, 7 glisse pour creuser,
 * 8 l’en-tête qui se replie, 9 la bulle s’ouvre, 10 Sophie en glissé (page.tsx et la fiche), 11 le niveau qui monte.
 */
export function HomeScreen({
  quick = [],
  answers = {},
  liveUrl,
  script = [],
  plusAnciens = false,
  modeVocalInitial,
  contact,
  arrive = false,
  fromReport = false,
  others = [],
  introAt,
  ideesMasquees = false,
  storyId,
  rendu,
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
  /** Back-end : le mode vocal du chat, tel qu’il est en base (« Repasser à l’écrit » compris). */
  modeVocalInitial?: boolean;
  contact: HomeContact;
  arrive?: boolean;
  /** Arrivé par la bulle du rapport : sur mobile, le retour au rapport remplace le bouton du compte. */
  fromReport?: boolean;
  /** Plusieurs convs : les autres convs du compte. En haut à gauche, un bouton ramène à leur liste. */
  others?: ConvSummary[];
  /** Back-end : quand la lecture s’est finie (l’heure de l’intro de BLUSH). */
  introAt?: number;
  /** Les idées de questions masquées sur cet appareil (le cookie, lu par la page). */
  ideesMasquees?: boolean;
  /** La conv ouverte : la conv gardée pendant la visite n’est reprise que pour elle (sans elle, comme l’aperçu, rien n’est gardé). */
  storyId?: string;
  /** Back-end : l’heure du rendu serveur de la page (heureDuRendu). L’historique qu’elle vient de rendre n’est pas relu à l’ouverture. */
  rendu?: number;
}) {
  const router = useRouter();
  const cle = storyId;
  /* Des messages posés devant (ou fondus dans la conv) : voir Devant (accueil/conv/useChargerAnciens.ts) */
  const devant = useRef<Devant | null>(null);
  const haut = useRef<HTMLDivElement>(null);
  /* Les questions toutes prêtes font leur entrée au premier affichage de l’accueil, puis à leur retour après une réponse */
  const [entreeIdees, setEntreeIdees] = useState(() => !pastillesPosees);
  /* « Partager en image » : la réponse choisie */
  const [image, setImage] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  /* 9 · D’où partent la bulle et l’avatar vers la feuille du contact : relevé au toucher, quand la page est encore à jour */
  const departRef = useRef<Departs | null>(null);
  const ouvrirDetails = () => {
    departRef.current = departs();
    setDetails(true);
  };
  /* 7 · Le point creusé : ta prochaine question porte dessus */
  const [about, setAbout] = useState<string | null>(null);
  /* 11 · Où vous en êtes : un message peut vous faire passer un cap pendant la visite */
  const [level, setLevel] = useState(contact.report.level);
  const levelNow = useRef(contact.report.level);
  const [cheer, setCheer] = useState(0);
  /* 1 · L’arrivée, une fois par jour (le serveur le sait par un cookie), et une seule fois depuis l’ouverture de l’appli */
  const [arriving, setArriving] = useState(() => arrive && !arriveeJouee);
  const signed = useRef(false);
  const thread = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  /* La hauteur de la barre de saisie au dernier relevé (pour savoir de combien elle a changé) */
  const barre = useRef(0);
  const urls = useRef<string[]>([]);
  /* Avant chaque changement de la conv : où étaient ses lignes (pour les faire glisser), et la bulle qui doit voler */
  const before = useRef<Map<string, number> | null>(null);
  const flight = useRef<Flight | null>(null);
  /* Les questions toutes prêtes déjà posées pendant la visite disparaissent de la rangée */
  const [asked, setAsked] = useState<string[]>(() => (cle !== undefined && posees?.cle === cle ? posees.asked : []));

  /*
   * La conv elle-même : ses messages, ses actions, le mode vocal et l’historique (accueil/conv/useConversation.ts).
   * L’accueil l’habille : ce que fait l’écran pendant qu’elle change, c’est sa scène.
   */
  const conv = useConversation({
    cle,
    introAt,
    script,
    plusAnciens,
    modeVocalInitial,
    rendu,
    scene: {
      devant,
      mesurer: (marque) => mesurer(thread.current, marque),
      auRepos: () => auRepos(thread.current),
      /* On note d’abord où sont les lignes de la conv, pour les faire glisser ensuite */
      avantChangement: () => {
        if (!before.current && thread.current) before.current = snapshotTops(dernieresLignes(thread.current), (el) => el.dataset.row);
      },
      /* Les questions toutes prêtes s’effacent le temps de la réponse : à leur retour, elles refont leur entrée */
      echangeCommence: () => setEntreeIdees(true),
      ecritCede: (reponse) => {
        if (prefersReducedMotion()) return;
        /* 5 · La bulle qui écrit se pose en avatar, et la réponse se déplie depuis elle, sans temps mort */
        const typing = thread.current?.querySelector(`[data-reading="${cleBulle(reponse, "ecrit")}"] svg`);
        if (typing) flight.current = { kind: "logo", bubble: cleBulle(reponse, 0), from: typing.getBoundingClientRect() };
      },
      /* Un pop quand la réponse remplace les perles. Rien si tu écris déjà la suite */
      reponsePosee: () => {
        if (!input.current?.value) play("reponse");
      },
      niveau: (to) => levelUp(to),
    },
  });
  const { msgs, depuis, plus, anciens, chargerAnciens, precharger, modeVocal } = conv;
  const shown = useRef(msgs);
  /* BLUSH « écrit » (ses bulles arrivent encore) : sa bulle s’anime en haut de la conv. Une réponse coupée attend « Réessayer » */
  const busy = conv.occupe;
  const opened = useOpenedAt();
  const desktop = useDesktop();
  const live = useMemo(() => ({ ...contact, report: { ...contact.report, level } }), [contact, level]);
  const moving = useMemo(() => ({ arriving }), [arriving]);

  /* Le chat est ouvert : la bulle du rapport arrête de s’agiter */
  useEffect(() => marquerChatOuvert(), []);

  /*
   * 10 · Les glissés (vers sa fiche, vers la liste des convs, et leurs retours) font glisser l’accueil en entier : la
   * racine, une image de l’écran, quelle que soit la longueur de la conv (globals.css, « Sophie, en glissé »). React
   * retire la racine des glissés, sauf quand elle porte déjà son nom en style : on le lui donne (c’est son nom par
   * défaut, sans effet hors d’un glissé). Il reste posé : à l’aller, l’accueil est déjà parti quand React regarde.
   */
  useLayoutEffect(() => {
    document.documentElement.style.viewTransitionName = "root";
  }, []);

  useEffect(() => {
    if (!arriving) return;
    arriveeJouee = true;
    markArrivalPlayed();
    /* La signature tombe avec le « coucou » des perles (0,85 s, une perle toutes les 0,11 s). Ouverte à froid, Safari la garde muette */
    if (!signed.current) play("signature", 0.85, 0.11);
    signed.current = true;
    const t = window.setTimeout(() => setArriving(false), 3700);
    /* Le premier geste (un toucher, la molette, une touche) coupe l’arrivée : ce qui reste à jouer se pose d’un coup, rien ne fait attendre */
    const couper = () => {
      const restantes = new Set<Animation>();
      document.querySelectorAll(".home-arrive [data-a]").forEach((el) => el.getAnimations({ subtree: true }).forEach((a) => restantes.add(a)));
      restantes.forEach((a) => {
        /* Seulement ce qui a une fin : une boucle (le logo qui flotte) continue */
        const fin = a.effect?.getComputedTiming().endTime;
        if (typeof fin === "number" && Number.isFinite(fin)) a.finish();
      });
      setArriving(false);
    };
    const gestes = ["pointerdown", "wheel", "keydown"] as const;
    gestes.forEach((g) => window.addEventListener(g, couper, { capture: true, passive: true }));
    return () => {
      window.clearTimeout(t);
      gestes.forEach((g) => window.removeEventListener(g, couper, { capture: true }));
    };
  }, [arriving]);

  /*
   * À l’ouverture, la conv se pose en bas, sur le dernier échange, sans animation (la page sur mobile, la fenêtre sur
   * desktop). Revenu par l’historique alors qu’on lisait plus haut, elle revient à cette place : la conv gardée est la
   * même qu’au départ, et le navigateur, qui remet la place avant que la page soit là, la tronquerait.
   * Juste après, la conv s’allonge (les jours et les heures, posés après l’hydratation ; les polices) : tant qu’on n’a
   * pas bougé, elle reste en bas. Safari, lui, ne garde pas la place tout seul (pas d’ancrage du défilement).
   */
  useLayoutEffect(() => {
    const box = thread.current;
    const fil = box?.querySelector("[data-thread]");
    if (!box || !fil) return;
    const retour = traversee !== null && traversee.href === location.href && performance.now() - traversee.at < 10_000;
    traversee = null;
    const desk = window.matchMedia(DESKTOP).matches;
    if (!desk && retour && !quittee.enBas) {
      window.scrollTo({ top: Math.min(quittee.y, basDePage()) });
      return;
    }
    const ou = () => (desk ? box.scrollTop : window.scrollY);
    let pose = 0;
    const poser = () => {
      if (desk) box.scrollTop = box.scrollHeight;
      else window.scrollTo({ top: basDePage() });
      pose = ou();
    };
    poser();
    const obs = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => Math.abs(ou() - pose) < 2 && poser());
    obs?.observe(fil);
    /* Le premier geste (ou 3 s) : la conv est à toi */
    const lacher = () => {
      obs?.disconnect();
      window.clearTimeout(t);
      gestes.forEach((g) => window.removeEventListener(g, lacher, { capture: true }));
    };
    const t = window.setTimeout(lacher, 3000);
    const gestes = ["pointerdown", "wheel", "keydown"] as const;
    gestes.forEach((g) => window.addEventListener(g, lacher, { capture: true, passive: true }));
    return lacher;
  }, []);

  /* Mobile : où en est la conv, tout en bas ou plus haut ? (relevé jusqu’au départ de l’accueil, pour un retour par l’historique) */
  useLayoutEffect(() => {
    const suivre = () => {
      quittee = { enBas: window.scrollY >= basDePage() - 4, y: window.scrollY };
    };
    suivre();
    window.addEventListener("scroll", suivre, { passive: true });
    return () => window.removeEventListener("scroll", suivre);
  }, []);

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
    /* La barre de saisie a pu changer de hauteur avec la conv (les questions qui partent ou reviennent) : ce défilement en tient compte */
    barre.current = composer.current?.offsetHeight ?? 0;
    /*
     * Des messages plus anciens posés devant : on garde la conv là où on la lisait. Un décalage, pas une place : entre
     * la mesure et ce rendu, l’élan du doigt a continué (Safari n’ancre pas le défilement), il n’est pas annulé
     */
    const d = devant.current;
    if (d) {
      /*
       * Le morceau attendu n’est pas encore là : un autre rendu passe avant le sien (une réponse de BLUSH pendant qu’on
       * remonte la conv). Rien ne défile ni ne glisse, la conv ne saute pas en bas ; la hauteur de référence devient
       * celle de ce rendu, pour que le décalage, au rendu du morceau, ne compte que lui.
       */
      if (d.marque !== undefined && !msgs.some((m) => m.id === d.marque)) {
        d.h = d.desk ? box.scrollHeight : document.documentElement.scrollHeight;
        before.current = null;
        flight.current = null;
        return;
      }
      devant.current = null;
      const delta = (d.desk ? box.scrollHeight : document.documentElement.scrollHeight) - d.h;
      if (d.desk) box.scrollTop += delta;
      else window.scrollBy(0, delta);
      defilant(d.desk ? box : null).style.removeProperty("overflow-anchor");
      d.pose?.();
      return;
    }
    const desk = window.matchMedia(DESKTOP).matches;
    const reduced = prefersReducedMotion();
    /* Sur mobile, jamais plus bas que le bas de la page : clavier ouvert, Safari décollerait le champ du clavier */
    const toBottom = (behavior: ScrollBehavior) => (desk ? box.scrollTo({ top: box.scrollHeight, behavior }) : window.scrollTo({ top: basDePage(), behavior }));
    const tops = before.current;
    const f = flight.current;
    before.current = null;
    flight.current = null;
    toBottom("auto");
    if (reduced) return;
    if (f) launch(box, f);
    if (tops) flipFrom(tops, dernieresLignes(box), (el) => el.dataset.row, spring("soft"));
  }, [msgs]);

  /*
   * La barre de saisie change de hauteur sans nouveau message (« Tu creuses », le vocal, les questions masquées) :
   * collée en bas avant, la conv y reste, sinon la dernière bulle passerait sous la barre.
   */
  useEffect(() => {
    const form = composer.current;
    const box = thread.current;
    if (!form || !box || typeof ResizeObserver === "undefined") return;
    barre.current = form.offsetHeight;
    const obs = new ResizeObserver(() => {
      const h = form.offsetHeight;
      const delta = h - barre.current;
      barre.current = h;
      if (!delta) return;
      const desk = window.matchMedia(DESKTOP).matches;
      /* Ce qui manque pour toucher le bas : la barre qui grandit l’a ajouté ; au-delà, on lisait plus haut */
      const reste = desk ? box.scrollHeight - box.scrollTop - box.clientHeight : document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      if (reste > Math.max(0, delta) + 2) return;
      if (desk) box.scrollTop = box.scrollHeight;
      else window.scrollTo({ top: basDePage() });
    });
    obs.observe(form);
    return () => obs.disconnect();
  }, []);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);
  /* Parti avant que des messages attendus soient posés : l’ancrage du défilement revient (voir mesurer) */
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("overflow-anchor");
      thread.current?.style.removeProperty("overflow-anchor");
    },
    [],
  );

  /* Les questions posées, gardées avec la conv pour un retour sur l’accueil */
  useEffect(() => {
    if (cle !== undefined) posees = { cle, asked };
  }, [cle, asked]);

  /* Les questions toutes prêtes ont fait leur entrée : un retour sur l’accueil ne la rejoue pas */
  useEffect(() => {
    pastillesPosees = true;
  }, []);

  /*
   * En remontant la conv, les échanges plus anciens arrivent d’eux-mêmes : à la première remontée, le morceau d’avant
   * est demandé ; quand le haut approche, il se pose. Seulement en remontant vraiment : le défilement diminue, hors du
   * bas de la conv. En bas, une position qui diminue est la page qui raccourcit (sur mobile, la conv posée en bas se
   * recale à l’ouverture) ou la fin d’un rebond : rien ne part à l’ouverture, même quand le haut est déjà à l’écran.
   * Toute remontée compte, au doigt, à la molette, au clavier, par la barre de défilement ou un lecteur d’écran. Un saut
   * d’un coup (la touche Début, la barre tirée en haut) arrive avant que l’observateur voie le haut : c’est lui qui pose.
   */
  useEffect(() => {
    const el = haut.current;
    const box = thread.current;
    if (!plus || !el || !box) return;
    const desk = window.matchMedia(DESKTOP).matches;
    const pos = () => (desk ? box.scrollTop : window.scrollY);
    const bas = () => (desk ? box.scrollHeight - box.clientHeight : basDePage());
    let proche = false;
    /* Le dernier défilement remontait la conv */
    let monte = false;
    let avant = pos();
    const obs = new IntersectionObserver(
      ([e]) => {
        proche = e.isIntersecting;
        if (proche && monte && el.isConnected) void chargerAnciens();
      },
      { root: desk ? box : null, rootMargin: "1200px 0px 0px 0px" },
    );
    obs.observe(el);
    const cible: HTMLElement | Window = desk ? box : window;
    const bouge = () => {
      /* L’accueil quitté (sa fiche remonte la page en haut) : ce n’est pas une remontée */
      if (!el.isConnected) return;
      const y = pos();
      monte = y < avant && y < bas() - 2;
      avant = y;
      if (!monte) return;
      precharger();
      if (proche) void chargerAnciens();
    };
    cible.addEventListener("scroll", bouge, { passive: true });
    return () => {
      obs.disconnect();
      cible.removeEventListener("scroll", bouge);
    };
  }, [plus, chargerAnciens, precharger]);

  useHeaderCollapse(head);
  useEnteteAuClavier(head, composer);

  /* 11 · La fête quand un niveau tombe : l’anneau se remplit (CSS), Sophie rebondit, des éclats partent */
  useEffect(() => {
    if (cheer && !prefersReducedMotion()) celebrate();
  }, [cheer]);

  /** 11 · Un cran de plus sur votre échelle : une seule fois par niveau. */
  const levelUp = (to: LevelId) => {
    const now = scaleOf(levelNow.current);
    const next = scaleOf(to);
    if (next.temperature !== now.temperature || next.index <= now.index) return;
    levelNow.current = to;
    setLevel(to);
    play("niveau", next.temperature);
    conv.marquerNiveau(to);
    setCheer((c) => c + 1);
  };

  /* « Réessayer » : la même demande repart, à la place de la réponse coupée */
  const relancer = (reponse: number) => {
    if (conv.relancer(reponse)) play("envoi");
  };

  const ask = (mine: Msg, payload: { text?: string; files?: File[]; about?: string }) => {
    play("envoi");
    return conv.envoyer(mine, {
      label: modeVocal ? "BLUSH enregistre un vocal" : "BLUSH analyse sa réponse",
      demande: async (suivi) => {
        const ready = payload.text ? answers[payload.text] : undefined;
        const result = ready
          ? await new Promise<BlushAnswer>((ok) => setTimeout(() => ok(ready), 1600))
          : liveUrl && payload.text && !payload.files
            ? await askLive(liveUrl, payload.text, historyOf(msgs))
            : await sendToBlush(payload, suivi);
        return { type: "reponse", from: "blush", result };
      },
      vocal: modeVocal,
    });
  };

  /* Une question toute prête part tout de suite, comme si tu l’avais écrite. 3 · La pastille elle-même devient ta bulle */
  const sendQuick = (q: string, chip?: HTMLElement) => {
    setAsked((a) => [...a, q]);
    const mine = nouvelId();
    if (chip && !prefersReducedMotion()) flight.current = { kind: "text", bubble: cleBulle(mine, 0), text: q, from: chip.getBoundingClientRect(), start: CHIP_LOOK };
    ask({ type: "texte", id: mine, from: "toi", text: q }, { text: q });
  };

  /* Ton message, depuis la barre de saisie : le champ montre encore ton texte, il s’envole de là */
  const sendText = (t: string) => {
    const mine = nouvelId();
    const field = input.current;
    /* 4 · L’envoi façon Messages : ton texte quitte le champ et devient une bulle bleue */
    if (field && !about && !prefersReducedMotion()) {
      const r = field.getBoundingClientRect();
      const w = textWidth(t, field);
      if (w <= r.width) flight.current = { kind: "text", bubble: cleBulle(mine, 0), text: t, from: { left: r.left - 16, top: r.top + r.height / 2 - 21, width: w + 32, height: 42 }, start: FIELD_LOOK };
    }
    const point = about ?? undefined;
    setAbout(null);
    ask({ type: "texte", id: mine, from: "toi", text: t, about: point }, { text: t, about: point });
  };

  const sendImages = (files: File[]) => {
    const list = files.map((f) => URL.createObjectURL(f));
    urls.current.push(...list);
    ask({ type: "images", id: nouvelId(), from: "toi", images: list }, { files });
  };

  const sendExport = ([file]: File[]) => ask({ type: "fichier", id: nouvelId(), from: "toi", file: { name: file.name, size: file.size } }, { files: [file] });

  /* Le vocal : le micro est demandé au premier toucher ; sans micro, BLUSH le dit dans la conv */
  const micRefused = (e: VoiceError) =>
    conv.direMot(
      e === "denied"
        ? "Je n’ai pas accès à ton micro. Autorise-le dans les réglages de ton navigateur, ou écris-moi."
        : "Les vocaux ne marchent pas sur ce navigateur. Écris-moi, je te réponds pareil.",
    );
  const quickLeft = quick.filter((q) => !asked.includes(q));

  /* Ton vocal, depuis la barre de saisie (ou rien d’entendu : BLUSH le dit) */
  const sendVoice = (clip: VoiceClip | "empty") => {
    if (clip === "empty") {
      conv.direMot("Je n’ai rien entendu. Vérifie ton micro et réessaie, ou écris-moi.");
      return;
    }
    play("vocalEnvoye");
    urls.current.push(clip.url);
    /* Tu lui parles en vocal : elle te répond en vocal */
    void conv.envoyer(
      { type: "vocal", id: nouvelId(), from: "toi", voice: { url: clip.url, seconds: clip.seconds, peaks: clip.peaks } },
      {
        label: "BLUSH enregistre un vocal",
        demande: async (suivi) => ({ type: "reponse", from: "blush", result: await sendVoiceToBlush({ audio: clip.blob, seconds: clip.seconds }, suivi) }),
        vocal: true,
      },
    );
  };

  /* 7 · Glisse pour creuser : la réponse glissée se cale au-dessus du champ, et le clavier s’ouvre */
  const dig = (quote: string) => {
    play("creuser");
    setAbout(quote);
    input.current?.focus({ preventScroll: true });
  };
  useThreadGestures(thread, dig);

  return (
    <ContactContext value={live}>
      <MotionContext value={moving}>
        <AppScreen
          besoin="chat"
          autre={contact.fiche.person.name}
          aside={null}
          mainWidth={WINDOW_W}
          frameWidth={WINDOW_W}
          contentGap={0}
          desktopTopPad={0}
          className={cn("home-page", figtree.variable, arriving && "home-arrive")}
          mobileTop={
            /* En haut : BLUSH en grand au centre (sa bulle flotte et s’anime quand il répond), Sophie à droite comme un contact.
               Le fond s’efface vers le bas : les messages passent dessous en douceur. 8 · Quand tu remontes dans l’historique, tout se range dans une barre fine. */
            <header ref={head} className="pointer-events-none sticky top-0 z-20 shrink-0 lg:hidden home-head">
              <span aria-hidden="true" data-c="bg" className="absolute inset-0 bg-[rgba(244,242,237,0.84)] backdrop-blur-xl [mask-image:linear-gradient(180deg,#000_calc(100%_-_22px),transparent)]" />
              <div className="relative grid grid-cols-[1fr_auto_1fr] items-start px-4 pb-5 pt-[max(6px,env(safe-area-inset-top))]">
                <div data-c="acc" className="pointer-events-auto mt-3 flex">
                  <span data-a="acc" className="flex">
                    {fromReport ? (
                      <IconButton
                        onClick={() => (pagePrecedente() === "/rapport" ? router.back() : router.push("/rapport"))}
                        icon="back"
                        label="Revenir au rapport"
                        iconSize={19}
                        className="!size-10 !shadow-soft"
                      />
                    ) : others.length > 0 ? (
                      <ConvsButton others={others} />
                    ) : (
                      <IconButton href="/compte" icon="user" label="Mon compte" iconSize={19} className="!size-10 !shadow-soft" />
                    )}
                  </span>
                </div>
                <BlushTitle big busy={busy} onClick={ouvrirDetails} />
                <div className="mt-2 flex justify-end">
                  {/* Rendu serveur compris (desktop encore inconnu) : un iPhone ne remonte pas l’avatar à l’hydratation */}
                  <SophieButton shared={desktop !== true} />
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
              <BlushTitle busy={busy} onClick={ouvrirDetails} />
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
              className="flex flex-1 flex-col px-[18px] pb-4 pt-8 lg:overflow-y-auto lg:bg-[#F7F5F1] lg:px-7 lg:pb-6 overflow-x-clip [touch-action:pan-y_pinch-zoom] lg:overflow-x-hidden"
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
              <PartagerContext value={setImage}>
                <RelanceContext value={relancer}>
                  <Thread msgs={msgs} opened={opened} depuis={depuis} />
                </RelanceContext>
              </PartagerContext>
            </div>

            {/* La barre de saisie : « + » pour des captures ou un export, ou un message à BLUSH */}
            <Composer
              formRef={composer}
              inputRef={input}
              quick={quickLeft}
              ideesMasquees={ideesMasquees}
              entree={entreeIdees}
              about={about}
              onAboutClear={() => setAbout(null)}
              modeVocal={modeVocal}
              onEcrit={() => void conv.repasserAEcrit()}
              busy={busy}
              onText={sendText}
              onQuick={sendQuick}
              onImages={sendImages}
              onExport={sendExport}
              onVoice={sendVoice}
              onMicError={micRefused}
              arriving={arriving}
            >
              {/* « Partager en image » : la réponse choisie, en story */}
              <PartageImageSheet cible={image ? { type: "reponse", echange: image } : null} onClose={() => setImage(null)} />
            </Composer>
            <ConvEnBas />
          </div>

          <ContactSheet contact={live} open={details} onClose={() => setDetails(false)} departRef={departRef} />
        </AppScreen>
      </MotionContext>
    </ContactContext>
  );
}

/**
 * Les dernières lignes de la conv : seules elles glissent quand un message arrive (la conv saute en bas d’abord). Sur
 * une longue conv, relever toutes les lignes avant et après chaque message coûterait pour rien.
 */
function dernieresLignes(box: HTMLElement) {
  return [...box.querySelectorAll<HTMLElement>("[data-row]")].slice(-40);
}

/**
 * La hauteur de la conv avant d’y poser des messages (la page sur mobile, la fenêtre sur desktop). `marque` : voir
 * Devant (accueil/conv/useChargerAnciens.ts). Jusqu’au rendu qui les pose, Chrome ne garde pas la place de lui-même (l’ancrage du défilement, que Safari
 * n’a pas) : le décalage appliqué ensuite compterait deux fois.
 */
function mesurer(box: HTMLElement | null, marque?: number) {
  const desk = !!box && window.matchMedia(DESKTOP).matches;
  defilant(desk ? box : null).style.overflowAnchor = "none";
  return { desk, h: desk && box ? box.scrollHeight : document.documentElement.scrollHeight, marque };
}

/** Ce qui défile : la fenêtre de la conv sur desktop, la page sur mobile. */
const defilant = (box: HTMLElement | null) => box ?? document.documentElement;

/*
 * La conv en bas dès la première image, comme l’effet de montage la pose ensuite : la page du serveur est peinte bien
 * avant l’hydratation (plusieurs secondes sur un téléphone lent), et montrait d’abord les plus vieux messages. Lu juste
 * après la barre de saisie, ce script la pose avant même la peinture. Dans la page du serveur seulement : rendu par le
 * navigateur (une navigation dans l’appli), un script ne s’exécute pas, et l’effet de montage fait ce travail.
 */
const POSER_EN_BAS = `(function(){try{if(matchMedia(${JSON.stringify(DESKTOP)}).matches){var f=document.querySelector("[data-thread]");f=f&&f.parentElement;if(f)f.scrollTop=f.scrollHeight}else{var d=document.documentElement;scrollTo(0,Math.max(0,d.scrollHeight-innerHeight))}}catch(e){}})()`;

function ConvEnBas() {
  /* Vrai au rendu serveur et à l’hydratation (le script est déjà passé), faux ensuite : le navigateur ne le crée jamais */
  const pageDuServeur = !useHydrated();
  return pageDuServeur ? <script dangerouslySetInnerHTML={{ __html: POSER_EN_BAS }} /> : null;
}

/**
 * Attend que la conv soit au repos (120 ms sans défilement) avant d’y poser un morceau d’historique : posé pendant
 * l’élan d’un geste, il couperait l’élan sur Safari. Tout près du haut (moins d’un écran), il se pose tout de suite.
 */
function auRepos(box: HTMLElement | null) {
  const desk = !!box && window.matchMedia(DESKTOP).matches;
  const pres = () => (desk && box ? box.scrollTop < box.clientHeight : window.scrollY < window.innerHeight);
  const cible: HTMLElement | Window = desk && box ? box : window;
  return new Promise<void>((pose) => {
    if (pres()) return pose();
    let t = window.setTimeout(poser, 120);
    function poser() {
      window.clearTimeout(t);
      cible.removeEventListener("scroll", bouge);
      pose();
    }
    function bouge() {
      window.clearTimeout(t);
      if (pres()) poser();
      else t = window.setTimeout(poser, 120);
    }
    cible.addEventListener("scroll", bouge, { passive: true });
  });
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
function useHeaderCollapse(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
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
  }, [ref]);
}

/**
 * Clavier ouvert, Safari ne réduit pas la page : il décale la vue visible vers le bas pour montrer le champ, et l’en-tête
 * (collé en haut de la page) sortait par le haut pendant toute la frappe. Tant que la barre de saisie a le focus,
 * l’en-tête suit le haut de la vue visible (un décalage posé à l’image suivante), puis reprend sa place quand le
 * clavier se ferme. L’accueil ne passe pas pour autant en défilement interne : les vols, le repli de l’en-tête, le
 * chargement de l’historique et le repli de la barre de Safari suivent tous la page.
 */
function useEnteteAuClavier(head: RefObject<HTMLElement | null>, form: RefObject<HTMLFormElement | null>) {
  useEffect(() => {
    const el = head.current;
    const barre = form.current;
    const vue = window.visualViewport;
    if (!el || !barre || !vue) return;
    let suivi = false;
    /* Le champ quitté : le délai au-delà duquel on cesse de suivre la vue, même si elle n’est pas revenue en haut */
    let fin = 0;
    /* Posé dans l’événement de la vue même, pas à l’image suivante : à l’ouverture du clavier, l’en-tête ne sort pas une image */
    const poser = () => {
      const y = Math.max(0, vue.offsetTop);
      el.style.transform = y > 0.5 ? `translateY(${y.toFixed(1)}px)` : "";
      /* Le clavier refermé : la vue est revenue en haut, l’en-tête aussi */
      if (fin && y <= 0.5) arreter();
    };
    const arreter = () => {
      window.clearTimeout(fin);
      fin = 0;
      if (!suivi) return;
      suivi = false;
      vue.removeEventListener("resize", poser);
      vue.removeEventListener("scroll", poser);
      el.style.transform = "";
    };
    const entrer = () => {
      window.clearTimeout(fin);
      fin = 0;
      if (!suivi) {
        suivi = true;
        vue.addEventListener("resize", poser);
        vue.addEventListener("scroll", poser);
      }
      poser();
    };
    /*
     * Le champ quitté, le clavier redescend encore un instant, et la vue avec lui : l’en-tête la suit jusqu’en haut (au
     * plus 0,6 s). Retiré tout de suite, il disparaissait le temps que la vue revienne, puis redescendait avec le clavier.
     */
    const sortir = () => {
      if (!suivi) return;
      window.clearTimeout(fin);
      fin = window.setTimeout(arreter, 600);
      poser();
    };
    /* De retour dans Safari (l’écran d’accueil, un autre onglet), le champ encore actif : la vue a changé entre-temps */
    const revenir = () => {
      if (suivi && document.visibilityState === "visible") poser();
    };
    barre.addEventListener("focusin", entrer);
    barre.addEventListener("focusout", sortir);
    document.addEventListener("visibilitychange", revenir);
    window.addEventListener("pageshow", revenir);
    return () => {
      barre.removeEventListener("focusin", entrer);
      barre.removeEventListener("focusout", sortir);
      document.removeEventListener("visibilitychange", revenir);
      window.removeEventListener("pageshow", revenir);
      arreter();
    };
  }, [head, form]);
}

const rubber = (d: number, max: number) => (d <= max ? d : max + (d - max) * 0.2);

/**
 * 6 · Glisse la conv vers la gauche : l’heure de chaque bulle apparaît, puis tout revient en place (comme dans Messages).
 * 7 · Glisse une réponse de BLUSH vers la droite : passé le cran, elle se cale au-dessus du champ.
 * Au doigt seulement : à la souris, on garde la sélection du texte. Un geste vertical reste un défilement normal.
 */
function useThreadGestures(ref: RefObject<HTMLElement | null>, onDig: (quote: string) => void) {
  const dig = useRef(onDig);
  useEffect(() => {
    dig.current = onDig;
  });
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
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
  }, [ref]);
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
        <span data-float="" className="block" style={{ "--r": "-3deg" }}>
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
          {/* L’adresse du site : toujours en haut de la conv, elle est sur chaque capture du chat */}
          askblush.com
          <Icon name="chevron" size={big ? 13 : 12} color="#8A8780" stroke={3} />
        </span>
      </span>
    </button>
  );
}

/**
 * Plusieurs convs : le retour à la liste, avec les autres personnes en petit (deux au plus, puis « +n »),
 * pour qu’on voie d’un coup d’œil qu’il y a d’autres convs. `flat` : dans la barre de la fenêtre (desktop), sans ombre.
 */
function ConvsButton({ others, flat = false }: { others: ConvSummary[]; flat?: boolean }) {
  const shown = others.slice(0, 2);
  const more = others.length - shown.length;
  return (
    <Link
      href="/app/convs"
      /* Préchargée en entier (son rendu ne lit que tes convs) : le glissé emporte la vraie liste, pas son écran d’attente */
      prefetch
      transitionTypes={["nav-back", "accueil-vers-convs"]}
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
      prefetch
      transitionTypes={["nav-forward", "accueil-vers-fiche"]}
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
        {shared ? (
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

/**
 * Une bulle de la conv : `at` son heure (6 · glisse pour l’heure), `fresh` une réponse qui vient d’arriver (5 · elle se
 * déplie, `d` secondes après le début de son arrivée), `neuf` un message de cette visite (il fait son entrée ;
 * l’historique et la conv gardée sont déjà lus). `tape` : la bulle de « BLUSH écrit » qui tape encore (tapeEncore).
 */
type Item = { key: string; node: BubbleNode; at: number | null; fresh: boolean; d: number; neuf: boolean; tape: boolean };

/** Un groupe de la conv (accueil/conv/modele.ts, rowsOf), habillé : les bulles de chacun de ses messages. */
type GroupeAffiche = Omit<Extract<Row, { kind: "group" }>, "msgs"> & { items: Item[] };

/** Ce que les bulles lisent autour d’elles : ton prochain pas, l’arrivée du jour (il s’écrit mot par mot). */
type BubbleEnv = { nextStep: string; arriving: boolean; autre?: Pronom };

/*
 * Les bulles de chaque message, gardées : un nouveau message ne refait pas celles de toute la conv, et un groupe dont
 * rien n’a changé n’est pas refait (Group). Un message n’est jamais modifié en place (la réponse remplace « BLUSH
 * écrit ») : il garde ses bulles tant que ce que bubblesOf lit autour de lui ne change pas (la clé).
 */
const bullesGardees = new WeakMap<Msg, { cle: string; nodes: BubbleNode[] }>();

function bullesDe(m: MsgABulles, env: BubbleEnv) {
  const cle = `${env.nextStep}|${env.autre ?? ""}|${m.type === "intro" && env.arriving}`;
  const gardees = bullesGardees.get(m);
  if (gardees?.cle === cle) return gardees.nodes;
  const nodes = bubblesOf(m, env);
  bullesGardees.set(m, { cle, nodes });
  return nodes;
}

/**
 * Un groupe de la conv, en bulles : celles de chaque message (gardées, voir bullesDe), chacune avec sa clé (cleDeBulle,
 * la règle de la clé du groupe) et son délai. « BLUSH écrit » a sa propre clé : à la réponse, le groupe repart de zéro
 * et ses bulles montent.
 */
function groupeAffiche({ msgs, ...groupe }: Extract<Row, { kind: "group" }>, env: BubbleEnv): GroupeAffiche {
  return {
    ...groupe,
    items: msgs.flatMap(({ m, at, neuf, fresh }) => {
      const nodes = bullesDe(m, env);
      const tape = tapeEncore(m);
      return nodes.map((node, k) => ({ key: cleDeBulle(m, k), node, at, fresh, d: depli(k, nodes.length, m.vagues), neuf, tape }));
    }),
  };
}

/*
 * Mémorisée : taper une lettre ne refait que la barre de saisie (accueil/Composer.tsx), parler que la barre
 * d’enregistrement (RecordingBar), et ce qui refait l’accueil (le point creusé, la feuille du contact, un niveau) ne
 * recalcule pas toute la conv. Et chaque groupe aussi : un nouveau message, un morceau d’historique ou la fin de
 * l’arrivée ne refont que ce qui change.
 */
const Thread = memo(function Thread({ msgs, opened, depuis }: { msgs: Msg[]; opened: number | null; depuis: number }) {
  const { report, fiche } = useContact();
  const { arriving } = useHomeMotion();
  const env: BubbleEnv = { nextStep: report.nextStep, arriving, autre: fiche.person.pronoun };
  const rows = rowsOf(msgs, opened, depuis);
  const now = maintenantDe(rows, opened);
  return (
    /* mt-auto pose les messages en bas sans justify-end, qui rend le haut d’une conv longue inaccessible au défilement */
    <div data-thread="" className="mt-auto flex flex-col gap-4">
      {rows.map((r) =>
        r.kind === "day" ? (
          <p key={r.key} data-row={r.key} data-a={arriving && r.key === CLE_JOUR_INTRO ? "day" : undefined} className="m-0 h-4 text-center text-[12px] font-bold leading-4 text-grey first:-mt-2">
            {r.at === null ? (
              NBSP
            ) : (
              <time dateTime={new Date(r.at).toISOString()}>
                <span className="font-black">{dayLabel(r.at, now)}</span> {clock(r.at)}
              </time>
            )}
          </p>
        ) : r.kind === "event" ? (
          <LevelEvent key={r.key} row={r.key} level={r.level} neuf={r.neuf} />
        ) : (
          <Group key={r.key} row={groupeAffiche(r, env)} intro={arriving && r.key === CLE_INTRO} />
        ),
      )}
      <LogoDuFilDefini />
    </div>
  );
});

/** 11 · Un niveau franchi pendant la visite : un repère au milieu de la conv (texte relu le 8 octobre). */
function LevelEvent({ row, level, neuf }: { row: string; level: LevelId; neuf: boolean }) {
  const { levels, index, temperature } = scaleOf(level);
  return (
    <p data-row={row} className="m-0 flex justify-center">
      <span data-popin={neuf ? "" : undefined} className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-[#E3F6EE] px-3 text-[13px] font-extrabold text-vrai-ink">
        <Icon name="sparkle" size={14} color="#087A56" stroke={2.6} />
        {temperature ? "Nouvelle température" : "Nouveau niveau"} · <b className="font-black">{levels[index].label}</b>
      </span>
    </p>
  );
}

/*
 * L’avatar de BLUSH sous chaque réponse : dessiné une fois (ses dégradés, ses flous), puis repris par <use>. Une conv
 * longue portait autant de copies du logo que de réponses, chacune avec ses filtres, dans le HTML comme à la peinture.
 */
const LOGO_DU_FIL = "blush-logo-fil";

function LogoDuFil() {
  return (
    <svg aria-hidden="true" width={34} height={34} viewBox="0 0 34 34" style={{ overflow: "visible", flexShrink: 0 }}>
      <use href={`#${LOGO_DU_FIL}`} />
    </svg>
  );
}

/* Le dessin, une fois, en dernier dans la conv (hors du flux : rien ne bouge, et la première ligne reste la première) */
function LogoDuFilDefini() {
  return (
    <svg aria-hidden="true" width={0} height={0} className="pointer-events-none absolute">
      <defs>
        <g id={LOGO_DU_FIL}>
          <BubbleLogo size={34} />
        </g>
      </defs>
    </svg>
  );
}

/** « Partager en image » une réponse de BLUSH (son échange). */
const PartagerContext = createContext<(echange: number) => void>(() => {});

type GroupProps = { row: GroupeAffiche; intro: boolean };

/**
 * Les bulles d’un même expéditeur : l’avatar de BLUSH sous la dernière, l’heure dessous (ou « BLUSH écrit » à la place).
 * `intro` : 1 · l’arrivée, BLUSH écrit un instant, puis l’intro se pose. L’arrivée arrive en props, pas par le contexte :
 * sa fin ne refait que le groupe de l’intro. Un groupe sans bulle (une réponse vide) ne montre rien, ni heure ni
 * « Partager ».
 */
const Group = memo(function Group({ row, intro }: GroupProps) {
  const partager = use(PartagerContext);
  if (!row.items.length) return null;
  const typing = row.items.find((it) => it.tape);
  const bubbles = row.items.filter((it) => it !== typing);
  const n = bubbles.length;
  return (
    <div data-row={row.key} data-group="" className="relative flex flex-col gap-[3px]">
      {bubbles.map((it, i) => {
        const pos: Pos = n === 1 ? "single" : i === 0 ? "first" : i === n - 1 ? "last" : "middle";
        /* 5 · Une réponse qui vient d’arriver se déplie depuis l’avatar (son délai reste le même quand la suite arrive : rien ne rejoue) */
        const unfold = it.fresh ? it.d : null;
        /* 6 · L’heure de chaque bulle attend hors champ, à droite */
        const time =
          it.at !== null ? (
            <span aria-hidden="true" className="swipe-time">
              {clock(it.at)}
            </span>
          ) : null;
        return row.from === "blush" ? (
          <div
            key={it.key}
            data-rise={unfold === null && it.neuf ? "" : undefined}
            data-a={intro ? "intro" : undefined}
            className="relative flex items-end gap-2"
            style={{ ...delai(i * 0.06), "--i": i }}
          >
            {i === n - 1 ? (
              /* Juste après « BLUSH écrit », sa petite bulle vole jusqu’ici avec la réponse */
              <span data-avatar="" data-a={intro ? "intro-av" : undefined} className="-mb-0.5 block shrink-0">
                <LogoDuFil />
              </span>
            ) : (
              <span aria-hidden="true" className="w-[34px] shrink-0" />
            )}
            {/* 7 · La flèche pour creuser, cachée derrière la bulle */}
            {it.node.quote && (
              <span aria-hidden="true" data-dig-icon="">
                <Icon name="reply" size={16} color="currentColor" stroke={2.6} />
              </span>
            )}
            <BubbleShape side="blush" pos={pos} node={it.node} id={it.key} unfold={unfold} />
            {time}
          </div>
        ) : (
          <div key={it.key} data-rise={it.neuf ? "" : undefined} className="relative flex justify-end">
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
        <span data-a={intro ? "intro-tm" : undefined} className={cn("mt-0.5 flex h-3.5 items-center gap-2 text-[11px] font-bold leading-[14px] text-grey", row.from === "blush" ? "pl-[46px]" : "justify-end pr-1.5")}>
          {row.at === null ? NBSP : <time dateTime={new Date(row.at).toISOString()}>{clock(row.at)}</time>}
          {/* La réponse se partage en image (story), le prénom de l’autre masqué */}
          {row.from === "blush" && row.echange && (
            <button
              type="button"
              onClick={() => partager(row.echange!)}
              className="relative inline-flex items-center gap-1 font-black text-grey transition-colors hover:text-ink after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']"
            >
              <Icon name="share" size={11} color="currentColor" stroke={2.8} />
              Partager
            </button>
          )}
        </span>
      )}
    </div>
  );
}, groupesEgaux);

/** Le même groupe : tout ce que Group lit (les bulles comparées une à une, leur contenu par identité). */
function groupesEgaux(a: GroupProps, b: GroupProps) {
  if (a.intro !== b.intro) return false;
  const x = a.row;
  const y = b.row;
  if (x === y) return true;
  if (x.key !== y.key || x.at !== y.at || x.echange !== y.echange || x.from !== y.from || x.items.length !== y.items.length) return false;
  return x.items.every((it, i) => {
    const o = y.items[i];
    return it.key === o.key && it.node === o.node && it.at === o.at && it.fresh === o.fresh && it.d === o.d && it.neuf === o.neuf && it.tape === o.tape;
  });
}

/** Une bulle : sa forme vient de sa place dans le groupe, son style de son contenu. `quote` : 7 · ce qu’on creuse en la glissant. */
type BubbleNode = { body: ReactNode; tone?: "plain" | "accent" | "toi" | "bare"; className?: string; quote?: string };

function BubbleShape({ side, pos, node, id, unfold = null }: { side: "blush" | "toi"; pos: Pos; node: BubbleNode; id: string; unfold?: number | null }) {
  const tone = node.tone ?? (side === "toi" ? "toi" : "plain");
  const quote = side === "blush" ? node.quote : undefined;
  const corners =
    side === "blush"
      ? { single: "", first: "rounded-bl-[6px]", middle: "rounded-l-[6px]", last: "rounded-tl-[6px]" }[pos]
      : { single: "", first: "rounded-br-[6px]", middle: "rounded-r-[6px]", last: "rounded-tr-[6px]" }[pos];
  return (
    <div
      data-bubble={id}
      data-quote={quote}
      data-unfold={unfold !== null ? "" : undefined}
      style={unfold !== null ? delai(unfold) : undefined}
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

/** 1 · Ton prochain pas, mot par mot pendant l’arrivée (les espaces insécables gardent « pas : » ensemble). */
function Words({ text }: { text: string }) {
  return text.split(" ").map((w, i) => (
    <span key={i}>
      {i > 0 && " "}
      <span data-a="w" style={{ "--i": i }}>
        {w}
      </span>
    </span>
  ));
}

/** Une bulle écrite de BLUSH, puis les messages qu’elle cite, comme dans un vrai fil. */
function bulleEcrite(b: BulleChat): BubbleNode[] {
  return [
    { quote: b.text, body: <span className="text-[16px] font-bold leading-[1.4]">{b.text}</span> },
    ...(b.messages ?? []).map((msg) => ({
      className: "pb-2.5 pt-3",
      quote: msg.text,
      body: <ClampedBubble from={msg.from} caption={msg.caption} text={msg.text} limit={25} />,
    })),
  ];
}

/** Le vocal de la réponse se fait encore : sa bulle attend, à la taille du lecteur qui la remplacera. */
function VocalEnCours() {
  return (
    <span role="status" className="flex h-[42px] min-w-[220px] items-center gap-2 pl-1.5">
      <span className="sr-only">BLUSH</span>
      <span data-vocal-rec="" className="size-[9px] rounded-full bg-[#E5484D]" />
      <span className="text-[14px] font-black text-ink">enregistre un vocal…</span>
    </span>
  );
}

/** « Réessayer » une réponse coupée par le réseau (voir echanger, accueil/conv/useConversation.ts). */
const RelanceContext = createContext<(reponse: number) => void>(() => {});

/**
 * Le réseau a coupé la réponse : ce qui est arrivé reste, BLUSH le dit comme toute erreur du chat (« j’ai eu un bug,
 * renvoie-moi ça », src/services/api.ts), et la demande repart d’un toucher.
 */
function Coupure({ reponse }: { reponse: number }) {
  const relancer = use(RelanceContext);
  return (
    <span className="flex flex-col items-start gap-2.5">
      <span className="text-[16px] font-bold leading-[1.4]">j’ai eu un bug, renvoie-moi ça</span>
      <button type="button" onClick={() => relancer(reponse)} className="lift lift-sm inline-flex h-9 items-center rounded-full bg-white px-3.5 text-[13px] font-black text-ink shadow-soft">
        Réessayer
      </button>
    </span>
  );
}

/** Les bulles d’un message, d’après son `type`. */
function bubblesOf(m: MsgABulles, env: BubbleEnv): BubbleNode[] {
  switch (m.type) {
    case "intro":
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
                  <span className="text-[16px] font-black leading-[1.3]">{IlOuElle(env.autre)} vient de répondre{NBSP}?</span>
                  <span className="text-[14px] font-extrabold leading-[1.45] text-soft">Ajoute sa réponse{NBSP}: capture, export ou texte. BLUSH reconnaît tout seul.</span>
                </span>
              ),
            },
          ];
    case "ecrit":
      /* Sa bulle qui tape, seule : Group la pose à la place de l’heure (Item.tape) */
      if (tapeEncore(m)) return [{ body: <BlushTyping label={m.reading} vocal={m.vocal} /> }];
      /* Ses bulles déjà arrivées pendant qu’il écrit, et « Réessayer » si le réseau a coupé avant la fin */
      return [...(m.recues ?? []).flatMap(bulleEcrite), ...(m.coupee ? [{ body: <Coupure reponse={m.id} /> }] : [])];
    case "mot":
      return [{ body: <span className="text-[15px] font-extrabold leading-[1.45]">{m.notice}</span> }];
    case "vocal":
      return [{ className: "py-2 pl-2 pr-3.5", body: <VoiceNote clip={m.voice} /> }];
    case "texte":
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
    case "images":
      return [
        {
          tone: "bare",
          body: (
            <span className={cn("grid gap-0.5", m.images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
              {m.images.slice(0, 4).map((u, i) => (
                <span key={u} className="relative block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local d’un fichier choisi */}
                  <img src={u} alt={`Capture ${i + 1}`} decoding="async" className={cn("block object-cover object-top", m.images.length > 1 ? "h-[150px] w-[112px]" : "h-[230px] w-[172px]")} />
                  {i === 3 && m.images.length > 4 && (
                    <span className="absolute inset-0 flex items-center justify-center bg-[rgba(17,17,20,0.55)] text-[20px] font-black text-white">+{m.images.length - 4}</span>
                  )}
                </span>
              ))}
            </span>
          ),
        },
      ];
    case "fichier":
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
    case "reponse":
      /* 5 · La meilleure réponse d’une réponse qui vient d’arriver brille une fois */
      return bullesDeLaReponse(m.result, !!m.answered);
    default:
      return typeInconnu(m);
  }
}

/** Les bulles d’une réponse de BLUSH. `shine` : elle vient d’arriver, sa meilleure réponse brille une fois. */
function bullesDeLaReponse(r: BlushAnswer, shine: boolean): BubbleNode[] {
  /*
   * Une réponse dite en vocal : la bulle vocale à la place des bulles écrites ; les messages qu’elle cite et la réponse à
   * envoyer restent. Le vocal se fait encore : sa bulle attend, la réponse est déjà là
   */
  if (r.vocal || r.vocalEnCours)
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
      { className: "py-2.5 pl-2.5 pr-3.5", quote: r.bubbles.map((b) => b.text).join(" "), body: r.vocal ? <VocalBlush vocal={r.vocal} /> : <VocalEnCours /> },
      ...r.bubbles.flatMap((b) =>
        (b.messages ?? []).map((msg) => ({ className: "pb-2.5 pt-3", quote: msg.text, body: <ClampedBubble from={msg.from} caption={msg.caption} text={msg.text} limit={25} /> })),
      ),
      ...(r.send ? [{ quote: r.send.join("\n"), body: <SendReply lines={r.send} why={r.why} shine={shine} /> }] : []),
    ];
  /* La réponse en bulles : chaque bulle, puis les messages qu’elle cite, comme dans un vrai fil */
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
    ...r.bubbles.flatMap(bulleEcrite),
    ...(r.send ? [{ quote: r.send.join("\n"), body: <SendReply lines={r.send} why={r.why} shine={shine} /> }] : []),
    ...(r.ask ? [{ quote: r.ask, body: <span className="text-[16px] font-bold leading-[1.4]">{r.ask}</span> }] : []),
    ...(r.react ? [{ quote: r.react, body: <span className="text-[16px] font-bold leading-[1.4]">{r.react}</span> }] : []),
  ];
}

/** L’aperçu en local : ta question part au vrai chat, avec le fil déjà échangé (tes messages, et ce que BLUSH a répondu). */
async function askLive(url: string, text: string, history: { from: "toi" | "blush"; text: string }[]): Promise<BlushAnswer> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, history }) });
  return (await r.json()) as BlushAnswer;
}

function historyOf(msgs: Msg[]): { from: "toi" | "blush"; text: string }[] {
  return msgs
    .flatMap((m): { from: "toi" | "blush"; text: string }[] => {
      if (m.type === "texte") return [{ from: "toi", text: m.text }];
      if (m.type === "reponse") return [{ from: "blush", text: [...m.result.bubbles.map((b) => b.text), ...(m.result.send ?? []), m.result.ask ?? ""].filter(Boolean).join(" / ") }];
      return [];
    })
    .slice(-6);
}
