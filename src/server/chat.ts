import "server-only";
import { and, desc, eq, lt } from "drizzle-orm";
import { blocAjout, type Ajout } from "@prompts/lib/ajouts";
import { requeteChat, type Fil } from "@prompts/lib/contextes";
import { bullesAffichees, messagesAffiches } from "@prompts/lib/front";
import type { Echange } from "@prompts/lib/memoire";
import { introuvables, preuvesChat } from "@prompts/lib/preuves";
import { Sortie10, type ReponseChat } from "@prompts/lib/schemas";
import { ondeDe, texteDit } from "@/lib/vocal";
import type { BlushAnswer, LevelId } from "@/types";
import { editionsBornees, type DonneesMemoire } from "./analyse";
import { ErreurTache } from "./erreurs";
import { chiffrer, chiffrerOctets, dechiffrer } from "./chiffrement";
import { db, schema } from "./db";
import { contexteDe, histoireDe, metaDe, type Ligne } from "./histoires";
import { appeler, textesSysteme } from "./ia/claude";
import { recopieLesPrompts, REFUS_FUITE } from "./ia/garde";
import { dire, ErreurVoix, voixDisponible, voixPour } from "./ia/voix";
import { planifier } from "./taches";
import { aujourdhuiParis } from "./temps";

/* Le chat du quotidien : la mémoire à la place de la conv, les derniers échanges, ce qu’il vient d’écrire. */

/**
 * Ce qu’il a envoyé : `texte`, ce que le modèle lit ; `lignes`, les messages de leur conv envoyés avec (un export,
 * des captures), gardés pour la suite du fil ; `affiche`, ce que l’historique réaffiche (« (3 captures) »).
 */
type MessageToi = { texte: string; lignes?: string[]; affiche?: string };
type MessageBlush = { reponse: BlushAnswer; resume: string };
const ECHANGES_DANS_LE_FIL = 6;
/** Des messages envoyés avec un échange, le fil garde les derniers. */
const LIGNES_DANS_LE_FIL = 15;


/** L’historique du chat, du plus ancien au plus récent : ce que l’accueil réaffiche, en paires (sa question, la réponse). */
/** Un échange avec BLUSH, tel que l’accueil le réaffiche : `id` (celui de ton message) sert à charger ceux d’avant. */
export type EchangeAffiche = { id: number; mine: string; answer: BlushAnswer; at: number };

/**
 * L’historique du chat, du plus ancien au plus récent : les derniers messages, ou ceux d’avant `avant` (l’id d’un
 * échange déjà affiché). Rien n’est jamais effacé tant que la conv existe : on charge simplement par morceaux.
 * `plus` : il en reste d’autres, plus anciens. Un message de BLUSH coupé de sa question (au bord d’un morceau)
 * revient avec elle dans le morceau d’avant.
 */
export async function historique(storyId: string, { avant, limite = 40 }: { avant?: number; limite?: number } = {}): Promise<{ echanges: EchangeAffiche[]; plus: boolean; modeVocal: boolean }> {
  const ou = avant ? and(eq(schema.chatMessages.storyId, storyId), lt(schema.chatMessages.id, avant)) : eq(schema.chatMessages.storyId, storyId);
  const lignes = (await db().select().from(schema.chatMessages).where(ou).orderBy(desc(schema.chatMessages.id)).limit(limite)).reverse();
  const echanges: EchangeAffiche[] = [];
  for (let i = 0; i < lignes.length - 1; i++) {
    if (lignes[i].role !== "toi" || lignes[i + 1].role !== "blush") continue;
    const toi = dechiffrer<MessageToi>(lignes[i].data);
    echanges.push({ id: lignes[i].id, mine: toi.affiche ?? toi.texte, answer: dechiffrer<MessageBlush>(lignes[i + 1].data).reponse, at: lignes[i].createdAt.getTime() });
  }
  /* Le mode vocal, tel qu’il est en base : « Repasser à l’écrit » le coupe sans nouvelle réponse */
  const [s] = await db().select({ chatVocal: schema.stories.chatVocal }).from(schema.stories).where(eq(schema.stories.id, storyId));
  return { echanges, plus: lignes.length === limite, modeVocal: !!s?.chatVocal };
}

async function fil(storyId: string): Promise<Fil> {
  const lignes = (await db().select().from(schema.chatMessages).where(eq(schema.chatMessages.storyId, storyId)).orderBy(desc(schema.chatMessages.id)).limit(ECHANGES_DANS_LE_FIL * 2)).reverse();
  return lignes.map((l) => {
    if (l.role !== "toi") return { de: "blush" as const, texte: dechiffrer<MessageBlush>(l.data).resume };
    const toi = dechiffrer<MessageToi>(l.data);
    return { de: "toi" as const, texte: toi.texte, ...(toi.lignes?.length ? { lignes: toi.lignes } : {}) };
  });
}

const resume = (r: ReponseChat) => [...r.lecture.map((b) => b.texte), ...(r.a_envoyer ?? []), r.question ?? "", r.reaction ?? ""].filter(Boolean).join(" / ");
const texteDe = (r: ReponseChat) => [resume(r), r.pourquoi ?? ""].join(" ");

/** Ce qu’il écrit quand il envoie des messages sans un mot : la demande qu’on a testée sur les évals. */
const DEMANDE_PAR_DEFAUT = "ça veut dire quoi ? je lui réponds quoi ?";

/**
 * La réponse dite en vocal, par la voix de l’A/B test du compte : l’audio est gardé chiffré, la réponse garde son
 * adresse. Pas de vocal quand il y a une alerte (les ressources d’aide restent écrites). Si la voix échoue, la réponse
 * reste écrite.
 */
async function direReponse(story: Ligne, r: ReponseChat): Promise<BlushAnswer["vocal"] | null> {
  if (!voixDisponible() || !r.dit?.length || r.alerte) return null;
  try {
    const voix = voixPour(story.userId ?? story.id);
    const { texte } = texteDit(r.dit.map((l) => ({ jeu: l.jeu, texte: l.texte, punch: false, preuve: null })));
    const { audio, alignement } = await dire(texte, voix, { sobre: r.mode === "sobre" || r.mode === "doux", storyId: story.id });
    const duree = Math.max(0.5, ...alignement.character_end_times_seconds);
    const [v] = await db()
      .insert(schema.chatVocals)
      .values({ storyId: story.id, voix, audio: chiffrerOctets(audio), dureeMs: Math.round(duree * 1000) })
      .returning({ id: schema.chatVocals.id });
    return { audio: `/api/vocal/chat/${v.id}`, duree: Math.round(duree * 10) / 10, peaks: ondeDe(alignement) };
  } catch (e) {
    console.error(`chat en vocal : ${e instanceof ErreurVoix ? e.message : (e as Error).name}`);
    return null;
  }
}

/**
 * Une réponse de BLUSH, en bulles. `ajout` : les messages de leur conv (ou son profil) qu’il vient d’envoyer, et
 * ce que l’historique en réaffiche. Elle enregistre l’échange et, s’il apporte du neuf, programme la mise à jour de la mémoire.
 * `parVocal` : il a envoyé un vocal, BLUSH répond en vocal. Elle répond aussi en vocal tant qu’il le lui a demandé.
 */
export async function repondre(
  story: Ligne,
  memoire: DonneesMemoire,
  ditBrut: string,
  ajout?: { ajout: Ajout; affiche: string },
  { parVocal = false }: { parVocal?: boolean } = {},
): Promise<{ reponse: BlushAnswer; majMemoire: boolean }> {
  const meta = metaDe(story);
  const h = histoireDe(meta);
  const ctx = contexteDe(story);
  if (!ctx) throw new ErreurTache("contexte_absent");
  const nouvelles = ajout?.ajout.lignes ?? [];
  const lignes = new Map([...memoire.lignes, ...nouvelles.map((l) => [l.slice(0, l.indexOf(" ")), l] as [string, string])]);
  const dit = ditBrut || (ajout?.ajout.messages ? DEMANDE_PAR_DEFAUT : "(il t’envoie une capture de son profil)");
  const jour = aujourdhuiParis();
  const req = requeteChat({
    h,
    aujourdhui: jour.t,
    chiffres: ctx.chiffres,
    fin: ctx.fin,
    etat: memoire.etat,
    lignes,
    editions: editionsBornees(memoire.editions),
    style: ctx.style,
    fil: await fil(story.id),
    dit,
    ...(ajout ? { ajout: blocAjout(ajout.ajout) } : {}),
    vocal: (parVocal || story.chatVocal) && voixDisponible(),
  });

  let sortie: ReponseChat | null = null;
  for (let essai = 0; essai < 2 && !sortie; essai++) {
    const a = await appeler(req, Sortie10, { storyId: story.id, etiquette: "chat" });
    if (a.refus) throw new ErreurTache(a.categorie ? `refus:${a.categorie}` : "refus");
    if (a.sortie && (!introuvables(preuvesChat(a.sortie), lignes).length || essai === 1)) sortie = a.sortie;
  }
  if (!sortie) throw new ErreurTache("sortie_illisible");

  /* Le garde-fou : une réponse qui recopie les prompts est remplacée */
  const fuite = recopieLesPrompts(texteDe(sortie), textesSysteme);
  if (fuite) console.warn(`garde-fou : réponse remplacée (histoire ${story.id})`);
  const avant = memoire.etat.niveau?.niveau ?? null;
  /* Le mode vocal après cette réponse : il l’a demandé, ou il a demandé à revenir à l’écrit */
  const modeVocal = fuite ? story.chatVocal : sortie.mode_vocal === "activer" ? true : sortie.mode_vocal === "arreter" ? false : story.chatVocal;
  if (modeVocal !== story.chatVocal) await db().update(schema.stories).set({ chatVocal: modeVocal }).where(eq(schema.stories.id, story.id));
  const vocal = !fuite && (parVocal || modeVocal) && sortie.mode_vocal !== "arreter" ? await direReponse(story, sortie) : null;
  const reponse: BlushAnswer = fuite
    ? { kind: "bubbles", bubbles: REFUS_FUITE.map((text) => ({ text })), modeVocal }
    : {
        ...bullesAffichees(sortie, messagesAffiches(lignes, h.utilisateur.prenom)),
        ...(sortie.niveau_atteint && sortie.niveau_atteint !== avant ? { levelUp: sortie.niveau_atteint as LevelId } : {}),
        ...(vocal ? { vocal } : {}),
        modeVocal,
      };

  const gardes = await db()
    .insert(schema.chatMessages)
    .values([
      {
        storyId: story.id,
        role: "toi",
        data: chiffrer({ texte: dit, ...(ajout ? { lignes: nouvelles.slice(-LIGNES_DANS_LE_FIL), affiche: [ajout.affiche, ditBrut].filter(Boolean).join(" ") } : {}) } satisfies MessageToi),
      },
      { storyId: story.id, role: "blush", data: chiffrer({ reponse, resume: fuite ? REFUS_FUITE.join(" / ") : resume(sortie) } satisfies MessageBlush) },
    ])
    .returning({ id: schema.chatMessages.id, role: schema.chatMessages.role });

  /* Des messages ajoutés, une nouvelle, un message reçu, une suite, ou un niveau qui bouge : la mémoire se met à jour après la réponse */
  const majMemoire = !fuite && (nouvelles.length > 0 || ["nouvelle", "message_recu", "suite"].includes(sortie.type) || !!sortie.niveau_atteint);
  const echange: Echange = { date: jour.iso, dit, reponse: sortie.lecture.map((b) => b.texte).concat(sortie.a_envoyer ?? []), ...(nouvelles.length ? { lignes: nouvelles } : {}) };
  if (majMemoire) await planifier(story.id, "memoire_maj", echange);
  /* L’échange (l’id de ton message) part avec la réponse : de quoi la partager en image ensuite */
  return { reponse: { ...reponse, echange: gardes.find((g) => g.role === "toi")?.id }, majMemoire };
}
