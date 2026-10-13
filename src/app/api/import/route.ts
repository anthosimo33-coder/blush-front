import { humainRefuse } from "@/server/captcha";
import { compterImportVenuDuPartage } from "@/server/compteurs";
import { poserBrouillon } from "@/server/cookies";
import { erreur, repondre, route } from "@/server/http";
import { storyEtSource } from "@/server/conv-affichee";
import { importer } from "@/server/histoires";
import { depuisFichier, depuisPaquet } from "@/server/import";
import { consentementImport } from "@/server/juridique";
import { LIMITES } from "@/server/limites";
import { garde, octetsDansLeBudget, sousLaLimiteDeLIp } from "@/server/requete";
import { noterAuFil } from "@/server/visites";

export const maxDuration = 60;

/**
 * Un export (WhatsApp ou Instagram) devient une histoire brouillon. Rien n’est analysé avant l’email.
 * Le navigateur envoie un paquet préparé (« export » : seulement le texte de la conv, compressé) ; un fichier brut
 * (« fichier ») est aussi accepté, sous la limite de taille de Vercel. Le texte est borné avant d’être lu
 * (src/server/import.ts) : un export forgé est refusé, ou coupé, vite. Sans la case de l’import cochée (`consentement`,
 * src/server/juridique.ts), rien n’est lu ni compté : 422 `consentement`.
 */
export const POST = route("POST /api/import", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const fd = await req.formData().catch(() => null);
  const paquet = fd?.get("export");
  const fichier = fd?.get("fichier");
  const recu = paquet instanceof File ? paquet : fichier instanceof File ? fichier : null;
  if (!recu) return erreur("fichier");
  /* L’accord de l’import (18 ans, les conditions, ce que la conv dit d’intime) : avant la limite, rien n’est lu sans lui */
  const consentement = consentementImport(fd?.get("consentement"));
  if (!consentement) return erreur("consentement");
  /* Sans compte, le laissez-passer du CAPTCHA (src/server/captcha.ts), avant toute limite : refusé, il n’use rien */
  const captcha = await humainRefuse("brouillon");
  if (captcha) return captcha;
  /*
   * La limite de l’adresse IP, une fois le formulaire vérifié (un envoi sans fichier ne compte pas), mais avant de le
   * lire : décompresser et lire un export coûte, un fichier illisible compte aussi
   */
  if (!(await sousLaLimiteDeLIp(req, "import", LIMITES.importParIp))) return erreur("trop");
  /* Et ses octets (S-02) : la taille reçue, avant de la lire, dans le budget du jour de l’adresse et de tous */
  const place = await octetsDansLeBudget(req, recu.size);
  if (!place) return erreur("trop_jour");
  const lire = async () => importer(recu === paquet ? await depuisPaquet(recu) : await depuisFichier(recu), consentement);
  /* Rien n’entre en base (un fichier illisible, un groupe, une conv courte) : sa place revient à tous, l’adresse garde son compte */
  const { id, meta, secret } = await lire().catch(async (e: unknown) => {
    await place.rendre();
    throw e;
  });
  await poserBrouillon(secret);
  await compterImportVenuDuPartage();
  await noterAuFil(req, { genre: "import" });
  const { story, source } = storyEtSource(id, meta);
  return repondre("POST /api/import", { source, story });
});
