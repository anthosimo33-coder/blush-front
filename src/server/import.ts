import "server-only";
import { gunzipSync } from "node:zlib";
import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";
import { choisirParties, debutDeMessage, estFichierUtile, lireExport, type ExportLu } from "@prompts/lib/export";
import { CORPS_VERCEL_MAX, PARTIES_MAX, TEXTE_CONV_MAX, type Paquet } from "@/lib/limites";
import type { CodeErreur } from "@/types/erreurs-api";
import { ErreurPublique } from "./erreurs";

/*
 * Ce qu’on reçoit d’un export (le fichier tel quel, ou le paquet préparé par le navigateur) devient le texte de la conv,
 * borné avant d’être lu. L’envoi est anonyme (avant l’email) : un export forgé, minuscule une fois compressé, ne doit
 * coûter ni des secondes de calcul ni des Go de mémoire. La lecture elle-même (prompts/lib/conv.ts) est linéaire ; ici,
 * on borne ce qu’elle reçoit, sans rien couper de ce qu’envoie le navigateur pour une vraie conv. La persistance du brouillon vit dans histoires.ts (importer), sa présentation dans
 * conv-affichee.ts.
 */

/** Un import refusé : un fichier illisible, une conv de groupe, une conv trop courte (src/types/erreurs-api.ts). */
export class ErreurImport extends ErreurPublique<Extract<CodeErreur, "fichier" | "groupe" | "courte">> {}

/** Un export compte quelques fichiers utiles (la conv, ses parties) : au-delà, ce n’est pas un export. */
const FICHIERS_MAX = 200;

/**
 * Le texte lu d’une conv, au plus, en caractères (unités UTF-16, celles de `texte.length`). Le texte reçu est déjà
 * borné en octets (TEXTE_CONV_MAX, à la décompression), et il a au moins autant d’octets que de caractères : cette borne
 * ne coupe donc qu’un export Instagram que sa remise au format de lecture aurait allongé. Au-delà, on garde sa partie la
 * plus récente (`coupe`), comme le navigateur pour un paquet trop gros.
 */
export const TEXTE_LU_MAX_CARACTERES = TEXTE_CONV_MAX;
/**
 * Les lignes du texte lu, au plus (un message sur plusieurs lignes en compte plusieurs) : de quoi borner la mémoire de la
 * lecture (un objet par message) devant un export forgé de lignes minuscules. Une vraie conv au plus gros que le
 * navigateur envoie (TEXTE_CONV_MAX, ses lignes de plus de 40 caractères en moyenne) en reste en deçà ; au-delà, on
 * garde les plus récentes (`coupe`).
 * TODO(produit): 1 000 000 de lignes (mesuré : environ 2 s de lecture et 700 Mo de mémoire au pire) ; le plafond de
 * 8 Mo de l’audit S-11 coupait une conv d’à peine 21 mois que le navigateur envoyait entière, il est levé : la lecture
 * est linéaire.
 */
export const LIGNES_MAX = 1_000_000;
/**
 * Une ligne, au plus, en caractères : un message WhatsApp en compte 65 536 au plus, plus son en-tête. Une ligne plus
 * longue (un message fait d’emojis, deux unités chacun, ou un export forgé) est tronquée, l’import continue : on ne lit
 * de toute façon que le début d’un message (MESSAGE_MAX, prompts/lib/conv.ts).
 */
export const LIGNE_MAX = 128 * 1024;

/** Une moitié haute de paire de substitution (un emoji, en UTF-16) : on ne coupe pas une ligne entre ses deux unités. */
const estDebutDePaire = (code: number) => code >= 0xd800 && code <= 0xdbff;

/**
 * Le texte d’un export, borné avant sa lecture : sa partie la plus récente s’il dépasse TEXTE_LU_MAX_CARACTERES ou
 * LIGNES_MAX (coupée au début d’un message, comme dans le navigateur, et `coupe` alors vrai), refusé s’il n’y a plus
 * un début de message après la coupe ; une ligne de plus de LIGNE_MAX caractères est tronquée. Tout se lit par
 * indexOf : le temps reste linéaire, quel que soit le texte.
 */
export function borner<T extends ExportLu & { coupe?: boolean }>(lu: T): T & { coupe?: boolean } {
  const { texte } = lu;
  let debut = Math.max(0, texte.length - TEXTE_LU_MAX_CARACTERES);
  /* Les LIGNES_MAX dernières lignes : la position du LIGNES_MAX-ième saut de ligne, depuis la fin */
  let k = texte.length;
  for (let n = 0; n < LIGNES_MAX && k > 0; n++) k = texte.lastIndexOf("\n", k - 1);
  if (k > 0) debut = Math.max(debut, k + 1);
  let garde = texte;
  if (debut > 0) {
    const d = debutDeMessage(texte, debut - 1);
    if (d < 0) throw new ErreurImport("fichier");
    garde = texte.slice(d);
  }
  /* Les lignes trop longues, tronquées : les morceaux gardés, puis le reste, réunis une fois */
  const morceaux: string[] = [];
  let fait = 0;
  for (let i = 0; i <= garde.length;) {
    const fin = garde.indexOf("\n", i);
    const j = fin < 0 ? garde.length : fin;
    if (j - i > LIGNE_MAX) {
      const c = i + LIGNE_MAX - (estDebutDePaire(garde.charCodeAt(i + LIGNE_MAX - 1)) ? 1 : 0);
      morceaux.push(garde.slice(fait, c));
      fait = j;
    }
    i = j + 1;
  }
  if (morceaux.length) garde = morceaux.join("") + garde.slice(fait);
  if (garde === texte) return lu;
  return { ...lu, texte: garde, ...(debut > 0 ? { coupe: true } : {}) };
}

/** Un fichier envoyé tel quel (un .txt, un message_1.html, ou un .zip) : on en tire le texte de la conv. */
export async function depuisFichier(fichier: File): Promise<ExportLu & { nom: string; coupe?: boolean }> {
  if (fichier.size > TEXTE_CONV_MAX || fichier.size === 0) throw new ErreurImport("fichier");
  const octets = new Uint8Array(await fichier.arrayBuffer());
  let fichiers: { nom: string; contenu: string }[];
  if (octets[0] === 0x50 && octets[1] === 0x4b) {
    /* Une archive piégée (quelques Mo qui en font des Go) : on compte ce qu’on décompresse, au total, avant de le faire */
    let total = 0;
    let nombre = 0;
    try {
      const contenu = unzipSync(octets, {
        filter: (f) => {
          if (!estFichierUtile(f.name)) return false;
          total += f.originalSize;
          if (++nombre > FICHIERS_MAX || total > TEXTE_CONV_MAX) throw new ErreurImport("fichier");
          return true;
        },
      });
      fichiers = Object.entries(contenu).map(([nom, o]) => ({ nom, contenu: strFromU8(o) }));
    } catch {
      throw new ErreurImport("fichier");
    }
  } else fichiers = [{ nom: fichier.name, contenu: strFromU8(octets) }];
  let lu: ExportLu | null;
  try {
    const parties = choisirParties(fichiers);
    lu = parties && parties !== "plusieurs" ? lireExport(parties) : null;
  } catch {
    /* Un fichier qui fait échouer sa lecture (du HTML forgé) : un fichier illisible, pas une panne */
    throw new ErreurImport("fichier");
  }
  if (!lu) throw new ErreurImport("fichier");
  return borner({ ...lu, nom: fichier.name });
}

const SchemaPaquet: z.ZodType<Paquet> = z.object({
  nom: z.string().max(300),
  parties: z
    .array(z.object({ nom: z.string().max(500), contenu: z.string() }))
    .min(1)
    .max(PARTIES_MAX),
  coupe: z.boolean().optional(),
});

/**
 * Le paquet préparé par le navigateur (src/services/preparer-export.ts) : du JSON compressé, relu et vérifié ici.
 * `coupe` : la conv était trop longue pour partir en entier, le navigateur (ou borner, ici) n’a gardé que sa partie la plus récente.
 */
export async function depuisPaquet(paquet: File): Promise<ExportLu & { nom: string; coupe?: boolean }> {
  if (paquet.size > CORPS_VERCEL_MAX || paquet.size === 0) throw new ErreurImport("fichier");
  try {
    /* La décompression s’arrête d’elle-même à TEXTE_CONV_MAX, la limite que le navigateur respecte : un paquet piégé ne remplit pas la mémoire du serveur */
    const octets = gunzipSync(Buffer.from(await paquet.arrayBuffer()), { maxOutputLength: TEXTE_CONV_MAX });
    const p = SchemaPaquet.parse(JSON.parse(octets.toString("utf8")));
    const lu = lireExport(p.parties);
    if (!lu) throw new ErreurImport("fichier");
    return borner({ ...lu, nom: p.nom, ...(p.coupe ? { coupe: true } : {}) });
  } catch {
    throw new ErreurImport("fichier");
  }
}
