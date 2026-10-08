/**
 * Les vocaux de la démo (Hugo & Sophie) : le script, dit par les deux voix de l’A/B test, puis minuté.
 * Écrit public/demo/vocal-<cas>-<voix>.mp3 et src/mocks/vocal-demo.json. À relancer quand le script ou les voix changent.
 *
 *   ELEVENLABS_API_KEY=… BLUSH_VOIX_A=… BLUSH_VOIX_B=… npx tsx scripts/vocal-demo.mts
 *   (sans ELEVENLABS_API_KEY, la clé est lue dans ~/.blush/ELEVENLABS_API_KEY)
 *   npx tsx scripts/vocal-demo.mts --minuter   (re-minute les audios déjà faits, sans rappeler la voix)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { minuter, texteDit, type Alignement, type LigneScript } from "@/lib/vocal";

const RACINE = join(import.meta.dirname, "..");
const ALIGNEMENTS = join(RACINE, "scripts/vocal-demo.alignements.json");
const reminuter = process.argv.includes("--minuter");
const VOIX = { A: process.env.BLUSH_VOIX_A ?? "", B: process.env.BLUSH_VOIX_B ?? "" };
if (!reminuter && (!VOIX.A || !VOIX.B)) throw new Error("BLUSH_VOIX_A et BLUSH_VOIX_B manquent");
const cle = reminuter ? "" : (process.env.ELEVENLABS_API_KEY ?? readFileSync(join(homedir(), ".blush/ELEVENLABS_API_KEY"), "utf8").trim());
const gardes: Record<string, Alignement> = reminuter ? JSON.parse(readFileSync(ALIGNEMENTS, "utf8")) : {};

type Recu = { from: "toi" | "elle"; text: string; caption: string };
const RECUS: Record<string, Recu> = {
  question: { from: "elle", text: "au fait on est quoi toi et moi mdr", caption: "Sophie · 2 mars, 23:41" },
  mdr: { from: "toi", text: "mdr", caption: "Toi · 2 mars, 23:42" },
  unjour: { from: "toi", text: "haha grave un jour", caption: "Toi · 6 mars" },
};
const l = (jeu: string | null, texte: string, punch = false, preuve: string | null = null): LigneScript => ({ jeu, texte, punch, preuve });

const CAS: Record<"hugo" | "sobre", { sobre: boolean; lignes: LigneScript[] }> = {
  hugo: {
    sobre: false,
    lignes: [
      l("sighs dramatically", "Bon. Hugo. Faut qu’on parle."),
      l("fast, gossiping", "Sophie t’écrit, à vingt-trois heures quarante et une : « au fait on est quoi toi et moi ».", false, "question"),
      l("in disbelief", "Et toi, tu réponds… « mdr ».", false, "mdr"),
      l("bursts out laughing", "MDR, frérot ?!", true),
      l(null, "Elle te parle de la Saint-Valentin. De sa sœur qui veut te rencontrer."),
      l("mocking, dumb voice", "Et toi : « haha grave un jour ».", false, "unjour"),
      l("outraged", "UN JOUR ?!", true),
      l(null, "Elle a fait tous les premiers pas. Le prochain, il est pour toi."),
      l("serious, slower", "Samedi, au libanais, au dessert : tu poses LA question.", true),
      l("mischievously", "Allez. Lis la suite."),
    ],
  },
  sobre: {
    sobre: true,
    lignes: [
      l("softly", "Hé. Hugo. Je vais être honnête avec toi."),
      l(null, "Sophie ne ressent pas la même chose."),
      l("slowly", "Elle répond encore, mais elle ne relance plus depuis trois semaines."),
      l("warmly", "Et ça, ça dit rien de ce que tu vaux. Ça dit juste où elle en est."),
      l(null, "Lis quand t’es prêt. Et après, je suis là. On en parle."),
    ],
  },
};

async function dire(texte: string, voix: string, sobre: boolean) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voix}/with-timestamps?output_format=mp3_44100_96`, {
    method: "POST",
    headers: { "xi-api-key": cle, "content-type": "application/json" },
    body: JSON.stringify({
      text: texte,
      model_id: "eleven_v4",
      voice_settings: sobre ? { stability: 0.5, similarity_boost: 0.75, style: 0.2 } : { stability: 0, similarity_boost: 0.75, style: 0.6 },
    }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
  const c = (await r.json()) as { audio_base64: string; alignment: Alignement };
  return { audio: Buffer.from(c.audio_base64, "base64"), alignement: c.alignment };
}

mkdirSync(join(RACINE, "public/demo"), { recursive: true });
const sortie: Record<string, unknown> = {};
for (const [nom, cas] of Object.entries(CAS)) {
  for (const [v, id] of Object.entries(VOIX)) {
    const { texte } = texteDit(cas.lignes);
    const fichier = `vocal-${nom}-${v.toLowerCase()}.mp3`;
    let alignement = gardes[fichier];
    if (!reminuter) {
      const dit = await dire(texte, id!, cas.sobre);
      writeFileSync(join(RACINE, "public/demo", fichier), dit.audio);
      alignement = gardes[fichier] = dit.alignement;
    }
    const lignes = minuter(cas.lignes, alignement).map((x, k) => (cas.lignes[k].preuve ? { ...x, recu: RECUS[cas.lignes[k].preuve!] } : x));
    const duree = Math.max(...alignement.character_end_times_seconds);
    sortie[`${nom}-${v}`] = { etat: "pret", audio: `/demo/${fichier}`, duree: Math.round(duree * 100) / 100, voix: v, sobre: cas.sobre, lignes };
    console.log(`${fichier} : ${duree.toFixed(1)} s`);
  }
}
writeFileSync(join(RACINE, "src/mocks/vocal-demo.json"), JSON.stringify(sortie, null, 1) + "\n");
if (!reminuter) writeFileSync(ALIGNEMENTS, JSON.stringify(gardes) + "\n");
