import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CONDITIONS, PARTIES_CONDITIONS, partiesConditions } from "@/contenu/conditions";
import { CASE_IMPORT, CASE_RENONCIATION, texteCaseImport, texteRenonciation } from "@/contenu/consentements";
import { champsEditeurManquants, droitApplicable, editeurComplet, HEBERGEUR, identiteEditeur, lignesEditeur, MENTIONS, type Editeur } from "@/contenu/mentions-legales";
import { CATALOGUE, COUT_EN_BULLES, prixDe } from "@/contenu/offres";
import { consentementImport, renonciationPaiement } from "@/server/juridique";

/*
 * Le juridique, sans base : l’accord de l’import et la renonciation du paiement (leur version), l’identité de l’éditeur
 * (ce qui suffit pour ouvrir, ce que la page en montre), et ce que les conditions doivent dire (le modèle du lot « prêt
 * à lancer » : Whop vendeur en titre, prix TTC, contenu livré tout de suite et renonciation, bulles sans date de fin,
 * remboursement, ouvert dès 15 ans, ni conseil ni thérapie). Les éditeurs sont fictifs, construits ici : un seul cas lit
 * le vrai (src/contenu/mentions-legales.ts), pour dire que la production peut s’ouvrir.
 */

/** Un éditeur fictif : tous ses champs vides, sauf ceux de `champs`. */
const editeur = (champs: Partial<Editeur> = {}): Editeur => ({
  nom: "",
  statut: "",
  adresse: "",
  pays: "",
  immatriculation: "",
  telephone: "",
  directeurPublication: "",
  mediateur: "",
  email: "",
  droit: "",
  ...champs,
});

/** Une micro-entreprise : son nom, son SIRET et l’email, sans adresse. */
const micro = editeur({ nom: "Exemple", immatriculation: "SIRET\u00a0: 000 000 000 00000", email: "bonjour@exemple.test" });

/** Une société dont tous les champs sont remplis. */
const complet = editeur({
  nom: "Exemple SAS",
  statut: "SAS au capital de 1 000 €",
  adresse: "1 rue de l’Exemple, 75000 Paris",
  pays: "France",
  immatriculation: "RCS Paris 000 000 000",
  telephone: "01 00 00 00 00",
  directeurPublication: "Camille Exemple",
  mediateur: "Un médiateur, exemple.fr",
  email: "bonjour@exemple.test",
  droit: "le droit belge",
});

describe("l’accord de l’import", () => {
  it("seule la version d’aujourd’hui de l’accord vaut, avec l’heure où le serveur la reçoit", () => {
    const maintenant = new Date("2026-10-12T10:00:00Z");
    expect(consentementImport(CASE_IMPORT.version, maintenant)).toEqual({ version: CASE_IMPORT.version, le: maintenant });
    for (const autre of [null, undefined, "", "2020-01-01", "2026-10-12", "on", "true", CASE_IMPORT.version + " ", 1]) expect(consentementImport(autre)).toBeNull();
  });

  it("la renonciation au droit de rétractation : seule la version d’aujourd’hui vaut (« 2026-10-12 », celle de l’ancienne case, non plus), avec l’heure (l’achat la garde)", () => {
    const maintenant = new Date("2026-10-12T10:00:00Z");
    expect(renonciationPaiement(CASE_RENONCIATION.version, maintenant)).toEqual({ version: CASE_RENONCIATION.version, le: maintenant });
    for (const autre of [null, undefined, "", true, false, "2020-01-01", "2026-10-12", CASE_RENONCIATION.version + " ", 1]) expect(renonciationPaiement(autre)).toBeNull();
  });

  it("un texte changé change sa version (le serveur refuse alors un accord donné sous l’ancien texte)", () => {
    /*
     * Ce test fige les textes et leurs versions : si un texte change, changez sa version (une date), puis ici les deux.
     * L’accord de l’import fait aussi accepter les conditions : leur changement change sa version.
     */
    expect({ version: CASE_IMPORT.version, texte: texteCaseImport() }).toEqual({
      version: "2026-10-21.2",
      texte: "En continuant, tu acceptes les conditions et que BLUSH lise toute ta conv.",
    });
    expect({
      version: CASE_RENONCIATION.version,
      rapport: texteRenonciation("rapport"),
      bulles: texteRenonciation("bulles"),
      avance: texteRenonciation("avance"),
      lien: CASE_RENONCIATION.ancre,
    }).toEqual({
      version: "2026-10-13.2",
      rapport: "En payant, tu as ton rapport tout de suite et tu renonces au délai de rétractation.",
      bulles: "En payant, tu as tes bulles tout de suite et tu renonces au délai de rétractation.",
      avance: "En débloquant, tu as ton rapport tout de suite et tu renonces au délai de rétractation.",
      lien: "/conditions#livraison",
    });
    expect(CONDITIONS.maj).toContain("21 octobre 2026");
    /*
     * Les conditions que l’accord fait accepter (celles de l’éditeur d’aujourd’hui : son médiateur et sa loi applicable
     * en font partie) : leur empreinte est figée avec la version de l’accord. Un texte des conditions changé fait échouer
     * ce test : changez CASE_IMPORT.version (une date), puis ici la version et l’empreinte.
     */
    const empreinteDesConditions = createHash("sha256").update(JSON.stringify(PARTIES_CONDITIONS)).digest("hex").slice(0, 16);
    expect({ version: CASE_IMPORT.version, conditions: empreinteDesConditions }).toEqual({ version: "2026-10-21.2", conditions: "3ba8f7cf27c1a949" });
  });

  it("l’accord de l’import dit les conditions et toute la conv, sans case, sans âge, sans détailler l’intime", () => {
    expect(texteCaseImport()).toMatch(/^En continuant, tu acceptes les conditions/);
    expect(CASE_IMPORT.lien).toBe("conditions");
    expect(texteCaseImport()).not.toMatch(/ans|santé|sexuel|coche/i);
  });
});

describe("l’identité de l’éditeur", () => {
  it("trois choses suffisent pour ouvrir au public : le nom, l’email, et l’adresse ou l’immatriculation", () => {
    expect(editeurComplet(complet)).toBe(true);
    /* Une micro-entreprise, sans adresse : son SIRET suffit */
    expect(champsEditeurManquants(micro)).toEqual([]);
    expect(editeurComplet(micro)).toBe(true);
    /* Une adresse, sans immatriculation, aussi */
    expect(editeurComplet(editeur({ nom: "Exemple", adresse: "1 rue de l’Exemple", email: "bonjour@exemple.test" }))).toBe(true);
    /* Le nom et l’email seuls : pas assez */
    expect(champsEditeurManquants(editeur({ nom: "Exemple", email: "bonjour@exemple.test" }))).toEqual(["adresse ou immatriculation"]);
    expect(editeurComplet(editeur({ nom: "Exemple", email: "bonjour@exemple.test" }))).toBe(false);
    /* Un champ fait d’espaces est vide ; tout ce qui manque est nommé, dans l’ordre de la page */
    expect(champsEditeurManquants(editeur({ nom: "  ", adresse: " ", email: "" }))).toEqual(["nom", "adresse ou immatriculation", "email"]);
    expect(champsEditeurManquants({ ...micro, nom: "" })).toEqual(["nom"]);
    expect(champsEditeurManquants({ ...micro, email: " " })).toEqual(["email"]);
    /* Les champs facultatifs ne comptent pas */
    expect(champsEditeurManquants({ ...complet, statut: "", pays: "", telephone: "", directeurPublication: "", mediateur: "", droit: "" })).toEqual([]);
  });

  it("la vraie configuration (src/contenu/mentions-legales.ts) est complète : la production peut s’ouvrir au public", () => {
    expect(champsEditeurManquants()).toEqual([]);
    expect(editeurComplet()).toBe(true);
  });

  it("la page n’a que les lignes des champs remplis ; un champ exigé vide se lit « À compléter »", () => {
    expect(lignesEditeur(micro)).toEqual([
      { libelle: "Éditeur", valeur: "Exemple" },
      { libelle: "Immatriculation", valeur: "SIRET\u00a0: 000 000 000 00000" },
      { libelle: "Email", valeur: "bonjour@exemple.test", lien: "mailto" },
    ]);
    /* Tout rempli : chaque ligne, dans l’ordre de la page, l’adresse suivie du pays */
    expect(lignesEditeur(complet)).toEqual([
      { libelle: "Éditeur", valeur: "Exemple SAS" },
      { libelle: "Forme juridique", valeur: "SAS au capital de 1 000 €" },
      { libelle: "Siège", valeur: "1 rue de l’Exemple, 75000 Paris, France" },
      { libelle: "Immatriculation", valeur: "RCS Paris 000 000 000" },
      { libelle: "Téléphone", valeur: "01 00 00 00 00" },
      { libelle: "Email", valeur: "bonjour@exemple.test", lien: "mailto" },
      { libelle: "Directeur de la publication", valeur: "Camille Exemple" },
    ]);
    /* Sans adresse, le pays seul a sa ligne */
    expect(lignesEditeur({ ...micro, pays: "France" }).map((l) => [l.libelle, l.valeur])).toContainEqual(["Pays", "France"]);
    /* Rien de rempli : le nom, l’adresse (ou l’immatriculation) et l’email sont à compléter, rien d’autre n’apparaît */
    expect(lignesEditeur(editeur())).toEqual([
      { libelle: "Éditeur", valeur: null },
      { libelle: "Siège", valeur: null },
      { libelle: "Email", valeur: null, lien: "mailto" },
    ]);
  });

  it("en une ligne, au pied des conditions : ce qui en est rempli", () => {
    expect(identiteEditeur(micro)).toBe("Exemple · SIRET\u00a0: 000 000 000 00000 · bonjour@exemple.test");
    expect(identiteEditeur(complet)).toBe("Exemple SAS · SAS au capital de 1 000 € · 1 rue de l’Exemple, 75000 Paris, France · RCS Paris 000 000 000 · bonjour@exemple.test");
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
  const texteDe = (parties: typeof PARTIES_CONDITIONS) =>
    parties
      .flatMap((p) => p.sections)
      .flatMap((s) => [s.titre, ...s.blocs.flat()])
      .join("\n");
  const texte = texteDe(PARTIES_CONDITIONS);

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
      texteRenonciation("rapport"),
      "en payant, tu l’acceptes",
      "n’ont pas de date de fin",
      "on le répare, ou on te rembourse",
      "le rapport de la conv se referme, et ses bulles sont retirées de ton solde",
      "BLUSH est ouvert dès 15 ans. Plus jeune, il te faut l’accord d’un parent.",
      "ni un service de conseil, ni une thérapie",
      "sa santé, sa vie amoureuse, sa sexualité",
    ])
      expect(texte, attendu).toContain(attendu);
    /* Plus de case à cocher, ni à l’import ni au paiement, ni de réserve aux 18 ans */
    expect(texte).not.toMatch(/18 ans|coche/);
  });

  it("le désaccord suit l’éditeur : le médiateur s’il en a un, sa loi applicable (le droit français par défaut), sans priver des protections du pays de résidence", () => {
    const desaccord = (e: Editeur) => texteDe(partiesConditions(e));
    const protections = "sans te priver des protections impératives de ton pays de résidence";
    expect(desaccord(complet)).toContain("tu peux saisir gratuitement le médiateur de la consommation présenté dans les mentions légales");
    expect(desaccord(complet)).toContain(`Ces conditions suivent le droit belge, ${protections}.`);
    expect(desaccord(micro)).not.toContain("médiateur");
    expect(desaccord(micro)).toContain("Écris-nous à bonjour@askblush.com\u00a0: on cherchera une solution ensemble.");
    expect(desaccord(micro)).toContain(`Ces conditions suivent le droit français, ${protections}.`);
    expect(droitApplicable(editeur({ droit: "  " }))).toBe("le droit français");
    /* Celles de la page : l’éditeur d’aujourd’hui */
    expect(texte).toContain(protections);
  });

  it("disent les prix, les bulles et le coût d’une réponse du catalogue (src/contenu/offres.ts), ceux que le serveur fait payer", () => {
    /*
     * Lus dans le catalogue, jamais recopiés ici : un prix ou un nombre de bulles qui change fait échouer ce test tant que
     * les conditions (et la version de l’accord de l’import qui les cite, plus haut) ne le disent pas
     */
    const n = (b: number) => `${b} bulle${b > 1 ? "s" : ""}`;
    const { rapport, premium, pack30, pack80, pack200 } = CATALOGUE;
    for (const attendu of [
      `Le rapport d’une conv, ${prixDe("rapport")}\u00a0: tous ses chapitres, et ${n(rapport.bulles)}.`,
      `Premium, ${prixDe("premium")}\u00a0: le rapport de cette conv, et ${n(premium.bulles)}.`,
      `Une recharge de bulles\u00a0: ${n(pack30.bulles)} pour ${prixDe("pack30")}, ${pack80.bulles} pour ${prixDe("pack80")}, ${pack200.bulles} pour ${prixDe("pack200")}.`,
      `Une réponse écrite\u00a0: ${n(COUT_EN_BULLES.reponse)}.`,
      `Une réponse en vocal\u00a0: ${n(COUT_EN_BULLES.vocal)}.`,
      `Une réponse à un message avec des captures ou un export\u00a0: ${n(COUT_EN_BULLES.ajout)}.`,
    ])
      expect(texte, attendu).toContain(attendu);
  });

  it("ne présentent jamais BLUSH comme une thérapie ni un accès « à vie », et ne nomment aucune IA", () => {
    expect(texte).not.toMatch(/à vie|pour toujours|à jamais/i);
    for (const nom of ["Anthropic", "Claude", "ElevenLabs", "Mistral", "OpenAI"]) expect(texte, nom).not.toContain(nom);
  });
});
