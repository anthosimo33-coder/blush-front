import "client-only";
/*
 * Dans le navigateur, avant l’envoi : on ouvre l’export (.zip ou fichier seul), on ne garde que le texte de la conv
 * (le .txt WhatsApp, ou les message_N d’Instagram), et on le compresse. Les photos et vocaux ne partent jamais,
 * et l’envoi reste petit (Vercel refuse plus de 4,5 Mo).
 */
import { gzip, gzipSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { choisirParties, convsInstagram, estFichierUtile, resumeConvInstagram, type Partie } from "@prompts/lib/export";
import { BLOC_HTML } from "@prompts/lib/instagram";
import { ENVOI_EXPORT_MAX, TEXTE_CONV_MAX } from "@/lib/limites";

export class ExportIllisible extends Error {
  constructor(readonly code: "fichier" | "plusieurs") {
    super(code);
  }
}

/** Une conv d’un export Instagram complet, telle qu’on la propose au choix. */
export type ConvInstagram = { id: string; nom: string; messages: number; derniere: string; groupe: boolean };

/* Un morceau de texte mis en JSON et encodé d’un coup : environ 3 ms sur un Mac, avant de rendre la main */
const MORCEAU = 1 << 20;

/**
 * Le paquet en octets : le JSON de { nom, parties, coupe? }, écrit et encodé morceau par morceau, en rendant la main
 * entre deux (15 Mo de texte d’un coup bloquaient l’écran, et doublaient la mémoire le temps d’une grande chaîne).
 * Un émoji coupé entre deux morceaux s’écrit en deux échappements (\ud83d\ude0a), que JSON.parse recolle.
 */
async function enOctets(nom: string, parties: Partie[], coupe: boolean): Promise<Uint8Array> {
  const morceaux: Uint8Array[] = [];
  const ecrire = (json: string) => morceaux.push(strToU8(json));
  ecrire(`{"nom":${JSON.stringify(nom)},"parties":[`);
  for (const [k, p] of parties.entries()) {
    ecrire(`${k ? "," : ""}{"nom":${JSON.stringify(p.nom)},"contenu":"`);
    for (let i = 0; i < p.contenu.length; i += MORCEAU) {
      ecrire(JSON.stringify(p.contenu.slice(i, i + MORCEAU)).slice(1, -1));
      await new Promise((r) => setTimeout(r, 0));
    }
    ecrire('"}');
  }
  ecrire(`]${coupe ? ',"coupe":true' : ""}}`);
  const octets = new Uint8Array(morceaux.reduce((n, m) => n + m.length, 0));
  let ou = 0;
  for (const m of morceaux) {
    octets.set(m, ou);
    ou += m.length;
  }
  return octets;
}

/**
 * Compressé hors du fil principal : fflate le fait dans un Worker (un gzip synchrone de 15 Mo de texte gelait l’écran
 * près d’une seconde dans Safari). Pas de CompressionStream : dans Safari, il bloque quand même le fil principal.
 * Un Worker qui échoue ou ne répond pas (navigateur qui le refuse) : on compresse ici, comme avant.
 */
function compresser(octets: Uint8Array): Promise<Uint8Array> {
  return new Promise((ok) => {
    let fini = false;
    let arreter = () => {};
    const finir = (gz?: Uint8Array | null) => {
      if (fini) return;
      fini = true;
      clearTimeout(garde);
      ok(gz ?? gzipSync(octets));
    };
    const garde = setTimeout(() => {
      arreter();
      finir();
    }, 30_000);
    try {
      /* Sans `consume` : le Worker reçoit une copie, et le repli a encore les octets */
      arreter = gzip(octets, (err, gz) => finir(err ? null : gz));
    } catch {
      finir();
    }
  });
}

/* Au-delà de cette taille, la conv ne tiendra sans doute pas : son taux de compression est d’abord mesuré sur sa fin */
const ESTIMER_AU_DELA = ENVOI_EXPORT_MAX * 3;
const ECHANTILLON = 1024 * 1024;

/**
 * Le paquet compressé. Une conv trop longue pour partir (plus de 15 Mo de texte environ : des années de messages)
 * garde sa partie la plus récente, celle qui tient (`coupe` : l’écran suivant dit combien de mois BLUSH lit).
 * Le serveur ne décompresse pas plus de TEXTE_CONV_MAX : un paquet qui le dépasserait une fois en JSON (les fichiers
 * d’une conv réunis, ses échappements), même très compressible, garde aussi sa fin, ici plutôt qu’un refus après l’envoi.
 * Pour une très grosse conv, le taux mesuré sur sa fin (les messages gardés) dit d’avance où couper : on ne la
 * compresse plus en entier jusqu’à six fois. La boucle reste en garde-fou, si l’estimation était trop juste.
 */
async function paquet(nom: string, parties: Partie[]): Promise<Blob> {
  let garde = parties;
  let coupe = false;
  let brut = await enOctets(nom, garde, false);
  for (let essai = 0; brut.length > TEXTE_CONV_MAX && essai < 3; essai++) {
    garde = garderLaFin(garde, (TEXTE_CONV_MAX * 0.9) / brut.length);
    coupe = true;
    brut = await enOctets(nom, garde, true);
  }
  if (brut.length > TEXTE_CONV_MAX) throw new ExportIllisible("fichier");
  if (brut.length > ESTIMER_AU_DELA) {
    const estime = brut.length * ((await compresser(brut.slice(-ECHANTILLON))).length / ECHANTILLON);
    if (estime > ENVOI_EXPORT_MAX) {
      garde = garderLaFin(garde, (ENVOI_EXPORT_MAX * 0.9) / estime);
      coupe = true;
      brut = await enOctets(nom, garde, true);
    }
  }
  let gz = await compresser(brut);
  for (let essai = 0; gz.length > ENVOI_EXPORT_MAX && essai < 6; essai++) {
    garde = garderLaFin(garde, (ENVOI_EXPORT_MAX * 0.92) / gz.length);
    coupe = true;
    gz = await compresser(await enOctets(nom, garde, coupe));
  }
  if (gz.length > ENVOI_EXPORT_MAX) throw new ExportIllisible("fichier");
  return new Blob([gz as BlobPart], { type: "application/gzip" });
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
 * Un export complet compte des dizaines de convs : on les lit une à une (le temps d’en faire le résumé), sans les
 * garder toutes en mémoire, et la conv choisie est relue dans le zip au moment de partir (Safari sur iPhone
 * recharge la page quand la mémoire déborde). `onAvance` (de 0 à 1) : où en est ce tour des convs, à afficher.
 */
export async function analyserExport(
  fichier: File,
  onAvance?: (part: number) => void,
): Promise<{ type: "un"; paquet: Blob } | { type: "plusieurs"; convs: ConvInstagram[]; paquetDe: (id: string) => Promise<Blob> }> {
  const { choix, noms, contenus } = await ouvrir(fichier);
  if (choix !== "plusieurs") return { type: "un", paquet: await paquet(fichier.name, await contenus(choix)) };
  const convs = convsInstagram(noms);
  const resumes: ConvInstagram[] = [];
  onAvance?.(0);
  for (const [k, c] of convs.entries()) {
    const r = resumeConvInstagram(await contenus(c.parties));
    if (r && r.messages > 0) resumes.push({ id: String(k), ...r });
    onAvance?.((k + 1) / convs.length);
  }
  if (!resumes.length) throw new ExportIllisible("fichier");
  return { type: "plusieurs", convs: resumes, paquetDe: async (id) => paquet(fichier.name, await contenus(convs[+id].parties)) };
}

/** Le fichier choisi devient un petit paquet compressé : { parties: [{ nom, contenu }] } en gzip. */
export async function preparerExport(fichier: File): Promise<Blob> {
  const { choix, contenus } = await ouvrir(fichier);
  /*
   * Un export Instagram complet (le chat et la fiche ne font pas choisir la conv) : refusé d’après les noms de ses
   * fichiers, sans décompresser ses convs (des secondes, et assez de mémoire pour que Safari recharge la page).
   */
  if (choix === "plusieurs") throw new ExportIllisible("plusieurs");
  return paquet(fichier.name, await contenus(choix));
}

/**
 * Ce qu’est l’export, sans lire ses convs : la conv retenue (ou « plusieurs », un export Instagram complet), les
 * fichiers utiles du zip (leurs noms, et le texte des .txt), et de quoi lire les fichiers d’une conv au moment voulu.
 */
async function ouvrir(fichier: File): Promise<{ choix: Partie[] | "plusieurs"; noms: Partie[]; contenus: (parties: Partie[]) => Promise<Partie[]> }> {
  if (!(await estUnZip(fichier))) {
    const parties = choisirParties(await lireFichiers(fichier));
    if (!parties || parties === "plusieurs") throw new ExportIllisible("fichier");
    return { choix: parties, noms: parties, contenus: async (p) => p };
  }
  const entrees = await entreesZip(fichier).catch(() => {
    throw new ExportIllisible("fichier");
  });
  const lire = (noms: string[]) =>
    Promise.all(noms.map(async (nom) => ({ nom, contenu: await lireEntree(fichier, entrees.find((e) => e.nom === nom)!) }))).catch(() => {
      throw new ExportIllisible("fichier");
    });
  /* Les noms suffisent pour savoir ce qu’est l’export ; on ne lit d’avance que les .txt (WhatsApp, petits) */
  const txt = await lire(entrees.filter((e) => /\.txt$/i.test(e.nom)).map((e) => e.nom));
  const noms = [...txt, ...entrees.filter((e) => !/\.txt$/i.test(e.nom)).map((e) => ({ nom: e.nom, contenu: "" }))];
  const choix = choisirParties(noms);
  if (!choix) throw new ExportIllisible("fichier");
  const contenus = (parties: Partie[]) => (parties.some((p) => /\.txt$/i.test(p.nom)) ? Promise.resolve(parties) : lire(parties.map((p) => p.nom)));
  return { choix, noms, contenus };
}

const estUnZip = async (fichier: Blob) => {
  const debut = await octets(fichier, 0, 2);
  return debut[0] === 0x50 && debut[1] === 0x4b;
};

export async function lireFichiers(fichier: Blob & { name: string }): Promise<Partie[]> {
  if (await estUnZip(fichier)) {
    return lireZip(fichier).catch(() => {
      throw new ExportIllisible("fichier");
    });
  }
  if (fichier.size > TEXTE_CONV_MAX) throw new ExportIllisible("fichier");
  return [{ nom: fichier.name, contenu: strFromU8(await octets(fichier, 0, fichier.size)) }];
}

const octets = async (fichier: Blob, de: number, a: number) => new Uint8Array(await fichier.slice(de, a).arrayBuffer());

/**
 * Les fichiers de texte d’un .zip, lus dans le fichier sans le charger : sa table des matières (à la fin), puis les
 * octets de chaque .txt ou message_N. Un export avec médias pèse des centaines de Mo : le charger en entier (et le
 * copier pour le décompresser à côté) faisait recharger la page à Safari sur iPhone, sans que rien ne parte.
 */
async function lireZip(fichier: Blob): Promise<Partie[]> {
  const entrees = await entreesZip(fichier);
  const parties: Partie[] = [];
  for (const e of entrees) parties.push({ nom: e.nom, contenu: await lireEntree(fichier, e) });
  return parties;
}

/** Un fichier utile d’un zip : où ses octets commencent, comment ils sont compressés. */
type EntreeZip = { nom: string; methode: number; compresse: number; local: number };

/** La table des matières d’un zip : ses fichiers de texte utiles (.txt, message_N), sans rien en lire. */
async function entreesZip(fichier: Blob): Promise<EntreeZip[]> {
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
  const entrees: EntreeZip[] = [];
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
    if (!estFichierUtile(nom) || complet > TEXTE_CONV_MAX || drapeaux & 1 || (methode !== 0 && methode !== 8)) continue;
    entrees.push({ nom, methode, compresse, local });
  }
  return entrees;
}

/**
 * Le texte d’un fichier du zip, lu à sa place dans le fichier. Décompressé par le navigateur quand il sait le faire
 * (DecompressionStream, Safari 16.4 et plus : hors du fil principal, 16 ms au lieu de 210 pour 15 Mo), sinon par fflate.
 */
async function lireEntree(fichier: Blob, e: EntreeZip): Promise<string> {
  const tete = new DataView((await octets(fichier, e.local, e.local + 30)).buffer);
  if (tete.getUint32(0, true) !== 0x04034b50) throw new Error("entrée introuvable");
  const de = e.local + 30 + tete.getUint16(26, true) + tete.getUint16(28, true);
  if (e.methode !== 0 && typeof DecompressionStream !== "undefined") {
    try {
      return await new Response(fichier.slice(de, de + e.compresse).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    } catch {
      /* « deflate-raw » inconnu de ce navigateur (ou des octets abîmés, que fflate refusera aussi) : le chemin d’avant */
    }
  }
  const brut = await octets(fichier, de, de + e.compresse);
  return strFromU8(e.methode === 0 ? brut : inflateSync(brut));
}
