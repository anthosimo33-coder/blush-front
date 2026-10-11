import "server-only";
import { gunzipSync } from "node:zlib";
import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";
import { choisirParties, estFichierUtile, lireExport, type ExportLu } from "@prompts/lib/export";
import { CORPS_VERCEL_MAX, TEXTE_CONV_MAX } from "@/lib/limites";
import type { CodeErreur } from "@/types/erreurs-api";
import { ErreurPublique } from "./erreurs";

/*
 * Ce qu’on reçoit d’un export (le fichier tel quel, ou le paquet préparé par le navigateur) devient le texte de la conv,
 * borné avant d’être lu. L’envoi est anonyme (avant l’email) : un export forgé, minuscule une fois compressé, ne doit
 * coûter ni des secondes de calcul ni des Go de mémoire. La lecture elle-même (prompts/lib/conv.ts) est linéaire ; ici,
 * on borne ce qu’elle reçoit. La persistance du brouillon vit dans histoires.ts (importer), sa présentation dans
 * conv-affichee.ts.
 */

/** Un import refusé : un fichier illisible, une conv de groupe, une conv trop courte (src/types/erreurs-api.ts). */
export class ErreurImport extends ErreurPublique<Extract<CodeErreur, "fichier" | "groupe" | "courte">> {}

/** Un export compte quelques fichiers utiles (la conv, ses parties) : au-delà, ce n’est pas un export. */
const FICHIERS_MAX = 200;

const MO = 1024 * 1024;
/**
 * Le texte lu d’une conv, au plus : des années de messages (le modèle en lit 500 000 caractères, CONV_MAX). Au-delà, on
 * garde sa partie la plus récente, comme le navigateur le fait déjà pour un paquet trop gros (`coupe`).
 * TODO(produit): 8 Mo et 300 000 lignes (la borne de l’audit S-11) ; le navigateur envoie jusqu’à ~15 Mo de texte d’une
 * conv très longue, que le serveur coupe donc à son tour (« BLUSH lit tes N derniers mois »).
 */
export const TEXTE_LU_MAX = 8 * MO;
/** Les lignes du texte lu, au plus (un message sur plusieurs lignes en compte plusieurs). */
export const LIGNES_MAX = 300_000;
/** Une ligne, au plus : un message collé (un article, une lettre) en est loin ; au-delà, l’export est forgé. */
export const LIGNE_MAX = 64 * 1024;

/* Le début d’un message, au format de lecture (celui des exports WhatsApp, où Instagram est remis) : une ligne qui commence par une date */
const DEBUT_DE_MESSAGE = /\n(?=\[?\d{1,4}[./-]\d{1,2}[./-]\d{2,4})/g;

/**
 * Le texte d’un export, borné avant sa lecture : sa partie la plus récente s’il dépasse TEXTE_LU_MAX ou LIGNES_MAX
 * (coupée au début d’un message, `coupe` alors vrai), refusé si une ligne dépasse LIGNE_MAX. Tout se lit par indexOf :
 * le temps reste linéaire, quel que soit le texte.
 */
export function borner<T extends ExportLu & { coupe?: boolean }>(lu: T): T & { coupe?: boolean } {
  const { texte } = lu;
  let debut = Math.max(0, texte.length - TEXTE_LU_MAX);
  /* Les LIGNES_MAX dernières lignes : la position du LIGNES_MAX-ième saut de ligne, depuis la fin */
  let k = texte.length;
  for (let n = 0; n < LIGNES_MAX && k > 0; n++) k = texte.lastIndexOf("\n", k - 1);
  if (k > 0) debut = Math.max(debut, k + 1);
  let garde = texte;
  if (debut > 0) {
    DEBUT_DE_MESSAGE.lastIndex = debut - 1;
    const m = DEBUT_DE_MESSAGE.exec(texte);
    if (!m) throw new ErreurImport("fichier");
    garde = texte.slice(m.index + 1);
  }
  for (let i = 0; i <= garde.length; ) {
    const fin = garde.indexOf("\n", i);
    const j = fin < 0 ? garde.length : fin;
    if (j - i > LIGNE_MAX) throw new ErreurImport("fichier");
    i = j + 1;
  }
  return garde === texte ? lu : { ...lu, texte: garde, coupe: true };
}

/** Un fichier envoyé tel quel (un .txt, un message_1.html, ou un .zip) : on en tire le texte de la conv. */
export async function depuisFichier(fichier: File): Promise<ExportLu & { nom: string; coupe?: boolean }> {
  if (fichier.size > TEXTE_CONV_MAX || fichier.size === 0) throw new ErreurImport("fichier");
  const octets = new Uint8Array(await fichier.arrayBuffer());
  let fichiers = [{ nom: fichier.name, contenu: "" }];
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
  } else fichiers[0].contenu = strFromU8(octets);
  const parties = choisirParties(fichiers);
  const lu = parties && parties !== "plusieurs" ? lireExport(parties) : null;
  if (!lu) throw new ErreurImport("fichier");
  return borner({ ...lu, nom: fichier.name });
}

const Paquet = z.object({ nom: z.string().max(300), parties: z.array(z.object({ nom: z.string().max(500), contenu: z.string() })).min(1).max(50), coupe: z.boolean().optional() });

/**
 * Le paquet préparé par le navigateur (src/services/preparer-export.ts) : du JSON compressé, relu et vérifié ici.
 * `coupe` : la conv était trop longue pour partir en entier, le navigateur (ou borner, ici) n’a gardé que sa partie la plus récente.
 */
export async function depuisPaquet(paquet: File): Promise<ExportLu & { nom: string; coupe?: boolean }> {
  if (paquet.size > CORPS_VERCEL_MAX || paquet.size === 0) throw new ErreurImport("fichier");
  try {
    /* La décompression s’arrête d’elle-même à TEXTE_CONV_MAX, la limite que le navigateur respecte : un paquet piégé ne remplit pas la mémoire du serveur */
    const octets = gunzipSync(Buffer.from(await paquet.arrayBuffer()), { maxOutputLength: TEXTE_CONV_MAX });
    const p = Paquet.parse(JSON.parse(octets.toString("utf8")));
    const lu = lireExport(p.parties);
    if (!lu) throw new ErreurImport("fichier");
    return borner({ ...lu, nom: p.nom, ...(p.coupe ? { coupe: true } : {}) });
  } catch {
    throw new ErreurImport("fichier");
  }
}
