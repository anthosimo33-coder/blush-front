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
  Desinscription,
  EvenementChat,
  EvenementEcoute,
  ExportApp,
  Fiche,
  FicheFact,
  FicheUpdate,
  GenreVendu,
  GesteDeLaRoue,
  Goal,
  Guess,
  IssueDuFauxWhop,
  Jalon,
  NoteDuRapport,
  OffreId,
  OffreProposee,
  Pronom,
  QuestionAnswer,
  RaisonDeLaNote,
  Source,
  Story,
} from "@/types";
/* Des types seulement (tests/unit/contrat.test.ts le vérifie) : les schémas du contrat, et zod avec eux, restent au serveur */
import type {
  Account,
  AvanceVideo,
  AchatDuCompte,
  CibleImage,
  CleFixe,
  CleJson,
  CleRoute,
  EtatAchat,
  FeuilleDuPaiement,
  HistoriqueChat,
  Moi,
  OffreUniqueMontree,
  RoueDuCompte,
  PaiementCommence,
  RaisonDAbandon,
  ReponseErreur,
  ReportPayload,
  Routes,
  VerdictMontre,
} from "@/types/api";
import { ErreurApi } from "@/types/erreurs-api";
import { CASE_RENONCIATION } from "@/contenu/consentements";
import { codeDe, messageErreur, problemeAjout } from "@/lib/messages-erreur";
import { jourDeParis } from "@/lib/jours";
import { ENVOI_IMAGES_MAX, ENVOIS_REPRIS_MAX, extensionAudio, LECTEURS_DE_LOTS, LOTS_MIN_PARTIELLE } from "@/lib/limites";
import { ENTETE_CAPTCHA } from "@/lib/captcha";
import { cleDuSiteCaptcha } from "@/lib/publique";
import { retenirSecrets } from "@/lib/secrets";
import { tracer } from "@/lib/tracer";
import { preparerCaptures } from "./preparer-captures";
import type { ConvInstagram } from "./preparer-export";
import { ENTETE_CONV, lireConvDeLaPage, writeStoryCookie } from "./session";
import { jetonCaptcha } from "./captcha";

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
/**
 * Ce que le chat suit d’une réponse à mesure : ses bulles, puis son vocal (null : la voix a échoué, elle reste écrite ;
 * `bulles` : ce qu’elle a alors coûté en fin de compte, et ce qu’il reste).
 */
export type SuiviChat = { bulles?: (recues: BulleChat[]) => void; vocal?: (vocal: NonNullable<BlushAnswer["vocal"]> | null, bulles?: BlushAnswer["bulles"]) => void };

/** Les en-têtes d’un appel, avec la conv de la page (voir ENTETE_CONV). */
function avecConv(entetes?: HeadersInit): Headers {
  const h = new Headers(entetes);
  const conv = lireConvDeLaPage();
  if (conv) h.set(ENTETE_CONV, conv);
  return h;
}

/**
 * Ce qu’un appel ajoute à sa requête : sa recherche (`?avant=…`), keepalive (elle part même si la page se ferme), un signal
 * pour l’arrêter, des en-têtes (le jeton du CAPTCHA), et sa priorité (« low » : un envoi qui peut attendre, derrière les
 * autres, là où le navigateur la connaît).
 */
type Options = { recherche?: string; keepalive?: boolean; signal?: AbortSignal; entetes?: HeadersInit; priorite?: RequestPriority };

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
  const { corps, recherche, keepalive, signal, priorite } = options;
  const h = avecConv(entetes);
  new Headers(options.entetes).forEach((valeur, nom) => h.set(nom, valeur));
  if (corps !== undefined && !(corps instanceof FormData)) h.set("content-type", "application/json");
  return fetch(recherche ? `${chemin}?${recherche}` : chemin, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: h,
    ...(corps === undefined ? {} : { body: corps instanceof FormData ? corps : JSON.stringify(corps) }),
    ...(keepalive ? { keepalive } : {}),
    ...(signal ? { signal } : {}),
    ...(priorite ? { priority: priorite } : {}),
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
  retenirLesPrenoms(corps);
  return corps;
}

/*
 * Une conv tout juste importée (l’export, des captures) : ses prénoms, que l’enregistrement des visites masque partout
 * dès l’écran d’après (src/lib/secrets.ts), avant même qu’une page de la conv ne les donne
 */
function retenirLesPrenoms(corps: unknown): void {
  if (!corps || typeof corps !== "object" || !("story" in corps)) return;
  const story = corps.story;
  if (story && typeof story === "object" && "participants" in story && Array.isArray(story.participants))
    retenirSecrets(story.participants.map((p: unknown) => (p && typeof p === "object" && "name" in p && typeof p.name === "string" ? p.name : null)));
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
        suivi.vocal?.(e.vocal, e.bulles);
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

/**
 * La clé d’un envoi : le serveur reconnaît un nouvel essai du même envoi (src/server/captures.ts, reprise ; le chat,
 * « Réessayer » : le même message n’est jamais débité deux fois).
 */
export const cleEnvoi = () =>
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

/** L’en-tête du jeton du CAPTCHA, s’il y en a un (sinon rien : le serveur dira « captcha » s’il en voulait un). */
const enteteCaptcha = (jeton: string | null): HeadersInit => (jeton ? { [ENTETE_CAPTCHA]: jeton } : {});

/**
 * Le laissez-passer du CAPTCHA, avant un import (src/server/captcha.ts) : le jeton du widget de l’écran, échangé contre un
 * cookie. Lancé pendant que le navigateur prépare ses fichiers, attendu juste avant de les envoyer : il ne retarde rien.
 * Un compte connecté le reçoit sans rien prouver. Sans clé publique, il n’y a rien à faire. Rejette avec l’ErreurApi du
 * serveur (« captcha », « trop »).
 */
function laissezPasser(): Promise<void> {
  if (!cleDuSiteCaptcha()) return Promise.resolve();
  const demande = (async () => {
    await appel("POST /api/captcha", { entetes: enteteCaptcha(await jetonCaptcha()) });
  })();
  /* Attendu plus tard : un échec avant (le fichier illisible) ne doit pas devenir une promesse rejetée sans personne */
  demande.catch(() => {});
  return demande;
}

/**
 * Un export : lu et réduit dans le navigateur. Un export Instagram complet : `choisir` fait choisir la conv
 * (null : on a renoncé, erreur « annule »), et seule celle-là part. `onAvance` : où en est le tour de ses convs (de 0 à 1).
 * `consentement` : la version de la case de l’import cochée (src/contenu/consentements.ts), sans laquelle le serveur ne lit rien.
 */
export async function uploadExport(
  file: File,
  consentement: string,
  choisir?: (convs: ConvInstagram[]) => Promise<string | null>,
  onAvance?: (part: number) => void,
  { ajout = false }: { ajout?: boolean } = {},
): Promise<Routes["POST /api/import"]["reponse"]> {
  const passe = laissezPasser();
  const fd = new FormData();
  fd.append("consentement", consentement);
  /* Un morceau de plus pour la conv qu’on importe (src/server/morceaux.ts), pas une nouvelle conv */
  if (ajout) fd.append("mode", "ajout");
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
  await passe;
  return appel("POST /api/import", { corps: fd });
}

/**
 * Le mode tournage (src/server/tournage.ts) : l’export sans fichier. Le serveur prend la conv du lien ouvert sur ce
 * navigateur, sous l’appli choisie à l’écran (`app`) ; rien ne part d’ici que l’accord de l’import. Rejette comme un
 * export (« tournage » : son lien a été arrêté entre-temps).
 */
export async function importerLaConvDuTournage(app: ExportApp, consentement: string): Promise<Source> {
  const passe = laissezPasser();
  const fd = new FormData();
  fd.append("consentement", consentement);
  fd.append("tournage", app);
  await passe;
  return (await appel("POST /api/import", { corps: fd })).source;
}

/** La conv qu’on importe (GET /api/histoire, celle du parcours) : ses participants et ses morceaux. */
export const lireLHistoire = () => appel("GET /api/histoire");

/**
 * Les captures, réduites dans le navigateur, puis lues par BLUSH (une seule fois, pour toutes). `onAvance` ne dit
 * que la reprise, si le réseau coupe pendant la lecture. `consentement` : la version de la case de l’import cochée.
 */
export async function uploadScreenshots(
  files: File[],
  opts: { app: AppKind; mode: "first" | "add"; consentement: string; onAvance?: (a: AvanceVideo) => void },
): Promise<{ source: Source; messagesRead: number; story: Story }> {
  const passe = laissezPasser();
  const fd = new FormData();
  try {
    (await preparerCaptures(files)).forEach((b, k) => fd.append("captures", b, `capture-${k + 1}.jpg`));
  } catch (e) {
    tracer("import:captures-illisibles", e);
    throw new ErreurApi("capture", 422);
  }
  fd.append("app", opts.app);
  fd.append("mode", opts.mode);
  fd.append("consentement", opts.consentement);
  fd.append("cle", cleEnvoi());
  await passe;
  return avecReprise(
    () => appel("POST /api/captures", { corps: fd }),
    () => opts.onAvance?.({ etape: "reprise" }),
  );
}

/**
 * Un enregistrement d’écran de la conv (sa première importation) : le navigateur en tire les écrans de la conv (la vidéo
 * ne part pas), BLUSH les lit par lots (cinq à la fois), puis les lectures sont rassemblées en une histoire brouillon,
 * comme des captures. `consentement` : la version de la case de l’import cochée, envoyée avec chaque lot et avec leur fin.
 * Un lot n’est jamais payé deux fois (src/server/lots.ts) : un lot déjà lu dans cet onglet ne repart pas
 * (preparer-video.ts, lotDejaLu ; la fin donne au serveur les clés des envois repris, pour la mesure des imports), le
 * premier lot à lire part d’abord (`ordre` : les autres attendent, sur le serveur, que sa réponse commence, pour ne pas
 * écrire chacun le texte système en cache), et un envoi abandonné le dit au serveur : un lot en échec pour de bon arrête
 * les lots encore en cours ; la page fermée n’arrête que ceux qui n’ont pas commencé chez le prestataire.
 * Une longue vidéo (plus de lots qu’un tour de lecteurs) peut ne se lire qu’en partie avant l’achat
 * (src/server/lecture-partielle.ts, le plan que donne le serveur) : ses lots les plus récents d’abord, un tour à la fois,
 * jusqu’à ce que le serveur dise « assez » ; ses lots plus anciens partent tels quels pendant la lecture, gardés chiffrés
 * et lus après le paiement (POST /api/captures/ecrans). S’ils ne partent pas, ils se lisent avant, comme avant. Toute
 * vidéo de deux lots ou plus, longue ou non, donne aussi à sa fin de quoi rejouer la règle visée (la mesure, sans rien
 * changer à sa lecture).
 */
export async function uploadRecording(
  file: File,
  app: AppKind,
  consentement: string,
  onAvance?: (a: AvanceVideo) => void,
  { ajout = false }: { ajout?: boolean } = {},
): Promise<{ source: Source; messagesRead: number; story: Story }> {
  const passe = laissezPasser();
  const { imagesDeLaVideo, lotsDe, tailleDesLots, VideoIllisible, empreinteDuLot, lotDejaLu, garderLeLot } = await pVideo();
  let video: Awaited<ReturnType<typeof imagesDeLaVideo>>;
  try {
    video = await imagesDeLaVideo(file, (p) => onAvance?.({ etape: "video", p }));
  } catch (e) {
    throw new ErreurApi(e instanceof VideoIllisible ? e.code : "video", 422);
  }
  const { images, sensSur } = video;
  /*
   * Des lots de douze écrans (tailleDesLots : toutes les vidéos, les moins chers), découpés en partant de la fin (lotsDe :
   * le plus récent plein, celui que la lecture partielle lit d’abord ; le reste dans le plus ancien), et de 4 Mo au plus
   * (des écrans sombres ou des photos pèsent plus lourd). Avec Sonnet, un lot de douze se lit en 25 à 30 s, un lot de six
   * en 15 s environ (21 octobre) : une courte vidéo, en lots de six à douze jusqu’au 27 octobre, se lit jusqu’à 15 s plus
   * lentement, pour moins cher.
   */
  const lots = lotsDe(images, tailleDesLots(images.length), (b) => b.size, ENVOI_IMAGES_MAX);
  /*
   * La clé de l’envoi, la même pour ses lots et pour leur fin : le serveur y range leur coût (la mesure des imports), y
   * reconnaît le premier lot et l’abandon, et un nouvel essai de la fin après une coupure retrouve l’histoire déjà créée
   */
  const cle = cleEnvoi();
  const jour = jourDeParis();
  /* Un lot après l’autre : une longue vidéo pèse des dizaines de Mo d’images, un téléphone ne les relit pas toutes d’un coup */
  const empreintes: (string | null)[] = [];
  for (const l of lots) empreintes.push(await empreinteDuLot(l, app, jour));
  const lus: unknown[] = new Array(lots.length);
  /* Les lots déjà lus dans cet onglet (un nouvel essai de la même vidéo) ne repartent pas ; leurs envois d’avant, pour la mesure */
  const repris = new Set<string>();
  lots.forEach((_, k) => {
    const deja = lotDejaLu(empreintes[k] ?? null);
    if (deja === undefined) return;
    lus[k] = deja.lot;
    if (deja.cle !== cle) repris.add(deja.cle);
  });
  /* Le même laissez-passer pour tous les lots, puis pour les rassembler */
  await passe;
  /*
   * Une vidéo de deux lots ou plus d’un premier import : l’empreinte de son lot le plus récent, sans le jour (« ab » à sa
   * place : la même vidéo renvoyée le lendemain tombe dans la même moitié de l’A/B), que sa fin envoie au serveur
   * (`partiel`) avec ce qu’il faut pour rejouer la règle d’arrêt sur ses lots (en « mesure », le contrefactuel de toute
   * vidéo de deux lots ou plus : src/server/lecture-partielle.ts). Seule une longue vidéo demande d’abord comment la lire
   * avant l’achat (en entier, ou d’abord sa partie la plus récente : l’A/B), et sa lecture attend la réponse ; une plus
   * courte n’est jamais dans l’A/B, elle se lit en entier sans rien demander. Sans réponse (le réseau), en entier, comme
   * avant
   */
  const recent = lots.at(-1);
  const empreinteVideo = !ajout && lots.length >= LOTS_MIN_PARTIELLE && recent ? await empreinteDuLot(recent, app, "ab") : null;
  const longue = !!empreinteVideo && lots.length > LECTEURS_DE_LOTS;
  const partielle =
    longue &&
    (await appel("POST /api/captures/video/plan", { corps: { lots: lots.length, video: empreinteVideo, sensSur, cle, consentement } }).then(
      (r) => r.lecture === "partielle",
      () => false,
    ));

  /*
   * Où en est la lecture : les lots lus, sur tous ceux de la vidéo. Une longue vidéo lue en partie aussi : un total qui
   * grandissait à chaque tour (« 5 sur 5 », puis « 5 sur 10 ») faisait croire que la lecture repartait de zéro, juste
   * avant le paywall ; quand le serveur dit « assez », la jauge passe d’un coup à la fin
   */
  let faits = 0;
  const total = lots.length;
  /*
   * Un lot qui échoue encore après un nouvel essai (ou la page fermée, plus bas) : les autres s’arrêtent (pas d’appels
   * payés pour rien), ici et chez le serveur
   */
  const arret = new AbortController();
  const abandonner = (raison: RaisonDAbandon) => {
    if (arret.signal.aborted) return;
    arret.abort();
    void appel("POST /api/captures/lot/abandon", { corps: { cle, raison }, keepalive: true }).catch(() => {});
  };
  /*
   * Le premier lot à lire part d’abord : celui du premier tour, s’il a d’autres lots avec lui (seul, il n’a personne à
   * prévenir) ; les tours suivants partent en « suite », sans attendre (il a déjà commencé)
   */
  let premier: number | null | undefined;
  const ordre = (k: number) => (premier == null ? null : k === premier ? "premier" : "suite");
  const lireLot = async (k: number) => {
    const fd = new FormData();
    (lots[k] ?? []).forEach((b, i) => fd.append("captures", b, `ecran-${k + 1}-${i + 1}.jpg`));
    fd.append("app", app);
    fd.append("consentement", consentement);
    fd.append("cle", cle);
    const o = ordre(k);
    if (o) fd.append("ordre", o);
    return (await appel("POST /api/captures/lot", { corps: fd, signal: arret.signal })).lot;
  };
  /* La première lecture rendue (ses images parties, et sans doute celles des lots partis avec elle) : les lots à garder peuvent partir */
  let direPremiereRendue = () => {};
  const premiereRendue = new Promise<void>((ok) => (direPremiereRendue = ok));
  /* Les lots `tour` (dans l’ordre où ils partent) qui ne sont pas encore lus, LECTEURS_DE_LOTS à la fois */
  const lire = async (tour: number[]) => {
    const aLire = tour.filter((k) => lus[k] === undefined);
    faits += tour.length - aLire.length;
    if (premier === undefined) premier = aLire.length < 2 ? null : aLire[0]!;
    onAvance?.({ etape: "lecture", faits, total });
    let suivant = 0;
    const lecteur = async () => {
      while (suivant < aLire.length && !arret.signal.aborted) {
        /* suivant < aLire.length : le lot existe */
        const k = aLire[suivant++]!;
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
          abandonner("echec");
          throw e;
        }
        garderLeLot(empreintes[k] ?? null, { lot: lus[k], cle });
        direPremiereRendue();
        onAvance?.({ etape: "lecture", faits: ++faits, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(LECTEURS_DE_LOTS, aLire.length) }, lecteur));
  };
  /*
   * La fin : les lots lus (à partir de `restants`, ceux d’avant n’étant pas lus), rassemblés par le serveur. Une vidéo de
   * deux lots ou plus dit ce qu’il en reste (rien, lue en entier) : pour une longue lue en partie, le serveur répond
   * alors quoi en faire (SuiteDeLaVideo), ou crée la conv
   */
  const fin = (restants: number, gardes = false) =>
    avecReprise(
      () =>
        appel("POST /api/captures/video", {
          corps: {
            app,
            lots: lus.slice(restants),
            cle,
            consentement,
            ...(repris.size ? { repris: [...repris].slice(0, ENVOIS_REPRIS_MAX) } : {}),
            ...(ajout ? { mode: "ajout" as const } : {}),
            ...(empreinteVideo ? { partiel: { restants, ecrans: images.length, video: empreinteVideo, sensSur, ...(gardes ? { gardes: true as const } : {}) } } : {}),
          },
        }),
      () => onAvance?.({ etape: "reprise" }),
    );
  /*
   * Les lots plus anciens d’une longue vidéo lue en partie, envoyés tels quels pour après le paiement
   * (POST /api/captures/ecrans) pendant que BLUSH lit les plus récents : pendant ses 25 à 30 s de lecture, le réseau est
   * libre. Seulement une fois la première lecture rendue (ou le tour fini) : sur un réseau montant faible, ils
   * partageaient la bande avec les images du premier tour, encore en route (la priorité basse ne règle pas l’envoi du
   * corps d’une requête). Un à la fois, en priorité basse, du plus ancien au plus récent : les plus anciens sont ceux
   * qu’aucun tour ne lira. `borne` : les lots qu’on garde encore, ceux qu’aucun tour de lecture ne prendra (le serveur
   * qui dit d’en lire plus la fait descendre ; les lots envoyés au-delà, il les efface à l’import). Un envoi qui échoue
   * arrête la file : ces lots se liront avant l’achat, comme avant.
   */
  let borne = 0;
  let envoyes = 0;
  /* La lecture finie, la personne n’attend plus que ces envois : on lui dit où ils en sont */
  let enAttente = false;
  const envoyerUnLot = (k: number) => {
    const fd = new FormData();
    (lots[k] ?? []).forEach((b, i) => fd.append("captures", b, `ecran-${k + 1}-${i + 1}.jpg`));
    fd.append("app", app);
    fd.append("consentement", consentement);
    fd.append("cle", cle);
    fd.append("rang", String(k));
    return avecReprise(() => appel("POST /api/captures/ecrans", { corps: fd, signal: arret.signal, priorite: "low" }));
  };
  const garderEnFond = async (): Promise<boolean> => {
    try {
      while (envoyes < borne && !arret.signal.aborted) {
        await envoyerUnLot(envoyes);
        envoyes++;
        if (enAttente) onAvance?.({ etape: "envoi", faits: Math.min(envoyes, borne), total: borne });
      }
      return !arret.signal.aborted;
    } catch (e) {
      tracer("import:ecrans-non-gardes", e);
      return false;
    }
  };
  let fileDEnvoi: Promise<boolean> = Promise.resolve(true);

  /*
   * La page fermée pour de bon pendant la lecture (l’onglet fermé, une autre adresse, un rechargement) : ses lots qui
   * n’ont pas encore commencé chez le prestataire ne partent plus ; ceux en cours vont au bout (leur entrée est payée),
   * et la page rechargée qui renvoie la même vidéo les retrouve sur le serveur. Pas une page mise de côté par le
   * navigateur (persisted : elle peut revenir, et ses lots reprendre), ni Safari passé en arrière-plan (pagehide ne vient
   * pas) : tous leurs lots continuent
   */
  const enPartant = (e: PageTransitionEvent) => {
    if (!e.persisted) abandonner("page");
  };
  window.addEventListener("pagehide", enPartant);
  try {
    if (partielle) {
      /* lus[debut…] sont lus ; un tour de plus lit les `tour` lots juste avant, du plus récent au plus ancien */
      let debut = lots.length;
      let tour = LECTEURS_DE_LOTS;
      while (debut > 0) {
        const de = Math.max(0, debut - tour);
        const lecture = lire(Array.from({ length: debut - de }, (_, i) => debut - 1 - i));
        /* Le premier tour parti, ses lots à lire en route : les plus anciens partent derrière eux, pour être gardés */
        if (debut === lots.length && de > 0) {
          borne = de;
          const finDuTour = lecture.then(
            () => {},
            () => {},
          );
          fileDEnvoi = Promise.race([premiereRendue, finDuTour]).then(garderEnFond);
        }
        await lecture;
        debut = de;
        if (!debut) break;
        const r = await fin(debut);
        if (!("suite" in r)) return r;
        if (r.suite === "garder") {
          /*
           * Assez lu : la jauge de lecture va au bout. Ses lots plus anciens tous partis (on attend les derniers, en disant
           * où ils en sont), puis la fin, qui crée la conv avec eux ; un envoi raté, ou un lot que le serveur n’a plus : on
           * les lit, comme avant
           */
          const lusAvant = faits;
          faits = total;
          onAvance?.({ etape: "lecture", faits, total });
          borne = Math.min(borne, debut);
          if (envoyes < borne) {
            enAttente = true;
            onAvance?.({ etape: "envoi", faits: envoyes, total: borne });
          }
          const tousPartis = (await fileDEnvoi) || envoyes >= debut;
          enAttente = false;
          const creee = tousPartis ? await fin(debut, true) : null;
          if (creee && !("suite" in creee)) return creee;
          /* Ils se lisent finalement avant l’achat : la jauge reprend où elle en était */
          faits = lusAvant;
          borne = 0;
          tour = debut;
        } else {
          tour = Math.max(1, r.lots);
          /* Ceux que ce tour lira ne sont plus à garder */
          borne = Math.min(borne, Math.max(0, debut - tour));
        }
      }
    } else await lire(lots.map((_, k) => k));
    /* Lue en entier : plus rien à garder ; l’envoi en route finit avant la fin (qui efface ceux que la conv ne prend pas) */
    borne = 0;
    await fileDEnvoi;
  } catch (e) {
    /* Une erreur en route (un lot, la question au serveur) : plus rien ne part, et le serveur oublie les écrans déjà envoyés */
    if (partielle) abandonner("echec");
    throw e;
  } finally {
    window.removeEventListener("pagehide", enPartant);
  }
  const r = await fin(0);
  if ("suite" in r) throw new ErreurApi("erreur", 500);
  return r;
}

/* ———— Compte et analyse ———— */

/** Envoie le code à 6 chiffres par email. */
export async function sendLoginCode(email: string): Promise<{ email: string }> {
  /* Le jeton du CAPTCHA de l’écran, un par demande (src/server/captcha.ts) */
  return appel("POST /api/auth/code", { corps: { email }, entetes: enteteCaptcha(await jetonCaptcha()) });
}

/** Le dernier code demandé dans ce navigateur est-il revenu (son mail a rebondi : l’adresse n’existe pas) ? */
export async function codeRevenu(): Promise<boolean> {
  return (await appel("GET /api/auth/code")).revenu;
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
export async function startAnalysis(input: { me: string; guess: Guess; goal: Goal; pronom?: Pronom | null; prenom?: string | null; prenomAutre?: string | null }): Promise<void> {
  const { me } = input;
  if (!estMoi(me)) throw new ErreurApi("qui", 422);
  return void (await appel("POST /api/analyse", {
    corps: {
      me,
      guess: input.guess,
      goal: input.goal,
      pronom: input.pronom ?? "il",
      ...(input.prenom ? { prenom: input.prenom } : {}),
      ...(input.prenomAutre ? { prenomAutre: input.prenomAutre } : {}),
    },
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

/* ———— Les visiteurs, et /admin en direct ———— */

/** Le signe d’un onglet ouvert (src/lib/presence.ts). Sans réponse attendue : un signe raté ne se voit pas, il y en aura un autre. */
export function faireSigne(corps: Routes["POST /api/presence"]["corps"]): void {
  /* keepalive : le signe d’un changement d’écran part même si la page se ferme juste après */
  void appel("POST /api/presence", { corps, keepalive: true }).catch((e: unknown) => tracer("presence", e));
}

/** Un jalon du tunnel (src/lib/jalons.ts). Sans réponse attendue : un jalon raté ne se voit pas. */
export function envoyerJalon(jalon: Jalon, appli?: AppKind): void {
  /* keepalive : le jalon d’un bouton qui change de page (ou la quitte, vers Whop) part quand même */
  void appel("POST /api/jalon", { corps: { jalon, ...(appli ? { appli } : {}) }, keepalive: true }).catch((e: unknown) => tracer("jalon", e));
}

/** Une erreur du navigateur, pour l’équipe (src/lib/sentinelle.tsx). keepalive : elle part même si la page se ferme ; ratée, rien ne se dit (une erreur de plus ne s’annonce pas). */
export function signalerErreurDuNavigateur(corps: Routes["POST /api/navigateur/erreur"]["corps"]): void {
  void appel("POST /api/navigateur/erreur", { corps, keepalive: true }).catch(() => {});
}

/** Les mesures de vitesse d’une page quittée (src/lib/sentinelle.tsx). keepalive : elles partent pendant que la page se ferme. */
export function envoyerMesuresDuNavigateur(corps: Routes["POST /api/navigateur/mesures"]["corps"]): void {
  void appel("POST /api/navigateur/mesures", { corps, keepalive: true }).catch(() => {});
}

/** /admin en direct, à cet instant (réservé à l’équipe). */
export const lireLeDirect = (signal?: AbortSignal) => appel("GET /api/admin/direct", signal ? { signal } : {});

/** Le repère du mode tournage (src/components/shell/RepereTournage.tsx) : le nom du lien, pour l’équipe ; null pour tous les autres. */
export const lireLeRepereDuTournage = (signal: AbortSignal) => appel("GET /api/tournage/repere", { signal });

/* ———— Le paiement (Whop, ou le faux Whop en local) ———— */

/**
 * Commence le paiement d’une offre (pour la conv de la page, quand elle en débloque le rapport) : l’achat, et la page où
 * le payer (`url`, celle de Whop ou du faux Whop), ou null : payé en un geste, il se suit par etatDuPaiement.
 * `renonciation` : la renonciation au délai de rétractation, que le geste de payer donne ; le serveur en reçoit la version (celle
 * du texte que l’onglet montre), et la garde avec l’achat. Sans elle, ou une version qui n’est plus la sienne (le texte
 * a changé depuis l’ouverture de la page) : 422 « renonciation ».
 */
export async function commencerPaiement(
  offre: OffreId,
  renonciation: boolean,
  { jeton, geste, vente }: { jeton?: string; geste?: boolean; vente?: GenreVendu } = {},
): Promise<PaiementCommence> {
  return appel("POST /api/paiement", {
    corps: {
      offre,
      ...(renonciation ? { renonciation: CASE_RENONCIATION.version } : {}),
      ...(jeton ? { jeton } : {}),
      ...(geste ? { geste: true as const } : {}),
      ...(vente ? { vente } : {}),
    },
  });
}

/**
 * Ce que la feuille du paiement doit savoir avant de s’ouvrir : comment payer dans la feuille (les Elements de Whop, le
 * faux Whop, ou rien), et ce que le compte a d’avance (un rapport d’avance, le −50 % gardé).
 */
export async function lireFeuilleDuPaiement(): Promise<FeuilleDuPaiement> {
  return appel("GET /api/paiement/feuille");
}

/**
 * Débloque le rapport de la conv de la page avec le rapport d’avance du compte : rien à payer, et le geste donne la
 * renonciation au délai de rétractation, comme un paiement. Rend l’achat du rapport d’avance (« C’est débloqué » le dit).
 */
export async function utiliserAvance(): Promise<{ achat: string }> {
  return appel("POST /api/paiement/avance", { corps: { renonciation: CASE_RENONCIATION.version } });
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

/**
 * La roue du paywall : la tourner (le serveur tire la case), ou n’en pas vouloir. Une fois par compte : rejouée, la même
 * réponse revient.
 */
export async function jouerLaRoue(geste: GesteDeLaRoue): Promise<RoueDuCompte> {
  return appel("POST /api/roue", { corps: { geste } });
}

/**
 * La note du rapport de la conv ouverte (POST /api/rapport/note) : la note, la raison d’un « Bof », ou un avis. Au mieux :
 * une note perdue (le réseau, un rapport pas débloqué) ne se dit pas à l’écran.
 */
export async function noterLeRapport(corps: { note: NoteDuRapport } | { raison: RaisonDeLaNote } | { avis: { prenom: string; phrase: string } }): Promise<void> {
  try {
    await appel("POST /api/rapport/note", { corps });
  } catch {
    /* Rien à dire : la note est un plus */
  }
}

/**
 * Demande au serveur de montrer cette offre unique (① en fermant la feuille sans payer, ③ sur « C’est débloqué », pour
 * l’achat qui vient d’être payé : `achat`) : laquelle, jusqu’à quand, ou aucune.
 */
export async function proposerOffreUnique(offre: OffreProposee, achat?: string): Promise<OffreUniqueMontree> {
  return appel("POST /api/paiement/offre", { corps: { offre, ...(achat ? { achat } : {}) } });
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
 * dise (voir souciQuestion), au lieu d’en faire une réponse. `cle` : la clé de la question (cleEnvoi), la même quand
 * l’écran la renvoie après une erreur : comme un message du chat, elle n’est jamais débitée deux fois (voir sendToBlush).
 */
export async function askQuestion(question: string, cle?: string): Promise<QuestionAnswer> {
  return enQuestion(question, await chat({ texte: question, question: true, ...(cle ? { cle } : {}) }));
}

/* ———— Au quotidien ———— */

/** L’historique du chat : les derniers échanges, ou ceux d’avant `avant`, un échange déjà affiché. */
export async function getChatHistory(avant?: number): Promise<HistoriqueChat> {
  return appel("GET /api/chat", avant ? { recherche: `avant=${avant}` } : {});
}

/**
 * Le chat de l’accueil : un texte, ou des fichiers (des captures de leur conv ou de son profil, un nouvel export), avec
 * ou sans un mot. `about` : le point d’une réponse de BLUSH que tu creuses (tu l’as glissée vers la droite) ; ta question
 * porte dessus. `suivi` : les bulles à mesure qu’elles arrivent, puis le vocal (voir chat). `cle` : la clé du message
 * (cleEnvoi), prise une fois par message et renvoyée telle quelle par « Réessayer » : le serveur ne le débite jamais deux
 * fois, et rend la réponse déjà écrite.
 */
export async function sendToBlush(input: { text?: string; files?: File[]; about?: string; cle?: string }, suivi?: SuiviChat): Promise<BlushAnswer> {
  const { cle } = input;
  if (input.files?.length) {
    const files = input.files;
    const mot = input.text?.trim();
    return envoyerAuChat(async () => {
      const fd = await avecFichiers(new FormData(), files);
      if (mot) fd.append("texte", mot);
      if (cle) fd.append("cle", cle);
      return chat(fd, suivi);
    });
  }
  const texte = input.text?.trim();
  if (!texte) return bulle("j’ai rien reçu, renvoie-moi ça");
  return envoyerAuChat(() => chat({ texte: input.about ? `(à propos de «\u00a0${input.about}\u00a0») ${texte}` : texte, ...(cle ? { cle } : {}) }, suivi));
}

/** Un vocal pour BLUSH : transcrit côté serveur, puis lu par BLUSH comme un message. `cle` : voir sendToBlush. */
export async function sendVoiceToBlush(input: { audio: Blob; seconds: number; cle?: string }, suivi?: SuiviChat): Promise<BlushAnswer> {
  const { audio, cle } = input;
  return envoyerAuChat(() => {
    const fd = new FormData();
    fd.append("vocal", audio, `vocal.${extensionAudio(audio.type)}`);
    if (cle) fd.append("cle", cle);
    return chat(fd, suivi);
  });
}

/**
 * Lire une réponse verrouillée (écrite à 0 bulle, BlushAnswer.verrouillee), une fois rechargé : payée par la recharge
 * (sans débit), ou son coût débité, elle revient en entier. ErreurApi « bulles » : le solde ne la couvre toujours pas.
 */
export async function lireLaReponse(message: number): Promise<BlushAnswer> {
  return appel("POST /api/chat/debloquer", { corps: { message } });
}

/** Un geste sur une carte d’achat du chat (src/server/vente.ts) : son bouton touché, ou « Pas maintenant ». */
export async function noterUnGesteDeVente(evenement: "touchee" | "refusee", genre: GenreVendu): Promise<void> {
  await appel("POST /api/chat/vente", { corps: { evenement, genre } });
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
    /* Une erreur : BLUSH la dit dans sa voix (un refus de l’IA, sans parler de bug) ; plus de bulles, l’accueil ouvre la recharge */
    return { ...bulle(messageErreur("chat", e)), ...(codeDe(e) === "bulles" ? { plusDeBulles: true as const } : {}) };
  }
}

/**
 * La question du rapport, posée au chat : sa première bulle devient le titre, les autres la preuve. Ce qu’elle a coûté et
 * ce qu’il reste la suivent (le reçu sous la réponse, et le compteur).
 */
function enQuestion(question: string, r: BlushAnswer): QuestionAnswer {
  /*
   * Plus de bulles : la réponse est écrite mais verrouillée, sans rien d’elle ici ; elle attend dans le chat.
   * TODO(produit): textes nouveaux, sans maquette (le prototype des bulles n’a pas « Ta question » à 0 bulle)
   */
  if (r.verrouillee)
    return {
      question,
      title: "Ta réponse est prête",
      evidenceLabel: "Plus de bulles",
      evidence: "Recharge tes bulles pour la lire\u00a0: elle t’attend dans ton chat avec BLUSH.",
      confidence: "probable",
      limits: "",
      verrouillee: true,
    };
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
    ...(r.bulles ? { bulles: r.bulles } : {}),
  };
}

/* ———— Sa fiche ———— */

export async function getFiche(): Promise<Fiche> {
  return appel("GET /api/fiche");
}

export async function updateFiche(facts: FicheFact[]): Promise<Fiche> {
  return appel("PUT /api/fiche", { corps: { facts } });
}

/** Le pronom de l’autre, corrigé sur sa fiche : la conv ne le disait pas, ou pas bien. */
export async function updatePronom(pronom: Pronom): Promise<Fiche> {
  return appel("PUT /api/fiche/pronom", { corps: { pronom } });
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

/** « Tes achats » (Mon compte) : les achats payés du compte, même repris ensuite, du plus récent au plus ancien. */
export async function getAchats(): Promise<AchatDuCompte[]> {
  return (await appel("GET /api/achats")).achats;
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

/**
 * Le rapport en PDF, dessiné par le serveur d’après ce que ce compte peut lire, en fichier prêt à partager ou à
 * enregistrer. `moi` : qui est toi pour l’écran (le parcours de l’onglet), quand le serveur ne le sait pas.
 */
export async function pdfDuRapport(moi?: string | null): Promise<File> {
  const r = await requete("GET /api/rapport/pdf", moi ? { recherche: new URLSearchParams({ moi }).toString() } : {});
  if (!r.ok) throw new ErreurApi(r.status === 429 ? "trop" : "erreur", r.status);
  return new File([await r.blob()], "rapport-blush.pdf", { type: "application/pdf" });
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

/* ———— Les relances par mail ———— */

/**
 * Couper un genre de mails de son compte (les offres, les conseils, ou tout), depuis le lien signé d’un mail : `coupees`,
 * `lien` (il ne mène à rien : 404) ou `echec` (le réseau, le serveur : on peut réessayer).
 */
export async function couperLesRelances(lien: { id: string; cle: string; quoi: Desinscription }): Promise<"coupees" | "lien" | "echec"> {
  try {
    await appel("POST /api/desinscription", { corps: lien });
    return "coupees";
  } catch (e) {
    return e instanceof ErreurApi && e.status === 404 ? "lien" : "echec";
  }
}

/* ———— L’équipe (/admin) ———— */

/** Un geste de l’équipe depuis /admin (POST /api/admin) : ce qu’il a fait, ou une ErreurApi. */
export const gesteDeLEquipe = (geste: Routes["POST /api/admin"]["corps"]) => appel("POST /api/admin", { corps: geste });

/** La page de consentement (/admin/connecter) autorise Claude à lire /admin (POST /api/oauth/autoriser) : où renvoyer le navigateur, ou une ErreurApi. */
export const autoriserLaConnexion = (demande: Routes["POST /api/oauth/autoriser"]["corps"]) => appel("POST /api/oauth/autoriser", { corps: demande });
