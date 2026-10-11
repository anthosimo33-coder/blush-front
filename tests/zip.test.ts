import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deflateSync, strToU8, zipSync } from "fflate";
import { analyserExport, ExportIllisible, lireFichiers, preparerExport } from "@/services/preparer-export";
import { lirePaquet } from "./aide/fichiers";

const chat = "[12/09/2026 18:58:00] Léa: t’es dispo jeudi ?\n[12/09/2026 19:00:00] Malik: à demain alors 😊\n".repeat(2000);
const fichier = (octets: Uint8Array, nom: string) => new File([octets as BlobPart], nom);

/* Un zip écrit à la main : des entrées, la table des matières, la fin. `virtuel` : une entrée de N octets jamais écrits */
type Entree = { nom: string; donnees?: Uint8Array; virtuel?: number; methode?: 0 | 8; complet?: number };
function zipVirtuel(entrees: Entree[]) {
  const morceaux: { de: number; octets?: Uint8Array; longueur: number }[] = [];
  let pos = 0;
  const ajoute = (octets: Uint8Array | null, longueur = octets?.length ?? 0) => {
    morceaux.push({ de: pos, octets: octets ?? undefined, longueur });
    pos += longueur;
  };
  const table: Uint8Array[] = [];
  for (const e of entrees) {
    const nom = strToU8(e.nom);
    const taille = e.donnees?.length ?? e.virtuel!;
    const tete = new DataView(new ArrayBuffer(30));
    tete.setUint32(0, 0x04034b50, true);
    tete.setUint16(8, e.methode ?? 0, true);
    tete.setUint32(18, taille, true);
    tete.setUint32(22, e.complet ?? taille, true);
    tete.setUint16(26, nom.length, true);
    const local = pos;
    ajoute(new Uint8Array(tete.buffer));
    ajoute(nom);
    ajoute(e.donnees ?? null, taille);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(8, 0x800, true);
    c.setUint16(10, e.methode ?? 0, true);
    c.setUint32(20, taille, true);
    c.setUint32(24, e.complet ?? taille, true);
    c.setUint16(28, nom.length, true);
    c.setUint32(42, local, true);
    table.push(new Uint8Array(c.buffer), nom);
  }
  const debutTable = pos;
  table.forEach((t) => ajoute(t));
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, entrees.length, true);
  fin.setUint16(10, entrees.length, true);
  fin.setUint32(12, pos - debutTable, true);
  fin.setUint32(16, debutTable, true);
  ajoute(new Uint8Array(fin.buffer));

  /* Un faux fichier qui ne sert que les octets demandés (et retient la plus grosse lecture) */
  const lu = { max: 0 };
  const slice = (a = 0, b = pos) => {
    lu.max = Math.max(lu.max, b - a);
    const sortie = new Uint8Array(b - a);
    for (const m of morceaux) {
      const de = Math.max(a, m.de);
      const a2 = Math.min(b, m.de + m.longueur);
      if (m.octets && de < a2) sortie.set(m.octets.subarray(de - m.de, a2 - m.de), de - a);
    }
    return new Blob([sortie]);
  };
  /* Un vrai fichier, vide, auquel on prête la taille du zip et ses octets à la demande */
  const fichier = new File([], "WhatsApp Chat - Léa.zip");
  Object.defineProperties(fichier, { size: { value: pos }, slice: { value: slice } });
  return { fichier, lu };
}

describe("lire un export zippé dans le navigateur", () => {
  it("un export WhatsApp avec médias : seul _chat.txt est lu, jamais le zip entier", async () => {
    const { fichier: zip, lu } = zipVirtuel([
      { nom: "_chat.txt", donnees: deflateSync(strToU8(chat)), methode: 8, complet: strToU8(chat).length },
      { nom: "00000012-VIDEO-2026-09-12-18-58-00.mp4", virtuel: 2_000_000_000 },
      { nom: "00000013-PHOTO-2026-09-12-19-00-00.jpg", virtuel: 300_000_000 },
    ]);
    const parties = await lireFichiers(zip);
    expect(parties).toEqual([{ nom: "_chat.txt", contenu: chat }]);
    expect(zip.size).toBeGreaterThan(2_000_000_000);
    expect(lu.max).toBeLessThan(200_000);
  });

  /* Le chemin que prend vraiment l’import (uploadExport, src/services/api.ts) : analyserExport, puis le paquet envoyé */
  const contenuDe = async (paquet: Blob) => (await lirePaquet(paquet)).parties;

  it("à l’import, un export WhatsApp avec médias : seul _chat.txt part, le zip n’est jamais lu en entier", async () => {
    const { fichier: zip, lu } = zipVirtuel([
      { nom: "_chat.txt", donnees: deflateSync(strToU8(chat)), methode: 8, complet: strToU8(chat).length },
      { nom: "00000012-VIDEO-2026-09-12-18-58-00.mp4", virtuel: 2_000_000_000 },
      { nom: "00000013-PHOTO-2026-09-12-19-00-00.jpg", virtuel: 300_000_000 },
    ]);
    const pret = await analyserExport(zip);
    if (pret.type !== "un") throw new Error("une conv attendue");
    expect(await contenuDe(pret.paquet)).toEqual([{ nom: "_chat.txt", contenu: chat }]);
    expect(lu.max).toBeLessThan(200_000);
  });

  it("à l’import, un export Instagram complet avec médias : les convs proposées, puis celle choisie, sans lire le zip en entier", async () => {
    const conv = (nom: string, n: number) => strToU8(JSON.stringify({ participants: [{ name: nom }, { name: "Moi" }], messages: Array.from({ length: n }, (_, k) => ({ sender_name: k % 2 ? "Moi" : nom, timestamp_ms: 1_790_000_000_000 - k * 60e3, content: `${nom} ${k}` })) }));
    const { fichier: zip, lu } = zipVirtuel([
      { nom: "your_instagram_activity/messages/inbox/lea_1/message_1.json", donnees: conv("Léa", 30) },
      { nom: "your_instagram_activity/messages/inbox/lea_1/videos/1.mp4", virtuel: 2_000_000_000 },
      { nom: "your_instagram_activity/messages/inbox/ines_2/message_1.json", donnees: conv("Inès", 12) },
      { nom: "your_instagram_activity/messages/inbox/ines_2/photos/1.jpg", virtuel: 300_000_000 },
    ]);
    const avance: number[] = [];
    const pret = await analyserExport(zip, (p) => avance.push(p));
    if (pret.type !== "plusieurs") throw new Error("plusieurs convs attendues");
    /* L’avancée du tour des convs, affichée par l’écran d’import : de 0 à 1, conv par conv */
    expect(avance).toEqual([0, 0.5, 1]);
    const ines = pret.convs.find((c) => c.messages === 12)!;
    const parties = await contenuDe(await pret.paquetDe(ines.id));
    expect(parties.map((p) => p.nom)).toEqual(["your_instagram_activity/messages/inbox/ines_2/message_1.json"]);
    expect(lu.max).toBeLessThan(200_000);
  });

  it("dans le chat ou la fiche, un export Instagram complet est refusé d’après les noms, sans décompresser ses convs", async () => {
    const { fichier: zip, lu } = zipVirtuel([
      { nom: "your_instagram_activity/messages/inbox/lea_1/message_1.json", virtuel: 3_000_000 },
      { nom: "your_instagram_activity/messages/inbox/ines_2/message_1.json", virtuel: 3_000_000 },
    ]);
    const refus = preparerExport(zip);
    await expect(refus).rejects.toBeInstanceOf(ExportIllisible);
    await expect(refus).rejects.toThrow("plusieurs");
    expect(lu.max).toBeLessThan(200_000);
  });

  it("une conv bien trop longue (16 Mo) : coupée d’après un échantillon de sa fin, elle garde ses derniers messages et tient dans un envoi", async () => {
    /* Du hasard : il se compresse mal, la conv ne peut pas partir en entier */
    const texte = Array.from({ length: 170_000 }, (_, k) => `[12/09/2026 18:58:00] ${k % 2 ? "Léa" : "Tom"}: ${randomBytes(48).toString("base64")}`).join("\n");
    expect(texte.length).toBeGreaterThan(15_000_000);
    const pret = await analyserExport(fichier(strToU8(texte), "WhatsApp Chat - Léa.txt"));
    if (pret.type !== "un") throw new Error("une conv attendue");
    expect(pret.paquet.size).toBeLessThanOrEqual(4.2 * 1024 * 1024);
    const p = await lirePaquet(pret.paquet);
    expect(p.coupe).toBe(true);
    const garde = p.parties[0].contenu;
    expect(texte.endsWith(garde)).toBe(true);
    expect(garde).toMatch(/^\[12\/09\/2026 /);
    /* L’estimation ne coupe pas beaucoup trop : la plus grande part de ce qui tient est gardée */
    expect(pret.paquet.size).toBeGreaterThan(3 * 1024 * 1024);
  });

  it("le paquet, écrit par morceaux : un émoji coupé entre deux morceaux revient entier", async () => {
    /* « ah » : les émojis commencent à un indice impair, la limite d’un morceau (2^20) tombe au milieu de l’un d’eux */
    const texte = `[12/09/2026 18:58:00] Léa: ah${"😊".repeat(700_000)}\n[12/09/2026 19:00:00] Tom: « ok » \"\\ \u2028 fin`;
    const pret = await analyserExport(fichier(strToU8(texte), "WhatsApp Chat - Léa.txt"));
    if (pret.type !== "un") throw new Error("une conv attendue");
    expect(texte.charCodeAt(2 ** 20 - 1)).toBeGreaterThanOrEqual(0xd800);
    expect(texte.charCodeAt(2 ** 20 - 1)).toBeLessThanOrEqual(0xdbff);
    expect(await contenuDe(pret.paquet)).toEqual([{ nom: "WhatsApp Chat - Léa.txt", contenu: texte }]);
  });

  it("un zip ordinaire (fflate) : les .txt et les message_N d’Instagram, dans leurs dossiers", async () => {
    const zip = zipSync({
      "messages/inbox/lea_123/message_1.json": strToU8('{"participants":[{"name":"Léa"}]}'),
      "messages/inbox/lea_123/photos/1.jpg": new Uint8Array(5000),
      "_chat.txt": [strToU8(chat), { level: 0 }],
    });
    const parties = await lireFichiers(fichier(zip, "export.zip"));
    expect(parties.map((p) => p.nom).sort()).toEqual(["_chat.txt", "messages/inbox/lea_123/message_1.json"]);
    expect(parties.find((p) => p.nom === "_chat.txt")!.contenu).toBe(chat);
  });

  it("un zip64 (plus de 4 Go) : les tailles et positions lues dans les champs zip64", async () => {
    const donnees = strToU8(chat);
    const nom = strToU8("_chat.txt");
    const tete = new DataView(new ArrayBuffer(30));
    tete.setUint32(0, 0x04034b50, true);
    tete.setUint16(26, nom.length, true);
    /* L’entrée de la table : tailles et position à 0xFFFFFFFF, les vraies dans l’extra 0x0001 */
    const c = new DataView(new ArrayBuffer(46 + nom.length + 28));
    c.setUint32(0, 0x02014b50, true);
    c.setUint32(20, 0xffffffff, true);
    c.setUint32(24, 0xffffffff, true);
    c.setUint16(28, nom.length, true);
    c.setUint16(30, 28, true);
    c.setUint32(42, 0xffffffff, true);
    new Uint8Array(c.buffer).set(nom, 46);
    c.setUint16(46 + nom.length, 1, true);
    c.setUint16(48 + nom.length, 24, true);
    c.setBigUint64(50 + nom.length, BigInt(donnees.length), true);
    c.setBigUint64(58 + nom.length, BigInt(donnees.length), true);
    c.setBigUint64(66 + nom.length, BigInt(0), true);
    const debutTable = 30 + nom.length + donnees.length;
    const z = new DataView(new ArrayBuffer(56 + 20 + 22));
    z.setUint32(0, 0x06064b50, true);
    z.setBigUint64(32, BigInt(1), true);
    z.setBigUint64(40, BigInt(c.byteLength), true);
    z.setBigUint64(48, BigInt(debutTable), true);
    z.setUint32(56, 0x07064b50, true);
    z.setBigUint64(64, BigInt(debutTable + c.byteLength), true);
    z.setUint32(76, 0x06054b50, true);
    z.setUint16(84, 0xffff, true);
    z.setUint16(86, 0xffff, true);
    z.setUint32(88, 0xffffffff, true);
    z.setUint32(92, 0xffffffff, true);
    const zip = new File([tete.buffer, nom as BlobPart, donnees as BlobPart, c.buffer, z.buffer], "gros.zip");
    expect(await lireFichiers(zip)).toEqual([{ nom: "_chat.txt", contenu: chat }]);
  });

  it("un .txt seul est lu tel quel ; un zip abîmé est illisible", async () => {
    expect(await lireFichiers(fichier(strToU8(chat), "conv.txt"))).toEqual([{ nom: "conv.txt", contenu: chat }]);
    await expect(lireFichiers(fichier(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), "abime.zip"))).rejects.toBeInstanceOf(ExportIllisible);
  });
});
