import { after } from "next/server";
import type { Ajout } from "@prompts/lib/ajouts";
import { depuisCaptures, depuisExport, resumeAjout } from "@/server/ajouts";
import { memoireAssuree, relancerApres, relancerChaine } from "@/server/pipeline";
import { imagesDe } from "@/server/captures";
import { controlerBudget } from "@/server/budget";
import { coutDe, debiter, refDeLEnvoi, refDuMessage, rendre, rendues, reponseVerrouillee, soldeDe, type Debit } from "@/server/bulles";
import { repondEnVocal, repondre as blushRepond, reserverEchange, type Reglement } from "@/server/chat";
import { estEquipe } from "@/server/droits";
import { historique, reponseDeLEnvoi } from "@/server/historique";
import { UUID } from "@/server/histoires";
import { rendre as rendreALaLimite, sousLaLimite } from "@/server/limites";
import { depuisPaquet } from "@/server/import";
import { codeDErreur, erreur, lireCorps, repondre, reponseErreur, route, signalerErreur } from "@/server/http";
import { lireVocal, signatureDuVocal, transcrire } from "@/server/ia/transcription";
import { alerter } from "@/server/alertes";
import { auMieux, journal } from "@/server/journal";
import { garde, rendreAuCompte, sousLaLimiteDuCompte } from "@/server/requete";
import { avecEcheance, echeancePour } from "@/server/echeance";
import type { Utilisateur } from "@/server/auth";
import { COUT_EN_BULLES } from "@/contenu/offres";
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

/**
 * Ce qu’il envoie. `question` : la question du rapport (« Ta question »), toujours en texte (ROUTES). `cle` : la clé de
 * l’envoi (un uuid pris par le navigateur une fois par message, la même pour « Réessayer »), ou null.
 */
type Envoi = { texte: string; question: boolean; captures: File[]; export: File | null; vocal: File | null; cle: string | null };

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
    return lu ? { texte: lu.texte.trim(), question: lu.question === true, captures: [], export: null, vocal: null, cle: lu.cle?.toLowerCase() ?? null } : null;
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) return null;
  const fichier = (cle: string) => {
    const f = fd.get(cle);
    return f instanceof File ? f : null;
  };
  const texte = fd.get("texte");
  const cle = fd.get("cle");
  return {
    texte: typeof texte === "string" ? texte.trim() : "",
    question: false,
    captures: fd.getAll("captures").filter((f): f is File => f instanceof File),
    export: fichier("export"),
    vocal: fichier("vocal"),
    cle: typeof cle === "string" && UUID.test(cle) ? cle.toLowerCase() : null,
  };
}

/**
 * La réponse en flux, une ligne JSON par événement (EvenementChat, src/types) : les bulles à mesure que BLUSH écrit, la
 * réponse validée, puis son vocal. Le travail ne dépend pas de qui lit : page quittée ou réseau coupé en route, la
 * réponse s’écrit et s’enregistre quand même (after garde la fonction en vie), l’historique la rendra. La réponse part
 * avec le premier événement : une erreur d’avant (un refus du modèle, une sortie illisible) est rejetée ici, et répond
 * d’un bloc avec son statut, comme avant le flux ; rien n’a été montré. Une erreur après devient le dernier événement.
 * La mise à jour de la mémoire tourne une fois la réponse partie. `surEchec` : une erreur après le premier événement
 * (les bulles de la réponse sont rendues, si elle n’a pas été réglée : voir traiter).
 */
async function enFlux(storyId: string, travail: (emettre: (e: EvenementChat) => void) => Promise<{ majMemoire: boolean }>, surEchec: () => Promise<unknown>): Promise<Response> {
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
        await surEchec();
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

/** Le paiement d’une réponse en bulles, décidé avant que BLUSH écrive (voir payer). */
type Paiement = { reglement: Reglement; rendreSiPasReglee: () => Promise<void> };

/** La réponse d’un envoi déjà fait (sa clé) : reponseDeLEnvoi, src/server/historique.ts. */
type EnvoiDejaFait = NonNullable<Awaited<ReturnType<typeof reponseDeLEnvoi>>>;

/**
 * Ce que décide payer : la réponse payée (Paiement) ; « bulles » : le solde ne la couvre pas et une réponse verrouillée
 * attend déjà (ou s’écrit en ce moment pour ce compte), rien ne part au modèle ; `deja` : cet envoi (sa clé) est déjà
 * fait, sa réponse ; « occupe » : il s’écrit encore, trop longtemps pour l’attendre.
 */
type Decision = Paiement | { deja: EnvoiDejaFait } | "bulles" | "occupe";

/**
 * La place de la réponse verrouillée d’un compte, prise avant le modèle le temps de l’écrire (un compteur des limites,
 * d’une seule place) : deux messages en même temps à 0 bulle n’appellent le modèle qu’une fois, l’autre répond
 * « bulles ». Rendue une fois la réponse gardée (ou en échec) ; une fonction coupée la libère au bout de sa durée.
 */
const placeVerrouillee = (userId: string) => `chat:verrouillee:${userId}`;
const PLACE_VERROUILLEE = { max: 1, fenetreS: maxDuration };

/** Combien de temps un envoi attend celui de la même clé qui s’écrit encore (un double toucher, « Réessayer » trop tôt). */
const ATTENTE_DE_L_ENVOI_MS = 90_000;

/**
 * Un envoi dont la clé est déjà payée : il s’écrit encore (un double toucher, « Réessayer » pendant que BLUSH écrit
 * toujours), ou il a échoué (ses bulles rendues). Sa réponse dès qu’elle est gardée ; « rendu » : il a échoué, ce nouvel
 * essai se paiera ; « occupe » : toujours rien au bout d’ATTENTE_DE_L_ENVOI_MS.
 */
async function attendreLEnvoi(storyId: string, cle: string, userId: string, ref: string): Promise<EnvoiDejaFait | "rendu" | "occupe"> {
  const fin = Date.now() + ATTENTE_DE_L_ENVOI_MS;
  for (;;) {
    const faite = await reponseDeLEnvoi(storyId, cle);
    if (faite) return faite;
    if (await rendues(userId, ref)) return "rendu";
    if (Date.now() > fin) return "occupe";
    await new Promise((ok) => setTimeout(ok, 400));
  }
}

/**
 * Le paiement de la réponse, avant tout appel au modèle (la transcription d’un vocal, la lecture de captures, la
 * réponse) : son coût (coutDe : des captures ou un export 3, une réponse en vocal 2, écrite 1) est débité d’un coup, sous
 * la référence de l’envoi (refDeLEnvoi, sa clé : un message n’est jamais débité deux fois, « Réessayer » compris), ou
 * de la réponse sans clé (refDuMessage, ses identifiants pris d’avance). La clé déjà payée : l’envoi se fait encore (on
 * attend sa réponse) ou il a échoué (ce nouvel essai se paie, sous la référence de sa réponse). Le solde ne couvre pas un
 * vocal : une réponse écrite, s’il la couvre. Il ne la couvre pas (0 bulle, ou moins après un remboursement) : la réponse
 * s’écrira verrouillée, sauf si une autre attend déjà d’être payée (une par compte) ou s’écrit en ce moment
 * (placeVerrouillee) : « bulles », la route répond sans appel au modèle. L’équipe n’est jamais débitée.
 * `rendreSiPasReglee` : la réponse a échoué avant de partir, ses bulles reviennent (une fois) ; partie, elle est réglée
 * (Reglement.regler : le trop-perçu d’une alerte ou d’un vocal resté écrit est rendu, et la réponse dit ce qu’il reste).
 * Une voix que le débit n’a pas comptée (« parle-moi en vocal » dans ce message) se paie quand elle part
 * (Reglement.ajouterVocal : la bulle de plus, sous sa propre référence).
 */
async function payer(
  utilisateur: Utilisateur,
  story: Parameters<typeof repondEnVocal>[0] & { id: string },
  { fichiers, vocal, cle }: { fichiers: boolean; vocal: boolean; cle: string | null },
): Promise<Decision> {
  const ids = await reserverEchange();
  let ref = cle ? refDeLEnvoi(utilisateur.id, cle) : refDuMessage(ids.blush);
  let cout = coutDe({ ajout: fichiers, vocal: repondEnVocal(story, vocal) });
  let debit: Debit = await debiter(utilisateur, cout, ref);
  if (debit === "deja" && cle) {
    const attendu = await attendreLEnvoi(story.id, cle, utilisateur.id, ref);
    if (attendu === "occupe") return "occupe";
    if (attendu !== "rendu") return { deja: attendu };
    /* Il a échoué, ses bulles rendues : ce nouvel essai se paie, sous la référence de sa propre réponse */
    ref = refDuMessage(ids.blush);
    debit = await debiter(utilisateur, cout, ref);
  }
  let ecrit = false;
  /* Pas de quoi payer un vocal : la réponse s’écrit, si le solde couvre une réponse écrite */
  if (debit === "insuffisant" && cout === COUT_EN_BULLES.vocal) {
    const ecrite = await debiter(utilisateur, COUT_EN_BULLES.reponse, ref);
    if (ecrite !== "insuffisant") [debit, cout, ecrit] = [ecrite, COUT_EN_BULLES.reponse, true];
  }
  const verrouillee = debit === "insuffisant";
  let liberer = async () => {};
  if (verrouillee) {
    if (await reponseVerrouillee(utilisateur.id)) return "bulles";
    const place = placeVerrouillee(utilisateur.id);
    const prise = await sousLaLimite(place, PLACE_VERROUILLEE);
    let libre = false;
    liberer = async () => {
      if (libre) return;
      libre = true;
      await auMieux(() => rendreALaLimite(place), "chat : la place de la réponse verrouillée non rendue", { histoire: story.id });
    };
    /* Une autre s’écrit en ce moment (la place est prise), ou vient d’être gardée : celle-ci n’appelle pas le modèle */
    if (!prise || (await reponseVerrouillee(utilisateur.id))) {
      await liberer();
      return "bulles";
    }
    /* Verrouillée, elle s’écrit sans voix : son coût à la lecture est celui d’une réponse écrite (ou de captures) */
    cout = coutDe({ ajout: fichiers, vocal: false });
  }
  const refDeLaVoix = `${ref}:vocal`;
  let supplement = 0;
  let reglee = false;
  return {
    reglement: {
      ids,
      verrouillee,
      ecrit: ecrit || verrouillee,
      cout,
      paye: () => cout + supplement,
      liberer,
      ajouterVocal: async () => {
        if (debit === "equipe") return true;
        if (debit !== "debite") return false;
        const n = COUT_EN_BULLES.vocal - cout;
        if (n <= 0) return true;
        if ((await debiter(utilisateur, n, refDeLaVoix)) !== "debite") return false;
        supplement = n;
        return true;
      },
      regler: async (reel) => {
        reglee = true;
        if (debit === "equipe") return undefined;
        /* Verrouillée d’avance mais sortie en alerte de danger (offerte, jamais verrouillée) : rien n’a été débité */
        if (debit !== "debite") return { depensees: 0, restantes: await soldeDe(utilisateur.id) };
        const paye = cout + supplement;
        /* Le trop-perçu revient : la bulle de la voix d’abord (sa référence), puis le reste */
        let trop = paye - reel;
        if (trop > 0 && supplement > 0) {
          const n = Math.min(trop, supplement);
          await rendre(utilisateur, refDeLaVoix, n);
          trop -= n;
        }
        if (trop > 0) await rendre(utilisateur, ref, trop);
        return { depensees: Math.min(reel, paye), restantes: await soldeDe(utilisateur.id) };
      },
    },
    rendreSiPasReglee: async () => {
      await liberer();
      if (debit !== "debite" || reglee) return;
      reglee = true;
      await auMieux(
        async () => {
          await rendre(utilisateur, ref);
          if (supplement) await rendre(utilisateur, refDeLaVoix);
        },
        "chat : les bulles d’une réponse en échec non rendues",
        { histoire: story.id, ref },
      );
    },
  };
}

/**
 * La réponse d’un envoi déjà fait (sa clé : « Réessayer » après une coupure, un double toucher), telle qu’elle est
 * gardée, d’un bloc : sans nouvel appel au modèle, sans nouveau débit. Ce qu’elle a coûté et ce qu’il reste, sauf pour
 * l’équipe et une réponse verrouillée (masquée).
 */
async function dejaFait(utilisateur: Utilisateur, d: EnvoiDejaFait): Promise<Response> {
  const bulles = d.verrouillee || estEquipe(utilisateur) ? {} : { bulles: { depensees: d.cout ?? 0, restantes: await soldeDe(utilisateur.id) } };
  return repondre("POST /api/chat", { ...d.reponse, echange: d.echange, ...bulles });
}

/**
 * Ce qu’il envoie à BLUSH : un texte, des captures (de leur conv ou de son profil), un nouvel export, ou un vocal. Ouvert
 * à tout compte connecté, dès que le rapport est écrit ou débloqué (sa mémoire, ou celle de secours : memoireAssuree) ; la question du rapport (`question`, « Ta
 * question ») est une réponse comme une autre. Ce que coûte une réponse se paie en bulles, avant que BLUSH écrive (payer) ;
 * une réponse qui échoue rend les siennes.
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
  /* Cet envoi (sa clé) est déjà fait : sa réponse, telle quelle, sans rien compter ni débiter de plus */
  const fait = envoi.cle ? await reponseDeLEnvoi(story.id, envoi.cle) : null;
  if (fait) return dejaFait(utilisateur, fait);
  if (!(await sousLaLimiteDuCompte(utilisateur, "chat"))) return erreur("trop");
  /* Lire des captures coûte plus qu’un message : une limite à part */
  if (fichiers && !(await sousLaLimiteDuCompte(utilisateur, "ajout"))) return erreur("trop");
  /* La vraie mémoire, ou celle de secours : le chat répond toujours, dès que le rapport est écrit ou débloqué */
  const memoire = await memoireAssuree(story);
  if (!memoire) return erreur("pas_pret");
  const paiement = await payer(utilisateur, story, { fichiers, vocal: !!envoi.vocal, cle: envoi.cle });
  if (typeof paiement === "string" || "deja" in paiement) {
    /* Rien ne part au modèle (une réponse verrouillée attend déjà, ou cet envoi est déjà fait) : le message du jour est rendu */
    await rendreAuCompte(utilisateur, "chat");
    if (fichiers) await rendreAuCompte(utilisateur, "ajout");
    /* « bulles » porte toujours les numéros d’aide (erreur, src/server/http.ts) : ce message, personne ne l’a lu */
    return typeof paiement === "string" ? erreur(paiement) : dejaFait(utilisateur, paiement.deja);
  }
  try {
    const r = await repondreA(req, envoi, { utilisateur, story, memoire, paiement });
    /* Une erreur répondue d’un bloc : la réponse n’est pas partie, ses bulles reviennent */
    if (!r.ok) await paiement.rendreSiPasReglee();
    return r;
  } catch (e) {
    await paiement.rendreSiPasReglee();
    throw e;
  }
}

/** La réponse de BLUSH à ce qu’il envoie, payée (traiter) : un vocal transcrit, des captures ou un export lus, puis la réponse. */
async function repondreA(
  req: Request,
  envoi: Envoi,
  {
    utilisateur,
    story,
    memoire,
    paiement,
  }: { utilisateur: Utilisateur; story: Parameters<typeof blushRepond>[0]; memoire: NonNullable<Awaited<ReturnType<typeof memoireAssuree>>>; paiement: Paiement },
) {
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
    /* La réponse de BLUSH, payée */
    const reponseDeBlush = (suite: Omit<OptionsDeReponse, "parVocal" | "reglement" | "cle"> = {}) =>
      blushRepond(story, memoire, dit, ajout, { parVocal: !!envoi.vocal, reglement: paiement.reglement, ...(envoi.cle ? { cle: envoi.cle } : {}), ...suite });
    /* Une page chargée avant le flux (pendant une mise en ligne) attend la réponse d’un bloc, vocal compris */
    if (!req.headers.get("accept")?.includes(NDJSON)) {
      const r = await reponseDeBlush();
      if (r.majMemoire) relancerApres(story.id);
      return repondre("POST /api/chat", r.reponse);
    }
    /* Le suivi des coûts attend la fin de la réponse */
    return await enFlux(story.id, (surEvenement) => reponseDeBlush({ surEvenement, differer: after }), paiement.rendreSiPasReglee);
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
