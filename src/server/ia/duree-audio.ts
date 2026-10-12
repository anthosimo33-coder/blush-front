/*
 * Un vocal reçu par le chat (S-15), lu sur le serveur avant de partir à la transcription : sa durée, comptée trame par
 * trame sans rien décoder (ce que le service de transcription entendra, et facture, pas ce que le fichier annonce), et
 * ce qui part vraiment chez lui. Un en-tête ment sans peine (« 5 s » devant une heure de son très compressé), et
 * l’enregistreur d’un navigateur n’en écrit souvent pas (le WebM de Chromium n’a pas de durée).
 *
 * Les formats des enregistreurs des navigateurs, et eux seuls :
 *   - WebM (Matroska) en Opus : Chromium, Firefox récent ;
 *   - Ogg en Opus : Firefox ;
 *   - MP4 en AAC, d’un bloc ou en fragments : Safari (et l’appli installée sur l’iPhone).
 * Le format se lit dans les premiers octets, jamais dans le type que le navigateur annonce.
 *
 * Mesurer ne suffit pas : un démultiplexeur se recale sur ce qu’un lecteur trop simple saute (des pages Ogg au CRC
 * faux, un élément WebM qui déborde de son parent), et y trouverait des heures de son cachées. D’où deux défenses :
 *   - En Opus (WebM, Ogg), ce qui part est réécrit ici, en Ogg Opus : les seuls paquets comptés, dans des pages neuves
 *     (ecrireOggOpus). La durée de chaque paquet est dans son premier octet, et le décodeur n’en tire pas plus : ce qui
 *     est mesuré est exactement ce qui est transcrit.
 *   - En AAC (MP4), le fichier part tel quel (une trame AAC ne dit pas sa longueur : le réécrire n’apprendrait rien au
 *     décodeur), lu au plus strict : une seule piste en AAC (type d’objet 0x40, AOT 2, 5 ou 29), un échantillon jamais
 *     plus gros qu’une trame AAC (768 octets par canal), au plus une entrée dans la liste d’édition, aucune boîte
 *     inconnue au premier niveau, un index de fragments (mfra) qui ne pointe que sur des fragments lus. Reste un
 *     échantillon de 768 octets qui tasserait plusieurs petites trames, qu’un décodeur reprendrait une à une : la durée
 *     facturée que rend le prestataire est notée et comptée pour le compte (src/server/ia/transcription.ts).
 * Tout le reste (un autre codec, plusieurs pistes, des trames groupées, un fichier tronqué hors de la dernière trame
 * d’un WebM, des pages Ogg au CRC faux ou qui se suivent mal) est illisible : null.
 * Module pur, sans server-only : tests/unit le lit sans base, et les tests de bout en bout y prennent les bornes.
 */

/**
 * Le plus long vocal que le chat accepte, en secondes : le navigateur l’envoie tout seul à 120 s (src/app/app/voice.tsx),
 * 10 s de marge pour l’enveloppe et l’arrondi.
 */
export const DUREE_VOCAL_MAX_S = 130;
/**
 * Le débit d’un enregistreur qui ne suit pas les 32 kb/s demandés (le WebKit de Playwright ne les suit pas, 3c l’a
 * mesuré) : celui qu’il prend par défaut, au plus 192 kb/s.
 */
const DEBIT_PAR_DEFAUT = 192_000;
/**
 * La taille maximale d’un vocal : DUREE_VOCAL_MAX_S au débit par défaut (environ 3,1 Mo), plus 64 Ko pour l’enveloppe du
 * fichier. La vraie borne est la durée ; celle-ci refuse vite un envoi démesuré, avant de le lire.
 * TODO(produit): ne pas descendre plus bas avant d’avoir mesuré le débit d’un vocal de 2 minutes sur un vrai iPhone
 * (Safari et l’appli installée) ; tests/e2e/chat-vocal.spec.ts mesure le débit des deux navigateurs de test.
 */
export const TAILLE_VOCAL_MAX = (DUREE_VOCAL_MAX_S * DEBIT_PAR_DEFAUT) / 8 + 64 * 1024;

/** Un vocal lu : sa durée en secondes, et le fichier qui part à la transcription (réécrit en Ogg Opus, ou le MP4 reçu). */
export type AudioLu = { secondes: number; octets: Uint8Array; type: "audio/ogg" | "audio/mp4"; extension: "ogg" | "m4a" };

/** Le vocal lu (lireAudio), ou null s’il n’est pas dans un format d’enregistreur lisible. */
export function lireAudio(octets: Uint8Array): AudioLu | null {
  try {
    if (commencePar(octets, 0, [0x1a, 0x45, 0xdf, 0xa3])) return enOgg(lireWebm(octets));
    if (commencePar(octets, 0, OGGS)) return enOgg(lireOgg(octets));
    if (commencePar(octets, 4, [0x66, 0x74, 0x79, 0x70])) {
      const secondes = dureeMp4(octets);
      return secondes === null ? null : { secondes, octets, type: "audio/mp4", extension: "m4a" };
    }
    return null;
  } catch {
    /* Une lecture hors du fichier (un DataView trop court) : il est tronqué ou piégé */
    return null;
  }
}

/** La durée du vocal, en secondes (lireAudio) ; null s’il n’est pas dans un format d’enregistreur lisible. */
export const dureeAudio = (octets: Uint8Array): number | null => lireAudio(octets)?.secondes ?? null;

const commencePar = (o: Uint8Array, a: number, signature: number[]) => o.length >= a + signature.length && signature.every((b, i) => o[a + i] === b);

/**
 * L’octet `i` du fichier, lu comme un DataView le lirait : hors du fichier, une RangeError, que lireAudio rattrape (il
 * est tronqué ou piégé). Jamais undefined, qu’un calcul changerait en silence en 0 (un masque, un décalage) ou en NaN.
 */
function octet(o: Uint8Array, i: number): number {
  const v = o[i];
  if (v === undefined) throw new RangeError("lecture hors du fichier");
  return v;
}

/* ———— Opus : la durée d’un paquet, lue dans son premier octet (RFC 6716, 3.1) ———— */

/* La durée d’une trame selon la configuration (les 5 bits hauts du premier octet), en millisecondes */
const TRAME_SILK = [10, 20, 40, 60];
const TRAME_HYBRIDE = [10, 20];
const TRAME_CELT = [2.5, 5, 10, 20];
/** Un paquet Opus dure au plus 120 ms. */
const PAQUET_OPUS_MAX_MS = 120;
/** Une trame Opus pèse au plus 1 275 octets (RFC 6716, 3.4). */
const TRAME_OPUS_MAX_OCTETS = 1275;

/**
 * La durée d’un paquet Opus, en millisecondes ; null s’il n’en est pas un, ou s’il est plus lourd que ses trames ne
 * peuvent l’être (1 275 octets chacune, et leurs longueurs).
 */
export function dureeOpus(paquet: Uint8Array): number | null {
  const toc = paquet[0];
  const suivant = paquet[1];
  if (toc === undefined) return null;
  const config = toc >> 3;
  /* Des index masqués (sur 2 bits, sur 1) : toujours dans leur table */
  const trame = config < 12 ? TRAME_SILK[config & 3]! : config < 16 ? TRAME_HYBRIDE[config & 1]! : TRAME_CELT[config & 3]!;
  const code = toc & 3;
  /* 0 : une trame ; 1 et 2 : deux ; 3 : leur nombre est dans l’octet suivant */
  const trames = code === 0 ? 1 : code < 3 ? 2 : suivant !== undefined ? suivant & 0x3f : 0;
  const ms = trames * trame;
  if (trames === 0 || ms > PAQUET_OPUS_MAX_MS) return null;
  return paquet.length <= 2 + trames * (TRAME_OPUS_MAX_OCTETS + 2) ? ms : null;
}

/** Ce qu’un vocal en Opus donne à réécrire : son en-tête (OpusHead) et ses paquets de son, avec leur durée totale. */
type Opus = { canaux: number; preskip: number; frequence: number; paquets: Uint8Array[]; ms: number };

/**
 * L’en-tête d’un flux Opus (OpusHead, RFC 7845, 5.1), vérifié : version 0.x, une ou deux voies, sans table de voies
 * (famille 0, celle des enregistreurs). null sinon.
 */
function lireOpusHead(p: Uint8Array): Pick<Opus, "canaux" | "preskip" | "frequence"> | null {
  if (p.length < 19 || !commencePar(p, 0, ENTETE_OPUS) || octet(p, 8) === 0 || octet(p, 8) > 15) return null;
  const canaux = octet(p, 9);
  if (canaux < 1 || canaux > 2 || octet(p, 18) !== 0) return null;
  const vue = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return { canaux, preskip: vue.getUint16(10, true), frequence: vue.getUint32(12, true) };
}

/** Ajoute un paquet de son : null s’il n’est pas de l’Opus. */
function ajouterPaquet(opus: Opus, paquet: Uint8Array): boolean {
  const d = dureeOpus(paquet);
  if (d === null) return false;
  opus.paquets.push(paquet);
  opus.ms += d;
  return true;
}

const enOgg = (opus: Opus | null): AudioLu | null =>
  opus && opus.paquets.length ? { secondes: opus.ms / 1000, octets: ecrireOggOpus(opus), type: "audio/ogg", extension: "ogg" } : null;

/* ———— WebM (Matroska, EBML) ———— */

const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const CLUSTER = 0x1f43b675;
const GROUPE_DE_BLOCS = 0xa0;
const PISTES = 0x1654ae6b;
const PISTE = 0xae;
const NUMERO_DE_PISTE = 0xd7;
const CODEC = 0x86;
const CODEC_PRIVE = 0x63a2;
const BLOC_SIMPLE = 0xa3;
const BLOC = 0xa1;
const VIDE = 0xec;
const CRC32 = 0xbf;

/*
 * Ce que chaque niveau peut contenir. Un parent de taille connue saute un enfant inconnu d’après sa taille (comme un
 * démultiplexeur), jamais au-delà de sa propre fin ; un parent de taille inconnue (en direct : le segment, le cluster)
 * se ferme sur le premier élément qui n’est pas l’un de ses enfants. Un cluster ne contient que ses blocs et leur temps.
 */
const ENFANTS: ReadonlyMap<number | null, ReadonlySet<number>> = new Map([
  [null, new Set([EBML, SEGMENT, VIDE])],
  [SEGMENT, new Set([0x114d9b74, 0x1549a966, PISTES, CLUSTER, 0x1c53bb6b, 0x1254c367, 0x1043a770, 0x1941a469, VIDE, CRC32])],
  [CLUSTER, new Set([0xe7, BLOC_SIMPLE, GROUPE_DE_BLOCS, 0xa7, 0xab])],
]);
/* Les éléments où l’on descend (leurs enfants sont lus à la suite) ; seuls le segment et le cluster peuvent être de taille inconnue */
const DESCENDRE = new Set([SEGMENT, CLUSTER, GROUPE_DE_BLOCS, PISTES, PISTE]);
const TAILLE_INCONNUE_PERMISE = new Set([SEGMENT, CLUSTER]);

/** Un nombre de taille variable d’EBML : sa valeur (sans le bit de longueur) et sa longueur ; `inconnue` : tous ses bits à 1. */
function vint(o: Uint8Array, a: number, garderLeBit: boolean): { valeur: number; longueur: number; inconnue: boolean } | null {
  const premier = o[a];
  if (premier === undefined || premier === 0) return null;
  const longueur = Math.clz32(premier) - 23;
  if (longueur > 8 || a + longueur > o.length) return null;
  let valeur = garderLeBit ? premier : premier & (0xff >> longueur);
  let unsLes = (premier & (0xff >> longueur)) === 0xff >> longueur;
  for (let i = 1; i < longueur; i++) {
    const b = octet(o, a + i);
    valeur = valeur * 256 + b;
    unsLes &&= b === 0xff;
  }
  return { valeur, longueur, inconnue: !garderLeBit && unsLes };
}

/**
 * Les paquets Opus d’un WebM, lus en suivant l’arbre de ses éléments : chaque enfant tient dans son parent, ou le
 * fichier est illisible. Le dernier élément coupé (l’enregistrement arrêté en route) s’arrête là : ce qui précède compte,
 * et lui ne part pas (seuls les paquets comptés sont réécrits).
 */
function lireWebm(o: Uint8Array): Opus | null {
  /*
   * Les parents ouverts : leur identifiant, leur fin (null : taille inconnue, jusqu’au premier élément qui n’est pas l’un
   * de leurs enfants) et s’ils sont coupés par la fin du fichier
   */
  const parents: { id: number; fin: number | null; coupe?: boolean }[] = [];
  let pistes = 0;
  let numero: number | null = null;
  let codec = "";
  let entete: Pick<Opus, "canaux" | "preskip" | "frequence"> | null = null;
  const blocs: { piste: number; paquet: Uint8Array }[] = [];
  for (let a = 0; ;) {
    while (parents.length && parents.at(-1)!.fin === a) parents.pop();
    if (a >= o.length) break;
    const id = vint(o, a, true);
    const taille = id && vint(o, a + id.longueur, false);
    if (!id || !taille || id.longueur > 4) {
      /* Un en-tête coupé par la fin du fichier (12 octets au plus) : ce qui précède compte */
      if (a + 12 > o.length) break;
      return null;
    }
    /* Un parent de taille inconnue se ferme sur un élément qui n’est pas l’un de ses enfants */
    while (parents.length && parents.at(-1)!.fin === null && !ENFANTS.get(parents.at(-1)!.id)!.has(id.valeur)) parents.pop();
    const parent = parents.at(-1);
    /* Au premier niveau, et dans un cluster : rien d’autre que ce qui y est attendu */
    if ((!parent || parent.id === CLUSTER) && !ENFANTS.get(parent?.id ?? null)!.has(id.valeur)) return null;
    const debut = a + id.longueur + taille.longueur;
    if (taille.inconnue) {
      if (!TAILLE_INCONNUE_PERMISE.has(id.valeur) || (parent && parent.fin !== null)) return null;
      parents.push({ id: id.valeur, fin: null });
      a = debut;
      continue;
    }
    const fin = debut + taille.valeur;
    const coupe = fin > o.length;
    /* Un enfant qui déborde de son parent : un démultiplexeur se recalerait dedans, le fichier est illisible */
    if (parent?.fin != null && fin > parent.fin && !(coupe && parent.coupe)) return null;
    if (DESCENDRE.has(id.valeur)) {
      if (id.valeur === PISTE) pistes++;
      parents.push({ id: id.valeur, fin: Math.min(fin, o.length), coupe });
      a = debut;
      continue;
    }
    /* Le dernier élément coupé par la fin du fichier (l’enregistrement arrêté en route) : ce qui précède compte, lui ne part pas */
    if (coupe) break;
    if (parent?.id === PISTE) {
      if (id.valeur === CODEC) codec = new TextDecoder().decode(o.subarray(debut, fin)).replace(/\0+$/, "");
      else if (id.valeur === CODEC_PRIVE) entete = lireOpusHead(o.subarray(debut, fin));
      else if (id.valeur === NUMERO_DE_PISTE) numero = entier(o, debut, fin);
    } else if ((id.valeur === BLOC_SIMPLE && parent?.id === CLUSTER) || (id.valeur === BLOC && parent?.id === GROUPE_DE_BLOCS)) {
      const piste = vint(o, debut, false);
      if (!piste) return null;
      /* Le numéro de piste, le temps du bloc (2 octets) puis ses drapeaux : des trames groupées (lacing) ne sont pas d’un enregistreur */
      const drapeaux = o[debut + piste.longueur + 2];
      if (drapeaux === undefined || drapeaux & 0x06) return null;
      blocs.push({ piste: piste.valeur, paquet: o.subarray(debut + piste.longueur + 3, fin) });
    }
    a = fin;
  }
  /* Une seule piste, en Opus, avec son en-tête ; chaque bloc est de cette piste */
  if (pistes !== 1 || codec !== "A_OPUS" || !entete) return null;
  const opus: Opus = { ...entete, paquets: [], ms: 0 };
  for (const b of blocs) if ((numero !== null && b.piste !== numero) || !ajouterPaquet(opus, b.paquet)) return null;
  return opus;
}

/** Un entier non signé d’EBML (1 à 8 octets). */
function entier(o: Uint8Array, debut: number, fin: number): number {
  let v = 0;
  for (let i = debut; i < fin; i++) v = v * 256 + octet(o, i);
  return v;
}

/* ———— Ogg (Opus) ———— */

const OGGS = [0x4f, 0x67, 0x67, 0x53];
const ENTETE_OPUS = [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64];
const TAGS_OPUS = [0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73];
/** Le plus gros paquet qu’on assemble : un paquet Opus de 120 ms (48 trames de 1 275 octets), ou les étiquettes (OpusTags). */
const PAQUET_OGG_MAX_OCTETS = 64 * 1024;

/* Le CRC des pages Ogg : polynôme 0x04c11db7, sans réflexion, de zéro (RFC 3533, 6) */
const TABLE_CRC = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n << 24;
  for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1;
  return c >>> 0;
});
function crcOgg(page: Uint8Array): number {
  let crc = 0;
  /* Un index sur 8 bits : la table en a 256 */
  for (let i = 0; i < page.length; i++) crc = ((crc << 8) ^ TABLE_CRC[((crc >>> 24) ^ (i >= 22 && i < 26 ? 0 : octet(page, i))) & 0xff]!) >>> 0;
  return crc;
}

/**
 * Les paquets d’un Ogg Opus, page après page. Chaque page est vérifiée (son CRC, son numéro qui suit le précédent, un
 * seul flux, la suite d’un paquet là où un paquet est ouvert) : une page fausse, coupée, ou un paquet resté ouvert à la
 * fin, et le fichier est illisible. Un démultiplexeur qui saute une page fausse se recalerait sur des pages cachées.
 */
function lireOgg(o: Uint8Array): Opus | null {
  const vue = new DataView(o.buffer, o.byteOffset, o.byteLength);
  let serie: number | null = null;
  let numero = 0;
  let fini = false;
  let opus: Opus | null = null;
  let paquets = 0;
  /* Le paquet en cours : il peut courir sur plusieurs pages */
  let morceaux: Uint8Array[] = [];
  let longueur = 0;
  for (let a = 0; a < o.length;) {
    if (fini || !commencePar(o, a, OGGS) || a + 27 > o.length || o[a + 4] !== 0) return null;
    const type = octet(o, a + 5);
    const s = vue.getUint32(a + 14, true);
    /* Un seul flux, des pages qui se suivent, la première marquée comme telle */
    if ((serie !== null && s !== serie) || vue.getUint32(a + 18, true) !== numero || !!(type & 0x02) !== (numero === 0)) return null;
    serie = s;
    numero++;
    const segments = octet(o, a + 26);
    const table = a + 27;
    let donnees = table + segments;
    /* La table des segments, coupée par la fin du fichier : illisible */
    if (donnees > o.length) return null;
    let bout = donnees;
    for (let i = 0; i < segments; i++) bout += octet(o, table + i);
    if (bout > o.length || vue.getUint32(a + 22, true) !== crcOgg(o.subarray(a, bout))) return null;
    /* La suite d’un paquet ouvert, et elle seule, porte le drapeau « suite » */
    if (!!(type & 0x01) !== longueur > 0) return null;
    fini = !!(type & 0x04);
    for (let i = 0; i < segments; i++) {
      const t = octet(o, table + i);
      morceaux.push(o.subarray(donnees, donnees + t));
      longueur += t;
      donnees += t;
      if (longueur > PAQUET_OGG_MAX_OCTETS) return null;
      if (t === 255) continue;
      /* Le paquet est complet : d’abord les deux en-têtes d’Opus, puis le son */
      const p = morceaux.length === 1 ? morceaux[0]! : concatener(morceaux);
      if (paquets === 0) {
        const entete = lireOpusHead(p);
        if (!entete) return null;
        opus = { ...entete, paquets: [], ms: 0 };
      } else if (paquets === 1) {
        if (!commencePar(p, 0, TAGS_OPUS)) return null;
      } else if (!ajouterPaquet(opus!, p)) return null;
      paquets++;
      morceaux = [];
      longueur = 0;
    }
    a = bout;
  }
  return longueur === 0 ? opus : null;
}

function concatener(morceaux: Uint8Array[]): Uint8Array {
  const tout = new Uint8Array(morceaux.reduce((n, m) => n + m.length, 0));
  let a = 0;
  for (const m of morceaux) {
    tout.set(m, a);
    a += m.length;
  }
  return tout;
}

/* ———— Ogg Opus, réécrit : ce qui part à la transcription ———— */

/* Le numéro du flux réécrit (« BLSH ») ; les paquets de son par page */
const SERIE_REECRITE = 0x424c5348;
const PAQUETS_PAR_PAGE = 50;

/**
 * Le vocal réécrit en Ogg Opus (RFC 7845) : son en-tête refait, des étiquettes vides, puis ses seuls paquets comptés, un
 * paquet n’étant jamais coupé entre deux pages. La position de chaque page suit la durée des paquets (48 kHz).
 */
function ecrireOggOpus({ canaux, preskip, frequence, paquets }: Pick<Opus, "canaux" | "preskip" | "frequence" | "paquets">): Uint8Array {
  const pages: Uint8Array[] = [];
  let numero = 0;
  const page = (contenu: Uint8Array[], position: number, type: number) => {
    const lacets = contenu.flatMap((p) => [...Array<number>(Math.floor(p.length / 255)).fill(255), p.length % 255]);
    const taille = contenu.reduce((n, p) => n + p.length, 0);
    const o = new Uint8Array(27 + lacets.length + taille);
    const vue = new DataView(o.buffer);
    o.set(OGGS);
    o[5] = type;
    vue.setBigUint64(6, BigInt(position), true);
    vue.setUint32(14, SERIE_REECRITE, true);
    vue.setUint32(18, numero++, true);
    o[26] = lacets.length;
    o.set(lacets, 27);
    let a = 27 + lacets.length;
    for (const p of contenu) {
      o.set(p, a);
      a += p.length;
    }
    vue.setUint32(22, crcOgg(o), true);
    pages.push(o);
  };
  const tete = new Uint8Array(19);
  const vueTete = new DataView(tete.buffer);
  tete.set(ENTETE_OPUS);
  tete[8] = 1;
  tete[9] = canaux;
  vueTete.setUint16(10, preskip, true);
  vueTete.setUint32(12, frequence, true);
  page([tete], 0, 0x02);
  const vendeur = new TextEncoder().encode("BLUSH");
  const tags = new Uint8Array(8 + 4 + vendeur.length + 4);
  tags.set(TAGS_OPUS);
  new DataView(tags.buffer).setUint32(8, vendeur.length, true);
  tags.set(vendeur, 12);
  page([tags], 0, 0);
  /* Des pages de PAQUETS_PAR_PAGE paquets au plus, et de 255 longueurs (lacets) au plus : un paquet n’est jamais coupé */
  let position = preskip;
  let lot: Uint8Array[] = [];
  let lacets = 0;
  paquets.forEach((p, i) => {
    const siens = Math.floor(p.length / 255) + 1;
    if (lot.length && (lot.length === PAQUETS_PAR_PAGE || lacets + siens > 255)) {
      page(lot, position, 0);
      lot = [];
      lacets = 0;
    }
    lot.push(p);
    lacets += siens;
    position += dureeOpus(p)! * 48;
    if (i === paquets.length - 1) page(lot, position, 0x04);
  });
  return concatener(pages);
}

/* ———— MP4 (AAC) ———— */

/* Les boîtes où l’on descend : celles qui ne contiennent que d’autres boîtes */
const CONTENEURS = new Set(["moov", "trak", "mdia", "minf", "stbl", "moof", "traf", "edts", "mvex", "mfra"]);
/** Le premier niveau d’un MP4 d’enregistreur : rien d’autre (ni sidx, ni uuid). */
const PREMIER_NIVEAU = new Set(["ftyp", "moov", "moof", "mdat", "mfra", "free", "skip", "wide"]);
/* Les boîtes qui portent la table des trames : coupées, le fichier est illisible */
const TABLES = new Set(["stsd", "stsz", "stz2", "trun", "tfhd", "trex", "elst", "tfra"]);
/** Une trame AAC rend 1 024 échantillons (960 pour une variante rare : compter 1 024 ne sous-estime jamais). */
const ECHANTILLONS_PAR_TRAME = 1024;
/** Une trame AAC pèse au plus 6 144 bits par canal (ISO/IEC 14496-3, 4.5.3.1) : 768 octets. */
const TRAME_AAC_MAX_OCTETS = 768;
/* Les fréquences d’échantillonnage d’AAC, par leur index dans l’AudioSpecificConfig */
const FREQUENCES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
/** En dessous, ce n’est pas un vocal (et la durée calculée n’aurait pas de sens). */
const FREQUENCE_MIN = 7350;
/** Le type d’objet d’un DecoderConfigDescriptor pour l’audio MPEG-4 (ISO/IEC 14496-1, 7.2.6.6). */
const AUDIO_MPEG4 = 0x40;
/** Les types d’objet audio d’AAC : LC (2), SBR (5, HE-AAC), PS (29, HE-AAC v2). */
const AOT_AAC = new Set([2, 5, 29]);

/** Des boîtes plus imbriquées que moov > trak > mdia > minf > stbl (ou moof > traf) : piégé. */
const PROFONDEUR_MAX = 6;

const type4 = (o: Uint8Array, a: number) => String.fromCharCode(octet(o, a), octet(o, a + 1), octet(o, a + 2), octet(o, a + 3));

function dureeMp4(o: Uint8Array): number | null {
  const vue = new DataView(o.buffer, o.byteOffset, o.byteLength);
  let trames = 0;
  let entrees = 0;
  let config: Asc | null = null;
  /* Les tailles des échantillons, vérifiées une fois la piste connue (sa fin, ses voies) ; celles par défaut des fragments */
  const tailles: number[] = [];
  let parDefautTrex: number | null = null;
  let parDefautTfhd: number | null = null;
  const fragments = new Set<number>();
  const pointes: number[] = [];
  const lire = (debut: number, fin: number, profondeur: number): boolean => {
    if (profondeur > PROFONDEUR_MAX) return false;
    for (let a = debut; a < fin;) {
      if (a + 8 > fin) return false;
      let taille = vue.getUint32(a);
      const type = type4(o, a + 4);
      let entete = 8;
      if (taille === 1) {
        if (a + 16 > fin) return false;
        taille = Number(vue.getBigUint64(a + 8));
        entete = 16;
      } else if (taille === 0) {
        /* « Jusqu’à la fin du fichier » : au premier niveau seulement */
        if (profondeur) return false;
        taille = fin - a;
      }
      if (taille < entete) return false;
      if (!profondeur && !PREMIER_NIVEAU.has(type)) return false;
      const bout = a + taille;
      /* Une boîte qui déborde : seul un mdat coupé, le dernier du fichier, laisse compter ce qui précède */
      if (bout > fin) return !profondeur && type === "mdat";
      const corps = a + entete;
      if (!profondeur && type === "moof") fragments.add(a);
      if (TABLES.has(type) && !lireTable(type, corps, bout)) return false;
      if (CONTENEURS.has(type) && !lire(corps, bout, profondeur + 1)) return false;
      a = bout;
    }
    return true;
  };
  const lireTable = (type: string, corps: number, bout: number): boolean => {
    const drapeaux = vue.getUint32(corps) & 0xffffff;
    if (type === "stsd") {
      /* Une seule description de piste, en AAC (mp4a) */
      if (vue.getUint32(corps + 4) !== 1 || type4(o, corps + 12) !== "mp4a") return false;
      entrees++;
      config = configMp4a(o, vue, corps + 8, Math.min(bout, corps + 8 + vue.getUint32(corps + 8)));
      return config !== null;
    }
    if (type === "stz2") return false;
    if (type === "stsz") {
      /* La taille commune des trames, ou celle de chacune ; puis leur nombre */
      const commune = vue.getUint32(corps + 4);
      const n = vue.getUint32(corps + 8);
      if (!commune && corps + 12 + 4 * n > bout) return false;
      for (let i = 0; i < n && !commune; i++) tailles.push(vue.getUint32(corps + 12 + 4 * i));
      if (commune && n) tailles.push(commune);
      trames += n;
      return true;
    }
    if (type === "elst") {
      /* Une liste d’édition rejoue des morceaux de la piste : une entrée au plus */
      return vue.getUint32(corps + 4) <= 1;
    }
    if (type === "trex") {
      parDefautTrex = vue.getUint32(corps + 16);
      return true;
    }
    if (type === "tfhd") {
      /* Après l’identifiant de la piste : l’adresse de base (0x01), la description (0x02), la durée (0x08), puis la taille par défaut (0x10) */
      let a = corps + 8;
      for (const [bit, octets] of [
        [0x01, 8],
        [0x02, 4],
        [0x08, 4],
      ] as const)
        if (drapeaux & bit) a += octets;
      parDefautTfhd = drapeaux & 0x10 ? vue.getUint32(a) : null;
      return true;
    }
    if (type === "trun") {
      const n = vue.getUint32(corps + 4);
      let a = corps + 8;
      if (drapeaux & 0x01) a += 4;
      if (drapeaux & 0x04) a += 4;
      /* Les champs de chaque échantillon : durée (0x100), taille (0x200), drapeaux (0x400), décalage (0x800) */
      const champs = [0x100, 0x200, 0x400, 0x800].filter((b) => drapeaux & b).length;
      if (a + 4 * champs * n > bout) return false;
      const avantLaTaille = drapeaux & 0x100 ? 4 : 0;
      if (drapeaux & 0x200) for (let i = 0; i < n; i++) tailles.push(vue.getUint32(a + 4 * champs * i + avantLaTaille));
      else {
        const parDefaut = parDefautTfhd ?? parDefautTrex;
        if (parDefaut === null) return false;
        if (n) tailles.push(parDefaut);
      }
      trames += n;
      return true;
    }
    if (type === "tfra") {
      /* L’index des fragments : chaque entrée pointe un moof, lu à sa place (rien de caché ailleurs) */
      const version = octet(o, corps);
      const longueurs = vue.getUint32(corps + 8);
      const n = vue.getUint32(corps + 12);
      const entree = (version === 1 ? 16 : 8) + ((longueurs >> 4) & 3) + ((longueurs >> 2) & 3) + (longueurs & 3) + 3;
      if (corps + 16 + entree * n > bout) return false;
      for (let i = 0; i < n; i++) {
        const a = corps + 16 + entree * i + (version === 1 ? 8 : 4);
        pointes.push(version === 1 ? Number(vue.getBigUint64(a)) : vue.getUint32(a));
      }
      return true;
    }
    return true;
  };
  if (!lire(0, o.length, 0) || entrees !== 1 || config === null) return null;
  const { frequence, canaux } = config as Asc;
  if (tailles.some((t) => t > TRAME_AAC_MAX_OCTETS * canaux) || pointes.some((p) => !fragments.has(p))) return null;
  return (trames * ECHANTILLONS_PAR_TRAME) / frequence;
}

/** Ce qu’une entrée mp4a dit au décodeur : sa fréquence d’échantillonnage et ses voies. */
type Asc = { frequence: number; canaux: number };

/**
 * L’entrée mp4a : la fréquence d’échantillonnage la plus basse de celle qu’elle annonce et de celle de son
 * AudioSpecificConfig (dans esds), celle que suit un décodeur. La plus basse donne la durée la plus longue : un fichier
 * qui se contredit ne passe pas pour plus court qu’il n’est. Les voies sont celles de l’AudioSpecificConfig ; sans esds
 * en AAC, illisible.
 */
function configMp4a(o: Uint8Array, vue: DataView, debut: number, fin: number): Asc | null {
  /* L’entrée : sa taille et son type (8), 6 réservés, l’index des données (2), 8 réservés, canaux, bits, 4 réservés, puis la fréquence en 16.16 */
  const version = vue.getUint16(debut + 16);
  /* Une entrée QuickTime de version 1 ou 2 allonge l’entrée (16 ou 36 octets) ; la version 2 écrit sa fréquence ailleurs */
  const annoncee = version === 2 ? 0 : vue.getUint32(debut + 32) >>> 16;
  let asc: Asc | null = null;
  for (let a = debut + 36 + (version === 1 ? 16 : version === 2 ? 36 : 0); a + 8 <= fin;) {
    const taille = vue.getUint32(a);
    if (taille < 8) break;
    if (type4(o, a + 4) === "esds") asc = lireEsds(o, a + 12, Math.min(fin, a + taille));
    a += taille;
  }
  if (!asc) return null;
  const frequence = Math.min(...[annoncee, asc.frequence].filter((x) => x > 0));
  return Number.isFinite(frequence) && frequence >= FREQUENCE_MIN ? { frequence, canaux: asc.canaux } : null;
}

/**
 * L’AudioSpecificConfig, au bout des descripteurs d’esds (ES, puis DecoderConfig, puis DecoderSpecificInfo) : de l’audio
 * MPEG-4 (0x40), en AAC (AOT 2, 5 ou 29), en une ou deux voies. null sinon.
 */
function lireEsds(o: Uint8Array, debut: number, fin: number): Asc | null {
  let a = debut;
  const descripteur = (): { tag: number; taille: number } | null => {
    if (a >= fin) return null;
    const tag = octet(o, a++);
    let taille = 0;
    for (let i = 0; i < 4 && a < fin; i++) {
      const b = octet(o, a++);
      taille = (taille << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return { tag, taille };
  };
  const es = descripteur();
  if (es?.tag !== 3) return null;
  /* L’ES_Descriptor : son identifiant (2), ses drapeaux, puis ce qu’ils annoncent */
  const drapeaux = octet(o, a + 2);
  a += 3;
  if (drapeaux & 0x80) a += 2;
  if (drapeaux & 0x40) a += 1 + octet(o, a);
  if (drapeaux & 0x20) a += 2;
  const dc = descripteur();
  if (dc?.tag !== 4 || octet(o, a) !== AUDIO_MPEG4) return null;
  /* Le DecoderConfigDescriptor : 13 octets avant ses descripteurs */
  a += 13;
  const dsi = descripteur();
  if (dsi?.tag !== 5 || a + 2 > fin) return null;
  /* L’AudioSpecificConfig : le type d’objet (5 bits, 6 de plus s’il vaut 31), l’index de la fréquence (4 bits, 24 de plus s’il vaut 15), les voies (4 bits) */
  let bit = a * 8;
  const bits = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++, bit++) v = (v << 1) | ((octet(o, bit >> 3) >> (7 - (bit & 7))) & 1);
    return v;
  };
  let aot = bits(5);
  if (aot === 31) aot = 32 + bits(6);
  if (!AOT_AAC.has(aot)) return null;
  const index = bits(4);
  const frequence = index === 15 ? bits(24) : (FREQUENCES[index] ?? 0);
  const canaux = bits(4);
  if (bit > fin * 8 || canaux < 1 || canaux > 2) return null;
  return { frequence, canaux };
}
