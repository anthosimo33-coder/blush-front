import { gunzipSync, gzipSync } from "node:zlib";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  ACCEPT_EXPORT,
  ACCEPT_IMAGES,
  CAPTURES_MAX,
  CODE_MINUTES,
  CORPS_VERCEL_MAX,
  ENVOI_EXPORT_MAX,
  ENVOI_IMAGES_MAX,
  estExport,
  estImage,
  extensionAudio,
  PARTIES_MAX,
  TEXTE_CONV_MAX,
} from "@/lib/limites";
import { imagesDe } from "@/server/captures";
import { depuisFichier, depuisPaquet, ErreurImport } from "@/server/import";
import { CODE_ESSAIS } from "@/server/auth";
import { LIMITES, partDesAutresMails, QUOTA_MAILS } from "@/server/limites";
import { mailCode } from "@/server/mail-code";
import { analyserExport, ExportIllisible, lireFichiers } from "@/services/preparer-export";

/*
 * Les limites partagées (src/lib/limites.ts) : le navigateur et le serveur s’arrêtent au même endroit. Des fichiers
 * vides de la bonne taille suffisent : les deux côtés regardent la taille avant de lire.
 */
const vide = (octets: number, nom: string, type = "") => new File([new Uint8Array(octets)], nom, { type });

describe("les envois restent sous la limite de Vercel", () => {
  it("avec leurs marges : 4,2 Mo pour un export, 4 Mo pour des images", () => {
    expect(CORPS_VERCEL_MAX).toBe(4.5 * 1024 * 1024);
    expect(ENVOI_EXPORT_MAX).toBeCloseTo(4.2 * 1024 * 1024);
    expect(ENVOI_IMAGES_MAX).toBe(4 * 1024 * 1024);
    expect(ENVOI_IMAGES_MAX).toBeLessThan(ENVOI_EXPORT_MAX);
    expect(ENVOI_EXPORT_MAX).toBeLessThan(CORPS_VERCEL_MAX);
  });

  it("le serveur refuse un paquet plus gros que ce que Vercel laisse passer", async () => {
    await expect(depuisPaquet(vide(CORPS_VERCEL_MAX + 1, "export.json.gz"))).rejects.toBeInstanceOf(ErreurImport);
  });
});

describe("le texte d’une conv : 40 Mo au plus, des deux côtés", () => {
  it("le navigateur refuse le fichier avant de l’envoyer", async () => {
    await expect(lireFichiers(vide(TEXTE_CONV_MAX + 1, "conv.txt"))).rejects.toBeInstanceOf(ExportIllisible);
  });

  it("le serveur refuse un fichier reçu tel quel au-delà", async () => {
    await expect(depuisFichier(vide(TEXTE_CONV_MAX + 1, "conv.txt"))).rejects.toBeInstanceOf(ErreurImport);
  });

  it("un fichier sous la limite dont le JSON la dépasse : le navigateur garde sa fin, le serveur le relit", async () => {
    /* Des guillemets, deux octets chacun une fois en JSON : 26 Mo de texte, 50 Mo à décompresser, quelques Ko compressés */
    const debut = Date.UTC(2023, 0, 1, 9, 0);
    const texte = Array.from({ length: 80_000 }, (_, k) => {
      const d = new Date(debut + k * 17 * 60e3).toISOString();
      return `[${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}:00] ${k % 2 ? "Léa" : "Tom"}: ${'"'.repeat(300)}`;
    }).join("\n");
    expect(texte.length).toBeLessThan(TEXTE_CONV_MAX);
    const pret = await analyserExport(new File([texte], "WhatsApp Chat - Léa.txt", { type: "text/plain" }));
    if (pret.type !== "un") throw new Error("un seul fichier attendu");
    const octets = gunzipSync(Buffer.from(await pret.paquet.arrayBuffer()));
    expect(octets.length).toBeLessThanOrEqual(TEXTE_CONV_MAX);
    expect((JSON.parse(octets.toString("utf8")) as { coupe?: boolean }).coupe).toBe(true);
    await expect(depuisPaquet(new File([await pret.paquet.arrayBuffer()], "export.json.gz"))).resolves.toMatchObject({ coupe: true });
  }, 60_000);
});

describe("les fichiers d’une conv dans un paquet : 50 au plus, des deux côtés", () => {
  /* Une conv d’Instagram en `n` fichiers : message_1 est le plus récent, chacun du plus récent au plus ancien */
  const DEBUT = Date.UTC(2026, 8, 1);
  const message = (k: number) => ({ sender_name: k % 2 ? "Moi" : "Léa", timestamp_ms: DEBUT - k * 60e3, content: `message ${k}` });
  const fichierInsta = (n: number) => JSON.stringify({ participants: [{ name: "Léa" }, { name: "Moi" }], messages: [0, 1, 2, 3].map((k) => message(n * 4 + k)) });
  const nomInsta = (n: number) => `your_instagram_activity/messages/inbox/lea_1/message_${n}.json`;
  const parties = (n: number) => Array.from({ length: n }, (_, k) => ({ nom: nomInsta(k + 1), contenu: fichierInsta(k + 1) }));
  const paquetDe = (contenu: unknown) => new File([gzipSync(JSON.stringify(contenu))], "export.json.gz");

  it("le serveur lit un paquet de 50 fichiers, pas un de plus", async () => {
    await expect(depuisPaquet(paquetDe({ nom: "instagram.zip", parties: parties(PARTIES_MAX) }))).resolves.toMatchObject({ appli: "instagram" });
    await expect(depuisPaquet(paquetDe({ nom: "instagram.zip", parties: parties(PARTIES_MAX + 1) }))).rejects.toBeInstanceOf(ErreurImport);
  });

  it("le navigateur garde les 50 plus récents d’une conv plus longue, coupée comme une conv trop grosse : le serveur relit le paquet", async () => {
    const zip = zipSync(Object.fromEntries(parties(PARTIES_MAX + 3).map((p) => [p.nom, strToU8(p.contenu)])));
    const pret = await analyserExport(new File([zip as BlobPart], "instagram.zip", { type: "application/zip" }));
    if (pret.type !== "un") throw new Error("une seule conv attendue");
    const paquet = JSON.parse(gunzipSync(Buffer.from(await pret.paquet.arrayBuffer())).toString("utf8")) as { parties: { nom: string }[]; coupe?: boolean };
    expect(paquet.parties.map((p) => p.nom)).toEqual(parties(PARTIES_MAX).map((p) => p.nom));
    expect(paquet.coupe).toBe(true);
    await expect(depuisPaquet(new File([await pret.paquet.arrayBuffer()], "export.json.gz"))).resolves.toMatchObject({ coupe: true });
  });
});

describe("les captures : 20 au plus", () => {
  /* Des JPEG : leurs premiers octets le disent (le serveur lit le type dans les octets, S-39) */
  const captures = (n: number) =>
    Array.from({ length: n }, (_, k) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Uint8Array(12)])], `capture-${k + 1}.jpg`, { type: "image/jpeg" }));

  it("le serveur lit les 20 que l’écran garde, pas une de plus", async () => {
    await expect(imagesDe(captures(CAPTURES_MAX))).resolves.toHaveLength(CAPTURES_MAX);
    await expect(imagesDe(captures(CAPTURES_MAX + 1))).rejects.toBeInstanceOf(ErreurImport);
  });
});

describe("le reste", () => {
  it("la durée du code est celle que dit son mail", () => {
    const m = mailCode("159714", "https://www.askblush.com");
    expect(m.texte).toContain(`Il marche ${CODE_MINUTES} minutes.`);
    expect(m.html).toContain(`Il marche ${CODE_MINUTES} minutes.`);
    /* S-08 : le code ne vaut que là où on l’a demandé, et le mail le dit */
    expect(m.texte).toContain("Tape-le dans BLUSH, sur l’appareil où tu l’as demandé.");
    expect(m.html).toContain("Tape-le dans BLUSH, sur l’appareil où tu l’as demandé.");
  });

  it("une autre durée de code se dit partout dans son mail", () => {
    const m = mailCode("159714", "https://www.askblush.com", 15);
    expect(m.texte).toContain("Il marche 15 minutes.");
    expect(m.html).toContain("Il marche 15 minutes.");
    expect(m.html).not.toContain(`Il marche ${CODE_MINUTES} minutes.`);
  });

  it("S-09 · tous les mails tiennent dans le quota du prestataire : les codes ont leur part, les autres se partagent le reste, les moins nécessaires s’arrêtent les premiers", () => {
    const { parJour, laisse } = QUOTA_MAILS;
    expect([LIMITES.mailsCodeParJour.max, LIMITES.mailsAttenteParJour.max, parJour]).toEqual([60, 20, 100]);
    /* Les codes et les autres mails, ensemble, ne dépassent jamais le quota ; avec la clé des codes, les autres ont tout */
    expect(LIMITES.mailsCodeParJour.max + partDesAutresMails(false)).toBe(parJour);
    expect(partDesAutresMails(true)).toBe(parJour);
    /* La liste d’attente s’arrête avant les alertes, les alertes avant les rapports, qui vont jusqu’au bout */
    expect(laisse.attente).toBeGreaterThan(laisse.alerte);
    expect(laisse.alerte).toBeGreaterThan(laisse.rapport);
    expect(laisse.rapport).toBe(0);
    /* Son propre plafond tient dans sa part : rien ne l’arrête plus tôt en temps normal */
    expect(LIMITES.mailsAttenteParJour.max).toBeLessThanOrEqual(partDesAutresMails(false) - laisse.attente);
    /* Les alertes en ont encore quand la liste a pris toute la sienne */
    expect(partDesAutresMails(false) - laisse.alerte - LIMITES.mailsAttenteParJour.max).toBeGreaterThanOrEqual(10);
  });

  it("S-07, S-08 · les essais ratés et la réserve des codes : ce qui se devine reste borné, et un tiers ne ferme la porte qu’en écrivant de cinq adresses", () => {
    const { echecsCodeParEmail, echecsCodeParEmailEtIp, echecsCodeParNavigateur, codeParEmail, codeParEmailEtIp, codeReserveParEmail, codeReserveParEmailEtIp, mailsCodeParJour } =
      LIMITES;
    expect(echecsCodeParEmailEtIp.reserveNavigateur).toBeLessThan(echecsCodeParNavigateur.max);
    expect(echecsCodeParNavigateur.max).toBeLessThan(echecsCodeParEmailEtIp.max);
    expect(echecsCodeParEmailEtIp.max).toBeLessThan(echecsCodeParEmail.max);
    /* Une chance sur plus de 10 000 de deviner un code (un sur un million) dans la journée */
    expect(echecsCodeParEmail.max / 1e6).toBeLessThan(1e-4);
    /* Tous les codes du jour d’un email, réserve comprise, ne donnent pas plus d’essais que sa borne : elle ne grandit pas avec la réserve, et un tiers n’y arrive qu’avec tous ces codes */
    expect((codeParEmail.max + codeReserveParEmail.max) * CODE_ESSAIS).toBeLessThanOrEqual(echecsCodeParEmail.max);
    /* Une seule adresse ne prend pas plus que les codes de l’email ; la réserve, elle, en demande au moins cinq */
    expect(codeParEmailEtIp.max).toBeLessThanOrEqual(codeParEmail.max);
    expect(codeReserveParEmail.max / codeReserveParEmailEtIp.max).toBeGreaterThanOrEqual(5);
    /* Tous emails confondus, les mails de code du jour bornent ce qui se devine : moins d’une chance sur mille */
    expect((mailsCodeParJour.max * CODE_ESSAIS) / 1e6).toBeLessThan(1e-3);
  });

  it("les sélecteurs de fichiers : des images, ou un export WhatsApp (.zip, .txt) ou Instagram (.html, .json), par extension comme par type", () => {
    expect(ACCEPT_IMAGES).toBe("image/*");
    expect(ACCEPT_EXPORT).toBe(".zip,.txt,.json,.html,application/zip,text/plain,application/json,text/html");
    const f = (nom: string, type = "") => new File([], nom, { type });
    expect([f("a.png", "image/png"), f("b.HEIC", "image/heic")].map(estImage)).toEqual([true, true]);
    expect([f("Conv.ZIP"), f("_chat.txt"), f("message_1.json"), f("message_1.html"), f("sans-extension", "application/zip")].map(estExport)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect([f("photo.jpg", "image/jpeg"), f("video.mp4", "video/mp4"), f("conv.zip.pdf", "application/pdf")].map(estExport)).toEqual([false, false, false]);
    expect(estImage(f("video.mp4", "video/mp4"))).toBe(false);
  });

  it.each([
    ["audio/webm;codecs=opus", "webm"],
    ["audio/ogg", "ogg"],
    ["audio/wav", "wav"],
    ["audio/mpeg", "mp3"],
    ["audio/mp4", "m4a"],
    ["", "m4a"],
  ])("un vocal %s s’envoie en .%s, des deux côtés", (type, extension) => {
    expect(extensionAudio(type)).toBe(extension);
  });
});
