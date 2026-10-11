import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Plan } from "@/types";
import type { CibleImage } from "@/types/api";
import type { CodeErreur } from "@/types/erreurs-api";
import { empreinte } from "./chiffrement";
import * as coffre from "./coffre";
import { CLES, compter } from "./compteurs";
import { db, schema } from "./db";
import { chapitresEcrits, donneesVerdict } from "./depot";
import { echangeDuChat } from "./historique";
import { verdictAffiche } from "./ecrans/rapport";
import { ErreurPublique } from "./erreurs";
import { metaDe, type Ligne } from "./histoires";
import { ouvertureDu } from "./presentation/rapport";
import type { DonneesVerdict } from "./stockage/types";

/*
 * Le partage du verdict : un lien public (/v/<id>) qui montre l’emoji, le titre et le sous-titre du verdict, le prénom
 * de l’autre masqué (le tien reste). Jamais un message, jamais un chapitre. Un lien par histoire ; le désactiver l’efface.
 */

/** Ce que montre un lien partagé. */
export type VerdictPartage = { emoji: string; title: string; subtitle: string };

/** Le verdict ne se partage pas : pas encore écrit, ou une alerte de danger (le mode sobre). */
export class ErreurPartage extends ErreurPublique<Extract<CodeErreur, "pas_pret" | "sobre">> {}

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 12 caractères sans ambiguïté (ni l, 1, O, 0) : impossible à deviner, facile à recopier. */
const nouvelId = () => [...randomBytes(12)].map((o) => ALPHABET[o % ALPHABET.length]).join("");
const ID_PARTAGE = /^[a-zA-Z0-9]{12}$/;

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

/** Une situation difficile (le mode sobre : une alerte de danger) ne se partage pas : ni son verdict, ni ses chapitres. */
const partageable = (sortie: Pick<DonneesVerdict["sortie"], "mode_sobre">) => !sortie.mode_sobre;

/**
 * Le lien de partage de l’histoire, créé s’il n’existe pas encore, et ce qu’il montre (refait à chaque partage) : la
 * feuille de partage a les deux sans relire le lien qu’on vient d’écrire.
 */
export async function partager(story: Ligne): Promise<{ id: string; verdict: VerdictPartage }> {
  const v = await donneesVerdict(story.id);
  if (!v) throw new ErreurPartage("pas_pret");
  const { sortie } = v;
  if (!partageable(sortie)) throw new ErreurPartage("sobre");
  const affiche = verdictAffiche(sortie);
  const masquer = masqueDe(story);
  const verdict: VerdictPartage = { emoji: affiche.emoji, title: masquer(affiche.title), subtitle: masquer(affiche.subtitle) };
  const data = coffre.ecrire("shares.data", verdict);
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
  return l ? coffre.lire("shares.data", l.data) : null;
}

/** Ce que dessine « Partager en image » (src/server/carte-partage.tsx), déjà masqué : une réponse du chat, ou une chute. */
type MomentPartage = { type: "reponse"; question: string; bulles: string[] } | { type: "moment"; surtitre: string; texte: string };

/**
 * Le moment que « Partager en image » dessine (POST /api/partage/image), relu dans le compte (jamais pris de la requête :
 * pas de fausse image « askblush.com ») et masqué comme le lien ; ou pourquoi il ne se dessine pas. L’image ne montre
 * jamais ce que l’écran ne montre pas (S-25) :
 * - une réponse du chat, telle que le fil l’affiche, même en mode sobre : le chat y reste ouvert, et chaque réponse y a
 *   son « Partager » ;
 * - la chute d’un chapitre, seulement quand l’écran montre les chapitres (ouvertureDu, `entier` : l’accès au rapport ;
 *   sans lui, le chapitre 1 offert n’est que le verdict, sans chute), et jamais d’une situation difficile (partageable).
 */
export async function momentAPartager(story: Ligne, plan: Plan, cible: CibleImage): Promise<MomentPartage | Extract<CodeErreur, "introuvable" | "sobre" | "acces">> {
  const masquer = masqueDe(story);
  if (cible.type === "reponse") {
    const echange = await echangeDuChat(story.id, cible.echange);
    const r = echange?.blush.reponse;
    if (!echange || r?.kind !== "bubbles") return "introuvable";
    return {
      type: "reponse",
      question: masquer((echange.toi.affiche ?? echange.toi.texte).replace(/^\(vocal\)\s*/, "")),
      bulles: [...r.bubbles.map((b) => b.text), ...(r.ask ? [r.ask] : [])].map(masquer),
    };
  }
  const verdict = await donneesVerdict(story.id);
  if (!verdict) return "introuvable";
  if (!partageable(verdict.sortie)) return "sobre";
  if (!ouvertureDu(plan, verdict.sortie).entier) return "acces";
  const chapitre = (await chapitresEcrits(story.id)).find((ch) => ch.number === cible.chapitre);
  const bloc = chapitre?.blocks[cible.bloc];
  if (!chapitre || bloc?.kind !== "punchline") return "introuvable";
  return { type: "moment", surtitre: masquer(`Chapitre ${chapitre.number} · ${chapitre.tocTitle}`), texte: masquer(bloc.text) };
}
