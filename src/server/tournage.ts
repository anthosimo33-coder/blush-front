import "server-only";
import { and, count, desc, eq, inArray, isNotNull, isNull, max, ne, sql } from "drizzle-orm";
import { CATALOGUE } from "@/contenu/offres";
import { NOM_TOURNAGE_MAX } from "@/lib/limites";
import type { RefusDuTournage } from "@/types/api";
import type { Utilisateur } from "./auth";
import { crediter } from "./bulles";
import { empreinte, jeton } from "./chiffrement";
import * as coffre from "./coffre";
import { lireTournage } from "./cookies";
import { db, schema, uneLigne } from "./db";
import { GENRES_CHAINE } from "./db/enums";
import { verdictAffiche } from "./ecrans/rapport";
import { ErreurInvariant } from "./erreurs";
import { histoiresDuCompte, metaDe, personnesDe, supprimerHistoire, UUID, type Meta } from "./histoires";
import type { Consentement } from "./juridique";

/*
 * Le mode tournage : les créatrices filment BLUSH sur une conv écrite pour leur campagne, la même pour toutes. Elle est
 * lue une fois par le vrai modèle, dans un compte de l’équipe (une conv comme une autre), puis /admin en fait une conv
 * de tournage : un lien secret (/tournage/<cle>) qui pose le mode tournage sur le téléphone de la créatrice (un cookie,
 * src/server/cookies.ts). Elle filme ensuite le parcours habituel, et rien ne part au modèle :
 * - ses captures ne sont pas lues (le prompt 01) : leur brouillon reprend les participants et les chiffres de la conv
 *   de tournage (brouillonDeTournage) ; un export se lit comme d’habitude, sans modèle ;
 * - la lecture (POST /api/analyse) recopie le verdict, le rapport, la mémoire et le vocal déjà écrits (rejouer), et
 *   l’écran de lecture les rejoue en DUREE_RELECTURE_MS (avanceRejouee, src/server/avancement.ts) ;
 * - la chaîne des tâches ne lance plus rien pour cette conv (src/server/pipeline.ts, executer).
 * Le rapport s’ouvre comme un rapport acheté, avec ses bulles, une fois par conv de tournage et par compte : le chat
 * reste le vrai (une réponse coûte une bulle, et un appel au modèle). Chaque nouvelle prise remplace la précédente de la
 * même conv de tournage dans le compte : « Tes convs » n’en garde qu’une par campagne.
 */

/** Une conv de tournage : son nom (la campagne), et la conv qu’on rejoue. */
export type Tournage = { id: string; nom: string; storyId: string };

/** Les bulles d’une prise, comme celles d’un rapport acheté : une fois par conv de tournage et par compte. */
export const BULLES_DU_TOURNAGE = CATALOGUE.rapport.bulles;

const t = schema.tournages;
const s = schema.stories;

/** Le chemin du lien d’une conv de tournage (sans l’adresse du site : /admin la met devant). */
const cheminDuLien = (cle: string) => `/tournage/${cle}`;

/** La forme d’un secret de lien (un jeton de chiffrement.ts) : ce qui ne l’a pas ne va pas jusqu’à la base. */
const CLE = /^[\w-]{43}$/;

/** La conv de tournage d’un lien (le secret de son cookie), si elle n’est pas arrêtée. */
export async function tournageDeLaCle(cle: string | undefined): Promise<Tournage | null> {
  if (!cle || !CLE.test(cle)) return null;
  const [l] = await db()
    .select({ id: t.id, nom: t.nom, storyId: t.storyId })
    .from(t)
    .where(and(eq(t.cleHash, empreinte(cle)), isNull(t.arreteLe)));
  return l ?? null;
}

/** Le mode tournage de ce navigateur : la conv de tournage de son cookie, si elle n’est pas arrêtée. */
export const tournageDuNavigateur = async () => tournageDeLaCle(await lireTournage());

/** Une conv de tournage par son id (celle d’un brouillon de tournage), même arrêtée : le brouillon a été fait avant. */
export async function tournageDe(id: string): Promise<Tournage | null> {
  const [l] = await db().select({ id: t.id, nom: t.nom, storyId: t.storyId }).from(t).where(eq(t.id, id));
  return l ?? null;
}

/* ———— La conv qu’on rejoue ———— */

/**
 * Ce qui manque à une conv pour être rejouée : pas lue (pas de verdict fini), une étape encore en route, son rapport
 * pas écrit (pas débloqué), ou sa mémoire pas faite. null : elle est prête.
 */
export type Manque = Exclude<RefusDuTournage, "aucune">;

async function manqueDe(storyId: string): Promise<Manque | null> {
  const [taches, [r], [m]] = await Promise.all([
    db()
      .select({ kind: schema.tasks.kind, status: schema.tasks.status })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, storyId), inArray(schema.tasks.kind, [...GENRES_CHAINE]))),
    db()
      .select({ data: sql<boolean>`${schema.reports.data} is not null` })
      .from(schema.reports)
      .where(eq(schema.reports.storyId, storyId)),
    db().select({ id: schema.memories.storyId }).from(schema.memories).where(eq(schema.memories.storyId, storyId)),
  ]);
  if (!taches.some((x) => x.kind === "verdict" && x.status === "fini")) return "pas_lue";
  if (taches.some((x) => x.status === "attente" || x.status === "en_cours")) return "en_cours";
  if (!r?.data) return "sans_rapport";
  if (!m) return "sans_memoire";
  return null;
}

/** Une conv du compte de l’équipe, telle que /admin la propose : l’autre, son verdict, et ce qui lui manque. */
export type ConvCandidate = { id: string; autre: string; emoji: string; titre: string; le: string; manque: Manque | null };

/** Les convs lues de ce compte (le compte de l’équipe qui ouvre /admin), les plus récentes d’abord : de quoi créer une conv de tournage. */
export async function convsCandidates(userId: string): Promise<ConvCandidate[]> {
  const lues = (await histoiresDuCompte(userId)).filter((l) => !l.tournageLe).slice(0, 20);
  return Promise.all(
    lues.map(async (l) => {
      const [[v], manque] = await Promise.all([db().select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, l.id)), manqueDe(l.id)]);
      const verdict = v ? verdictAffiche(coffre.lire("verdicts.data", v.data).sortie) : null;
      return { id: l.id, autre: personnesDe(metaDe(l)).autre.prenom, emoji: verdict?.emoji ?? "", titre: verdict?.title ?? "", le: l.createdAt.toISOString(), manque };
    }),
  );
}

/* ———— /admin ———— */

/** Ce que /admin montre d’une conv de tournage : son lien, sa conv, ses prises. */
export type TournageAffiche = {
  id: string;
  nom: string;
  /** Le chemin du lien à envoyer aux créatrices (cheminDuLien). */
  lien: string;
  autre: string;
  emoji: string;
  titre: string;
  arrete: boolean;
  creeLe: string;
  /** Les comptes qui en gardent une prise (une par compte : chaque prise remplace la précédente). */
  comptes: number;
  /** L’heure de la dernière prise (ISO), ou null. */
  derniere: string | null;
};

/** Les convs de tournage, les plus récentes d’abord, avec leurs prises. */
export async function tournagesAffiches(): Promise<TournageAffiche[]> {
  const lignes = await db()
    .select({ id: t.id, nom: t.nom, cle: t.cle, arreteLe: t.arreteLe, creeLe: t.creeLe, storyId: t.storyId, meta: s.meta, verdict: schema.verdicts.data })
    .from(t)
    .innerJoin(s, eq(s.id, t.storyId))
    .leftJoin(schema.verdicts, eq(schema.verdicts.storyId, t.storyId))
    .orderBy(desc(t.creeLe));
  if (!lignes.length) return [];
  const prises = await db()
    .select({ tournageId: s.tournageId, comptes: count(sql`distinct ${s.userId}`), derniere: max(s.tournageLe) })
    .from(s)
    .where(
      and(
        inArray(
          s.tournageId,
          lignes.map((l) => l.id),
        ),
        isNotNull(s.tournageLe),
      ),
    )
    .groupBy(s.tournageId);
  return lignes.map((l) => {
    const p = prises.find((x) => x.tournageId === l.id);
    const verdict = l.verdict ? verdictAffiche(coffre.lire("verdicts.data", l.verdict).sortie) : null;
    return {
      id: l.id,
      nom: l.nom,
      lien: cheminDuLien(coffre.lire("tournages.cle", l.cle)),
      autre: personnesDe(metaDe(l)).autre.prenom,
      emoji: verdict?.emoji ?? "",
      titre: verdict?.title ?? "",
      arrete: !!l.arreteLe,
      creeLe: l.creeLe.toISOString(),
      comptes: p?.comptes ?? 0,
      derniere: p?.derniere ? new Date(p.derniere).toISOString() : null,
    };
  });
}

/**
 * Fait de cette conv du compte de l’équipe `par` une conv de tournage, sous ce nom : un nouveau lien. Refusée si la conv
 * n’est pas à lui, ou n’est pas prête à rejouer (manqueDe).
 */
export async function creerTournage({ conv, nom, par }: { conv: string; nom: string; par: Pick<Utilisateur, "id"> }): Promise<{ id: string } | { refus: RefusDuTournage }> {
  if (!UUID.test(conv)) return { refus: "aucune" };
  const [l] = await db()
    .select({ id: s.id, tournageLe: s.tournageLe })
    .from(s)
    .where(and(eq(s.id, conv), eq(s.userId, par.id)));
  /* Une prise d’un autre tournage n’en devient pas une : sa lecture n’est pas la sienne */
  if (!l || l.tournageLe) return { refus: "aucune" };
  const manque = await manqueDe(conv);
  if (manque) return { refus: manque };
  const cle = jeton();
  const ligne = uneLigne(
    await db()
      .insert(t)
      .values({ nom: nom.trim().slice(0, NOM_TOURNAGE_MAX), storyId: conv, cle: coffre.ecrire("tournages.cle", cle), cleHash: empreinte(cle), creeParId: par.id })
      .returning({ id: t.id }),
    "tournages:creee",
  );
  return { id: ligne.id };
}

/** Arrête une conv de tournage : son lien ne pose plus le mode tournage. Vrai si elle vient d’être arrêtée. */
export async function arreterTournage(id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const arretees = await db()
    .update(t)
    .set({ arreteLe: new Date() })
    .where(and(eq(t.id, id), isNull(t.arreteLe)))
    .returning({ id: t.id });
  return arretees.length > 0;
}

/* ———— La prise ———— */

/**
 * Le brouillon de captures importées en mode tournage, sans les lire : les participants et les chiffres de la conv de
 * tournage, l’utilisateur en « Moi » comme pour toutes les captures (son prénom vient de « Qui es-tu ? »), et pas de
 * conv brute. La lecture (rejouer) le remplira. `secret` : celui du cookie du brouillon (src/server/captures.ts).
 */
export async function brouillonDeTournage(
  tournage: Tournage,
  { appli, captures, secret, consentement }: { appli: Meta["appli"]; captures: number; secret: string; consentement: Consentement },
): Promise<{ id: string; meta: Meta; secret: string; messages: number }> {
  const source = uneLigne(await db().select({ meta: s.meta, messageCount: s.messageCount }).from(s).where(eq(s.id, tournage.storyId)), "tournages:source");
  const { moi, autre } = personnesDe(metaDe(source));
  const meta: Meta = {
    appli,
    format: "captures",
    fichier: `${captures} captures`,
    captures,
    participants: [{ nom: "Moi", prenom: "Moi", messages: moi.messages }, autre],
    resume: metaDe(source).resume,
    moi: 0,
  };
  const ligne = uneLigne(
    await db()
      .insert(s)
      .values({
        draftToken: empreinte(secret),
        messageCount: source.messageCount,
        meta: coffre.ecrire("stories.meta", meta),
        consentementLe: consentement.le,
        consentementVersion: consentement.version,
        tournageId: tournage.id,
      })
      .returning({ id: s.id }),
    "stories:brouillon_de_tournage",
  );
  return { id: ligne.id, meta, secret, messages: source.messageCount };
}

/**
 * La meta d’une prise : celle de la conv de tournage (les deux personnes, qui est qui, les pronoms, ses chiffres : ce que
 * le rapport a écrit), avec ce que la créatrice a fait devant la caméra : son import (l’appli, des captures ou un export)
 * et le prénom qu’elle s’est donné à « Qui es-tu ? », que le rapport et l’accueil montrent tels qu’elle les a vus.
 */
export function metaDeLaPrise(source: Meta, prise: Meta): Meta {
  const meta: Meta = { ...source, appli: prise.appli, format: prise.format, fichier: prise.fichier };
  if (prise.captures) meta.captures = prise.captures;
  else delete meta.captures;
  const prenom = prise.moi == null ? null : prise.participants[prise.moi].prenom;
  /* Des captures sans prénom donné : « Moi » ne remplace pas un vrai prénom */
  if (source.moi == null || !prenom || prenom === "Moi") return meta;
  const participants: Meta["participants"] = [source.participants[0], source.participants[1]];
  participants[source.moi] = { ...participants[source.moi], prenom };
  return { ...meta, participants };
}

/**
 * La lecture d’une prise : tout ce que la conv de tournage a d’écrit est recopié dans cette conv (sa meta et ses
 * chiffres, avec l’import et le prénom de la créatrice : metaDeLaPrise ; le verdict, le rapport, la mémoire, le vocal, et ses tâches
 * telles qu’elles ont fini : la chaîne n’y voit rien à lancer), sa conv brute effacée (celle qu’elle a importée, s’il y
 * en a une), son rapport ouvert. Les autres octets chiffrés passent tels quels : la clé est la même, et rien n’y lie une
 * ligne. Puis ses prises d’avant de la même conv de tournage s’effacent, et ses bulles arrivent (une fois par conv de
 * tournage).
 */
export async function rejouer(storyId: string, tournage: Tournage, utilisateur: Pick<Utilisateur, "id">): Promise<void> {
  const src = tournage.storyId;
  if (await manqueDe(src)) throw new ErreurInvariant("tournage:source_pas_prete");
  await db().transaction(async (tx) => {
    /* Une requête après l’autre : la transaction n’a qu’une connexion */
    const [source] = await tx.select({ meta: s.meta, messageCount: s.messageCount, nextMessage: s.nextMessage, context: s.context }).from(s).where(eq(s.id, src));
    const [prise] = await tx.select({ meta: s.meta }).from(s).where(eq(s.id, storyId));
    const [v] = await tx.select({ data: schema.verdicts.data }).from(schema.verdicts).where(eq(schema.verdicts.storyId, src));
    const [r] = await tx.select({ plan: schema.reports.plan, data: schema.reports.data }).from(schema.reports).where(eq(schema.reports.storyId, src));
    const [m] = await tx.select({ data: schema.memories.data }).from(schema.memories).where(eq(schema.memories.storyId, src));
    const [vo] = await tx.select().from(schema.vocals).where(eq(schema.vocals.storyId, src));
    const taches = await tx
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.storyId, src), inArray(schema.tasks.kind, [...GENRES_CHAINE]), inArray(schema.tasks.status, ["fini", "echec"])));
    if (!source || !v || !r?.data || !m) throw new ErreurInvariant("tournage:source_pas_prete");
    if (!prise) throw new ErreurInvariant("tournage:prise_introuvable");
    const maintenant = new Date();
    await tx
      .update(s)
      .set({
        meta: coffre.ecrire("stories.meta", metaDeLaPrise(metaDe(source), metaDe(prise))),
        messageCount: source.messageCount,
        nextMessage: source.nextMessage,
        context: source.context,
        conv: null,
        convPurgedAt: maintenant,
        debloqueLe: maintenant,
        tournageId: tournage.id,
        tournageLe: maintenant,
        updatedAt: maintenant,
      })
      .where(eq(s.id, storyId));
    await tx.insert(schema.verdicts).values({ storyId, data: v.data });
    await tx.insert(schema.reports).values({ storyId, plan: r.plan, data: r.data });
    await tx.insert(schema.memories).values({ storyId, data: m.data });
    /* L’heure du vocal et celles des tâches restent les leurs : la chaîne (vocalTente) y lit ce qu’elle lisait chez la source */
    if (vo) await tx.insert(schema.vocals).values({ ...vo, storyId });
    if (taches.length)
      await tx.insert(schema.tasks).values(
        taches.map(({ kind, status, attempts, error, progress, detail, createdAt, updatedAt }) => ({
          storyId,
          kind,
          status,
          attempts,
          error,
          progress,
          detail,
          createdAt,
          updatedAt,
        })),
      );
  });
  /* Ses prises d’avant de la même conv de tournage : celle-ci les remplace (« Tes convs » n’en garde qu’une) */
  const avant = await db()
    .select({ id: s.id })
    .from(s)
    .where(and(eq(s.userId, utilisateur.id), eq(s.tournageId, tournage.id), ne(s.id, storyId)));
  for (const p of avant) await supprimerHistoire(p.id);
  await crediter(utilisateur.id, BULLES_DU_TOURNAGE, "tournage", `tournage:${tournage.id}:${utilisateur.id}`);
}
