"use client";

import { IlOuElle } from "@/lib/pronom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, memo, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NBSP } from "@/lib/format";
import { pagePrecedente } from "@/lib/navigation";
import { delai, DESKTOP, prefersReducedMotion, textWidth } from "@/lib/motion";
import { play } from "@/lib/sound";
import { sendToBlush, sendVoiceToBlush } from "@/services/api";
import { BubbleLogo } from "@/components/brand/objects3d";
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
import { ContactSheet } from "./accueil/ContactSheet";
import type { HomeContact } from "./accueil/contact";
import { AvecLogoDuFil, BlushTitle, ConvsButton, LogoDuFil, SophieButton } from "./accueil/Entetes";
import { useArrivee } from "./accueil/mouvement/arrivee";
import { MotionContext, useHomeMotion } from "./accueil/mouvement/contexte";
import { ConvEnBas } from "./accueil/mouvement/ConvEnBas";
import { useAnciensEnRemontant, useConvSuitLeBas, useDefilement } from "./accueil/mouvement/defilement";
import { useEnteteAuClavier, useHeaderCollapse } from "./accueil/mouvement/entete";
import { celebrate } from "./accueil/mouvement/fete";
import { useThreadGestures } from "./accueil/mouvement/gestes";
import { departs, useRegistreEntete, type Departs } from "./accueil/mouvement/registre";
import { CHIP_LOOK, FIELD_LOOK } from "./accueil/mouvement/vol";

/* « Partager en image » ne s’ouvre qu’au toucher : sa feuille (src/app/rapport/Partage.tsx) arrive à part, après l’affichage */
const PartageImageSheet = dynamic(() => import("../rapport/Partage").then((m) => m.PartageImageSheet), { ssr: false });

const ContactContext = createContext<HomeContact | null>(null);

function useContact() {
  const contact = use(ContactContext);
  if (!contact) throw new Error("useContact : hors de HomeScreen");
  return contact;
}

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
 * Le mouvement lui-même (vols, fête, recul, défilement, gestes, arrivée) vit dans ./accueil/mouvement, les en-têtes dans
 * ./accueil/Entetes.tsx.
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
  const haut = useRef<HTMLDivElement>(null);
  /* L’accueil entier (il recule derrière la feuille du contact, ses entrées se posent au premier geste) */
  const page = useRef<HTMLDivElement>(null);
  /* Ce qui part de l’en-tête ou s’y anime, vu d’ailleurs (accueil/mouvement/registre.ts) */
  const entete = useRegistreEntete();
  /* 2 · Le logo de BLUSH qu’on voit, pour la barre de saisie (ses perles t’écoutent) : stable, comme le registre */
  const logoVu = useCallback(() => entete.visible("logo"), [entete]);
  /* Les questions toutes prêtes font leur entrée au premier affichage de l’accueil, puis à leur retour après une réponse */
  const [entreeIdees, setEntreeIdees] = useState(() => !pastillesPosees);
  /* « Partager en image » : la réponse choisie */
  const [image, setImage] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  /* 9 · D’où partent la bulle et l’avatar vers la feuille du contact : relevé au toucher, quand la page est encore à jour */
  const departRef = useRef<Departs | null>(null);
  const ouvrirDetails = () => {
    departRef.current = departs(entete);
    setDetails(true);
  };
  /* 7 · Le point creusé : ta prochaine question porte dessus */
  const [about, setAbout] = useState<string | null>(null);
  /* 11 · Où vous en êtes : un message peut vous faire passer un cap pendant la visite */
  const [level, setLevel] = useState(contact.report.level);
  const levelNow = useRef(contact.report.level);
  const [cheer, setCheer] = useState(0);
  const thread = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  const urls = useRef<string[]>([]);
  /* La conv à l’écran : où elle se pose, ce qu’elle garde entre deux changements (accueil/mouvement/defilement.ts) */
  const defilement = useDefilement(thread);
  const { flightRef } = defilement;
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
      ...defilement.ecran,
      avantChangement: defilement.avantChangement,
      /* Les questions toutes prêtes s’effacent le temps de la réponse : à leur retour, elles refont leur entrée */
      echangeCommence: () => setEntreeIdees(true),
      ecritCede: (reponse) => {
        if (prefersReducedMotion()) return;
        /* 5 · La bulle qui écrit se pose en avatar, et la réponse se déplie depuis elle, sans temps mort */
        const typing = thread.current?.querySelector(`[data-reading="${cleBulle(reponse, "ecrit")}"] svg`);
        if (typing) flightRef.current = { kind: "logo", bubble: cleBulle(reponse, 0), from: typing.getBoundingClientRect() };
      },
      /* Un pop quand la réponse remplace les perles. Rien si tu écris déjà la suite */
      reponsePosee: () => {
        if (!input.current?.value) play("reponse");
      },
      niveau: (to) => levelUp(to),
    },
  });
  const { msgs, depuis, plus, anciens, chargerAnciens, precharger, modeVocal } = conv;
  /* BLUSH « écrit » (ses bulles arrivent encore) : sa bulle s’anime en haut de la conv. Une réponse coupée attend « Réessayer » */
  const busy = conv.occupe;
  const opened = useOpenedAt();
  const desktop = useDesktop();
  /* 1 · L’arrivée, une fois par jour (le serveur le sait par un cookie), et une seule fois depuis l’ouverture de l’appli */
  const arriving = useArrivee(arrive, page);
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

  /* Chaque nouveau message, la barre de saisie qui change de hauteur : la conv suit (accueil/mouvement/defilement.ts) */
  useConvSuitLeBas(msgs, thread, composer, defilement);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  /* Les questions posées, gardées avec la conv pour un retour sur l’accueil */
  useEffect(() => {
    if (cle !== undefined) posees = { cle, asked };
  }, [cle, asked]);

  /* Les questions toutes prêtes ont fait leur entrée : un retour sur l’accueil ne la rejoue pas */
  useEffect(() => {
    pastillesPosees = true;
  }, []);

  /* En remontant la conv, les échanges plus anciens arrivent d’eux-mêmes (accueil/mouvement/defilement.ts) */
  useAnciensEnRemontant({ plus, hautRef: haut, threadRef: thread, chargerAnciens, precharger });

  useHeaderCollapse(head);
  useEnteteAuClavier(head, composer);

  /* 11 · La fête quand un niveau tombe : l’anneau se remplit (CSS), Sophie rebondit, des éclats partent */
  useEffect(() => {
    if (cheer && !prefersReducedMotion()) celebrate(entete);
  }, [cheer, entete]);

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
    if (chip && !prefersReducedMotion()) flightRef.current = { kind: "text", bubble: cleBulle(mine, 0), text: q, from: chip.getBoundingClientRect(), start: CHIP_LOOK };
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
      if (w <= r.width) flightRef.current = { kind: "text", bubble: cleBulle(mine, 0), text: t, from: { left: r.left - 16, top: r.top + r.height / 2 - 21, width: w + 32, height: 42 }, start: FIELD_LOOK };
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
          ref={page}
          className={cn(figtree.variable, arriving && "home-arrive")}
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
                <BlushTitle big busy={busy} onClick={ouvrirDetails} logoRef={entete.inscrire.logo} />
                <div className="mt-2 flex justify-end">
                  {/* Rendu serveur compris (desktop encore inconnu) : un iPhone ne remonte pas l’avatar à l’hydratation */}
                  <SophieButton contact={live} anneauRef={entete.inscrire.anneau} avatarRef={entete.inscrire.avatar} shared={desktop !== true} />
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
              <BlushTitle busy={busy} onClick={ouvrirDetails} logoRef={entete.inscrire.logo} />
              <div className="flex justify-end">
                <SophieButton contact={live} anneauRef={entete.inscrire.anneau} avatarRef={entete.inscrire.avatar} shared={desktop === true} />
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
              logo={logoVu}
            >
              {/* « Partager en image » : la réponse choisie, en story */}
              <PartageImageSheet cible={image ? { type: "reponse", echange: image } : null} onClose={() => setImage(null)} />
            </Composer>
            <ConvEnBas />
          </div>

          <ContactSheet contact={live} open={details} onClose={() => setDetails(false)} departRef={departRef} entete={entete} pageRef={page} />
        </AppScreen>
      </MotionContext>
    </ContactContext>
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
      {/* L’avatar de BLUSH sous chaque réponse, dessiné une fois, en dernier dans la conv (accueil/Entetes.tsx) */}
      <AvecLogoDuFil>
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
      </AvecLogoDuFil>
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
