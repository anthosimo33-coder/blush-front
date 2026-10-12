import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CONDITIONS, PARTIES_CONDITIONS } from "@/contenu/conditions";
import { CASE_IMPORT, CASE_RENONCIATION, texteCaseImport } from "@/contenu/consentements";
import { CHAMPS_EDITEUR, EDITEUR, HEBERGEUR, MENTIONS } from "@/contenu/mentions-legales";
import { champsEditeurManquants, consentementImport, editeurComplet, renonciationPaiement } from "@/server/juridique";

/*
 * Le juridique, sans base : l’accord de l’import et la renonciation du paiement (leur version), l’identité de l’éditeur (complète ou non), et ce que les
 * conditions doivent dire (le modèle du lot « prêt à lancer » : Whop vendeur en titre, prix TTC, contenu livré tout de
 * suite et renonciation, bulles sans date de fin, remboursement, 18 ans, ni conseil ni thérapie).
 */

describe("l’accord de l’import", () => {
  it("seule la version d’aujourd’hui de la case vaut accord, avec l’heure où le serveur la reçoit", () => {
    const maintenant = new Date("2026-10-12T10:00:00Z");
    expect(consentementImport(CASE_IMPORT.version, maintenant)).toEqual({ version: CASE_IMPORT.version, le: maintenant });
    for (const autre of [null, undefined, "", "2020-01-01", "on", "true", CASE_IMPORT.version + " ", 1]) expect(consentementImport(autre)).toBeNull();
  });

  it("la renonciation au droit de rétractation : seule la version d’aujourd’hui de la case vaut, avec l’heure (l’achat la garde)", () => {
    const maintenant = new Date("2026-10-12T10:00:00Z");
    expect(renonciationPaiement(CASE_RENONCIATION.version, maintenant)).toEqual({ version: CASE_RENONCIATION.version, le: maintenant });
    for (const autre of [null, undefined, "", true, false, "2020-01-01", CASE_RENONCIATION.version + " ", 1]) expect(renonciationPaiement(autre)).toBeNull();
  });

  it("un texte changé change sa version (le serveur refuse alors une case cochée sous l’ancien texte)", () => {
    /*
     * Ce test fige les textes et leurs versions : si un texte change, changez sa version (une date), puis ici les deux.
     * La case de l’import fait aussi accepter les conditions : leur changement change sa version.
     */
    expect({ version: CASE_IMPORT.version, texte: texteCaseImport() }).toEqual({
      version: "2026-10-12",
      texte: "J’ai 18 ans ou plus. J’accepte les conditions, et que BLUSH analyse cette conv, même ce qu’elle dit d’intime (santé, vie sexuelle).",
    });
    expect({ version: CASE_RENONCIATION.version, textes: CASE_RENONCIATION.textes }).toEqual({
      version: "2026-10-12",
      textes: {
        rapport: "Je veux mon rapport tout de suite et je renonce à mon droit de rétractation",
        bulles: "Je veux mes bulles tout de suite et je renonce à mon droit de rétractation",
      },
    });
    expect(CONDITIONS.maj).toContain("12 octobre 2026");
    /*
     * Les conditions que la case fait accepter : leur empreinte est figée avec la version de la case. Un texte des
     * conditions changé fait échouer ce test : changez CASE_IMPORT.version (une date), puis ici la version et l’empreinte.
     */
    const empreinteDesConditions = createHash("sha256").update(JSON.stringify(PARTIES_CONDITIONS)).digest("hex").slice(0, 16);
    expect({ version: CASE_IMPORT.version, conditions: empreinteDesConditions }).toEqual({ version: "2026-10-12", conditions: "64238bc0c295101e" });
  });

  it("la case de l’import dit les 18 ans, les conditions et l’accord pour ce qui est intime", () => {
    expect(texteCaseImport()).toMatch(/^J’ai 18 ans ou plus\./);
    expect(CASE_IMPORT.lien).toBe("conditions");
    expect(texteCaseImport()).toContain("intime");
  });
});

describe("l’identité de l’éditeur", () => {
  const complet = {
    nom: "Exemple SAS",
    statut: "SAS au capital de 1 000 €",
    adresse: "1 rue de l’Exemple, 75000 Paris",
    immatriculation: "RCS Paris 000 000 000",
    telephone: "01 00 00 00 00",
    directeurPublication: "Camille Exemple",
    mediateur: "Un médiateur, exemple.fr",
    email: "bonjour@askblush.com",
  };

  it("tant qu’un champ est vide (ou fait d’espaces), elle n’est pas complète, et le champ est nommé", () => {
    expect(editeurComplet(complet)).toBe(true);
    expect(champsEditeurManquants(complet)).toEqual([]);
    expect(champsEditeurManquants({ ...complet, telephone: "  ", mediateur: "" })).toEqual(["telephone", "mediateur"]);
    expect(editeurComplet({ ...complet, directeurPublication: "" })).toBe(false);
  });

  it("aujourd’hui, l’identité n’est pas connue : la production ne doit pas s’ouvrir au public (TODO(produit) de src/contenu/mentions-legales.ts)", () => {
    expect(editeurComplet()).toBe(false);
    expect(champsEditeurManquants()).toEqual(["nom", "statut", "adresse", "immatriculation", "telephone", "directeurPublication", "mediateur"]);
    /* L’email est déjà connu ; chaque champ de la page a son libellé */
    expect(EDITEUR.email).toBe("bonjour@askblush.com");
    expect(new Set(CHAMPS_EDITEUR.map((c) => c.cle)).size).toBe(CHAMPS_EDITEUR.length);
  });

  it("l’hébergeur est Vercel ; la page renvoie à la confidentialité et au médiateur", () => {
    expect(HEBERGEUR.nom).toBe("Vercel Inc.");
    expect(HEBERGEUR.adresse).toContain("États-Unis");
    expect(MENTIONS.donnees).toContain("Confidentialité");
    expect(MENTIONS.mediateur).toContain("médiateur de la consommation");
  });
});

describe("les conditions", () => {
  const sections = PARTIES_CONDITIONS.flatMap((p) => p.sections);
  const texte = sections.flatMap((s) => [s.titre, ...s.blocs.flat()]).join("\n");

  it("deux parties (utiliser, acheter), des sections à l’ancre unique, aucune vide", () => {
    expect(PARTIES_CONDITIONS.map((p) => p.titre)).toEqual(["Utiliser BLUSH", "Acheter"]);
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length);
    for (const s of sections) {
      expect(s.blocs.length, s.id).toBeGreaterThan(0);
      for (const b of s.blocs.flat()) expect(b.trim(), s.id).not.toBe("");
    }
  });

  it("disent ce que la spécification du lancement demande", () => {
    for (const attendu of [
      "pas d’abonnement",
      "toutes taxes comprises",
      "Whop, qui vend en son nom (le vendeur en titre)",
      "contenu numérique, livré dès le paiement",
      "tu renonces à ton droit de rétractation",
      "L221-28, 13°",
      CASE_RENONCIATION.textes.rapport,
      "n’ont pas de date de fin",
      "on le répare, ou on te rembourse",
      "le rapport de la conv se referme, et ses bulles sont retirées de ton solde",
      "18 ans ou plus",
      "ni un service de conseil, ni une thérapie",
      "sa santé, sa vie amoureuse, sa sexualité",
      "médiateur de la consommation",
    ])
      expect(texte, attendu).toContain(attendu);
    /* Les prix et le coût des bulles, ceux du lot (src/contenu/offres.ts, réécrit par le socle, les donne au paiement) */
    for (const prix of ["9,90 €", "14,90 €", "4,90 €", "19,90 €", "10 bulles", "90 bulles", "1 bulle", "2 bulles", "3 bulles"]) expect(texte, prix).toContain(prix);
  });

  it("ne présentent jamais BLUSH comme une thérapie ni un accès « à vie », et ne nomment aucune IA", () => {
    expect(texte).not.toMatch(/à vie|pour toujours|à jamais/i);
    for (const nom of ["Anthropic", "Claude", "ElevenLabs", "Mistral", "OpenAI"]) expect(texte, nom).not.toContain(nom);
  });
});
