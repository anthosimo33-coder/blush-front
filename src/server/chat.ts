import "server-only";
import { partialParse } from "@anthropic-ai/sdk/_vendor/partial-json-parser/parser";
import { desc, eq } from "drizzle-orm";
import type { QueryResult } from "pg";
import { blocAjout, type Ajout } from "@prompts/lib/ajouts";
import { requeteChat, type Fil } from "@prompts/lib/contextes";
import { parIdentifiant } from "@prompts/lib/ligne";
import { alerteRetenue, type Echange } from "@prompts/lib/memoire";
import { introuvables, preuvesChat } from "@prompts/lib/preuves";
import { Sortie10, type ReponseChat } from "@prompts/lib/schemas";
import { alerteSobre } from "@prompts/lib/titres";
import { ondeDe, texteDit } from "@/lib/vocal";
import type { BlushAnswer, EvenementChat, Message } from "@/types";
import { coutDe, garderVerrouillee, soldeDe } from "./bulles";
import { ErreurInvariant, ErreurPublique, ErreurTache } from "./erreurs";
import { bulleAffichee, bullesAffichees } from "./ecrans/chat";
import { messagesAffiches } from "./ecrans/messages";
import * as coffre from "./coffre";
import { CLES, compter } from "./compteurs";
import { db, schema, uneLigne } from "./db";
import { modifierMemoire } from "./depot";
import { contexteDe, histoireDe, metaDe, type Ligne } from "./histoires";
import { reponseMasquee } from "./historique";
import { editionsBornees, type DonneesMemoire } from "./stockage/types";
import { env } from "./env";
import { appelVerifie } from "./ia/appel-verifie";
import { textesSysteme, type Avance } from "./ia/claude";
import { recopieLesPrompts, REFUS_FUITE } from "./ia/garde";
import { dire, voixDisponible, voixPour } from "./ia/voix";
import { auMieux, journal, journalErreur } from "./journal";
import { retenir } from "./memoire-groupee";
import { aujourdhuiParis } from "./temps";
import { venteDuChat } from "./vente";

/* Le chat du quotidien : la mémoire à la place de la conv, les derniers échanges, ce qu’il vient d’écrire. */

/** Les derniers échanges que le chat relit : plus que ceux qu’une mise à jour de la mémoire attend (ECHANGES_PAR_MAJ, src/server/memoire-groupee.ts). */
const ECHANGES_DANS_LE_FIL = 6;
/** Des messages envoyés avec un échange, le fil garde les derniers : au-delà, la mémoire se met à jour sans attendre. */
const LIGNES_DANS_LE_FIL = 15;

async function fil(storyId: string): Promise<Fil> {
  const lignes = (
    await db()
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.storyId, storyId))
      .orderBy(desc(schema.chatMessages.id))
      .limit(ECHANGES_DANS_LE_FIL * 2)
  ).reverse();
  /*
   * Une réponse verrouillée (pas encore payée) n’entre pas dans le fil : BLUSH pourrait la redire dans une réponse
   * suivante, payée moins cher qu’elle (une réponse à des captures coûte 3). Son message à lui y reste
   */
  return lignes.flatMap((l): Fil => {
    if (l.role !== "toi") return l.verrouillee ? [] : [{ de: "blush", texte: coffre.lire("chat_messages.data:blush", l.data).resume }];
    const toi = coffre.lire("chat_messages.data:toi", l.data);
    return [{ de: "toi", texte: toi.texte, ...(toi.lignes?.length ? { lignes: toi.lignes } : {}) }];
  });
}

const resume = (r: ReponseChat) => [...r.lecture.map((b) => b.texte), ...(r.a_envoyer ?? []), r.question ?? "", r.reaction ?? ""].filter(Boolean).join(" / ");
const texteDe = (r: ReponseChat) => [resume(r), r.pourquoi ?? ""].join(" ");

/**
 * Ce qu’un échange demande à la mémoire (retenir, src/server/memoire-groupee.ts). Des messages ajoutés, une nouvelle, un
 * message reçu, une suite, un niveau qui bouge, ou une réponse en alerte (une question comme « elle a 14 ans, je lui dis
 * quoi ? » : la mise à jour note ce qui l’a levée) : il ouvre une mise à jour (`neuf`). Un niveau atteint, ou plus de
 * messages ajoutés que le fil n’en garde : elle part sans attendre que le chat se calme (`maintenant`).
 */
export const pourLaMemoire = (sortie: Pick<ReponseChat, "type" | "niveau_atteint" | "alerte">, ajoutes: number) => ({
  neuf: ajoutes > 0 || ["nouvelle", "message_recu", "suite"].includes(sortie.type) || !!sortie.niveau_atteint || !!sortie.alerte,
  maintenant: !!sortie.niveau_atteint || ajoutes > LIGNES_DANS_LE_FIL,
});

/**
 * L’alerte d’une réponse du chat, notée dans sa mémoire : le chat ne relit que ses derniers échanges (ECHANGES_DANS_LE_FIL),
 * et sa mémoire porte l’alerte sur sa ligne de <memoire> (rendreMemoire). Seulement quand elle change ce que la mémoire
 * garde (alerteRetenue : jamais effacée, la règle de l’âge d’abord). Sur la mémoire lue, comme la mise à jour : une
 * mise à jour qui écrit entre-temps la fait recommencer, sans rien perdre. Son échec ne fait pas échouer la réponse, déjà
 * partie : il reste au journal.
 */
async function noterLAlerte(storyId: string, alerte: ReponseChat["alerte"]) {
  await auMieux(
    async () => {
      const notee = await modifierMemoire(
        storyId,
        (avant) => {
          const retenue = alerteRetenue(avant.etat.alerte, alerte);
          return retenue === avant.etat.alerte ? null : { ...avant, etat: { ...avant.etat, alerte: retenue } };
        },
        { essais: 3 },
      );
      if (notee === "occupee" || notee === "absente") journal("chat : l’alerte n’est pas notée dans la mémoire", { histoire: storyId, raison: notee }, "alerte");
    },
    "chat : l’alerte n’est pas notée dans la mémoire",
    { histoire: storyId },
  );
}

/** Ce qu’il écrit quand il envoie des messages sans un mot : la demande qu’on a testée sur les évals. */
const DEMANDE_PAR_DEFAUT = "ça veut dire quoi ? je lui réponds quoi ?";

/** BLUSH répondra-t-il en vocal ? Il a envoyé un vocal, ou le chat est en vocal, et la voix est là. Ce que coûte la réponse en dépend. */
export const repondEnVocal = (story: Pick<Ligne, "chatVocal">, parVocal: boolean) => (parVocal || story.chatVocal) && voixDisponible();

/** Les identifiants d’un échange (ton message, la réponse de BLUSH), pris avant que BLUSH écrive : voir reserverEchange. */
export type IdsDeLEchange = { toi: number; blush: number };

/* La clé du verrou (pg_advisory_xact_lock) qui fait prendre ses deux identifiants d’un coup à chaque échange */
const VERROU_DES_ECHANGES = 0x0b1a5c4a7;

/*
 * Le verrou et les deux identifiants, en un seul message de requête simple : Postgres passe ses deux instructions dans
 * une seule transaction implicite, et le verrou (« xact ») ne dure pas plus qu’elle. Un seul aller-retour jusqu’à la base.
 * Sans paramètre (la clé est une constante) : la requête simple n’en prend pas.
 */
const RESERVER_DEUX_IDS = `select pg_advisory_xact_lock(${VERROU_DES_ECHANGES}); select nextval(pg_get_serial_sequence('chat_messages', 'id'))::text as id from generate_series(1, 2)`;

/**
 * Les identifiants d’un échange, pris d’avance dans la séquence de chat_messages : le débit de la réponse porte le sien
 * (refDuMessage) avant que BLUSH écrive. Deux identifiants qui se suivent, ton message d’abord, pris sous un verrou
 * court : deux échanges en même temps ne s’entremêlent jamais (l’historique lit chaque message de toi suivi de sa
 * réponse). Une réponse qui échoue laisse un trou dans la séquence, sans conséquence.
 * Le verrou est le même pour tous les comptes et toutes les instances : il ne reste jamais pris pendant un aller-retour
 * du réseau ni pendant que Node calcule (RESERVER_DEUX_IDS). Pris dans une transaction de drizzle (BEGIN, le verrou, les
 * identifiants, COMMIT), il durait quatre allers-retours jusqu’à Neon, et plus encore sur une instance occupée : tous
 * les messages du chat, de tous les comptes, l’attendaient (docs/charge.md).
 */
export async function reserverEchange(): Promise<IdsDeLEchange> {
  /* Deux instructions : node-postgres rend un résultat par instruction (ses types n’en disent qu’un), les identifiants dans le dernier */
  const resultats: QueryResult<{ id: string }> | QueryResult<{ id: string }>[] = await db().$client.query(RESERVER_DEUX_IDS);
  const derniers = Array.isArray(resultats) ? resultats[resultats.length - 1] : resultats;
  const lignes: { id: string }[] = derniers?.rows ?? [];
  const ids = lignes.map((r) => Number(r.id)).sort((a, b) => a - b);
  const [toi, blush] = ids;
  if (toi === undefined || blush === undefined) throw new ErreurInvariant("chat_messages:ids");
  return { toi, blush };
}

/**
 * Ce que coûte la réponse, réglé par payer (src/server/paiement-chat.ts, pour POST /api/chat) : le débit est fait avant que BLUSH écrive.
 * `ids` : ceux de l’échange (le débit porte celui de la réponse). `verrouillee` : le solde ne la couvre pas, elle s’écrit
 * mais reste en base (ni ses bulles en flux, ni ce qui se paie, ni son vocal ne partent), au coût `cout`. `ecrit` :
 * sans voix (le solde ne couvrait pas un vocal, ou elle est verrouillée). `regler` : la réponse validée part, avec ce
 * qu’elle coûte vraiment (0 : offerte, la réponse remplacée par le garde-fou) ; il rend le trop-perçu et dit ce qu’il reste (rien pour
 * l’équipe).
 * `paye` : ce qui a été débité jusque-là. `ajouterVocal` : la réponse part en vocal alors qu’elle a été payée comme écrite
 * (« parle-moi en vocal », dans ce message même) : la bulle de plus, faux si le solde ne la couvre pas (elle reste alors
 * écrite). `liberer` : la place de la réponse verrouillée du compte, rendue une fois la réponse gardée.
 */
export type Reglement = {
  ids: IdsDeLEchange;
  verrouillee: boolean;
  ecrit: boolean;
  cout: number;
  paye: () => number;
  ajouterVocal: () => Promise<boolean>;
  liberer?: () => Promise<void>;
  regler: (cout: number) => Promise<BlushAnswer["bulles"]>;
};

/**
 * Une réponse qui peut partir en vocal : la voix est là, la réponse a son texte dit, et pas d’alerte de la règle de l’âge
 * (« danger » et « détresse » partent en vocal comme les autres depuis le 22 octobre 2026).
 */
const vocalPossible = (r: ReponseChat) => voixDisponible() && !!r.dit?.length && !alerteSobre(r.alerte);

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
      "chat_vocals:vocal_cree",
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
    if (vocal && !alerteSobre(p.alerte as ReponseChat["alerte"])) return void (arret = true);
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
 * ce que l’historique en réaffiche. Elle enregistre l’échange et le retient pour la mise à jour de la mémoire, groupée
 * (`majMemoire` : elle part tout de suite, la chaîne est à relancer).
 * `parVocal` : il a envoyé un vocal, BLUSH répond en vocal. Elle répond aussi en vocal tant qu’il le lui a demandé.
 * `surEvenement` : la réponse en flux (POST /api/chat) : ses bulles une à une pendant qu’il écrit, la réponse validée
 * dès que l’échange est enregistré, puis le vocal, fait après elle. La réponse rendue à la fin a son vocal.
 * `differer` : ce qui peut attendre la fin de la réponse (le suivi des coûts) passe après elle.
 * `reglement` : ce qu’elle coûte en bulles (Reglement). Une réponse verrouillée part masquée (reponseMasquee : sa
 * lecture, et la forme de la réponse à envoyer), d’un bloc à la fin (rien en route : on ne sait pas encore ce qui se
 * paiera), sans échange à partager, et ne nourrit la mémoire que de ce qu’il a dit ; une réponse en alerte se paie comme
 * les autres (décidé le 21 octobre 2026), mais verrouillée, elle montre les numéros d’urgence en clair. Une autre réponse verrouillée déjà là : ErreurPublique « bulles », rien n’est gardé. `cle` : la clé de
 * l’envoi, gardée avec ton message (« Réessayer » retrouve sa réponse : reponseDeLEnvoi, src/server/historique.ts).
 * `vendre` : une carte d’achat peut se poser sous la réponse (venteDuChat, src/server/vente.ts) : le chat de l’accueil,
 * pas la question du rapport. Elle part avec la réponse, jamais gardée en base.
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
    reglement,
    cle,
    vendre = false,
  }: {
    parVocal?: boolean;
    surEvenement?: (e: EvenementChat) => void;
    differer?: (tache: () => Promise<unknown>) => void;
    reglement?: Reglement;
    cle?: string;
    vendre?: boolean;
  } = {},
): Promise<{ reponse: BlushAnswer; majMemoire: boolean }> {
  const meta = metaDe(story);
  const h = histoireDe(meta);
  const ctx = contexteDe(story);
  if (!ctx) throw new ErreurTache("contexte_absent");
  const nouvelles = ajout?.ajout.lignes ?? [];
  const leFil = await fil(story.id);
  /*
   * Ce qu’il peut citer : les lignes de la mémoire, celles qu’il vient d’envoyer, et celles des envois précédents que le
   * fil lui remontre avec leurs identifiants (la mémoire ne garde que celles qu’elle cite, et sa mise à jour n’est peut-être
   * pas encore passée). Sans elles, une citation d’un envoi précédent serait introuvable : appel rejoué, citation perdue
   */
  const lignes = new Map([...parIdentifiant(leFil.flatMap((x) => x.lignes ?? [])), ...memoire.lignes, ...parIdentifiant(nouvelles)]);
  const dit = ditBrut || (ajout?.ajout.messages ? DEMANDE_PAR_DEFAUT : "(il t’envoie une capture de son profil)");
  const jour = aujourdhuiParis();
  /* Une réponse sans voix (verrouillée, ou le solde ne couvrait pas un vocal) s’écrit : le modèle ne prépare pas de texte dit */
  const sansVoix = !!reglement?.ecrit;
  const verrouAttendu = !!reglement?.verrouillee;
  const vocalAttendu = !sansVoix && repondEnVocal(story, parVocal);
  const req = requeteChat({
    h,
    aujourdhui: jour.t,
    chiffres: ctx.chiffres,
    fin: ctx.fin,
    etat: memoire.etat,
    lignes,
    editions: editionsBornees(memoire.editions),
    style: ctx.style,
    fil: leFil,
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
    /* Une réponse verrouillée ne montre rien pendant qu’elle s’écrit : sans réponse à envoyer, sa lecture aussi se paiera */
    ...(surEvenement && !verrouAttendu
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
  /*
   * La réponse remplacée par le garde-fou (notre faute) est offerte : jamais verrouillée, ses bulles rendues. Une réponse en
   * alerte (danger, détresse, mineur) se paie comme les autres depuis le 21 octobre 2026 : offerte, une conv en alerte
   * parlait sans fin aux frais de BLUSH. Les numéros d’urgence, eux, restent gratuits (reponseMasquee, l’erreur « bulles »)
   */
  const offerte = fuite;
  const alerte = !fuite && !!sortie.alerte;
  if (alerte) await compter(CLES.alerteChat);
  const verrouillee = verrouAttendu && !offerte;
  const voixVoulue = !sansVoix && !fuite && (parVocal || modeVocal) && sortie.mode_vocal !== "arreter" && vocalPossible(sortie);
  /*
   * Une voix que le débit n’a pas comptée (« parle-moi en vocal », dans ce message même : la réponse a été payée comme
   * écrite) coûte comme tout vocal : la bulle de plus, avant qu’elle parte. Sans elle, la réponse reste écrite. Des
   * captures jointes (3) la couvrent déjà
   */
  const voixPayee = voixVoulue && (!reglement || !!ajout || (await reglement.ajouterVocal()));
  /* La voix part tout de suite, pendant qu’on enregistre l’échange : la réponse écrite ne l’attend pas */
  const voix = voixPayee ? direReponse(story, sortie) : null;
  /*
   * Ce qu’elle coûte vraiment : sa voix est partie ou non, des captures jointes ; verrouillée, ce qu’elle coûtera à la
   * lecture. Jamais plus que ce qui a été débité : la colonne `cout` dit ce que le journal des bulles a pris
   */
  const coutReel = offerte ? null : verrouillee ? (reglement?.cout ?? null) : coutDe({ ajout: !!ajout, vocal: !!voix });
  const cout = coutReel !== null && reglement && !verrouillee ? Math.min(coutReel, reglement.paye()) : coutReel;
  const reponse: BlushAnswer = fuite
    ? { kind: "bubbles", bubbles: REFUS_FUITE.map((text) => ({ text })), modeVocal }
    : {
        ...bullesAffichees(sortie, messages),
        ...(sortie.niveau_atteint && sortie.niveau_atteint !== avant ? { levelUp: sortie.niveau_atteint } : {}),
        modeVocal,
      };
  const resumeGarde = fuite ? REFUS_FUITE.join(" / ") : resume(sortie);

  const lignesDeLEchange = [
    {
      ...(reglement ? { id: reglement.ids.toi } : {}),
      storyId: story.id,
      role: "toi" as const,
      data: coffre.ecrire("chat_messages.data:toi", {
        texte: dit,
        ...(ajout ? { lignes: nouvelles.slice(-LIGNES_DANS_LE_FIL), affiche: [ajout.affiche, ditBrut].filter(Boolean).join(" ") } : {}),
        ...(cle ? { cle } : {}),
      }),
    },
    {
      ...(reglement ? { id: reglement.ids.blush } : {}),
      storyId: story.id,
      role: "blush" as const,
      data: coffre.ecrire("chat_messages.data:blush", { reponse, resume: resumeGarde, ...(alerte ? { alerte: true as const } : {}) }),
      cout,
      verrouillee,
    },
  ];
  const colonnes = { id: schema.chatMessages.id, role: schema.chatMessages.role };
  /* Verrouillée : gardée seulement si aucune autre n’attend déjà pour ce compte (garderVerrouillee) */
  const compte = story.userId;
  if (verrouillee && !compte) throw new ErreurInvariant("chat:verrouillee_sans_compte");
  const gardes =
    verrouillee && compte
      ? await garderVerrouillee(compte, (tx) => tx.insert(schema.chatMessages).values(lignesDeLEchange).returning(colonnes))
      : await db().insert(schema.chatMessages).values(lignesDeLEchange).returning(colonnes);
  /* Gardée (ou refusée) : la place de la réponse verrouillée du compte se libère, la garde de garderVerrouillee prend le relais */
  await reglement?.liberer?.();
  if (!gardes) throw new ErreurPublique("bulles");
  /* L’échange (l’id de ton message) part avec la réponse : de quoi la partager en image ensuite */
  const echangeId = gardes.find((g) => g.role === "toi")?.id;
  const blushId = gardes.find((g) => g.role === "blush")?.id;
  if (blushId === undefined) throw new ErreurInvariant("chat_messages:reponse_non_gardee");
  /* Ce qu’elle a coûté, et ce qu’il reste : réglé au moment où elle part (une verrouillée se paie à la lecture) */
  const bulles = verrouillee ? undefined : await reglement?.regler(cout ?? 0);
  /*
   * Ce qui part au navigateur : la réponse, ou, verrouillée, sa lecture et la forme de ce qui se paie (reponseMasquee).
   * L’échange part avec l’une comme avec l’autre : l’accueil y reconnaît la réponse de sa visite dans l’historique
   * (src/app/app/garde.ts), sans la doubler ; une verrouillée ne se partage pas pour autant (momentAPartager la refuse)
   */
  const avecEchange = echangeId === undefined ? {} : { echange: echangeId };
  /*
   * La carte d’achat sous la réponse, s’il y a lieu : le modèle a vu le moment, le code choisit l’offre (venteDuChat).
   * Jamais sous la réponse du garde-fou, ni pour un compte de l’équipe (pas de solde : bulles illimitées)
   */
  const solde = verrouillee && compte ? await soldeDe(compte) : bulles?.restantes;
  const offre =
    vendre && env().BLUSH_VENTE_CHAT && !fuite && compte && solde !== undefined
      ? await venteDuChat({
          userId: compte,
          storyId: story.id,
          prenom: h.autre.prenom,
          moment: sortie.moment,
          prenomAutre: sortie.prenom_autre,
          alerte: alerte && alerteSobre(sortie.alerte),
          verrouillee,
          solde,
          ajout: nouvelles.length > 0,
        })
      : null;
  const avecOffre = offre ? { offre } : {};
  const montree: BlushAnswer = verrouillee
    ? { ...reponseMasquee(blushId, cout ?? 1, reponse, modeVocal, alerte), ...avecEchange, ...avecOffre }
    : { ...reponse, ...(bulles ? { bulles } : {}), ...avecEchange, ...avecOffre };
  surEvenement?.({ reponse: { ...montree, ...(voix ? { vocalEnCours: true } : {}) } });

  /*
   * L’échange est retenu pour la mise à jour de la mémoire (pourLaMemoire, retenir) : elle part quand le chat se calme,
   * ou tout de suite (`majMemoire` : la chaîne repart après la réponse). Verrouillée, elle n’apprend que ce qu’il a dit :
   * rien de la réponse ne doit ressortir ailleurs (sa fiche) avant d’être payé. Celle du garde-fou ne lui apprend rien
   */
  const echange: Echange = {
    date: jour.iso,
    dit,
    reponse: verrouillee ? [] : sortie.lecture.map((b) => b.texte).concat(sortie.a_envoyer ?? []),
    ...(nouvelles.length ? { lignes: nouvelles } : {}),
  };
  /* L’alerte, notée dans sa mémoire avant l’échange suivant : verrouillée comme payée, rien de ce qui se paie n’y passe */
  if (alerte && alerteRetenue(memoire.etat.alerte, sortie.alerte) !== memoire.etat.alerte) await noterLAlerte(story.id, sortie.alerte);
  const majMemoire = !fuite && (await retenir(story.id, echange, pourLaMemoire(sortie, nouvelles.length))).part;

  /* Le vocal, fait après la réponse : l’échange enregistré le reprend (l’historique le réécoute), puis il part */
  const vocal = (voix ? await voix : null) ?? null;
  if (vocal)
    await db()
      .update(schema.chatMessages)
      .set({ data: coffre.ecrire("chat_messages.data:blush", { reponse: { ...reponse, vocal }, resume: resumeGarde, ...(alerte ? { alerte: true as const } : {}) }) })
      .where(eq(schema.chatMessages.id, blushId));
  /*
   * La voix a échoué : la réponse reste écrite, et coûte ce que coûte une réponse écrite (le reste est rendu). L’événement
   * du vocal dit ce qu’elle a coûté en fin de compte et ce qu’il reste : le compteur de l’écran suit (2 → 1)
   */
  let corrige: BlushAnswer["bulles"];
  if (voix && !vocal && reglement) {
    const ecrite = coutDe({ ajout: !!ajout, vocal: false });
    await auMieux(
      async () => {
        corrige = await reglement.regler(ecrite);
        await db().update(schema.chatMessages).set({ cout: ecrite }).where(eq(schema.chatMessages.id, blushId));
      },
      "chat : les bulles d’un vocal raté non rendues",
      { histoire: story.id },
    );
  }
  const avecCorrige = corrige ? { bulles: corrige } : {};
  if (voix) surEvenement?.({ vocal, ...avecCorrige });
  return { reponse: { ...montree, ...(vocal ? { vocal } : {}), ...avecCorrige }, majMemoire };
}
