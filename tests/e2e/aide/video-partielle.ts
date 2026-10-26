import { randomUUID } from "node:crypto";
import { expect, type APIResponse, type Page, type TestInfo } from "@playwright/test";
import { CASE_IMPORT } from "../../../src/contenu/consentements";
import { prouverHumain } from "./captcha";
import { origine } from "./compte";
import { RESEAU } from "./page";

/*
 * Une longue vidéo lue en partie avant l’achat (src/server/lecture-partielle.ts : le serveur des tests est en
 * BLUSH_LECTURE_PARTIELLE=ab), envoyée comme le navigateur (src/services/api.ts, uploadRecording), par les routes, sans
 * filmer une vidéo de soixante écrans (l’extraction et l’ordre des envois ont leurs tests : tests/client/upload.test.ts,
 * instagram-captures-video.spec.ts). Le décor de import-lecture-partielle.spec.ts et de la galerie (l’écran « C’est bon »
 * de la moitié partielle). Le modèle factice lit toujours les mêmes messages : la conv est courte et dense, la règle
 * s’arrête au premier tour.
 */

/** Huit lots de douze écrans, chacun reprenant le dernier écran du précédent. */
const LOTS_DE_LA_VIDEO = 8;
const ECRANS_DE_LA_VIDEO = 11 * LOTS_DE_LA_VIDEO + 1;
/** Les lots plus anciens que le premier tour de lecture (cinq lots) ne prend pas : gardés pour après le paiement. */
export const LOTS_GARDES = LOTS_DE_LA_VIDEO - 5;

/** Le formulaire du lot `j` : ses écrans (des JPEG d’après leur signature, propres à la série), son appli, l’accord de l’import, la clé de l’envoi, et ce qu’on y ajoute. */
function formulaireDuLot(serie: string, j: number, cle: string, champs: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (let i = 0; i < 12; i++) fd.append("captures", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), `${serie}:${11 * j + i}`], { type: "image/jpeg" }), `ecran-${j}-${i}.jpg`);
  fd.append("app", "imessage");
  fd.append("consentement", CASE_IMPORT.version);
  fd.append("cle", cle);
  for (const [nom, valeur] of Object.entries(champs)) fd.append(nom, valeur);
  return fd;
}

const poster = (page: Page, testInfo: TestInfo, chemin: string, corps: FormData | Record<string, unknown>): Promise<APIResponse> =>
  page.request.post(chemin, { headers: origine(testInfo), ...(corps instanceof FormData ? { multipart: corps } : { data: corps }), timeout: RESEAU });

/**
 * Importe une longue vidéo de la moitié partielle (avec ou sans compte : le laissez-passer du CAPTCHA est pris) : le
 * plan (une empreinte tirée jusqu’à tomber dans la moitié partielle), ses cinq lots les plus récents lus, la question
 * (« garder »), ses trois lots plus anciens envoyés tels quels, puis la fin, qui crée la conv avec eux. Rend la conv, la
 * série de ses écrans et la clé de l’envoi.
 */
export async function importerUneVideoPartielle(page: Page, testInfo: TestInfo): Promise<{ histoire: string; serie: string; cle: string }> {
  await prouverHumain(page.request, testInfo);
  const serie = randomUUID();
  /*
   * La moitié se tire de l’empreinte de la vidéo : on en essaie jusqu’à tomber dans la partielle (une sur deux), chacune
   * sous sa clé d’envoi, comme autant d’enregistrements (le plan se note par envoi : /admin compte chaque vidéo planifiée)
   */
  let video = "";
  let cle = "";
  for (let essai = 0; essai < 30 && !video; essai++) {
    const [v, c] = [randomUUID(), randomUUID()];
    const r = await poster(page, testInfo, "/api/captures/video/plan", { lots: LOTS_DE_LA_VIDEO, video: v, sensSur: true, cle: c, consentement: CASE_IMPORT.version });
    expect(r.status(), "le plan d’une longue vidéo").toBe(200);
    if (((await r.json()) as { lecture: string }).lecture === "partielle") [video, cle] = [v, c];
  }
  expect(video, "une vidéo de la moitié partielle").not.toBe("");
  /* Ses cinq lots les plus récents, lus par BLUSH, le plus récent d’abord */
  const lus: unknown[] = [];
  for (let j = LOTS_DE_LA_VIDEO - 1; j >= LOTS_GARDES; j--) {
    const r = await poster(page, testInfo, "/api/captures/lot", formulaireDuLot(serie, j, cle, j === LOTS_DE_LA_VIDEO - 1 ? { ordre: "premier" } : {}));
    expect(r.status(), `le lot ${j} est lu`).toBe(200);
    lus.unshift(((await r.json()) as { lot: unknown }).lot);
  }
  const partiel = { restants: LOTS_GARDES, ecrans: ECRANS_DE_LA_VIDEO, video, sensSur: true };
  const fin = (gardes: boolean) =>
    poster(page, testInfo, "/api/captures/video", { app: "imessage", lots: lus, cle, consentement: CASE_IMPORT.version, partiel: { ...partiel, ...(gardes ? { gardes } : {}) } });
  /* La question : une conv dense, la partie récente suffit au haut du paywall ; ses lots plus anciens sont à garder */
  expect(await (await fin(false)).json(), "la règle s’arrête au premier tour").toEqual({ suite: "garder", lots: LOTS_GARDES });
  for (let j = 0; j < LOTS_GARDES; j++)
    expect((await poster(page, testInfo, "/api/captures/ecrans", formulaireDuLot(serie, j, cle, { rang: String(j) }))).status(), `le lot ${j} est gardé`).toBe(200);
  const creee = await fin(true);
  expect(creee.status(), "la conv naît avec sa suite").toBe(200);
  return { histoire: ((await creee.json()) as { story: { id: string } }).story.id, serie, cle };
}
