import "server-only";
import { COUT_EN_BULLES } from "@/contenu/offres";
import type { Utilisateur } from "./auth";
import { coutDe, debiter, refDeLEnvoi, refDuMessage, rendre, rendues, reponseVerrouillee, soldeDe, type Debit } from "./bulles";
import { repondEnVocal, reserverEchange, type Reglement } from "./chat";
import { reponseDeLEnvoi } from "./historique";
import { auMieux } from "./journal";
import { rendre as rendreALaLimite, sousLaLimite } from "./limites";

/*
 * Le paiement d’une réponse du chat en bulles (POST /api/chat), décidé avant tout appel au modèle : le débit, l’attente
 * d’un envoi déjà payé (sa clé), la réponse verrouillée quand le solde ne la couvre pas, puis le règlement (src/server/chat.ts,
 * Reglement) ou les bulles rendues si la réponse échoue. Sorti de la route pour qu’une autre (la fiche) puisse s’en
 * servir si lire ses captures se paie un jour (la décision produit en attente, src/app/api/fiche/route.ts).
 */

/** Le paiement d’une réponse en bulles, décidé avant que BLUSH écrive (voir payer). */
export type Paiement = { reglement: Reglement; rendreSiPasReglee: () => Promise<void> };

/** La réponse d’un envoi déjà fait (sa clé) : reponseDeLEnvoi, src/server/historique.ts. */
export type EnvoiDejaFait = NonNullable<Awaited<ReturnType<typeof reponseDeLEnvoi>>>;

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
/* Sa durée : celle de la route du chat (maxDuration, src/app/api/chat/route.ts), qu’une fonction coupée ne dépasse pas */
const PLACE_VERROUILLEE = { max: 1, fenetreS: 300 };

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
 * (Reglement.regler : le trop-perçu d’une réponse du garde-fou ou d’un vocal resté écrit est rendu, et la réponse dit ce qu’il reste).
 * Une voix que le débit n’a pas comptée (« parle-moi en vocal » dans ce message) se paie quand elle part
 * (Reglement.ajouterVocal : la bulle de plus, sous sa propre référence).
 */
export async function payer(
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
        /* Verrouillée d’avance mais remplacée par le garde-fou (offerte, jamais verrouillée) : rien n’a été débité */
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
