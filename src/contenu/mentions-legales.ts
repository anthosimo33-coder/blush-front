/*
 * Les mentions légales (la page /mentions-legales) : qui édite BLUSH, qui l’héberge, à qui écrire. La loi (LCEN,
 * article 6) demande l’identité de l’éditeur, de quoi le joindre, son immatriculation, le directeur de la publication et
 * l’hébergeur ; le Code de la consommation (L612-1), un médiateur de la consommation.
 * TODO(produit): à relire par un juriste, dont les champs laissés vides : pour une micro-entreprise, la LCEN demande
 * aussi le nom et le prénom de l’entrepreneur et une adresse (une domiciliation suffit) ; le médiateur (L612-1, L616-1)
 * et le directeur de la publication.
 * Pour ouvrir au public, trois choses suffisent (champsEditeurManquants) : le nom, l’email, et l’adresse ou
 * l’immatriculation. Tant qu’il en manque une, la production reste en bêta fermée, même écrite BLUSH_BETA_FERMEE=0
 * (manquesPourOuvrir, src/server/drapeaux.ts), et l’équipe en est prévenue. Les autres champs sont facultatifs : vides,
 * ils n’apparaissent pas sur la page.
 * Le médiateur et la loi applicable (`droit`) se lisent aussi dans les conditions (src/contenu/conditions.ts) : les
 * changer change leur texte, donc la version de la case de l’import (tests/unit/juridique.test.ts le rappelle).
 */

/** Ce que les pages disent de l’éditeur : chaque champ est un texte, vide tant qu’il n’est pas connu (ou pas affiché). */
export type Editeur = {
  /** Exigé : la dénomination de la société, le nom de l’entreprise individuelle, ou le prénom et le nom de l’entrepreneur. */
  nom: string;
  /** La forme juridique et le capital (« SAS au capital de 1 000 € »), ou « Entrepreneur individuel ». */
  statut: string;
  /** L’adresse du siège (ou du domicile, pour une entreprise individuelle). Exigée sans immatriculation. */
  adresse: string;
  /** Le pays, écrit après l’adresse (« France »). */
  pays: string;
  /**
   * L’immatriculation, en texte libre avec son nom, des insécables avant les deux-points et entre les chiffres (pour
   * qu’elle ne se coupe pas) : « SIRET : 123 456 789 00012 », « RCS Paris 123 456 789 ». Exigée sans adresse.
   */
  immatriculation: string;
  /** Un numéro de téléphone où joindre l’éditeur. */
  telephone: string;
  /** La personne responsable de ce qui est publié (le plus souvent, le dirigeant). */
  directeurPublication: string;
  /** Le médiateur de la consommation auquel l’éditeur adhère : son nom, et son site. Les conditions le citent alors. */
  mediateur: string;
  /** Exigé : l’adresse où nous écrire. */
  email: string;
  /** La loi qui régit les conditions, comme elles la disent (« le droit français », « le droit belge ») : vide, le droit français. */
  droit: string;
};

/** L’éditeur de BLUSH (voir l’en-tête du fichier). */
export const EDITEUR: Editeur = {
  nom: "BLITZSCALE",
  statut: "",
  adresse: "",
  pays: "",
  immatriculation: "SIRET\u00a0: 901\u00a0129\u00a0168\u00a000013",
  telephone: "",
  directeurPublication: "",
  mediateur: "",
  email: "bonjour@askblush.com",
  droit: "",
};

/** Le champ est-il rempli (pas vide, pas fait que d’espaces) ? */
const rempli = (texte: string) => texte.trim() !== "";

/**
 * Ce qui manque à l’identité de l’éditeur pour ouvrir au public, dans l’ordre de la page : le nom, l’adresse ou
 * l’immatriculation (l’une des deux suffit), l’email. Sans server-only : src/server/drapeaux.ts (le proxy) le lit aussi.
 */
export function champsEditeurManquants(editeur: Editeur = EDITEUR): string[] {
  const manquants: string[] = [];
  if (!rempli(editeur.nom)) manquants.push("nom");
  if (!rempli(editeur.adresse) && !rempli(editeur.immatriculation)) manquants.push("adresse ou immatriculation");
  if (!rempli(editeur.email)) manquants.push("email");
  return manquants;
}

/** L’identité de l’éditeur suffit-elle pour ouvrir au public (champsEditeurManquants n’a rien à dire) ? */
export const editeurComplet = (editeur: Editeur = EDITEUR) => champsEditeurManquants(editeur).length === 0;

/** L’adresse suivie du pays, ce qu’il y en a. */
const lieu = (editeur: Editeur) =>
  [editeur.adresse, editeur.pays]
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ");

/** Une ligne de l’éditeur sur la page : son libellé, et son texte (null : un champ exigé encore vide, « À compléter »). */
type LigneEditeur = { libelle: string; valeur: string | null; lien?: "mailto" };

/**
 * Les lignes de l’éditeur sur /mentions-legales, dans l’ordre de la page. Un champ facultatif vide n’a pas de ligne ;
 * un champ exigé vide se lit « À compléter » (jamais en production ouverte : elle reste fermée). L’adresse porte le
 * pays ; sans adresse mais avec l’immatriculation, le pays seul a sa ligne.
 */
export function lignesEditeur(editeur: Editeur = EDITEUR): LigneEditeur[] {
  const lignes: LigneEditeur[] = [{ libelle: "Éditeur", valeur: editeur.nom.trim() || null }];
  if (rempli(editeur.statut)) lignes.push({ libelle: "Forme juridique", valeur: editeur.statut.trim() });
  if (rempli(editeur.adresse) || !rempli(editeur.immatriculation)) lignes.push({ libelle: "Siège", valeur: rempli(editeur.adresse) ? lieu(editeur) : null });
  else if (rempli(editeur.pays)) lignes.push({ libelle: "Pays", valeur: editeur.pays.trim() });
  if (rempli(editeur.immatriculation)) lignes.push({ libelle: "Immatriculation", valeur: editeur.immatriculation.trim() });
  if (rempli(editeur.telephone)) lignes.push({ libelle: "Téléphone", valeur: editeur.telephone.trim() });
  lignes.push({ libelle: "Email", valeur: editeur.email.trim() || null, lien: "mailto" });
  if (rempli(editeur.directeurPublication)) lignes.push({ libelle: "Directeur de la publication", valeur: editeur.directeurPublication.trim() });
  return lignes;
}

/**
 * L’éditeur en une ligne, ce qui en est rempli : « Exemple · SIRET : 123 456 789 00012 · bonjour@askblush.com ». Au
 * pied des conditions.
 */
export const identiteEditeur = (editeur: Editeur = EDITEUR) =>
  [editeur.nom, editeur.statut, lieu(editeur), editeur.immatriculation, editeur.email]
    .map((t) => t.trim())
    .filter(Boolean)
    .join(" · ");

/** La loi qui régit les conditions : le champ `droit` de l’éditeur, ou le droit français. */
export const droitApplicable = (editeur: Editeur = EDITEUR) => editeur.droit.trim() || "le droit français";

/** Ce que la page montre d’un champ exigé encore vide (la production reste alors fermée au public). */
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

/** Les textes de la page, autour des champs. `mediateur` : seulement quand l’éditeur en a un. */
export const MENTIONS = {
  titre: "Mentions légales",
  sous: "Qui édite BLUSH, qui l’héberge, et où nous écrire.",
  donnees: "Ce que BLUSH fait de ta conv et de ton email, et chez qui ils vivent, est sur la page Confidentialité.",
  mediateur: "Un désaccord sur un achat\u00a0? Écris-nous d’abord. Si on ne trouve pas de solution, tu peux saisir gratuitement le médiateur de la consommation",
  marque: "Le nom BLUSH, son logo, le site et ses textes appartiennent à l’éditeur. Les reprendre demande notre accord.",
  maj: "Dernière mise à jour\u00a0: 13 octobre 2026.",
} as const;
