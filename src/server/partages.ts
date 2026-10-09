import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { verdictAffiche } from "@prompts/lib/front";
import type { DonneesVerdict } from "./analyse";
import { chiffrer, dechiffrer } from "./chiffrement";
import { CLES, compter } from "./compteurs";
import { db, schema } from "./db";
import { metaDe, type Ligne } from "./histoires";

/*
 * Le partage du verdict : un lien public (/v/<id>) qui montre l’emoji, le titre et le sous-titre du verdict,
 * prénoms masqués. Jamais un message, jamais un chapitre. Un lien par histoire ; le désactiver l’efface.
 */

/** Ce que montre un lien partagé. */
export type VerdictPartage = { emoji: string; title: string; subtitle: string };

export class ErreurPartage extends Error {
  constructor(readonly code: "pas_pret" | "sobre") {
    super(code);
  }
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 12 caractères sans ambiguïté (ni l, 1, O, 0) : impossible à deviner, facile à recopier. */
const nouvelId = () => [...randomBytes(12)].map((o) => ALPHABET[o % ALPHABET.length]).join("");
export const ID_PARTAGE = /^[a-zA-Z0-9]{12}$/;

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Les noms à masquer dans ce qui se partage : prénoms et noms d’export, sans le « Moi » des captures (le mot, pas un nom). */
export const prenomsDe = (story: Ligne) => [...new Set(metaDe(story).participants.flatMap((p) => [p.prenom, p.nom]))].filter((n) => n !== "Moi");

/** Les prénoms deviennent des initiales (« Charlyse t’attend » → « C. t’attend »), comme le duo du rapport. Le point qui suit est repris (« Hugo. » → « H. »). */
export function masquerPrenoms(texte: string, prenoms: string[]): string {
  return prenoms
    .filter((p) => p.trim().length > 1)
    .sort((a, b) => b.length - a.length)
    .reduce((t, p) => t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${echapper(p.trim())}(?![\\p{L}\\p{N}])\\.?`, "giu"), `${[...p.trim()][0].toUpperCase()}.`), texte);
}

/** Le lien de partage de l’histoire, créé s’il n’existe pas encore. */
export async function partagerVerdict(story: Ligne): Promise<string> {
  const [deja] = await db().select({ id: schema.shares.id }).from(schema.shares).where(eq(schema.shares.storyId, story.id));
  if (deja) return deja.id;
  const [v] = await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, story.id));
  if (!v) throw new ErreurPartage("pas_pret");
  const { sortie } = dechiffrer<DonneesVerdict>(v.data);
  /* Une situation difficile ne se partage pas */
  if (sortie.mode_sobre) throw new ErreurPartage("sobre");
  const verdict = verdictAffiche(sortie);
  const prenoms = prenomsDe(story);
  const montre: VerdictPartage = {
    emoji: verdict.emoji,
    title: masquerPrenoms(verdict.title, prenoms),
    subtitle: masquerPrenoms(verdict.subtitle, prenoms),
  };
  const [cree] = await db()
    .insert(schema.shares)
    .values({ id: nouvelId(), storyId: story.id, data: chiffrer(montre) })
    /* Deux ouvertures en même temps : un seul lien */
    .onConflictDoUpdate({
      target: schema.shares.storyId,
      set: { storyId: story.id },
    })
    .returning({ id: schema.shares.id });
  await compter(CLES.lienCree);
  return cree.id;
}

/** Le lien de l’histoire, s’il existe. */
export async function lienDe(storyId: string): Promise<string | null> {
  const [l] = await db().select({ id: schema.shares.id }).from(schema.shares).where(eq(schema.shares.storyId, storyId));
  return l?.id ?? null;
}

/** Désactive le lien : il ne montre plus rien. */
export async function arreterPartage(storyId: string): Promise<void> {
  await db().delete(schema.shares).where(eq(schema.shares.storyId, storyId));
}

/** Ce que montre un lien public, ou null (lien inconnu ou désactivé). */
export async function verdictPartage(id: string): Promise<VerdictPartage | null> {
  if (!ID_PARTAGE.test(id)) return null;
  const [l] = await db().select({ data: schema.shares.data }).from(schema.shares).where(eq(schema.shares.id, id));
  return l ? dechiffrer<VerdictPartage>(l.data) : null;
}
