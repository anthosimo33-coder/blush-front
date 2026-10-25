"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { figtree } from "@/lib/fonts";
import { prefersReducedMotion } from "@/lib/motion";
import { play } from "@/lib/sound";
import { FRAIS_DU_RENDU, setQueryData } from "@/lib/query";
import { useCompte } from "@/lib/requetes";
import { useChargeAuRepos } from "@/lib/repos";
import { drapeauLocal, useDrapeau } from "@/lib/stockage";
import { CompteurBulles, soldeAffiche } from "@/components/bulles/CompteurBulles";
import { FeuilleBulle } from "@/components/bulles/FeuilleBulle";
import { marquerChatOuvert } from "@/components/chat/ouvert";
import { AppScreen } from "@/components/shell/AppScreen";
import { useCompteDeLaPage } from "@/components/shell/compte-de-la-page";
import { Toast } from "@/components/ui/surfaces";
import { apresLaRecharge } from "@/contenu/bulles-du-chat";
import type { BlushAnswer, ConvSummary } from "@/types";
import { BarreDeLaFenetre, EnTeteMobile } from "./accueil/Barres";
import { useAnnonce } from "./accueil/annonce";
import { BandeauBulles, etatDuBandeau } from "./accueil/BandeauBulles";
import { AchatDuChatContext, useAchatDuChat, type AchatDuChat } from "./accueil/achat";
import { ContactContext, CreditContext, FilDeLaConv } from "./accueil/bulles";
import { Composer } from "./accueil/Composer";
import { ContactSheet } from "./accueil/ContactSheet";
import type { HomeContact } from "./accueil/contact";
import { annonceAnciens, annonceDe, cleBulle, type EchangeScript } from "./accueil/conv/modele";
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
/* La recharge (et le paiement de Whop qu’elle porte) n’arrive pas avec la page : chargée au repos, ou à la demande */
const FeuilleRecharge = dynamic(() => import("@/components/bulles/FeuilleRecharge").then((m) => m.FeuilleRecharge), { ssr: false });
const chargerLaRecharge = () => import("@/components/bulles/FeuilleRecharge");

/** Largeur de la fenêtre de conv sur desktop ; l’en-tête (logo, « Mon compte ») s’aligne dessus. */
const WINDOW_W = 720;

/*
 * La première apparition du compteur de bulles est expliquée (la carte « Tes 3 bulles offertes sont là »), une fois sur
 * cet appareil : fermée, ou une première réponse arrivée. Au rendu serveur, et sans stockage, elle ne se montre pas.
 */
const BULLES_EXPLIQUEES = drapeauLocal("blush.bulles.expliquees", { defaut: false, indisponible: true, serveur: true });

/** Combien de temps reste le mot qui suit une recharge (« +25 bulles, ta réponse est là »). */
const MOT_DE_LA_RECHARGE_MS = 2600;

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
  /**
   * La conv affichée (son identifiant, résolu par le serveur) : la conv gardée pendant la visite n’est reprise que pour
   * elle. Sans elle (l’aperçu de l’équipe), rien n’est gardé, et l’historique n’est pas relu.
   */
  storyId?: string;
  /** Back-end : l’heure du rendu serveur de la page (heureDuRendu). L’historique qu’elle vient de rendre n’est pas relu à l’ouverture. */
  rendu?: number;
  /**
   * Le rapport de cette conv pas encore débloqué : le chat vient avec lui (sa mémoire), le paiement s’ouvre par-dessus.
   * Fermé sans payer, il mène à son rapport, ou à « Tes convs » s’il y en a d’autres (il couvre le retour vers elles).
   */
  ferme?: boolean;
  /**
   * Revenu d’une recharge payée (`/app?recharge=<bulles>`, l’adresse que la recharge a donnée au paiement) : les bulles
   * achetées. La réponse prête se lit tout de suite, et un mot le dit.
   */
  recharge?: number;
  /**
   * Arrivé par un bouton d’un mail (/ouvrir/<conv>, src/server/sequences.ts) : le texte qu’il tape d’avance dans le champ
   * (`?dire=`, jamais envoyé seul), ou la recharge ouverte (`?recharger=1`). L’adresse les perd aussitôt.
   */
  dire?: string;
  recharger?: boolean;
  /**
   * Le paiement dans le chat simulé (l’aperçu de l’équipe, /apercu/achat). Sans lui, l’accueil paie pour de vrai les
   * cartes d’achat sous les réponses de BLUSH (./accueil/achat.tsx, useAchatDuChat), pour un compte qui a des bulles.
   */
  achat?: AchatDuChat;
}) {
  const { contact, storyId: cle, others = [], quick = [], script = [], plusAnciens = false, arrive = false, fromReport = false, ideesMasquees = false, envoyer } = p;
  /* L’accueil entier (il recule derrière la feuille du contact, ses entrées se posent au premier geste), le fil et son haut */
  const page = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLElement>(null);
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
  const idees = useIdees(cle, quick);
  /*
   * Ce que les lecteurs d’écran entendent de la conv (la région role="status", plus bas) : le fil n’est pas une région
   * live, seuls la dernière réponse de BLUSH (ou un mot de lui) et les messages plus anciens chargés sont dits, même deux
   * fois de suite (accueil/annonce.ts)
   */
  const [annonce, annoncer] = useAnnonce();

  /*
   * Les bulles (le prototype validé des bulles) : le solde vient du compte que la page a rendu, puis de chaque réponse
   * (ce qu’il en reste, dit par le serveur avec elle). Le compteur à côté du bouton du compte, une carte au-dessus du
   * champ, « C’est quoi une bulle ? » et la recharge. L’équipe a des bulles illimitées : ni carte, ni recharge.
   */
  const comptePage = useCompteDeLaPage();
  const { data: compte } = useCompte(comptePage?.compte ?? undefined, { rendu: comptePage?.rendu, frais: FRAIS_DU_RENDU });
  const compteVu = useRef(compte);
  useEffect(() => {
    compteVu.current = compte;
  });
  const solde = soldeAffiche(compte);
  const expliquees = useDrapeau(BULLES_EXPLIQUEES);
  /* Arrivé par un bouton d’un mail des bulles (`?recharger=1`) : la recharge ouverte d’emblée (pas pour l’équipe, sans solde) */
  const [feuille, setFeuille] = useState<"bulle" | "recharge" | null>(() => (p.recharger && solde !== null ? "recharge" : null));
  const rechargePrete = useChargeAuRepos(chargerLaRecharge, { ouverte: feuille === "recharge" });
  const [mot, setMot] = useState<string | null>(null);
  /** Ce qu’une réponse dit des bulles : ce qu’il en reste (le compteur, Mon compte), ou qu’il n’y en a plus (la recharge). */
  const bullesDeLaReponse = (r: BlushAnswer) => {
    const c = compteVu.current;
    if (r.bulles && c) setQueryData("account", { ...c, bulles: r.bulles.restantes });
    if (r.plusDeBulles) setFeuille("recharge");
    else BULLES_EXPLIQUEES.poser(true);
  };

  /* La conv elle-même (accueil/conv/useConversation.ts). L’accueil l’habille : ce que fait l’écran pendant qu’elle change, c’est sa scène */
  const conv = useConversation({
    cle,
    introAt: p.introAt,
    script,
    plusAnciens,
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
      annoncer: (m) => {
        const texte = annonceDe(m);
        if (texte) annoncer(texte);
      },
      anciensPoses: (n) => annoncer(annonceAnciens(n)),
      niveau: (to) => {
        if (monter(to)) conv.marquerNiveau(to);
      },
      recue: bullesDeLaReponse,
      manqueDeBulles: () => setFeuille("recharge"),
    },
  });
  /* La réponse écrite à 0 bulle qui attend la recharge (une au plus par compte), si elle est dans cette conv */
  const prete = conv.msgs.find((m) => m.type === "reponse" && !!m.result.verrouillee);
  const verrou = prete?.type === "reponse" ? prete.result.verrouillee : undefined;
  const lirePrete = () => {
    if (!prete || !verrou) return;
    if (solde !== null && solde < verrou.cout) setFeuille("recharge");
    else void conv.lire(prete.id, verrou.message);
  };

  /*
   * Revenu d’une recharge payée : l’adresse perd son `?recharge=` (un rechargement ne le redit pas), la réponse prête se
   * lit sans débit (la recharge la paie : le solde reste l’ancien plus les bulles achetées), et un mot dit les bulles
   * reçues. Une fois par montage
   */
  const recharge = p.recharge;
  const rechargeVue = useRef(false);
  /* Des bulles payées : la réponse prête se lit (la recharge la paie), et un mot dit les bulles reçues. La conv du moment */
  const convVue = useRef(conv);
  useEffect(() => {
    convVue.current = conv;
  });
  const lireApresLaRecharge = useCallback(async (bulles: number) => {
    const c = convVue.current;
    const m = c.msgs.find((x) => x.type === "reponse" && !!x.result.verrouillee);
    const v = m?.type === "reponse" ? m.result.verrouillee : undefined;
    const lue = m && v ? await c.lire(m.id, v.message) : false;
    setMot(apresLaRecharge(bulles, lue));
  }, []);
  useEffect(() => {
    if (!recharge || rechargeVue.current) return;
    rechargeVue.current = true;
    const ici = new URL(window.location.href);
    ici.searchParams.delete("recharge");
    window.history.replaceState(window.history.state, "", `${ici.pathname}${ici.search}${ici.hash}`);
    void lireApresLaRecharge(recharge);
  }, [recharge, lireApresLaRecharge]);
  /*
   * Le paiement des cartes d’achat du chat (./accueil/achat.tsx), pour un compte qui a des bulles (pas l’équipe) : payé en
   * un geste, le compteur prend les bulles livrées et la réponse prête se lit ; sans carte gardée, la feuille de la
   * recharge, notée comme venue du chat
   */
  const [rechargeDuChat, setRechargeDuChat] = useState(false);
  const surBullesDuChat = useCallback(
    (bulles: number) => {
      const c = compteVu.current;
      if (c) setQueryData("account", { ...c, bulles: c.bulles + bulles });
      void lireApresLaRecharge(bulles);
    },
    [lireApresLaRecharge],
  );
  const rechargerDuChat = useCallback(() => {
    setRechargeDuChat(true);
    setFeuille("recharge");
  }, []);
  const achatReel = useAchatDuChat({ surBulles: surBullesDuChat, recharger: rechargerDuChat });
  const achat = p.achat ?? (solde !== null ? achatReel : null);
  /* La dernière réponse porte une carte d’achat de bulles : le bandeau des bulles ne la double pas */
  const derniere = conv.msgs.findLast((m) => m.type === "reponse");
  const vendue = derniere?.type === "reponse" ? derniere.result.offre?.genre : undefined;
  const carteDeBulles = !!achat && (vendue === "bulles" || vendue === "premium");
  /* Arrivé par un bouton d’un mail : l’adresse perd son `?dire=` et son `?recharger=1` (un rechargement ne les redit pas) */
  const { dire, recharger } = p;
  useEffect(() => {
    if (dire === undefined && !recharger) return;
    const ici = new URL(window.location.href);
    ici.searchParams.delete("dire");
    ici.searchParams.delete("recharger");
    window.history.replaceState(window.history.state, "", `${ici.pathname}${ici.search}${ici.hash}`);
  }, [dire, recharger]);
  useEffect(() => {
    if (!mot) return;
    const t = setTimeout(() => setMot(null), MOT_DE_LA_RECHARGE_MS);
    return () => clearTimeout(t);
  }, [mot]);
  const { dig, ...envois } = useEnvois({ conv, idees, envoyer, flightRef, input });
  const opened = useSyncExternalStore(noSubscription, readOpenedAt, () => null);
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

  const credit = useMemo(() => ({ solde, recharger: () => setFeuille("recharge") }), [solde]);
  const etatBandeau = carteDeBulles ? null : etatDuBandeau({ solde, prete: !!verrou, expliquees });
  const barre = {
    contact: live,
    others,
    busy: conv.occupe,
    ouvrirDetails,
    entete,
    /* Le compteur de bulles, dès que le compte est lu (l’aperçu de l’équipe, sans compte, n’en a pas) */
    aGauche: compte ? <CompteurBulles bulles={solde} ouvrir={() => setFeuille("bulle")} /> : undefined,
  };
  return (
    <ContactContext value={live}>
      <MotionContext value={moving}>
        <AppScreen
          ferme={p.ferme}
          /* D’autres convs : le paiement fermé mène à leur liste (il couvre le retour vers elles), pas au rapport de celle-ci */
          quitter={others.length > 0 ? "/app/convs" : undefined}
          autre={contact.fiche.person.name}
          aside={null}
          mainWidth={WINDOW_W}
          frameWidth={WINDOW_W}
          contentGap={0}
          desktopTopPad={0}
          ref={page}
          className={cn(figtree.variable, arriving && "home-arrive")}
          mobileTop={<EnTeteMobile headRef={head} fromReport={fromReport} {...barre} />}
        >
          <h1 className="sr-only">Ta conv avec BLUSH</h1>
          <p role="status" className="sr-only">
            {annonce}
          </p>
          <div className="-mx-[22px] -mt-1 flex flex-1 flex-col lg:mx-0 lg:mt-0 lg:h-[clamp(540px,calc(100dvh_-_132px),700px)] lg:flex-none lg:overflow-hidden lg:rounded-[32px] lg:bg-white lg:shadow-[0_0_0_1px_rgba(17,17,20,0.05),0_2px_6px_rgba(17,17,20,0.03),0_48px_90px_-48px_rgba(17,17,20,0.32)]">
            <BarreDeLaFenetre {...barre} />
            <CreditContext value={credit}>
              <AchatDuChatContext value={achat}>
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
                  lire={conv.lire}
                />
              </AchatDuChatContext>
            </CreditContext>
            {/* La barre de saisie : « + » pour des captures ou un export, ou un message à BLUSH */}
            <Composer
              {...envois}
              texteDeDepart={dire}
              formRef={composer}
              inputRef={input}
              quick={idees.quick}
              entree={idees.entree}
              ideesMasquees={ideesMasquees}
              modeVocal={conv.modeVocal}
              onEcrit={() => void conv.repasserAEcrit()}
              busy={conv.occupe}
              arriving={arriving}
              logo={logoVu}
              bandeau={
                solde !== null && (
                  <BandeauBulles
                    etat={etatBandeau}
                    bulles={Math.max(0, solde)}
                    autre={contact.fiche.person.name}
                    pronom={contact.fiche.person.pronoun}
                    recharger={() => setFeuille("recharge")}
                    lire={lirePrete}
                    expliquer={() => setFeuille("bulle")}
                    fermer={() => BULLES_EXPLIQUEES.poser(true)}
                  />
                )
              }
            >
              {/* « Partager en image » : la réponse choisie, en story */}
              <PartageImageSheet cible={image ? { type: "reponse", echange: image } : null} onClose={() => setImage(null)} />
            </Composer>
            <ConvEnBas />
          </div>

          <ContactSheet contact={live} open={details} onClose={() => setDetails(false)} departRef={departRef} entete={entete} pageRef={page} />
          {/* « C’est quoi une bulle ? » (le compteur), d’où l’on recharge ; puis la recharge, qui revient ici une fois payée */}
          {compte &&
            (solde === null ? (
              <FeuilleBulle open={feuille === "bulle"} onClose={() => setFeuille(null)} />
            ) : (
              <FeuilleBulle open={feuille === "bulle"} onClose={() => setFeuille(null)} solde={Math.max(0, solde)} recharger={() => setFeuille("recharge")} />
            ))}
          {solde !== null && rechargePrete && (
            <FeuilleRecharge
              open={feuille === "recharge"}
              onClose={() => {
                setFeuille(null);
                setRechargeDuChat(false);
              }}
              reponsePrete={!!verrou}
              autre={contact.fiche.person.name}
              suite={(bulles) => `/app?recharge=${bulles}`}
              {...(rechargeDuChat ? { vente: "bulles" as const } : {})}
            />
          )}
          {mot && <Toast className="fixed inset-x-4 top-3 z-[95] lg:left-1/2 lg:right-auto lg:w-[420px] lg:-translate-x-1/2">{mot}</Toast>}
        </AppScreen>
      </MotionContext>
    </ContactContext>
  );
}
