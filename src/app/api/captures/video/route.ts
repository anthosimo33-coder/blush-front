import { z } from "zod";
import type { TexteCaptures } from "@prompts/lib/captures";
import { Sortie01 } from "@prompts/lib/schemas";
import { LECTEURS_DE_LOTS, LOTS_MAX } from "@/lib/limites";
import { AppliCaptures } from "@/server/appli-captures";
import { humainRefuse } from "@/server/captcha";
import { cleEnvoi, enTexte, lecturePermise, uneSeuleLecture, unSeulAjout } from "@/server/captures";
import { compterImportVenuDuPartage } from "@/server/compteurs";
import { lireBrouillon, poserBrouillon } from "@/server/cookies";
import { oublierLesEcransDe, rattacherLaSuite, SuiteIncomplete, type SuiteAGarder } from "@/server/ecrans-gardes";
import { ErreurPublique } from "@/server/erreurs";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { envoiDe, noterAjout, noterImport } from "@/server/imports";
import { storyEtSource } from "@/server/conv-affichee";
import { ajouterDesCaptures, importerCaptures, morceauDejaAjoute } from "@/server/histoires";
import { journalErreur } from "@/server/journal";
import { consentementImport } from "@/server/juridique";
import { brasDeLaVideo, decider, estLongue, leContrefactuel, modeDeLaLecture, planDeLecture } from "@/server/lecture-partielle";
import { LIMITES } from "@/server/limites";
import { garde, octetsDansLeBudget, sousLaLimiteDeLIp } from "@/server/requete";
import { aujourdhuiParis } from "@/server/temps";
import { brouillonDeTournage, tournageDuNavigateur } from "@/server/tournage";
import { fusionnerLots } from "@/server/video";
import { noterAuFil } from "@/server/visites";
import { ROUTES, type SuiteDeLaVideo } from "@/types/api";

/* Rassembler les lots ne fait appel à aucun modèle : quelques dixièmes de seconde, et jamais plus de 30 s */
export const maxDuration = 30;

/*
 * Les lots viennent du navigateur (relus par le prompt 01, mais renvoyés par lui) : on borne ce qu’un envoi peut
 * contenir, pour qu’un envoi forgé ne coûte pas des secondes de calcul ni des Mo en base. Un enregistrement réel en
 * est loin (quinze lots de douze écrans au plus, un peu plus quand des écrans lourds les font couper).
 */
const MESSAGES_MAX = 3000;
/* Un lot : jusqu’à douze écrans d’une vingtaine de messages, qui se recouvrent (ECRANS_PAR_LOT, src/lib/limites.ts) */
const MESSAGES_PAR_LOT_MAX = 600;
const TEXTE_MAX = 4000;
/* Tous les messages ensemble : un enregistrement réel en compte une centaine de Ko */
const TEXTE_TOTAL_MAX = 2_000_000;
/*
 * Chaque chaîne a sa borne. Le nom de l’autre (`autre`) est recopié devant chacun de ses messages : sans borne, un envoi
 * de quelques centaines de Ko devenait des centaines de Mo en mémoire.
 */
const Lot = Sortie01.extend({
  appli: z.string().max(40).nullable(),
  autre: z.string().max(80).nullable(),
  captures: Sortie01.shape.captures.max(40),
  profil: z.array(z.string().max(1000)).max(50),
  doutes: z.array(z.string().max(1000)).max(50),
});
/* Le corps du contrat (src/types/api.ts, sa `cle` comprise), resserré : une appli de captures, des lots bornés */
const Envoi = ROUTES["POST /api/captures/video"].corps.extend({ app: AppliCaptures, lots: z.array(Lot).min(1).max(LOTS_MAX) }).refine(({ lots }) => {
  const blocs = lots.flatMap((l) => l.blocs);
  const messages = blocs.flatMap((b) => b.messages);
  const total = messages.reduce((n, m) => n + m.texte.length, 0);
  const reperes = blocs.every((b) => !b.repere || (b.repere.date.length <= 20 && (b.repere.heure?.length ?? 0) <= 20));
  const parLot = lots.every((l) => l.blocs.reduce((n, b) => n + b.messages.length, 0) <= MESSAGES_PAR_LOT_MAX);
  return (
    blocs.length <= 600 &&
    messages.length <= MESSAGES_MAX &&
    parLot &&
    total <= TEXTE_TOTAL_MAX &&
    reperes &&
    messages.every((m) => m.texte.length <= TEXTE_MAX && (m.reaction?.length ?? 0) <= 50)
  );
});

/**
 * Un enregistrement d’écran, lu lot par lot (/api/captures/lot) : les lectures sont rassemblées (sans les messages
 * vus deux fois au bord de deux lots), puis la conv devient une histoire brouillon, comme des captures. `mode: "ajout"` :
 * un morceau de plus pour la conv qu’on importe, comme des captures ajoutées (POST /api/captures, `mode=add`).
 * Une longue vidéo lue en partie (`partiel`, src/server/lecture-partielle.ts) : tant que ses lots plus anciens ne sont
 * ni lus ni envoyés, la route dit seulement quoi en faire (SuiteDeLaVideo : en lire encore, ou les garder), sans rien
 * créer ; renvoyée avec `gardes`, la conv naît avec sa suite (src/server/ecrans-gardes.ts), lue après le paiement.
 */
export const POST = route("POST /api/captures/video", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  /* Les lots viennent de /api/captures/lot : la même règle (bêta fermée, un compte), sans plafond de modèle ici */
  const permis = await lecturePermise(null);
  if (permis !== "ok") return erreur(permis);
  const envoi = await lireCorps(req, Envoi);
  if (!envoi) return erreur("fichier");
  /* L’accord de l’import, celui de ses lots (sans lui, 422 `consentement`) : gardé avec l’histoire */
  const consentement = consentementImport(envoi.consentement);
  if (!consentement) return erreur("consentement");
  const { app, lots, cle, partiel, repris = [] } = envoi;
  /*
   * Une question sur une longue vidéo (ses lots plus anciens ni lus ni gardés) ne crée rien : elle passe comme un lot, le
   * laissez-passer et la limite de l’adresse des lots, sans user ceux d’un import
   */
  const question = envoi.mode !== "ajout" && !!partiel?.restants && !partiel.gardes;
  /* Sans compte, le laissez-passer du CAPTCHA qui a servi aux lots (src/server/captcha.ts), avant toute limite */
  const captcha = await humainRefuse(question ? "lot" : "brouillon");
  if (captcha) return captcha;
  /* La limite de l’adresse IP, une fois l’envoi vérifié : un envoi invalide ne compte pas */
  if (!(await (question ? sousLaLimiteDeLIp(req, "lot", LIMITES.lotParIp) : sousLaLimiteDeLIp(req, "import", LIMITES.importParIp)))) return erreur("trop");
  /* Le mode tournage (src/server/tournage.ts) : ses lots n’ont rien lu, le brouillon reprend la conv de tournage */
  const tournage = await tournageDuNavigateur();
  /*
   * Ses octets dans le budget du jour de l’adresse et de tous (S-02), comme /api/import : ce texte entre en base tel
   * quel. Comptés une seule fois par envoi (un nouvel essai qui retrouve le brouillon, ou le morceau, ne recompte rien).
   */
  const dansLeBudget = async (t: TexteCaptures) => {
    const place = await octetsDansLeBudget(req, Buffer.byteLength(JSON.stringify(t)));
    if (!place) throw new ErreurPublique("trop_jour");
    return place;
  };
  /*
   * La mesure des imports (src/server/imports.ts) : l’empreinte de l’envoi, celle sous laquelle ses lots ont rangé leur
   * coût, ce qu’ils ont lu (les écrans, sans l’image partagée par deux lots voisins, et les lots), et les envois d’avant
   * dont l’onglet a repris des lots déjà lus (leur coût passe sous cet import ; une clé qui n’en a pas la forme est ignorée)
   */
  const mesure = (f: ReturnType<typeof fusionnerLots>) => ({
    ecrans: f.captures.length,
    lots: lots.length,
    envoi: envoiDe(cleEnvoi(cle)),
    repris: repris.flatMap((c) => envoiDe(cleEnvoi(c)) ?? []),
  });
  /* Un morceau de plus (pas en mode tournage : sa conv n’est pas lue) */
  if (envoi.mode === "ajout") {
    const brouillon = await lireBrouillon();
    if (!brouillon || tournage) return erreur("aucune");
    const c = cleEnvoi(cle);
    const lu = await unSeulAjout(
      c,
      brouillon,
      async () => {
        const f = fusionnerLots(lots, app);
        const t = enTexte(f);
        const place = await dansLeBudget(t);
        const { id, meta } = await ajouterDesCaptures(brouillon, { appli: app, t, cle: c }).catch(async (e: unknown) => {
          await place.rendre();
          throw e;
        });
        await noterAjout(id, mesure(f));
        return { id, meta, secret: brouillon, messages: t.messages };
      },
      () => (c ? morceauDejaAjoute(brouillon, c) : Promise.resolve(null)),
    );
    const { story, source } = storyEtSource(lu.id, lu.meta);
    return repondre("POST /api/captures/video", { source, messagesRead: lu.messages, story });
  }
  /*
   * Une longue vidéo (src/server/lecture-partielle.ts) : sa moitié de l’A/B, et, dans la moitié partielle, ce qu’il reste
   * à faire de ses lots plus anciens. Hors de la moitié partielle (l’interrupteur coupé entre-temps, le mode tournage),
   * ils se lisent tous, comme avant.
   */
  const jour = aujourdhuiParis().iso;
  const e = envoiDe(cleEnvoi(cle));
  const video = partiel ? { lots: lots.length + partiel.restants, video: partiel.video, sensSur: partiel.sensSur, ajout: false, tournage: !!tournage } : null;
  const bras = video ? brasDeLaVideo(video) : null;
  const suite = (s: SuiteDeLaVideo) => repondre("POST /api/captures/video", s);
  let aGarder: SuiteAGarder | null = null;
  if (partiel?.restants) {
    const lire = { suite: "lire", lots: partiel.restants } as const;
    if (!video || !e || planDeLecture(video) !== "partielle") return suite(lire);
    if (partiel.gardes) {
      /*
       * Ses lots plus anciens envoyés (/api/captures/ecrans) : la conv naît avec eux, tous là (sinon SuiteIncomplete, plus
       * bas : le navigateur les lit). Pas de compte d’avance : un nouvel essai de cette fin, après une coupure, doit
       * retrouver la conv déjà née (uneSeuleLecture), dont ils sont maintenant la suite
       */
      aGarder = { envoi: e, recents: lots, appli: app, jour, ecrans: partiel.ecrans, lots: partiel.restants };
    } else {
      const d = decider(lots, { restants: partiel.restants, ecrans: partiel.ecrans, appli: app, jour, sensSur: partiel.sensSur });
      if (d === "tout") return suite(lire);
      return suite(d === "encore" ? { suite: "lire", lots: Math.min(LECTEURS_DE_LOTS, partiel.restants) } : { suite: "garder", lots: partiel.restants });
    }
  }
  /*
   * Une longue vidéo lue en entier, quand la lecture partielle se mesure (« mesure », ou la moitié entière de l’A/B) : ce
   * qu’elle aurait changé au haut du paywall (le contrefactuel, sans modèle). Une erreur n’arrête jamais l’import
   */
  const contrefactuel = () => {
    if (!partiel || !video || tournage || aGarder || bras === "partielle" || modeDeLaLecture() === "0" || !estLongue(video.lots)) return null;
    try {
      return leContrefactuel(lots, { ecrans: partiel.ecrans, appli: app, jour, sensSur: partiel.sensSur });
    } catch (err) {
      journalErreur("contrefactuel de la lecture partielle non calculé", err);
      return null;
    }
  };
  const creer = uneSeuleLecture(cleEnvoi(cle), async (secret) => {
    if (tournage) return brouillonDeTournage(tournage, { appli: app, captures: lots.length, secret, consentement });
    const f = fusionnerLots(lots, app);
    const t = enTexte(f);
    const place = await dansLeBudget(t);
    /* Rien n’entre en base (ni la suite : SuiteIncomplete) : sa place revient à tous, l’adresse garde son compte */
    const avec = aGarder;
    const { id, meta } = await importerCaptures({ appli: app, t, secret, consentement, ...(avec ? { suite: (tx, storyId) => rattacherLaSuite(tx, storyId, avec) } : {}) }).catch(
      async (err: unknown) => {
        await place.rendre();
        throw err;
      },
    );
    /* Une fois par histoire créée : un nouvel essai qui la retrouve ne compte pas l’import deux fois (ni sa mesure) */
    await noterImport({ storyId: id, type: "video", appli: app, ...mesure(f), bras, lotsGardes: avec?.lots ?? 0, contrefactuel: contrefactuel() });
    await compterImportVenuDuPartage();
    await noterAuFil(req, { genre: "import" });
    return { id, meta, secret, messages: t.messages };
  });
  /* Un lot gardé effacé entre-temps (ou jamais arrivé) : rien n’est créé, le navigateur lit le reste */
  const lu = await creer.catch((err: unknown) => {
    if (err instanceof SuiteIncomplete && partiel) return null;
    throw err;
  });
  if (!lu) return suite({ suite: "lire", lots: partiel?.restants ?? 0 });
  /*
   * Une longue vidéo : les écrans de son envoi qu’elle n’a pas pris (envoyés pendant la lecture, puis lus quand même
   * avant l’achat, ou l’interrupteur coupé entre-temps) s’effacent tout de suite, au lieu d’attendre leur heure
   */
  if (e && partiel) await oublierLesEcransDe(e);
  await poserBrouillon(lu.secret);
  const { story, source } = storyEtSource(lu.id, lu.meta);
  return repondre("POST /api/captures/video", { source, messagesRead: lu.messages, story });
});
