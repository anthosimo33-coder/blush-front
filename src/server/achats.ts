import "server-only";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { alerteSobre } from "@prompts/lib/titres";
import { bullesDe, CATALOGUE, PREMIERE_RECHARGE, RAPPORT_D_AVANCE, RAPPORTS_SEULS } from "@/contenu/offres";
import { bullesDuLot, DUREE_DU_SECOND_GAGNE_MS, lotSAppliqueA, prixAvecLot } from "@/contenu/roue";
import type { OffreId } from "@/types";
import type { AchatDuCompte } from "@/types/api";
import { alerter } from "./alertes";
import type { Utilisateur } from "./auth";
import { mouvementDans } from "./bulles";
import { compterLeHaut } from "./compteurs";
import { donneesVerdict } from "./depot";
import { db, schema } from "./db";
import type { FournisseurPaiement } from "./db/enums";
import { contexteDe } from "./histoires";
import { estEquipe } from "./droits";
import { auMieux } from "./journal";
import type { Consentement } from "./juridique";
import { offreValable } from "./offres-uniques";
import { recompenserLeParrainage, reprendreLeParrainage } from "./parrainage";
import { reparerLaChaine } from "./pipeline";
import { lotValable } from "./roue";
import { noterAchatAuFil } from "./visites";

/*
 * Les achats : commandés au prix du catalogue (src/contenu/offres.ts), puis livrés une fois payés, ou repris s’ils sont
 * remboursés ou contestés. Livrer et reprendre sont des transactions qui se rejouent sans effet (un webhook peut arriver
 * deux fois, ou dans le désordre) : l’achat est verrouillé, son statut dit ce qui est déjà fait, et chaque mouvement de
 * bulles ne s’écrit qu’une fois (src/server/bulles.ts). Ce module ne parle à aucun prestataire : la route du paiement
 * (Whop, ou le faux Whop des tests) l’appelle une fois la signature et le montant vérifiés.
 */

export type Achat = typeof schema.achats.$inferSelect;

const a = schema.achats;

/** Le délai de rétractation d’un rapport d’avance pas encore utilisé : 14 jours après son achat (les conditions, « livraison »). */
const RETRACTATION_MS = 14 * 24 * 3600e3;

/** Pourquoi une commande est refusée : la conv manque (ou n’est pas à lui), son rapport est déjà ouvert, l’offre n’est pas (plus) proposée, la conv est en alerte, ou trop de paiements attendent déjà. */
export type RefusDeCommande = "aucune" | "deja" | "offre" | "sobre" | "trop";

/**
 * La conv est-elle en mode sobre (une alerte détresse, ou la règle de l’âge : moins de 15 ans, un adulte avec un
 * mineur) ? Son rapport est alors le rapport doux, offert : rien ne s’y vend, ni le rapport, ni sa suite, ni le rapport
 * d’avance. Une alerte « danger » n’y met plus depuis le 21 octobre 2026 (alerteSobre) : son rapport complet se vend
 * comme les autres. Un verdict « danger » gardé avant reste sobre (`mode_sobre`). Sans verdict encore écrit : non.
 */
export async function convEnAlerte(storyId: string): Promise<boolean> {
  const v = await donneesVerdict(storyId);
  return !!v && (v.sortie.mode_sobre || alerteSobre(v.sortie.alerte));
}

/**
 * Combien de commandes jamais payées un compte peut avoir en même temps (des 48 dernières heures) : chacune crée une
 * page chez Whop et peut y être vérifiée ; au-delà, « trop », le temps qu’elles vieillissent (SECA-1). Un acheteur qui
 * hésite en ouvre deux ou trois.
 */
const EN_ATTENTE_MAX = 10;

/** Les recharges : les packs de bulles du catalogue (ni un rapport, ni une offre unique). */
const PACKS_DE_BULLES = (Object.keys(CATALOGUE) as OffreId[]).filter((o) => !CATALOGUE[o].conv && !CATALOGUE[o].unique);

/**
 * Ce compte a-t-il déjà payé une recharge (un pack, même repris ensuite) ? Alors le bonus de la première recharge (④) ne
 * vaut plus : ni montré (proposerOffreUnique), ni donné à la commande, même montré avant.
 */
export async function rechargeDejaPayee(userId: string): Promise<boolean> {
  const [l] = await db()
    .select({ id: a.id })
    .from(a)
    .where(and(eq(a.userId, userId), isNotNull(a.payeLe), inArray(a.offre, PACKS_DE_BULLES)))
    .limit(1);
  return !!l;
}

/**
 * Le droit d’acheter cette offre, puis l’achat écrit « en_attente », au prix et avec les bulles du catalogue, figés
 * (jamais un prix venu du navigateur). Une offre qui débloque un rapport s’achète pour une conv du compte, pas encore
 * débloquée (`storyId`) ; une offre unique, seulement montrée et encore valable (src/server/offres-uniques.ts) ; le
 * paiement en plus (③), après un rapport payé. Le pack conseillé prend le bonus de la première recharge (④) s’il est
 * montré et valable, et qu’aucune recharge n’a encore été payée. Une formule (le rapport, Premium) prend le lot de la
 * roue gagné et encore valable (src/server/roue.ts) : son prix (prixAvecLot) et ses bulles (bullesDuLot), figés eux
 * aussi, et le lot noté sur l’achat, pris à la livraison. `renonciation` : la renonciation au délai de rétractation
 * donnée avec la commande (sa version et son heure), gardée avec l’achat. Rend l’achat, ou le refus.
 */
export async function commander(
  compte: Pick<Utilisateur, "id" | "email">,
  offre: OffreId,
  { storyId = null, fournisseur, renonciation }: { storyId?: string | null; fournisseur: FournisseurPaiement; renonciation?: Consentement },
): Promise<Achat | RefusDeCommande> {
  const c = CATALOGUE[offre];
  const [attente] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(a)
    .where(and(eq(a.userId, compte.id), eq(a.statut, "en_attente"), gt(a.creeLe, sql`now() - interval '48 hours'`)));
  if ((attente?.n ?? 0) >= EN_ATTENTE_MAX) return "trop";
  if (c.conv) {
    if (!storyId) return "aucune";
    const [s] = await db()
      .select({ debloqueLe: schema.stories.debloqueLe })
      .from(schema.stories)
      .where(and(eq(schema.stories.id, storyId), eq(schema.stories.userId, compte.id)));
    if (!s) return "aucune";
    if (s.debloqueLe || estEquipe(compte)) return "deja";
    if (await convEnAlerte(storyId)) return "sobre";
  }
  if (c.unique) {
    const montree = await offreValable(compte.id, c.unique);
    if (!montree || (c.conv && montree.storyId && montree.storyId !== storyId)) return "offre";
  }
  if (offre === "premium_ajout") {
    const [rapport] = await db()
      .select({ id: a.id })
      .from(a)
      .where(and(eq(a.userId, compte.id), eq(a.statut, "paye"), inArray(a.offre, RAPPORTS_SEULS)))
      .limit(1);
    if (!rapport) return "offre";
  }
  /* ④ : montré et valable, et toujours la première recharge (un autre pack payé depuis l’a passée : la feuille ne le montre plus) */
  const premiere = offre === PREMIERE_RECHARGE.offre && !!(await offreValable(compte.id, "premiere_recharge")) && !(await rechargeDejaPayee(compte.id));
  /* Le lot de la roue, sur une formule seulement (et Premium au prix du rapport, sur Premium seulement) */
  const gagne = c.conv && !c.unique ? await lotValable(compte.id) : null;
  const lot = gagne && lotSAppliqueA(gagne, offre) ? gagne : null;
  const [achat] = await db()
    .insert(a)
    .values({
      userId: compte.id,
      storyId: c.conv ? storyId : null,
      offre,
      centimes: prixAvecLot(offre, lot).centimes,
      bulles: bullesDe(offre, { premiereRecharge: premiere }) + bullesDuLot(lot),
      lotRoue: lot,
      offreUnique: c.unique ?? (premiere ? "premiere_recharge" : null),
      fournisseur,
      renonciationVersion: renonciation?.version ?? null,
      renonciationLe: renonciation?.le ?? null,
    })
    .returning();
  return achat!;
}

/** Une transaction de la base, telle que db().transaction la donne. */
type Transaction = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/**
 * Verrouille la ligne de la conv dans la transaction d’une livraison ou d’une reprise : deux achats de la même conv,
 * l’un livré pendant que l’autre est repris, passent l’un après l’autre. Sans lui, la reprise ne voit pas l’autre achat
 * payé (sa transaction n’est pas finie) et re-verrouille un rapport bel et bien payé.
 */
const verrouillerLaConv = (tx: Transaction, storyId: string) => tx.select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.id, storyId)).for("update");

/** Ce que le prestataire dit du paiement à la livraison : ses identifiants, à garder sur l’achat (le paiement en un geste). */
export type Paiement = { paiementId?: string | null; checkoutId?: string | null; membreId?: string | null; moyenId?: string | null };

/**
 * Ce qu’une livraison a fait : livré, déjà livré, rien (l’achat est déjà repris, ou inconnu), ou rien parce que l’offre
 * unique à prix réduit dont il profite a déjà été prise par un autre achat (« offre » : l’achat reste en attente, à
 * rembourser). `debloquee` : la conv vient de s’ouvrir.
 */
export type Livraison = { effet: "livre" | "deja" | "annule" | "inconnu" | "offre"; achat: Achat | null; debloquee: boolean };

/**
 * Livre un achat payé, une fois, dans une transaction : l’achat passe « paye » (avec les identifiants du paiement), sa
 * conv se débloque, ses bulles sont créditées, l’offre unique dont il profite est prise (et le mail de relance de cette
 * conv, s’il a été envoyé, compte comme pris). Rejouée : « deja », rien ne change. Un achat déjà remboursé ou contesté
 * (le webhook du remboursement arrivé avant celui du paiement) n’est pas livré. Une offre unique ne profite qu’à un
 * achat : deux commandes passées tant qu’elle valait (deux onglets, un nouvel essai), payées toutes les deux, n’en
 * livrent qu’une à son prix réduit. L’autre n’est pas livrée (« offre », l’achat reste en attente : à rembourser), sauf
 * la première recharge, payée au prix normal du pack : livrée sans son bonus. Une fois la conv débloquée, la chaîne du
 * rapport repart après la réponse (reparerLaChaine, comme au déblocage d’avant).
 */
export async function livrer(achatId: string, paiement: Paiement = {}): Promise<Livraison> {
  const r = await db().transaction(async (tx): Promise<Livraison> => {
    const [achat] = await tx.select().from(a).where(eq(a.id, achatId)).for("update");
    if (!achat) return { effet: "inconnu", achat: null, debloquee: false };
    if (achat.statut === "paye") return { effet: "deja", achat, debloquee: false };
    if (achat.statut === "rembourse" || achat.statut === "conteste") return { effet: "annule", achat, debloquee: false };
    const { userId, storyId } = achat;
    const o = schema.offresUniques;
    /*
     * L’offre unique dont il profite, prise ici, une fois : sa ligne se verrouille (deux achats de la même offre livrés en
     * même temps passent l’un après l’autre). Déjà prise par un autre achat : ni le prix réduit, ni le bonus
     */
    let bulles = achat.bulles;
    if (userId && achat.offreUnique) {
      const prise = await tx
        .update(o)
        .set({ priseLe: sql`now()` })
        .where(and(eq(o.userId, userId), eq(o.offre, achat.offreUnique), isNull(o.priseLe)))
        .returning({ offre: o.offre });
      if (!prise.length) {
        if (achat.offreUnique !== "premiere_recharge") return { effet: "offre", achat, debloquee: false };
        bulles = bullesDe(achat.offre);
      }
    }
    /*
     * Le lot de la roue dont il profite, pris ici, une fois, comme une offre unique. Déjà pris par un autre achat : des
     * bulles en plus se livrent sans elles ; un prix réduit ne se livre pas (« offre », à rembourser). Le 2e rapport à
     * −50 % gagné se garde 30 jours pour une autre conv (le −50 % gardé, ⑥), s’il ne l’est pas déjà.
     */
    if (userId && achat.lotRoue) {
      const r = schema.roue;
      const pris = await tx
        .update(r)
        .set({ priseLe: sql`now()`, achatId: achat.id })
        .where(and(eq(r.userId, userId), eq(r.lot, achat.lotRoue), isNull(r.priseLe)))
        .returning({ lot: r.lot });
      if (!pris.length) {
        if (bullesDuLot(achat.lotRoue) === 0 && achat.lotRoue !== "second50") return { effet: "offre", achat, debloquee: false };
        bulles -= bullesDuLot(achat.lotRoue);
      } else if (achat.lotRoue === "second50") {
        await tx
          .insert(o)
          .values({ userId, offre: "garde_second", expireLe: sql`now() + make_interval(secs => ${DUREE_DU_SECOND_GAGNE_MS / 1000})` })
          .onConflictDoNothing();
      }
    }
    /*
     * Le moyen de paiement n’est gardé (pour payer ensuite en un geste, moyenGarde) que d’un paiement fait dans BLUSH, par
     * le compte (la feuille, à son email ; ou déjà en un geste). Payé sur la page de Whop (une configuration de paiement,
     * son lien ouvrable par n’importe qui), le moyen est celui de qui a payé : peut-être un autre, à qui on ne débitera
     * jamais rien d’autre.
     */
    const pageDeWhop = !!(achat.checkoutId ?? paiement.checkoutId);
    const [paye] = await tx
      .update(a)
      .set({
        bulles,
        statut: "paye",
        payeLe: sql`now()`,
        annuleLe: null,
        paiementId: paiement.paiementId ?? achat.paiementId,
        checkoutId: paiement.checkoutId ?? achat.checkoutId,
        membreId: pageDeWhop ? null : (paiement.membreId ?? achat.membreId),
        moyenId: pageDeWhop ? null : (paiement.moyenId ?? achat.moyenId),
      })
      .where(eq(a.id, achatId))
      .returning();
    if (!userId) return { effet: "livre", achat: paye!, debloquee: false };
    const debloquee = storyId ? await ouvrirLaConv(tx, userId, storyId) : false;
    if (bulles > 0) await mouvementDans(tx, userId, bulles, "achat", achat.id);
    /* Son premier rapport payé, venue par le lien d’une amie : les bulles du parrainage, à elle et à sa marraine */
    if (debloquee) await recompenserLeParrainage(tx, userId);
    return { effet: "livre", achat: paye!, debloquee };
  });
  /* Au fil du direct d’/admin : la ville de son paiement ouvert, l’offre (jamais le compte) */
  if (r.effet === "livre" && r.achat) await noterAchatAuFil(r.achat);
  if (r.debloquee && r.achat) await relancerLaChaine(r.achat, "rapport non relancé après la livraison");
  if (r.debloquee && r.achat?.storyId) await compterLeHautPaye(r.achat.storyId);
  return r;
}

/** Le titre du haut du paywall de cette conv (gardé dans son contexte), compté comme payé (/admin) ; rien sans lui. */
async function compterLeHautPaye(storyId: string): Promise<void> {
  await auMieux(async () => {
    const [story] = await db().select({ context: schema.stories.context }).from(schema.stories).where(eq(schema.stories.id, storyId));
    const genre = story ? contexteDe(story)?.accroche : undefined;
    if (genre) await compterLeHaut(genre, "paye");
  }, "titre du paywall non compté");
}

/**
 * Les rapports payés ces 30 derniers jours, Premium d’un côté, le rapport seul (le rapport, la suite, le −50 % gardé)
 * de l’autre ; remboursés et contestés ôtés.
 */
export async function ventesDesFormules(): Promise<{ premium: number; seuls: number }> {
  const [v] = await db()
    .select({
      premium: sql<number>`count(*) filter (where ${eq(a.offre, "premium")})::int`,
      seuls: sql<number>`count(*) filter (where ${inArray(a.offre, [...RAPPORTS_SEULS])})::int`,
    })
    .from(a)
    .where(and(eq(a.statut, "paye"), gt(a.payeLe, sql`now() - interval '30 days'`)));
  return { premium: v?.premium ?? 0, seuls: v?.seuls ?? 0 };
}

/**
 * « Le plus choisi » sur Premium (le badge du paywall) : vrai seulement si, ces 30 derniers jours, Premium s’est payée
 * plus souvent que le rapport seul. Sans vente, faux : le badge reste « Conseillé ».
 */
export async function premiumLePlusChoisi(): Promise<boolean> {
  const { premium, seuls } = await ventesDesFormules();
  return premium > seuls;
}

/**
 * Débloque le rapport de cette conv du compte, dans la transaction d’une livraison ou d’un rapport d’avance utilisé : la
 * conv verrouillée (verrouillerLaConv), ouverte si elle ne l’était pas, et le mail de relance de cette conv, s’il a été
 * envoyé, compté comme pris. Vrai si elle vient de s’ouvrir.
 */
async function ouvrirLaConv(tx: Transaction, userId: string, storyId: string): Promise<boolean> {
  const s = schema.stories;
  const o = schema.offresUniques;
  await verrouillerLaConv(tx, storyId);
  const ouvertes = await tx
    .update(s)
    .set({ debloqueLe: sql`now()` })
    .where(and(eq(s.id, storyId), eq(s.userId, userId), isNull(s.debloqueLe)))
    .returning({ id: s.id });
  await tx
    .update(o)
    .set({ priseLe: sql`now()` })
    .where(and(eq(o.userId, userId), eq(o.offre, "relance_mail"), eq(o.storyId, storyId), isNull(o.priseLe)));
  return ouvertes.length > 0;
}

/**
 * Le paywall passe avant la lecture (16 octobre) : une conv payée peut lever une alerte qui la met en mode sobre
 * (détresse, mineur ; « danger » se vend depuis le 21 octobre 2026), et le mode sobre ne se vend jamais. Son rapport doux reste offert ; ses achats payés sont signalés à l’équipe, qui les rembourse chez
 * Whop (le webhook du remboursement les reprend). Rien de la conv dans l’alerte : la tâche, l’achat, le montant.
 * TODO(produit): rembourser tout seul par l’API de Whop, une fois son appel vérifié.
 */
export async function signalerLesAchatsDUneAlerte(storyId: string, alerte: string): Promise<void> {
  const a = schema.achats;
  const payes = await db()
    .select({ id: a.id, offre: a.offre, centimes: a.centimes, fournisseur: a.fournisseur })
    .from(a)
    .where(and(eq(a.storyId, storyId), eq(a.statut, "paye")));
  if (!payes.length) return;
  await alerter(
    "à rembourser : une conv payée lève une alerte",
    [
      `Histoire ${storyId}`,
      `Alerte : ${alerte}`,
      ...payes.map((p) => `Achat ${p.id} · ${p.offre} · ${(p.centimes / 100).toFixed(2)} € · ${p.fournisseur}`),
      "À rembourser chez Whop : une alerte ne se vend pas.",
    ],
    { importante: true },
  );
}

/** Le rapport (et la mémoire) de la conv qu’un achat vient d’ouvrir : planifiés, puis écrits après la réponse. */
async function relancerLaChaine(achat: Achat, quoi: string): Promise<void> {
  if (!achat.storyId || !achat.userId) return;
  const story = { id: achat.storyId, userId: achat.userId };
  await auMieux(() => reparerLaChaine(story), quoi, { achat: achat.id });
}

/** Le rapport d’avance encore valable : payé (ni repris, ni échoué) il y a moins d’un an, et pas encore utilisé. */
const avanceValable = (userId: string) =>
  and(
    eq(a.userId, userId),
    eq(a.offre, RAPPORT_D_AVANCE.offre),
    eq(a.statut, "paye"),
    isNull(a.utiliseLe),
    gt(a.payeLe, sql`now() - make_interval(secs => ${RAPPORT_D_AVANCE.dureeMs / 1000})`),
  );

/** Le rapport d’avance que la prochaine conv de ce compte utiliserait (le plus ancien encore valable), et sa fin ; ou null. */
export async function avanceDuCompte(userId: string): Promise<{ achat: string; fin: Date } | null> {
  const [l] = await db().select({ id: a.id, payeLe: a.payeLe }).from(a).where(avanceValable(userId)).orderBy(asc(a.payeLe)).limit(1);
  return l?.payeLe ? { achat: l.id, fin: new Date(l.payeLe.getTime() + RAPPORT_D_AVANCE.dureeMs) } : null;
}

/** Pourquoi un rapport d’avance ne s’utilise pas : aucun n’est valable (« offre »), la conv manque (« aucune »), ou son rapport est déjà ouvert (« deja »). */
export type RefusDAvance = "offre" | "aucune" | "deja" | "sobre";

/**
 * Utilise le rapport d’avance de ce compte (le plus ancien encore valable) pour cette conv, à lui et pas encore
 * débloquée, dans une transaction : l’achat garde la conv (storyId), l’heure (utiliseLe), les bulles du rapport, qu’il
 * crédite, et la renonciation au délai de rétractation que ce geste donne ; la conv s’ouvre, et sa chaîne repart après
 * la réponse, comme après une livraison. Ensuite, l’achat vit comme un rapport payé : remboursé ou contesté, il
 * re-verrouille sa conv et reprend ses bulles (reprendre). L’achat se verrouille avant la conv, dans l’ordre de livrer
 * et de reprendre : deux transactions qui s’attendraient l’une l’autre s’annuleraient. Rend l’achat utilisé, ou le refus.
 */
export async function utiliserAvance(compte: Pick<Utilisateur, "id" | "email">, storyId: string, renonciation: Consentement): Promise<Achat | RefusDAvance> {
  if (estEquipe(compte)) return "deja";
  /* Une conv en alerte ne se paie pas, même d’avance : son rapport doux est offert */
  if (await convEnAlerte(storyId)) return "sobre";
  const r = await db().transaction(async (tx): Promise<Achat | RefusDAvance> => {
    const [avance] = await tx.select({ id: a.id }).from(a).where(avanceValable(compte.id)).orderBy(asc(a.payeLe)).limit(1).for("update");
    if (!avance) return "offre";
    /* La conv lue sous son verrou : un paiement livré au même moment l’a ouverte avant, ou attend la fin de celle-ci */
    const [s] = await tx
      .select({ debloqueLe: schema.stories.debloqueLe })
      .from(schema.stories)
      .where(and(eq(schema.stories.id, storyId), eq(schema.stories.userId, compte.id)))
      .for("update");
    if (!s) return "aucune";
    if (s.debloqueLe) return "deja";
    const [utilise] = await tx
      .update(a)
      .set({ storyId, utiliseLe: sql`now()`, bulles: RAPPORT_D_AVANCE.bulles, renonciationVersion: renonciation.version, renonciationLe: renonciation.le })
      .where(eq(a.id, avance.id))
      .returning();
    await ouvrirLaConv(tx, compte.id, storyId);
    await mouvementDans(tx, compte.id, RAPPORT_D_AVANCE.bulles, "achat", avance.id);
    return utilise!;
  });
  if (typeof r !== "string") {
    await relancerLaChaine(r, "rapport non relancé après le rapport d’avance");
    await compterLeHautPaye(storyId);
  }
  return r;
}

/** Ce qu’une reprise a fait : repris (la conv re-verrouillée, les bulles retirées), déjà repris, rien à reprendre (jamais livré), ou l’achat inconnu. */
export type Reprise = { effet: "repris" | "deja" | "rien" | "inconnu"; achat: Achat | null };

/**
 * Reprend un achat remboursé ou contesté, une fois, dans une transaction : l’achat passe à ce statut, sa conv se
 * re-verrouille (si aucun autre achat payé ne la débloque), ses bulles sont retirées, même si le solde passe sous zéro (le
 * chat demande alors une recharge). Un achat jamais livré passe à ce statut sans rien reprendre (il ne sera plus livré).
 * Rejouée : « deja ». L’équipe est prévenue de chaque reprise.
 */
export async function reprendre(achatId: string, statut: "rembourse" | "conteste"): Promise<Reprise> {
  const r = await db().transaction(async (tx): Promise<Reprise> => {
    const [achat] = await tx.select().from(a).where(eq(a.id, achatId)).for("update");
    if (!achat) return { effet: "inconnu", achat: null };
    if (achat.statut === "rembourse" || achat.statut === "conteste") return { effet: "deja", achat };
    const [repris] = await tx
      .update(a)
      .set({ statut, annuleLe: sql`now()` })
      .where(eq(a.id, achatId))
      .returning();
    if (achat.statut !== "paye") return { effet: "rien", achat: repris! };
    const { userId, storyId } = achat;
    if (storyId) {
      const s = schema.stories;
      /* Verrouillée d’abord : un autre achat de cette conv en train d’être livré a fini, et compte comme payé ci-dessous */
      await verrouillerLaConv(tx, storyId);
      const autre = tx
        .select({ un: sql`1` })
        .from(a)
        .where(and(eq(a.storyId, storyId), eq(a.statut, "paye"), ne(a.id, achatId)));
      await tx
        .update(s)
        .set({ debloqueLe: null })
        .where(and(eq(s.id, storyId), sql`not exists (${autre})`));
    }
    if (userId && achat.bulles > 0) await mouvementDans(tx, userId, -achat.bulles, "remboursement", achat.id);
    /* Son rapport repris : les bulles du parrainage aussi, s’il ne lui en reste aucun de payé */
    if (userId && storyId) await reprendreLeParrainage(tx, userId);
    return { effet: "repris", achat: repris! };
  });
  if (r.effet === "repris" && r.achat)
    await alerter(statut === "rembourse" ? "paiement remboursé" : "paiement contesté", [
      `Achat ${r.achat.id} (${r.achat.offre}, ${r.achat.centimes} centimes) : ${statut === "rembourse" ? "remboursé" : "contesté"}.`,
      r.achat.storyId ? "Sa conv est re-verrouillée, ses bulles retirées." : "Ses bulles sont retirées.",
    ]);
  return r;
}

/** Un paiement refusé ou abandonné : l’achat encore en attente passe « echoue » (rien n’a été livré). Vrai s’il a changé. */
export async function marquerEchoue(achatId: string): Promise<boolean> {
  const lignes = await db()
    .update(a)
    .set({ statut: "echoue", annuleLe: sql`now()` })
    .where(and(eq(a.id, achatId), eq(a.statut, "en_attente")))
    .returning({ id: a.id });
  return lignes.length > 0;
}

/**
 * Traite un webhook de paiement une fois : déjà noté (son `webhook-id`, evenements_paiement), il est ignoré (« deja ») ;
 * sinon `travail` le traite, puis il est noté. Noté seulement après : un traitement qui échoue sera rejoué par le
 * prestataire. Deux livraisons du même webhook en même temps font deux fois le travail, que livrer et reprendre rendent
 * sans effet la seconde fois.
 */
export async function uneFoisParEvenement<T>(id: string, type: string, travail: () => Promise<T>): Promise<T | "deja"> {
  const e = schema.evenementsPaiement;
  const [vu] = await db().select({ id: e.id }).from(e).where(eq(e.id, id));
  if (vu) return "deja";
  const r = await travail();
  await db().insert(e).values({ id, type }).onConflictDoNothing();
  return r;
}

/**
 * Débloque le rapport d’une conv sans paiement (l’outil de l’équipe,
 * scripts/acces.mts) : vrai si elle vient de s’ouvrir. Puis ce qui manque (le rapport, la mémoire) part après la réponse.
 */
export async function offrirLeRapport(story: { id: string; userId: string }): Promise<boolean> {
  const s = schema.stories;
  const ouvertes = await db()
    .update(s)
    .set({ debloqueLe: sql`now()` })
    .where(and(eq(s.id, story.id), eq(s.userId, story.userId), isNull(s.debloqueLe)))
    .returning({ id: s.id });
  await reparerLaChaine(story);
  return ouvertes.length > 0;
}

/** Combien d’achats « Tes achats » montre au plus : les plus récents. */
const ACHATS_MONTRES = 100;

/**
 * Les achats de ce compte pour « Tes achats » (Mon compte), du plus récent au plus ancien : ceux qui ont été payés, même
 * repris ensuite (remboursés, contestés). Une commande jamais payée (la page de paiement quittée, une carte refusée)
 * n’en est pas un. Rien de la conv : l’offre, le prix, les bulles, le statut et le jour du paiement.
 */
export async function achatsDuCompte(userId: string): Promise<AchatDuCompte[]> {
  const lignes = await db()
    .select({ id: a.id, offre: a.offre, centimes: a.centimes, bulles: a.bulles, statut: a.statut, payeLe: a.payeLe, utiliseLe: a.utiliseLe })
    .from(a)
    .where(and(eq(a.userId, userId), isNotNull(a.payeLe)))
    .orderBy(desc(a.payeLe), desc(a.creeLe))
    .limit(ACHATS_MONTRES);
  return lignes.map(({ payeLe, utiliseLe, ...l }) => {
    const le = payeLe!;
    /* Le rapport d’avance : jusqu’à quand il vaut, quand il a servi, et le délai de rétractation tant qu’il attend (SUP14-2) */
    const avance =
      l.offre === RAPPORT_D_AVANCE.offre
        ? {
            fin: new Date(le.getTime() + RAPPORT_D_AVANCE.dureeMs).toISOString(),
            utiliseLe: utiliseLe?.toISOString() ?? null,
            retractation: utiliseLe || Date.now() - le.getTime() > RETRACTATION_MS ? null : new Date(le.getTime() + RETRACTATION_MS).toISOString(),
          }
        : undefined;
    return { ...l, le: le.toISOString(), ...(avance && { avance }) };
  });
}
