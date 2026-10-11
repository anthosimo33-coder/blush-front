import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { texteDit, type LigneScript } from "@/lib/vocal";
import { dureeAudio, dureeOpus, lireAudio } from "@/server/ia/duree-audio";
import { couper, scriptQuiTient } from "@/server/ia/voix";
import { auMoins } from "../aide/listes";

/*
 * Ce que la voix dit (S-13 : la coupe d’un vocal) et ce que le chat entend (S-15 : la durée d’un vocal reçu, comptée
 * trame par trame), sans base ni prestataire.
 *
 * Les vocaux de tests/aide/vocaux sont un la (440 Hz) fait par ffmpeg, aux formats des enregistreurs des navigateurs :
 *   court.webm            3 s, Opus 32 kb/s, en direct comme Chromium (sans durée ni index) : -f webm -live 1
 *   court.ogg             3 s, Opus 32 kb/s, comme Firefox
 *   court.m4a             3 s, AAC 32 kb/s, d’un bloc
 *   court-fragments.mp4   3 s, AAC 32 kb/s, en fragments comme Safari : -movflags frag_keyframe+empty_moov -frag_duration 1000000
 *   long.webm             140 s, Opus 6 kb/s à 8 kHz (le fichier piège de S-15 : très long, très léger), avec sa durée
 * Les fichiers piégés (S-15 : un démultiplexeur se recale là où un lecteur trop simple saute) sont fabriqués ici, à
 * partir d’eux : aucun n’est gardé dans le dépôt.
 */
const vocal = (nom: string) => new Uint8Array(readFileSync(`tests/aide/vocaux/${nom}`));

/** La position d’une suite d’octets dans le fichier (à partir de `depuis`). */
function chercher(o: Uint8Array, motif: number[], depuis = 0): number {
  for (let i = depuis; i + motif.length <= o.length; i++) if (motif.every((b, k) => o[i + k] === b)) return i;
  return -1;
}
const texte = (t: string) => [...new TextEncoder().encode(t)];
const concat = (...parts: Uint8Array[]) => {
  const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((a, p) => (o.set(p, a), a + p.length), 0);
  return o;
};

describe("couper : un vocal coupé à la fin d’une phrase", () => {
  it("un texte assez court part tel quel", () => {
    expect(couper("  Bon. Hugo.  ", 400)).toBe("Bon. Hugo.");
  });

  it("au-delà, il s’arrête à la fin de sa dernière phrase entière", () => {
    const texte = "Elle t’a répondu ok. Mais trois heures après\u00a0! Tu sais ce que ça veut dire\u00a0? Non.";
    const coupe = couper(texte, 60);
    expect(coupe).toBe("Elle t’a répondu ok. Mais trois heures après\u00a0!");
    expect(coupe.length).toBeLessThanOrEqual(60);
  });

  it("une phrase fermée par un guillemet garde son guillemet", () => {
    expect(couper("Elle a écrit «\u00a0ok.\u00a0» Puis plus rien du tout pendant deux jours entiers.", 20)).toBe("Elle a écrit «\u00a0ok.\u00a0»");
  });

  it("sans fin de phrase dans sa première moitié, il s’arrête au dernier mot entier, suivi de « … »", () => {
    const coupe = couper("Ok. alors là franchement elle te fait tourner en bourrique depuis trois semaines", 40);
    expect(coupe).toBe("Ok. alors là franchement elle te fait…");
    expect(coupe.length).toBeLessThanOrEqual(40);
  });

  it("un jeu laissé en fin de texte part, entier ou coupé", () => {
    expect(couper("Alors écoute moi bien [laughs] franchement", 33)).toBe("Alors écoute moi bien…");
    expect(couper("[sighs] Écoute bien ce que je vais te dire [laughs softly] parce que", 50)).toBe("[sighs] Écoute bien ce que je vais te dire…");
  });

  it("ne dépasse jamais la coupe, même sans espace", () => {
    expect(couper("a".repeat(500), 400)).toHaveLength(400);
  });
});

describe("scriptQuiTient : le vocal du rapport coupé ligne à ligne", () => {
  const ligne = (texte: string, jeu: string | null = null): LigneScript => ({ jeu, texte, punch: false, preuve: null });
  const script = [ligne("Bon.", "sighs"), ligne("Hugo, assieds-toi."), ligne("Elle t’a répondu en trois heures.")];

  it("un script qui tient part entier", () => {
    expect(scriptQuiTient(script, 700)).toEqual(script);
  });

  it("sinon, il garde les premières lignes entières : les sous-titres suivent l’audio", () => {
    const max = texteDit(script.slice(0, 2)).texte.length;
    expect(scriptQuiTient(script, max)).toEqual(script.slice(0, 2));
    expect(scriptQuiTient(script, max - 1)).toEqual(script.slice(0, 1));
  });

  it("une première ligne trop longue à elle seule est coupée, son jeu compris dans la coupe", () => {
    const seule = scriptQuiTient([ligne("Écoute. Elle t’a répondu en trois heures, et toi tu cours.", "sighs")], 20)[0]!;
    expect(seule.jeu).toBe("sighs");
    expect(texteDit([seule]).texte.length).toBeLessThanOrEqual(20);
    expect(seule.texte).toBe("Écoute.");
  });
});

describe("dureeAudio : la durée d’un vocal, trame par trame", () => {
  it.each([
    ["court.webm", 3],
    ["court.ogg", 3],
    ["court.m4a", 3],
    ["court-fragments.mp4", 3],
    ["long.webm", 140],
  ])("%s dure %i s", (nom, secondes) => {
    expect(dureeAudio(vocal(nom))).toBeCloseTo(secondes, 0);
  });

  it("ce que le fichier annonce ne compte pas : un WebM de 140 s qui dit durer 5 s en dure 140", () => {
    const o = vocal("long.webm");
    /* L’élément Duration (0x4489), un flottant sur 8 octets */
    const a = chercher(o, [0x44, 0x89, 0x88]);
    expect(a).toBeGreaterThan(0);
    new DataView(o.buffer, o.byteOffset).setFloat64(a + 3, 5_000);
    expect(dureeAudio(o)).toBeCloseTo(140, 0);
  });

  it("un autre codec, des octets au hasard ou des zéros : illisible", () => {
    const o = vocal("court.webm");
    const codec = chercher(o, [...new TextEncoder().encode("A_OPUS")]);
    o.set(new TextEncoder().encode("A_VORB"), codec);
    expect(dureeAudio(o)).toBeNull();
    expect(dureeAudio(new Uint8Array(16))).toBeNull();
    expect(dureeAudio(Uint8Array.from({ length: 4096 }, (_, i) => (i * 7919) % 251))).toBeNull();
    expect(dureeAudio(new TextEncoder().encode("OggS pas un vrai ogg"))).toBeNull();
  });

  it("un enregistrement coupé en route : ce qui précède compte", () => {
    const o = vocal("court.webm");
    const d = dureeAudio(o.subarray(0, Math.floor(o.length / 2)));
    expect(d).toBeGreaterThan(0.5);
    expect(d).toBeLessThan(3);
  });

  it("des boîtes MP4 imbriquées sans fin : illisible, sans dépasser la pile", () => {
    const boite = (type: string, dedans: Uint8Array) => {
      const o = new Uint8Array(8 + dedans.length);
      new DataView(o.buffer).setUint32(0, o.length);
      o.set(new TextEncoder().encode(type), 4);
      o.set(dedans, 8);
      return o;
    };
    let o: Uint8Array = new Uint8Array(0);
    for (let i = 0; i < 5000; i++) o = boite("moov", o);
    const ftyp = boite("ftyp", new TextEncoder().encode("isomiso2"));
    const fichier = new Uint8Array(ftyp.length + o.length);
    fichier.set(ftyp);
    fichier.set(o, ftyp.length);
    expect(dureeAudio(fichier)).toBeNull();
  });
});

describe("lireAudio : ce qui part à la transcription est ce qui a été compté", () => {
  it.each(["court.webm", "court.ogg", "long.webm"])("%s : réécrit en Ogg Opus, il dure ce qui a été mesuré", (nom) => {
    const lu = lireAudio(vocal(nom))!;
    expect(lu.type).toBe("audio/ogg");
    expect(String.fromCharCode(...lu.octets.subarray(0, 4))).toBe("OggS");
    expect(dureeAudio(lu.octets)).toBe(lu.secondes);
  });

  it.each(["court.m4a", "court-fragments.mp4"])("%s : part tel quel", (nom) => {
    const o = vocal(nom);
    expect(lireAudio(o)).toMatchObject({ type: "audio/mp4", octets: o });
  });
});

/* ———— Ogg : chaque page vérifiée ———— */

/** Les pages d’un Ogg : leur début et leur fin. */
function pagesOgg(o: Uint8Array): { debut: number; fin: number }[] {
  const pages = [];
  for (let a = 0; a < o.length; ) {
    const n = o[a + 26]!;
    let fin = a + 27 + n;
    for (let i = 0; i < n; i++) fin += o[a + 27 + i]!;
    pages.push({ debut: a, fin });
    a = fin;
  }
  return pages;
}
/** Le CRC d’une page Ogg (RFC 3533), recalculé après qu’un test l’a changée. */
function signer(o: Uint8Array, { debut, fin }: { debut: number; fin: number }): void {
  let crc = 0;
  for (let i = debut; i < fin; i++) {
    crc ^= (i >= debut + 22 && i < debut + 26 ? 0 : o[i]!) << 24;
    for (let k = 0; k < 8; k++) crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
  }
  new DataView(o.buffer, o.byteOffset).setUint32(debut + 22, crc >>> 0, true);
}

describe("Ogg piégé (S-15) : illisible", () => {
  it("le fichier tel quel se lit, et ses pages se signent comme il les signe", () => {
    const o = vocal("court.ogg");
    const avant = Uint8Array.from(o);
    for (const p of pagesOgg(o)) signer(o, p);
    expect(o).toEqual(avant);
  });

  it("une page au CRC faux (un démultiplexeur la saute et se recale sur ce qu’elle cache)", () => {
    const o = vocal("court.ogg");
    const [, , p] = pagesOgg(o);
    o[p!.fin - 1]! ^= 0xff;
    expect(dureeAudio(o)).toBeNull();
  });

  it("les vraies pages cachées dans une page au CRC faux, qui commence par un paquet Opus valable", () => {
    const o = vocal("court.ogg");
    const pages = pagesOgg(o);
    const [tete, tags, premiere] = auMoins(pages, 3);
    const cachees = o.subarray(premiere.debut);
    /* Une page de 255 segments de 255 octets, dont le corps commence par un octet TOC (20 ms) : les vraies pages dedans */
    const corps = concat(Uint8Array.of(0x08), cachees, new Uint8Array(Math.max(0, 255 * 254 + 254 - cachees.length)));
    const fausse = concat(o.subarray(premiere.debut, premiere.debut + 26), Uint8Array.of(255), new Uint8Array(254).fill(255), Uint8Array.of(254), corps.subarray(0, 255 * 254 + 254));
    fausse[5] = 0;
    const piege = concat(o.subarray(tete.debut, tags.fin), fausse);
    expect(dureeAudio(piege)).toBeNull();
  });

  it("une page manquante (les numéros ne se suivent plus)", () => {
    const o = vocal("court.ogg");
    const pages = pagesOgg(o);
    expect(pages.length).toBeGreaterThan(3);
    expect(dureeAudio(concat(o.subarray(0, pages[2]!.debut), o.subarray(pages[3]!.debut)))).toBeNull();
  });

  it("un paquet resté ouvert à la fin, ou une page coupée", () => {
    const o = vocal("court.ogg");
    const derniere = pagesOgg(o).at(-1)!;
    const n = o[derniere.debut + 26]!;
    expect(o[derniere.debut + 27 + n - 1]).toBeLessThan(255);
    /* Le dernier segment devient 255 octets (le paquet continue), la page grandit d’autant, signée comme il faut */
    const ouvert = concat(o.subarray(0, derniere.fin), new Uint8Array(255 - o[derniere.debut + 27 + n - 1]!));
    ouvert[derniere.debut + 27 + n - 1] = 255;
    signer(ouvert, { debut: derniere.debut, fin: ouvert.length });
    expect(dureeAudio(ouvert)).toBeNull();
    expect(dureeAudio(o.subarray(0, o.length - 10))).toBeNull();
    /* Coupée dans sa table des segments (une page qui en a plusieurs), juste après le premier octet */
    const tableLongue = pagesOgg(o).find((p) => (o[p.debut + 26] ?? 0) > 1);
    if (!tableLongue) throw new Error("court.ogg : une page à plusieurs segments attendue");
    expect(dureeAudio(o.subarray(0, tableLongue.debut + 27 + 1))).toBeNull();
  });
});

/* ———— WebM : chaque élément dans son parent ———— */

describe("WebM piégé (S-15)", () => {
  it("un bloc qui déborde de son cluster (un démultiplexeur se recale dedans) : illisible", () => {
    const o = vocal("court.webm");
    const cluster = chercher(o, [0x1f, 0x43, 0xb6, 0x75]);
    /* La taille du cluster, sur 2 octets (0x40 | les 14 bits) : il s’arrête 40 octets plus tôt, son dernier bloc déborde */
    expect(o[cluster + 4]! & 0xc0).toBe(0x40);
    const taille = (((o[cluster + 4]! & 0x3f) << 8) | o[cluster + 5]!) - 40;
    o.set([0x40 | (taille >> 8), taille & 0xff], cluster + 4);
    expect(dureeAudio(o)).toBeNull();
  });

  it("autre chose qu’un bloc ou son temps dans un cluster (un Void) : illisible", () => {
    const o = vocal("court.webm");
    const bloc = chercher(o, [0xa3], chercher(o, [0x1f, 0x43, 0xb6, 0x75]) + 12);
    expect(bloc).toBeGreaterThan(0);
    o[bloc] = 0xec;
    expect(dureeAudio(o)).toBeNull();
  });

  it("des clusters cachés après le dernier (dans un Void du segment) ne comptent pas, et ne partent pas", () => {
    const o = vocal("court.webm");
    const cluster = chercher(o, [0x1f, 0x43, 0xb6, 0x75]);
    const caches = Array.from({ length: 20 }, () => o.subarray(cluster));
    const dedans = concat(...caches);
    /* Un Void (0xec) de taille sur 4 octets (0x10 puis 3), au niveau du segment, de taille inconnue */
    const taille = Uint8Array.of(0x10, (dedans.length >> 16) & 0xff, (dedans.length >> 8) & 0xff, dedans.length & 0xff);
    const piege = concat(o, Uint8Array.of(0xec), taille, dedans);
    const lu = lireAudio(piege)!;
    expect(lu.secondes).toBeCloseTo(3, 0);
    expect(dureeAudio(lu.octets)).toBe(lu.secondes);
    expect(lu.octets.length).toBeLessThan(o.length);
  });
});

/* ———— MP4 : une piste AAC, des trames qui en sont ———— */

describe("MP4 piégé (S-15) : illisible", () => {
  /** La boîte `type` (son début : la taille, puis le type). */
  const boite = (o: Uint8Array, type: string) => chercher(o, texte(type)) - 4;

  it("un autre type d’objet que l’audio MPEG-4 (0x40), ou un autre AAC que LC, SBR ou PS", () => {
    for (const nom of ["court.m4a", "court-fragments.mp4"]) {
      const o = vocal(nom);
      /* Le DecoderConfigDescriptor : le type d’objet (0x40), puis le type de flux (audio : 0x15) */
      const dc = chercher(o, [0x40, 0x15], boite(o, "esds"));
      expect(dc).toBeGreaterThan(0);
      const mp3 = Uint8Array.from(o);
      mp3[dc] = 0x6b;
      expect(dureeAudio(mp3)).toBeNull();
      /* L’AudioSpecificConfig, au bout : AAC LC (2) à 44,1 kHz en mono, 0x12 0x08 ; AAC Main (1), 0x0a 0x08 */
      const asc = chercher(o, [0x12, 0x08], dc);
      expect(asc).toBeGreaterThan(0);
      const main = Uint8Array.from(o);
      main[asc] = 0x0a;
      expect(dureeAudio(main)).toBeNull();
    }
  });

  it("un échantillon plus gros qu’une trame AAC (768 octets par voie), dans stsz ou trun : des trames tassées", () => {
    const o = vocal("court.m4a");
    const vue = new DataView(o.buffer, o.byteOffset);
    const stsz = boite(o, "stsz");
    vue.setUint32(stsz + 20, 769);
    expect(dureeAudio(o)).toBeNull();
    const f = vocal("court-fragments.mp4");
    const trun = boite(f, "trun");
    /* trun 0x201 : l’adresse des données, puis la taille de chaque échantillon */
    new DataView(f.buffer, f.byteOffset).setUint32(trun + 20, 5000);
    expect(dureeAudio(f)).toBeNull();
  });

  it("une liste d’édition de plus d’une entrée (elle rejouerait la piste)", () => {
    const o = vocal("court.m4a");
    new DataView(o.buffer, o.byteOffset).setUint32(boite(o, "elst") + 12, 2);
    expect(dureeAudio(o)).toBeNull();
  });

  it("une boîte inconnue au premier niveau (sidx), ou un index de fragments qui pointe ailleurs que sur un fragment", () => {
    const o = vocal("court-fragments.mp4");
    const sidx = concat(Uint8Array.of(0, 0, 0, 8), Uint8Array.from(texte("sidx")));
    expect(dureeAudio(concat(o, sidx))).toBeNull();
    const tfra = boite(o, "tfra");
    expect(tfra).toBeGreaterThan(0);
    const vue = new DataView(o.buffer, o.byteOffset);
    /* La première entrée (version 1 : le temps sur 8 octets, puis l’adresse du moof sur 8) */
    const version = o[tfra + 8];
    const adresse = tfra + 24 + (version === 1 ? 8 : 4);
    if (version === 1) vue.setBigUint64(adresse, vue.getBigUint64(adresse) + 1n);
    else vue.setUint32(adresse, vue.getUint32(adresse) + 1);
    expect(dureeAudio(o)).toBeNull();
  });
});

describe("dureeOpus : la durée d’un paquet, lue dans son premier octet", () => {
  it.each([
    /* config 1 (SILK, 20 ms), une trame */
    [[0b00001_0_00], 20],
    /* config 31 (CELT, 20 ms), deux trames */
    [[0b11111_0_01], 40],
    /* config 16 (CELT, 2,5 ms), un nombre de trames dans l’octet suivant : 4 */
    [[0b10000_0_11, 4], 10],
  ])("%j : %d ms", (octets, ms) => {
    expect(dureeOpus(Uint8Array.from(octets))).toBe(ms);
  });

  it("au-delà de 120 ms, sans trame, ou plus lourd que ses trames : ce n’est pas un paquet Opus", () => {
    expect(dureeOpus(Uint8Array.from([0b00011_0_11, 3]))).toBeNull();
    expect(dureeOpus(Uint8Array.from([0b00011_0_11, 0]))).toBeNull();
    expect(dureeOpus(new Uint8Array(0))).toBeNull();
    /* Une trame de 20 ms : 1 275 octets au plus, et ses deux octets d’en-tête */
    expect(dureeOpus(new Uint8Array(1279).fill(0b00001_0_00))).toBe(20);
    expect(dureeOpus(new Uint8Array(1280).fill(0b00001_0_00))).toBeNull();
  });
});
