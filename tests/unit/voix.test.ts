import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { texteDit, type LigneScript } from "@/lib/vocal";
import { dureeAudio, dureeOpus } from "@/server/ia/duree-audio";
import { couper, scriptQuiTient } from "@/server/ia/voix";

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
 */
const vocal = (nom: string) => new Uint8Array(readFileSync(`tests/aide/vocaux/${nom}`));

/** La position d’une suite d’octets dans le fichier. */
function chercher(o: Uint8Array, motif: number[]): number {
  for (let i = 0; i + motif.length <= o.length; i++) if (motif.every((b, k) => o[i + k] === b)) return i;
  return -1;
}

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
    const [seule] = scriptQuiTient([ligne("Écoute. Elle t’a répondu en trois heures, et toi tu cours.", "sighs")], 20);
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

  it("au-delà de 120 ms, ou sans trame : ce n’est pas un paquet Opus", () => {
    expect(dureeOpus(Uint8Array.from([0b00011_0_11, 3]))).toBeNull();
    expect(dureeOpus(Uint8Array.from([0b00011_0_11, 0]))).toBeNull();
    expect(dureeOpus(new Uint8Array(0))).toBeNull();
  });
});
