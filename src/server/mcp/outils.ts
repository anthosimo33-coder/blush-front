import "server-only";
import { aRegarder } from "@/app/admin/a-regarder";
import { ETAPES_DU_TUNNEL, JALONS_DE_L_IMPORT, JALONS_DU_PAYWALL, fuiteDuTunnel, nomDeLAppli, rapport, tauxLisible, texteDuGeste } from "@/app/admin/calculs";
import { AIDES_DU_PILOTAGE } from "@/contenu/aide-pilotage";
import { NOM_DU_GENRE } from "@/contenu/haut-du-paywall";
import { NOMS_DES_MAILS } from "@/contenu/mails";
import { CATALOGUE } from "@/contenu/offres";
import { CIBLE_DE_MARGE, NOMS_DES_ETAPES, NOMS_DES_GENRES, NOMS_DES_GROUPES, NOMS_DES_PAIRES, NOMS_DES_SOURCES, PAIRES, SOURCE_INCONNUE, margeApresIA } from "@/contenu/pilotage";
import type { SourceVisite } from "@/types";
import { delivrabilite } from "../delivrabilite";
import { direct } from "../direct";
import { actionsRecentes } from "../equipe";
import { santeDesNavigateurs } from "../navigateur";
import { statsAdmin, type Chiffre, type Montant, type Periode, type Pilotage, type StatsAdmin, type Ventes } from "../stats";
import { ErreurDOutil, resultatTexte, type OutilMcp, type ResultatDOutil, type SchemaDArgument, type ServeurMcp } from "./protocole";

/*
 * Les outils du serveur MCP : ce que montre /admin, en lecture seule, lu par les mêmes fonctions que la page
 * (statsAdmin, direct, delivrabilite, santeDesNavigateurs, actionsRecentes). Que des nombres, des noms d’écrans et des
 * villes : aucune conv, aucun message, aucun email n’en sort (comme de /admin). Aucun outil ne change quoi que ce soit :
 * les gestes de l’équipe (des bulles, un déblocage, une invitation, un tournage) restent dans /admin. L’argent est TTC,
 * en euros (deux décimales), l’IA en dollars ; chaque réponse est du JSON, que le modèle lit tel quel.
 */

const PERIODES = [1, 7, 30] as const satisfies readonly Periode[];

const JOURS: SchemaDArgument = {
  type: "integer",
  enum: PERIODES,
  description: "La période : 1 (les dernières 24 h), 7 ou 30 (les derniers jours, en fenêtre glissante, comparés à la période d’avant de même durée). 7 par défaut.",
};
const AVEC_JOURS = { type: "object", properties: { jours: JOURS }, additionalProperties: false } as const;
const SANS_ARGUMENT = { type: "object", properties: {}, additionalProperties: false } as const;

/** Les outils, dans l’ordre où les lire : le pilotage d’abord. */
export const OUTILS: readonly OutilMcp[] = [
  {
    name: "pilotage",
    title: "Pilotage",
    description:
      "L’écran principal de /admin sur la période : « À regarder » (ce qui coince, les bonnes nouvelles), le chiffre d’affaires net (payé − remboursé − contesté), les visiteurs, les acheteurs, le taux d’achat, le revenu par acheteur, la dépense de l’IA et la marge après l’IA (cible comprise), le tunnel visiteurs → imports → paywall → acheteurs → racheteurs et sa plus grosse fuite, qui importe (des filles ou des garçons, sur un garçon ou une fille, et le taux d’achat de chacun), les sources, ce qui se vend, et la santé. Chaque chiffre avec celui de la période d’avant. À appeler en premier.",
    inputSchema: AVEC_JOURS,
  },
  {
    name: "evolution",
    title: "Évolution",
    description:
      "Les courbes du pilotage : heure par heure (sur 1 jour) ou jour par jour (7 ou 30), les visiteurs, les acheteurs, le payé en euros et l’IA en dollars de chaque case. La dernière case est en cours.",
    inputSchema: AVEC_JOURS,
  },
  {
    name: "tunnel",
    title: "Tunnel détaillé",
    description:
      "Le tunnel écran par écran sur la période : les jalons de l’import (du choix de l’appli au lancement de la lecture), l’import appli par appli (WhatsApp, Instagram, iMessage, Captures ou vidéo : ceux qui ouvrent son écran, qui y choisissent un fichier, et le taux de passage à partir de 30 personnes, puis les convs bien reçues et les envois ratés), les jalons du paywall (de l’arrivée au paiement), les titres du haut du paywall (vus, payés), les offres uniques (montrées, prises), les commandes (payées, échouées, en attente) et jusqu’où vont les convs importées.",
    inputSchema: AVEC_JOURS,
  },
  {
    name: "ventes",
    title: "Ventes et bulles",
    description:
      "Les ventes d’aujourd’hui et des 7 derniers jours (jours de Paris, quelle que soit la période) : payé, remboursé, contesté, et le payé par offre ; et les bulles vendues, dépensées, offertes, rendues.",
    inputSchema: SANS_ARGUMENT,
  },
  {
    name: "activite",
    title: "Activité",
    description:
      "Les chiffres clés sur la période (nouveaux comptes, convs, verdicts, rapports, messages au chat, comptes actifs, avec la période d’avant), l’activité jour par jour (imports, verdicts, rapports), les partages, et l’état de la bêta et de la liste d’attente.",
    inputSchema: AVEC_JOURS,
  },
  {
    name: "couts_ia",
    title: "Coûts de l’IA",
    description:
      "Ce qu’a coûté l’IA sur la période et celle d’avant, en dollars : le total, par rapport, par verdict, par poste (avec le nombre d’appels), et la dépense d’aujourd’hui face au budget du jour.",
    inputSchema: AVEC_JOURS,
  },
  {
    name: "sante",
    title: "Santé",
    description:
      "Ce qui coince sur la période : les étapes en échec (par code), les pannes du serveur (par route ou page), les tâches en cours, bloquées, en attente, les paiements refusés, les alertes danger ; et côté navigateurs, la vitesse de chaque écran (p75 des Web Vitals) et les erreurs les plus fréquentes.",
    inputSchema: AVEC_JOURS,
  },
  {
    name: "mails",
    title: "Mails",
    description:
      "Les mails des séquences sur la période (envoyés, boutons touchés, payés dans les 3 jours), l’A/B de la relance J+6, et la délivrabilité des 7 derniers jours (partis, délivrés, rebonds, plaintes, retards, bloqués), par domaine et par sorte de mail.",
    inputSchema: AVEC_JOURS,
  },
  {
    name: "direct",
    title: "En direct",
    description:
      "Qui est sur le site en ce moment : le nombre de personnes en ligne, leur écran, leur source, leur ville, la courbe des 30 dernières minutes, le record du jour, les derniers gestes (arrivées, imports, paiements, achats, partages des dernières 24 h) et le total du jour.",
    inputSchema: SANS_ARGUMENT,
  },
  {
    name: "journal_equipe",
    title: "Journal de l’équipe",
    description:
      "Les derniers gestes de l’équipe (des bulles données, des convs débloquées, des invitations de la liste d’attente, des tournages créés ou arrêtés) : combien, et quand. Ni qui les a reçus, ni leur email.",
    inputSchema: SANS_ARGUMENT,
  },
  {
    name: "definitions",
    title: "Définitions",
    description: "Comment se calcule et se lit chaque chiffre du pilotage (les « ? » de /admin) : ce qu’il mesure, son calcul, ses repères, et quoi regarder s’il bouge.",
    inputSchema: SANS_ARGUMENT,
  },
];

/* ———— Les nombres, lisibles ———— */

/** Des centimes, en euros (deux décimales). */
const euros = (centimes: number) => Math.round(centimes) / 100;
/** Un nombre arrondi, ou null. */
const arrondi = (v: number | null, decimales = 1) => (v === null ? null : Math.round(v * 10 ** decimales) / 10 ** decimales);
/** Une part en %, ou null sans dénominateur. */
const pourcent = (a: number, b: number) => arrondi((rapport(a, b) ?? NaN) * 100);
const chiffre = (c: Chiffre) => ({ valeur: c.valeur, avant: c.avant });
const montant = (m: Montant) => ({ n: m.n, euros: euros(m.centimes) });
const nomDeLaSource = (s: SourceVisite | null) => (s === null ? SOURCE_INCONNUE : NOMS_DES_SOURCES[s]);
const ventes = (v: Ventes) => ({
  payes: montant(v.payes),
  rembourses: montant(v.rembourses),
  contestes: montant(v.contestes),
  parOffre: v.parOffre.map((o) => ({ offre: CATALOGUE[o.offre].titre, ...montant(o) })),
});

/** La période demandée : 1, 7 ou 30 (7 sans rien). */
function periodeDe(args: Record<string, unknown>): Periode {
  const jours = args.jours ?? 7;
  if (!PERIODES.includes(jours as Periode)) throw new ErreurDOutil("« jours » doit valoir 1, 7 ou 30.");
  return jours as Periode;
}

const enTete = (s: StatsAdmin) => ({ jours: s.jours, calculeLe: s.le });

/* ———— Les outils ———— */

function pilotage(s: StatsAdmin) {
  const p = s.pilotage;
  const fuite = fuiteDuTunnel(p.tunnel);
  return {
    ...enTete(s),
    suiviDesVisitesDepuis: p.suiviDepuis,
    aRegarder: aRegarder(s).map(({ ton, titre, texte }) => ({ ton, titre, texte })),
    chiffreDAffaires: {
      netEuros: { valeur: euros(p.net.valeur), avant: euros(p.net.avant) },
      payes: montant(p.payes),
      rembourses: montant(p.rembourses),
      contestes: montant(p.contestes),
    },
    visiteurs: chiffre(p.visiteurs),
    acheteurs: chiffre(p.acheteurs),
    tauxDAchatPct: { valeur: pourcent(p.acheteurs.valeur, p.visiteurs.valeur), avant: pourcent(p.acheteurs.avant, p.visiteurs.avant) },
    revenuParAcheteurEuros: {
      valeur: arrondi(rapport(euros(p.centimesPayes.valeur), p.acheteurs.valeur), 2),
      avant: arrondi(rapport(euros(p.centimesPayes.avant), p.acheteurs.avant), 2),
    },
    ia: {
      dollars: arrondi(p.dollars.valeur, 2),
      avantDollars: arrondi(p.dollars.avant, 2),
      aujourdhuiDollars: arrondi(p.iaDuJour.dollars, 2),
      budgetDuJourDollars: p.iaDuJour.budget,
    },
    margeApresIAPct: { valeur: arrondi(margeApresIA(p.net.valeur, p.dollars.valeur)), avant: arrondi(margeApresIA(p.net.avant, p.dollars.avant)), cible: CIBLE_DE_MARGE },
    tunnel: ETAPES_DU_TUNNEL.map(([cle, nom]) => ({ etape: nom, n: p.tunnel[cle] })),
    plusGrosseFuite: fuite
      ? { de: ETAPES_DU_TUNNEL[fuite.etape - 1]![1], vers: ETAPES_DU_TUNNEL[fuite.etape]![1], passentPct: arrondi(fuite.taux * 100), depuis: fuite.depuis, arrivent: fuite.vers }
      : null,
    quiImporte: quiImporte(p.quiImporte),
    sources: p.sources.map((x) => ({ source: nomDeLaSource(x.source), visiteurs: x.visiteurs, acheteurs: x.acheteurs, payeEuros: euros(x.centimes) })),
    ceQuiSeVend: p.mix.map((m) => ({ groupe: NOMS_DES_GROUPES[m.groupe], achats: m.n, payeEuros: euros(m.centimes) })),
    sante: p.sante,
  };
}

/**
 * Qui importe : les convs importées sur la période et payées depuis, par genre de celui qui importe, puis par paire, avec
 * leur taux d’achat (null sous les 30 convs, comme dans /admin) ; et le genre de l’autre, dont ceux devinés (l’opposé).
 */
function quiImporte({ importees: i, payees: a }: Pilotage["quiImporte"]) {
  const ligne = (nom: string, importees: number, payees: number) => {
    const taux = tauxLisible(payees, importees);
    return { nom, importees, payees, tauxDAchatPct: taux === null ? null : arrondi(taux * 100) };
  };
  return {
    convsImportees: i.convs,
    convsPayees: a.convs,
    celuiQuiImporte: (["elle", "il", "inconnu"] as const).map((g) => ligne(NOMS_DES_GENRES[g], i.moi[g], a.moi[g])),
    lAutre: { garcons: i.autre.il, filles: i.autre.elle, devines: i.autre.devines },
    paires: PAIRES.map((x) => ligne(NOMS_DES_PAIRES[x], i.paires[x], a.paires[x])),
  };
}

function evolution(s: StatsAdmin) {
  const p = s.pilotage;
  return {
    ...enTete(s),
    pas: p.pas,
    cases: p.cases.map((c) => ({ debut: c.le, visiteurs: c.visiteurs, acheteurs: c.acheteurs, payeEuros: euros(c.centimes), iaDollars: arrondi(c.dollars, 2) })),
  };
}

function tunnel(s: StatsAdmin) {
  const p = s.pilotage;
  return {
    ...enTete(s),
    jalonsDepuis: p.jalonsDepuis,
    visiteurs: p.visiteurs.valeur,
    import: JALONS_DE_L_IMPORT.map(([j, nom]) => ({ etape: nom, personnes: p.jalons[j] })),
    /* Le taux de passage au fichier : null sous les 30 personnes qui ouvrent l’écran de l’appli (comme dans /admin) */
    importParAppli: p.jalonsParAppli.map(({ appli, jalons: j }) => {
      const taux = tauxLisible(j.fichier, j.appli);
      return {
        appli: nomDeLAppli(appli),
        ouvrentSonEcran: j.appli,
        choisissentLeurFichier: j.fichier,
        passentAuFichierPct: taux === null ? null : arrondi(taux * 100),
        convBienRecue: j.importee,
        envoisRates: j.envoi_rate,
      };
    }),
    paywall: JALONS_DU_PAYWALL.map(([j, nom]) => ({ etape: nom, personnes: p.jalons[j] })),
    hautsDuPaywall: p.hauts.map((h) => ({ titre: NOM_DU_GENRE[h.genre], vus: h.vus, payes: h.payes })),
    offresUniques: s.offresUniques,
    commandes: s.achats,
    convsImportees: s.parcours,
  };
}

function activite(s: StatsAdmin) {
  const c = s.cles;
  return {
    ...enTete(s),
    chiffresCles: {
      nouveauxComptes: chiffre(c.comptes),
      convs: chiffre(c.convs),
      verdicts: chiffre(c.verdicts),
      rapports: chiffre(c.rapports),
      messagesAuChat: chiffre(c.messages),
      comptesActifs: chiffre(c.actifs),
    },
    jourParJour: s.activite,
    partage: s.partage,
    beta: s.beta,
  };
}

function coutsIA(s: StatsAdmin) {
  const c = s.couts;
  return {
    ...enTete(s),
    totalDollars: arrondi(c.total, 2),
    avantDollars: arrondi(c.avant, 2),
    parRapportDollars: arrondi(c.parRapport, 3),
    parVerdictDollars: arrondi(c.parVerdict, 3),
    postes: c.postes.map((x) => ({ poste: x.nom, dollars: arrondi(x.dollars, 2), appels: x.appels })),
    aujourdhui: { dollars: arrondi(s.pilotage.iaDuJour.dollars, 2), budgetDollars: s.pilotage.iaDuJour.budget },
  };
}

async function sante(s: StatsAdmin) {
  const navigateurs = await santeDesNavigateurs(s.jours);
  return {
    ...enTete(s),
    etapesEnEchec: s.sante.echecs,
    pannes: s.sante.pannes,
    taches: { enCours: s.sante.enCours, bloquees: s.sante.bloquees, enAttente: s.sante.enAttente },
    resume: s.pilotage.sante,
    navigateurs: {
      vitesse: navigateurs.vitesse.map((v) => ({ ...v, ecran: NOMS_DES_ETAPES[v.etape] })),
      erreurs: navigateurs.erreurs.map((e) => ({ ...e, ecran: NOMS_DES_ETAPES[e.etape] })),
      totalErreurs: navigateurs.totalErreurs,
    },
  };
}

async function mails(s: StatsAdmin) {
  return {
    ...enTete(s),
    sequences: s.pilotage.mails.map((m) => ({ mail: NOMS_DES_MAILS[m.cle], envoyes: m.envoyes, clics: m.clics, payesSous3Jours: m.payes })),
    abRelanceJ6: s.pilotage.abDerniere,
    delivrabilite7Jours: await delivrabilite(7),
  };
}

async function enDirect() {
  const d = await direct();
  return {
    calculeLe: d.le,
    enLigne: d.enLigne,
    ecrans: d.etapes.filter((e) => e.n > 0).map((e) => ({ ecran: NOMS_DES_ETAPES[e.etape], n: e.n })),
    sources: d.sources.map((x) => ({ source: nomDeLaSource(x.source), n: x.n })),
    villes: d.villes.map(({ ville, pays, n }) => ({ ville, pays, n })),
    trenteDernieresMinutes: d.minutes,
    recordDuJour: d.record,
    derniersGestes: d.fil.map((g) => {
      const t = texteDuGeste(g);
      return { le: g.le, ville: t.ville, quoi: t.quoi, prix: t.prix };
    }),
    aujourdhui: { visiteurs: d.jour.visiteurs, achats: d.jour.achats, payeEuros: euros(d.jour.centimes) },
  };
}

/** L’outil `nom`, appelé avec ses arguments (déjà vérifiés par son schéma) : sa réponse en JSON. */
async function appeler(nom: string, args: Record<string, unknown>): Promise<ResultatDOutil> {
  const json = (v: unknown) => resultatTexte(JSON.stringify(v));
  switch (nom) {
    case "pilotage":
      return json(pilotage(await statsAdmin(periodeDe(args))));
    case "evolution":
      return json(evolution(await statsAdmin(periodeDe(args))));
    case "tunnel":
      return json(tunnel(await statsAdmin(periodeDe(args))));
    case "ventes": {
      const s = await statsAdmin(7);
      return json({
        calculeLe: s.le,
        aujourdhui: { ventes: ventes(s.ventes.jour), bulles: s.bulles.jour },
        septDerniersJours: { ventes: ventes(s.ventes.semaine), bulles: s.bulles.semaine },
      });
    }
    case "activite":
      return json(activite(await statsAdmin(periodeDe(args))));
    case "couts_ia":
      return json(coutsIA(await statsAdmin(periodeDe(args))));
    case "sante":
      return json(await sante(await statsAdmin(periodeDe(args))));
    case "mails":
      return json(await mails(await statsAdmin(periodeDe(args))));
    case "direct":
      return json(await enDirect());
    case "journal_equipe":
      return json((await actionsRecentes(30)).map((a) => ({ geste: a.action, nombre: a.nombre, le: a.le, depuisLeTerminal: a.depuisLeTerminal })));
    case "definitions":
      return json(Object.values(AIDES_DU_PILOTAGE).map(({ titre, quoi, calcul, repere, siCaBouge }) => ({ titre, quoi, calcul, repere, siCaBouge })));
  }
  throw new ErreurDOutil(`Outil inconnu : ${nom}.`);
}

/** Ce que Claude lit à la connexion : ce qu’est BLUSH, ce que disent ces outils, et comment lire leurs chiffres. */
const CONSIGNES = [
  "BLUSH (askblush.com) lit une conversation (WhatsApp, Instagram…) importée par la personne, lui donne un verdict, puis vend le rapport complet, des bulles pour le chat et des offres uniques.",
  "Ces outils lisent le tableau de bord de l’équipe (/admin), en lecture seule : aucun ne change quoi que ce soit, et aucun ne montre de conv, de message ni d’email.",
  "Commence par `pilotage` ; `definitions` explique chaque chiffre. L’argent est TTC, en euros ; l’IA en dollars. Les jours sont ceux de Paris. Un visiteur, c’est une personne par jour (revenue un autre jour, elle compte une fois de plus).",
  "Chaque chiffre « avant » est celui de la période d’avant, de même durée. La dernière case d’une courbe est en cours.",
].join("\n");

/** Le serveur MCP de BLUSH. */
export const SERVEUR: ServeurMcp = { info: { name: "blush", version: "1.0.0" }, instructions: CONSIGNES, outils: OUTILS, appeler };
