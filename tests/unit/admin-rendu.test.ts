import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PageEnDirect } from "@/app/admin/PageEnDirect";
import { Pilotage } from "@/app/admin/Pilotage";
import { directDExemple, statsDExemple } from "@/app/apercu/admin/exemple";
import { AIDES_DU_PILOTAGE } from "@/contenu/aide-pilotage";
import type { Periode } from "@/server/stats";

/*
 * Le pilotage et le direct d’/admin, rendus comme par le serveur (le premier rendu, avant que la sonde ne relise le
 * direct), sur les chiffres de l’aperçu : chaque carte est là, avec son « ? », et aucun chiffre ne s’écrit NaN,
 * Infinity ou undefined, quelle que soit la période, même sans visites comptées, même sans rien du tout. Les écrans
 * qui se relisent et les « ? » qui s’ouvrent sont suivis par les tests de bout en bout (tests/e2e/public-admin-*.spec.ts).
 */

/* Les gestes de l’équipe (les outils) demandent le routeur de Next : sans lui, un faux qui ne fait rien */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }) }));

/** Le texte d’une page rendue : ses balises retirées, ses entités lues, ses espaces resserrées (les insécables restent). */
const texte = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t\n\r]+/g, " ");

const SALE = /NaN|Infinity|undefined|\[object/;

describe("le pilotage, rendu", () => {
  it.each<Periode>([1, 7, 30])("sur %i jour(s) : ses cartes, ses « ? », ses liens, et rien d’illisible", (jours) => {
    const html = renderToStaticMarkup(createElement(Pilotage, { s: statsDExemple(jours), direct: directDExemple(), base: "/apercu/admin", sonder: false }));
    const t = texte(html);
    expect(t).not.toMatch(SALE);
    for (const titre of ["Pilotage", "À regarder", "Chiffre d’affaires", "En direct", "Visiteurs", "Taux d’achat", "Revenu par acheteur", "Marge produit", "Le tunnel"])
      expect(t, titre).toContain(titre);
    /* La marge produit dit ce que coûtent les tests, à part ; la carte de l’IA les sépare, population par population */
    expect(t).toMatch(/cible 80\u00a0% · tests\u00a0: [\d,]+\u00a0\$ à part · non classé\u00a0: [\d,]+\u00a0\$ \(au pire \d+\u00a0%\)/);
    for (const titre of ["IA du produit", "IA des tests", "Les clients et les prospects", "L’équipe et le tournage", "Les postes du produit"]) expect(t, titre).toContain(titre);
    for (const population of ["Clients", "Prospects", "Invités (offert)", "L’équipe", "Le tournage", "Non classé"]) expect(t, population).toContain(population);
    expect(html).toContain('aria-label="L’IA par population"');
    expect(html).toContain('aria-label="Les ratios du produit"');
    /* Le détail du tunnel : l’import et le paywall, jalon par jalon, leur plus grosse perte, et ce qu’il y a autour */
    for (const titre of ["L’import, écran par écran", "Le paywall, jusqu’au paiement", "Choisissent leur fichier", "Voient le formulaire de Whop", "Premium au bouton"])
      expect(t, titre).toContain(titre);
    expect(t).toMatch(/La plus grosse perte\u00a0: \d+\u00a0% entre «\u00a0[^»]+\u00a0» et «\u00a0[^»]+\u00a0»\./);
    expect(t).toMatch(/\d+\u00a0envois ratés/);
    /* Sous « Choisissent leur fichier », appli par appli : ses deux nombres et son taux, « — » sous les 30 personnes */
    expect(html).toContain('aria-label="De l’appli au fichier, appli par appli"');
    for (const appli of ["WhatsApp", "Instagram", "Captures ou vidéo"]) expect(t).toMatch(new RegExp(`${appli} [\\d\u202f]+ → [\\d\u202f]+ \\d+\u00a0%`));
    if (jours === 1) {
      expect(t).toMatch(/iMessage \d+ → \d+ — Instagram/);
      expect(t).toContain("«\u00a0—\u00a0»\u00a0: moins de 30\u00a0personnes, trop peu pour un taux.");
    }
    /* Qui importe : celui qui importe, puis la paire, chaque ligne avec sa part, et l’autre, dont ceux devinés */
    for (const titre of ["Qui importe", "Des filles", "Des garçons", "Pas encore dit", "Et sur qui", "Une fille sur un garçon", "Deux garçons"]) expect(t, titre).toContain(titre);
    expect(t).toMatch(/L’autre\u00a0: [\d\u202f]+\u00a0garçons, [\d\u202f]+\u00a0filles, dont [\d\u202f]+\u00a0devinés/);
    if (jours === 1) expect(t).toContain("«\u00a0—\u00a0»\u00a0: moins de 30\u00a0convs, trop peu pour un taux.");
    for (const titre of ["D’où ils viennent", "Ce qui se vend", "Les coups de pouce", "Ce que coûte l’IA", "Santé", "Outils", "Bêta", "Les derniers gestes"])
      expect(t, titre).toContain(titre);
    expect(t).toContain("Que des nombres\u00a0: aucune conv, aucun message, aucun email ne sort d’ici.");
    /* Un « ? » par carte et par chiffre clé, chacun nommé */
    for (const cle of [
      "ca",
      "live",
      "visiteurs",
      "conversion",
      "panier",
      "marge",
      "tunnel",
      "import",
      "paywall",
      "quiImporte",
      "sources",
      "mix",
      "coups",
      "couts",
      "sante",
    ] as const)
      expect(html, cle).toContain(`aria-label="Comment lire ${AIDES_DU_PILOTAGE[cle].de}"`);
    /* La période en liens, celle-ci marquée */
    const marques = html.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(marques.map((a) => a.match(/href="([^"]+)"/)?.[1])).toEqual(["/apercu/admin", `/apercu/admin?p=${jours}`]);
    expect(html).toContain('href="/apercu/admin/direct"');
    expect(html).toContain('id="outils"');
    /* Les graphiques se décrivent */
    expect(html).toMatch(/role="img" aria-label="Le payé par (heure|jour), sur/);
    expect(html).toMatch(/role="img" aria-label="Ce qui se vend\u00a0: Premium \d+\u00a0%/);
  });

  it("la santé : les pannes du serveur de la période, leurs routes et leurs pages, et celles du jour", () => {
    const t = texte(renderToStaticMarkup(createElement(Pilotage, { s: statsDExemple(7), direct: null, base: "/apercu/admin", sonder: false })));
    expect(t).toContain("Pannes du serveur 2");
    expect(t).toContain("POST /api/import · 2");
    expect(t).toContain("Aujourd’hui\u00a0: 1\u00a0panne du serveur.");
    const calme = texte(renderToStaticMarkup(createElement(Pilotage, { s: statsDExemple(7, { calme: true }), direct: null, base: "/apercu/admin", sonder: false })));
    expect(calme).toContain("Aujourd’hui\u00a0: 0\u00a0panne du serveur.");
  });

  it("sans visites comptées : « — » à la place de ce qui en dépend, et la carte qui le dit", () => {
    const t = texte(renderToStaticMarkup(createElement(Pilotage, { s: statsDExemple(7, { suivi: false, calme: true }), direct: null, base: "/apercu/admin", sonder: false })));
    expect(t).not.toMatch(SALE);
    expect(t).toContain("Les visiteurs se comptent depuis la mise en ligne de ce tableau de bord");
    expect(t).toContain("pas encore comptés");
    expect(t).toContain("Avant le suivi");
    /* Les jalons pas encore comptés : les deux blocs le disent */
    expect(t.match(/Les jalons se comptent depuis cette version/g)).toHaveLength(2);
    /* Le direct pas encore lu : des points de suspension, pas une erreur */
    expect(t).toContain("Lecture du direct…");
    expect(t).toContain("Tout tourne");
  });

  it("rien du tout (une base neuve) : des zéros et des « — », jamais une division par zéro", () => {
    const s = statsDExemple(1, { calme: true });
    const zero = { valeur: 0, avant: 0 };
    const rien = { n: 0, centimes: 0 };
    const personne = {
      convs: 0,
      moi: { elle: 0, il: 0, inconnu: 0 },
      autre: { elle: 0, il: 0, devines: 0 },
      paires: { fille_garcon: 0, garcon_fille: 0, deux_filles: 0, deux_garcons: 0 },
    };
    s.pilotage = {
      ...s.pilotage,
      cases: s.pilotage.cases.map((c) => ({ ...c, visiteurs: 0, acheteurs: 0, centimes: 0, dollars: 0, dollarsProduit: 0 })),
      net: zero,
      payes: rien,
      rembourses: rien,
      contestes: rien,
      achatsRetires: rien,
      visiteurs: zero,
      acheteurs: zero,
      centimesPayes: zero,
      dollars: zero,
      tunnel: { visiteurs: 0, imports: 0, paywall: 0, acheteurs: 0, racheteurs: 0 },
      sources: [],
      quiImporte: { importees: personne, payees: personne },
      mix: s.pilotage.mix.map((m) => ({ ...m, n: 0, centimes: 0 })),
      iaDuJour: { dollars: 0, budget: 30, sansCompte: { dollars: 0, budget: 50 } },
      suiviDepuis: null,
    };
    s.couts = {
      total: 0,
      avant: 0,
      produit: zero,
      tests: zero,
      populations: s.couts.populations.map((p) => ({ ...p, dollars: 0, appels: 0 })),
      parRapport: null,
      parVerdict: null,
      postes: [],
    };
    s.offresUniques = s.offresUniques.map((o) => ({ ...o, montrees: 0, prises: 0 }));
    const vide = { ...directDExemple(), enLigne: 0, etapes: [], sources: [], villes: [], fil: [], record: null };
    const t = texte(renderToStaticMarkup(createElement(Pilotage, { s, direct: vide, base: "/admin", sonder: false })));
    expect(t).not.toMatch(SALE);
    expect(t).toContain("Ni visite ni vente sur la période.");
    expect(t).toContain("Aucune conv importée sur la période.");
    expect(t).toContain("Aucun appel au modèle sur la période.");
    expect(t).toContain("Pas encore de fuite à comparer");
    expect(t).toContain("Personne sur le site en ce moment.");
    expect(t).toContain("0 personne en ligne");
  });

  it("les cases vides : le graphique le dit", () => {
    const s = statsDExemple(7);
    s.pilotage = { ...s.pilotage, cases: [] };
    expect(texte(renderToStaticMarkup(createElement(Pilotage, { s, direct: directDExemple(), sonder: false })))).toContain("Rien à montrer case par case pour l’instant.");
  });
});

describe("le direct, rendu", () => {
  it("le bandeau, la carte, les écrans, les canaux et le fil, sans rien d’illisible", () => {
    const html = renderToStaticMarkup(createElement(PageEnDirect, { d: directDExemple(), base: "/apercu/admin", sonder: false }));
    const t = texte(html);
    expect(t).not.toMatch(SALE);
    for (const titre of [
      "En ligne maintenant",
      "Record du jour\u00a0: 41, à 13:20",
      "Les 30 dernières minutes",
      "Où ils sont",
      "Où ils en sont",
      "D’où ils arrivent",
      "Ce qui se passe",
    ])
      expect(t, titre).toContain(titre);
    expect(t).toContain("Hors carte\u00a0: Montréal 1");
    expect(t).toContain("Lyon · a pris Premium");
    expect(t).toContain("Ville inconnue · a pris Le rapport, offre unique");
    expect(t).toContain("il y a 8\u00a0s");
    expect(html).toMatch(/aria-label="Carte des personnes en ligne\u00a0: Paris 6, Lyon 3/);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('href="/apercu/admin#outils"');
    expect(t).toContain("L’adresse IP n’est jamais gardée");
  });

  it("personne en ligne, ni record, ni geste : la page le dit", () => {
    const d = { ...directDExemple(), enLigne: 0, etapes: [], sources: [], villes: [], fil: [], minutes: [], record: null };
    const t = texte(renderToStaticMarkup(createElement(PageEnDirect, { d, sonder: false })));
    expect(t).not.toMatch(SALE);
    expect(t).toContain("Pas encore de record aujourd’hui");
    expect(t).toContain("Rien dans les dernières 24\u00a0h.");
    expect(t).toContain("Personne sur le site en ce moment.");
  });
});
