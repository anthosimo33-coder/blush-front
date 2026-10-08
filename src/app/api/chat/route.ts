import { after } from "next/server";
import { depuisCaptures, depuisExport, ErreurAjout, resumeAjout } from "@/server/ajouts";
import { executerChaine } from "@/server/analyse";
import { imagesDe } from "@/server/captures";
import { historique, repondre } from "@/server/chat";
import { contexteRequete, memoireDe } from "@/server/donnees";
import { alerter } from "@/server/alertes";
import { ErreurTache } from "@/server/erreurs";
import { depuisPaquet, ErreurImport } from "@/server/histoires";
import { corps, erreur, json, memeOrigine } from "@/server/http";
import { TAILLE_VOCAL_MAX, transcrire } from "@/server/ia/transcription";
import { LIMITES, sousLaLimite } from "@/server/limites";

/* La réponse prend 10 à 20 secondes (une minute avec des captures à lire) ; la mise à jour de la mémoire tourne après */
export const maxDuration = 300;
const LONGUEUR_MAX = 4000;

type Envoi = { texte: string; captures: File[]; export: File | null; vocal: File | null };

/** Ce qu’il envoie : du texte (JSON), ou un formulaire avec des captures, un export ou un vocal. */
async function lireEnvoi(req: Request): Promise<Envoi | null> {
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const { texte } = await corps<{ texte: string }>(req);
    return typeof texte === "string" ? { texte: texte.trim(), captures: [], export: null, vocal: null } : null;
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) return null;
  const fichier = (cle: string) => {
    const f = fd.get(cle);
    return f instanceof File ? f : null;
  };
  const texte = fd.get("texte");
  return {
    texte: typeof texte === "string" ? texte.trim() : "",
    captures: fd.getAll("captures").filter((f): f is File => f instanceof File),
    export: fichier("export"),
    vocal: fichier("vocal"),
  };
}

/**
 * Ce qu’il envoie à BLUSH : un texte, des captures (de leur conv ou de son profil), un nouvel export, ou un vocal.
 * Réservé à BLUSH+, une fois la mémoire faite (après le rapport).
 */
export async function POST(req: Request) {
  if (!memeOrigine(req)) return erreur("origine", 403);
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  if (utilisateur.plan !== "blushplus") return erreur("acces", 402);
  if (!story) return erreur("aucune", 404);
  const envoi = await lireEnvoi(req);
  if (!envoi || envoi.texte.length > LONGUEUR_MAX) return erreur("texte", 422);
  const fichiers = envoi.captures.length > 0 || !!envoi.export;
  if (!fichiers && !envoi.vocal && !envoi.texte) return erreur("texte", 422);
  if (!(await sousLaLimite(`chat:${utilisateur.id}`, LIMITES.chatParCompte))) return erreur("trop", 429);
  /* Lire des captures coûte plus qu’un message : une limite à part */
  if (fichiers && !(await sousLaLimite(`ajout:${utilisateur.id}`, LIMITES.ajoutParCompte))) return erreur("trop", 429);
  const memoire = await memoireDe(story.id);
  if (!memoire) return erreur("pas_pret", 409);
  try {
    let r: Awaited<ReturnType<typeof repondre>>;
    if (envoi.vocal) {
      if (!envoi.vocal.size || envoi.vocal.size > TAILLE_VOCAL_MAX) return erreur("vocal", 422);
      const t = await transcrire(envoi.vocal);
      if (t === null) return erreur("vocal_bientot", 503);
      if (!t) return erreur("vocal_vide", 422);
      r = await repondre(story, memoire, `(vocal) ${t}`.slice(0, LONGUEUR_MAX));
    } else if (envoi.captures.length) {
      const ajout = await depuisCaptures(story, memoire, await imagesDe(envoi.captures));
      r = await repondre(story, memoire, envoi.texte, { ajout, affiche: resumeAjout(ajout, "captures", envoi.captures.length) });
    } else if (envoi.export) {
      const ajout = await depuisExport(story, memoire, await depuisPaquet(envoi.export));
      r = await repondre(story, memoire, envoi.texte, { ajout, affiche: resumeAjout(ajout, "export", 1) });
    } else r = await repondre(story, memoire, envoi.texte);
    if (r.majMemoire) after(() => executerChaine(story.id));
    return json(r.reponse);
  } catch (e) {
    if (e instanceof ErreurAjout) return erreur(e.code, 422);
    if (e instanceof ErreurImport) return erreur("fichier", 422);
    if (e instanceof ErreurTache) {
      await alerter(`chat en échec`, [`Histoire ${story.id}`, `Erreur : ${e.message}`]);
      return erreur(e.message, 502);
    }
    throw e;
  }
}

/** L’historique, pour réafficher la conv avec BLUSH. */
export async function GET() {
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  return json(story ? await historique(story.id) : []);
}
