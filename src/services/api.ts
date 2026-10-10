/*
 * Couche de service BLUSH, dans le navigateur : le seul point de contact avec les données, par les routes /api du
 * back-end. Les cookies de session sont httpOnly : le navigateur les envoie, il ne les lit pas. Les pages serveur
 * passent par serveur.ts.
 */
import type {
  AnalysisProgress,
  AppKind,
  BlushAnswer,
  BulleChat,
  Echec,
  EvenementChat,
  EvenementEcoute,
  Fiche,
  FicheFact,
  FicheUpdate,
  Goal,
  Guess,
  Plan,
  Pronom,
  QuestionAnswer,
  Report,
  SoberReport,
  Source,
  Subscription,
  VocalRapport,
} from "@/types";
import { ErreurApi, type CodeErreur } from "@/types/erreurs-api";
import { messageErreur, problemeAjout } from "@/lib/messages-erreur";
import { ENVOI_IMAGES_MAX, extensionAudio } from "@/lib/limites";
import { preparerCaptures } from "./preparer-captures";
import type { ConvInstagram } from "./preparer-export";
import { ENTETE_CONV, lireConvDeLaPage, writeStoryCookie } from "./session";

/*
 * Les préparateurs d’un export (fflate, les lecteurs d’Instagram) et d’un enregistrement d’écran ne sont chargés qu’au
 * moment d’importer : ce module est importé par presque tous les écrans. L’écran qui ouvre le sélecteur de fichier les
 * précharge, pour qu’ils soient là quand le fichier arrive.
 */
const pExport = () => import("./preparer-export");
const pVideo = () => import("./preparer-video");
export const prechargerExport = () => void pExport().catch(() => {});
export const prechargerVideo = () => void pVideo().catch(() => {});

export type Account = {
  email: string | null;
  subscription: Subscription;
  storyDeleted: boolean;
};

/** Un chapitre pendant l’écriture du rapport : en attente, en train de s’écrire, ou prêt. */
export type EtatChapitre = "attente" | "en_cours" | "ecrit";
/** Pendant que le rapport s’écrit : la vraie avancée, lue sur ce que le modèle écrit. */
export type EcritureRapport = {
  etape: "plan" | "chapitres";
  /** De 0 à 1 : le plan jusqu’à 0,3, puis les chapitres. */
  progres: number;
  chapitres: { number: number; title: string; etat: EtatChapitre }[];
  /** Le temps qui reste, estimé (« 1 min »), ou null tant qu’on ne sait pas. */
  restant: string | null;
};

export type ReportPayload = {
  report: Report;
  /** Le mode sobre : présent quand la conv lève une alerte de danger (détresse, mineur), le rapport court et doux. */
  sober: SoberReport | null;
  access: Plan;
  /** Le rapport s’écrit encore (accès débloqué, pas fini). Le front repasse dans quelques secondes. */
  generating?: boolean;
  /** Pendant l’écriture : où en est BLUSH, chapitre par chapitre. */
  ecriture?: EcritureRapport;
  /** Le vocal de BLUSH, en haut du rapport : prêt, ou en train de s’enregistrer. */
  vocal?: VocalRapport;
  /** L’écriture a échoué pour de bon (la panne : on peut la relancer ; le refus du modèle : rien à relancer). */
  echec?: Echec;
};

/** Un morceau de l’historique du chat (du plus ancien au plus récent), et s’il en reste de plus anciens. */
export type HistoriqueChat = { echanges: { id: number; mine: string; answer: BlushAnswer; at: number }[]; plus: boolean; modeVocal?: boolean };

/**
 * Où en est la lecture d’un enregistrement d’écran : la vidéo regardée dans le navigateur, puis ses lots lus par BLUSH.
 * « reprise » : le réseau a coupé pendant un envoi de captures ou d’enregistrement, il repart (voir avecReprise).
 */
export type AvanceVideo = { etape: "video"; p: number } | { etape: "lecture"; faits: number; total: number } | { etape: "reprise" };

/** Le chat : la réponse n’est pas arrivée en entier (le réseau a coupé, ou une erreur après des bulles). Les bulles déjà reçues, peut-être aucune. */
export class CoupureChat extends Error {
  constructor(readonly recues: BulleChat[]) {
    super("coupure");
  }
}

/** Pendant la réponse du chat : ses bulles une à une (toutes celles reçues), puis son vocal, qui arrive après elle (null : elle reste écrite). */
export type SuiviChat = { bulles?: (recues: BulleChat[]) => void; vocal?: (vocal: NonNullable<BlushAnswer["vocal"]> | null) => void };

/** Les en-têtes d’un appel, avec la conv de la page (voir ENTETE_CONV). */
function avecConv(entetes?: HeadersInit): Headers {
  const h = new Headers(entetes);
  const conv = lireConvDeLaPage();
  if (conv) h.set(ENTETE_CONV, conv);
  return h;
}

async function appel<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(chemin, { credentials: "same-origin", cache: "no-store", ...init, headers: avecConv(init.headers) });
  const corps = (await r.json().catch(() => ({}))) as { erreur?: CodeErreur };
  if (!r.ok) throw new ErreurApi(corps.erreur ?? "erreur", r.status);
  return corps as T;
}

/**
 * Un message au chat. La réponse arrive en flux (une ligne JSON par événement, src/app/api/chat/route.ts) : les bulles
 * passent à `suivi` à mesure, la promesse se résout avec la réponse validée, sans attendre le vocal, qui arrive ensuite
 * par `suivi` (sans `suivi.vocal`, on cesse de lire : le serveur finit seul). Une erreur avant que BLUSH écrive :
 * ErreurApi, comme les autres appels. Le réseau qui coupe, ou une erreur après des bulles : CoupureChat.
 */
async function chat(init: RequestInit, suivi: SuiviChat = {}): Promise<BlushAnswer> {
  const recues: BulleChat[] = [];
  let r: Response;
  try {
    const entetes = avecConv(init.headers);
    entetes.set("accept", "application/x-ndjson");
    r = await fetch("/api/chat", { credentials: "same-origin", cache: "no-store", ...init, headers: entetes });
  } catch {
    throw new CoupureChat(recues);
  }
  /* Une erreur avant que BLUSH écrive, ou un serveur d’avant le flux (pendant une mise en ligne) : la réponse d’un bloc */
  if (!r.ok || !r.body || !r.headers.get("content-type")?.includes("ndjson")) {
    const corps = (await r.json().catch(() => ({}))) as BlushAnswer & { erreur?: CodeErreur };
    if (!r.ok || !("kind" in corps)) throw new ErreurApi(corps.erreur ?? "erreur", r.ok ? 500 : r.status);
    return corps;
  }
  const lecteur = r.body.getReader();
  return new Promise<BlushAnswer>((resoudre, rejeter) => {
    let reponse = null as BlushAnswer | null;
    let vocal = false;
    const traiter = (e: EvenementChat) => {
      if ("bulle" in e) {
        recues.push(e.bulle);
        suivi.bulles?.([...recues]);
      } else if ("reponse" in e) {
        reponse = e.reponse;
        resoudre(e.reponse);
        if (!e.reponse.vocalEnCours || !suivi.vocal) void lecteur.cancel().catch(() => {});
      } else if ("vocal" in e) {
        vocal = true;
        suivi.vocal?.(e.vocal);
      } else if (!reponse) rejeter(recues.length ? new CoupureChat(recues) : new ErreurApi(e.erreur, 502));
    };
    void (async () => {
      const decodeur = new TextDecoder();
      let reste = "";
      try {
        for (;;) {
          const { done, value } = await lecteur.read();
          reste += decodeur.decode(value, { stream: !done });
          const lignes = reste.split("\n");
          reste = lignes.pop() ?? "";
          for (const l of lignes) if (l.trim()) traiter(JSON.parse(l) as EvenementChat);
          if (done) break;
        }
      } catch {
        /* Le réseau a coupé (ou la lecture a été arrêtée) : voir plus bas */
      }
      /* Le flux s’arrête sans la réponse : coupé. Après elle, le vocal attendu ne viendra plus : elle reste écrite */
      if (!reponse) rejeter(new CoupureChat(recues));
      else if (reponse.vocalEnCours && !vocal) suivi.vocal?.(null);
    })();
  });
}

const envoi = (methode: "POST" | "DELETE", corps?: unknown): RequestInit => ({
  method: methode,
  ...(corps === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(corps) }),
});

/** Des captures (réduites dans le navigateur, sous « captures ») ou un export (compressé, sous « export ») dans le formulaire. */
async function avecFichiers(fd: FormData, files: File[]): Promise<FormData> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  /* Chargé hors du try : un préparateur que le réseau n’a pas apporté n’est pas un fichier illisible */
  const px = images.length ? null : await pExport();
  try {
    if (images.length) (await preparerCaptures(images)).forEach((b, k) => fd.append("captures", b, `capture-${k + 1}.jpg`));
    else fd.append("export", await px!.preparerExport(files[0]), "export.json.gz");
  } catch {
    /* Un export illisible, ou de plusieurs convs (le chat et la fiche n’en font pas choisir une) : « fichier » */
    throw new ErreurApi(images.length ? "capture" : "fichier", 422);
  }
  return fd;
}

/* Les lots d’un enregistrement lus en même temps (chacun est un appel au modèle : lotParIp et lotsParCompte les bornent) */
const LECTEURS = 5;

/** La clé d’un envoi : le serveur reconnaît un nouvel essai du même envoi (src/server/captures.ts, reprise). */
const cleEnvoi = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (o) => o.toString(16).padStart(2, "0")).join(""));

/**
 * Un long envoi (30 s à 2 min de lecture) que le réseau coupe : Safari passé en arrière-plan, l’écran verrouillé, le
 * Wi-Fi qui passe en 4G. Il repart une fois, dès que la page est de nouveau visible : avec la même clé, le serveur rend
 * la lecture déjà faite au lieu de la refaire (et de la repayer). Une réponse du serveur (ErreurApi) n’est pas rejouée.
 */
async function avecReprise<T>(envoyer: () => Promise<T>, onReprise?: () => void): Promise<T> {
  try {
    return await envoyer();
  } catch (e) {
    if (e instanceof ErreurApi) throw e;
    onReprise?.();
    await quandVisible();
    return envoyer();
  }
}

/** Une petite pause, puis la page visible (au retour dans Safari) et en ligne ; hors ligne, on n’attend pas plus de 30 s. */
function quandVisible(): Promise<void> {
  return new Promise((ok) => {
    const debut = Date.now();
    const verifier = () => {
      if (document.visibilityState !== "visible" || (!navigator.onLine && Date.now() - debut < 30_000)) return;
      clearInterval(minuteur);
      document.removeEventListener("visibilitychange", verifier);
      window.removeEventListener("online", verifier);
      ok();
    };
    const minuteur = setInterval(verifier, 1000);
    document.addEventListener("visibilitychange", verifier);
    window.addEventListener("online", verifier);
  });
}

/* ———— Import ———— */

/**
 * Un export : lu et réduit dans le navigateur. Un export Instagram complet : `choisir` fait choisir la conv
 * (null : on a renoncé, erreur « annule »), et seule celle-là part. `onAvance` : où en est le tour de ses convs (de 0 à 1).
 */
export async function uploadExport(file: File, choisir?: (convs: ConvInstagram[]) => Promise<string | null>, onAvance?: (part: number) => void): Promise<Source> {
  const fd = new FormData();
  const { analyserExport } = await pExport();
  let pret: Awaited<ReturnType<typeof analyserExport>>;
  try {
    pret = await analyserExport(file, onAvance);
  } catch {
    throw new ErreurApi("fichier", 422);
  }
  if (pret.type === "un") fd.append("export", pret.paquet, "export.json.gz");
  else {
    const id = choisir ? await choisir(pret.convs) : null;
    if (id == null) throw new ErreurApi("annule", 0);
    fd.append("export", await pret.paquetDe(id), "export.json.gz");
  }
  return (await appel<{ source: Source }>("/api/import", { method: "POST", body: fd })).source;
}

/**
 * Les captures, réduites dans le navigateur, puis lues par BLUSH (une seule fois, pour toutes). `onAvance` ne dit
 * que la reprise, si le réseau coupe pendant la lecture.
 */
export async function uploadScreenshots(files: File[], opts: { app: AppKind; mode: "first" | "add"; onAvance?: (a: AvanceVideo) => void }): Promise<{ source: Source; messagesRead: number }> {
  const fd = new FormData();
  try {
    (await preparerCaptures(files)).forEach((b, k) => fd.append("captures", b, `capture-${k + 1}.jpg`));
  } catch {
    throw new ErreurApi("capture", 422);
  }
  fd.append("app", opts.app);
  fd.append("mode", opts.mode);
  fd.append("cle", cleEnvoi());
  return avecReprise(
    () => appel<{ source: Source; messagesRead: number }>("/api/captures", { method: "POST", body: fd }),
    () => opts.onAvance?.({ etape: "reprise" }),
  );
}

/**
 * Un enregistrement d’écran de la conv (sa première importation) : le navigateur en tire les écrans de la conv (la vidéo
 * ne part pas), BLUSH les lit par lots (cinq à la fois), puis les lectures sont rassemblées en une histoire brouillon,
 * comme des captures.
 */
export async function uploadRecording(file: File, app: AppKind, onAvance?: (a: AvanceVideo) => void): Promise<{ source: Source; messagesRead: number }> {
  const { imagesDeLaVideo, lotsDe, VideoIllisible } = await pVideo();
  let images: Blob[];
  try {
    images = await imagesDeLaVideo(file, (p) => onAvance?.({ etape: "video", p }));
  } catch (e) {
    throw new ErreurApi(e instanceof VideoIllisible ? e.code : "video", 422);
  }
  /*
   * Des lots de six écrans, et de 4 Mo au plus (des écrans sombres ou des photos pèsent plus lourd). La lecture d’un
   * lot dure environ 9 s plus 0,45 s par message : des lots de six, lus cinq à la fois, finissent bien plus tôt que des
   * lots de douze lus trois à la fois (environ 35 s au lieu de 49 pour 45 s de vidéo), pour un peu plus d’images lues
   * deux fois (celles qui recollent deux lots).
   */
  const lots = lotsDe(images, 6, (b) => b.size, ENVOI_IMAGES_MAX);
  const lus: unknown[] = new Array(lots.length);
  let faits = 0;
  onAvance?.({ etape: "lecture", faits, total: lots.length });
  let suivant = 0;
  /* Un lot qui échoue encore après un nouvel essai : les autres s’arrêtent (pas d’appels payés pour rien) */
  const arret = new AbortController();
  const lireLot = async (k: number) => {
    const fd = new FormData();
    lots[k].forEach((b, i) => fd.append("captures", b, `ecran-${k + 1}-${i + 1}.jpg`));
    fd.append("app", app);
    return (await appel<{ lot: unknown }>("/api/captures/lot", { method: "POST", body: fd, signal: arret.signal })).lot;
  };
  const lecteur = async () => {
    while (suivant < lots.length && !arret.signal.aborted) {
      const k = suivant++;
      try {
        lus[k] = await lireLot(k).catch(async (e: unknown) => {
          /* Une erreur passagère (réseau, serveur) : un nouvel essai, le reste n’est pas à refaire */
          if (arret.signal.aborted || (e instanceof ErreurApi && e.status < 500 && e.code !== "erreur")) throw e;
          /* Le réseau : on attend que Safari soit revenu au premier plan (en arrière-plan, l’essai échouerait encore) */
          await (e instanceof ErreurApi ? new Promise((r) => setTimeout(r, 1500)) : quandVisible());
          return lireLot(k);
        });
      } catch (e) {
        arret.abort();
        throw e;
      }
      onAvance?.({ etape: "lecture", faits: ++faits, total: lots.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(LECTEURS, lots.length) }, lecteur));
  /* La clé : un nouvel essai après une coupure retrouve l’histoire déjà créée au lieu d’en faire une seconde */
  const corps = envoi("POST", { app, lots: lus, cle: cleEnvoi() });
  return avecReprise(
    () => appel<{ source: Source; messagesRead: number }>("/api/captures/video", corps),
    () => onAvance?.({ etape: "reprise" }),
  );
}

/* ———— Compte et analyse ———— */

/** Envoie le code à 6 chiffres par email. */
export async function sendLoginCode(email: string): Promise<{ email: string }> {
  return appel<{ email: string }>("/api/auth/code", envoi("POST", { email }));
}

/** Vérifie le code reçu : le compte est créé (sans mot de passe) à la première vérification. */
export async function verifyLoginCode(email: string, code: string): Promise<{ ok: boolean }> {
  return appel<{ ok: boolean }>("/api/auth/verifier", envoi("POST", { email, code }));
}

/**
 * Vide ce que le navigateur garde de BLUSH, après une déconnexion ou « Tout effacer ». Le serveur le lui fait déjà
 * oublier (Clear-Site-Data) : ceci pour un navigateur qui ignorerait l’en-tête.
 */
function oublierLeStockage(): void {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* Un stockage refusé (navigation privée) : rien n’y était gardé */
  }
}

/**
 * Se déconnecter de cet appareil, ou de tous (`partout`), et vider ce que le navigateur garde de BLUSH. À l’écran de
 * repartir ensuite d’un chargement neuf : rien de la session ne reste en mémoire.
 */
export async function seDeconnecter({ partout = false } = {}): Promise<void> {
  await appel<{ ok: true }>("/api/auth/deconnexion", envoi("POST", { partout }));
  oublierLeStockage();
}

export async function startAnalysis(input: { me: string; guess: Guess; goal: Goal; pronom?: Pronom | null; prenom?: string | null }): Promise<void> {
  return void (await appel<{ ok: true }>("/api/analyse", envoi("POST", { me: input.me, guess: input.guess, goal: input.goal, pronom: input.pronom ?? "il", ...(input.prenom ? { prenom: input.prenom } : {}) })));
}

/**
 * L’écran de lecture : la lecture de la conv qu’on suit, lancée depuis « Qui es-tu ? » ou à relancer. Le parcours du
 * navigateur ne part pas : « Qui es-tu ? » est en base (sinon, erreur « qui »), et des réponses d’une autre fois ne
 * lancent pas une autre conv.
 */
export async function resumeAnalysis(): Promise<void> {
  return void (await appel<{ ok: true }>("/api/analyse", envoi("POST", {})));
}

export async function getAnalysisProgress(): Promise<AnalysisProgress> {
  return appel<AnalysisProgress>("/api/analyse");
}

/** Le rapport, avec les droits d’accès. Les chapitres non payés arrivent verrouillés, sans contenu. */
export async function getReport(): Promise<ReportPayload> {
  return appel<ReportPayload>("/api/rapport");
}

/** « Relancer l’écriture » d’un rapport en échec : le rapport tel qu’il repart. */
export async function relancerRapport(): Promise<ReportPayload> {
  return appel<ReportPayload>("/api/rapport", envoi("POST"));
}

/** Le chat en vocal, ou de nouveau à l’écrit (« Repasser à l’écrit »). Sans réponse attendue. */
export function modeVocalChat(actif: boolean): void {
  /* keepalive : « Repasser à l’écrit » part même si la page se recharge ou se ferme juste après */
  void appel<{ modeVocal: boolean }>("/api/chat/vocal", { ...envoi("POST", { actif }), keepalive: true }).catch(() => {});
}

/** Un moment de l’écoute du vocal, pour comparer les deux voix (A/B test). Sans réponse attendue : un échec ne gêne pas l’écoute. */
export function noterEcouteVocal(evenement: EvenementEcoute, position: number): void {
  /* keepalive : l’écoute fermée en quittant la page part quand même */
  void appel<{ ok: true }>("/api/vocal/ecoute", { ...envoi("POST", { evenement, position }), keepalive: true }).catch(() => {});
}

export async function unlock(offer: Exclude<Plan, "gratuit">): Promise<Subscription> {
  return appel<Subscription>("/api/debloquer", envoi("POST", { offre: offer }));
}

/* ———— Question incluse ———— */

/**
 * La question du rapport. Elle passe par le chat ; une erreur (le rapport s’écrit encore, plus de réseau) remonte telle
 * quelle, pour que l’écran garde la question et le dise (voir souciQuestion), au lieu d’en faire une réponse.
 */
export async function askQuestion(question: string): Promise<QuestionAnswer> {
  return enQuestion(question, await chat(envoi("POST", { texte: question })));
}

/* ———— Au quotidien ———— */

export type { BlushAnswer };

/** L’historique du chat : les derniers échanges, ou ceux d’avant `avant`, un échange déjà affiché. */
export async function getChatHistory(avant?: number): Promise<HistoriqueChat> {
  return appel<HistoriqueChat>(`/api/chat${avant ? `?avant=${avant}` : ""}`);
}

/**
 * Le chat de l’accueil : un texte, ou des fichiers (des captures de leur conv ou de son profil, un nouvel export), avec
 * ou sans un mot. `about` : le point d’une réponse de BLUSH que tu creuses (tu l’as glissée vers la droite) ; ta question
 * porte dessus. `suivi` : les bulles à mesure qu’elles arrivent, puis le vocal (voir chat).
 */
export async function sendToBlush(input: { text?: string; files?: File[]; about?: string }, suivi?: SuiviChat): Promise<BlushAnswer> {
  if (input.files?.length) {
    const files = input.files;
    const mot = input.text?.trim();
    return envoyerAuChat(async () => {
      const fd = await avecFichiers(new FormData(), files);
      if (mot) fd.append("texte", mot);
      return chat({ method: "POST", body: fd }, suivi);
    });
  }
  const texte = input.text?.trim();
  if (!texte) return bulle("j’ai rien reçu, renvoie-moi ça");
  return envoyerAuChat(() => chat(envoi("POST", { texte: input.about ? `(à propos de «\u00a0${input.about}\u00a0») ${texte}` : texte }), suivi));
}

/** Un vocal pour BLUSH : transcrit côté serveur, puis lu par BLUSH comme un message. */
export async function sendVoiceToBlush(input: { audio: Blob; seconds: number }, suivi?: SuiviChat): Promise<BlushAnswer> {
  const audio = input.audio;
  return envoyerAuChat(() => {
    const fd = new FormData();
    fd.append("vocal", audio, `vocal.${extensionAudio(audio.type)}`);
    return chat({ method: "POST", body: fd }, suivi);
  });
}

/* Une réponse de BLUSH en une ou quelques bulles (une erreur dite simplement) */
const bulle = (texte: string | readonly string[]): BlushAnswer => ({ kind: "bubbles", bubbles: [texte].flat().map((text) => ({ text })) });

/** Pourquoi une question n’a pas pu partir, dit par BLUSH, en une phrase (src/lib/messages-erreur.ts). */
export const souciQuestion = (e: unknown): string => messageErreur("question", e);

async function envoyerAuChat(envoyer: () => Promise<BlushAnswer>): Promise<BlushAnswer> {
  try {
    return await envoyer();
  } catch (e) {
    /* Le réseau a coupé en route : l’accueil garde les bulles reçues et propose de réessayer */
    if (e instanceof CoupureChat) throw e;
    /* Une erreur : BLUSH la dit dans sa voix (un refus de l’IA, sans parler de bug) */
    return bulle(messageErreur("chat", e));
  }
}

/** La question du rapport, posée au chat : sa première bulle devient le titre, les autres la preuve. */
function enQuestion(question: string, r: BlushAnswer): QuestionAnswer {
  const bulles = r.bubbles;
  const message = bulles.flatMap((b) => b.messages ?? [])[0];
  return {
    question,
    title: bulles[0]?.text ?? "",
    evidenceLabel: "Ce que je vois",
    evidence: bulles.slice(1).map((b) => b.text).join(" · "),
    ...(message ? { message } : {}),
    confidence: "probable",
    limits: r.ask ?? "",
  };
}

/* ———— Sa fiche ———— */

export async function getFiche(): Promise<Fiche> {
  return appel<Fiche>("/api/fiche");
}

export async function updateFiche(facts: FicheFact[]): Promise<Fiche> {
  return appel<Fiche>("/api/fiche", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts }) });
}

/**
 * Des captures ou un export pour sa fiche : BLUSH y trouve des infos sur elle et les range lui-même, dans la bonne rubrique.
 * Ce qu’il savait déjà n’est pas doublé (sa nouvelle source s’ajoute). Rien n’est cherché ailleurs. La réponse part dès
 * la lecture, avec ce qui a été lu (`pending`) ; la mémoire se met à jour ensuite, et la fiche se relit (GET /api/fiche)
 * jusqu’à ce qu’elle ne dise plus `updating`.
 */
export async function addToFiche(files: File[]): Promise<FicheUpdate> {
  try {
    return await appel<FicheUpdate>("/api/fiche", { method: "POST", body: await avecFichiers(new FormData(), files) });
  } catch (e) {
    /* Rien de lisible, ou une erreur : la fiche reste comme avant, et l’écran dit pourquoi (« rien de neuf » n’est pas une erreur) */
    const problem = problemeAjout(e);
    return { fiche: await getFiche(), added: [], ...(problem ? { problem } : {}) };
  }
}

/* ———— Compte ———— */

export async function getAccount(): Promise<Account> {
  return appel<Account>("/api/compte");
}

export async function setPaused(paused: boolean): Promise<void> {
  return void (await appel<{ ok: true }>("/api/compte", envoi("POST", { paused })));
}

/**
 * Le lien public du verdict (/v/<id>) : le verdict seul, le prénom de l’autre masqué, jamais la conv. Toujours le même
 * lien tant qu’on ne le désactive pas.
 */
export async function creerLienPartage(): Promise<{ url: string; verdict: VerdictMontre | null; story?: string }> {
  const { id, verdict, v } = await appel<{ id: string; verdict: VerdictMontre | null; v?: string }>("/api/partage", envoi("POST"));
  const url = `${window.location.origin}/v/${id}`;
  /* `story` : l’image story à sa version (`v`, donnée par le serveur), que le CDN garde : la feuille l’a tout de suite */
  return { url, verdict, story: `${url}/image?format=story${v ? `&v=${encodeURIComponent(v)}` : ""}` };
}

/** Le verdict tel que le montre un lien partagé : le prénom de l’autre en initiale, le tien en clair (« C. t’attend, Hugo »). */
export type VerdictMontre = { emoji: string; title: string };

/** Ce qu’on partage en image : une réponse de BLUSH (son échange), ou la chute d’un chapitre (sa place). */
export type CibleImage = { type: "reponse"; echange: number } | { type: "moment"; chapitre: number; bloc: number };

/** L’image « Partager en image » (story), dessinée par le serveur d’après le contenu du compte. */
export async function imagePartage(cible: CibleImage): Promise<Blob> {
  const r = await fetch("/api/partage/image", { method: "POST", headers: avecConv({ "content-type": "application/json" }), body: JSON.stringify(cible), credentials: "same-origin" });
  if (!r.ok) throw new ErreurApi("image", r.status);
  return r.blob();
}

/** Une image vraiment partagée ou enregistrée (« Partager en image »), pas seulement préparée : comptée côté serveur. */
export function compterImagePartagee(): void {
  void appel<{ ok: true }>("/api/partage/compte", envoi("POST")).catch(() => {});
}

export async function desactiverLienPartage(): Promise<void> {
  await appel("/api/partage", envoi("DELETE"));
}

/** Supprime l’histoire : le rapport, la fiche et les captures. */
export async function deleteStory(): Promise<void> {
  return void (await appel<{ ok: true }>("/api/histoire", envoi("DELETE")));
}

/** Ouvre une autre conv du compte : l’accueil s’ouvre sur elle, maintenant et les fois suivantes (sur cet appareil). */
export function openConv(storyId: string) {
  writeStoryCookie(storyId);
}

/** Tout effacer : le compte et toutes les histoires, et ce que le navigateur garde de BLUSH. */
export async function deleteAccount(): Promise<void> {
  await appel<{ ok: true }>("/api/compte", envoi("DELETE"));
  oublierLeStockage();
}
