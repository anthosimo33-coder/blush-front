import { z } from "zod";
import { utilisateurDeSession } from "@/server/auth";
import { humainRefuse } from "@/server/captcha";
import { compterImportVenuDuPartage } from "@/server/compteurs";
import { lireBrouillon, lireSession, lireTournage, poserBrouillon } from "@/server/cookies";
import { erreur, repondre, route } from "@/server/http";
import { storyEtSource } from "@/server/conv-affichee";
import { ajouterUnExport, importer } from "@/server/histoires";
import { depuisFichier, depuisPaquet } from "@/server/import";
import { consentementImport, type Consentement } from "@/server/juridique";
import { LIMITES } from "@/server/limites";
import { garde, octetsDansLeBudget, sousLaLimiteDeLIp } from "@/server/requete";
import { brouillonDExportDeTournage, prenomDeLaCreatrice, tournageDuNavigateur } from "@/server/tournage";
import { noterAuFil } from "@/server/visites";
import { EXPORTS, type ExportApp } from "@/types";

export const maxDuration = 60;

/**
 * Un export (WhatsApp ou Instagram) devient une histoire brouillon. Rien n’est analysé avant l’email.
 * Le navigateur envoie un paquet préparé (« export » : seulement le texte de la conv, compressé) ; un fichier brut
 * (« fichier ») est aussi accepté, sous la limite de taille de Vercel. Le texte est borné avant d’être lu
 * (src/server/import.ts) : un export forgé est refusé, ou coupé, vite. Sans la case de l’import cochée (`consentement`,
 * src/server/juridique.ts), rien n’est lu ni compté : 422 `consentement`.
 * En mode tournage (son cookie), l’écran de l’export n’envoie aucun fichier mais `tournage` (l’appli choisie à l’écran) :
 * le brouillon vient de la conv du lien (src/server/tournage.ts, brouillonDExportDeTournage). Son lien arrêté entre-temps :
 * 409 `tournage`. Sans le cookie, une requête sans fichier reste un 422 `fichier`.
 * `mode=ajout` : un autre export de leur conv, ajouté au brouillon du cookie (une conv en plusieurs morceaux,
 * src/server/morceaux.ts) plutôt qu’une nouvelle conv. Sans brouillon où l’ajouter (ni en mode tournage) : 404 `aucune` ;
 * un export avec quelqu’un d’autre : 422 `autre_conv` (`forcer=1`, « Ajouter quand même » : ajouté quand même) ; rien
 * de nouveau dedans : 422 `rien_de_neuf` ; un morceau de trop : 422 `morceaux`. Ni import du direct, ni import venu
 * d’un partage : c’est la même conv.
 */
export const POST = route("POST /api/import", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const fd = await req.formData().catch(() => null);
  const paquet = fd?.get("export");
  const fichier = fd?.get("fichier");
  const recu = paquet instanceof File ? paquet : fichier instanceof File ? fichier : null;
  /* Un morceau de plus pour la conv qu’on importe : son brouillon, d’abord (rien n’est lu ni compté sans lui) */
  const ajout = fd?.get("mode") === "ajout";
  const brouillon = ajout ? await lireBrouillon() : null;
  if (ajout && (!brouillon || (await lireTournage()))) return erreur("aucune");
  /* Le mode tournage (son cookie) : pas de fichier, l’appli choisie à l’écran (ExportScreen). Sans lui, rien ne change */
  const appliDuTournage = recu || !(await lireTournage()) ? null : AppliDuTournage.safeParse(fd?.get("tournage")).data;
  if (!recu && !appliDuTournage) return erreur("fichier");
  /* L’accord de l’import (les conditions, et que BLUSH lise toute la conv) : avant la limite, rien n’est lu sans lui */
  const consentement = consentementImport(fd?.get("consentement"));
  if (!consentement) return erreur("consentement");
  /* Sans compte, le laissez-passer du CAPTCHA (src/server/captcha.ts), avant toute limite : refusé, il n’use rien */
  const captcha = await humainRefuse("brouillon");
  if (captcha) return captcha;
  /*
   * La limite de l’adresse IP, une fois le formulaire vérifié (un envoi sans fichier, hors du mode tournage, ne compte
   * pas), mais avant de le lire : décompresser et lire un export coûte, un fichier illisible compte aussi
   */
  if (!(await sousLaLimiteDeLIp(req, "import", LIMITES.importParIp))) return erreur("trop");
  /* Rien à lire ni à compter : ni octets, ni import du direct ou venu d’un partage, comme pour des captures en tournage */
  if (!recu) return importerLaConvDuTournage(req, appliDuTournage!, consentement);
  /* Et ses octets (S-02) : la taille reçue, avant de la lire, dans le budget du jour de l’adresse et de tous */
  const place = await octetsDansLeBudget(req, recu.size);
  if (!place) return erreur("trop_jour");
  const lu = async () => (recu === paquet ? depuisPaquet(recu) : depuisFichier(recu));
  if (brouillon) {
    const { id, meta } = await lu()
      .then((e) => ajouterUnExport(brouillon, e, { forcer: fd?.get("forcer") === "1" }))
      .catch(async (e: unknown) => {
        await place.rendre();
        throw e;
      });
    const { story, source } = storyEtSource(id, meta);
    return repondre("POST /api/import", { source, story });
  }
  const lire = async () => importer(await lu(), consentement);
  /* Rien n’entre en base (un fichier illisible, un groupe, une conv courte) : sa place revient à tous, l’adresse garde son compte */
  const { id, meta, secret } = await lire().catch(async (e: unknown) => {
    await place.rendre();
    throw e;
  });
  await poserBrouillon(secret);
  /* Une créatrice qui filme (le mode tournage, src/server/tournage.ts) n’est ni un import du direct, ni un import venu d’un partage */
  if (!(await lireTournage())) {
    await compterImportVenuDuPartage();
    await noterAuFil(req, { genre: "import" });
  }
  const { story, source } = storyEtSource(id, meta);
  return repondre("POST /api/import", { source, story });
});

/** L’appli choisie sur l’écran de l’export, envoyée en mode tournage à la place du fichier. */
const AppliDuTournage = z.enum(EXPORTS);

/**
 * Le mode tournage, sans fichier : le brouillon de la conv du lien ouvert sur ce navigateur, sous le prénom de la
 * créatrice (src/server/tournage.ts). Son lien arrêté depuis l’ouverture de l’écran : 409 `tournage`.
 */
async function importerLaConvDuTournage(req: Request, appli: ExportApp, consentement: Consentement) {
  const tournage = await tournageDuNavigateur();
  if (!tournage) return erreur("tournage");
  const prenom = await prenomDeLaCreatrice(await utilisateurDeSession(await lireSession()));
  const android = /android/i.test(req.headers.get("user-agent") ?? "");
  const { id, meta, secret } = await brouillonDExportDeTournage(tournage, { appli, prenom, android, consentement });
  await poserBrouillon(secret);
  const { story, source } = storyEtSource(id, meta);
  return repondre("POST /api/import", { source, story });
}
