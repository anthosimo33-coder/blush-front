import "server-only";
import { eq, sql } from "drizzle-orm";
import { chiffrer as chiffresDe, lire, rendre } from "@prompts/lib/conv";
import { DEMANDE_PLAN, demandeMoitie, requeteMemoireCreation, requeteMemoireMaj, requeteRapport, requeteVerdict, requeteVocal } from "@prompts/lib/contextes";
import { appliquerMaj, citees, estFaite, rapportCourt, rendreNouveau } from "@prompts/lib/memoire";
import { preuvesChapitres, preuvesMaj, preuvesMemoire, preuvesPlan, preuvesRapport, preuvesVerdict, preuvesVocal } from "@prompts/lib/preuves";
import { Etape05, Maj07, Sortie04, Sortie05, Sortie06, Sortie07, type Chapitre, type Plan, type Rapport, type Verdict } from "@prompts/lib/schemas";
import { profil } from "@prompts/lib/style";
import { estOffert } from "@/contenu/chapitres";
import type { Chapter, Message, ScoreRow } from "@/types";
import { avanceChapitres, avanceMoitie, avancePlan, avanceVerdict, CHAPITRES_PAR_MOITIE, chapitresFinis } from "./avancement";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import type { DetailEcriture, Genre } from "./db/enums";
import { donneesMemoire, donneesVerdict, ligneRapport, modifierMemoire } from "./depot";
import { contexteDe, convDe, histoireDe, metaDe, type Ligne, type LigneComplete } from "./histoires";
import { messagesAffiches } from "./ecrans/messages";
import { chapitresAffiches, scores, sobreAffiche, tempsDeLecture } from "./ecrans/rapport";
import { trouvailles } from "./ecrans/trouvailles";
import { ErreurTache } from "./erreurs";
import { aujourdhuiParis } from "./temps";
import type { Avance } from "./ia/claude";
import { appelVerifie } from "./ia/appel-verifie";
import { envoyerMail } from "./email";
import { auMieux, journalErreur } from "./journal";
import { env } from "./env";
import { mailRapport } from "./mail-rapport";
import type { Etape } from "./pipeline";
import { editionsBornees, type Contexte, type DonneesRapport } from "./stockage/types";
import { entreeDe, type Tache } from "./taches";
import { ErreurVoix, voixBloquee, voixDisponible } from "./ia/voix";
import { enregistrerVocal, vocalAJour } from "./vocal";

/*
 * Les étapes de la chaîne : le travail de chaque tâche (le verdict, le plan et les chapitres du rapport, le vocal, la
 * mémoire et ses mises à jour). Chacune lit ce qu’il lui faut, appelle le modèle et garde ce qu’il écrit ; elle ne
 * planifie rien. Le moteur (src/server/pipeline.ts) les exécute une à une et décide de la suite (`suite`).
 */

/* ———— La conv, relue tant qu’elle n’est pas effacée ———— */

function relire(story: LigneComplete) {
  const conv = convDe(story);
  if (!conv) throw new ErreurTache("conv_effacee");
  const meta = metaDe(story);
  /*
   * « Aujourd’hui », pour la lecture : le jour de l’import (à Paris), celui où la conv a été prise. Sans lui, la lecture
   * se croirait au lendemain du dernier message : un silence de plusieurs jours deviendrait « hier ». Le même jour
   * d’un essai à l’autre, et pour le verdict, le rapport et la mémoire.
   */
  const h = { ...histoireDe(meta), aujourdhui: aujourdhuiParis(story.createdAt).iso };
  /* Comme à l’import : un message collé d’un autre reste du texte */
  const lu = lire(conv, h, { autresEnTexte: true });
  return { meta, h, lu, rendu: rendre(h, lu) };
}

/* ———— Les étapes ———— */

/** Écrit l’avancée d’une tâche en base (et son détail), au plus une fois par seconde, sans jamais reculer. */
function ecrireAvance(tacheId: string): (progres: number, detail?: Tache["detail"]) => void {
  let derniere = 0;
  let ecrite = -1;
  return (p, detail) => {
    if (p <= ecrite || Date.now() - derniere < 1000) return;
    derniere = Date.now();
    ecrite = p;
    /* Une jauge qui ne s’écrit pas n’arrête pas l’étape : le journal le dit */
    void auMieux(
      () =>
        db()
          .update(schema.tasks)
          .set({ progress: sql`greatest(${schema.tasks.progress}, ${p})`, ...(detail === undefined ? {} : { detail }) })
          .where(eq(schema.tasks.id, tacheId)),
      "avancée de la tâche non écrite",
      { tache: tacheId },
    );
  };
}
const suivreAvance = (tacheId: string, calcul: (a: Avance) => number) => {
  const ecrire = ecrireAvance(tacheId);
  return (a: Avance) => ecrire(calcul(a));
};

async function verdict(story: LigneComplete, t: Tache) {
  const { h, lu, rendu } = relire(story);
  const chiffres = chiffresDe(h, lu.messages);
  /* Ce que le code sait déjà, gardé avant l’appel : les trouvailles s’affichent pendant que le modèle lit */
  const contexte: Contexte = { chiffres: rendu.chiffres, style: profil(h, lu.messages).bloc, fin: rendu.fin, dernier: lu.messages.at(-1)!.t, trouvailles: trouvailles(chiffres, h, lu.messages) };
  /* Chiffré une fois, écrit deux fois : avant l’appel, puis avec le verdict */
  const context = coffre.ecrire("stories.context", contexte);
  await db().update(schema.stories).set({ context, updatedAt: new Date() }).where(eq(schema.stories.id, story.id));
  const brute = await appelVerifie(requeteVerdict(rendu), Sortie04, { preuves: preuvesVerdict, lignes: rendu.lignes, storyId: story.id, etiquette: "verdict", surAvance: suivreAvance(t.id, avanceVerdict) });
  /* Le mode sobre (le rapport court et doux, offert, jamais partagé) n’existe qu’avec une alerte : danger, détresse, mineur */
  const sortie: Verdict = { ...brute, mode_sobre: !!brute.alerte };
  const data = coffre.ecrire("verdicts.data", { sortie, scores: scores(chiffres) });
  await db()
    .insert(schema.verdicts)
    .values({ storyId: story.id, data })
    .onConflictDoUpdate({ target: schema.verdicts.storyId, set: { data, createdAt: new Date() } });
  await db().update(schema.stories).set({ context, updatedAt: new Date() }).where(eq(schema.stories.id, story.id));
}

/**
 * Le rapport, étape 1 : le plan. En mode sobre (une alerte), le rapport doux entier en un appel, offert : sa partie
 * sobre seulement. Des chapitres que le modèle y aurait écrits ne sont pas gardés : ce rapport ne se paie pas, et ne
 * doit rien ouvrir de plus (S-25).
 */
async function rapportPlan(story: LigneComplete, t: Tache) {
  const { rendu } = relire(story);
  const v = await donneesVerdict(story.id);
  if (!v) throw new ErreurTache("verdict_absent");
  if (v.sortie.mode_sobre) {
    const r = await appelVerifie(requeteRapport(rendu, v.sortie, null), Sortie05, { preuves: preuvesRapport, lignes: rendu.lignes, storyId: story.id, etiquette: "rapport", complet: (x) => !!x.sobre });
    /* Le rapport sobre sans sa partie sobre : un écran vide. On le refait plutôt que de le garder */
    if (!r.sobre) throw new ErreurTache("sobre_vide");
    await garderRapport(story, { ...r, chapitres: null }, rendu.lignes, v.scores);
    return;
  }
  const sortiePlan = await appelVerifie(requeteRapport(rendu, v.sortie, DEMANDE_PLAN), Etape05, {
    preuves: (e) => (e.plan ? preuvesPlan(e.plan) : []),
    lignes: rendu.lignes,
    storyId: story.id,
    etiquette: "rapport_plan",
    partie: "plan",
    surAvance: suivreAvance(t.id, avancePlan),
    complet: (e) => !!e.plan,
  });
  if (!sortiePlan.plan) throw new ErreurTache("plan_vide");
  const plan = coffre.ecrire("reports.plan", sortiePlan.plan);
  await db()
    .insert(schema.reports)
    .values({ storyId: story.id, plan })
    .onConflictDoUpdate({ target: schema.reports.storyId, set: { plan, updatedAt: new Date() } });
  /*
   * La suite (pipeline.ts) : les chapitres, et la tâche « vocal ». Le vocal s’écrit d’habitude pendant les chapitres
   * (voir rapportChapitres) ; sa tâche ne sert que s’il n’a pas pu s’y faire.
   */
}

/** Les deux moitiés du rapport : la première (chapitres 1 à 4) et la seconde (5 à 8), par leur premier chapitre. */
type Moitie = 1 | 5;
/** Les chapitres de la moitié qui commence à `premier` : de lui à CHAPITRES_PAR_MOITIE plus loin. */
const dansLaMoitie = (n: number, premier: Moitie) => n >= premier && n < premier + CHAPITRES_PAR_MOITIE;

/**
 * Le suivi des deux moitiés pendant qu’elles s’écrivent : leur avancée, chapitre par chapitre, écrite en base (la
 * lecture du rapport l’affiche), et chaque chapitre fini gardé tout de suite, prêt à lire, sans attendre la fin du
 * rapport. `surAvance(premier, signal)` : le suivi du flux d’une moitié ; `enregistre()` : la fin des écritures en cours
 * (l’une après l’autre).
 */
function suiviDesChapitres(story: Ligne, t: Tache, messages: Map<string, Message>, lignesScores: ScoreRow[]) {
  const detail: DetailEcriture = { a: { progres: 0, ecrits: [], enCours: null }, b: { progres: 0, ecrits: [], enCours: null } };
  const ecrire = ecrireAvance(t.id);
  const prets = new Map<number, Chapitre>();
  let enregistrement = Promise.resolve();
  const garderPrets = () => {
    const affiches = chapitresAffiches([...prets.values()].sort((x, y) => x.numero - y.numero), messages, lignesScores);
    enregistrement = enregistrement
      .then(() => db().update(schema.reports).set({ partiel: coffre.ecrire("reports.partiel", affiches), updatedAt: new Date() }).where(eq(schema.reports.storyId, story.id)))
      .then(() => undefined, () => undefined);
  };
  const surAvance = (premier: Moitie, signal: AbortSignal) => (av: Avance) => {
    if (signal.aborted) return;
    detail[premier === 1 ? "a" : "b"] = avanceMoitie(av, premier);
    ecrire(Math.round(100 * avanceChapitres(detail)), detail);
    const nouveaux = chapitresFinis(av.ecrit).filter((c) => dansLaMoitie(c.numero, premier) && !prets.has(c.numero));
    nouveaux.forEach((c) => prets.set(c.numero, c));
    if (nouveaux.length) garderPrets();
  };
  return { surAvance, enregistre: () => enregistrement };
}

/** Le rapport, étape 2 : les chapitres 1 à 4 et 5 à 8, écrits en même temps d’après le plan. */
async function rapportChapitres(story: LigneComplete, t: Tache) {
  const { rendu } = relire(story);
  const v = await donneesVerdict(story.id);
  const ligne = await ligneRapport(story.id);
  if (!v || !ligne?.plan) throw new ErreurTache("plan_absent");
  const plan = coffre.lire("reports.plan", ligne.plan);
  const h = histoireDe(metaDe(story));
  /* Les deux moitiés s’écrivent en même temps : on suit chacune, chapitre par chapitre */
  const suivi = suiviDesChapitres(story, t, messagesAffiches(rendu.lignes, h.utilisateur.prenom), v.scores);
  /* Une moitié échoue : l’autre s’arrête aussi (tout repart au prochain essai, rien ne continue d’écrire en double) */
  const abandon = new AbortController();
  const moitie = (quels: "1 à 4" | "5 à 8") =>
    appelVerifie(requeteRapport(rendu, v.sortie, demandeMoitie(plan, quels)), Etape05, {
      preuves: (e) => preuvesChapitres(e.chapitres),
      lignes: rendu.lignes,
      storyId: story.id,
      etiquette: "rapport_chapitres",
      partie: `chapitres ${quels}`,
      surAvance: suivi.surAvance(quels === "1 à 4" ? 1 : 5, abandon.signal),
      signal: abandon.signal,
      complet: (e) => !!e.chapitres?.length,
    }).catch((e: unknown) => {
      abandon.abort();
      throw e;
    });
  /*
   * Le vocal s’écrit en même temps, sur le plan : il est prêt avant les chapitres. Son échec n’arrête pas le rapport
   * (la tâche « vocal », planifiée après, le refera).
   */
  const enParallele = auMieux(
    vocal(story, { verdict: v.sortie, rapport: { plan }, lignes: choisir(rendu.lignes, [...preuvesPlan(plan), ...preuvesVerdict(v.sortie)]), sobre: false }),
    "vocal pendant l’écriture",
    { histoire: story.id },
  );
  /*
   * Les chapitres sont gardés dès qu’ils sont écrits, sans attendre le vocal : une voix lente ne fait plus perdre (et
   * repayer) un rapport fini. Le vocal, lui, finit toujours avant la fin de la tâche : jamais deux vocaux en même temps.
   */
  try {
    const [a, b] = await Promise.all([moitie("1 à 4"), moitie("5 à 8")]);
    await suivi.enregistre();
    /* Chaque moitié ne garde que ses chapitres (1 à 4, 5 à 8), une fois chacun : un chapitre en double ou hors de sa moitié ne s’affiche pas deux fois */
    const garder = (cs: Chapitre[] | null, de: Moitie) => [...new Map((cs ?? []).filter((c) => dansLaMoitie(c.numero, de)).map((c) => [c.numero, c])).values()];
    const [ca, cb] = [garder(a.chapitres, 1), garder(b.chapitres, 5)];
    if (!ca.length || !cb.length) throw new ErreurTache("chapitres_vides");
    const r: Rapport = {
      alerte: plan.alerte,
      mode_sobre: v.sortie.mode_sobre,
      decouvertes: plan.decouvertes,
      these: plan.these,
      chapitres: [...ca, ...cb].sort((x, y) => x.numero - y.numero),
      sobre: null,
    };
    await garderRapport(story, r, rendu.lignes, v.scores);
  } finally {
    await enParallele;
  }
}

/** Le temps de lecture d’un rapport écrit : en entier, et ses chapitres offerts (estOffert, pas le `free` du modèle). */
export const lectureDe = (chapitres: Chapter[]): DonneesRapport["lecture"] => ({
  free: tempsDeLecture(chapitres.filter((c) => estOffert(c.number))),
  full: tempsDeLecture(chapitres),
});

async function garderRapport(story: Ligne, r: Rapport, lignes: Map<string, string>, lignesScores: ScoreRow[]) {
  const h = histoireDe(metaDe(story));
  const chapitres = chapitresAffiches(r.chapitres ?? [], messagesAffiches(lignes, h.utilisateur.prenom), lignesScores);
  const donnees: DonneesRapport = {
    sortie: r,
    chapitres,
    sobre: sobreAffiche(r),
    lecture: lectureDe(chapitres),
  };
  const [avant] = await db().select({ pret: sql<boolean>`${schema.reports.data} is not null` }).from(schema.reports).where(eq(schema.reports.storyId, story.id));
  /* Le rapport assemblé : les chapitres gardés au fil de l’écriture ne servent plus */
  const data = coffre.ecrire("reports.data", donnees);
  await db()
    .insert(schema.reports)
    .values({ storyId: story.id, data })
    .onConflictDoUpdate({ target: schema.reports.storyId, set: { data, partiel: null, updatedAt: new Date() } });
  /* La première fois seulement (pas à une relance) : le mail « ton rapport est prêt » */
  if (!avant?.pret) await prevenirRapportPret(story, donnees, h.autre.prenom);
}

/**
 * Le mail « ton rapport est prêt », avec le lien qui ouvre cette conv-là. Un mail raté ne fait pas échouer le rapport.
 * `autre` : le prénom de l’autre, le titre de son chapitre dans le sommaire, comme dans le rapport.
 */
async function prevenirRapportPret(story: Ligne, donnees: DonneesRapport, autre: string) {
  if (!story.userId) return;
  try {
    const [u] = await db().select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, story.userId));
    if (!u) return;
    const base = env().BLUSH_URL;
    await envoyerMail(u.email, mailRapport({ base, lien: `${base}/ouvrir/${story.id}`, chapitres: donnees.chapitres.length, lecture: donnees.lecture.full, autre, sobre: !!donnees.sobre }));
  } catch (e) {
    journalErreur("mail du rapport non envoyé", e, { histoire: story.id });
  }
}

/** Les messages de la conv qui ont ces identifiants (ceux qu’on laisse citer). */
const choisir = (lignes: Map<string, string>, ids: string[]) => new Map(ids.flatMap((id) => (lignes.has(id) ? [[id, lignes.get(id)!] as const] : [])));

/**
 * Le vocal du rapport : le script (prompt 06, sur le verdict et le plan ou le rapport en court, jamais la conv entière),
 * puis la voix (src/server/vocal.ts). Aucun vocal quand il y a une alerte. Le budget de la voix (S-13) est regardé
 * avant d’écrire le script, qui se paie : s’il ne laisse pas dire un vocal entier, ou s’il se ferme entre-temps, l’étape
 * s’arrête sur « voix_budget » (elle repart après minuit, src/server/pipeline.ts). Une autre erreur de la voix garde
 * son code (« voix_429 »…).
 */
async function vocal(story: Ligne, { verdict, rapport, lignes, sobre }: { verdict: Verdict; rapport: { plan: Plan } | { court: string }; lignes: Map<string, string>; sobre: boolean }) {
  if (!voixDisponible() || verdict.alerte || (await vocalAJour(story.id))) return;
  if (await voixBloquee(story.id, "rapport")) throw new ErreurTache("voix_budget");
  const req = requeteVocal({ h: histoireDe(metaDe(story)), aujourdhui: aujourdhuiParis().t, verdict, rapport, messages: [...lignes.values()] });
  const script = await appelVerifie(req, Sortie06, { preuves: preuvesVocal, lignes, storyId: story.id, etiquette: "vocal" });
  if (script.alerte) return;
  try {
    await enregistrerVocal(story, script, lignes, sobre);
  } catch (e) {
    if (e instanceof ErreurVoix) throw new ErreurTache(e.code.startsWith("voix_budget") ? "voix_budget" : e.code);
    throw e;
  }
}

/**
 * La tâche « vocal » : quand il n’a pas pu se faire pendant l’écriture, pour un rapport écrit avant le vocal, ou d’une
 * ancienne version du script. Sur le rapport fini (sans lui, elle rend la main) ; les messages cités viennent de la conv tant qu’elle est là, sinon
 * de la mémoire.
 */
async function vocalTache(story: LigneComplete) {
  if (!voixDisponible() || (await vocalAJour(story.id))) return;
  const v = await donneesVerdict(story.id);
  const ligne = await ligneRapport(story.id);
  if (!v) throw new ErreurTache("verdict_absent");
  /*
   * Pas encore de rapport : le plan seul est gardé (le vocal se fait pendant les chapitres), ou les chapitres ont échoué.
   * Rien à dire sans erreur : la tâche, tentée, ne repart pas d’elle-même (vocalTente, src/server/chaine.ts), et le vocal
   * s’écrira pendant les chapitres quand ils seront relancés. Une alerte « vocal en échec » n’aurait pas d’objet.
   */
  if (!ligne?.data) return;
  const r = coffre.lire("reports.data", ligne.data).sortie;
  let lignes: Map<string, string>;
  if (convDe(story)) lignes = choisir(relire(story).rendu.lignes, [...preuvesRapport(r), ...preuvesVerdict(v.sortie)]);
  else lignes = new Map((await donneesMemoire(story.id))?.lignes ?? []);
  /*
   * Héritage : un rapport sobre n’a de vocal que s’il n’a pas d’alerte, ce qui n’arrive plus depuis le 9 octobre (le
   * mode sobre suit l’alerte, voir verdict). Avant, un rejet passait aussi en mode sobre, sans alerte : ces rapports
   * doux restent offerts, et leur vocal doux se refait ici. Leurs verdicts sont chiffrés, sans colonne qui les
   * distingue : rien à migrer en SQL. À retirer quand plus aucun verdict d’avant le 9 octobre n’a mode_sobre sans alerte.
   */
  const sobre = r.sobre ? `\nmode sobre : ${r.sobre.intro} ${r.sobre.titre} ${r.sobre.faits} ${r.sobre.reassurance}` : "";
  await vocal(story, { verdict: v.sortie, rapport: { court: rapportCourt(r) + sobre }, lignes, sobre: r.mode_sobre || v.sortie.mode_sobre });
}

/** La mémoire, créée d’après la conv, le verdict et le rapport. Ensuite, la conv brute est effacée. */
async function memoire(story: LigneComplete) {
  const { rendu, lu } = relire(story);
  const v = await donneesVerdict(story.id);
  const ligne = await ligneRapport(story.id);
  if (!v || !ligne?.data) throw new ErreurTache("rapport_absent");
  const r = coffre.lire("reports.data", ligne.data).sortie;
  const etat = await appelVerifie(requeteMemoireCreation(rendu, v.sortie, r), Sortie07, { preuves: preuvesMemoire, lignes: rendu.lignes, storyId: story.id, etiquette: "memoire" });
  if (!estFaite(etat)) throw new ErreurTache("memoire_vide");
  const gardees = [...new Set(citees(etat))].filter((id) => rendu.lignes.has(id)).map((id) => [id, rendu.lignes.get(id)!] as [string, string]);
  const data = coffre.ecrire("memories.data", { etat, lignes: gardees, suivant: lu.messages.length + 1 });
  await db()
    .insert(schema.memories)
    .values({ storyId: story.id, data })
    .onConflictDoUpdate({ target: schema.memories.storyId, set: { data, version: sql`${schema.memories.version} + 1`, updatedAt: new Date() } });
  /* Le rapport et la mémoire sont faits : la conv brute n’a plus de raison d’être gardée */
  if (contexteDe(story)) await db().update(schema.stories).set({ conv: null, convPurgedAt: new Date(), updatedAt: new Date() }).where(eq(schema.stories.id, story.id));
}

/**
 * Après un échange qui apporte du neuf : la mémoire se met à jour (ou dit « rien de neuf », le cas le plus fréquent).
 * Elle n’écrit que sur la mémoire qu’elle a lue : si la fiche a été corrigée entre-temps (la mise à jour prend 20 à
 * 60 s), elle recommence sur la nouvelle, pour ne rien effacer de ce que l’utilisateur vient d’écrire.
 */
async function memoireMaj(story: Ligne, t: Tache) {
  const ech = entreeDe(t);
  if (!ech) throw new ErreurTache("memoire_absente");
  const h = histoireDe(metaDe(story));
  /* Deux essais : chacun rappelle le modèle */
  const ecrite = await modifierMemoire(
    story.id,
    async (avant) => {
      const nouveau = rendreNouveau(ech, h, avant.suivant);
      const lignes = new Map([...avant.lignes, ...nouveau.lignes]);
      const req = requeteMemoireMaj(h, aujourdhuiParis().t, avant.etat, lignes, nouveau.texte, editionsBornees(avant.editions));
      /* La mise à jour ne renvoie que ce qui change ; le code l’applique à la mémoire */
      const maj = await appelVerifie(req, Maj07, { preuves: (m) => (m.rien_de_neuf ? [] : preuvesMaj(m)), lignes, storyId: story.id, etiquette: "memoire_maj", partie: "mise à jour" });
      if (maj.rien_de_neuf) return null;
      const etat = appliquerMaj(avant.etat, maj);
      const gardees = [...new Set(citees(etat))].filter((id) => lignes.has(id)).map((id) => [id, lignes.get(id)!] as [string, string]);
      return { etat, lignes: gardees, suivant: nouveau.suivant, ...(avant.editions ? { editions: editionsBornees(avant.editions) } : {}) };
    },
    { essais: 2 },
  );
  if (ecrite === "absente") throw new ErreurTache("memoire_absente");
  if (ecrite === "occupee") throw new ErreurTache("memoire_changee");
}

/**
 * Le travail de chaque genre de tâche, pour le moteur (src/server/pipeline.ts) : un genre sans étape ne compile pas.
 * Les étapes reçoivent la ligne complète (le moteur la relit avec la conv brute) : celles qui lisent la conv en ont besoin.
 */
export const ETAPES: Record<Genre, Etape> = {
  verdict,
  rapport_plan: rapportPlan,
  rapport_chapitres: rapportChapitres,
  vocal: vocalTache,
  memoire,
  memoire_maj: memoireMaj,
};
