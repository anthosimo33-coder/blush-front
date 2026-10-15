import "server-only";
import { and, desc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { CATALOGUE, DUREE_AJOUT_MS, RAPPORTS_SEULS, titreChezWhop } from "@/contenu/offres";
import type { IssueDuFauxWhop, OffreId, OffreProposee } from "@/types";
import type { Avoirs, EtatAchat, FeuilleDuPaiement, OffreUniqueMontree, PaiementCommence } from "@/types/api";
import { avanceDuCompte, commander, marquerEchoue, rechargeDejaPayee, type Achat, type RefusDeCommande } from "../achats";
import type { Utilisateur } from "../auth";
import { db, schema } from "../db";
import { estEquipe } from "../droits";
import { UUID } from "../histoires";
import type { Consentement } from "../juridique";
import { URL_SITE } from "../env";
import { journalErreur } from "../journal";
import { LIMITES, sousLaLimite } from "../limites";
import { montrer, offreValable } from "../offres-uniques";
import { webhookDeLIssue, type WebhookFactice } from "./factice";
import { fournisseur, type Fournisseur } from "./fournisseur";
import { livrerLePaiement, recevoirWebhook } from "./webhook";
import { creerConfiguration, ErreurWhop, lirePaiement, payerAvecJeton, payerEnUnGeste } from "./whop";

/*
 * Le paiement, côté acheteur : ce que la feuille du paiement doit savoir (GET /api/paiement/feuille), le commencer
 * (POST /api/paiement : dans la feuille, avec le jeton des Elements de Whop ; en un geste ; ou sur la page de Whop), le
 * suivre jusqu’à sa livraison (GET /api/paiement/[achat]), les offres uniques que l’écran demande à montrer
 * (POST /api/paiement/offre), et les boutons du faux Whop. Le prix vient
 * toujours du catalogue, figé dans l’achat à la commande (commander, src/server/achats.ts) ; rien n’est livré ici, sauf
 * un paiement vérifié chez Whop au retour quand le webhook tarde (livré par le même chemin, une fois).
 */

const a = schema.achats;

/** Compte dont on lit les achats : son id et son email (l’équipe ne paie pas). */
type Compte = Pick<Utilisateur, "id" | "email">;

/** L’achat de cet id, s’il est à ce compte ; sinon null. */
async function achatDuCompte(userId: string, achatId: string): Promise<Achat | null> {
  /* Un vrai uuid seulement : la base refuserait le reste (une erreur, pas « introuvable ») */
  if (!UUID.test(achatId)) return null;
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

/**
 * Le dernier achat payé de ce compte chez ce prestataire qui a gardé un moyen de paiement : de quoi payer l’offre ③ en un
 * geste. Jamais d’un achat payé sur la page de Whop (une configuration de paiement : son lien s’ouvre chez n’importe
 * qui, le moyen est celui de qui a payé) : livrer ne le garde plus, et les achats d’avant le correctif sont écartés ici.
 */
async function moyenGarde(userId: string, mode: Fournisseur["mode"]): Promise<{ membreId: string; moyenId: string } | null> {
  const [l] = await db()
    .select({ membreId: a.membreId, moyenId: a.moyenId })
    .from(a)
    .where(and(eq(a.userId, userId), eq(a.statut, "paye"), eq(a.fournisseur, mode), isNotNull(a.membreId), isNotNull(a.moyenId), isNull(a.checkoutId)))
    .orderBy(desc(a.payeLe))
    .limit(1);
  return l?.membreId && l.moyenId ? { membreId: l.membreId, moyenId: l.moyenId } : null;
}

/** Les offres qui se paient en un geste, avec le moyen de paiement gardé du paiement d’avant : celles de « C’est débloqué ». */
const EN_UN_GESTE: ReadonlySet<OffreId> = new Set(["premium_ajout", "second"]);

/** Les rapports payés après lesquels « C’est débloqué » propose ses offres (le 2e rapport, son repli) : les formules, la suite, le −50 % gardé. */
const RAPPORTS_PAYES: readonly OffreId[] = ["rapport", "premium", "suite", "rapport_garde"];

/** Whop a refusé l’appel, sans rien faire (un 4xx) : ni une panne, ni un délai, ni une réponse illisible, où le paiement a pu partir. */
const refusNet = (e: ErreurWhop) => typeof e.statut === "number" && e.statut >= 400 && e.statut < 500;

/**
 * Une offre de « C’est débloqué » payée en un geste, avec le moyen de paiement gardé d’un achat payé : chez Whop
 * (POST /payments ; l’adresse où le confirmer si la banque le demande), ou par le faux Whop, qui envoie son webhook
 * payment.succeeded juste après la réponse. Null : pas de moyen gardé, ou Whop refuse (le paiement passe alors par la
 * feuille, ou une page de paiement).
 */
async function enUnGeste(f: Fournisseur, compte: Compte, achat: Achat, retour: string): Promise<PaiementCommence | null> {
  const moyen = await moyenGarde(compte.id, f.mode);
  if (!moyen) return null;
  if (f.mode === "factice") {
    const w = webhookDeLIssue(achat, "payer");
    if (w) after(() => recevoirWebhook(w.corps, new Headers(w.entetes)));
    return { achat: achat.id, checkout: null, url: null, paiement: null };
  }
  try {
    const p = await payerEnUnGeste(f.whop, {
      achat: achat.id,
      centimes: achat.centimes,
      titre: titreChezWhop(achat.offre, achat.bulles),
      membre: moyen.membreId,
      moyen: moyen.moyenId,
      retour,
    });
    /*
     * Le paiement créé est rendu (ARG-3) : l’écran le suit avec son identifiant, que le serveur vérifie chez Whop si le
     * webhook tarde, comme un paiement dans la feuille. Sa clé n’est jamais donnée (rien à finir dans le navigateur) :
     * une confirmation de la banque se fait sur la page de Whop (`url`).
     */
    return { achat: achat.id, checkout: null, url: p.confirmer, paiement: { id: p.id, statut: p.confirmer ? "requires_action" : "en_cours", secret: null } };
  } catch (e) {
    /*
     * Seul un refus net de Whop (4xx : rien n’a été débité) passe à une page de paiement. Sans réponse, une réponse
     * illisible ou une panne de Whop, le paiement a pu partir : une page de plus le ferait payer deux fois. L’achat reste
     * en attente et l’acheteur va au retour, qui attend son webhook (aVerifier).
     */
    if (!(e instanceof ErreurWhop)) throw e;
    if (!refusNet(e)) return aVerifier(achat, e);
    journalErreur("paiement en un geste refusé, page de paiement à la place", e, { achat: achat.id });
    return null;
  }
}

/**
 * Whop n’a pas dit si le paiement est parti (pas de réponse à temps, une réponse illisible, une panne) : l’achat reste en
 * attente, sans page ni paiement, et l’écran attend sa livraison sur la page du retour (son webhook le livre s’il a été
 * débité ; sinon la page finit par proposer de réessayer). Le marquer échoué ferait repayer quelqu’un peut-être débité.
 */
function aVerifier(achat: Achat, e: ErreurWhop): PaiementCommence {
  journalErreur("paiement parti sans réponse de Whop, à vérifier par son webhook", e, { achat: achat.id });
  return { achat: achat.id, checkout: null, url: null, paiement: null };
}

/** La page où payer un achat : celle de Whop (sa configuration de paiement, notée sur l’achat), ou celle du faux Whop. */
async function pageDePaiement(f: Fournisseur, achat: Achat, retour: string): Promise<PaiementCommence> {
  const page =
    f.mode === "whop"
      ? await creerConfiguration(f.whop, { achat: achat.id, centimes: achat.centimes, titre: titreChezWhop(achat.offre, achat.bulles), retour })
      : { id: `ch_faux_${achat.id.replaceAll("-", "")}`, url: `/paiement/factice?achat=${achat.id}` };
  await db().update(a).set({ checkoutId: page.id }).where(eq(a.id, achat.id));
  return { achat: achat.id, checkout: page.id, url: page.url, paiement: null };
}

/** Les sous-statuts d’un paiement de Whop refusé pour de bon dès sa création : rien n’est débité, une autre carte peut réessayer. */
const REFUSE_PAR_WHOP = new Set(["failed", "blocked", "canceled", "price_too_low", "uncollectible"]);

/** Le jeton du faux Whop (sa feuille de test, BLUSH_PAIEMENT_FACTICE) : le paiement qu’elle a choisi, payé ou refusé. */
const JETON_FACTICE = /^ctok_faux_(payer|refuser)$/;

/**
 * Le paiement dans la feuille : le jeton de confirmation que les Elements de Whop ont donné au navigateur (la carte,
 * Apple Pay ou Google Pay), payé au prix de l’achat (POST /payments). Rend le paiement créé, que le navigateur finit
 * (« paid » : rien à faire ; sinon une étape, une 3-D Secure, par sa clé), ou « carte » : la banque a dit non, rien
 * n’est débité. Le faux Whop lit son jeton de test : payé, son webhook payment.succeeded part après la réponse.
 * La livraison reste au webhook, ou à la vérification du suivi (etatDeLAchat), jamais à ce que dit le navigateur.
 */
async function dansLaFeuille(f: Fournisseur, compte: Compte, achat: Achat, jeton: string, retour: string): Promise<PaiementCommence | "carte"> {
  if (f.mode === "factice") {
    if (JETON_FACTICE.exec(jeton)?.[1] !== "payer") return "carte";
    const w = webhookDeLIssue(achat, "payer");
    if (!w) return "carte";
    after(() => recevoirWebhook(w.corps, new Headers(w.entetes)));
    const { data } = JSON.parse(w.corps) as { data: { id: string } };
    return { achat: achat.id, checkout: null, url: null, paiement: { id: data.id, statut: "paid", secret: null } };
  }
  const payer = () =>
    payerAvecJeton(f.whop, {
      achat: achat.id,
      centimes: achat.centimes,
      titre: titreChezWhop(achat.offre, achat.bulles),
      jeton,
      email: compte.email,
      retour,
    });
  let p: Awaited<ReturnType<typeof payer>>;
  try {
    /*
     * Une panne de Whop qui répond vite (un 5xx, une réponse illisible) se réessaie une fois, avec le même jeton : sa clé
     * d’idempotence ne paie pas deux fois. Un délai ne se réessaie pas : l’acheteur a déjà attendu.
     */
    p = await payer().catch((e: unknown) => {
      if (e instanceof ErreurWhop && e.statut !== "delai" && !refusNet(e)) return payer();
      throw e;
    });
  } catch (e) {
    /* Whop dit 402 (le paiement refusé) : la carte ; tout autre refus net est le nôtre (un champ, une clé), une panne à voir */
    if (e instanceof ErreurWhop && e.statut === 402) return "carte";
    /* Sans réponse sûre, le paiement a pu partir : on attend son webhook au lieu de dire « panne » (aVerifier) */
    if (e instanceof ErreurWhop && !refusNet(e)) return aVerifier(achat, e);
    throw e;
  }
  if (p.sousStatut && REFUSE_PAR_WHOP.has(p.sousStatut)) return "carte";
  return { achat: achat.id, checkout: null, url: null, paiement: { id: p.id, statut: p.statut, secret: p.secret } };
}

/**
 * Pourquoi un paiement ne commence pas : pas de prestataire (« bientot »), rien à payer (« deja » : l’équipe, un rapport
 * déjà ouvert), le refus de la commande, ou la carte refusée dans la feuille (« carte » : l’achat est échoué, rien n’est
 * débité).
 */
export type RefusDePaiement = "bientot" | "carte" | RefusDeCommande;

/**
 * Commence le paiement d’une offre (la renonciation déjà vérifiée par la route : `renonciation`, sa version et
 * son heure, gardées avec l’achat ; null pour le rapport d’avance, livré seulement à son usage) : l’achat écrit « en_attente » au prix du catalogue (commander : le droit de
 * l’acheter), puis, avec un `jeton` des Elements de Whop, le paiement dans la feuille ; sinon le paiement en un geste
 * (les offres de « C’est débloqué »), ou la page de Whop où le payer.
 * Refusé dans la feuille (« carte »), ou une page que Whop refuse de créer, l’achat passe « echoue » (rien n’a été
 * payé) ; une panne remonte (« panne »). Un paiement dont Whop n’a pas dit s’il est parti (aVerifier) reste en attente,
 * sans paiement : l’écran attend son webhook sur la page du retour. Un paiement parti malgré tout se livre quand même
 * par son webhook (livrer, depuis « echoue »).
 */
export async function commencerPaiement(
  compte: Compte,
  offre: OffreId,
  storyId: string | null,
  renonciation: Consentement | null,
  { jeton = null }: { jeton?: string | null } = {},
): Promise<PaiementCommence | RefusDePaiement> {
  const f = fournisseur();
  if (!f) return "bientot";
  if (estEquipe(compte)) return "deja";
  const achat = await commander(compte, offre, { storyId, fournisseur: f.mode, renonciation: renonciation ?? undefined });
  if (typeof achat === "string") return achat;
  const retour = adresseDuRetour(f, achat.id);
  try {
    if (jeton) {
      const r = await dansLaFeuille(f, compte, achat, jeton, retour);
      if (r === "carte") await marquerEchoue(achat.id);
      return r;
    }
    return (EN_UN_GESTE.has(offre) && (await enUnGeste(f, compte, achat, retour))) || (await pageDePaiement(f, achat, retour));
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

/**
 * Montre une offre unique à ce compte, si le serveur le permet (montrer, src/server/offres-uniques.ts : une fois, jamais
 * deux le même jour) et si elle s’achète : ① la suite, pour la conv de la page, pas encore débloquée ; ③ Premium pour
 * 5 € de plus, juste après un rapport payé (le rapport seul, ou la suite) : sur « C’est débloqué », dont `achatId` est
 * l’achat, payé il y a moins de 15 minutes (DUREE_AJOUT_MS : ni plus tard, ni ailleurs), et montrée, elle expire 15
 * minutes après (une commande passée avant se livre quand même, payée après : livrer ne regarde pas la fin) ; ④ le bonus de la première recharge, tant qu’aucun
 * pack n’a été payé (la recharge l’affiche, et la commande du pack conseillé le prend : commander). Jamais sans
 * prestataire (rien ne s’achèterait), ni à l’équipe. `enUnGeste` : un moyen de paiement est gardé (« Ta carte est
 * enregistrée »). `reste` : le temps qu’il reste à ① à l’heure du serveur, d’où part le compte à rebours de l’écran
 * (l’horloge du téléphone peut être fausse).
 */
export async function proposerOffreUnique(compte: Compte, offre: OffreProposee, storyId: string | null, achatId: string | null = null): Promise<OffreUniqueMontree> {
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
    /* Le compte a déjà mieux pour cette conv : son rapport d’avance (0 €) ou le −50 % gardé (4,95 €) ; ① (6,90 €) ne se montre pas */
    const avoirs = await avoirsDuCompte(compte);
    if (avoirs.avance || avoirs.garde) return rien;
  } else if (offre === "premium_ajout" || offre === "second_rapport" || offre === "garde_second") {
    /* ③ complète le rapport seul ; ⑤ suit tout rapport payé ; ⑥ garde le −50 % de ⑤, montrée et pas prise */
    if (!(await justeApresUnRapport(compte.id, achatId, offre === "premium_ajout" ? RAPPORTS_SEULS : RAPPORTS_PAYES))) return rien;
    if (offre === "garde_second" && !(await offreValable(compte.id, "second_rapport"))) return rien;
  } else {
    /* ④ : la première recharge seulement, aucun pack jamais payé (même repris ensuite) ; commander suit la même règle */
    if (await rechargeDejaPayee(compte.id)) return rien;
  }
  const montree = await montrer(compte, offre, { storyId: offre === "suite" ? storyId : null });
  if (!montree) return rien;
  const enUnGesteGarde = (offre === "premium_ajout" || offre === "second_rapport") && !!(await moyenGarde(compte.id, f.mode));
  const fin = montree.expireLe;
  return { offre, fin: fin?.toISOString() ?? null, reste: fin ? Math.max(0, fin.getTime() - Date.now()) : null, enUnGeste: enUnGesteGarde };
}

/** L’achat `achatId` de ce compte est-il un de ces rapports, payé il y a moins de 15 minutes (DUREE_AJOUT_MS) : « C’est débloqué », juste après le paiement ? */
async function justeApresUnRapport(userId: string, achatId: string | null, offres: readonly OffreId[]): Promise<boolean> {
  if (!achatId || !UUID.test(achatId)) return false;
  const [rapport] = await db()
    .select({ id: a.id })
    .from(a)
    .where(
      and(eq(a.id, achatId), eq(a.userId, userId), eq(a.statut, "paye"), inArray(a.offre, [...offres]), gt(a.payeLe, sql`now() - make_interval(secs => ${DUREE_AJOUT_MS / 1000})`)),
    );
  return !!rapport;
}

/**
 * Ce que la feuille du paiement doit savoir (GET /api/paiement/feuille) : comment payer dans la feuille (les Elements de
 * Whop, sur son compte, en ligne ou dans son bac à sable ; la feuille de test du faux Whop ; ou rien : « bientôt »), et
 * ce que le compte a d’avance pour une conv pas encore débloquée (avoirsDuCompte).
 */
export async function feuilleDuPaiement(compte: Compte): Promise<FeuilleDuPaiement> {
  const f = fournisseur();
  const paiement: FeuilleDuPaiement["paiement"] = !f
    ? { mode: null }
    : f.mode === "factice"
      ? { mode: "factice" }
      : { mode: "whop", compte: f.compte, bacASable: f.whop.bacASable };
  return { paiement, ...(await avoirsDuCompte(compte)) };
}

/**
 * Ce que ce compte a d’avance pour sa prochaine conv : un rapport d’avance (⑤ payé, à utiliser dans l’année), et le −50 %
 * gardé (⑥, 7 jours ; seulement avec un prestataire : il se paie), chacun avec sa fin (une date ISO), ou null. L’équipe,
 * qui ne paie rien, n’en a jamais.
 */
async function avoirsDuCompte(compte: Compte): Promise<Avoirs> {
  if (estEquipe(compte)) return { avance: null, garde: null };
  const [avance, garde] = await Promise.all([avanceDuCompte(compte.id), fournisseur() ? offreValable(compte.id, "garde_second") : null]);
  return { avance: avance && { fin: avance.fin.toISOString() }, garde: garde?.expireLe ? { fin: garde.expireLe.toISOString() } : null };
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
  const bulles = achat.bulles + ((RAPPORTS_SEULS as readonly OffreId[]).includes(achat.offre) ? (ajout?.bulles ?? 0) : 0);
  return { id: achat.id, offre: achat.offre, bulles, storyId: achat.storyId };
}
