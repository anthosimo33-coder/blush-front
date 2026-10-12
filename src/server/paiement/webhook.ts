import "server-only";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { CATALOGUE } from "@/contenu/offres";
import { livrer, marquerEchoue, reprendre, uneFoisParEvenement, type Achat } from "../achats";
import { alerter } from "../alertes";
import { db, schema } from "../db";
import { journal } from "../journal";
import { lireWebhook, montantJuste, type ActionWebhook, type PaiementWhop } from "./evenements";
import { fournisseur, type Fournisseur } from "./fournisseur";
import { verifierWebhook } from "./signature";
import { lirePaiement } from "./whop";

/*
 * Les webhooks de Whop (POST /api/paiement/whop, hors de la garde commune : Whop n’est pas l’appli). Dans l’ordre : la
 * signature (Standard Webhooks, src/server/paiement/signature.ts ; refusée : 401 et une alerte à l’équipe), le compte
 * Whop qui l’envoie, puis l’événement une seule fois (son webhook-id, uneFoisParEvenement), appliqué par le socle des
 * achats : livrer, reprendre, marquerEchoue (src/server/achats.ts), qui se rejouent sans effet. Un paiement ne livre
 * que l’achat de ses métadonnées, de ce prestataire, au bon montant et dans la bonne devise, et une seule fois (son
 * pay_… est unique). La réponse part vite (Whop attend un 2xx en moins de 5 s) : la chaîne du rapport et les alertes
 * passent après elle (after). Un événement compris mais sans effet répond 2xx aussi : sinon Whop le rejouerait trois jours.
 */

/** L’achat de cet id, ou null. */
async function achatDe(id: string): Promise<Achat | null> {
  const [a] = await db().select().from(schema.achats).where(eq(schema.achats.id, id));
  return a ?? null;
}

/** L’achat qu’a payé ce paiement (pay_…), ou null : pas encore livré (ou d’ailleurs). */
async function achatDuPaiement(paiementId: string): Promise<Achat | null> {
  const [a] = await db().select().from(schema.achats).where(eq(schema.achats.paiementId, paiementId));
  return a ?? null;
}

/** Ce qu’a fait une livraison demandée par un paiement : celle du socle (livrer), ou pourquoi rien n’est livré. */
export type LivraisonDuPaiement = "livre" | "deja" | "annule" | "inconnu" | "autre" | "montant" | "offre";

/**
 * Livre l’achat que ce paiement paie, s’il colle : l’achat de ses métadonnées existe et vient de ce prestataire (`mode`),
 * le paiement n’en a pas déjà livré un autre, le montant et la devise sont ceux figés à la commande. Le webhook
 * payment.succeeded et la vérification du retour (src/server/paiement/commande.ts) passent par ici ; livrer le fait une
 * fois. Un montant qui ne colle pas n’est pas livré : l’équipe est prévenue (l’achat reste en attente, à voir à la main).
 */
export async function livrerLePaiement(mode: Fournisseur["mode"], p: PaiementWhop): Promise<LivraisonDuPaiement> {
  const achat = p.achat ? await achatDe(p.achat) : null;
  if (!achat) {
    journal("paiement sans achat connu", { paiement: p.id }, "alerte");
    return "inconnu";
  }
  if (achat.fournisseur !== mode) return "autre";
  const deja = await achatDuPaiement(p.id);
  if (deja && deja.id !== achat.id) {
    after(() => alerter("paiement : un paiement pour deux achats", [`Le paiement ${p.id} a déjà livré l’achat ${deja.id} ; l’achat ${achat.id} n’est pas livré.`]));
    return "autre";
  }
  if (!montantJuste(p, achat)) {
    const recu = `${p.total ?? "?"} centimes TTC (${p.sousTotal ?? "?"} hors taxe), en ${p.devise ?? "?"}`;
    after(() =>
      alerter(
        "paiement : montant inattendu",
        [
          `Achat ${achat.id} (${achat.offre}) : ${achat.centimes} centimes attendus en ${achat.devise}, ${recu} reçus (paiement ${p.id}).`,
          "Rien n’est livré : à vérifier chez Whop, puis à livrer ou rembourser à la main.",
        ],
        { importante: true },
      ),
    );
    return "montant";
  }
  const r = await livrer(achat.id, { paiementId: p.id, checkoutId: p.checkoutId, membreId: p.membreId, moyenId: p.moyenId });
  /* Une offre unique payée deux fois (deux commandes passées tant qu’elle valait) : la seconde n’est pas livrée */
  if (r.effet === "offre")
    after(() =>
      alerter(
        "paiement : offre unique déjà prise",
        [
          `L’achat ${achat.id} (${achat.offre}, paiement ${p.id}) profite de l’offre unique « ${achat.offreUnique} », déjà prise par un autre achat de ce compte.`,
          "Rien n’est livré : ce paiement est à rembourser chez Whop.",
        ],
        { importante: true },
      ),
    );
  /* Déjà livré par un autre paiement (la même page payée deux fois) : celui-ci a été encaissé pour rien */
  const autre = r.achat?.paiementId;
  if (r.effet === "deja" && autre && autre !== p.id)
    after(() =>
      alerter("paiement : payé deux fois", [`L’achat ${achat.id} (${achat.offre}) est déjà livré par le paiement ${autre} ; le paiement ${p.id} est à rembourser.`], {
        importante: true,
      }),
    );
  /* Le rapport d’une conv déjà ouverte par un autre achat (deux commandes payées, deux onglets) : ses bulles sont livrées, le rapport payé deux fois */
  if (r.effet === "livre" && r.achat?.storyId && r.achat.userId && CATALOGUE[r.achat.offre].conv && !r.debloquee)
    after(() =>
      alerter("paiement : rapport déjà ouvert", [
        `L’achat ${achat.id} (${achat.offre}, paiement ${p.id}) est livré, mais le rapport de sa conv était déjà ouvert : seules ses bulles comptent.`,
        "Le rapport a peut-être été payé deux fois : à voir chez Whop, et à rembourser s’il le demande.",
      ]),
    );
  return r.effet;
}

/** L’achat d’un remboursement ou d’un litige : celui que l’événement nomme, sinon celui que ce paiement a livré, sinon celui des métadonnées du paiement chez Whop. */
async function achatRepris(f: Fournisseur, action: Extract<ActionWebhook, { faire: "reprendre" }>): Promise<Achat | null> {
  if (action.achat) return achatDe(action.achat);
  const livre = await achatDuPaiement(action.paiementId);
  if (livre) return livre;
  /* Le remboursement arrivé avant le paiement (Whop ne garantit pas l’ordre) : Whop dit quel achat ce paiement payait */
  if (f.mode !== "whop") return null;
  const p = await lirePaiement(f.whop, action.paiementId);
  return p?.achat ? achatDe(p.achat) : null;
}

/** Applique ce qu’un webhook demande. */
async function appliquer(f: Fournisseur, action: ActionWebhook): Promise<string> {
  switch (action.faire) {
    case "livrer":
      return livrerLePaiement(f.mode, action.paiement);
    case "reprendre": {
      const achat = await achatRepris(f, action);
      if (!achat || achat.fournisseur !== f.mode) {
        journal("reprise d’un paiement sans achat connu", { paiement: action.paiementId, statut: action.statut }, "alerte");
        return "inconnu";
      }
      /*
       * Livré par un autre paiement : celui-ci l’a payé en double (« payé deux fois », livrerLePaiement), et c’est lui qu’on
       * rembourse, ou qui est contesté. L’achat reste à lui : rien n’est repris (sinon, rembourser le doublon, comme
       * l’alerte le demande, re-verrouillerait le rapport bel et bien payé)
       */
      if (achat.paiementId && achat.paiementId !== action.paiementId) {
        const quoi = action.statut === "rembourse" ? "remboursé" : "contesté";
        after(() =>
          alerter(`paiement en double ${quoi}`, [
            `Le paiement ${action.paiementId} (${quoi}) payait l’achat ${achat.id} (${achat.offre}), déjà livré par le paiement ${achat.paiementId} : rien n’est repris.`,
          ]),
        );
        return "doublon";
      }
      return (await reprendre(achat.id, action.statut)).effet;
    }
    case "echouer": {
      const achat = action.paiement.achat ? await achatDe(action.paiement.achat) : null;
      return achat && achat.fournisseur === f.mode && (await marquerEchoue(achat.id)) ? "echoue" : "rien";
    }
    case "rien":
      return "rien";
  }
}

/** Ce que la route répond : traité (2xx, même sans effet), ou refusé (401 : pas de prestataire, ou une signature qui ne colle pas). */
export type Reception = "ok" | "refuse";

/**
 * Reçoit un webhook de Whop (ou du faux Whop) : son corps brut, exactement tel que reçu, et ses en-têtes. Voir l’en-tête
 * du fichier. Une erreur de la base remonte (la route répond 502 : Whop rejouera).
 */
export async function recevoirWebhook(corps: string, entetes: Headers): Promise<Reception> {
  const f = fournisseur();
  if (!f) return "refuse";
  const v = verifierWebhook(f.secret, entetes, corps);
  if ("refus" in v) {
    journal("webhook de paiement refusé", { raison: v.refus }, "alerte");
    /* Sans ses en-têtes, ce n’est pas Whop (un robot qui passe) : le journal suffit. Signé, mais faux ou trop vieux : l’équipe le sait */
    if (v.refus !== "entetes")
      after(() =>
        alerter("paiement : webhook refusé", [
          `Un webhook de paiement a été refusé (${v.refus === "heure" ? "trop vieux, ou rejoué" : "signature fausse"}).`,
          "Si ça se répète : le secret WHOP_WEBHOOK_SECRET a-t-il changé ?",
        ]),
      );
    return "refuse";
  }
  let json: unknown;
  try {
    json = JSON.parse(corps);
  } catch {
    json = null;
  }
  const lu = lireWebhook(json);
  if (!lu) {
    journal("webhook de paiement illisible", { id: v.id }, "alerte");
    return "ok";
  }
  /* Signé de notre secret, mais d’un autre compte Whop : ignoré (le compte n’est vérifié que s’il est dit) */
  if (lu.compte && lu.compte !== f.compte) {
    journal("webhook d’un autre compte Whop", { id: v.id, type: lu.type }, "alerte");
    return "ok";
  }
  const effet = await uneFoisParEvenement(v.id, lu.type, () => appliquer(f, lu.action));
  journal("webhook de paiement", { id: v.id, type: lu.type, effet: lu.action.faire === "rien" ? lu.action.pourquoi : effet });
  return "ok";
}
