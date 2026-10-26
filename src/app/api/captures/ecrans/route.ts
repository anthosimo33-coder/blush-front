import { LOTS_MAX } from "@/lib/limites";
import { humainRefuse } from "@/server/captcha";
import { cleEnvoi, imagesDe, lecturePermise } from "@/server/captures";
import { garderUnLot, oublierLesEcransDe } from "@/server/ecrans-gardes";
import { erreur, repondre, route } from "@/server/http";
import { envoiDe } from "@/server/imports";
import { consentementImport } from "@/server/juridique";
import { modeDeLaLecture } from "@/server/lecture-partielle";
import { LIMITES } from "@/server/limites";
import { envoiArrete } from "@/server/lots";
import { ecransDansLeBudget, garde, sousLaLimiteDeLIp } from "@/server/requete";
import { tournageDuNavigateur } from "@/server/tournage";

/* Rien n’est lu par le modèle : un lot de quelques Mo écrit en base, chiffré */
export const maxDuration = 30;

/**
 * Un lot d’écrans d’une longue vidéo lue en partie avant l’achat (src/server/lecture-partielle.ts), envoyé tel quel :
 * gardé chiffré (src/server/ecrans-gardes.ts), sans être lu, le temps de l’import (une heure au plus), puis tant que la
 * conv peut être achetée (11 jours au plus après le paywall), lu juste avant le verdict ou effacé sans avoir été lu.
 * `rang` : sa place dans la vidéo (0, le plus ancien) ; `cle` : celle de l’envoi, la même que ses lots lus et leur fin
 * (/api/captures/video, qui le rattache à la conv). Le même lot renvoyé ne s’écrit pas deux fois. Hors de l’A/B
 * (BLUSH_LECTURE_PARTIELLE), en mode tournage, son envoi abandonné (avant l’écriture ou pendant), ou au-delà de ses
 * plafonds : refusé, et le navigateur lit le reste avant l’achat, comme avant.
 */
export const POST = route("POST /api/captures/ecrans", async (req: Request) => {
  const g = await garde(req, { session: "aucune" });
  if (g instanceof Response) return g;
  const fd = await req.formData().catch(() => null);
  const fichiers = (fd?.getAll("captures") ?? []).filter((f): f is File => f instanceof File);
  const images = await imagesDe(fichiers);
  /* Ce sont des messages de leur conv, gardés en base : l’accord de l’import d’abord, puis la bêta et le laissez-passer du CAPTCHA */
  if (!consentementImport(fd?.get("consentement"))) return erreur("consentement");
  const beta = await lecturePermise(null);
  if (beta !== "ok") return erreur(beta);
  const captcha = await humainRefuse("lot");
  if (captcha) return captcha;
  const rang = Number(fd?.get("rang"));
  const envoi = envoiDe(cleEnvoi(fd?.get("cle")));
  if (!Number.isInteger(rang) || rang < 0 || rang >= LOTS_MAX || !envoi) return erreur("fichier");
  if (modeDeLaLecture() !== "ab") return erreur("invalide");
  if (await tournageDuNavigateur()) return erreur("tournage");
  /* Son envoi abandonné (un lot en échec, la page fermée) : ses écrans ont été effacés, un lot en route ne les réécrit pas */
  if (await envoiArrete(envoi)) return erreur("abandon");
  /* Les limites, une fois l’envoi vérifié : le nombre de lots de l’adresse, puis leurs octets du jour (de l’adresse, de tous) */
  if (!(await sousLaLimiteDeLIp(req, "ecrans", LIMITES.ecransParIp))) return erreur("trop");
  const place = await ecransDansLeBudget(
    req,
    fichiers.reduce((n, f) => n + f.size, 0),
  );
  if (!place) return erreur("trop_jour");
  try {
    await garderUnLot(envoi, rang, images);
  } catch (e) {
    await place.rendre();
    throw e;
  }
  /*
   * L’abandon arrivé pendant l’écriture (la page fermée pendant l’envoi de ce lot : son keepalive part en même temps) a
   * pu effacer les écrans de l’envoi avant que celui-ci soit écrit : on regarde encore une fois, et on l’efface aussi
   */
  if (await envoiArrete(envoi)) {
    await oublierLesEcransDe(envoi);
    return erreur("abandon");
  }
  return repondre("POST /api/captures/ecrans", { ok: true });
});
