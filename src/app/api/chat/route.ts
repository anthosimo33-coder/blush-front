import { after } from "next/server";
import type { Ajout } from "@prompts/lib/ajouts";
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
import { avecEcheance } from "@/server/echeance";
import type { EvenementChat } from "@/types";

/*
 * La réponse prend 10 à 20 secondes (une minute avec des captures à lire) : elle part en flux, bulle par bulle, et son
 * vocal après elle ; la mise à jour de la mémoire tourne une fois tout parti
 */
export const maxDuration = 300;
const LONGUEUR_MAX = 4000;
/* La réponse en flux, quand le navigateur la demande (Accept) */
const NDJSON = "application/x-ndjson";

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
 * La réponse en flux, une ligne JSON par événement (EvenementChat, src/types) : les bulles à mesure que BLUSH écrit, la
 * réponse validée, puis son vocal. Le travail ne dépend pas de qui lit : page quittée ou réseau coupé en route, la
 * réponse s’écrit et s’enregistre quand même (after garde la fonction en vie), l’historique la rendra. La réponse part
 * avec le premier événement : une erreur d’avant (un refus du modèle, une sortie illisible) est rejetée ici, et répond
 * d’un bloc avec son statut, comme avant le flux ; rien n’a été montré. Une erreur après devient le dernier événement.
 * La mise à jour de la mémoire tourne une fois la réponse partie.
 */
async function enFlux(storyId: string, travail: (emettre: (e: EvenementChat) => void) => Promise<{ majMemoire: boolean }>): Promise<Response> {
  const encodeur = new TextEncoder();
  let sortie: ReadableStreamDefaultController<Uint8Array> | null = null;
  const flux = new ReadableStream<Uint8Array>({
    start: (c) => void (sortie = c),
    /* Plus personne ne lit : on n’écrit plus, le travail continue */
    cancel: () => void (sortie = null),
  });
  /* Le premier événement ouvre la réponse (vrai), ou l’erreur arrive avant lui (faux) */
  let ouvrir!: (ouverte: boolean) => void;
  const ouverte = new Promise<boolean>((r) => (ouvrir = r));
  let parti = false;
  let echec: unknown;
  const emettre = (e: EvenementChat) => {
    parti = true;
    ouvrir(true);
    try {
      sortie?.enqueue(encodeur.encode(`${JSON.stringify(e)}\n`));
    } catch {
      sortie = null;
    }
  };
  const fermer = () => {
    try {
      sortie?.close();
    } catch {
      /* déjà fermé */
    }
    sortie = null;
  };
  const fin = travail(emettre).then(
    async (r) => {
      ouvrir(true);
      fermer();
      if (r.majMemoire) await executerChaine(storyId);
    },
    async (e: unknown) => {
      /* Rien n’est parti : la route répond l’erreur elle-même (voir traiter) */
      if (!parti) {
        echec = e;
        return ouvrir(false);
      }
      emettre({ erreur: e instanceof ErreurTache ? e.message : "erreur" });
      fermer();
      if (e instanceof ErreurTache) await alerter(`chat en échec`, [`Histoire ${storyId}`, `Erreur : ${e.message}`]);
      else console.error(e);
    },
  );
  /*
   * La fonction reste en vie jusqu’au bout du travail, même si la réponse est partie (ou que plus personne ne la lit).
   * Une erreur de la mise à jour de la mémoire est signalée par after, pas comme une promesse oubliée en attendant
   */
  fin.catch(() => {});
  after(() => fin);
  if (!(await ouverte)) {
    fermer();
    throw echec;
  }
  return new Response(flux, { headers: { "content-type": `${NDJSON}; charset=utf-8`, "cache-control": "no-store" } });
}

/**
 * Ce qu’il envoie à BLUSH : un texte, des captures (de leur conv ou de son profil), un nouvel export, ou un vocal.
 * Réservé à BLUSH+, une fois la mémoire faite (après le rapport). Ce qui se lit avant que BLUSH écrive (le vocal
 * transcrit, les captures, l’export) répond encore d’un bloc en cas d’erreur, comme un refus du modèle avant sa
 * première bulle ; la réponse, elle, part en flux.
 */
async function traiter(req: Request) {
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
  let dit = envoi.texte;
  let ajout: { ajout: Ajout; affiche: string } | undefined;
  try {
    if (envoi.vocal) {
      if (!envoi.vocal.size || envoi.vocal.size > TAILLE_VOCAL_MAX) return erreur("vocal", 422);
      const t = await transcrire(envoi.vocal);
      if (t === null) return erreur("vocal_bientot", 503);
      if (!t) return erreur("vocal_vide", 422);
      dit = `(vocal) ${t}`.slice(0, LONGUEUR_MAX);
    } else if (envoi.captures.length) {
      const lu = await depuisCaptures(story, memoire, await imagesDe(envoi.captures));
      ajout = { ajout: lu, affiche: resumeAjout(lu, "captures", envoi.captures.length) };
    } else if (envoi.export) {
      const lu = await depuisExport(story, memoire, await depuisPaquet(envoi.export));
      ajout = { ajout: lu, affiche: resumeAjout(lu, "export", 1) };
    }
    /* Une page chargée avant le flux (pendant une mise en ligne) attend la réponse d’un bloc, vocal compris */
    if (!req.headers.get("accept")?.includes(NDJSON)) {
      const r = await repondre(story, memoire, dit, ajout, { parVocal: !!envoi.vocal });
      if (r.majMemoire) after(() => executerChaine(story.id));
      return json(r.reponse);
    }
    /* Le suivi des coûts attend la fin de la réponse */
    return await enFlux(story.id, (surEvenement) => repondre(story, memoire, dit, ajout, { parVocal: !!envoi.vocal, surEvenement, differer: after }));
  } catch (e) {
    if (e instanceof ErreurAjout) return erreur(e.code, 422);
    if (e instanceof ErreurImport) return erreur("fichier", 422);
    if (e instanceof ErreurTache) {
      after(() => alerter(`chat en échec`, [`Histoire ${story.id}`, `Erreur : ${e.message}`]));
      return erreur(e.message, 502);
    }
    throw e;
  }
}

/** L’historique, pour réafficher la conv avec BLUSH : les derniers échanges, ou ceux d’avant `?avant=` (un id d’échange). */
export async function GET(req: Request) {
  const { utilisateur, story } = await contexteRequete();
  if (!utilisateur) return erreur("connexion", 401);
  const avant = Number(new URL(req.url).searchParams.get("avant"));
  return json(story ? await historique(story.id, Number.isSafeInteger(avant) && avant > 0 ? { avant } : {}) : { echanges: [], plus: false });
}

/** Tout le traitement tient avant que Vercel coupe la fonction (src/server/echeance.ts) : un appel trop long s’arrête et le dit. */
export function POST(req: Request) {
  return avecEcheance(285_000, () => traiter(req));
}
