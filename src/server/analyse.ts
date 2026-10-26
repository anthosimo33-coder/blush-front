import "server-only";
import { eq, sql } from "drizzle-orm";
import { chiffrer as chiffresDe, lire, rendre } from "@prompts/lib/conv";
import { DEMANDE_PLAN, demandeMoitie, requeteMemoireCreation, requeteMemoireMaj, requeteRapport, requeteVerdict, requeteVocal } from "@prompts/lib/contextes";
import { alerteRetenue, appliquerMaj, aTrancher, estFaite, rapportCourt, rendreNouveaux, reunirLesAlertes, type Echange } from "@prompts/lib/memoire";
import { introuvables, preuvesChapitres, preuvesMaj, preuvesMemoire, preuvesPlan, preuvesRapport, preuvesVerdict, preuvesVocal } from "@prompts/lib/preuves";
import { Etape05, Maj07, Sortie04, Sortie05, Sortie06, Sortie07, verdictNormalise, type Chapitre, type Maj, type Plan, type Rapport, type Verdict } from "@prompts/lib/schemas";
import { profil } from "@prompts/lib/style";
import { alerteSobre, enAlerteSobre, imposerTitres, titresDuVerdict } from "@prompts/lib/titres";
import { genreDuHaut } from "@/contenu/haut-du-paywall";
import type { ApercuDuPaywall, Message, ScoreRow } from "@/types";
import { avanceChapitres, avanceMoitie, avancePlan, avanceVerdict, CHAPITRES_PAR_MOITIE, chapitresFinis, avanceDeLaSuite } from "./avancement";
import * as coffre from "./coffre";
import { db, schema } from "./db";
import type { DetailEcriture, Genre } from "./db/enums";
import { donneesMemoire, donneesVerdict, ligneRapport, modifierMemoire } from "./depot";
import { compterLeHaut } from "./compteurs";
import { noterLeTitre, noterLeTitreEntier } from "./imports";
import { contexteDe, convDe, histoireDe, metaDe, provenancesDe, type Ligne, type LigneComplete } from "./histoires";
import { messagesAffiches } from "./ecrans/messages";
import { apercuDuPaywall } from "./ecrans/haut-du-paywall";
import { chapitresAffiches, lectureDe, scores, sobreAffiche } from "./ecrans/rapport";
import { trouvailles } from "./ecrans/trouvailles";
import { ErreurTache } from "./erreurs";
import { aujourdhuiParis } from "./temps";
import { consigneDuMontage, type Avance } from "./ia/claude";
import { appelVerifie } from "./ia/appel-verifie";
import { envoyerMail } from "./email";
import { rapportOuvertEnBase } from "./droits";
import { signalerLesAchatsDUneAlerte } from "./achats";
import { auMieux, journal, journalErreur } from "./journal";
import { env } from "./env";
import { mailRapport } from "./mail-rapport";
import { aPrisPremium, noterLEnvoi, personnesDe } from "./sequences";
import type { Etape } from "./pipeline";
import { lectureReunie } from "./morceaux";
import { alertesNoteesDepuis, surLaRelue } from "./memoire-relue";
import { memoireDeSecours, remplacerLeSecours } from "./secours";
import { editionsBornees, lignesGardees, type Contexte, type DonneesMemoire, type DonneesRapport } from "./stockage/types";
import { entreeDe, etatDesTaches, type Tache } from "./taches";
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
  /*
   * Comme à l’import : un message collé d’un autre reste du texte. Plusieurs morceaux : réunis, « Moi » des captures
   * étant celui qui importe (src/server/morceaux.ts), et le modèle lit d’où vient chacun (provenancesDe)
   */
  const lu = typeof conv === "string" ? lire(conv, h, { autresEnTexte: true }) : lectureReunie(conv, h, { k: meta.moi ?? 0, connu: true });
  return { meta, h, lu, rendu: rendre(h, lu, { morceaux: provenancesDe(meta) }) };
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

/** Ce que le code sait d’une conv, sans le modèle : ses chiffres, son style, ses trouvailles (le contexte de la conv). */
function contexteDuCode(story: LigneComplete) {
  const { h, lu, rendu } = relire(story);
  const chiffres = chiffresDe(h, lu.messages);
  const contexte: Contexte = {
    chiffres: rendu.chiffres,
    style: profil(h, lu.messages).bloc,
    fin: rendu.fin,
    dernier: lu.messages.at(-1)!.t,
    trouvailles: trouvailles(chiffres, h, lu.messages),
    accroche: genreDuHaut(apercuDuPaywall(chiffres, lu.messages)),
  };
  return { h, rendu, chiffres, contexte, messages: lu.messages };
}

/**
 * Le contexte d’une conv qui attend son paiement, écrit sans aucun appel au modèle : la lecture et le paywall montrent
 * ses trouvailles avant que rien ne soit payé. Le verdict le récrit, le même, avant son appel. Le titre que son paywall
 * montre y est gardé (chiffré, comme le reste) et compté ici, une fois par conv : /admin compte les achats de chaque titre.
 */
export async function ecrireLeContexte(storyId: string): Promise<void> {
  const [story] = await db().select().from(schema.stories).where(eq(schema.stories.id, storyId));
  if (!story?.conv) return;
  const { contexte } = contexteDuCode(story);
  const context = coffre.ecrire("stories.context", contexte);
  await db().update(schema.stories).set({ context, updatedAt: new Date() }).where(eq(schema.stories.id, storyId));
  if (!contexte.accroche) return;
  await compterLeHaut(contexte.accroche, "vu");
  /* La mesure des imports le garde aussi, conv par conv (l’A/B de la lecture partielle compare les titres de ses deux moitiés) */
  await noterLeTitre(storyId, contexte.accroche);
}

/**
 * Ce que le haut du paywall montre d’une conv qui attend son paiement, calculé par le code sans aucun appel au modèle :
 * qui ouvre la journée, reprend, relance, répond vite, écrit long, et la chute de ses messages s’il y en a une
 * (src/server/ecrans/haut-du-paywall.ts). null : elle n’attend pas son paiement.
 */
export async function apercuAvantPaiement(storyId: string): Promise<ApercuDuPaywall | null> {
  const [[story], { verdict }] = await Promise.all([db().select().from(schema.stories).where(eq(schema.stories.id, storyId)), etatDesTaches(storyId, ["verdict"])]);
  if (!story?.conv || verdict?.status !== "paiement") return null;
  const { h, chiffres, messages } = contexteDuCode(story);
  return apercuDuPaywall(chiffres, messages, h);
}

/**
 * La suite d’une longue vidéo lue en partie avant l’achat (src/server/suite-video.ts), lue avant tout le reste : la conv
 * devient la vidéo entière, et le verdict, le rapport, la mémoire et le chat la lisent comme si elle avait été lue d’un
 * coup. La jauge du verdict avance pendant ce temps, jusqu’à son départ (avanceDeLaSuite). Rend la ligne de la conv,
 * relue si elle a changé (`completee`).
 */
async function avecSaSuite(story: LigneComplete, t: Tache): Promise<{ story: LigneComplete; completee: boolean }> {
  const ecrire = ecrireAvance(t.id);
  const { lireLaSuite } = await import("./suite-video");
  const issue = await lireLaSuite(story.id, (faits, total) => ecrire(avanceDeLaSuite(faits, total)));
  if (issue !== "lue" && issue !== "incomplete") return { story, completee: false };
  const [relue] = await db().select().from(schema.stories).where(eq(schema.stories.id, story.id));
  return { story: relue ?? story, completee: true };
}

async function verdict(lue: LigneComplete, t: Tache) {
  const { story, completee } = await avecSaSuite(lue, t);
  const { rendu, chiffres, contexte: calcule } = contexteDuCode(story);
  /*
   * Le titre que le paywall a montré reste celui de la conv, même si la conv entière en donnerait un autre (la suite d’une
   * longue vidéo, lue depuis) : /admin compte les achats de chaque titre vu. Celui de la conv entière se note à part (la
   * mesure de la lecture partielle : ses titres perdus)
   */
  const vu = story.context ? contexteDe(story)?.accroche : undefined;
  const contexte: Contexte = vu ? { ...calcule, accroche: vu } : calcule;
  if (completee && calcule.accroche) await noterLeTitreEntier(story.id, calcule.accroche);
  /* Ce que le code sait déjà, gardé avant l’appel : les trouvailles s’affichent pendant que le modèle lit. Chiffré une fois, écrit deux fois : avant l’appel, puis avec le verdict */
  const context = coffre.ecrire("stories.context", contexte);
  await db().update(schema.stories).set({ context, updatedAt: new Date() }).where(eq(schema.stories.id, story.id));
  const brute = await appelVerifie(requeteVerdict(rendu, consigneDuMontage("04-verdict")), Sortie04, {
    preuves: preuvesVerdict,
    lignes: rendu.lignes,
    storyId: story.id,
    etiquette: "verdict",
    surAvance: suivreAvance(t.id, avanceVerdict),
  });
  /*
   * Le mode sobre (le rapport court et doux, offert, jamais partagé) n’existe qu’avec une alerte : danger, détresse,
   * mineur. Les titres des chapitres fermés sont vérifiés sur la conv, encore là (ce qu’ils citent, un message le dit) :
   * ceux qui ne passent pas sont vidés, et leur chapitre garde son titre d’attente (prompts/lib/titres.ts)
   */
  const sortie = verdictNormalise(brute, rendu.lignes);
  const data = coffre.ecrire("verdicts.data", { sortie, scores: scores(chiffres) });
  await db()
    .insert(schema.verdicts)
    .values({ storyId: story.id, data })
    .onConflictDoUpdate({ target: schema.verdicts.storyId, set: { data, createdAt: new Date() } });
  await db().update(schema.stories).set({ context, updatedAt: new Date() }).where(eq(schema.stories.id, story.id));
  /*
   * Payée avant d’être lue (le paywall d’abord), une conv en mode sobre (la règle de l’âge) est à rembourser : l’équipe
   * est prévenue. Une alerte « danger » se vend depuis le 21 octobre 2026, « détresse » depuis le 22 : leur rapport
   * complet s’écrit, rien à rembourser
   */
  if (sortie.alerte && sortie.mode_sobre) await auMieux(signalerLesAchatsDUneAlerte(story.id, sortie.alerte), "achats d’une alerte non signalés", { histoire: story.id });
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
    const r = await appelVerifie(requeteRapport(rendu, v.sortie, null, consigneDuMontage("05-rapport")), Sortie05, {
      preuves: preuvesRapport,
      lignes: rendu.lignes,
      storyId: story.id,
      etiquette: "rapport",
      complet: (x) => !!x.sobre,
    });
    /* Le rapport sobre sans sa partie sobre : un écran vide. On le refait plutôt que de le garder */
    if (!r.sobre) throw new ErreurTache("sobre_vide");
    await garderRapport(story, { ...r, chapitres: null }, rendu.lignes, v.scores);
    return;
  }
  const sortiePlan = await appelVerifie(requeteRapport(rendu, v.sortie, DEMANDE_PLAN, consigneDuMontage("05-rapport")), Etape05, {
    preuves: (e) => (e.plan ? preuvesPlan(e.plan) : []),
    lignes: rendu.lignes,
    storyId: story.id,
    etiquette: "rapport_plan",
    partie: "plan",
    surAvance: suivreAvance(t.id, avancePlan),
    complet: (e) => !!e.plan,
  });
  if (!sortiePlan.plan) throw new ErreurTache("plan_vide");
  /*
   * Les titres que le verdict a promis (montrés sur les chapitres fermés) remplacent ceux du plan : les deux moitiés les
   * reçoivent avec lui (le prompt 05 les y suit déjà ; le code s’en assure, au mot près)
   */
  const plan = coffre.ecrire("reports.plan", { ...sortiePlan.plan, chapitres: imposerTitres(sortiePlan.plan.chapitres, titresDuVerdict(v.sortie)) });
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
function suiviDesChapitres(story: Ligne, t: Tache, messages: Map<string, Message>, lignesScores: ScoreRow[], titres: Map<number, string>) {
  const detail: DetailEcriture = { a: { progres: 0, ecrits: [], enCours: null }, b: { progres: 0, ecrits: [], enCours: null } };
  const ecrire = ecrireAvance(t.id);
  const prets = new Map<number, Chapitre>();
  let enregistrement = Promise.resolve();
  const garderPrets = () => {
    const affiches = chapitresAffiches(
      imposerTitres(
        [...prets.values()].sort((x, y) => x.numero - y.numero),
        titres,
      ),
      messages,
      lignesScores,
    );
    /* Des chapitres qui ne s’écrivent pas n’arrêtent pas le rapport : le journal le dit, et la chaîne ne rejette jamais */
    enregistrement = enregistrement.then(() =>
      auMieux(
        () =>
          db()
            .update(schema.reports)
            .set({ partiel: coffre.ecrire("reports.partiel", affiches), updatedAt: new Date() })
            .where(eq(schema.reports.storyId, story.id)),
        "chapitres prêts non gardés",
        { tache: t.id, histoire: story.id },
      ),
    );
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
  /* Les titres promis par le verdict : chaque chapitre écrit les porte, au mot près (le plan les a déjà) */
  const titres = titresDuVerdict(v.sortie);
  /* Les deux moitiés s’écrivent en même temps : on suit chacune, chapitre par chapitre */
  const suivi = suiviDesChapitres(story, t, messagesAffiches(rendu.lignes, h.utilisateur.prenom), v.scores, titres);
  /* Une moitié échoue : l’autre s’arrête aussi (tout repart au prochain essai, rien ne continue d’écrire en double) */
  const abandon = new AbortController();
  const moitie = (quels: "1 à 4" | "5 à 8") =>
    appelVerifie(requeteRapport(rendu, v.sortie, demandeMoitie(plan, quels), consigneDuMontage("05-rapport")), Etape05, {
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
    "vocal en échec pendant l’écriture",
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
      chapitres: imposerTitres(
        [...ca, ...cb].sort((x, y) => x.numero - y.numero),
        titres,
      ),
      sobre: null,
    };
    await garderRapport(story, r, rendu.lignes, v.scores);
  } finally {
    await enParallele;
  }
}

/**
 * Les découvertes qu’un rapport garde, au plus : le prompt 05 en demande trois, et le modèle en écrit parfois une de
 * plus (la conv compacte, cas 10 du banc, deux fois sur deux, le 21 octobre). Les premières sont gardées.
 */
const DECOUVERTES_MAX = 3;

async function garderRapport(story: Ligne, brut: Rapport, lignes: Map<string, string>, lignesScores: ScoreRow[]) {
  const r: Rapport = { ...brut, decouvertes: brut.decouvertes.slice(0, DECOUVERTES_MAX) };
  const h = histoireDe(metaDe(story));
  const chapitres = chapitresAffiches(r.chapitres ?? [], messagesAffiches(lignes, h.utilisateur.prenom), lignesScores);
  const donnees: DonneesRapport = {
    sortie: r,
    chapitres,
    sobre: sobreAffiche(r),
    lecture: lectureDe(chapitres),
  };
  const [avant] = await db()
    .select({ pret: sql<boolean>`${schema.reports.data} is not null` })
    .from(schema.reports)
    .where(eq(schema.reports.storyId, story.id));
  /* Le rapport assemblé : les chapitres gardés au fil de l’écriture ne servent plus */
  const data = coffre.ecrire("reports.data", donnees);
  await db()
    .insert(schema.reports)
    .values({ storyId: story.id, data })
    .onConflictDoUpdate({ target: schema.reports.storyId, set: { data, partiel: null, updatedAt: new Date() } });
  /* Son alerte, sur la mémoire de secours écrite avant lui : lue, comme celle du verdict (porterLAlerteDuRapport) */
  await auMieux(() => porterLAlerteDuRapport(story.id, r.alerte), "rapport : son alerte n’est pas portée sur la mémoire de secours", { histoire: story.id });
  /* La première fois seulement (pas à une relance) : le mail « ton rapport est prêt » */
  if (!avant?.pret) await prevenirRapportPret(story, donnees);
}

/**
 * L’alerte du rapport, portée sur une mémoire de secours écrite avant lui (le rapport débloqué, pas encore écrit : elle
 * n’a que celle du verdict). Lue, comme celle du verdict (reunirLesAlertes) : une mise à jour ne l’efface pas, même si une
 * réponse du chat l’a vue entre-temps (elle est alors confirmée). Rien sur une vraie mémoire (sa création a lu le rapport),
 * ni sans alerte. À l’écriture du rapport, et à l’échec pour de bon de la vraie mémoire (garderUneMemoireDeSecours), au
 * cas où la mémoire de secours serait arrivée juste après. Vrai si elle l’a changée.
 */
async function porterLAlerteDuRapport(storyId: string, alerte: Rapport["alerte"]): Promise<boolean> {
  if (!alerte) return false;
  const portee = await modifierMemoire(
    storyId,
    (avant) => {
      if (!avant.secours) return null;
      const etat = reunirLesAlertes(avant.etat, { alerte });
      return etat === avant.etat ? null : { ...avant, etat };
    },
    { essais: 3 },
  );
  if (portee === "occupee") journal("rapport : son alerte n’est pas portée sur la mémoire de secours", { histoire: storyId, raison: portee }, "alerte");
  return portee === "ecrite";
}

/**
 * Le mail « ton rapport est prêt » (S3 J0 des séquences), avec le lien qui ouvre cette conv-là : leurs prénoms, et ce
 * qu’elle a pris (le rapport, ou Premium). Parti, il est noté (src/server/sequences.ts) : il compte pour le mail du jour,
 * et « il t’a répondu ? » vient le lendemain. Un mail raté ne fait pas échouer le rapport.
 */
async function prevenirRapportPret(story: Ligne, donnees: DonneesRapport) {
  const personnes = personnesDe(metaDe(story));
  if (!story.userId || !personnes) return;
  try {
    const [u] = await db().select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, story.userId));
    if (!u) return;
    const base = env().BLUSH_URL;
    const premium = await aPrisPremium(story.id, story.userId);
    const mail = mailRapport({
      base,
      lien: `${base}/ouvrir/${story.id}`,
      chapitres: donnees.chapitres.length,
      lecture: donnees.lecture.full,
      personnes,
      premium,
      sobre: !!donnees.sobre,
    });
    if (await envoyerMail(u.email, mail)) await noterLEnvoi(story.userId, "s3_rapport", story.id, story.id);
  } catch (e) {
    journalErreur("mail du rapport non envoyé", e, { histoire: story.id });
  }
}

/** Les messages de la conv qui ont ces identifiants (ceux qu’on laisse citer). */
const choisir = (lignes: Map<string, string>, ids: string[]) => new Map(ids.flatMap((id) => (lignes.has(id) ? [[id, lignes.get(id)!] as const] : [])));

/**
 * Le vocal du rapport : le script (prompt 06, sur le verdict et le plan ou le rapport en court, jamais la conv entière),
 * puis la voix (src/server/vocal.ts). Aucun vocal en alerte sobre (la règle de l’âge, ou un rapport doux gardé) :
 * « danger » et « détresse » ont le leur depuis le 22 octobre 2026. Le budget de la voix (S-13) est regardé
 * avant d’écrire le script, qui se paie : s’il ne laisse pas dire un vocal entier, ou s’il se ferme entre-temps, l’étape
 * s’arrête sur « voix_budget » (elle repart après minuit, src/server/pipeline.ts). Une autre erreur de la voix garde
 * son code (« voix_429 »…).
 */
async function vocal(
  story: Ligne,
  { verdict, rapport, lignes, sobre }: { verdict: Verdict; rapport: { plan: Plan } | { court: string }; lignes: Map<string, string>; sobre: boolean },
) {
  if (!voixDisponible() || enAlerteSobre(verdict) || (await vocalAJour(story.id))) return;
  if (await voixBloquee(story.id, "rapport")) throw new ErreurTache("voix_budget");
  /* Dans le montage partagé, son système est le socle seul, relu dans le cache du verdict (consigneDuMontage) */
  const req = requeteVocal({
    h: histoireDe(metaDe(story)),
    aujourdhui: aujourdhuiParis().t,
    verdict,
    rapport,
    messages: [...lignes.values()],
    consigne: consigneDuMontage("06-vocal"),
  });
  const script = await appelVerifie(req, Sortie06, { preuves: preuvesVocal, lignes, storyId: story.id, etiquette: "vocal" });
  if (alerteSobre(script.alerte)) return;
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

/**
 * La mémoire, créée d’après la conv, le verdict et le rapport. Son alerte : celle du verdict ou du rapport, que le
 * modèle ne reprend pas toujours à la création, la règle de l’âge d’abord (alerteRetenue), comme le code impose déjà
 * leurs titres : le chat la lit sur sa ligne de <memoire>. Une mémoire de secours écrite entre-temps (le chat a répondu
 * avant elle, ou elle repart après un échec) lui laisse la place (remplacerLeSecours) ; une vraie déjà là reste telle
 * quelle. Ensuite, la conv brute est effacée.
 */
async function memoire(story: LigneComplete) {
  const { rendu, lu } = relire(story);
  const v = await donneesVerdict(story.id);
  const ligne = await ligneRapport(story.id);
  if (!v || !ligne?.data) throw new ErreurTache("rapport_absent");
  const r = coffre.lire("reports.data", ligne.data).sortie;
  const etat = await appelVerifie(requeteMemoireCreation(rendu, v.sortie, r, consigneDuMontage("07-memoire")), Sortie07, {
    preuves: preuvesMemoire,
    lignes: rendu.lignes,
    storyId: story.id,
    etiquette: "memoire",
  });
  if (!estFaite(etat)) throw new ErreurTache("memoire_vide");
  /* Sans alerte au verdict, au rapport ni à la création, aucune : la mémoire reste celle que le modèle a écrite */
  const gardee = { ...etat, alerte: alerteRetenue(etat.alerte, r.alerte, v.sortie.alerte) };
  const donnees = { etat: gardee, lignes: lignesGardees(gardee, rendu.lignes), suivant: lu.messages.length + 1 };
  const [neuve] = await db()
    .insert(schema.memories)
    .values({ storyId: story.id, data: coffre.ecrire("memories.data", donnees) })
    .onConflictDoNothing()
    .returning({ storyId: schema.memories.storyId });
  if (!neuve) {
    /* Sur la mémoire lue : une fiche corrigée pendant l’écriture fait recommencer le remplacement, sans rien perdre */
    const remplacee = await modifierMemoire(story.id, (avant) => (avant.secours ? remplacerLeSecours(avant, donnees) : null), { essais: 3 });
    /* Effacée entre-temps, ou toujours changée : on recommence (la conv n’est effacée qu’une mémoire écrite) */
    if (remplacee === "occupee" || remplacee === "absente") throw new ErreurTache("memoire_changee");
  }
  /* Le rapport et la mémoire sont faits : la conv brute n’a plus de raison d’être gardée */
  if (contexteDe(story)) await db().update(schema.stories).set({ conv: null, convPurgedAt: new Date(), updatedAt: new Date() }).where(eq(schema.stories.id, story.id));
}

/**
 * Écrit une mémoire de secours (src/server/secours.ts) quand l’histoire n’en a aucune, et rend sa mémoire : le chat
 * répond toujours. Tirée du verdict, et du rapport s’il est écrit, avec les messages qu’ils citent tant que la conv est
 * là. Rien sans verdict, ni sans rapport écrit ou débloqué (le chat s’ouvre avec lui). Une vraie mémoire déjà là n’est
 * jamais touchée ; une de secours écrite avant le rapport reçoit son alerte, si son écriture ne la lui a pas portée
 * (porterLAlerteDuRapport). Après un échec de la vraie (src/server/pipeline.ts), au premier message du chat, à un ajout à
 * sa fiche, et avant une mise à jour qui ne trouverait rien à mettre à jour.
 */
export async function garderUneMemoireDeSecours(storyId: string): Promise<DonneesMemoire | null> {
  const deja = await donneesMemoire(storyId);
  if (deja?.secours) {
    const ligne = await ligneRapport(storyId);
    const alerte = ligne?.data ? coffre.lire("reports.data", ligne.data).sortie.alerte : null;
    if (await porterLAlerteDuRapport(storyId, alerte)) return donneesMemoire(storyId);
  }
  if (deja) return deja;
  const [[story], v, ligne] = await Promise.all([db().select().from(schema.stories).where(eq(schema.stories.id, storyId)), donneesVerdict(storyId), ligneRapport(storyId)]);
  if (!story || !v) return null;
  const rapport = ligne?.data ? coffre.lire("reports.data", ligne.data).sortie : null;
  if (!rapport && !(await rapportOuvertEnBase(storyId))) return null;
  const { lignes, suivant } = banqueDuSecours(story);
  const secours = memoireDeSecours({ verdict: v.sortie, rapport, lignes, suivant, jour: aujourdhuiParis().iso });
  const [ecrite] = await db()
    .insert(schema.memories)
    .values({ storyId, data: coffre.ecrire("memories.data", secours) })
    .onConflictDoNothing()
    .returning({ storyId: schema.memories.storyId });
  if (ecrite) journal("mémoire de secours écrite", { histoire: storyId, rapport: !!rapport, lignes: secours.lignes.length }, "alerte");
  return donneesMemoire(storyId);
}

/** Les messages qu’une mémoire de secours peut citer, et le prochain identifiant libre : de la conv tant qu’elle est là. */
function banqueDuSecours(story: LigneComplete): { lignes: Map<string, string>; suivant: number } {
  if (convDe(story)) {
    try {
      const { lu, rendu } = relire(story);
      return { lignes: rendu.lignes, suivant: lu.messages.length + 1 };
    } catch (e) {
      /* Une conv qu’on ne relit plus ne prive pas le chat de sa mémoire : elle part sans citations */
      journalErreur("mémoire de secours : conv illisible", e, { histoire: story.id });
    }
  }
  return { lignes: new Map(), suivant: story.nextMessage ?? 1 };
}

/* ———— La mise à jour de la mémoire ———— */

/** Au plus ce nombre d’appels au modèle pour une mise à jour (un premier, et un second si la mémoire a changé entre-temps). */
const APPELS_PAR_MAJ = 2;

/** Les preuves qu’une mise à jour cite : aucune quand elle dit « rien de neuf ». */
const preuvesDeLaMaj = (m: Maj) => (m.rien_de_neuf ? [] : preuvesMaj(m));

/**
 * Ce qu’une mise à jour lit, faite sur cette mémoire (`lue`) et ces échanges : sa requête (requeteMemoireMaj), les messages
 * qu’elle peut citer (ceux de la mémoire, et ceux des échanges, numérotés à la suite : rendreNouveaux), et le prochain
 * numéro libre. La même en direct et en lot (src/server/memoire-en-lot.ts) : le lot envoie cette requête-là.
 */
export function preparerLaMaj(story: Ligne, lue: DonneesMemoire, echanges: Echange[]) {
  const h = histoireDe(metaDe(story));
  const nouveau = rendreNouveaux(echanges, h, lue.suivant);
  const lignes = new Map([...lue.lignes, ...nouveau.lignes]);
  /* La ligne de l’alerte et la décision suivent les mêmes échanges que la mémoire lue */
  const trancher = aTrancher(lue.etat, echanges);
  const req = requeteMemoireMaj(h, aujourdhuiParis().t, lue.etat, lignes, nouveau.blocs, editionsBornees(lue.editions), { trancher });
  return { req, lignes, suivant: nouveau.suivant };
}

/**
 * La mémoire après la mise à jour `maj`, faite sur `lue` : le code applique ce qui change (appliquerMaj). Null : elle n’y
 * change rien (« rien de neuf » ne s’écrit pas, sauf s’il tranche une alerte venue du chat : appliquerMaj rend alors un
 * autre état).
 */
function majAppliquee(
  lue: DonneesMemoire,
  maj: Maj,
  echanges: Echange[],
  { lignes, suivant }: Pick<ReturnType<typeof preparerLaMaj>, "lignes" | "suivant">,
): DonneesMemoire | null {
  const etat = appliquerMaj(lue.etat, maj, echanges);
  if (etat === lue.etat) return null;
  return {
    etat,
    lignes: lignesGardees(etat, lignes),
    suivant,
    ...(lue.editions ? { editions: editionsBornees(lue.editions) } : {}),
    /* Mise à jour, une mémoire de secours le reste : la vraie la remplacera */
    ...(lue.secours ? { secours: true as const } : {}),
  };
}

/**
 * Après des échanges qui apportent du neuf (retenus ensemble jusqu’à ce que le chat se calme : src/server/memoire-groupee.ts),
 * ou un ajout à sa fiche : la mémoire se met à jour, en un seul appel pour tous (ou dit « rien de neuf », le cas le plus
 * fréquent). Elle tranche aussi l’alerte qu’une réponse du chat a notée (venue du chat : confirmée ou effacée,
 * prompts/lib/memoire.ts, appliquerMaj), seulement si un de ses échanges relit cette réponse (aTrancher) : notée après
 * qu’elle est partie, l’alerte attend la mise à jour qui a son échange. Jamais celle de la lecture. Elle n’écrit que sur
 * la mémoire qu’elle a lue : si la fiche a été corrigée entre-temps (la mise à jour prend 20 à 60 s), elle recommence
 * sur la nouvelle, pour ne rien effacer de ce que l’utilisateur vient d’écrire. Si le chat n’y a noté que des alertes, sa
 * sortie s’applique encore, ces alertes rejouées par-dessus, sans rappeler le modèle (src/server/memoire-relue.ts).
 */
async function memoireMaj(story: Ligne, t: Tache) {
  const echanges = entreeDe(t);
  if (!echanges?.length) throw new ErreurTache("memoire_absente");
  /* Pas encore de mémoire (la vraie a échoué, et celle de secours n’a pas pu s’écrire à ce moment-là) : celle de secours d’abord */
  if (!(await donneesMemoire(story.id))) await garderUneMemoireDeSecours(story.id);
  /* La dernière mise à jour faite : la mémoire qu’elle a lue, et ce qu’elle en a fait */
  let faite: { lue: DonneesMemoire; apres: DonneesMemoire | null } | null = null;
  let appels = 0;
  const ecrite = await modifierMemoire(
    story.id,
    async (lue) => {
      /* La mémoire n’a changé que par des alertes du chat : la sortie déjà là s’applique encore */
      const notees = faite && alertesNoteesDepuis(faite.lue, lue);
      if (faite && notees) return surLaRelue(faite.apres, notees);
      if (appels++ >= APPELS_PAR_MAJ) throw new ErreurTache("memoire_changee");
      const prepa = preparerLaMaj(story, lue, echanges);
      /* La mise à jour ne renvoie que ce qui change ; le code l’applique à la mémoire */
      const maj = await appelVerifie(prepa.req, Maj07, {
        preuves: preuvesDeLaMaj,
        lignes: prepa.lignes,
        storyId: story.id,
        etiquette: "memoire_maj",
        partie: "mise à jour",
      });
      faite = { lue, apres: majAppliquee(lue, maj, echanges, prepa) };
      return faite.apres;
    },
    /* Un essai de plus que d’appels : celui qui ne fait que rejouer des alertes */
    { essais: APPELS_PAR_MAJ + 1 },
  );
  if (ecrite === "absente") throw new ErreurTache("memoire_absente");
  if (ecrite === "occupee") throw new ErreurTache("memoire_changee");
}

/**
 * La réponse d’une mise à jour partie en lot (src/server/memoire-en-lot.ts), appliquée à la mémoire : elle a été faite sur
 * `lue` (la mémoire gardée à l’envoi), et ne s’écrit que sur elle, ou sur elle et les alertes que le chat a notées depuis
 * (comme en direct). « faite » : écrite, ou rien à écrire ; « preuves » : elle cite des messages introuvables (en direct,
 * le modèle serait rappelé) ; « a_refaire » : la mémoire a changé autrement (une fiche corrigée, une autre mise à jour),
 * ou elle n’est plus là. Dans ces deux cas, la mise à jour repart en direct, sur la mémoire d’aujourd’hui.
 */
export async function majDuLot(story: Ligne, echanges: Echange[], lue: DonneesMemoire, maj: Maj): Promise<"faite" | "preuves" | "a_refaire"> {
  const prepa = preparerLaMaj(story, lue, echanges);
  if (introuvables(preuvesDeLaMaj(maj), prepa.lignes).length) return "preuves";
  const apres = majAppliquee(lue, maj, echanges, prepa);
  let aRefaire = false;
  const ecrite = await modifierMemoire(
    story.id,
    (relue) => {
      const notees = alertesNoteesDepuis(lue, relue);
      aRefaire = !notees;
      return notees ? surLaRelue(apres, notees) : null;
    },
    { essais: 3 },
  );
  return aRefaire || ecrite === "absente" || ecrite === "occupee" ? "a_refaire" : "faite";
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
