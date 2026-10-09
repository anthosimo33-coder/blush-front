/**
 * Dans le navigateur, avant l’envoi : on ouvre l’export (.zip ou fichier seul), on ne garde que le texte de la conv
 * (le .txt WhatsApp, ou les message_N d’Instagram), et on le compresse. Les photos et vocaux ne partent jamais,
 * et l’envoi reste petit (Vercel refuse plus de 4,5 Mo).
 */
import { gzipSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { choisirParties, convsInstagram, estFichierUtile, resumeConvInstagram, type Partie } from "@prompts/lib/export";
import { BLOC_HTML } from "@prompts/lib/instagram";

/** Un fichier de texte plus gros n’est pas une conv */
const TAILLE_MAX = 50 * 1024 * 1024;

export class ExportIllisible extends Error {
  constructor(readonly code: "fichier" | "plusieurs") {
    super(code);
  }
}

/** Une conv d’un export Instagram complet, telle qu’on la propose au choix. */
export type ConvInstagram = { id: string; nom: string; messages: number; derniere: string; groupe: boolean };

/** Ce que Vercel accepte au plus dans un envoi (4,5 Mo), moins une marge pour le formulaire. */
const ENVOI_MAX = 4.2 * 1024 * 1024;

const compresser = (nom: string, parties: Partie[], coupe: boolean) => gzipSync(strToU8(JSON.stringify({ nom, parties, ...(coupe ? { coupe: true } : {}) })));

/**
 * Le paquet compressé. Une conv trop longue pour partir (plus de 15 Mo de texte environ : des années de messages)
 * garde sa partie la plus récente, celle qui tient (`coupe` : l’écran suivant dit combien de mois BLUSH lit).
 */
function paquet(nom: string, parties: Partie[]): Blob {
  let gz = compresser(nom, parties, false);
  let garde = parties;
  for (let essai = 0; gz.length > ENVOI_MAX && essai < 6; essai++) {
    garde = garderLaFin(garde, (ENVOI_MAX * 0.92) / gz.length);
    gz = compresser(nom, garde, true);
  }
  if (gz.length > ENVOI_MAX) throw new ExportIllisible("fichier");
  return new Blob([gz], { type: "application/gzip" });
}

/**
 * La part la plus récente d’une conv, environ `part` de sa taille (de 0 à 1) : les plus anciens messages partent.
 * WhatsApp : un .txt, du plus ancien au plus récent ; on coupe au début d’un message. Instagram : message_1 est le plus
 * récent, et chaque fichier va du plus récent au plus ancien ; les fichiers les plus anciens partent d’abord.
 */
export function garderLaFin(parties: Partie[], part: number): Partie[] {
  if (parties.length === 1 && /\.txt$/i.test(parties[0].nom)) {
    const c = parties[0].contenu;
    /* Le premier début de message (une ligne qui commence par une date) après la coupe */
    const debut = /\n(?=\[?\d{1,4}[./-]\d{1,2}[./-]\d{2,4})/g;
    debut.lastIndex = Math.floor(c.length * (1 - part));
    const m = debut.exec(c);
    return [{ ...parties[0], contenu: c.slice(m ? m.index + 1 : debut.lastIndex) }];
  }
  let reste = parties.reduce((n, p) => n + p.contenu.length, 0) * part;
  const gardees: Partie[] = [];
  for (const p of parties) {
    if (reste <= 0) break;
    gardees.push(p.contenu.length <= reste ? p : couperInstagram(p, reste / p.contenu.length));
    reste -= p.contenu.length;
  }
  return gardees;
}

/** Les messages les plus récents d’un fichier d’Instagram (JSON ou HTML), environ `part` d’entre eux. */
function couperInstagram(p: Partie, part: number): Partie {
  if (/\.json$/i.test(p.nom)) {
    const j = JSON.parse(p.contenu) as { messages?: unknown[] };
    const messages = j.messages ?? [];
    return { ...p, contenu: JSON.stringify({ ...j, messages: messages.slice(0, Math.max(1, Math.floor(messages.length * part))) }) };
  }
  const [tete, ...blocs] = p.contenu.split(BLOC_HTML);
  return { ...p, contenu: [tete, ...blocs.slice(0, Math.max(1, Math.floor(blocs.length * part)))].join(BLOC_HTML) };
}

/**
 * Le fichier choisi, prêt à partir : un paquet, ou (un export Instagram complet) la liste de ses convs à choisir,
 * et de quoi faire le paquet de celle qu’on choisit. Les autres convs ne quittent jamais le navigateur.
 */
export async function analyserExport(fichier: File): Promise<{ type: "un"; paquet: Blob } | { type: "plusieurs"; convs: ConvInstagram[]; paquetDe: (id: string) => Blob }> {
  const fichiers = await lireFichiers(fichier);
  const parties = choisirParties(fichiers);
  if (!parties) throw new ExportIllisible("fichier");
  if (parties !== "plusieurs") return { type: "un", paquet: paquet(fichier.name, parties) };
  const convs = convsInstagram(fichiers);
  const resumes = convs.flatMap((c, k) => {
    const r = resumeConvInstagram(c.parties);
    return r && r.messages > 0 ? [{ id: String(k), ...r }] : [];
  });
  if (!resumes.length) throw new ExportIllisible("fichier");
  return { type: "plusieurs", convs: resumes, paquetDe: (id) => paquet(fichier.name, convs[+id].parties) };
}

/** Le fichier choisi devient un petit paquet compressé : { parties: [{ nom, contenu }] } en gzip. */
export async function preparerExport(fichier: File): Promise<Blob> {
  const parties = choisirParties(await lireFichiers(fichier));
  if (parties === "plusieurs" || !parties) throw new ExportIllisible(parties === "plusieurs" ? "plusieurs" : "fichier");
  return paquet(fichier.name, parties);
}

export async function lireFichiers(fichier: Blob & { name: string }): Promise<Partie[]> {
  const debut = await octets(fichier, 0, 2);
  if (debut[0] === 0x50 && debut[1] === 0x4b) {
    return lireZip(fichier).catch(() => {
      throw new ExportIllisible("fichier");
    });
  }
  if (fichier.size >= TAILLE_MAX) throw new ExportIllisible("fichier");
  return [{ nom: fichier.name, contenu: strFromU8(await octets(fichier, 0, fichier.size)) }];
}

const octets = async (fichier: Blob, de: number, a: number) => new Uint8Array(await fichier.slice(de, a).arrayBuffer());

/**
 * Les fichiers de texte d’un .zip, lus dans le fichier sans le charger : sa table des matières (à la fin), puis les
 * octets de chaque .txt ou message_N. Un export avec médias pèse des centaines de Mo : le charger en entier (et le
 * copier pour le décompresser à côté) faisait recharger la page à Safari sur iPhone, sans que rien ne parte.
 */
async function lireZip(fichier: Blob): Promise<Partie[]> {
  /* La fin du zip (22 octets, plus un commentaire de 64 Ko au plus) dit où est sa table des matières */
  const base = Math.max(0, fichier.size - 22 - 0xffff);
  const queue = await octets(fichier, base, fichier.size);
  const q = new DataView(queue.buffer);
  let fin = queue.length - 22;
  while (fin >= 0 && q.getUint32(fin, true) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error("zip sans fin");
  let nombre = q.getUint16(fin + 10, true);
  let taille = q.getUint32(fin + 12, true);
  let position = q.getUint32(fin + 16, true);
  /* Zip64 (plus de 4 Go, ou plus de 65 535 fichiers) : les vraies valeurs sont dans un enregistrement à part */
  if (nombre === 0xffff || taille === 0xffffffff || position === 0xffffffff) {
    const repere = new DataView((await octets(fichier, base + fin - 20, base + fin)).buffer);
    if (repere.getUint32(0, true) !== 0x07064b50) throw new Error("zip64 sans repère");
    const ou = Number(repere.getBigUint64(8, true));
    const z = new DataView((await octets(fichier, ou, ou + 56)).buffer);
    if (z.getUint32(0, true) !== 0x06064b50) throw new Error("zip64 sans fin");
    nombre = Number(z.getBigUint64(32, true));
    taille = Number(z.getBigUint64(40, true));
    position = Number(z.getBigUint64(48, true));
  }

  const table = await octets(fichier, position, position + taille);
  const t = new DataView(table.buffer);
  const parties: Partie[] = [];
  for (let p = 0, k = 0; k < nombre; k++) {
    if (t.getUint32(p, true) !== 0x02014b50) throw new Error("entrée illisible");
    const drapeaux = t.getUint16(p + 8, true);
    const methode = t.getUint16(p + 10, true);
    let compresse = t.getUint32(p + 20, true);
    let complet = t.getUint32(p + 24, true);
    let local = t.getUint32(p + 42, true);
    const [ln, le, lc] = [t.getUint16(p + 28, true), t.getUint16(p + 30, true), t.getUint16(p + 32, true)];
    /* Le nom en UTF-8 si le drapeau le dit, sinon octet par octet (comme fflate) */
    const nom = strFromU8(table.subarray(p + 46, p + 46 + ln), !(drapeaux & 0x800));
    /* Zip64 : les valeurs à 0xFFFFFFFF sont dans le champ extra 0x0001, dans cet ordre */
    for (let e = p + 46 + ln; e + 4 <= p + 46 + ln + le; e += 4 + t.getUint16(e + 2, true)) {
      if (t.getUint16(e, true) !== 1) continue;
      let x = e + 4;
      const suivant = () => Number(t.getBigUint64((x += 8) - 8, true));
      if (complet === 0xffffffff) complet = suivant();
      if (compresse === 0xffffffff) compresse = suivant();
      if (local === 0xffffffff) local = suivant();
    }
    p += 46 + ln + le + lc;
    /* Ni les photos et vocaux, ni un fichier chiffré ou compressé autrement */
    if (!estFichierUtile(nom) || complet >= TAILLE_MAX || drapeaux & 1 || (methode !== 0 && methode !== 8)) continue;
    const tete = new DataView((await octets(fichier, local, local + 30)).buffer);
    if (tete.getUint32(0, true) !== 0x04034b50) throw new Error("entrée introuvable");
    const de = local + 30 + tete.getUint16(26, true) + tete.getUint16(28, true);
    const brut = await octets(fichier, de, de + compresse);
    parties.push({ nom, contenu: strFromU8(methode === 0 ? brut : inflateSync(brut)) });
  }
  return parties;
}
