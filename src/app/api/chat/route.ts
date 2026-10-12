import { after } from "next/server";
import type { Ajout } from "@prompts/lib/ajouts";
import { depuisCaptures, depuisExport, resumeAjout } from "@/server/ajouts";
import { relancerApres, relancerChaine } from "@/server/pipeline";
import { imagesDe } from "@/server/captures";
import { controlerBudget } from "@/server/budget";
import { repondre as blushRepond } from "@/server/chat";
import { historique } from "@/server/historique";
import { memoireDe } from "@/server/donnees";
import { depuisPaquet } from "@/server/import";
import { codeDErreur, erreur, lireCorps, repondre, reponseErreur, route, signalerErreur } from "@/server/http";
import { lireVocal, signatureDuVocal, transcrire } from "@/server/ia/transcription";
import { alerter } from "@/server/alertes";
import { auMieux, journal } from "@/server/journal";
import { garde, rendreAuCompte, sousLaLimiteDuCompte } from "@/server/requete";
import { avecEcheance, echeancePour } from "@/server/echeance";
import type { EvenementChat } from "@/types";
import { ROUTES } from "@/types/api";
import { codePublic } from "@/types/erreurs-api";

/*
 * La réponse prend 10 à 20 secondes (une minute avec des captures à lire) : elle part en flux, bulle par bulle, et son
 * vocal après elle ; la mise à jour de la mémoire tourne une fois tout parti
 */
export const maxDuration = 300;
const LONGUEUR_MAX = 4000;
/* La réponse en flux, quand le navigateur la demande (Accept) */
const NDJSON = "application/x-ndjson";

/** L’alerte à l’équipe quand la réponse échoue, d’un bloc comme en flux : la conv, et le code interne (reponseErreur, signalerErreur). */
const alerteDuChat = (storyId: string) => ({ sujet: "chat en échec", lignes: [`Histoire ${storyId}`] });

/** Ce que la réponse de BLUSH reçoit en plus de ce qu’il a dit (src/server/chat.ts). */
type OptionsDeReponse = NonNullable<Parameters<typeof blushRepond>[4]>;

/** Ce qu’il envoie. `question` : la question du rapport (« Ta question »), toujours en texte (ROUTES). */
type Envoi = { texte: string; question: boolean; captures: File[]; export: File | null; vocal: File | null };

/**
 * Un vocal que le serveur ne sait pas lire (lireVocal) : un navigateur qui enregistre dans un format qu’on ne connaît
 * pas, ou un fichier forgé. Une ligne au journal et une alerte à l’équipe (au plus LIMITES.alertesParSujet par jour),
 * avec de quoi reconnaître le format (signatureDuVocal) : jamais le son. Ne fait jamais échouer la réponse.
 */
async function signalerVocalIllisible(vocal: File): Promise<void> {
  await auMieux(async () => {
    const { type, taille, signature, marque } = await signatureDuVocal(vocal);
    journal("vocal illisible", { type, taille, signature, marque: marque ?? "" }, "alerte");
    await alerter("vocal illisible", [
      "Un vocal envoyé au chat n’est dans aucun format que le serveur sait lire (src/server/ia/duree-audio.ts).",
      `Type annoncé : ${type} · taille : ${taille} octets`,
      `Premiers octets : ${signature}${marque ? ` · marque MP4 : ${marque}` : ""}`,
    ]);
  }, "vocal illisible non signalé");
}

/** Ce qu’il envoie : du texte (JSON), ou un formulaire avec des captures, un export ou un vocal. */
async function lireEnvoi(req: Request): Promise<Envoi | null> {
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const lu = await lireCorps(req, ROUTES["POST /api/chat"].corps);
    return lu ? { texte: lu.texte.trim(), question: lu.question === true, captures: [], export: null, vocal: null } : null;
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
    question: false,
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
  /*
   * Une erreur après la réponse laisse une ligne au journal : `fin` ne rejette jamais. La mise à jour de la mémoire a la
   * sienne (relancerChaine, « chaîne non relancée », comme partout où la chaîne repart) ; celle-ci couvre le reste
   */
  const fin = auMieux(
    travail(emettre).then(
      async (r) => {
        ouvrir(true);
        fermer();
        if (r.majMemoire) await relancerChaine(storyId);
      },
      async (e: unknown) => {
        /* Rien n’est parti : la route répond l’erreur elle-même (voir traiter) */
        if (!parti) {
          echec = e;
          return ouvrir(false);
        }
        /*
         * La même traduction que la réponse d’un bloc (codeDErreur) ; le flux ne porte que les codes d’une étape
         * (EvenementChat) : une erreur publique levée après la première bulle y devient une panne
         */
        emettre({ erreur: codePublic(codeDErreur(e)) });
        fermer();
        await signalerErreur(e, { route: "POST /api/chat", alerte: alerteDuChat(storyId) });
      },
    ),
    "chat : la suite de la réponse a échoué",
    { histoire: storyId },
  );
  /* La fonction reste en vie jusqu’au bout du travail, même si la réponse est partie (ou que plus personne ne la lit) */
  after(() => fin);
  if (!(await ouverte)) {
    fermer();
    throw echec;
  }
  return new Response(flux, { headers: { "content-type": `${NDJSON}; charset=utf-8`, "cache-control": "no-store" } });
}

/**
 * Ce qu’il envoie à BLUSH : un texte, des captures (de leur conv ou de son profil), un nouvel export, ou un vocal. Ouvert
 * à tout compte connecté, une fois la mémoire faite (après le rapport) ; la question du rapport (`question`, « Ta
 * question ») est une réponse comme une autre. Ce que coûte une réponse se paie en bulles (src/server/bulles.ts : le
 * débit, le rendu, la réponse verrouillée à 0 bulle), branchées ici par le lot du chat.
 * Ce qui se lit avant que BLUSH écrive (le vocal transcrit, les captures, l’export) répond encore d’un bloc en cas
 * d’erreur, comme un refus du modèle avant sa première bulle ; la réponse, elle, part en flux.
 */
async function traiter(req: Request) {
  const g = await garde(req, { session: "requise", histoire: true });
  if (g instanceof Response) return g;
  const { utilisateur, story } = g;
  const envoi = await lireEnvoi(req);
  if (!envoi || envoi.texte.length > LONGUEUR_MAX) return erreur("texte");
  const fichiers = envoi.captures.length > 0 || !!envoi.export;
  if (!fichiers && !envoi.vocal && !envoi.texte) return erreur("texte");
  if (!(await sousLaLimiteDuCompte(utilisateur, "chat"))) return erreur("trop");
  /* Lire des captures coûte plus qu’un message : une limite à part */
  if (fichiers && !(await sousLaLimiteDuCompte(utilisateur, "ajout"))) return erreur("trop");
  const memoire = await memoireDe(story.id);
  if (!memoire) return erreur("pas_pret");
  let dit = envoi.texte;
  let ajout: { ajout: Ajout; affiche: string } | undefined;
  try {
    if (envoi.vocal) {
      const vocal = envoi.vocal;
      /* Sa durée, mesurée ici (S-15) : un vocal trop long ou illisible ne part pas à la transcription, qui se paie à la durée */
      const lu = await lireVocal(vocal);
      /* Dit à l’équipe après la réponse ; il reste compté dans les messages du jour, qui bornent ces lectures et ces alertes */
      if (lu === "vocal_illisible") after(() => signalerVocalIllisible(vocal));
      /* Un vocal vide n’a fait parler personne : le message du jour est rendu (un trop long ou un illisible reste compté) */
      if (lu === "vocal_vide") await rendreAuCompte(utilisateur, "chat");
      if (typeof lu === "string") return erreur(lu);
      /* Le budget de l’IA d’abord : quand BLUSH souffle, le vocal n’est pas transcrit pour rien (sa transcription y compte) */
      const payeur = await controlerBudget({ storyId: story.id });
      if (!(await sousLaLimiteDuCompte(utilisateur, "vocal"))) return erreur("trop");
      const t = await transcrire(lu, { storyId: story.id, payeur, compte: utilisateur });
      if (t === "trop") return erreur("trop");
      if (t === null) return erreur("vocal_bientot");
      if (!t) {
        await rendreAuCompte(utilisateur, "chat");
        return erreur("vocal_vide");
      }
      dit = `(vocal) ${t}`.slice(0, LONGUEUR_MAX);
    } else if (envoi.captures.length) {
      const lu = await depuisCaptures(story, memoire, await imagesDe(envoi.captures));
      ajout = { ajout: lu, affiche: resumeAjout(lu, "captures", envoi.captures.length) };
    } else if (envoi.export) {
      const lu = await depuisExport(story, memoire, await depuisPaquet(envoi.export));
      ajout = { ajout: lu, affiche: resumeAjout(lu, "export", 1) };
    }
    /* La réponse de BLUSH */
    const reponseDeBlush = (suite: Omit<OptionsDeReponse, "parVocal"> = {}) => blushRepond(story, memoire, dit, ajout, { parVocal: !!envoi.vocal, ...suite });
    /* Une page chargée avant le flux (pendant une mise en ligne) attend la réponse d’un bloc, vocal compris */
    if (!req.headers.get("accept")?.includes(NDJSON)) {
      const r = await reponseDeBlush();
      if (r.majMemoire) relancerApres(story.id);
      return repondre("POST /api/chat", r.reponse);
    }
    /* Le suivi des coûts attend la fin de la réponse */
    return await enFlux(story.id, (surEvenement) => reponseDeBlush({ surEvenement, differer: after }));
  } catch (e) {
    /* Le code interne (« refus:cyber ») part à l’équipe ; le navigateur n’apprend que le refus, le vocal ou la panne */
    return reponseErreur(e, { route: "POST /api/chat", alerte: alerteDuChat(story.id) });
  }
}

/** L’historique, pour réafficher la conv avec BLUSH : les derniers échanges, ou ceux d’avant `?avant=` (un id d’échange). */
export const GET = route("GET /api/chat", async (req: Request) => {
  const g = await garde(req, { session: "requise" });
  if (g instanceof Response) return g;
  const { story } = g;
  const avant = Number(new URL(req.url).searchParams.get("avant"));
  return repondre("GET /api/chat", story ? await historique(story.id, Number.isSafeInteger(avant) && avant > 0 ? { avant } : {}) : { echanges: [], plus: false });
});

/** Tout le traitement tient avant que Vercel coupe la fonction (src/server/echeance.ts) : un appel trop long s’arrête et le dit. */
export const POST = route("POST /api/chat", async (req: Request) => {
  return avecEcheance(echeancePour(maxDuration), () => traiter(req));
});
