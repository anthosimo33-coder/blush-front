import { z } from "zod";
import type { TexteCaptures } from "@prompts/lib/captures";
import { Sortie01 } from "@prompts/lib/schemas";
import { AppliCaptures } from "@/server/appli-captures";
import { humainRefuse } from "@/server/captcha";
import { cleEnvoi, enTexte, lecturePermise, uneSeuleLecture, unSeulAjout } from "@/server/captures";
import { compterImportVenuDuPartage } from "@/server/compteurs";
import { lireBrouillon, poserBrouillon } from "@/server/cookies";
import { ErreurPublique } from "@/server/erreurs";
import { erreur, lireCorps, repondre, route } from "@/server/http";
import { storyEtSource } from "@/server/conv-affichee";
import { ajouterDesCaptures, importerCaptures, morceauDejaAjoute } from "@/server/histoires";
import { consentementImport } from "@/server/juridique";
import { LIMITES } from "@/server/limites";
import { garde, octetsDansLeBudget, sousLaLimiteDeLIp } from "@/server/requete";
import { brouillonDeTournage, tournageDuNavigateur } from "@/server/tournage";
import { fusionnerLots } from "@/server/video";
import { noterAuFil } from "@/server/visites";
import { ROUTES } from "@/types/api";

/* Rassembler les lots ne fait appel à aucun modèle : quelques dixièmes de seconde, et jamais plus de 30 s */
export const maxDuration = 30;

/*
 * Les lots viennent du navigateur (relus par le prompt 01, mais renvoyés par lui) : on borne ce qu’un envoi peut
 * contenir, pour qu’un envoi forgé ne coûte pas des secondes de calcul ni des Mo en base. Un enregistrement réel en
 * est loin (trente-deux lots de six écrans au plus, un peu plus quand des écrans lourds les font couper).
 */
const MESSAGES_MAX = 3000;
/* Un lot : six écrans d’une vingtaine de messages, qui se recouvrent */
const MESSAGES_PAR_LOT_MAX = 300;
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
const Envoi = ROUTES["POST /api/captures/video"].corps.extend({ app: AppliCaptures, lots: z.array(Lot).min(1).max(40) }).refine(({ lots }) => {
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
  /* Sans compte, le laissez-passer du CAPTCHA qui a servi aux lots (src/server/captcha.ts), avant toute limite */
  const captcha = await humainRefuse("brouillon");
  if (captcha) return captcha;
  /* La limite de l’adresse IP, une fois l’envoi vérifié : un envoi invalide ne compte pas */
  if (!(await sousLaLimiteDeLIp(req, "import", LIMITES.importParIp))) return erreur("trop");
  const { app, lots, cle } = envoi;
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
  /* Un morceau de plus (pas en mode tournage : sa conv n’est pas lue) */
  if (envoi.mode === "ajout") {
    const brouillon = await lireBrouillon();
    if (!brouillon || tournage) return erreur("aucune");
    const c = cleEnvoi(cle);
    const lu = await unSeulAjout(
      c,
      brouillon,
      async () => {
        const t = enTexte(fusionnerLots(lots, app));
        const place = await dansLeBudget(t);
        const { id, meta } = await ajouterDesCaptures(brouillon, { appli: app, t, cle: c }).catch(async (e: unknown) => {
          await place.rendre();
          throw e;
        });
        return { id, meta, secret: brouillon, messages: t.messages };
      },
      () => (c ? morceauDejaAjoute(brouillon, c) : Promise.resolve(null)),
    );
    const { story, source } = storyEtSource(lu.id, lu.meta);
    return repondre("POST /api/captures/video", { source, messagesRead: lu.messages, story });
  }
  const lu = await uneSeuleLecture(cleEnvoi(cle), async (secret) => {
    if (tournage) return brouillonDeTournage(tournage, { appli: app, captures: lots.length, secret, consentement });
    const t = enTexte(fusionnerLots(lots, app));
    const place = await dansLeBudget(t);
    /* Rien n’entre en base : sa place revient à tous, l’adresse garde son compte */
    const { id, meta } = await importerCaptures({ appli: app, t, secret, consentement }).catch(async (e: unknown) => {
      await place.rendre();
      throw e;
    });
    /* Une fois par histoire créée : un nouvel essai qui la retrouve ne compte pas l’import deux fois */
    await compterImportVenuDuPartage();
    await noterAuFil(req, { genre: "import" });
    return { id, meta, secret, messages: t.messages };
  });
  await poserBrouillon(lu.secret);
  const { story, source } = storyEtSource(lu.id, lu.meta);
  return repondre("POST /api/captures/video", { source, messagesRead: lu.messages, story });
});
