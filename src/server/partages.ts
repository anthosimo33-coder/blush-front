import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { verdictAffiche } from "@prompts/lib/front";
import type { DonneesVerdict } from "./analyse";
import { chiffrer, dechiffrer, empreinte } from "./chiffrement";
import { CLES, compter } from "./compteurs";
import { db, schema } from "./db";
import { metaDe, type Ligne } from "./histoires";

/*
 * Le partage du verdict : un lien public (/v/<id>) qui montre l’emoji, le titre et le sous-titre du verdict, le prénom
 * de l’autre masqué (le tien reste). Jamais un message, jamais un chapitre. Un lien par histoire ; le désactiver l’efface.
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

/**
 * Les noms à masquer deviennent des initiales (« Léa t’attend » → « L. t’attend »), comme le duo du rapport ; le point
 * qui suit est repris (« Hugo. » → « H. »). Ceux à garder restent tels quels, même quand ils en contiennent un (« Jean-Marie »
 * garde son « Marie ») ; un nom à la fois à masquer et à garder est masqué.
 */
export function masquerPrenoms(texte: string, masquer: string[], garder: string[] = []): string {
  const cle = (n: string) => n.trim().toLowerCase();
  const masques = new Set(masquer.map(cle));
  const noms = [...new Set([...masquer, ...garder].map((n) => n.trim()))].filter((n) => n.length > 1).sort((a, b) => b.length - a.length);
  if (!noms.length) return texte;
  /* En une passe, le plus long d’abord : le nom complet de l’export avant le prénom seul */
  const nom = new RegExp(`(?<![\\p{L}\\p{N}])(${noms.map(echapper).join("|")})(?![\\p{L}\\p{N}])\\.?`, "giu");
  return texte.replace(nom, (m, n: string) => (masques.has(cle(n)) ? `${[...n][0].toUpperCase()}.` : m));
}

/**
 * Le masque de ce qui se partage : l’autre devient une initiale (son prénom et son nom d’export), ton prénom reste en
 * clair, c’est toi qui partages. Sans « Qui es-tu ? », on ne sait pas qui est qui : tous les noms sont masqués.
 * Le « Moi » des captures est le mot, pas un nom.
 */
export function masqueDe(story: Ligne): (texte: string) => string {
  const { participants, moi } = metaDe(story);
  const unNom = (n: string) => n !== "Moi";
  const autres = participants.filter((_, k) => k !== moi).flatMap((p) => [p.prenom, p.nom].filter(unNom));
  const toi = moi == null ? [] : [participants[moi].prenom].filter(unNom);
  return (texte) => masquerPrenoms(texte, autres, toi);
}

/**
 * Le lien de partage de l’histoire, créé s’il n’existe pas encore, et ce qu’il montre (refait à chaque partage) : la
 * feuille de partage a les deux sans relire le lien qu’on vient d’écrire.
 */
export async function partager(story: Ligne): Promise<{ id: string; verdict: VerdictPartage }> {
  const [v] = await db().select().from(schema.verdicts).where(eq(schema.verdicts.storyId, story.id));
  if (!v) throw new ErreurPartage("pas_pret");
  const { sortie } = dechiffrer<DonneesVerdict>(v.data);
  /* Une situation difficile ne se partage pas */
  if (sortie.mode_sobre) throw new ErreurPartage("sobre");
  const affiche = verdictAffiche(sortie);
  const masquer = masqueDe(story);
  const verdict: VerdictPartage = { emoji: affiche.emoji, title: masquer(affiche.title), subtitle: masquer(affiche.subtitle) };
  const data = chiffrer(verdict);
  /* Déjà partagé : le même lien, masqué comme aujourd’hui (un lien créé avant le 9 octobre masquait aussi ton prénom) */
  const [deja] = await db().update(schema.shares).set({ data }).where(eq(schema.shares.storyId, story.id)).returning({ id: schema.shares.id });
  if (deja) return { id: deja.id, verdict };
  const [cree] = await db()
    .insert(schema.shares)
    .values({ id: nouvelId(), storyId: story.id, data })
    /* Deux ouvertures en même temps : un seul lien */
    .onConflictDoUpdate({ target: schema.shares.storyId, set: { data } })
    .returning({ id: schema.shares.id });
  await compter(CLES.lienCree);
  return { id: cree.id, verdict };
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

/**
 * La version de l’image story d’un lien, pour son adresse (`/v/<id>/image?format=story&v=<version>`) : une empreinte
 * (avec la clé du serveur) du lien et de ce qu’il montre. Elle change quand le verdict montré change ; un lien
 * désactivé puis repartagé a un autre identifiant. Impossible à deviner : seule la feuille de partage la connaît.
 */
export const versionImage = (id: string, v: VerdictPartage) => empreinte(`partage:${id}:${v.emoji}:${v.title}:${v.subtitle}`).slice(0, 16);

/** Ce que montre un lien public, ou null (lien inconnu ou désactivé). */
export async function verdictPartage(id: string): Promise<VerdictPartage | null> {
  if (!ID_PARTAGE.test(id)) return null;
  const [l] = await db().select({ data: schema.shares.data }).from(schema.shares).where(eq(schema.shares.id, id));
  return l ? dechiffrer<VerdictPartage>(l.data) : null;
}
