import "server-only";
import { partialParse } from "@anthropic-ai/sdk/_vendor/partial-json-parser/parser";
import { desc, eq } from "drizzle-orm";
import { blocAjout, type Ajout } from "@prompts/lib/ajouts";
import { requeteChat, type Fil } from "@prompts/lib/contextes";
import { parIdentifiant } from "@prompts/lib/ligne";
import type { Echange } from "@prompts/lib/memoire";
import { introuvables, preuvesChat } from "@prompts/lib/preuves";
import { Sortie10, type ReponseChat } from "@prompts/lib/schemas";
import { ondeDe, texteDit } from "@/lib/vocal";
import type { BlushAnswer, EvenementChat, Message } from "@/types";
import { ErreurTache } from "./erreurs";
import { bulleAffichee, bullesAffichees } from "./ecrans/chat";
import { messagesAffiches } from "./ecrans/messages";
import * as coffre from "./coffre";
import { db, schema, uneLigne } from "./db";
import { contexteDe, histoireDe, metaDe, type Ligne } from "./histoires";
import { editionsBornees, type DonneesMemoire } from "./stockage/types";
import { appelVerifie } from "./ia/appel-verifie";
import { textesSysteme, type Avance } from "./ia/claude";
import { recopieLesPrompts, REFUS_FUITE } from "./ia/garde";
import { dire, voixDisponible, voixPour } from "./ia/voix";
import { journal, journalErreur } from "./journal";
import { planifier } from "./taches";
import { aujourdhuiParis } from "./temps";

/* Le chat du quotidien : la mémoire à la place de la conv, les derniers échanges, ce qu’il vient d’écrire. */

const ECHANGES_DANS_LE_FIL = 6;
/** Des messages envoyés avec un échange, le fil garde les derniers. */
const LIGNES_DANS_LE_FIL = 15;

/** L’historique du chat (ce que l’accueil réaffiche) vit à part, sans le modèle : src/server/historique.ts. */
export { historique } from "./historique";

async function fil(storyId: string): Promise<Fil> {
  const lignes = (await db().select().from(schema.chatMessages).where(eq(schema.chatMessages.storyId, storyId)).orderBy(desc(schema.chatMessages.id)).limit(ECHANGES_DANS_LE_FIL * 2)).reverse();
  return lignes.map((l) => {
    if (l.role !== "toi") return { de: "blush" as const, texte: coffre.lire("chat_messages.data:blush", l.data).resume };
    const toi = coffre.lire("chat_messages.data:toi", l.data);
    return { de: "toi" as const, texte: toi.texte, ...(toi.lignes?.length ? { lignes: toi.lignes } : {}) };
  });
}

const resume = (r: ReponseChat) => [...r.lecture.map((b) => b.texte), ...(r.a_envoyer ?? []), r.question ?? "", r.reaction ?? ""].filter(Boolean).join(" / ");
const texteDe = (r: ReponseChat) => [resume(r), r.pourquoi ?? ""].join(" ");

/** Ce qu’il écrit quand il envoie des messages sans un mot : la demande qu’on a testée sur les évals. */
const DEMANDE_PAR_DEFAUT = "ça veut dire quoi ? je lui réponds quoi ?";

/** Une réponse qui peut partir en vocal : la voix est là, la réponse a son texte dit, et pas d’alerte (les ressources d’aide restent écrites). */
const vocalPossible = (r: ReponseChat) => voixDisponible() && !!r.dit?.length && !r.alerte;

/**
 * La réponse dite en vocal, par la voix de l’A/B test du compte : l’audio est gardé chiffré, la réponse garde son
 * adresse. Si la voix échoue, la réponse reste écrite.
 */
async function direReponse(story: Ligne, r: ReponseChat): Promise<BlushAnswer["vocal"] | null> {
  if (!vocalPossible(r)) return null;
  try {
    const voix = voixPour(story.userId ?? story.id);
    const { texte } = texteDit((r.dit ?? []).map((l) => ({ jeu: l.jeu, texte: l.texte, punch: false, preuve: null })));
    const { audio, alignement } = await dire(texte, voix, { sobre: r.mode === "sobre" || r.mode === "doux", storyId: story.id });
    const duree = Math.max(0.5, ...alignement.character_end_times_seconds);
    const v = uneLigne(
      await db()
        .insert(schema.chatVocals)
        .values({ storyId: story.id, voix, audio: coffre.ecrireAudio(audio), dureeMs: Math.round(duree * 1000) })
        .returning({ id: schema.chatVocals.id }),
      "chat_vocals (vocal créé)",
    );
    return { audio: `/api/vocal/chat/${v.id}`, duree: Math.round(duree * 10) / 10, peaks: ondeDe(alignement) };
  } catch (e) {
    /* Le code d’une ErreurVoix (« voix_429 »), ou le nom d’une autre erreur : jamais son message */
    journalErreur("chat en vocal : la voix n’est pas partie", e, { histoire: story.id });
    return null;
  }
}

/**
 * Les bulles de la lecture, montrées pendant que le modèle écrit (le JSON lu en partie). Une bulle part quand elle est
 * finie (la suivante commence, ou la lecture se ferme), une fois `alerte` lue, si ses preuves existent et si le texte
 * montré jusque-là ne recopie pas les prompts. La première qui ne passe pas arrête l’envoi : la suite vient avec la
 * réponse validée. Un repli sur un autre modèle réécrit tout depuis le début : ce qui est montré ne lui correspond plus,
 * l’envoi s’arrête aussi. `vocal` : la réponse doit partir en vocal, ses bulles ne s’affichent pas, sauf avec une
 * alerte (elle reste écrite).
 */
function bullesAuFil(lignes: Map<string, string>, messages: Map<string, Message>, vocal: boolean, emettre: (e: EvenementChat) => void) {
  let montrees = 0;
  let arret = false;
  let lu = 0;
  let texte = "";
  const surAvance = ({ ecrit }: Avance) => {
    if (arret) return;
    if (ecrit.length < lu) return void (arret = true);
    lu = ecrit.length;
    /* Le lecteur ne rend une chaîne qu’une fois finie : `alerte` est là quand elle est lue en entier */
    const p = partialParse(ecrit) as { alerte?: unknown; lecture?: unknown; a_envoyer?: unknown } | null;
    if (!p || typeof p !== "object" || !("alerte" in p)) return;
    if (vocal && p.alerte === null) return void (arret = true);
    const lecture = Array.isArray(p.lecture) ? (p.lecture as { texte?: unknown; preuves?: unknown }[]) : [];
    /* Les champs suivent l’ordre du schéma : `a_envoyer` commencé, la lecture est close */
    const finies = "a_envoyer" in p ? lecture.length : lecture.length - 1;
    for (; montrees < finies; montrees++) {
      /* Un élément vide (null) se lit comme un texte absent : la lecture s’arrête là */
      const { texte: t, preuves } = lecture[montrees] ?? {};
      const ids = Array.isArray(preuves) ? preuves.filter((x): x is string => typeof x === "string") : [];
      if (typeof t !== "string" || !Array.isArray(preuves) || introuvables(ids, lignes).length || recopieLesPrompts(`${texte} ${t}`, textesSysteme)) return void (arret = true);
      texte += ` ${t}`;
      /* La bulle telle que la réponse la montrera */
      emettre({ bulle: bulleAffichee({ texte: t, preuves: ids }, messages) });
    }
  };
  return { surAvance, montrees: () => montrees };
}

/**
 * Une réponse de BLUSH, en bulles. `ajout` : les messages de leur conv (ou son profil) qu’il vient d’envoyer, et
 * ce que l’historique en réaffiche. Elle enregistre l’échange et, s’il apporte du neuf, programme la mise à jour de la mémoire.
 * `parVocal` : il a envoyé un vocal, BLUSH répond en vocal. Elle répond aussi en vocal tant qu’il le lui a demandé.
 * `surEvenement` : la réponse en flux (POST /api/chat) : ses bulles une à une pendant qu’il écrit, la réponse validée
 * dès que l’échange est enregistré, puis le vocal, fait après elle. La réponse rendue à la fin a son vocal.
 * `differer` : ce qui peut attendre la fin de la réponse (le suivi des coûts) passe après elle.
 */
export async function repondre(
  story: Ligne,
  memoire: DonneesMemoire,
  ditBrut: string,
  ajout?: { ajout: Ajout; affiche: string },
  {
    parVocal = false,
    surEvenement,
    differer,
  }: { parVocal?: boolean; surEvenement?: (e: EvenementChat) => void; differer?: (tache: () => Promise<unknown>) => void } = {},
): Promise<{ reponse: BlushAnswer; majMemoire: boolean }> {
  const meta = metaDe(story);
  const h = histoireDe(meta);
  const ctx = contexteDe(story);
  if (!ctx) throw new ErreurTache("contexte_absent");
  const nouvelles = ajout?.ajout.lignes ?? [];
  const lignes = new Map([...memoire.lignes, ...parIdentifiant(nouvelles)]);
  const dit = ditBrut || (ajout?.ajout.messages ? DEMANDE_PAR_DEFAUT : "(il t’envoie une capture de son profil)");
  const jour = aujourdhuiParis();
  const vocalAttendu = (parVocal || story.chatVocal) && voixDisponible();
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
    vocal: vocalAttendu,
  });
  const messages = messagesAffiches(lignes, h.utilisateur.prenom);

  /*
   * Une preuve introuvable : on rejoue (appelVerifie), sauf après une bulle montrée, qu’un nouvel essai réécrirait autrement
   * (la citation n’est alors pas affichée : bullesAffichees l’ignore). Chaque essai suit ses propres bulles.
   */
  const sortie: ReponseChat = await appelVerifie(req, Sortie10, {
    preuves: preuvesChat,
    lignes,
    storyId: story.id,
    etiquette: "chat",
    ...(differer ? { differer } : {}),
    ...(surEvenement
      ? {
          parEssai: () => {
            const auFil = bullesAuFil(lignes, messages, vocalAttendu, surEvenement);
            return { surAvance: auFil.surAvance, rejouable: () => auFil.montrees() === 0 };
          },
        }
      : {}),
  });

  /* Le garde-fou : une réponse qui recopie les prompts est remplacée */
  const fuite = recopieLesPrompts(texteDe(sortie), textesSysteme);
  if (fuite) journal("garde-fou : réponse remplacée", { histoire: story.id }, "alerte");
  const avant = memoire.etat.niveau?.niveau ?? null;
  /* Le mode vocal après cette réponse : il l’a demandé, ou il a demandé à revenir à l’écrit */
  const modeVocal = fuite ? story.chatVocal : sortie.mode_vocal === "activer" ? true : sortie.mode_vocal === "arreter" ? false : story.chatVocal;
  if (modeVocal !== story.chatVocal) await db().update(schema.stories).set({ chatVocal: modeVocal }).where(eq(schema.stories.id, story.id));
  /* La voix part tout de suite, pendant qu’on enregistre l’échange : la réponse écrite ne l’attend pas */
  const voix = !fuite && (parVocal || modeVocal) && sortie.mode_vocal !== "arreter" && vocalPossible(sortie) ? direReponse(story, sortie) : null;
  const reponse: BlushAnswer = fuite
    ? { kind: "bubbles", bubbles: REFUS_FUITE.map((text) => ({ text })), modeVocal }
    : {
        ...bullesAffichees(sortie, messages),
        ...(sortie.niveau_atteint && sortie.niveau_atteint !== avant ? { levelUp: sortie.niveau_atteint } : {}),
        modeVocal,
      };
  const resumeGarde = fuite ? REFUS_FUITE.join(" / ") : resume(sortie);

  const gardes = await db()
    .insert(schema.chatMessages)
    .values([
      {
        storyId: story.id,
        role: "toi",
        data: coffre.ecrire("chat_messages.data:toi", { texte: dit, ...(ajout ? { lignes: nouvelles.slice(-LIGNES_DANS_LE_FIL), affiche: [ajout.affiche, ditBrut].filter(Boolean).join(" ") } : {}) }),
      },
      { storyId: story.id, role: "blush", data: coffre.ecrire("chat_messages.data:blush", { reponse, resume: resumeGarde }) },
    ])
    .returning({ id: schema.chatMessages.id, role: schema.chatMessages.role });
  /* L’échange (l’id de ton message) part avec la réponse : de quoi la partager en image ensuite */
  const echangeId = gardes.find((g) => g.role === "toi")?.id;
  surEvenement?.({ reponse: { ...reponse, echange: echangeId, ...(voix ? { vocalEnCours: true } : {}) } });

  /* Des messages ajoutés, une nouvelle, un message reçu, une suite, ou un niveau qui bouge : la mémoire se met à jour après la réponse */
  const majMemoire = !fuite && (nouvelles.length > 0 || ["nouvelle", "message_recu", "suite"].includes(sortie.type) || !!sortie.niveau_atteint);
  const echange: Echange = { date: jour.iso, dit, reponse: sortie.lecture.map((b) => b.texte).concat(sortie.a_envoyer ?? []), ...(nouvelles.length ? { lignes: nouvelles } : {}) };
  if (majMemoire) await planifier(story.id, "memoire_maj", echange);

  /* Le vocal, fait après la réponse : l’échange enregistré le reprend (l’historique le réécoute), puis il part */
  const vocal = (voix ? await voix : null) ?? null;
  const blushId = gardes.find((g) => g.role === "blush")?.id;
  if (vocal && blushId !== undefined)
    await db()
      .update(schema.chatMessages)
      .set({ data: coffre.ecrire("chat_messages.data:blush", { reponse: { ...reponse, vocal }, resume: resumeGarde }) })
      .where(eq(schema.chatMessages.id, blushId));
  if (voix) surEvenement?.({ vocal });
  return { reponse: { ...reponse, ...(vocal ? { vocal } : {}), echange: echangeId }, majMemoire };
}
