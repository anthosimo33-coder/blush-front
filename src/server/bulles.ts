import "server-only";
import { and, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { COUT_EN_BULLES } from "@/contenu/offres";
import { PACKS } from "@/contenu/recharge";
import type { BlushAnswer } from "@/types";
import type { Utilisateur } from "./auth";
import { db, schema } from "./db";
import type { RaisonBulles } from "./db/enums";
import { estEquipe } from "./droits";
import { ErreurInvariant } from "./erreurs";
import { reponseDuCompte } from "./historique";

/*
 * Les bulles : une réponse de BLUSH en coûte (COUT_EN_BULLES, src/contenu/offres.ts). Le solde (users.bulles) ne change
 * jamais sans sa ligne au journal (mouvements_bulles), dans la même transaction ; une raison et sa référence ne s’y
 * écrivent qu’une fois (l’index unique) : un achat livré deux fois, un webhook rejoué, deux débits de la même réponse ne
 * comptent qu’une fois. Une dépense ne fait jamais passer le solde sous zéro (deux débits en même temps sur la dernière
 * bulle : un seul passe) ; un remboursement le peut (reprendre, src/server/achats.ts). L’équipe (BLUSH_ACCES_LIBRE) a des
 * bulles illimitées : elles ne se débitent jamais.
 * Les références : l’id de l’achat (« achat », « remboursement »), celui du compte (« beta »), celui que choisit
 * l’appelant pour une réponse (« reponse », puis « rendu » sous la même référence), une par réponse.
 */

/** Une transaction de drizzle, ou la base : de quoi écrire un mouvement dans la transaction d’un autre (livrer, reprendre). */
type Executeur = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

/** Le compte d’une dépense : son id, et son email (l’équipe ne paie pas). */
type Compte = Pick<Utilisateur, "id" | "email">;

/* Levée dans la transaction d’un débit que le solde ne couvre pas : elle annule le mouvement déjà écrit */
class SoldeInsuffisant extends Error {}

/**
 * Ce que coûte une réponse de BLUSH (COUT_EN_BULLES) : un message qui joint des captures ou un export, une réponse en
 * vocal, ou une réponse écrite. Les captures ne s’ajoutent pas au vocal : la plus chère des deux.
 */
export const coutDe = ({ ajout, vocal }: { ajout: boolean; vocal: boolean }): number => (ajout ? COUT_EN_BULLES.ajout : vocal ? COUT_EN_BULLES.vocal : COUT_EN_BULLES.reponse);

/** Le solde de bulles du compte, lu en base (0 pour un compte qui n’existe plus). */
export async function soldeDe(userId: string): Promise<number> {
  const [u] = await db().select({ bulles: schema.users.bulles }).from(schema.users).where(eq(schema.users.id, userId));
  return u?.bulles ?? 0;
}

/**
 * Écrit un mouvement de `delta` bulles et change le solde d’autant, dans la transaction `tx` : vrai s’il est écrit, faux
 * si cette raison et cette référence l’étaient déjà (rien ne change). Le solde peut passer sous zéro : pour une dépense,
 * debiter.
 */
export async function mouvementDans(tx: Executeur, userId: string, delta: number, raison: RaisonBulles, ref: string): Promise<boolean> {
  if (!Number.isSafeInteger(delta) || delta === 0) throw new ErreurInvariant("bulles:delta");
  const m = schema.mouvementsBulles;
  const [ecrit] = await tx.insert(m).values({ userId, delta, raison, ref }).onConflictDoNothing().returning({ id: m.id });
  if (!ecrit) return false;
  await tx
    .update(schema.users)
    .set({ bulles: sql`${schema.users.bulles} + ${delta}` })
    .where(eq(schema.users.id, userId));
  return true;
}

/**
 * Crédite (ou retire, `n` négatif) des bulles au compte, une fois pour cette raison et cette référence : vrai si c’est
 * fait, faux si c’était déjà fait. Pour un don de l’équipe (« equipe », scripts/acces.mts) ou un cadeau ; un achat passe
 * par livrer (src/server/achats.ts), qui crédite dans sa transaction.
 */
export const crediter = (userId: string, n: number, raison: Exclude<RaisonBulles, "reponse" | "rendu">, ref: string) =>
  db().transaction((tx) => mouvementDans(tx, userId, n, raison, ref));

/** Ce qu’un débit a fait : débité, déjà débité pour cette réponse, rien (un compte de l’équipe), ou le solde ne suffit pas. */
export type Debit = "debite" | "deja" | "equipe" | "insuffisant";

/*
 * Le débit, dans la transaction `tx` : le mouvement d’abord (déjà là : « deja »), puis le solde, seulement s’il couvre le
 * coût. Postgres verrouille la ligne du compte : un second débit en même temps attend le premier, puis relit le solde, et
 * ne le trouve plus suffisant. Sinon, SoldeInsuffisant annule la transaction (le mouvement avec).
 */
async function debiterDans(tx: Executeur, compte: Compte, cout: number, ref: string): Promise<Exclude<Debit, "insuffisant">> {
  if (!Number.isSafeInteger(cout) || cout <= 0) throw new ErreurInvariant("bulles:cout");
  if (estEquipe(compte)) return "equipe";
  const m = schema.mouvementsBulles;
  const [ecrit] = await tx.insert(m).values({ userId: compte.id, delta: -cout, raison: "reponse", ref }).onConflictDoNothing().returning({ id: m.id });
  if (!ecrit) return "deja";
  const u = schema.users;
  const [paye] = await tx
    .update(u)
    .set({ bulles: sql`${u.bulles} - ${cout}` })
    .where(and(eq(u.id, compte.id), gte(u.bulles, cout)))
    .returning({ id: u.id });
  if (!paye) throw new SoldeInsuffisant();
  return "debite";
}

/**
 * Débite `cout` bulles pour une réponse de BLUSH (`ref` : la sienne, une par réponse), atomiquement, sans jamais passer
 * sous zéro : « insuffisant » si le solde ne le couvre pas (rien n’est écrit), « deja » si cette réponse est déjà payée,
 * « equipe » pour un compte de l’équipe (rien n’est débité). Une réponse qui échoue, ou qui sort en alerte danger, se
 * rend (rendre).
 */
export async function debiter(compte: Compte, cout: number, ref: string): Promise<Debit> {
  try {
    return await db().transaction((tx) => debiterDans(tx, compte, cout, ref));
  } catch (e) {
    if (e instanceof SoldeInsuffisant) return "insuffisant";
    throw e;
  }
}

/**
 * Rend les bulles d’une réponse débitée (`ref`, celle du débit) : la réponse a échoué, ou elle est sortie en alerte danger
 * (offerte). `n` : une partie seulement, jamais plus que le débit (une réponse attendue en vocal, restée écrite). Une
 * fois par réponse : vrai si elles sont rendues, faux s’il n’y avait rien à rendre (jamais débitée, l’équipe) ou si
 * c’était déjà fait.
 */
export async function rendre(compte: Pick<Utilisateur, "id">, ref: string, n?: number): Promise<boolean> {
  const m = schema.mouvementsBulles;
  return db().transaction(async (tx) => {
    const [debit] = await tx
      .select({ delta: m.delta })
      .from(m)
      .where(and(eq(m.raison, "reponse"), eq(m.ref, ref), eq(m.userId, compte.id)));
    const rendues = debit ? Math.min(n ?? -debit.delta, -debit.delta) : 0;
    return rendues > 0 && (await mouvementDans(tx, compte.id, rendues, "rendu", ref));
  });
}

/* ———— La réponse verrouillée (à 0 bulle) ———— */

/** La référence du débit d’une réponse verrouillée, payée à la recharge : son message. */
export const refDuMessage = (messageId: number) => `message:${messageId}`;

/**
 * La référence du débit d’une réponse demandée par un envoi qui porte sa clé (POST /api/chat, `cle` : la même pour
 * « Réessayer ») : un message n’est jamais débité deux fois. Avec le compte : la clé vient du navigateur.
 */
export const refDeLEnvoi = (userId: string, cle: string) => `envoi:${userId}:${cle}`;

/** Les bulles de ce débit (`ref`) ont-elles été rendues (la réponse a échoué) ? */
export async function rendues(userId: string, ref: string): Promise<boolean> {
  const m = schema.mouvementsBulles;
  const [l] = await db()
    .select({ id: m.id })
    .from(m)
    .where(and(eq(m.raison, "rendu"), eq(m.ref, ref), eq(m.userId, userId)))
    .limit(1);
  return !!l;
}

/**
 * La réponse de BLUSH verrouillée qui attend d’être payée, pour ce compte (une au plus : la suivante demande la
 * recharge, sans appel au modèle), ou null. Elle reste en base, chiffrée : ce qui se paie n’est jamais envoyé avant
 * (src/server/historique.ts, reponseMasquee). `ex` : la transaction qui la cherche (garderVerrouillee), sinon la base.
 */
export async function reponseVerrouillee(userId: string, ex: Pick<Executeur, "select"> = db()): Promise<{ id: number; storyId: string; cout: number } | null> {
  const c = schema.chatMessages;
  const [r] = await ex
    .select({ id: c.id, storyId: c.storyId, cout: c.cout })
    .from(c)
    .innerJoin(schema.stories, eq(schema.stories.id, c.storyId))
    .where(and(eq(schema.stories.userId, userId), eq(c.verrouillee, true)))
    .orderBy(c.id)
    .limit(1);
  return r ? { ...r, cout: r.cout ?? 1 } : null;
}

/*
 * Une recharge (un pack de bulles, src/contenu/recharge.ts) payée par ce compte depuis que la réponse `messageId` s’est
 * écrite, et toujours payée (une recharge remboursée ou contestée ne compte plus) : elle paie cette réponse
 * (deverrouiller). Les deux heures comparées dans la base, à la microseconde
 */
async function rechargeDepuis(tx: Pick<Executeur, "select">, userId: string, messageId: number): Promise<boolean> {
  const a = schema.achats;
  const c = schema.chatMessages;
  const ecrite = sql`(select ${c.createdAt} from ${c} where ${c.id} = ${messageId})`;
  const [r] = await tx
    .select({ id: a.id })
    .from(a)
    .where(and(eq(a.userId, userId), eq(a.statut, "paye"), inArray(a.offre, [...PACKS]), gt(a.payeLe, ecrite)))
    .limit(1);
  return !!r;
}

/**
 * Débloque une réponse verrouillée de ce compte, dans une transaction. Une recharge payée depuis qu’elle s’est écrite
 * la paie (le prototype validé des bulles : rechargé, le solde devient l’ancien plus les bulles achetées, et la réponse
 * prête est là) : « offerte », sans débit, son coût passe à null (offerte, comme une alerte), et une seule réponse en
 * profite (il n’y en a qu’une en attente par compte, et la suivante s’écrit après cette recharge). Sinon (des bulles
 * données, un rapport payé), son coût est débité : « deverrouillee », ou « insuffisant » (le solde ne couvre toujours
 * pas : rien ne change). « aucune » : pas de réponse verrouillée de ce compte sous cet id (déjà débloquée, ou pas la
 * sienne).
 */
export async function deverrouiller(compte: Compte, messageId: number): Promise<"deverrouillee" | "offerte" | "insuffisant" | "aucune"> {
  const c = schema.chatMessages;
  try {
    return await db().transaction(async (tx) => {
      const [r] = await tx
        .select({ cout: c.cout })
        .from(c)
        .innerJoin(schema.stories, eq(schema.stories.id, c.storyId))
        .where(and(eq(c.id, messageId), eq(c.verrouillee, true), eq(schema.stories.userId, compte.id)))
        .for("update", { of: c });
      if (!r) return "aucune";
      if (await rechargeDepuis(tx, compte.id, messageId)) {
        await tx.update(c).set({ verrouillee: false, cout: null }).where(eq(c.id, messageId));
        return "offerte";
      }
      await debiterDans(tx, compte, r.cout ?? 1, refDuMessage(messageId));
      await tx.update(c).set({ verrouillee: false }).where(eq(c.id, messageId));
      return "deverrouillee";
    });
  } catch (e) {
    if (e instanceof SoldeInsuffisant) return "insuffisant";
    throw e;
  }
}

/**
 * Écrit une réponse verrouillée (`ecrire`, dans la transaction), seulement si aucune autre n’attend déjà pour ce compte :
 * le compte est verrouillé le temps de vérifier et d’écrire (deux réponses à 0 bulle en même temps n’en gardent qu’une).
 * Rend ce qu’`ecrire` a rendu, ou null : une autre attend déjà (rien n’est écrit).
 */
export async function garderVerrouillee<T>(userId: string, ecrire: (tx: Executeur) => Promise<T>): Promise<T | null> {
  return db().transaction(async (tx) => {
    await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).for("update");
    if (await reponseVerrouillee(userId, tx)) return null;
    return ecrire(tx);
  });
}

/**
 * Lire une réponse verrouillée de ce compte (`message`), une fois rechargé (deverrouiller) : payée par la recharge, sans
 * débit, ou son coût débité ; puis elle est rendue en entier, avec ce qu’elle a coûté (0 : la recharge l’a payée) et ce
 * qu’il reste. Déjà lue (un second toucher, un autre onglet) : rendue telle quelle, sans nouveau débit. « insuffisant » :
 * le solde ne la couvre toujours pas (rien ne change) ; null : pas une réponse de ce compte.
 */
export async function lireLaReponse(compte: Compte, message: number): Promise<BlushAnswer | "insuffisant" | null> {
  const fait = await deverrouiller(compte, message);
  if (fait === "insuffisant") return "insuffisant";
  const lue = await reponseDuCompte(compte.id, message);
  if (!lue) return null;
  const depensees = fait === "offerte" ? 0 : fait === "deverrouillee" ? (lue.cout ?? COUT_EN_BULLES.reponse) : null;
  return {
    ...lue.reponse,
    ...(lue.echange === null ? {} : { echange: lue.echange }),
    ...(depensees !== null && !estEquipe(compte) ? { bulles: { depensees, restantes: await soldeDe(compte.id) } } : {}),
  };
}
