"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { figtree } from "@/lib/fonts";
import { prefersReducedMotion } from "@/lib/motion";
import { play } from "@/lib/sound";
import { marquerChatOuvert } from "@/components/chat/ouvert";
import { AppScreen } from "@/components/shell/AppScreen";
import type { ConvSummary } from "@/types";
import { BarreDeLaFenetre, EnTeteMobile } from "./accueil/Barres";
import { ContactContext, FilDeLaConv } from "./accueil/bulles";
import { Composer } from "./accueil/Composer";
import { ContactSheet } from "./accueil/ContactSheet";
import type { HomeContact } from "./accueil/contact";
import { cleBulle, type EchangeScript } from "./accueil/conv/modele";
import { useConversation } from "./accueil/conv/useConversation";
import { useEnvois, useIdees, type Envoyer } from "./accueil/envois";
import { useNiveauQuiMonte } from "./accueil/niveau";
import { useArrivee } from "./accueil/mouvement/arrivee";
import { MotionContext } from "./accueil/mouvement/contexte";
import { ConvEnBas } from "./accueil/mouvement/ConvEnBas";
import { useAnciensEnRemontant, useConvSuitLeBas, useDefilement } from "./accueil/mouvement/defilement";
import { useEnteteAuClavier, useHeaderCollapse } from "./accueil/mouvement/entete";
import { useThreadGestures } from "./accueil/mouvement/gestes";
import { departs, useRegistreEntete, type Departs } from "./accueil/mouvement/registre";

/* « Partager en image » ne s’ouvre qu’au toucher : sa feuille (src/components/partage) arrive à part, après l’affichage */
const PartageImageSheet = dynamic(() => import("@/components/partage/PartageImageSheet").then((m) => m.PartageImageSheet), { ssr: false });

/** Largeur de la fenêtre de conv sur desktop ; l’en-tête (logo, « Mon compte ») s’aligne dessus. */
const WINDOW_W = 720;

/* L’heure d’ouverture de l’écran, lue dans le navigateur seulement : rien au rendu serveur, donc pas d’écart à l’hydratation */
let openedAt: number | null = null;
const readOpenedAt = () => (openedAt ??= Date.now());
const noSubscription = () => () => {};

/*
 * Écran 13 — Accueil. Au quotidien, tout passe par le chat avec BLUSH : écrire, ajouter des captures, importer un nouvel
 * export. Le rapport et sa fiche restent à un toucher, dans les détails du contact (comme la fiche d’un contact dans
 * Messages). Mobile : plein écran. Desktop : une fenêtre de conv.
 *
 * En mouvement, onze idées : 1 l’arrivée du jour, 2 BLUSH t’écoute, 3 la question qui s’envole, 4 l’envoi façon
 * Messages, 5 les perles deviennent la réponse, 6 glisse pour l’heure, 7 glisse pour creuser, 8 l’en-tête qui se replie,
 * 9 la bulle s’ouvre, 10 Sophie en glissé (page.tsx et la fiche), 11 le niveau qui monte.
 * HomeScreen assemble : la conv (./accueil/conv), ses bulles (./accueil/bulles.tsx), la barre de saisie et ce qui en
 * part (./accueil/Composer.tsx, ./accueil/envois.ts), les barres du haut (./accueil/Barres.tsx), la feuille du contact
 * et le mouvement (./accueil/mouvement).
 */
export function HomeScreen(p: {
  quick?: string[];
  /** Des échanges déjà joués, posés dans la conv dès l’ouverture (l’historique ; l’aperçu, ses vraies réponses). */
  script?: EchangeScript[];
  /** Qui répond à un envoi écrit, à la place du vrai chat (l’aperçu de l’équipe, src/app/apercu/accueil). */
  envoyer?: Envoyer;
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
  const { contact, storyId: cle, others = [] } = p;
  /* L’accueil entier (il recule derrière la feuille du contact, ses entrées se posent au premier geste), le fil et son haut */
  const page = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const haut = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLFormElement>(null);
  /* Ce qui part de l’en-tête ou s’y anime, vu d’ailleurs (accueil/mouvement/registre.ts) ; 2 · le logo qu’on voit, pour la barre de saisie */
  const entete = useRegistreEntete();
  const logoVu = useCallback(() => entete.visible("logo"), [entete]);
  /* « Partager en image » : la réponse choisie. 9 · La feuille du contact, et d’où partent la bulle et l’avatar vers elle (relevé au toucher) */
  const [image, setImage] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const departRef = useRef<Departs | null>(null);
  const ouvrirDetails = () => {
    departRef.current = departs(entete);
    setDetails(true);
  };
  /* 11 · Où vous en êtes : un message peut vous faire passer un cap pendant la visite (accueil/niveau.ts) */
  const { level, monter } = useNiveauQuiMonte(contact.report.level, entete);
  /* La conv à l’écran : où elle se pose, ce qu’elle garde entre deux changements, le vol d’une bulle (accueil/mouvement/defilement.ts) */
  const defilement = useDefilement(thread);
  const { flightRef } = defilement;
  const idees = useIdees(cle, p.quick ?? []);

  /* La conv elle-même (accueil/conv/useConversation.ts). L’accueil l’habille : ce que fait l’écran pendant qu’elle change, c’est sa scène */
  const conv = useConversation({
    cle,
    introAt: p.introAt,
    script: p.script ?? [],
    plusAnciens: p.plusAnciens ?? false,
    modeVocalInitial: p.modeVocalInitial,
    rendu: p.rendu,
    scene: {
      ...defilement.ecran,
      avantChangement: defilement.avantChangement,
      /* Les questions toutes prêtes s’effacent le temps de la réponse : à leur retour, elles refont leur entrée */
      echangeCommence: idees.refaireEntree,
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
      niveau: (to) => {
        if (monter(to)) conv.marquerNiveau(to);
      },
    },
  });
  const { dig, ...envois } = useEnvois({ conv, idees, envoyer: p.envoyer, flightRef, input });
  const opened = useSyncExternalStore(noSubscription, readOpenedAt, () => null);
  /* 1 · L’arrivée, une fois par jour (le serveur le sait par un cookie), et une seule fois depuis l’ouverture de l’appli */
  const arriving = useArrivee(p.arrive ?? false, page);
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

  /* La conv suit chaque message et la barre de saisie ; les échanges plus anciens arrivent en remontant (accueil/mouvement/defilement.ts) */
  useConvSuitLeBas(conv.msgs, thread, composer, defilement);
  useAnciensEnRemontant({ plus: conv.plus, hautRef: haut, threadRef: thread, chargerAnciens: conv.chargerAnciens, precharger: conv.precharger });
  useHeaderCollapse(head);
  useEnteteAuClavier(head, composer);
  useThreadGestures(thread, dig);

  /* « Réessayer » : la même demande repart, à la place de la réponse coupée */
  const relancer = (reponse: number) => {
    if (conv.relancer(reponse)) play("envoi");
  };

  const barre = { contact: live, others, busy: conv.occupe, ouvrirDetails, entete };
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
          mobileTop={<EnTeteMobile headRef={head} fromReport={p.fromReport ?? false} {...barre} />}
        >
          <h1 className="sr-only">Ta conv avec BLUSH</h1>
          <div className="-mx-[22px] -mt-1 flex flex-1 flex-col lg:mx-0 lg:mt-0 lg:h-[clamp(540px,calc(100dvh_-_132px),700px)] lg:flex-none lg:overflow-hidden lg:rounded-[32px] lg:bg-white lg:shadow-[0_0_0_1px_rgba(17,17,20,0.05),0_2px_6px_rgba(17,17,20,0.03),0_48px_90px_-48px_rgba(17,17,20,0.32)]">
            <BarreDeLaFenetre {...barre} />
            <FilDeLaConv
              threadRef={thread}
              hautRef={haut}
              msgs={conv.msgs}
              opened={opened}
              depuis={conv.depuis}
              plus={conv.plus}
              anciens={conv.anciens}
              chargerAnciens={conv.chargerAnciens}
              partager={setImage}
              relancer={relancer}
            />
            {/* La barre de saisie : « + » pour des captures ou un export, ou un message à BLUSH */}
            <Composer
              {...envois}
              formRef={composer}
              inputRef={input}
              quick={idees.quick}
              entree={idees.entree}
              ideesMasquees={p.ideesMasquees ?? false}
              modeVocal={conv.modeVocal}
              onEcrit={() => void conv.repasserAEcrit()}
              busy={conv.occupe}
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
