import "server-only";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { bullesDe, CATALOGUE, PREMIERE_RECHARGE } from "@/contenu/offres";
import type { OffreId } from "@/types";
import { alerter } from "./alertes";
import type { Utilisateur } from "./auth";
import { mouvementDans } from "./bulles";
import { db, schema } from "./db";
import type { FournisseurPaiement } from "./db/enums";
import { estEquipe } from "./droits";
import { auMieux } from "./journal";
import type { Consentement } from "./juridique";
import { offreValable } from "./offres-uniques";
import { reparerLaChaine } from "./pipeline";

/*
 * Les achats : commandés au prix du catalogue (src/contenu/offres.ts), puis livrés une fois payés, ou repris s’ils sont
 * remboursés ou contestés. Livrer et reprendre sont des transactions qui se rejouent sans effet (un webhook peut arriver
 * deux fois, ou dans le désordre) : l’achat est verrouillé, son statut dit ce qui est déjà fait, et chaque mouvement de
 * bulles ne s’écrit qu’une fois (src/server/bulles.ts). Ce module ne parle à aucun prestataire : la route du paiement
 * (Whop, ou le faux Whop des tests) l’appelle une fois la signature et le montant vérifiés.
 */

export type Achat = typeof schema.achats.$inferSelect;

const a = schema.achats;

/** Pourquoi une commande est refusée : la conv manque (ou n’est pas à lui), son rapport est déjà ouvert, ou l’offre n’est pas (plus) proposée. */
export type RefusDeCommande = "aucune" | "deja" | "offre";

/**
 * Le droit d’acheter cette offre, puis l’achat écrit « en_attente », au prix et avec les bulles du catalogue, figés
 * (jamais un prix venu du navigateur). Une offre qui débloque un rapport s’achète pour une conv du compte, pas encore
 * débloquée (`storyId`) ; une offre unique, seulement montrée et encore valable (src/server/offres-uniques.ts) ; le
 * paiement en plus (③), après un rapport payé. Le pack conseillé prend le bonus de la première recharge (④) s’il est
 * montré et valable. `renonciation` : la case du paiement cochée (renonciationPaiement), gardée avec l’achat. Rend
 * l’achat, ou le refus.
 */
export async function commander(
  compte: Pick<Utilisateur, "id" | "email">,
  offre: OffreId,
  { storyId = null, fournisseur, renonciation = null }: { storyId?: string | null; fournisseur: FournisseurPaiement; renonciation?: Consentement | null },
): Promise<Achat | RefusDeCommande> {
  const c = CATALOGUE[offre];
  if (c.conv) {
    if (!storyId) return "aucune";
    const [s] = await db()
      .select({ debloqueLe: schema.stories.debloqueLe })
      .from(schema.stories)
      .where(and(eq(schema.stories.id, storyId), eq(schema.stories.userId, compte.id)));
    if (!s) return "aucune";
    if (s.debloqueLe || estEquipe(compte)) return "deja";
  }
  if (c.unique) {
    const montree = await offreValable(compte.id, c.unique);
    if (!montree || (c.conv && montree.storyId && montree.storyId !== storyId)) return "offre";
  }
  if (offre === "premium_ajout") {
    const [rapport] = await db()
      .select({ id: a.id })
      .from(a)
      .where(and(eq(a.userId, compte.id), eq(a.statut, "paye"), inArray(a.offre, ["rapport", "suite"])))
      .limit(1);
    if (!rapport) return "offre";
  }
  const premiere = offre === PREMIERE_RECHARGE.offre && !!(await offreValable(compte.id, "premiere_recharge"));
  const [achat] = await db()
    .insert(a)
    .values({
      userId: compte.id,
      storyId: c.conv ? storyId : null,
      offre,
      centimes: c.centimes,
      bulles: bullesDe(offre, { premiereRecharge: premiere }),
      offreUnique: c.unique ?? (premiere ? "premiere_recharge" : null),
      fournisseur,
      renonciationLe: renonciation?.le ?? null,
      renonciationVersion: renonciation?.version ?? null,
    })
    .returning();
  return achat!;
}

/**
 * Verrouille la ligne de la conv dans la transaction d’une livraison ou d’une reprise : deux achats de la même conv,
 * l’un livré pendant que l’autre est repris, passent l’un après l’autre. Sans lui, la reprise ne voit pas l’autre achat
 * payé (sa transaction n’est pas finie) et re-verrouille un rapport bel et bien payé.
 */
const verrouillerLaConv = (tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0], storyId: string) =>
  tx.select({ id: schema.stories.id }).from(schema.stories).where(eq(schema.stories.id, storyId)).for("update");

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
    const [paye] = await tx
      .update(a)
      .set({
        bulles,
        statut: "paye",
        payeLe: sql`now()`,
        annuleLe: null,
        paiementId: paiement.paiementId ?? achat.paiementId,
        checkoutId: paiement.checkoutId ?? achat.checkoutId,
        membreId: paiement.membreId ?? achat.membreId,
        moyenId: paiement.moyenId ?? achat.moyenId,
      })
      .where(eq(a.id, achatId))
      .returning();
    if (!userId) return { effet: "livre", achat: paye!, debloquee: false };
    let debloquee = false;
    if (storyId) {
      const s = schema.stories;
      await verrouillerLaConv(tx, storyId);
      const ouvertes = await tx
        .update(s)
        .set({ debloqueLe: sql`now()` })
        .where(and(eq(s.id, storyId), eq(s.userId, userId), isNull(s.debloqueLe)))
        .returning({ id: s.id });
      debloquee = ouvertes.length > 0;
    }
    if (bulles > 0) await mouvementDans(tx, userId, bulles, "achat", achat.id);
    if (storyId && CATALOGUE[achat.offre].conv)
      await tx
        .update(o)
        .set({ priseLe: sql`now()` })
        .where(and(eq(o.userId, userId), eq(o.offre, "relance_mail"), eq(o.storyId, storyId), isNull(o.priseLe)));
    return { effet: "livre", achat: paye!, debloquee };
  });
  /* Le rapport (et la mémoire) d’une conv qui vient de s’ouvrir : planifiés, puis écrits après la réponse */
  if (r.debloquee && r.achat?.storyId && r.achat.userId) {
    const story = { id: r.achat.storyId, userId: r.achat.userId };
    await auMieux(() => reparerLaChaine(story), "rapport non relancé après la livraison", { achat: achatId });
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
