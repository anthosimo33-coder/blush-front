/*
 * Couche de service BLUSH, dans le navigateur : le point de contact avec les données, par les routes /api du back-end,
 * sous les types de leur contrat (src/types/api.ts). Les cookies de session sont httpOnly : le navigateur les envoie, il
 * ne les lit pas. Les pages serveur passent par serveur.ts. Un seul appel passe encore à côté, par un fetch direct : le
 * réveil de la base (src/components/shell/Reveil.tsx, une balise dont la réponse n’est pas lue).
 */
import type {
  AnalysisProgress,
  AppKind,
  BlushAnswer,
  BulleChat,
  EvenementChat,
  EvenementEcoute,
  Fiche,
  FicheFact,
  FicheUpdate,
  Goal,
  Guess,
  IssueDuFauxWhop,
  OffreId,
  OffreProposee,
  Pronom,
  QuestionAnswer,
  Source,
} from "@/types";
/* Des types seulement (tests/unit/contrat.test.ts le vérifie) : les schémas du contrat, et zod avec eux, restent au serveur */
import type {
  Account,
  AvanceVideo,
  CibleImage,
  CleFixe,
  CleJson,
  CleRoute,
  EtatAchat,
  HistoriqueChat,
  Moi,
  OffreUniqueMontree,
  PaiementCommence,
  ReponseErreur,
  ReportPayload,
  Routes,
  VerdictMontre,
} from "@/types/api";
import { ErreurApi } from "@/types/erreurs-api";
import { messageErreur, problemeAjout } from "@/lib/messages-erreur";
import { ENVOI_IMAGES_MAX, extensionAudio } from "@/lib/limites";
import { tracer } from "@/lib/tracer";
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
/* Un préchargement raté (le réseau) ne gêne rien : le préparateur se recharge à l’import. Il laisse sa trace (tracer) */
export const prechargerExport = () => void pExport().catch((e: unknown) => tracer("prechargement:export", e));
export const prechargerVideo = () => void pVideo().catch((e: unknown) => tracer("prechargement:video", e));

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

/** Ce qu’un appel ajoute à sa requête : sa recherche (`?avant=…`), keepalive (elle part même si la page se ferme), un signal pour l’arrêter. */
type Options = { recherche?: string; keepalive?: boolean; signal?: AbortSignal };

/** Ce qu’un appel à la route K prend : son corps, quand sa ligne du contrat en reçoit un (un objet JSON, ou un formulaire). */
type ArgumentsDe<K extends CleRoute> = [Routes[K]["corps"]] extends [never] ? [options?: Options & { corps?: never }] : [options: Options & { corps: Routes[K]["corps"] }];

/**
 * La requête d’une route du contrat : sa clé dit la méthode et l’adresse (une adresse sans segment à remplir, CleFixe).
 * Un corps JSON part en JSON, un formulaire tel quel (le navigateur pose son content-type, avec sa frontière).
 */
function requete<K extends CleFixe>(cle: K, options: Options & { corps?: Routes[K]["corps"] } = {}, entetes?: HeadersInit): Promise<Response> {
  /* « POST /api/chat » : la méthode, puis l’adresse */
  const espace = cle.indexOf(" ");
  const method = cle.slice(0, espace);
  const chemin = cle.slice(espace + 1);
  const { corps, recherche, keepalive, signal } = options;
  const h = avecConv(entetes);
  if (corps !== undefined && !(corps instanceof FormData)) h.set("content-type", "application/json");
  return fetch(recherche ? `${chemin}?${recherche}` : chemin, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: h,
    ...(corps === undefined ? {} : { body: corps instanceof FormData ? corps : JSON.stringify(corps) }),
    ...(keepalive ? { keepalive } : {}),
    ...(signal ? { signal } : {}),
  });
}

/**
 * Le corps JSON d’une réponse de la route K : ce que dit sa ligne du contrat, ou `{ erreur }` ; `{}` sans JSON (un
 * serveur qui tombe, une page d’erreur). L’un des deux endroits où le navigateur croit le serveur sur parole, sans le
 * revérifier (zod n’entre pas dans ses pages) : le serveur répond sous le même type (repondre, src/server/http.ts).
 * L’autre : les lignes du flux du chat, lues comme des EvenementChat (src/types), le type sous lequel la route les émet.
 */
const corpsDe = <K extends CleRoute>(r: Response): Promise<Routes[K]["reponse"] & Partial<ReponseErreur>> => r.json().catch(() => ({}));

/** Un appel à une route du contrat qui répond du JSON : sa réponse, ou une ErreurApi avec son code. Un audio, une image : requete. */
async function appel<K extends CleJson & CleFixe>(cle: K, ...[options]: ArgumentsDe<K>): Promise<Routes[K]["reponse"]> {
  const r = await requete(cle, options);
  const corps = await corpsDe<K>(r);
  if (!r.ok) throw new ErreurApi(corps.erreur ?? "erreur", r.status);
  return corps;
}

/**
 * Un message au chat. La réponse arrive en flux (une ligne JSON par événement, src/app/api/chat/route.ts) : les bulles
 * passent à `suivi` à mesure, la promesse se résout avec la réponse validée, sans attendre le vocal, qui arrive ensuite
 * par `suivi` (sans `suivi.vocal`, on cesse de lire : le serveur finit seul). Une erreur avant que BLUSH écrive :
 * ErreurApi, comme les autres appels. Le réseau qui coupe, ou une erreur après des bulles : CoupureChat.
 */
async function chat(corps: Routes["POST /api/chat"]["corps"], suivi: SuiviChat = {}): Promise<BlushAnswer> {
  const recues: BulleChat[] = [];
  let r: Response;
  try {
    r = await requete("POST /api/chat", { corps }, { accept: "application/x-ndjson" });
  } catch {
    throw new CoupureChat(recues);
  }
  /* Une erreur avant que BLUSH écrive, ou un serveur d’avant le flux (pendant une mise en ligne) : la réponse d’un bloc */
  if (!r.ok || !r.body || !r.headers.get("content-type")?.includes("ndjson")) {
    const reponse = await corpsDe<"POST /api/chat">(r);
    if (!r.ok || !("kind" in reponse)) throw new ErreurApi(reponse.erreur ?? "erreur", r.ok ? 500 : r.status);
    return reponse;
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
        if (!e.reponse.vocalEnCours || !suivi.vocal) void lecteur.cancel().catch((err: unknown) => tracer("chat:arret-du-flux", err));
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
          /* Chaque ligne est crue sur parole, comme dans corpsDe : la route les émet sous ce type (enFlux, src/app/api/chat/route.ts) */
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

/** Des captures (réduites dans le navigateur, sous « captures ») ou un export (compressé, sous « export ») dans le formulaire. */
async function avecFichiers(fd: FormData, files: File[]): Promise<FormData> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  /* Chargé hors du try : un préparateur que le réseau n’a pas apporté n’est pas un fichier illisible */
  const px = images.length ? null : await pExport();
  try {
    if (images.length) (await preparerCaptures(images)).forEach((b, k) => fd.append("captures", b, `capture-${k + 1}.jpg`));
    else {
      const [fichier] = files;
      if (!fichier) throw new Error("aucun fichier");
      fd.append("export", await px!.preparerExport(fichier), "export.json.gz");
    }
  } catch (e) {
    /* Un export illisible, ou de plusieurs convs (le chat et la fiche n’en font pas choisir une) : « fichier » */
    tracer(images.length ? "import:captures-illisibles" : "import:export-illisible", e);
    throw new ErreurApi(images.length ? "capture" : "fichier", 422);
  }
  return fd;
}

/* Les lots d’un enregistrement lus en même temps (chacun est un appel au modèle : lotParIp et lotsParCompte les bornent) */
const LECTEURS = 5;

/** La clé d’un envoi : le serveur reconnaît un nouvel essai du même envoi (src/server/captures.ts, reprise). */
const cleEnvoi = () =>
  typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (o) => o.toString(16).padStart(2, "0")).join("");

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
  } catch (e) {
    tracer("import:export-illisible", e);
    throw new ErreurApi("fichier", 422);
  }
  if (pret.type === "un") fd.append("export", pret.paquet, "export.json.gz");
  else {
    const id = choisir ? await choisir(pret.convs) : null;
    if (id == null) throw new ErreurApi("annule", 0);
    fd.append("export", await pret.paquetDe(id), "export.json.gz");
  }
  return (await appel("POST /api/import", { corps: fd })).source;
}

/**
 * Les captures, réduites dans le navigateur, puis lues par BLUSH (une seule fois, pour toutes). `onAvance` ne dit
 * que la reprise, si le réseau coupe pendant la lecture.
 */
export async function uploadScreenshots(
  files: File[],
  opts: { app: AppKind; mode: "first" | "add"; onAvance?: (a: AvanceVideo) => void },
): Promise<{ source: Source; messagesRead: number }> {
  const fd = new FormData();
  try {
    (await preparerCaptures(files)).forEach((b, k) => fd.append("captures", b, `capture-${k + 1}.jpg`));
  } catch (e) {
    tracer("import:captures-illisibles", e);
    throw new ErreurApi("capture", 422);
  }
  fd.append("app", opts.app);
  fd.append("mode", opts.mode);
  fd.append("cle", cleEnvoi());
  return avecReprise(
    () => appel("POST /api/captures", { corps: fd }),
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
    (lots[k] ?? []).forEach((b, i) => fd.append("captures", b, `ecran-${k + 1}-${i + 1}.jpg`));
    fd.append("app", app);
    return (await appel("POST /api/captures/lot", { corps: fd, signal: arret.signal })).lot;
  };
  const lecteur = async () => {
    while (suivant < lots.length && !arret.signal.aborted) {
      const k = suivant++;
      try {
        lus[k] = await lireLot(k).catch(async (e: unknown) => {
          /*
           * Une erreur passagère (réseau, serveur) : un nouvel essai, le reste n’est pas à refaire. Pas le budget de l’IA du
           * jour (« souffle ») : il tient jusqu’à minuit ; ni un refus de l’IA (« refus », malgré son repli) : il reviendrait
           */
          if (arret.signal.aborted || (e instanceof ErreurApi && ((e.status < 500 && e.code !== "erreur") || e.code === "souffle" || e.code === "refus"))) throw e;
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
  const corps = { app, lots: lus, cle: cleEnvoi() };
  return avecReprise(
    () => appel("POST /api/captures/video", { corps }),
    () => onAvance?.({ etape: "reprise" }),
  );
}

/* ———— Compte et analyse ———— */

/** Envoie le code à 6 chiffres par email. */
export async function sendLoginCode(email: string): Promise<{ email: string }> {
  return appel("POST /api/auth/code", { corps: { email } });
}

/** Vérifie le code reçu : le compte est créé (sans mot de passe) à la première vérification. */
export async function verifyLoginCode(email: string, code: string): Promise<{ ok: boolean }> {
  return appel("POST /api/auth/verifier", { corps: { email, code } });
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
  await appel("POST /api/auth/deconnexion", { corps: { partout } });
  oublierLeStockage();
}

/** Qui tu es dans la conv : l’`id` d’un de ses deux participants (Story.participants), que la route attend tel quel. */
const estMoi = (id: string): id is Moi => id === "p0" || id === "p1";

/**
 * « Qui es-tu ? » rempli : la lecture part. `me` vient du parcours (l’`id` d’un participant, une chaîne) : un autre que
 * p0 ou p1 ne part pas, et c’est « Qui es-tu ? » à refaire, comme le serveur le dirait (« qui »).
 */
export async function startAnalysis(input: { me: string; guess: Guess; goal: Goal; pronom?: Pronom | null; prenom?: string | null }): Promise<void> {
  const { me } = input;
  if (!estMoi(me)) throw new ErreurApi("qui", 422);
  return void (await appel("POST /api/analyse", {
    corps: { me, guess: input.guess, goal: input.goal, pronom: input.pronom ?? "il", ...(input.prenom ? { prenom: input.prenom } : {}) },
  }));
}

/**
 * L’écran de lecture : la lecture de la conv qu’on suit, lancée depuis « Qui es-tu ? » ou à relancer. Le parcours du
 * navigateur ne part pas : « Qui es-tu ? » est en base (sinon, erreur « qui »), et des réponses d’une autre fois ne
 * lancent pas une autre conv.
 */
export async function resumeAnalysis(): Promise<void> {
  return void (await appel("POST /api/analyse", { corps: {} }));
}

export async function getAnalysisProgress(): Promise<AnalysisProgress> {
  return appel("GET /api/analyse");
}

/** Le rapport, avec les droits d’accès. Les chapitres non payés arrivent verrouillés, sans contenu. */
export async function getReport(): Promise<ReportPayload> {
  return appel("GET /api/rapport");
}

/** « Relancer l’écriture » d’un rapport en échec : le rapport tel qu’il repart. */
export async function relancerRapport(): Promise<ReportPayload> {
  return appel("POST /api/rapport");
}

/**
 * Le chat en vocal, ou de nouveau à l’écrit (« Repasser à l’écrit »). La promesse dit si le serveur l’a gardé (true) ou
 * pas (le réseau, une erreur : false), et n’échoue jamais : qui n’a pas besoin de le savoir ne l’attend pas.
 */
export async function modeVocalChat(actif: boolean): Promise<boolean> {
  /* keepalive : « Repasser à l’écrit » part même si la page se recharge ou se ferme juste après */
  return appel("POST /api/chat/vocal", { corps: { actif }, keepalive: true }).then(
    (r) => r.modeVocal === actif,
    () => false,
  );
}

/** Un moment de l’écoute du vocal, pour comparer les deux voix (A/B test). Sans réponse attendue : un échec ne gêne pas l’écoute. */
export function noterEcouteVocal(evenement: EvenementEcoute, position: number): void {
  /* keepalive : l’écoute fermée en quittant la page part quand même */
  void appel("POST /api/vocal/ecoute", { corps: { evenement, position }, keepalive: true }).catch((e: unknown) => tracer("vocal:ecoute", e));
}

/* ———— Le paiement (Whop, ou le faux Whop en local) ———— */

/**
 * Commence le paiement d’une offre (pour la conv de la page, quand elle en débloque le rapport) : l’achat, et la page où
 * le payer (`url`, celle de Whop ou du faux Whop), ou null : payé en un geste, il se suit par etatDuPaiement.
 * `renonciation` : la case « je renonce à mon droit de rétractation », cochée (sans elle, 422 « renonciation »).
 */
export async function commencerPaiement(offre: OffreId, renonciation: boolean): Promise<PaiementCommence> {
  return appel("POST /api/paiement", { corps: { offre, renonciation } });
}

/**
 * Où en est cet achat (la page du retour la relit) : `paiement`, le pay_… que Whop a mis dans l’adresse du retour, que
 * le serveur vérifie chez Whop si le webhook tarde. L’adresse a un segment (l’achat) : un appel à part, par fetch.
 */
export async function etatDuPaiement(achat: string, paiement: string | null): Promise<EtatAchat> {
  const recherche = paiement ? `?paiement=${encodeURIComponent(paiement)}` : "";
  const r = await fetch(`/api/paiement/${encodeURIComponent(achat)}${recherche}`, { credentials: "same-origin", cache: "no-store", headers: avecConv() });
  const corps = await corpsDe<"GET /api/paiement/[achat]">(r);
  if (!r.ok) throw new ErreurApi(corps.erreur ?? "erreur", r.status);
  return corps;
}

/** Demande au serveur de montrer cette offre unique (① en fermant la feuille sans payer, ③ sur « C’est débloqué ») : laquelle, jusqu’à quand, ou aucune. */
export async function proposerOffreUnique(offre: OffreProposee): Promise<OffreUniqueMontree> {
  return appel("POST /api/paiement/offre", { corps: { offre } });
}

/**
 * Un bouton du faux Whop (jamais en ligne) : le webhook que Whop enverrait pour cet achat, posté ensuite à
 * /api/paiement/whop comme Whop le ferait (sa signature et la livraison sont les vraies). Rend l’adresse du retour, ou
 * null (un remboursement). Un webhook refusé : ErreurApi.
 */
export async function fauxWhop(achat: string, issue: IssueDuFauxWhop): Promise<string | null> {
  const { webhook, retour } = await appel("POST /api/paiement/factice", { corps: { achat, issue } });
  const r = await fetch("/api/paiement/whop", { method: "POST", cache: "no-store", headers: { ...webhook.entetes, "content-type": "application/json" }, body: webhook.corps });
  if (!r.ok) throw new ErreurApi((await corpsDe<"POST /api/paiement/whop">(r)).erreur ?? "erreur", r.status);
  return retour;
}

/* ———— Ta question ———— */

/**
 * La question du rapport (« Ta question »). Elle passe par le chat, marquée `question` : une réponse comme une autre.
 * Une erreur (le rapport s’écrit encore, plus de réseau) remonte telle quelle, pour que l’écran garde la question et le
 * dise (voir souciQuestion), au lieu d’en faire une réponse.
 */
export async function askQuestion(question: string): Promise<QuestionAnswer> {
  return enQuestion(question, await chat({ texte: question, question: true }));
}

/* ———— Au quotidien ———— */

/** L’historique du chat : les derniers échanges, ou ceux d’avant `avant`, un échange déjà affiché. */
export async function getChatHistory(avant?: number): Promise<HistoriqueChat> {
  return appel("GET /api/chat", avant ? { recherche: `avant=${avant}` } : {});
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
      return chat(fd, suivi);
    });
  }
  const texte = input.text?.trim();
  if (!texte) return bulle("j’ai rien reçu, renvoie-moi ça");
  return envoyerAuChat(() => chat({ texte: input.about ? `(à propos de «\u00a0${input.about}\u00a0») ${texte}` : texte }, suivi));
}

/** Un vocal pour BLUSH : transcrit côté serveur, puis lu par BLUSH comme un message. */
export async function sendVoiceToBlush(input: { audio: Blob; seconds: number }, suivi?: SuiviChat): Promise<BlushAnswer> {
  const audio = input.audio;
  return envoyerAuChat(() => {
    const fd = new FormData();
    fd.append("vocal", audio, `vocal.${extensionAudio(audio.type)}`);
    return chat(fd, suivi);
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
    evidence: bulles
      .slice(1)
      .map((b) => b.text)
      .join(" · "),
    ...(message ? { message } : {}),
    confidence: "probable",
    limits: r.ask ?? "",
  };
}

/* ———— Sa fiche ———— */

export async function getFiche(): Promise<Fiche> {
  return appel("GET /api/fiche");
}

export async function updateFiche(facts: FicheFact[]): Promise<Fiche> {
  return appel("PUT /api/fiche", { corps: { facts } });
}

/**
 * Des captures ou un export pour sa fiche : BLUSH y trouve des infos sur elle et les range lui-même, dans la bonne rubrique.
 * Ce qu’il savait déjà n’est pas doublé (sa nouvelle source s’ajoute). Rien n’est cherché ailleurs. La réponse part dès
 * la lecture, avec ce qui a été lu (`pending`) ; la mémoire se met à jour ensuite, et la fiche se relit (GET /api/fiche)
 * jusqu’à ce qu’elle ne dise plus `updating`.
 */
export async function addToFiche(files: File[]): Promise<FicheUpdate> {
  try {
    return await appel("POST /api/fiche", { corps: await avecFichiers(new FormData(), files) });
  } catch (e) {
    /* Rien de lisible, ou une erreur : la fiche reste comme avant, et l’écran dit pourquoi (« rien de neuf » n’est pas une erreur) */
    const problem = problemeAjout(e);
    return { fiche: await getFiche(), added: [], ...(problem ? { problem } : {}) };
  }
}

/* ———— Compte ———— */

export async function getAccount(): Promise<Account> {
  return appel("GET /api/compte");
}

/**
 * Le lien public du verdict (/v/<id>) : le verdict seul, le prénom de l’autre masqué, jamais la conv. Toujours le même
 * lien tant qu’on ne le désactive pas.
 */
export async function creerLienPartage(): Promise<{ url: string; verdict: VerdictMontre; story: string }> {
  const { id, verdict, v } = await appel("POST /api/partage");
  const url = `${window.location.origin}/v/${id}`;
  /* `story` : l’image story à sa version (`v`, donnée par le serveur), que le CDN garde : la feuille l’a tout de suite */
  return { url, verdict, story: `${url}/image?format=story&v=${encodeURIComponent(v)}` };
}

/** L’image « Partager en image » (story), dessinée par le serveur d’après le contenu du compte. */
export async function imagePartage(cible: CibleImage): Promise<Blob> {
  const r = await requete("POST /api/partage/image", { corps: cible });
  if (!r.ok) throw new ErreurApi("image", r.status);
  return r.blob();
}

/** Une image vraiment partagée ou enregistrée (« Partager en image »), pas seulement préparée : comptée côté serveur. */
export function compterImagePartagee(): void {
  void appel("POST /api/partage/compte").catch((e: unknown) => tracer("partage:compte", e));
}

export async function desactiverLienPartage(): Promise<void> {
  await appel("DELETE /api/partage");
}

/** Supprime l’histoire : le rapport, la fiche et les captures. */
export async function deleteStory(): Promise<void> {
  return void (await appel("DELETE /api/histoire"));
}

/** Ouvre une autre conv du compte : l’accueil s’ouvre sur elle, maintenant et les fois suivantes (sur cet appareil). */
export function openConv(storyId: string) {
  writeStoryCookie(storyId);
}

/** Tout effacer : le compte et toutes les histoires, et ce que le navigateur garde de BLUSH. */
export async function deleteAccount(): Promise<void> {
  await appel("DELETE /api/compte");
  oublierLeStockage();
}

/* ———— Liste d’attente (bêta fermée) ———— */

/** S’inscrire sur la liste d’attente : un mail le confirme. Refusée (réseau, serveur, email) : une erreur. */
export async function rejoindreAttente(email: string): Promise<void> {
  await appel("POST /api/attente", { corps: { email } });
}

/**
 * Se retirer de la liste d’attente, depuis le lien signé de son mail : `retire`, `lien` (il ne mène à aucune
 * inscription, ou plus : 404) ou `echec` (le réseau, le serveur : on peut réessayer).
 */
export async function retirerDeLaListe(lien: { id: string; cle: string }): Promise<"retire" | "lien" | "echec"> {
  try {
    await appel("POST /api/attente/retrait", { corps: lien });
    return "retire";
  } catch (e) {
    return e instanceof ErreurApi && e.status === 404 ? "lien" : "echec";
  }
}
