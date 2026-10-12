/*
 * Les mentions légales (la page /mentions-legales) : qui édite BLUSH, qui l’héberge, à qui écrire. La loi (LCEN,
 * article 6) demande l’identité de l’éditeur, son adresse, son téléphone, son immatriculation, le directeur de la
 * publication et l’hébergeur ; le Code de la consommation (L612-1), un médiateur de la consommation.
 * TODO(produit): à relire par un juriste.
 * TODO(produit): l’identité de l’éditeur n’est pas encore connue : chaque champ vide de EDITEUR est à remplir. Tant
 * qu’il en reste un, editeurComplet (src/server/juridique.ts) répond non, et la production refuse de démarrer ouverte
 * au public (BLUSH_BETA_FERMEE=0 : refusEnProduction, src/server/env.ts, nomme les champs vides) ; fermée, elle tourne.
 */

/** Ce que la page dit de l’éditeur : chaque champ est un texte, vide tant qu’il n’est pas connu. */
type Editeur = {
  /** La dénomination de la société (ou, pour une entreprise individuelle, le prénom et le nom). */
  nom: string;
  /** La forme juridique et le capital (« SAS au capital de 1 000 € »), ou « Entrepreneur individuel ». */
  statut: string;
  /** L’adresse du siège (ou du domicile, pour une entreprise individuelle). */
  adresse: string;
  /** L’immatriculation : le numéro RCS et sa ville, ou le SIREN. */
  immatriculation: string;
  /** Un numéro de téléphone où joindre l’éditeur (la LCEN le demande). */
  telephone: string;
  /** La personne responsable de ce qui est publié (le plus souvent, le dirigeant). */
  directeurPublication: string;
  /** Le médiateur de la consommation auquel l’éditeur adhère : son nom, et son site. */
  mediateur: string;
  /** L’adresse où nous écrire. */
  email: string;
};

/** L’éditeur de BLUSH. TODO(produit): à remplir (voir l’en-tête du fichier). */
export const EDITEUR: Editeur = {
  nom: "",
  statut: "",
  adresse: "",
  immatriculation: "",
  telephone: "",
  directeurPublication: "",
  mediateur: "",
  email: "bonjour@askblush.com",
};

/** Les champs de l’éditeur, dans l’ordre de la page, avec leur libellé. */
export const CHAMPS_EDITEUR: readonly { cle: keyof Editeur; libelle: string }[] = [
  { cle: "nom", libelle: "Éditeur" },
  { cle: "statut", libelle: "Forme juridique" },
  { cle: "adresse", libelle: "Siège" },
  { cle: "immatriculation", libelle: "Immatriculation" },
  { cle: "telephone", libelle: "Téléphone" },
  { cle: "email", libelle: "Email" },
  { cle: "directeurPublication", libelle: "Directeur de la publication" },
];

/** Ce que la page montre d’un champ encore vide (la production refuse de s’ouvrir au public tant qu’il en reste un). */
export const A_COMPLETER = "À compléter";

/**
 * L’hébergeur du site (Vercel, à Francfort pour BLUSH : la page Confidentialité). L’adresse est celle que Vercel donne
 * dans ses conditions.
 * TODO(produit): vérifier l’adresse, et ajouter le téléphone de l’hébergeur que la LCEN demande.
 */
export const HEBERGEUR = {
  nom: "Vercel Inc.",
  adresse: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
  site: "vercel.com",
} as const;

/** Les textes de la page, autour des champs. */
export const MENTIONS = {
  titre: "Mentions légales",
  sous: "Qui édite BLUSH, qui l’héberge, et où nous écrire.",
  donnees: "Ce que BLUSH fait de ta conv et de ton email, et chez qui ils vivent, est sur la page Confidentialité.",
  mediateur: "Un désaccord sur un achat\u00a0? Écris-nous d’abord. Si on ne trouve pas de solution, tu peux saisir gratuitement le médiateur de la consommation",
  marque: "Le nom BLUSH, son logo, le site et ses textes appartiennent à l’éditeur. Les reprendre demande notre accord.",
  maj: "Dernière mise à jour\u00a0: 12 octobre 2026.",
} as const;
