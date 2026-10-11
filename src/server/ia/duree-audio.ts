/*
 * La durée d’un vocal reçu par le chat (S-15), comptée trame par trame, sans rien décoder : ce que le service de
 * transcription entendra (et facture), pas ce que le fichier annonce. Un en-tête ment sans peine (« 5 s » devant une
 * heure de son très compressé), et l’enregistreur d’un navigateur n’en écrit souvent pas (le WebM de Chromium n’a pas
 * de durée) : on additionne donc la durée de chaque trame, lue dans la trame elle-même (Opus) ou comptée dans la table
 * des trames (AAC).
 *
 * Les formats des enregistreurs des navigateurs, et eux seuls :
 *   - WebM (Matroska) en Opus : Chromium, Firefox récent ;
 *   - Ogg en Opus : Firefox ;
 *   - MP4 en AAC, d’un bloc ou en fragments : Safari (et l’appli installée sur l’iPhone).
 * Le format se lit dans les premiers octets, jamais dans le type que le navigateur annonce. Tout le reste (un autre
 * codec, plusieurs pistes, des trames groupées, un fichier tronqué au milieu d’une trame) est illisible : null.
 * Module pur, sans server-only : tests/unit le lit sans base.
 */

/** La durée du vocal, en secondes ; null s’il n’est pas dans un format d’enregistreur lisible. */
export function dureeAudio(octets: Uint8Array): number | null {
  try {
    if (commencePar(octets, 0, [0x1a, 0x45, 0xdf, 0xa3])) return dureeWebm(octets);
    if (commencePar(octets, 0, [0x4f, 0x67, 0x67, 0x53])) return dureeOgg(octets);
    if (commencePar(octets, 4, [0x66, 0x74, 0x79, 0x70])) return dureeMp4(octets);
    return null;
  } catch {
    /* Une lecture hors du fichier (un DataView trop court) : il est tronqué ou piégé */
    return null;
  }
}

const commencePar = (o: Uint8Array, a: number, signature: number[]) => o.length >= a + signature.length && signature.every((b, i) => o[a + i] === b);

/* ———— Opus : la durée d’un paquet, lue dans son premier octet (RFC 6716, 3.1) ———— */

/* La durée d’une trame selon la configuration (les 5 bits hauts du premier octet), en millisecondes */
const TRAME_SILK = [10, 20, 40, 60];
const TRAME_HYBRIDE = [10, 20];
const TRAME_CELT = [2.5, 5, 10, 20];
/** Un paquet Opus dure au plus 120 ms. */
const PAQUET_OPUS_MAX_MS = 120;

/** La durée d’un paquet Opus, en millisecondes ; null s’il n’en est pas un. */
export function dureeOpus(paquet: Uint8Array): number | null {
  if (!paquet.length) return null;
  const toc = paquet[0];
  const config = toc >> 3;
  const trame = config < 12 ? TRAME_SILK[config & 3] : config < 16 ? TRAME_HYBRIDE[config & 1] : TRAME_CELT[config & 3];
  const code = toc & 3;
  /* 0 : une trame ; 1 et 2 : deux ; 3 : leur nombre est dans l’octet suivant */
  const trames = code === 0 ? 1 : code < 3 ? 2 : paquet.length > 1 ? paquet[1] & 0x3f : 0;
  const ms = trames * trame;
  return trames > 0 && ms <= PAQUET_OPUS_MAX_MS ? ms : null;
}

/* ———— WebM (Matroska, EBML) ———— */

/* Les éléments où l’on descend (leurs enfants sont lus à la suite) : les autres sont sautés d’après leur taille */
const SEGMENT = 0x18538067;
const CLUSTER = 0x1f43b675;
const GROUPE_DE_BLOCS = 0xa0;
const PISTES = 0x1654ae6b;
const PISTE = 0xae;
const DESCENDRE = new Set([SEGMENT, CLUSTER, GROUPE_DE_BLOCS, PISTES, PISTE]);
const CODEC = 0x86;
const BLOC_SIMPLE = 0xa3;
const BLOC = 0xa1;

/** Un nombre de taille variable d’EBML : sa valeur (sans le bit de longueur) et sa longueur ; `inconnue` : tous ses bits à 1. */
function vint(o: Uint8Array, a: number, garderLeBit: boolean): { valeur: number; longueur: number; inconnue: boolean } | null {
  const premier = o[a];
  if (premier === undefined || premier === 0) return null;
  const longueur = Math.clz32(premier) - 23;
  if (longueur > 8 || a + longueur > o.length) return null;
  let valeur = garderLeBit ? premier : premier & (0xff >> longueur);
  let unsLes = (premier & (0xff >> longueur)) === 0xff >> longueur;
  for (let i = 1; i < longueur; i++) {
    valeur = valeur * 256 + o[a + i];
    unsLes &&= o[a + i] === 0xff;
  }
  return { valeur, longueur, inconnue: !garderLeBit && unsLes };
}

function dureeWebm(o: Uint8Array): number | null {
  let ms = 0;
  let codecs = 0;
  for (let a = 0; a < o.length; ) {
    const id = vint(o, a, true);
    if (!id || id.longueur > 4) return null;
    const taille = vint(o, a + id.longueur, false);
    if (!taille) return null;
    const debut = a + id.longueur + taille.longueur;
    /* Un segment ou un groupe en direct (l’enregistreur ne connaît pas sa taille) : ses enfants suivent, on y descend aussi */
    if (DESCENDRE.has(id.valeur)) {
      a = debut;
      continue;
    }
    if (taille.inconnue) return null;
    const fin = debut + taille.valeur;
    /* Le dernier élément coupé (l’enregistrement arrêté en route) : ce qui précède compte */
    if (fin > o.length) break;
    if (id.valeur === CODEC) {
      if (new TextDecoder().decode(o.subarray(debut, fin)).replace(/\0+$/, "") !== "A_OPUS") return null;
      codecs++;
    } else if (id.valeur === BLOC_SIMPLE || id.valeur === BLOC) {
      const piste = vint(o, debut, false);
      if (!piste) return null;
      /* Le numéro de piste, le temps du bloc (2 octets) puis ses drapeaux : des trames groupées (lacing) ne sont pas d’un enregistreur */
      const drapeaux = o[debut + piste.longueur + 2];
      if (drapeaux === undefined || drapeaux & 0x06) return null;
      const paquet = dureeOpus(o.subarray(debut + piste.longueur + 3, fin));
      if (paquet === null) return null;
      ms += paquet;
    }
    a = fin;
  }
  /* Une seule piste, en Opus */
  return codecs === 1 ? ms / 1000 : null;
}

/* ———— Ogg (Opus) ———— */

const ENTETE_OPUS = [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64];
const TAGS_OPUS = [0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73];

function dureeOgg(o: Uint8Array): number | null {
  let ms = 0;
  let paquets = 0;
  let serie: number | null = null;
  /* Le paquet en cours : il peut courir sur plusieurs pages ; ses premiers octets suffisent */
  let debutDuPaquet: number[] = [];
  let longueur = 0;
  const vue = new DataView(o.buffer, o.byteOffset, o.byteLength);
  for (let a = 0; a < o.length; ) {
    if (!commencePar(o, a, [0x4f, 0x67, 0x67, 0x53]) || a + 27 > o.length) return null;
    const s = vue.getUint32(a + 14, true);
    /* Un seul flux */
    if (serie !== null && s !== serie) return null;
    serie = s;
    const segments = o[a + 26];
    const table = a + 27;
    let donnees = table + segments;
    if (donnees > o.length) break;
    for (let i = 0; i < segments; i++) {
      const t = o[table + i];
      if (donnees + t > o.length) return finOgg(ms, paquets);
      for (let k = 0; k < t && debutDuPaquet.length < 8; k++) debutDuPaquet.push(o[donnees + k]);
      longueur += t;
      donnees += t;
      if (t === 255) continue;
      /* Le paquet est complet : d’abord les deux en-têtes d’Opus, puis le son */
      const p = Uint8Array.from(debutDuPaquet);
      if (paquets === 0 && !commencePar(p, 0, ENTETE_OPUS)) return null;
      if (paquets === 1 && !commencePar(p, 0, TAGS_OPUS)) return null;
      if (paquets >= 2 && longueur > 0) {
        const d = dureeOpus(p.subarray(0, Math.min(p.length, longueur)));
        if (d === null) return null;
        ms += d;
      }
      paquets++;
      debutDuPaquet = [];
      longueur = 0;
    }
    a = donnees;
  }
  return finOgg(ms, paquets);
}

const finOgg = (ms: number, paquets: number) => (paquets >= 2 ? ms / 1000 : null);

/* ———— MP4 (AAC) ———— */

/* Les boîtes où l’on descend : celles qui ne contiennent que d’autres boîtes */
const CONTENEURS = new Set(["moov", "trak", "mdia", "minf", "stbl", "moof", "traf"]);
/** Une trame AAC rend 1 024 échantillons (960 pour une variante rare : compter 1 024 ne sous-estime jamais). */
const ECHANTILLONS_PAR_TRAME = 1024;
/* Les fréquences d’échantillonnage d’AAC, par leur index dans l’AudioSpecificConfig */
const FREQUENCES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
/** En dessous, ce n’est pas un vocal (et la durée calculée n’aurait pas de sens). */
const FREQUENCE_MIN = 7350;

/** Des boîtes plus imbriquées que moov > trak > mdia > minf > stbl (ou moof > traf) : piégé. */
const PROFONDEUR_MAX = 6;

const type4 = (o: Uint8Array, a: number) => String.fromCharCode(o[a], o[a + 1], o[a + 2], o[a + 3]);

function dureeMp4(o: Uint8Array): number | null {
  const vue = new DataView(o.buffer, o.byteOffset, o.byteLength);
  let trames = 0;
  let entrees = 0;
  let frequence: number | null = null;
  const lire = (debut: number, fin: number, profondeur = 0): boolean => {
    if (profondeur > PROFONDEUR_MAX) return false;
    for (let a = debut; a + 8 <= fin; ) {
      let taille = vue.getUint32(a);
      const type = type4(o, a + 4);
      let entete = 8;
      if (taille === 1) {
        if (a + 16 > fin) return false;
        taille = Number(vue.getBigUint64(a + 8));
        entete = 16;
      } else if (taille === 0) taille = fin - a;
      if (taille < entete) return false;
      const bout = a + taille;
      /* La dernière boîte coupée (un mdat tronqué, le plus souvent) : ce qui précède compte, sauf si elle porte la table */
      if (bout > fin) return !CONTENEURS.has(type) && type !== "stsd" && type !== "stsz" && type !== "stz2" && type !== "trun";
      const corps = a + entete;
      if (CONTENEURS.has(type)) {
        if (!lire(corps, bout, profondeur + 1)) return false;
      } else if (type === "stsd") {
        /* Une seule description de piste, en AAC (mp4a) */
        if (vue.getUint32(corps + 4) !== 1 || type4(o, corps + 12) !== "mp4a") return false;
        entrees++;
        frequence = frequenceMp4a(o, vue, corps + 8, Math.min(bout, corps + 8 + vue.getUint32(corps + 8)));
        if (frequence === null) return false;
      } else if (type === "stsz" || type === "stz2") {
        /* Après la version et les drapeaux : la taille commune des trames (stsz) ou celle de leurs champs (stz2), puis leur nombre */
        trames += vue.getUint32(corps + 8);
      } else if (type === "trun") {
        trames += vue.getUint32(corps + 4);
      }
      a = bout;
    }
    return true;
  };
  if (!lire(0, o.length) || entrees !== 1 || frequence === null) return null;
  return (trames * ECHANTILLONS_PAR_TRAME) / frequence;
}

/**
 * La fréquence d’échantillonnage d’une entrée mp4a : la plus basse de celle qu’elle annonce et de celle de son
 * AudioSpecificConfig (dans esds), celle que suit un décodeur. La plus basse donne la durée la plus longue : un fichier
 * qui se contredit ne passe pas pour plus court qu’il n’est.
 */
function frequenceMp4a(o: Uint8Array, vue: DataView, debut: number, fin: number): number | null {
  /* L’entrée : sa taille et son type (8), 6 réservés, l’index des données (2), 8 réservés, canaux, bits, 4 réservés, puis la fréquence en 16.16 */
  const annoncee = vue.getUint32(debut + 32) >>> 16;
  let config: number | null = null;
  for (let a = debut + 36; a + 8 <= fin; ) {
    const taille = vue.getUint32(a);
    if (taille < 8) break;
    if (type4(o, a + 4) === "esds") config = frequenceEsds(o, a + 12, Math.min(fin, a + taille));
    a += taille;
  }
  const f = Math.min(...[annoncee, config].filter((x): x is number => !!x));
  return Number.isFinite(f) && f >= FREQUENCE_MIN ? f : null;
}

/** La fréquence de l’AudioSpecificConfig, au bout des descripteurs d’esds (ES, puis DecoderConfig, puis DecoderSpecificInfo). */
function frequenceEsds(o: Uint8Array, debut: number, fin: number): number | null {
  let a = debut;
  const descripteur = (): { tag: number; taille: number } | null => {
    if (a >= fin) return null;
    const tag = o[a++];
    let taille = 0;
    for (let i = 0; i < 4 && a < fin; i++) {
      const b = o[a++];
      taille = (taille << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return { tag, taille };
  };
  const es = descripteur();
  if (es?.tag !== 3) return null;
  /* L’ES_Descriptor : son identifiant (2), ses drapeaux, puis ce qu’ils annoncent */
  const drapeaux = o[a + 2];
  a += 3;
  if (drapeaux & 0x80) a += 2;
  if (drapeaux & 0x40) a += 1 + o[a];
  if (drapeaux & 0x20) a += 2;
  const dc = descripteur();
  if (dc?.tag !== 4) return null;
  /* Le DecoderConfigDescriptor : 13 octets avant ses descripteurs */
  a += 13;
  const dsi = descripteur();
  if (dsi?.tag !== 5 || a + 2 > fin) return null;
  /* L’AudioSpecificConfig : le type d’objet (5 bits, 6 de plus s’il vaut 31), puis l’index de la fréquence (4 bits, 24 de plus s’il vaut 15) */
  let bit = a * 8;
  const bits = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++, bit++) v = (v << 1) | ((o[bit >> 3] >> (7 - (bit & 7))) & 1);
    return v;
  };
  if (bits(5) === 31) bits(6);
  const index = bits(4);
  return index === 15 ? bits(24) : (FREQUENCES[index] ?? null);
}
