import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import type postgres from "postgres";
import { chiffrer, dechiffrer, sql } from "./base";
import { origine } from "./compte";
import { pagePrete, RESEAU } from "./page";

/*
 * Les aides du partage (tests/e2e/partage*.spec.ts) : la feuille « Partager mon verdict », le lien public d’un compte,
 * un verdict qui nomme les deux personnes (pour voir le masque), les compteurs du tableau de bord, et les images.
 */

/**
 * Ouvre « Partager mon verdict » (par défaut, celui du rapport) et attend que le lien soit prêt : il est créé à
 * l’ouverture, et WhatsApp ne devient un lien qu’avec lui. La page vient parfois d’être rechargée en entier (le verdict
 * mène au rapport par window.location) : on attend qu’elle soit vivante. Renvoie la feuille.
 */
export async function ouvrirLePartage(page: Page, bouton = page.getByRole("main").getByRole("button", { name: "Partager mon verdict" })): Promise<Locator> {
  await pagePrete(page);
  const feuille = page.getByRole("dialog", { name: "Partager ton verdict" });
  await bouton.click();
  await expect(feuille).toBeVisible();
  await expect(feuille.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\//);
  return feuille;
}

/**
 * Crée le lien public du verdict de la conv ouverte par la route de la feuille (POST /api/partage), sans l’écran.
 * Il compte comme une ouverture de la feuille : à faire dans mesurerCompteurs. Renvoie l’identifiant du lien (/v/<id>).
 */
export async function partagerParApi(page: Page, testInfo: TestInfo): Promise<string> {
  const r = await page.request.post("/api/partage", { headers: origine(testInfo), timeout: RESEAU });
  expect(r.status(), "le lien du verdict est créé").toBe(200);
  return ((await r.json()) as { id: string }).id;
}

/** Les liens de partage des histoires du compte (leur identifiant, /v/<id>) : un au plus par histoire, aucun s’il est désactivé. */
export async function liensDe(email: string): Promise<string[]> {
  const lignes = await sql()<{ id: string }[]>`
    select sh.id from shares sh join stories s on s.id = sh.story_id join users u on u.id = s.user_id
    where u.email = ${email.toLowerCase()} order by s.created_at`;
  return lignes.map((l) => l.id);
}

/* ———— Le verdict, réécrit dans la base ———— */

/**
 * Réécrit le titre et le sous-titre du verdict de la dernière histoire du compte. Le modèle factice n’écrit jamais de
 * prénom : c’est le seul moyen de voir, de bout en bout, ce que le partage fait des prénoms. À faire avant d’ouvrir la
 * feuille de partage (le lien reprend le verdict à chaque ouverture).
 */
export async function reecrireVerdict(email: string, { titre, sousTitre }: { titre: string; sousTitre: string }): Promise<void> {
  const [v] = await sql()<{ storyId: string; data: Uint8Array }[]>`
    select v.story_id as "storyId", v.data from verdicts v join stories s on s.id = v.story_id join users u on u.id = s.user_id
    where u.email = ${email.toLowerCase()} order by s.created_at desc limit 1`;
  if (!v) throw new Error(`aucun verdict pour ${email}`);
  const donnees = dechiffrer<{ sortie: Record<string, unknown> }>(v.data);
  const data = chiffrer({ ...donnees, sortie: { ...donnees.sortie, titre, sous_titre: sousTitre } });
  await sql()`update verdicts set data = ${data} where story_id = ${v.storyId}`;
}

/* ———— Les compteurs du tableau de bord ———— */

/** Les compteurs du partage (src/server/compteurs.ts, CLES). */
const COMPTEURS_PARTAGE = ["partage_ouvert", "lien_cree", "lien_apercu", "lien_vu", "lien_essai", "import_partage", "image_partagee"] as const;
type CompteurPartage = (typeof COMPTEURS_PARTAGE)[number];
type Compteurs = Record<CompteurPartage, number>;

/** Les compteurs du partage, depuis le jour `depuisLe` (heure de Paris) : un geste à cheval sur minuit compte encore. */
async function compteursDepuis(q: postgres.TransactionSql, depuisLe: string): Promise<Compteurs> {
  const lignes = await q<{ cle: CompteurPartage; n: number }[]>`
    select key as cle, sum(count)::int as n from counters
    where day >= ${depuisLe}::date and key in ${q([...COMPTEURS_PARTAGE])} group by key`;
  return Object.fromEntries(COMPTEURS_PARTAGE.map((k) => [k, lignes.find((l) => l.cle === k)?.n ?? 0])) as Compteurs;
}

/* Un verrou de Postgres, le même pour tous les tests du partage : un geste mesuré à la fois (voir mesurerCompteurs) */
const VERROU_COMPTEURS = 54_120_905;
/*
 * Les compteurs que le serveur ajoute après sa réponse (after() : src/app/v/[id]/page.tsx, src/app/v/[id]/image/route.tsx,
 * src/app/v/[id]/essayer/route.ts). Après l’attendu, on relit encore une fois, un peu plus tard : un compte en trop,
 * arrivé après la réponse, se voit, au lieu de tomber dans la mesure suivante (celle d’un autre test).
 */
const APRES_LA_REPONSE = 750;

/**
 * Fait `geste` et vérifie ce qu’il a ajouté aux compteurs du partage : exactement `attendus`, les autres à zéro.
 *
 * Les compteurs sont ceux de chaque jour, pour tout le serveur : les deux navigateurs et les autres fichiers comptent dans les
 * mêmes lignes. Un verrou de Postgres (pg_advisory_xact_lock) laisse un seul geste mesuré à la fois : chaque geste qui
 * compte, dans les tests du partage, passe donc par ici. Certains comptes se font après la réponse (after() du
 * serveur) : on relit jusqu’à les voir, puis une dernière fois un peu plus tard, toujours sous le verrou.
 *
 * Tous les compteurs sont comparés, lien_essai compris : la page d’un verdict partagé ne précharge plus « Analyser ma
 * conv » (src/app/v/[id]/page.tsx, prefetch={false}), seul un vrai clic compte un essai (partage-lien.spec.ts).
 */
export async function mesurerCompteurs<T>(geste: () => Promise<T>, attendus: Partial<Compteurs>): Promise<T> {
  const voulu = Object.fromEntries(COMPTEURS_PARTAGE.map((k) => [k, attendus[k] ?? 0]));
  return (
    await sql().begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${VERROU_COMPTEURS})`;
      const { jour } = (await tx<{ jour: string }[]>`select ((now() at time zone 'Europe/Paris')::date)::text as jour`)[0]!;
      const avant = await compteursDepuis(tx, jour);
      const resultat = await geste();
      const ecart = async () => {
        const apres = await compteursDepuis(tx, jour);
        return Object.fromEntries(COMPTEURS_PARTAGE.map((k) => [k, apres[k] - avant[k]]));
      };
      await expect.poll(ecart, { message: "les compteurs du partage" }).toEqual(voulu);
      await new Promise((r) => setTimeout(r, APRES_LA_REPONSE));
      expect(await ecart(), "les compteurs du partage, y compris ceux faits après la réponse").toEqual(voulu);
      return [resultat];
    })
  )[0] as T;
}

/* ———— La feuille de partage du système ———— */

/**
 * Ce navigateur sait-il partager un fichier (navigator.canShare, comme Safari sur iPhone) ? Là, « Story » et « Partager »
 * ouvrent la feuille de partage du système ; ailleurs (un ordinateur), l’image s’enregistre. Le partage n’existe que
 * sur une page sûre : lu sur la page affichée, après avoir ouvert l’accueil de l’appli si c’est encore une page vide.
 */
export async function partageDeFichiers(page: Page): Promise<boolean> {
  if (page.url() === "about:blank") await page.goto("/");
  return page.evaluate(() => {
    try {
      return !!navigator.canShare?.({ files: [new File(["x"], "x.png", { type: "image/png" })] });
    } catch {
      return false;
    }
  });
}

/** Un fichier donné à la feuille de partage du système : son nom, son type, son poids en octets. */
export type FichierPartage = { nom: string; type: string; octets: number };

/**
 * Remplace la feuille de partage du système (navigator.share), que Playwright ne pilote pas, par une feuille qui note
 * les fichiers qu’on lui donne, puis se ferme comme après un partage. À appeler avant d’ouvrir la page, là où le
 * navigateur sait partager un fichier (partageDeFichiers). Renvoie de quoi relire ce qui a été partagé.
 */
export async function noterLaFeuilleDuSysteme(page: Page): Promise<() => Promise<FichierPartage[]>> {
  await page.addInitScript(() => {
    const partages: { nom: string; type: string; octets: number }[] = [];
    Object.assign(window, { __partagesDuTest: partages });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (donnees: ShareData) => {
        for (const f of donnees.files ?? []) partages.push({ nom: f.name, type: f.type, octets: f.size });
      },
    });
  });
  return () => page.evaluate(() => (window as unknown as { __partagesDuTest?: FichierPartage[] }).__partagesDuTest ?? []);
}

/* ———— Les images ———— */

/**
 * Le temps qu’une image dessinée par le serveur (next/og) peut prendre : la première d’un serveur charge ses polices,
 * son moteur (wasm) et ses emojis ; sur une machine chargée, plus de dix secondes.
 */
export const DESSIN = 60_000;

/** La largeur et la hauteur d’un PNG (son en-tête IHDR), ou null si ce n’est pas un PNG. */
export function taillePng(octets: Buffer): { largeur: number; hauteur: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (octets.length < 24 || !octets.subarray(0, 8).equals(signature) || octets.toString("ascii", 12, 16) !== "IHDR") return null;
  return { largeur: octets.readUInt32BE(16), hauteur: octets.readUInt32BE(20) };
}

/** Le robot de WhatsApp qui dessine l’aperçu d’un lien collé dans une conv (src/server/compteurs.ts, estUnRobot). */
export const ROBOT_WHATSAPP = "WhatsApp/2.24.20.79 i";
