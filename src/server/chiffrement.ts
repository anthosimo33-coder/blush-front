import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { env } from "./env";

/*
 * Tout ce qui contient la conv (la conv brute, le verdict, le rapport, la mémoire, la fiche, le chat)
 * est chiffré avant d’entrer dans la base : AES-256-GCM, avec une clé qui n’y est jamais.
 * Format : [version 1 octet][iv 12][tag 16][texte chiffré]. La version permet de changer de clé plus tard.
 * Version 2 (`COMPRESSE`) : le même, sur le JSON compressé d’abord (la conv brute, voir chiffrerCompresse).
 */
const VERSION = 1;
const COMPRESSE = 2;
/* Ce qu’une donnée compressée peut redevenir au plus : bien au-delà de la plus longue conv acceptée (TEXTE_CONV_MAX, src/lib/limites.ts) */
const DECOMPRESSE_MAX = 256 * 1024 * 1024;

function deriver() {
  const maitre = Buffer.from(env().BLUSH_CLE, "base64");
  /* Deux clés dérivées : une pour chiffrer, une pour hacher (jetons de session, codes, brouillons) */
  return {
    chiffrement: Buffer.from(hkdfSync("sha256", maitre, Buffer.alloc(0), "blush:chiffrement:v1", 32)),
    hachage: Buffer.from(hkdfSync("sha256", maitre, Buffer.alloc(0), "blush:hachage:v1", 32)),
  };
}

/* Dérivées une fois par instance (la clé maîtresse ne change pas, env() est lu une fois) : l’accueil déchiffre une centaine de fois par rendu */
let derivees: ReturnType<typeof deriver> | null = null;
const cles = () => (derivees ??= deriver());

/** Chiffre des octets dans un format : [format][iv][tag][texte chiffré]. */
function sceller(format: number, clair: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cles().chiffrement, iv);
  const corps = Buffer.concat([c.update(clair), c.final()]);
  return Buffer.concat([Buffer.from([format]), iv, c.getAuthTag(), corps]);
}

/** Les octets en clair d’une donnée chiffrée (le tag est vérifié : une donnée modifiée est refusée). */
function ouvrir(b: Buffer): Buffer {
  const d = createDecipheriv("aes-256-gcm", cles().chiffrement, b.subarray(1, 13));
  d.setAuthTag(b.subarray(13, 29));
  return Buffer.concat([d.update(b.subarray(29)), d.final()]);
}

const json = (valeur: unknown) => Buffer.from(JSON.stringify(valeur), "utf8");

/*
 * Ce module ne connaît que des octets et du JSON. Ce que garde chaque colonne est dans le coffre (src/server/coffre.ts,
 * lire et ecrire) : dans src, seul lui appelle les cinq fonctions suivantes (eslint.config.mjs, avec les exceptions
 * qui restent).
 */

/** Chiffre des octets bruts (l’audio du vocal), sans passer par le JSON. */
export const chiffrerOctets = (octets: Buffer): Buffer => sceller(VERSION, octets);

/** Chiffre une valeur, écrite en JSON : les mêmes octets que `chiffrerOctets`, une fois le JSON écrit. */
export const chiffrer = (valeur: unknown): Buffer => chiffrerOctets(json(valeur));

/**
 * Comme `chiffrer`, après avoir compressé le JSON. Pour la conv brute : un chiffré ne se compresse plus, et sans ça un
 * texte très répétitif, envoyé compressé (quelques Ko), prenait sa pleine taille en base (des dizaines de Mo). Une vraie
 * conv y prend aussi plusieurs fois moins de place. `dechiffrer` relit les deux formats.
 */
export const chiffrerCompresse = (valeur: unknown): Buffer => sceller(COMPRESSE, deflateRawSync(json(valeur)));

export function dechiffrer<T>(donnee: Buffer | Uint8Array): T {
  const b = Buffer.from(donnee);
  if (b[0] !== VERSION && b[0] !== COMPRESSE) throw new Error(`Version de chiffrement inconnue : ${b[0]}`);
  const clair = ouvrir(b);
  return JSON.parse((b[0] === COMPRESSE ? inflateRawSync(clair, { maxOutputLength: DECOMPRESSE_MAX }) : clair).toString("utf8")) as T;
}

export function dechiffrerOctets(donnee: Buffer | Uint8Array): Buffer {
  const b = Buffer.from(donnee);
  if (b[0] !== VERSION) throw new Error(`Version de chiffrement inconnue : ${b[0]}`);
  return ouvrir(b);
}

/** Empreinte d’un secret (jeton, code) : on ne garde que ça en base. */
export function empreinte(secret: string): string {
  return createHmac("sha256", cles().hachage).update(secret).digest("base64url");
}

export function memeEmpreinte(secret: string, attendue: string): boolean {
  const a = Buffer.from(empreinte(secret));
  const b = Buffer.from(attendue);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Un jeton aléatoire, pour un cookie. */
export function jeton(): string {
  return randomBytes(32).toString("base64url");
}
