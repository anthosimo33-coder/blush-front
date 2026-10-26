import type { CaseDuPilotage, Periode, Pilotage, StatsAdmin } from "@/server/stats";
import type { AppKind } from "@/types";
import type { Direct, GesteDuFil } from "@/types/api";
import type { Delivrabilite } from "@/server/delivrabilite";
import type { SanteDesNavigateurs } from "@/server/navigateur";

/*
 * Les chiffres d’exemple du tableau de bord, pour l’aperçu de l’équipe (/apercu/admin, jamais en ligne), la galerie et les
 * tests : inventés, mais cohérents (les totaux sont les sommes des cases, le tunnel suit les visiteurs, les sources et
 * ce qui se vend retombent sur les mêmes totaux). L’heure est figée (le mardi 13 octobre 2026, 16:05 à Paris) : les
 * captures ne bougent pas d’un jour à l’autre.
 */

/** L’heure de l’exemple : 16:05 à Paris (heure d’été). */
const MAINTENANT = Date.UTC(2026, 9, 13, 14, 5);
const iso = (t: number) => new Date(t).toISOString();
/** Minuit à Paris, le jour de MAINTENANT (UTC+2). */
const MINUIT = Date.UTC(2026, 9, 12, 22, 0);

/** Ce que l’aperçu montre : `calme` sans souci de santé, `suivi` faux comme avant que les visites se comptent. */
export type Variante = { calme?: boolean; suivi?: boolean };

/* Les visiteurs d’une heure de Paris (de 0 h à 23 h) : la nuit calme, le soir chargé */
const PAR_HEURE = [12, 6, 3, 2, 2, 3, 6, 12, 20, 24, 26, 28, 32, 30, 28, 30, 34, 40, 48, 56, 62, 58, 44, 26];

/** Les cases de l’exemple : 24 heures pleines, ou des jours de Paris, la dernière en cours. */
function casesDe(jours: Periode, suivi: boolean): CaseDuPilotage[] {
  const n = jours === 1 ? 24 : jours;
  return Array.from({ length: n }, (_, k) => {
    const recule = n - 1 - k;
    const debut = jours === 1 ? Date.UTC(2026, 9, 13, 14) - recule * 3600e3 : MINUIT - recule * 86400e3;
    const enCours = recule === 0;
    let visiteurs: number;
    if (jours === 1) {
      const h = (16 - recule + 24) % 24;
      visiteurs = Math.round((PAR_HEURE[h] ?? 10) * (enCours ? 0.4 : 1));
    } else {
      const jourDeLaSemaine = new Date(debut + 3 * 3600e3).getUTCDay();
      const weekend = jourDeLaSemaine === 0 || jourDeLaSemaine === 6;
      visiteurs = Math.round((480 + k * 9 + (weekend ? 140 + (jourDeLaSemaine === 0 ? 40 : 0) : 0) + ((k * 37) % 23) * 6) * (enCours ? 0.66 : 1));
    }
    const acheteurs = Math.round(visiteurs * (0.024 + ((k * 7) % 5) * 0.001));
    /* Un panier qui varie d’un jour à l’autre, autour de 16,50 € */
    const centimes = acheteurs * (1650 + (((k * 5) % 7) - 3) * 40);
    return { le: iso(debut), visiteurs: suivi ? visiteurs : 0, acheteurs, centimes, dollars: Math.round(centimes * 0.234) / 100 };
  });
}

const somme = <T>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);

/** Le pilotage d’exemple de la période. */
function pilotageDe(jours: Periode, { calme = false, suivi = true }: Variante): Pilotage {
  const cases = casesDe(jours, suivi);
  const visiteurs = somme(cases, (c) => c.visiteurs);
  const acheteurs = somme(cases, (c) => c.acheteurs);
  const paye = somme(cases, (c) => c.centimes);
  const dollars = Math.round(somme(cases, (c) => c.dollars) * 100) / 100;
  const rembourses = { n: jours === 1 ? 1 : jours === 7 ? 3 : 11, centimes: jours === 1 ? 990 : jours === 7 ? 3470 : 12940 };
  const contestes = jours === 30 ? { n: 1, centimes: 1990 } : { n: 0, centimes: 0 };
  const net = paye - rembourses.centimes - contestes.centimes;
  const imports = Math.round((suivi ? visiteurs : acheteurs * 37) * 0.146);
  /* Les sources : une part des visiteurs, un taux d’achat ; TikTok prend le reste, pour retomber sur les totaux */
  const parts: [NonNullable<Pilotage["sources"][number]["source"]>, number, number][] = [
    ["instagram", 0.174, 0.043],
    ["partage", 0.085, 0.054],
    ["snapchat", 0.06, 0.021],
    ["google", 0.025, 0.04],
    ["direct", 0.02, 0.04],
  ];
  const avantLeSuivi = jours === 1 ? 0 : 2;
  const autres = parts.map(([source, part, taux]) => {
    const v = Math.round(visiteurs * part);
    const a = Math.round(v * taux);
    return { source, visiteurs: v, acheteurs: a, centimes: a * 1650 };
  });
  const tiktok = {
    source: "tiktok" as const,
    visiteurs: visiteurs - somme(autres, (s) => s.visiteurs),
    acheteurs: acheteurs - avantLeSuivi - somme(autres, (s) => s.acheteurs),
    centimes: 0,
  };
  tiktok.centimes = paye - avantLeSuivi * 1990 - somme(autres, (s) => s.centimes);
  /* Sans visites comptées, aucun compte n’a de source : tous les acheteurs sont « avant le suivi » */
  const sources = suivi
    ? [tiktok, ...autres, ...(avantLeSuivi ? [{ source: null, visiteurs: 0, acheteurs: avantLeSuivi, centimes: avantLeSuivi * 1990 }] : [])].sort((a, b) => b.centimes - a.centimes)
    : [{ source: null, visiteurs: 0, acheteurs, centimes: paye }];
  /* Ce qui se vend : Premium, le rapport et la suite à leur prix, les bulles prennent le reste */
  const premium = Math.round(acheteurs * 0.52);
  const rapport = Math.round(acheteurs * 0.31);
  const suite = Math.round(acheteurs * 0.17);
  const bulles = paye - premium * 1990 - rapport * 990 - suite * 690;
  /* Les jalons : une part des visiteurs, puis des imports et du paywall ; rien tant que les visites ne se comptent pas */
  const v = (part: number) => (suivi ? Math.round(visiteurs * part) : 0);
  const i = (part: number) => (suivi ? Math.round(imports * part) : 0);
  const paywall = i(0.7);
  const pw = (part: number) => Math.round(paywall * part);
  const payer = pw(0.31);
  const jalons: Pilotage["jalons"] = {
    commencer: v(0.42),
    appli: v(0.33),
    fichier: v(0.19),
    envoi_rate: v(0.024),
    importee: i(1),
    qui: i(0.93),
    email: i(0.84),
    code: i(0.71),
    lecture: i(0.74),
    paywall,
    offres: pw(0.97),
    avis: pw(0.46),
    questions: pw(0.28),
    bas: pw(0.21),
    touche_rapport: pw(0.19),
    touche_premium: pw(0.08),
    payer,
    payer_premium: Math.round(payer * 0.6),
    carte: pw(0.21),
    whop: pw(0.27),
    envoye: pw(0.2),
    paye: pw(0.16),
    refuse: pw(0.02),
    ferme: pw(0.07),
    page_whop: 0,
  };
  /*
   * L’import appli par appli : la part de chaque appli parmi ceux qui en choisissent une, et son passage au fichier.
   * L’iMessage de 24 h reste sous les 30 personnes d’un taux ; rien tant que les visites ne se comptent pas
   */
  const applis: [AppKind, number, number][] = [
    ["whatsapp", 0.52, 0.66],
    ["imessage", 0.05, 0.4],
    ["instagram", 0.27, 0.38],
    ["autre", 0.16, 0.71],
  ];
  const jalonsParAppli = applis
    .map(([appli, part, passe]) => {
      const choisie = Math.round(jalons.appli * part);
      const fichier = Math.round(choisie * passe);
      return { appli, jalons: { appli: choisie, fichier, envoi_rate: Math.round(fichier * 0.12), importee: Math.round(fichier * 0.88) } };
    })
    .filter((l) => l.jalons.appli > 0);
  return {
    pas: jours === 1 ? "heure" : "jour",
    cases,
    net: { valeur: net, avant: Math.round(net * 0.77) },
    payes: { n: premium + rapport + suite + Math.round(bulles / 990), centimes: paye },
    rembourses,
    contestes,
    visiteurs: { valeur: visiteurs, avant: Math.round(visiteurs * 0.77) },
    acheteurs: { valeur: acheteurs, avant: Math.round(acheteurs * 0.8) },
    centimesPayes: { valeur: paye, avant: Math.round(paye * 0.76) },
    dollars: { valeur: dollars, avant: Math.round(dollars * 71) / 100 },
    tunnel: { visiteurs, imports, paywall: Math.round(imports * 0.86), acheteurs, racheteurs: Math.round(acheteurs * 0.145) },
    jalons,
    jalonsDepuis: suivi ? "2026-10-18" : null,
    jalonsParAppli,
    sources,
    mix: [
      { groupe: "premium", n: premium, centimes: premium * 1990 },
      { groupe: "rapport", n: rapport, centimes: rapport * 990 },
      { groupe: "suite", n: suite, centimes: suite * 690 },
      { groupe: "bulles", n: Math.round(bulles / 990), centimes: bulles },
    ],
    /* Le haut du paywall : des vus et des payés inventés, un taux différent par titre */
    hauts: [
      { genre: "tendance", vus: 41, payes: 9 },
      { genre: "toi", vus: 118, payes: 21 },
      { genre: "elle", vus: 64, payes: 7 },
      { genre: "contraste", vus: 152, payes: 31 },
      { genre: "egalite", vus: 57, payes: 6 },
      { genre: "aucun", vus: 12, payes: 1 },
    ],
    ventesDuChat: [
      { genre: "bulles", vues: 214, touchees: 61, refusees: 38, payees: 27, centimes: 32_830 },
      { genre: "premium", vues: 46, touchees: 19, refusees: 9, payees: 11, centimes: 7_590 },
      { genre: "autre", vues: 33, touchees: 14, refusees: 6, payees: 0, centimes: 0 },
      { genre: "a_jour", vues: 21, touchees: 7, refusees: 5, payees: 0, centimes: 0 },
      { genre: "reimport", vues: 2, touchees: 1, refusees: 0, payees: 0, centimes: 0 },
    ],
    abDuChat: [
      { groupe: "avec", comptes: 188, acheteurs: 41, centimes: 61_420 },
      { groupe: "sans", comptes: 179, acheteurs: 29, centimes: 40_150 },
    ],
    mails: [
      { cle: "s3_rapport", envoyes: 124, clics: 98, payes: 4 },
      { cle: "s3_repondre", envoyes: 61, clics: 22, payes: 9 },
      { cle: "s3_vocal", envoyes: 38, clics: 17, payes: 2 },
      { cle: "s3_pas", envoyes: 44, clics: 19, payes: 6 },
      { cle: "s3_parrainage", envoyes: 12, clics: 5, payes: 0 },
      { cle: "s4_prete", envoyes: 27, clics: 15, payes: 11 },
      { cle: "s4_peu", envoyes: 33, clics: 9, payes: 7 },
      { cle: "s4_zero", envoyes: 19, clics: 4, payes: 2 },
      { cle: "s5_endormi", envoyes: 22, clics: 8, payes: 1 },
      { cle: "s5_parfait", envoyes: 9, clics: 3, payes: 0 },
      { cle: "s5_couple", envoyes: 4, clics: 2, payes: 1 },
      { cle: "s6_garde", envoyes: 6, clics: 3, payes: 2 },
      { cle: "s6_avance", envoyes: 3, clics: 1, payes: 1 },
      { cle: "s7_glace", envoyes: 5, clics: 1, payes: 0 },
      { cle: "s8_anniv", envoyes: 2, clics: 2, payes: 0 },
      { cle: "s1_haut", envoyes: 140, clics: 41, payes: 12 },
      { cle: "s1_chapitres", envoyes: 96, clics: 22, payes: 5 },
      { cle: "s1_derniere", envoyes: 38, clics: 14, payes: 6 },
      { cle: "s2_heure", envoyes: 52, clics: 11, payes: 2 },
      { cle: "s2_peur", envoyes: 40, clics: 6, payes: 1 },
      { cle: "s2_question", envoyes: 31, clics: 5, payes: 0 },
    ],
    abDerniere: { avec: { n: 38, payes: 6 }, sans: { n: 41, payes: 3 } },
    iaDuJour: { dollars: 12.4, budget: 30 },
    sante: calme
      ? { echecs: 0, bloquees: 0, paiementsEchoues: 0, alertes: 0, pannes: 0, pannesDuJour: 0 }
      : { echecs: 3, bloquees: 1, paiementsEchoues: 2, alertes: 1, pannes: 2, pannesDuJour: 1 },
    suiviDepuis: suivi ? "2026-09-01" : null,
  };
}

/** Le tableau de bord d’exemple de la période (`?p=`), les anciens chiffres compris (l’écran d’avant, ?version=actuelle). */
export function statsDExemple(jours: Periode, variante: Variante = {}): StatsAdmin {
  const pilotage = pilotageDe(jours, variante);
  const nb = jours === 30 ? 30 : 14;
  const activite = Array.from({ length: nb }, (_, k) => {
    const d = new Date(MINUIT + 3 * 3600e3 - (nb - 1 - k) * 86400e3);
    const vague = Math.round(4 + 3 * Math.sin(k / 2) + k / 2);
    return { jour: d.toISOString().slice(0, 10), imports: vague + 3, verdicts: vague, rapports: Math.max(0, vague - 3) };
  });
  const total = pilotage.dollars.valeur;
  const verdicts = Math.round(pilotage.acheteurs.valeur * 1.1);
  const rapports = Math.round(pilotage.acheteurs.valeur * 0.9);
  return {
    jours,
    le: iso(MAINTENANT),
    cles: {
      comptes: { valeur: 23, avant: 14 },
      convs: { valeur: pilotage.tunnel.imports, avant: Math.round(pilotage.tunnel.imports * 0.7) },
      verdicts: { valeur: verdicts, avant: Math.round(verdicts * 0.7) },
      rapports: { valeur: rapports, avant: Math.round(rapports * 1.1) },
      messages: { valeur: 412, avant: 260 },
      actifs: { valeur: 15, avant: 15 },
    },
    parcours: { importees: pilotage.tunnel.imports, compte: Math.round(pilotage.tunnel.imports * 0.72), verdict: verdicts, rapport: rapports, chat: Math.round(rapports * 0.7) },
    activite,
    partage: { ouvertures: 27, liens: 18, apercus: 52, visites: 38, essais: 11, imports: 6, actifs: 22 },
    couts: {
      total,
      avant: pilotage.dollars.avant,
      parRapport: rapports ? Math.round(((total * 0.38) / rapports) * 100) / 100 : null,
      parVerdict: verdicts ? Math.round(((total * 0.11) / verdicts) * 100) / 100 : null,
      postes: [
        { nom: "Chat", dollars: Math.round(total * 46) / 100, appels: 412 },
        { nom: "Rapport", dollars: Math.round(total * 38) / 100, appels: rapports * 2 },
        { nom: "Verdict", dollars: Math.round(total * 11) / 100, appels: verdicts },
        { nom: "Mémoire (mise à jour)", dollars: Math.round(total * 2) / 100, appels: 14 },
        { nom: "Mémoire (création)", dollars: Math.round(total * 2) / 100, appels: rapports },
        { nom: "Mémoire (en lot)", dollars: Math.round(total * 1) / 100, appels: 11 },
      ],
    },
    sante: variante.calme
      ? { echecs: [], pannes: [], enCours: 2, bloquees: 0, enAttente: 1 }
      : {
          echecs: [
            { code: "refus", n: 2 },
            { code: "panne", n: 1 },
          ],
          pannes: [{ lieu: "POST /api/import", n: 2 }],
          enCours: 2,
          bloquees: 1,
          enAttente: 1,
        },
    beta: { fermee: true, invites: 12, attente: 87, attenteNouveaux: 9, comptes: 31, attenteInvites: 25, mailsPossibles: 14 },
    ventes: {
      jour: {
        payes: { n: 4, centimes: 5460 },
        rembourses: { n: 0, centimes: 0 },
        contestes: { n: 0, centimes: 0 },
        parOffre: [
          { offre: "rapport", n: 2, centimes: 1980 },
          { offre: "premium", n: 1, centimes: 1990 },
          { offre: "pack25", n: 1, centimes: 1490 },
        ],
      },
      semaine: {
        payes: { n: 24, centimes: 31260 },
        rembourses: { n: 1, centimes: 990 },
        contestes: { n: 0, centimes: 0 },
        parOffre: [
          { offre: "rapport", n: 9, centimes: 8910 },
          { offre: "premium", n: 6, centimes: 11940 },
          { offre: "suite", n: 3, centimes: 2070 },
          { offre: "passe_premium", n: 2, centimes: 1380 },
          { offre: "pack10", n: 1, centimes: 690 },
          { offre: "pack25", n: 1, centimes: 1490 },
          { offre: "pack60", n: 1, centimes: 3490 },
          { offre: "pack80", n: 1, centimes: 1390 },
        ],
      },
    },
    bulles: { jour: { vendues: 220, depensees: 96, offertes: 0, rendues: 2 }, semaine: { vendues: 1310, depensees: 704, offertes: 150, rendues: 9 } },
    achats: { commandes: 38, comptes: 31, payees: 23, echouees: 3, enAttente: 12 },
    offresUniques: [
      { offre: "suite", montrees: 118, prises: 15 },
      { offre: "relance_mail", montrees: 96, prises: 7 },
      { offre: "premium_ajout", montrees: 41, prises: 12 },
      { offre: "premiere_recharge", montrees: 0, prises: 0 },
    ],
    actions: [
      { action: "inviter", nombre: 10, le: "2026-10-12T09:12:00.000Z", depuisLeTerminal: false },
      { action: "bulles", nombre: 50, le: "2026-10-11T17:40:00.000Z", depuisLeTerminal: false },
      { action: "debloquer", nombre: 1, le: "2026-10-11T11:03:00.000Z", depuisLeTerminal: true },
    ],
    pilotage,
  };
}

/** L’heure d’un geste du fil d’exemple, `secondes` avant MAINTENANT. */
const avant = (secondes: number) => iso(MAINTENANT - secondes * 1000);

/* Le fil d’exemple : des villes et des gestes inventés, du plus récent au plus ancien */
const FIL: GesteDuFil[] = [
  { genre: "achat", ville: "Lyon", offre: "premium", le: avant(8) },
  { genre: "import", ville: "Paris", le: avant(21) },
  { genre: "paiement", ville: "Bordeaux", offre: "rapport", le: avant(44) },
  { genre: "arrivee", ville: "Bruxelles", source: "tiktok", le: avant(63) },
  { genre: "achat", ville: "Marseille", offre: "pack25", le: avant(95) },
  { genre: "partage", ville: "Lille", le: avant(128) },
  { genre: "achat", ville: "Toulouse", offre: "rapport", le: avant(170) },
  { genre: "arrivee", ville: "Nantes", source: "instagram", le: avant(222) },
  { genre: "import", ville: "Genève", le: avant(260) },
  { genre: "achat", ville: null, offre: "suite", le: avant(341) },
  { genre: "arrivee", ville: "Nice", source: "partage", le: avant(420) },
  { genre: "arrivee", ville: "Lyon", source: "direct", le: avant(515) },
];

/** Le direct d’exemple : 23 personnes en ligne, dont une à Montréal (hors carte), à 16:05. */
export function directDExemple(): Direct {
  const minutes = [14, 15, 13, 16, 18, 17, 19, 21, 20, 22, 19, 18, 20, 23, 24, 22, 21, 23, 25, 24, 22, 21, 23, 24, 26, 25, 23, 22, 24, 23];
  return {
    le: iso(MAINTENANT),
    enLigne: 23,
    etapes: [
      { etape: "accueil", n: 7 },
      { etape: "partage", n: 1 },
      { etape: "import", n: 5 },
      { etape: "verdict", n: 4 },
      { etape: "rapport", n: 1 },
      { etape: "paiement", n: 2 },
      { etape: "chat", n: 3 },
      { etape: "compte", n: 0 },
      { etape: "autre", n: 0 },
    ],
    sources: [
      { source: "tiktok", n: 14 },
      { source: "instagram", n: 5 },
      { source: "partage", n: 3 },
      { source: "direct", n: 1 },
    ],
    villes: [
      { ville: "Paris", pays: "FR", lat: 48.86, lon: 2.35, n: 6 },
      { ville: "Lyon", pays: "FR", lat: 45.76, lon: 4.84, n: 3 },
      { ville: "Marseille", pays: "FR", lat: 43.3, lon: 5.37, n: 2 },
      { ville: "Bordeaux", pays: "FR", lat: 44.84, lon: -0.58, n: 2 },
      { ville: "Lille", pays: "FR", lat: 50.63, lon: 3.06, n: 2 },
      { ville: "Toulouse", pays: "FR", lat: 43.6, lon: 1.44, n: 2 },
      { ville: "Bruxelles", pays: "BE", lat: 50.85, lon: 4.35, n: 2 },
      { ville: "Nantes", pays: "FR", lat: 47.22, lon: -1.55, n: 1 },
      { ville: "Genève", pays: "CH", lat: 46.2, lon: 6.14, n: 1 },
      { ville: "Nice", pays: "FR", lat: 43.7, lon: 7.26, n: 1 },
      { ville: "Montréal", pays: "CA", lat: 45.5, lon: -73.57, n: 1 },
    ],
    minutes: minutes.map((n, k) => ({ le: avant((minutes.length - 1 - k) * 60), n })),
    record: { n: 41, le: iso(Date.UTC(2026, 9, 13, 11, 20)) },
    fil: FIL,
    jour: { visiteurs: 660, achats: 18, centimes: 22140 },
  };
}

/** Les navigateurs d’exemple : des écrans rapides, un lent sur téléphone, et deux erreurs inventées (`calme` : aucune). */
export function navigateursDExemple({ calme = false }: { calme?: boolean } = {}): SanteDesNavigateurs {
  return {
    vitesse: [
      { etape: "accueil", mobile: true, pages: 812, LCP: 1840, INP: 96, CLS: 0.02, TTFB: 310 },
      { etape: "chat", mobile: true, pages: 433, LCP: 2620, INP: 180, CLS: 0.04, TTFB: 420 },
      { etape: "rapport", mobile: true, pages: 201, LCP: 4310, INP: 240, CLS: 0.12, TTFB: 980 },
      { etape: "accueil", mobile: false, pages: 96, LCP: 1210, INP: 48, CLS: 0.01, TTFB: 260 },
    ],
    erreurs: calme
      ? []
      : [
          {
            nom: "TypeError",
            message: "Cannot read properties of undefined (reading 'bulles')",
            source: "/_next/static/chunks/0a1b.js:1:2345",
            etape: "chat",
            famille: "iphone-appli",
            fois: 14,
            derniere: "2026-10-14T09:12:00.000Z",
          },
          { nom: "Rejet", message: "AbortError: The operation was aborted.", source: null, etape: "rapport", famille: "android", fois: 3, derniere: "2026-10-14T08:40:00.000Z" },
        ],
    totalErreurs: calme ? 0 : 17,
  };
}

/**
 * La délivrabilité d’exemple, sur 7 jours : des codes et des rapports bien remis, une relance ② avec une plainte (au-delà
 * des 0,08 % de Resend) et des séquences avec quelques rebonds ; `calme` : aucun rebond ni aucune plainte.
 */
export function delivrabiliteDExemple({ calme = false }: { calme?: boolean } = {}): Delivrabilite {
  const ligne = (sorte: string, partis: number, rebonds: number, plaintes: number, retards = 0, bloques = 0) => ({
    sorte,
    partis,
    delivres: partis - rebonds - bloques,
    rebonds,
    plaintes,
    retards,
    bloques,
  });
  const sortes = [
    ligne("code", 412, calme ? 0 : 6, 0, 2, calme ? 0 : 1),
    ligne("rapport", 96, 0, 0),
    ligne("sequence-s1_haut", 188, calme ? 0 : 3, 0, 1),
    ligne("sequence-s2_heure", 141, calme ? 0 : 5, 0),
    ligne("relance", 64, calme ? 0 : 1, calme ? 0 : 1),
    ligne("attente", 22, 0, 0),
    ligne("alerte", 9, 0, 0),
  ];
  const somme = (lignes: typeof sortes) => {
    const t = { partis: 0, delivres: 0, rebonds: 0, plaintes: 0, retards: 0, bloques: 0 };
    for (const l of lignes) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += l[k];
    return t;
  };
  const relances = sortes.filter((s) => s.sorte === "relance" || s.sorte.startsWith("sequence-"));
  return {
    jours: 7,
    sortes,
    principal: somme(sortes.filter((s) => !relances.includes(s))),
    relances: somme(relances),
    total: somme(sortes),
    domaines: { principal: "askblush.com", relances: "news.askblush.com" },
    branche: true,
    dernier: iso(MAINTENANT - 4 * 60e3),
  };
}
