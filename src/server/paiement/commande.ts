import "server-only";
import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { CATALOGUE } from "@/contenu/offres";
import type { IssueDuFauxWhop, OffreId, OffreProposee } from "@/types";
import type { EtatAchat, OffreUniqueMontree, PaiementCommence } from "@/types/api";
import { commander, marquerEchoue, type Achat, type RefusDeCommande } from "../achats";
import type { Utilisateur } from "../auth";
import { db, schema } from "../db";
import { estEquipe } from "../droits";
import { URL_SITE } from "../env";
import { journalErreur } from "../journal";
import { LIMITES, sousLaLimite } from "../limites";
import { montrer } from "../offres-uniques";
import { webhookDeLIssue, type WebhookFactice } from "./factice";
import { fournisseur, type Fournisseur } from "./fournisseur";
import { livrerLePaiement, recevoirWebhook } from "./webhook";
import { creerConfiguration, ErreurWhop, lirePaiement, payerEnUnGeste } from "./whop";

/*
 * Le paiement, côté acheteur : le commencer (POST /api/paiement), le suivre au retour (GET /api/paiement/[achat]), les
 * offres uniques que l’écran demande à montrer (POST /api/paiement/offre), et les boutons du faux Whop. Le prix vient
 * toujours du catalogue, figé dans l’achat à la commande (commander, src/server/achats.ts) ; rien n’est livré ici, sauf
 * un paiement vérifié chez Whop au retour quand le webhook tarde (livré par le même chemin, une fois).
 */

const a = schema.achats;

/** Compte dont on lit les achats : son id et son email (l’équipe ne paie pas). */
type Compte = Pick<Utilisateur, "id" | "email">;

/** L’achat de cet id, s’il est à ce compte ; sinon null. */
async function achatDuCompte(userId: string, achatId: string): Promise<Achat | null> {
  if (!/^[0-9a-f-]{36}$/i.test(achatId)) return null;
  const [l] = await db()
    .select()
    .from(a)
    .where(and(eq(a.id, achatId), eq(a.userId, userId)));
  return l ?? null;
}

/**
 * L’adresse du retour du paiement : la page qui attend la livraison (/paiement/retour). Whop la veut entière (https,
 * l’adresse du site) ; le faux Whop reste sur la page où il est.
 */
const adresseDuRetour = (f: Fournisseur, achatId: string) => `${f.mode === "whop" ? URL_SITE : ""}/paiement/retour?achat=${achatId}`;

/** Le dernier achat payé de ce compte chez ce prestataire qui a gardé un moyen de paiement : de quoi payer l’offre ③ en un geste. */
async function moyenGarde(userId: string, mode: Fournisseur["mode"]): Promise<{ membreId: string; moyenId: string } | null> {
  const [l] = await db()
    .select({ membreId: a.membreId, moyenId: a.moyenId })
    .from(a)
    .where(and(eq(a.userId, userId), eq(a.statut, "paye"), eq(a.fournisseur, mode), isNotNull(a.membreId), isNotNull(a.moyenId)))
    .orderBy(desc(a.payeLe))
    .limit(1);
  return l?.membreId && l.moyenId ? { membreId: l.membreId, moyenId: l.moyenId } : null;
}

/** Whop a refusé l’appel, sans rien faire (un 4xx) : ni une panne, ni un délai, ni une réponse illisible, où le paiement a pu partir. */
const refusNet = (e: ErreurWhop) => typeof e.statut === "number" && e.statut >= 400 && e.statut < 500;

/**
 * L’offre ③ payée en un geste, avec le moyen de paiement gardé d’un achat payé : chez Whop (POST /payments ; l’adresse où
 * le confirmer si la banque le demande), ou par le faux Whop, qui envoie son webhook payment.succeeded juste après la
 * réponse. Null : pas de moyen gardé, ou Whop refuse (le paiement passe alors par une page de paiement).
 */
async function enUnGeste(f: Fournisseur, compte: Compte, achat: Achat, retour: string): Promise<PaiementCommence | null> {
  const moyen = await moyenGarde(compte.id, f.mode);
  if (!moyen) return null;
  if (f.mode === "factice") {
    const w = webhookDeLIssue(achat, "payer");
    if (w) after(() => recevoirWebhook(w.corps, new Headers(w.entetes)));
    return { achat: achat.id, checkout: null, url: null };
  }
  try {
    const p = await payerEnUnGeste(f.whop, { achat: achat.id, centimes: achat.centimes, membre: moyen.membreId, moyen: moyen.moyenId, retour });
    return { achat: achat.id, checkout: null, url: p.confirmer };
  } catch (e) {
    /*
     * Seul un refus net de Whop (4xx : rien n’a été débité) passe à une page de paiement. Sans réponse, ou une réponse
     * illisible, le paiement a pu partir : une page de plus le ferait payer deux fois. L’erreur remonte (l’achat échoue,
     * « panne ») ; s’il a été débité, son webhook le livre quand même (livrer, depuis « echoue »).
     */
    if (!(e instanceof ErreurWhop) || !refusNet(e)) throw e;
    journalErreur("paiement en un geste refusé, page de paiement à la place", e, { achat: achat.id });
    return null;
  }
}

/** La page où payer un achat : celle de Whop (sa configuration de paiement, notée sur l’achat), ou celle du faux Whop. */
async function pageDePaiement(f: Fournisseur, achat: Achat, retour: string): Promise<PaiementCommence> {
  const page =
    f.mode === "whop"
      ? await creerConfiguration(f.whop, { achat: achat.id, centimes: achat.centimes, retour })
      : { id: `ch_faux_${achat.id.replaceAll("-", "")}`, url: `/paiement/factice?achat=${achat.id}` };
  await db().update(a).set({ checkoutId: page.id }).where(eq(a.id, achat.id));
  return { achat: achat.id, checkout: page.id, url: page.url };
}

/** Pourquoi un paiement ne commence pas : pas de prestataire (« bientot »), rien à payer (« deja » : l’équipe, un rapport déjà ouvert), ou le refus de la commande. */
export type RefusDePaiement = "bientot" | RefusDeCommande;

/**
 * Commence le paiement d’une offre (la case de renonciation déjà vérifiée par la route) : l’achat écrit « en_attente »
 * au prix du catalogue (commander : le droit de l’acheter), puis la page où le payer, ou le paiement en un geste (③).
 * Une page que Whop refuse de créer laisse l’achat « echoue » (rien n’a été payé), et l’erreur remonte (« panne »).
 */
export async function commencerPaiement(compte: Compte, offre: OffreId, storyId: string | null): Promise<PaiementCommence | RefusDePaiement> {
  const f = fournisseur();
  if (!f) return "bientot";
  if (estEquipe(compte)) return "deja";
  const achat = await commander(compte, offre, { storyId, fournisseur: f.mode });
  if (typeof achat === "string") return achat;
  const retour = adresseDuRetour(f, achat.id);
  try {
    return (offre === "premium_ajout" && (await enUnGeste(f, compte, achat, retour))) || (await pageDePaiement(f, achat, retour));
  } catch (e) {
    await marquerEchoue(achat.id);
    throw e;
  }
}

/** Le statut que Whop donne à un paiement encaissé. */
const ENCAISSE = new Set(["paid", "succeeded"]);

/**
 * Où en est l’achat de ce compte (null : pas le sien). Encore en attente (ou échoué : une première carte refusée, puis
 * une autre acceptée sur la même page de Whop, avant son webhook), avec le paiement que Whop a donné au retour
 * (`paiementId`) : vérifié chez Whop (quelques fois par achat au plus, verificationParAchat), et livré s’il est encaissé,
 * pour cet achat, au bon montant (livrerLePaiement, comme le webhook). Le faux Whop n’a rien à vérifier : son webhook
 * part avant le retour.
 */
export async function etatDeLAchat(compte: Compte, achatId: string, paiementId: string | null): Promise<EtatAchat | null> {
  let achat = await achatDuCompte(compte.id, achatId);
  if (!achat) return null;
  const f = fournisseur();
  if (
    (achat.statut === "en_attente" || achat.statut === "echoue") &&
    paiementId &&
    f?.mode === "whop" &&
    achat.fournisseur === "whop" &&
    (await sousLaLimite(`paiement:verification:${achat.id}`, LIMITES.verificationParAchat))
  ) {
    const p = await lirePaiement(f.whop, paiementId);
    if (p && p.achat === achat.id && ENCAISSE.has(p.statut) && !p.autoRembourse) {
      await livrerLePaiement("whop", p);
      achat = (await achatDuCompte(compte.id, achatId)) ?? achat;
    }
  }
  return { achat: achat.id, offre: achat.offre, statut: achat.statut, bulles: achat.bulles, conv: achat.storyId };
}

/** Les recharges : les packs de bulles du catalogue (ni rapport, ni offre unique). */
const PACKS = (Object.keys(CATALOGUE) as OffreId[]).filter((o) => !CATALOGUE[o].conv && !CATALOGUE[o].unique);

/**
 * Montre une offre unique à ce compte, si le serveur le permet (montrer, src/server/offres-uniques.ts : une fois, jamais
 * deux le même jour) et si elle s’achète : ① la suite, pour la conv de la page, pas encore débloquée ; ③ Premium pour
 * 5 € de plus, après un rapport payé (le rapport seul, ou la suite) ; ④ le bonus de la première recharge, tant qu’aucun
 * pack n’a été payé (la recharge l’affiche, et la commande du pack conseillé le prend : commander). Jamais sans
 * prestataire (rien ne s’achèterait), ni à l’équipe. `enUnGeste` : un moyen de paiement est gardé (« Ta carte est
 * enregistrée »).
 */
export async function proposerOffreUnique(compte: Compte, offre: OffreProposee, storyId: string | null): Promise<OffreUniqueMontree> {
  const f = fournisseur();
  const rien = { offre: null } as const;
  if (!f) return rien;
  if (offre === "suite") {
    if (!storyId) return rien;
    const [s] = await db()
      .select({ debloqueLe: schema.stories.debloqueLe })
      .from(schema.stories)
      .where(and(eq(schema.stories.id, storyId), eq(schema.stories.userId, compte.id)));
    if (!s || s.debloqueLe) return rien;
  } else if (offre === "premium_ajout") {
    const [rapport] = await db()
      .select({ id: a.id })
      .from(a)
      .where(and(eq(a.userId, compte.id), eq(a.statut, "paye"), inArray(a.offre, ["rapport", "suite"])))
      .limit(1);
    if (!rapport) return rien;
  } else {
    /* ④ : la première recharge seulement, aucun pack jamais payé (même repris ensuite) */
    const [recharge] = await db()
      .select({ id: a.id })
      .from(a)
      .where(and(eq(a.userId, compte.id), isNotNull(a.payeLe), inArray(a.offre, PACKS)))
      .limit(1);
    if (recharge) return rien;
  }
  const montree = await montrer(compte, offre, { storyId: offre === "suite" ? storyId : null });
  if (!montree) return rien;
  return { offre, fin: montree.expireLe?.toISOString() ?? null, enUnGeste: offre === "premium_ajout" && !!(await moyenGarde(compte.id, f.mode)) };
}

/** Ce que le faux Whop fait d’un achat de ce compte : le webhook à poster, et l’adresse du retour (null pour un remboursement). */
export type IssueDuFaux = { webhook: WebhookFactice; retour: string | null };

/**
 * Le bouton du faux Whop (sa page, /paiement/factice, ou un test) : le webhook que Whop enverrait pour cet achat de ce
 * compte (payé, refusé, ou remboursé), signé du secret de test. Null : pas le faux Whop, pas son achat, ou rien à
 * rembourser (pas encore payé).
 */
export async function issueDuFauxWhop(compte: Compte, achatId: string, issue: IssueDuFauxWhop): Promise<IssueDuFaux | null> {
  if (fournisseur()?.mode !== "factice") return null;
  const achat = await achatDuCompte(compte.id, achatId);
  if (!achat || achat.fournisseur !== "factice") return null;
  const webhook = webhookDeLIssue(achat, issue);
  if (!webhook) return null;
  if (issue === "rembourser") return { webhook, retour: null };
  const p = JSON.parse(webhook.corps) as { data: { id: string } };
  return { webhook, retour: `/paiement/retour?achat=${achat.id}&payment=${p.data.id}&status=${issue === "payer" ? "succeeded" : "failed"}` };
}

/** Le prix d’un achat en euros, pour la page du faux Whop : l’offre (son nom), son prix, son statut. */
export async function achatDuFauxWhop(compte: Compte, achatId: string): Promise<{ titre: string; centimes: number; statut: Achat["statut"] } | null> {
  if (fournisseur()?.mode !== "factice") return null;
  const achat = await achatDuCompte(compte.id, achatId);
  return achat && achat.fournisseur === "factice" ? { titre: CATALOGUE[achat.offre].titre, centimes: achat.centimes, statut: achat.statut } : null;
}

/**
 * Pour l’écran « C’est débloqué » : l’achat payé de ce compte, son offre, et les bulles qu’il a reçues avec lui (celles
 * de l’offre ③ prise juste après comprises : l’écran y revient une fois ③ payé), ou null.
 */
export async function achatPaye(compte: Compte, achatId: string): Promise<Pick<Achat, "id" | "offre" | "bulles" | "storyId"> | null> {
  const achat = await achatDuCompte(compte.id, achatId);
  if (achat?.statut !== "paye") return null;
  const [ajout] = await db()
    .select({ bulles: sql<number>`coalesce(sum(${a.bulles}), 0)::int` })
    .from(a)
    .where(and(eq(a.userId, compte.id), eq(a.offre, "premium_ajout"), eq(a.statut, "paye"), gt(a.creeLe, achat.creeLe)));
  const bulles = achat.bulles + (achat.offre === "rapport" || achat.offre === "suite" ? (ajout?.bulles ?? 0) : 0);
  return { id: achat.id, offre: achat.offre, bulles, storyId: achat.storyId };
}
