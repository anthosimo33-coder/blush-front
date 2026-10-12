"use client";

/*
 * La conv de l’accueil, vivante : ses messages et ce qu’on en fait, par des actions nommées (envoyer, relancer, dire un
 * mot, marquer un niveau), le mode vocal du chat (un seul propriétaire : ce hook) et son historique (useChargerAnciens).
 * HomeScreen ne change jamais les messages lui-même : il appelle ces actions, et habille la conv (bulles, vols,
 * défilement). Ce qui touche à l’écran pendant un échange (relever les lignes avant un changement, le vol de l’avatar,
 * le pop de la réponse, la fête d’un niveau) lui revient par `Scene`. Le modèle des messages, sans React : ./modele.ts.
 * Testé dans tests/client/useConversation.test.ts.
 */
import { useEffect, useRef, useState } from "react";
import { CoupureChat, modeVocalChat, type SuiviChat } from "@/services/api";
import { noterEcriture } from "@/lib/query";
import { tracer } from "@/lib/tracer";
import type { BlushAnswer, BulleChat, LevelId } from "@/types";
import { fusion, remonter, type Conv } from "../../garde";
import { echangesEnMsgs, introDe, PREMIER_ID_VISITE, type EchangeScript, type Msg, type NewMsg } from "./modele";
import { useChargerAnciens, type EcranDeLHistorique } from "./useChargerAnciens";

/*
 * La conv de la visite, gardée hors de l’accueil (celle de la conv ouverte seulement : une autre conv la remplace),
 * avec le mode vocal. Revenu sur l’accueil, il repart d’elle au lieu de la page d’avant la visite que Next garde en
 * cache (voir ../../garde.ts). Seuls les effets l’écrivent : rien au rendu serveur ni à l’hydratation.
 */
let gardee: (Conv<Msg> & { cle: string; modeVocal: boolean }) | null = null;
/* Les identifiants des messages de la visite (1, 2, 3…) : ils continuent d’une visite à l’autre, la conv gardée garde les siens */
let prochainId = PREMIER_ID_VISITE;

/** L’identifiant d’un nouveau message de la visite (ton message, que l’accueil fait voler avant de l’envoyer : ../envois.ts). */
export const nouvelId = () => prochainId++;

/** Ce que l’écran fait pendant que la conv change (HomeScreen) : rien ici ne touche au DOM. */
export type Scene = EcranDeLHistorique & {
  /** Juste avant chaque changement de la conv par une action : où sont ses lignes, pour les faire glisser ensuite. */
  avantChangement: () => void;
  /** Un échange part (ou repart) : les questions toutes prêtes s’effacent, et referont leur entrée. */
  echangeCommence: () => void;
  /** « BLUSH écrit » laisse sa place à ce qui arrive en premier pour la réponse `reponse` (des bulles, ou la réponse entière). */
  ecritCede: (reponse: number) => void;
  /** Les premières bulles de la réponse remplacent les perles. */
  reponsePosee: () => void;
  /**
   * Un message de BLUSH vient d’être posé en entier : sa réponse (coupée ou non), ou un mot. L’écran le dit aux lecteurs
   * d’écran (le fil, lui, n’est pas une région live).
   */
  annoncer: (m: Msg) => void;
  /** `n` messages plus anciens de l’historique viennent d’être posés devant la conv (en la remontant). */
  anciensPoses: (n: number) => void;
  /** Une réponse fait passer un cap (0,7 s après elle). */
  niveau: (level: LevelId) => void;
};

/** Ce que demande un échange : la réponse de BLUSH, avec ses bulles et son vocal à mesure (`suivi`). */
type Demande = (suivi: SuiviChat) => Promise<NewMsg>;

/**
 * Un échange : `label`, ce que dit « BLUSH écrit » ; `demande`, la réponse de BLUSH ; `vocal`, BLUSH prépare un vocal
 * (sa bulle l’attend). C’est aussi ce que « Réessayer » relance.
 */
export type Echange = { label: string; demande: Demande; vocal?: boolean };

/** Combien de bulles de la conv font ces bulles de BLUSH (une bulle, et chacun de ses messages à copier : bulleEcrite, ../bulles.tsx). */
const noeudsDe = (bulles: BulleChat[]) => bulles.reduce((n, b) => n + 1 + (b.messages?.length ?? 0), 0);

/** La réponse avec son vocal arrivé, ou sans (la voix a échoué : elle reste écrite). Sa bulle n’attend plus. */
const avecVocal = (r: BlushAnswer, vocal: NonNullable<BlushAnswer["vocal"]> | null): BlushAnswer => ({ ...r, vocalEnCours: undefined, ...(vocal ? { vocal } : {}) });

/**
 * Le mode vocal du chat, son seul propriétaire : BLUSH répond en vocal tant qu’on ne repasse pas à l’écrit. Il part de
 * la page (la base, ou la conv gardée), puis suit ce que dit le serveur (l’historique relu, chaque réponse) ; « Repasser
 * à l’écrit » change l’écran tout de suite, attend le serveur, et revient au vocal s’il ne l’a pas gardé.
 *
 * L’ordre qui compte est celui des demandes, pas celui des réponses : le serveur rapporte le mode lu au début de la
 * demande (src/server/chat.ts). Une réponse partie avant le dernier geste ne le défait donc pas ; une réponse partie
 * après lui, et arrivée avant que le serveur le confirme, l’emporte (c’est elle qui sait). `local` (l’aperçu, sans
 * conv en base) : « Repasser à l’écrit » ne demande rien au serveur, l’écran reste à l’écrit.
 */
function useModeVocal(initial: () => boolean, local: boolean) {
  const [modeVocal, setModeVocal] = useState(initial);
  /* Les gestes (« Repasser à l’écrit ») et les réponses suivies, comptés : qui est parti avant qui */
  const gestes = useRef(0);
  const suivies = useRef(0);
  /**
   * Au départ d’une demande au serveur (l’historique, un échange) : de quoi suivre le mode qu’elle rapportera. Un geste
   * fait entre-temps l’emporte sur elle.
   */
  const suivreDepuis = () => {
    const geste = gestes.current;
    return (actif: boolean) => {
      if (gestes.current !== geste) return;
      suivies.current++;
      setModeVocal(actif);
    };
  };
  /** « Repasser à l’écrit » : vrai si le serveur l’a gardé. */
  const repasserAEcrit = async () => {
    const geste = ++gestes.current;
    const suivi = suivies.current;
    setModeVocal(false);
    if (local) return true;
    noterEcriture("chat");
    const garde = await modeVocalChat(false);
    noterEcriture("chat");
    /* Refusé (le réseau, une erreur) : le chat est encore en vocal, le bandeau revient (sauf si on sait mieux depuis) */
    if (!garde && gestes.current === geste && suivies.current === suivi) setModeVocal(true);
    return garde;
  };
  return { modeVocal, suivreDepuis, repasserAEcrit };
}

/**
 * La conv de l’accueil. `cle` : la conv affichée (la conv gardée pendant la visite n’est reprise que pour elle ; sans
 * elle, comme l’aperçu, rien n’est gardé, et l’historique n’est pas relu). `script`, `plusAnciens`, `modeVocalInitial`,
 * `introAt`, `rendu` : ce que la page a rendu (voir HomeScreen).
 */
export function useConversation({
  cle,
  introAt,
  script,
  plusAnciens,
  modeVocalInitial,
  rendu,
  scene,
}: {
  cle?: string;
  introAt?: number;
  script: EchangeScript[];
  plusAnciens: boolean;
  modeVocalInitial?: boolean;
  rendu?: number;
  scene: Scene;
}) {
  /*
   * La conv de départ : celle de la page, où se fond la conv gardée pendant la visite quand on revient sur l’accueil
   * (les échanges de la visite, les morceaux d’historique déjà chargés : voir ../../garde.ts).
   */
  const [reprise] = useState(() => (cle !== undefined && gardee?.cle === cle ? gardee : null));
  const [depart] = useState((): Conv<Msg> => {
    const page = { msgs: [...introDe(introAt), ...echangesEnMsgs(script)], plus: plusAnciens, plusAncien: script[0]?.id ?? null };
    return reprise ? fusion(remonter(reprise), page) : page;
  });
  const [msgs, setMsgs] = useState(depart.msgs);
  /* Les messages nés à partir d’ici sont ceux de cette visite : eux seuls font leur entrée, le reste est déjà lu */
  const [depuis] = useState(() => prochainId);
  const derniers = useRef(depart);
  /* Le serveur le sait ; sans lui (l’aperçu), d’après la dernière réponse */
  const vocal = useModeVocal(() => reprise?.modeVocal ?? modeVocalInitial ?? !!script.at(-1)?.answer.modeVocal, cle === undefined);
  /* L’écran du dernier rendu : un échange en route s’en sert à chaque arrivée */
  const ecran = useRef(scene);
  useEffect(() => {
    ecran.current = scene;
  });

  const historique = useChargerAnciens({
    depart,
    depuis,
    derniers,
    rendu,
    /* L’aperçu (sans conv en base) ne relit pas l’historique : ce serait celui du compte connecté */
    relire: cle !== undefined,
    modeVocalDuRendu: modeVocalInitial,
    fondre: setMsgs,
    poserDevant: (nouveaux) => {
      setMsgs((prev) => {
        const deja = new Set(prev.map((m) => m.id));
        const intro = prev.filter((m) => m.type === "intro");
        return [...intro, ...nouveaux.filter((m) => !deja.has(m.id)), ...prev.filter((m) => m.type !== "intro")];
      });
      ecran.current.anciensPoses(nouveaux.length);
    },
    suivreModeVocal: vocal.suivreDepuis,
    ecran: scene,
  });
  const { plus, plusAncien } = historique;

  /* La conv affichée, pour ce qui arrive après coup (l’historique frais) ; et gardée pour un retour sur l’accueil */
  useEffect(() => {
    derniers.current = { msgs, plus, plusAncien: plusAncien.current };
    if (cle !== undefined) gardee = { cle, ...derniers.current, modeVocal: vocal.modeVocal };
  }, [cle, msgs, plus, plusAncien, vocal.modeVocal]);

  /** Toute modification de la conv par une action passe par ici : l’écran note d’abord où sont ses lignes. */
  const changer = (fn: (m: Msg[]) => Msg[]) => {
    ecran.current.avantChangement();
    setMsgs(fn);
  };

  /* « Réessayer » une réponse coupée par le réseau : ce qu’elle demandait, par réponse (voir echanger) */
  const relances = useRef(new Map<number, Echange>());
  /* Les minuteurs en route (la fête d’un niveau, 0,7 s après sa réponse) : un accueil quitté avant ne la joue pas */
  const minuteurs = useRef(new Set<number>());
  useEffect(() => {
    const enRoute = minuteurs.current;
    return () => {
      enRoute.forEach((t) => window.clearTimeout(t));
      enRoute.clear();
    };
  }, []);

  /**
   * Ton message part (`mine`), BLUSH tape « … », puis sa réponse remplace les trois points. Back-end : elle arrive au
   * fil de l’eau, ses bulles une à une (chaque arrivée se déplie, ce qui est posé ne bouge plus), puis la réponse
   * validée, qui les complète (ou les remplace) ; un vocal se prépare encore après elle, sa bulle attend. Le réseau qui
   * coupe : les bulles reçues restent, avec « Réessayer ». Toute autre erreur aussi (aucune bulle reçue) : « BLUSH
   * écrit » ne reste jamais bloqué. `relance` : la réponse coupée qui repart, à sa place (sans ton message, déjà là).
   */
  const echanger = async ({ mine, relance, ...echange }: Echange & ({ mine: Msg; relance?: undefined } | { mine?: undefined; relance: number })) => {
    const { label, demande, vocal: vocalAttendu = false } = echange;
    const readingId = relance ?? nouvelId();
    const sent = Date.now();
    ecran.current.echangeCommence();
    const ecrit: Msg = { type: "ecrit", id: readingId, from: "blush", reading: label, vocal: vocalAttendu, at: sent };
    if (mine) changer((m) => [...m, { ...mine, at: sent }, ecrit]);
    else changer((m) => m.map((x) => (x.id === readingId ? ecrit : x)));
    /* Ce qui est déjà à l’écran : l’heure de la réponse (à sa première bulle), ses bulles, où commence chaque arrivée */
    let at = 0;
    let poses = 0;
    let vagues: number[] = [];
    /* Les arrivées se posent dans l’ordre (« BLUSH écrit » peut d’abord se replier) */
    let file = Promise.resolve();
    let finie = false;
    /* Le vocal, s’il arrive avant que la réponse soit posée */
    let vocalTot: NonNullable<BlushAnswer["vocal"]> | null | undefined;
    let posee = false;
    /* « BLUSH écrit » laisse sa place à ce qui arrive en premier : des bulles, ou la réponse entière. Vrai la première fois */
    const remplacer = () => {
      if (at) return false;
      at = Date.now();
      ecran.current.ecritCede(readingId);
      return true;
    };
    /* Des bulles arrivées pendant qu’il écrit : elles se posent, BLUSH écrit encore (rien d’animé à part dans une bulle : elle se déplie entière) */
    const poser =
      (recues: BulleChat[], coupee = false) =>
      async (): Promise<Msg | undefined> => {
        if (finie && !coupee) return;
        const premiere = remplacer();
        vagues = [...vagues, poses];
        poses = noeudsDe(recues);
        if (coupee) vagues = [...vagues, poses];
        const pose: Msg = { type: "ecrit", id: readingId, from: "blush", reading: label, vocal: vocalAttendu, recues, ...(coupee ? { coupee } : {}), at, answered: true, vagues };
        changer((m) => m.map((x) => (x.id === readingId ? pose : x)));
        if (premiere && recues.length) ecran.current.reponsePosee();
        return pose;
      };
    const suivi: SuiviChat = {
      bulles: (recues) => void (file = file.then(poser(recues)).then(() => {})),
      vocal: (v) => {
        if (!posee) return void (vocalTot = v);
        changer((m) => m.map((x) => (x.id === readingId && x.type === "reponse" ? { ...x, result: avecVocal(x.result, v) } : x)));
      },
    };
    /* Le mode vocal que rapportera la réponse : celui du serveur au départ de la demande */
    const suivreModeVocal = vocal.suivreDepuis();
    let next: NewMsg;
    /* Le chat change en base : une page préchargée avant ne le montre pas (useChargerAnciens la relira) */
    noterEcriture("chat");
    try {
      next = await demande(suivi);
    } catch (e) {
      /* Une erreur qui n’est pas une coupure (un bug, une réponse illisible) : laissée en trace, elle coupe la réponse aussi */
      if (!(e instanceof CoupureChat)) tracer("conv:echange", e);
      await file;
      finie = true;
      /* Le réseau a coupé : ce qui est arrivé reste, « Réessayer » relance la même demande, à la même place */
      relances.current.set(readingId, echange);
      const coupee = await poser(e instanceof CoupureChat ? e.recues : [], true)();
      if (coupee) ecran.current.annoncer(coupee);
      return;
    } finally {
      noterEcriture("chat");
    }
    await file;
    finie = true;
    const premiere = remplacer();
    const r = next.type === "reponse" && vocalTot !== undefined ? { ...next, result: avecVocal(next.result, vocalTot) } : next;
    posee = true;
    /* Ce qui est déjà posé ne se redéplie pas : la suite de la réponse est une nouvelle arrivée */
    const reponse: Msg = { ...r, id: readingId, at, answered: true, ...(poses ? { vagues: [...vagues, poses] } : {}) };
    changer((m) => m.map((x) => (x.id === readingId ? reponse : x)));
    if (premiere) ecran.current.reponsePosee();
    ecran.current.annoncer(reponse);
    if (next.type === "reponse" && next.result.modeVocal !== undefined) suivreModeVocal(next.result.modeVocal);
    const up = next.type === "reponse" ? next.result.levelUp : undefined;
    if (!up) return;
    const t = window.setTimeout(() => {
      minuteurs.current.delete(t);
      ecran.current.niveau(up);
    }, 700);
    minuteurs.current.add(t);
  };

  return {
    msgs,
    depuis,
    /** BLUSH « écrit » (ses bulles arrivent encore). Une réponse coupée attend « Réessayer » : elle n’occupe plus BLUSH. */
    occupe: msgs.some((m) => m.type === "ecrit" && !m.coupee),
    modeVocal: vocal.modeVocal,
    plus,
    /** Un morceau plus ancien de l’historique se charge. */
    anciens: historique.anciens,
    chargerAnciens: historique.chargerAnciens,
    precharger: historique.precharger,
    /** Ton message `mine` (son identifiant : nouvelId) part, avec l’échange qu’il demande (voir Echange). */
    envoyer: (mine: Msg, echange: Echange) => echanger({ ...echange, mine }),
    /** « Réessayer » : la même demande repart, à la place de la réponse coupée. Faux si rien n’est à relancer. */
    relancer: (reponse: number) => {
      const r = relances.current.get(reponse);
      if (!r) return false;
      relances.current.delete(reponse);
      void echanger({ ...r, relance: reponse });
      return true;
    },
    /** Un mot de BLUSH dans la conv (pas de micro, rien entendu). */
    direMot: (notice: string) => {
      const mot: Msg = { type: "mot", id: nouvelId(), from: "blush", at: Date.now(), notice };
      changer((m) => [...m, mot]);
      ecran.current.annoncer(mot);
    },
    /** Un repère dans la conv : un niveau franchi. */
    marquerNiveau: (level: LevelId) => {
      const id = nouvelId();
      changer((m) => [...m, { type: "niveau", id, from: "event", level, at: Date.now() }]);
    },
    /** « Repasser à l’écrit » (voir useModeVocal). */
    repasserAEcrit: vocal.repasserAEcrit,
  };
}
