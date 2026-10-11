import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { deflateSync } from "node:zlib";
import type { TestInfo } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { FACTICE } from "../../../src/server/ia/factice-valeurs";

/*
 * Des fichiers à importer, fictifs, au format réel des applis : deux prénoms inventés, une conv inventée. Jamais une
 * vraie conv (prompts/evals/convs en contient : elles restent dans le banc de test des prompts).
 * Chaque fichier est écrit dans le dossier du test (testInfo.outputPath) : rien n’est partagé entre deux tests.
 */

export type Personnes = { toi: string; autre: string };
/** Les deux personnes par défaut : Noé (qui importe) et Maëlys. Noé écrit un peu plus : il est le premier de « Qui es-tu ? ». */
export const NOE_ET_MAELYS: Personnes = { toi: "Noé", autre: "Maëlys" };

/** Un fichier fictif prêt à importer, et ce que BLUSH doit y lire (les écrans l’affichent). */
export type Fichier = { chemin: string; nom: string; messages: number; vocaux: number };

type Message = { de: "toi" | "autre"; texte?: string; media?: "photo" | "vocal" };

/* Deux soirées de messages, rejouées les jours suivants quand il en faut plus */
const CONV: Message[] = [
  { de: "toi", texte: "salut ! c’était cool hier soir" },
  { de: "autre", texte: "grave 😊 t’es bien rentré ?" },
  { de: "toi", texte: "oui nickel, dernier métro de justesse" },
  { de: "toi", texte: "et toi ?" },
  { de: "autre", texte: "ma coloc m’a récupérée en voiture" },
  { de: "toi", texte: "la chance" },
  { de: "autre", texte: "tu fais quoi ce week-end ?" },
  { de: "toi", texte: "rien de prévu encore" },
  { de: "toi", texte: "pourquoi 👀" },
  { de: "autre", texte: "il y a un marché aux puces dimanche à côté de chez moi" },
  { de: "toi", texte: "ah carrément, j’adore chiner" },
  { de: "autre", texte: "menteur mdr" },
  { de: "toi", texte: "bon ok j’ai jamais fait\nmais je suis motivé" },
  { de: "autre", media: "photo" },
  { de: "autre", texte: "voilà l’affiche" },
  { de: "toi", texte: "10 h c’est tôt pour un dimanche quand même" },
  { de: "autre", texte: "on peut dire 11 h" },
  { de: "toi", texte: "11 h ça marche" },
  { de: "autre", texte: "parfait" },
  { de: "toi", texte: "bonne nuit alors" },
  { de: "toi", texte: "bien dormi ?" },
  { de: "autre", texte: "bof, les voisins ont fait la fête" },
  { de: "toi", texte: "aïe" },
  { de: "autre", media: "vocal" },
  { de: "toi", texte: "mdr ton vocal" },
  { de: "toi", texte: "jusqu’à quelle heure ?" },
  { de: "autre", texte: "4 h du mat" },
  { de: "toi", texte: "sieste obligatoire alors" },
  { de: "autre", texte: "c’est prévu" },
  { de: "toi", texte: "on dit toujours 11 h demain ?" },
  { de: "autre", texte: "oui oui" },
  { de: "toi", texte: "je prends les croissants" },
  { de: "autre", texte: "deal" },
  { de: "toi", texte: "tu préfères pain au chocolat ou croissant ?" },
  { de: "autre", texte: "chocolatine 😇" },
  { de: "toi", texte: "je fais comme si j’avais rien lu" },
  { de: "autre", texte: "mdrrr" },
  { de: "toi", texte: "à demain" },
  { de: "autre", texte: "à demain 😘" },
  { de: "toi", texte: "😊" },
];

/*
 * Les déclencheurs du modèle factice (FACTICE, src/server/ia/factice-valeurs.ts, lus là, jamais recopiés) : écrits dans
 * une conv, ils lui font prendre un chemin qu’il ne prend jamais sinon. Des marqueurs inventés, que personne n’écrit
 * dans une vraie conv. (REFUS_FACTICE, ici, est le déclencheur écrit dans la conv ; celui de src/server/ia/factice.ts,
 * du même nom, est ce que rend une sortie factice qui refuse.)
 */
/** Le verdict lève une alerte (danger) : le rapport passe en mode sobre. */
export const ALERTE_FACTICE = FACTICE.alerte;
/** Le modèle refuse de lire la conv (ou, dans un message au chat, d’y répondre). */
export const REFUS_FACTICE = FACTICE.refus;

/** Un message ajouté au bout de la conv : qui l’écrit, et quoi (un déclencheur du modèle factice, par exemple). */
export type Ajout = { de: "toi" | "autre"; texte: string };

/**
 * Les `n` messages de la conv, avec leur instant (sans fuseau, comme dans les exports) : le 4 septembre 2026 vers 19 h,
 * un message toutes les 6 minutes environ, une soirée de plus tous les 20 messages. `ajout` : un message de plus, à la fin.
 */
function messages(n: number, ajout?: Ajout): (Message & { t: number })[] {
  const debut = Date.UTC(2026, 8, 4, 19, 2, 11);
  const quand = (k: number) => debut + Math.floor(k / 20) * 86400e3 + (k % 20) * 6 * 60e3 + ((k * 13) % 50) * 1e3;
  const ms = Array.from({ length: n }, (_, k) => ({ ...CONV[k % CONV.length]!, t: quand(k) }));
  return ajout ? [...ms, { de: ajout.de, texte: ajout.texte, t: quand(n - 1) + 60e3 }] : ms;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** L’en-tête d’un message d’un iPhone en français : « [04/09/2026 19:02:11] ». */
const enteteIos = (t: number) => {
  const d = new Date(t);
  return `[${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}]`;
};
/* Les médias d’un export iOS sans médias : la marque de sens d’écriture (U+200E), puis le libellé */
const MEDIA_IOS = { photo: "\u200eimage omitted", vocal: "\u200eaudio omitted" } as const;

/**
 * Le _chat.txt d’un export WhatsApp iPhone : la ligne système du chiffrement d’abord (ce n’est pas un message), puis les
 * messages. Un message sur deux lignes continue sur la ligne suivante, sans en-tête.
 */
export function texteWhatsApp(personnes: Personnes = NOE_ET_MAELYS, n = 64, ajout?: Ajout): string {
  const ms = messages(n, ajout);
  const systeme = `${enteteIos(ms[0]!.t - 90e3)} ${personnes.autre}: \u200eLes messages et les appels sont chiffrés de bout en bout.`;
  return [systeme, ...ms.map((m) => `${m.media ? "\u200e" : ""}${enteteIos(m.t)} ${personnes[m.de]}: ${m.media ? MEDIA_IOS[m.media] : m.texte}`)].join("\n");
}

/** L’en-tête d’un message d’un Android en français : « 04/09/2026 19:02 - » (sans les secondes). */
const enteteAndroid = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} -`;
};

/**
 * Le _chat.txt d’un export WhatsApp Android en français, sans médias : la ligne du chiffrement d’abord (sans auteur),
 * puis les messages ; une photo ou un vocal y devient « <Médias omis> ».
 */
function texteWhatsAppAndroid(personnes: Personnes = NOE_ET_MAELYS, n = 64): string {
  const ms = messages(n);
  const systeme = `${enteteAndroid(ms[0]!.t - 90e3)} Les messages et les appels sont chiffrés de bout en bout. Personne en dehors de cette discussion ne peut les lire ni les écouter.`;
  return [systeme, ...ms.map((m) => `${enteteAndroid(m.t)} ${personnes[m.de]}: ${m.media ? "<Médias omis>" : m.texte}`)].join("\n");
}

const compte = (n: number, ajout?: Ajout) => ({ messages: n + (ajout ? 1 : 0), vocaux: messages(n).filter((m) => m.media === "vocal").length });

/** Écrit un fichier (et son dossier) : celui d’un test, dans testInfo.outputPath. Renvoie son chemin. */
export function ecrire(chemin: string, contenu: string | Uint8Array): string {
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, contenu);
  return chemin;
}

/**
 * Un export WhatsApp tel que l’iPhone le partage : « WhatsApp Chat - <autre>.zip », avec _chat.txt et une photo (que le
 * navigateur laisse de côté). `format: "txt"` : le _chat.txt seul. `n` : 50 messages au moins pour une lecture.
 * `ajout` : un dernier message en plus (un déclencheur du modèle factice).
 */
export function exportWhatsApp(
  testInfo: TestInfo,
  { personnes = NOE_ET_MAELYS, n = 64, format = "zip", ajout }: { personnes?: Personnes; n?: number; format?: "zip" | "txt"; ajout?: Ajout } = {},
): Fichier {
  const texte = texteWhatsApp(personnes, n, ajout);
  const nom = format === "zip" ? `WhatsApp Chat - ${personnes.autre}.zip` : "_chat.txt";
  const contenu = format === "zip" ? zipSync({ "_chat.txt": strToU8(texte), "00000014-PHOTO-2026-09-04-20-20-11.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }) : texte;
  return { chemin: ecrire(testInfo.outputPath("exports", nom), contenu), nom, ...compte(n, ajout) };
}

/** L’export WhatsApp d’un Android (le _chat.txt seul, tel que Drive le garde) : 64 messages entre Noé et Maëlys par défaut. */
export function exportWhatsAppAndroid(testInfo: TestInfo, { personnes = NOE_ET_MAELYS, n = 64 }: { personnes?: Personnes; n?: number } = {}): Fichier {
  return { chemin: ecrire(testInfo.outputPath("exports", "android", "_chat.txt"), texteWhatsAppAndroid(personnes, n)), nom: "_chat.txt", messages: n, vocaux: 0 };
}

/** Instagram écrit l’UTF-8 de ses JSON octet par octet (« MaÃ«lys » pour « Maëlys ») : on l’écrit pareil. */
export const commeInstagram = (s: string) => String.fromCharCode(...new TextEncoder().encode(s));

/**
 * Un export Instagram JSON (« Télécharger tes informations ») : message_1.json, du plus récent au plus ancien, avec un
 * « a aimé un message » (une ligne système, pas un message). `format: "zip"` : dans son dossier de l’export complet,
 * your_instagram_activity/messages/inbox/<conv>/.
 */
export function exportInstagram(testInfo: TestInfo, { personnes = NOE_ET_MAELYS, n = 64, format = "json" }: { personnes?: Personnes; n?: number; format?: "json" | "zip" } = {}): Fichier {
  const ms = messages(n);
  /* Le dossier de la conv dans l’export : son nom sans accent, et un numéro */
  const dossier = `your_instagram_activity/messages/inbox/${personnes.autre.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()}_1234567890`;
  const json = JSON.stringify({
    participants: [{ name: commeInstagram(personnes.autre) }, { name: commeInstagram(personnes.toi) }],
    messages: [
      ...ms.map((m) => ({
        sender_name: commeInstagram(personnes[m.de]),
        timestamp_ms: m.t,
        ...(m.media === "photo" ? { photos: [{ uri: `${dossier}/photos/${m.t}.jpg` }] } : {}),
        ...(m.media === "vocal" ? { audio_files: [{ uri: `${dossier}/audio/${m.t}.mp4` }] } : {}),
        ...(m.texte ? { content: commeInstagram(m.texte) } : {}),
      })),
      { sender_name: commeInstagram(personnes.autre), timestamp_ms: ms.at(-1)!.t + 60e3, content: commeInstagram(`${personnes.autre} a aimé un message`) },
    ].reverse(),
    title: commeInstagram(personnes.autre),
    is_still_participant: true,
    thread_path: dossier.slice(dossier.indexOf("inbox/")),
  });
  const nom = format === "zip" ? "instagram-noe-2026-09-10.zip" : "message_1.json";
  const contenu = format === "zip" ? zipSync({ [`${dossier}/message_1.json`]: strToU8(json) }) : json;
  return { chemin: ecrire(testInfo.outputPath("exports", nom), contenu), nom, ...compte(n) };
}

/* ———— Des captures d’écran : de vraies images PNG, minuscules et unies ———— */

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (octets: Buffer) => {
  let c = 0xffffffff;
  for (const o of octets) c = CRC[(c ^ o) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function morceau(type: string, donnees: Buffer): Buffer {
  const corps = Buffer.concat([Buffer.from(type, "ascii"), donnees]);
  const taille = Buffer.alloc(4);
  taille.writeUInt32BE(donnees.length);
  const somme = Buffer.alloc(4);
  somme.writeUInt32BE(crc32(corps));
  return Buffer.concat([taille, corps, somme]);
}
/** Un PNG uni de `largeur` × `hauteur` pixels, de la couleur [r, v, b]. */
function png(largeur: number, hauteur: number, [r, v, b]: [number, number, number]): Buffer {
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete.set([8, 2, 0, 0, 0], 8); // 8 bits par couleur, en RVB, sans entrelacement
  const ligne = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: largeur }, () => [r, v, b]).flat())]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: hauteur }, () => ligne)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), morceau("IHDR", entete), morceau("IDAT", pixels), morceau("IEND", Buffer.alloc(0))]);
}

/* Le numéro de chaque appel à capturesPng dans un test : chaque lot a son dossier */
const lots = new WeakMap<TestInfo, number>();

/**
 * `n` captures d’écran (« capture-1.png »…), au format d’un téléphone en portrait, chacune de sa couleur : le rouge de
 * capture-N.png vaut 240 − 10 × (N − 1), de quoi reconnaître jusqu’à 20 captures (la limite du serveur) dans une
 * vignette (ordreAffiche, aide/instagram-captures.ts). Leur contenu ne compte pas : le modèle factice rend toujours la
 * même conv lue (src/server/ia/factice.ts). Chaque appel écrit dans un dossier à lui : réécrire un fichier qu’un
 * <input type=file> a déjà pris le rendrait illisible au navigateur. Renvoie leurs chemins.
 */
export function capturesPng(testInfo: TestInfo, n = 1): string[] {
  const lot = (lots.get(testInfo) ?? 0) + 1;
  lots.set(testInfo, lot);
  return Array.from({ length: n }, (_, k) => ecrire(testInfo.outputPath("captures", `lot-${lot}`, `capture-${k + 1}.png`), png(39, 84, [240 - k * 10, 230, 225 + (k % 3) * 10])));
}
