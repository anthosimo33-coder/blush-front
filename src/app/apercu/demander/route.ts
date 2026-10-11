import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { configDuChatLocal } from "@/server/drapeaux";
import { lireCorps, memeOrigine } from "@/server/http";

export const dynamic = "force-dynamic";

/* `memoires` : le dossier des mémoires des convs de test (une par conv, `01.json`…) */
type Config = { lanceur: string; cas: string; memoire: string; memoires?: string; cle: string; workspace?: string };

/** Une question, et chaque message du fil, au plus : la limite d’un message du vrai chat (src/app/api/chat/route.ts). */
const TEXTE_MAX = 4000;
/** Le fil déjà échangé, au plus (celui qu’envoie l’aperçu : src/app/apercu/accueil/ApercuAccueil.tsx). */
const FIL_MAX = 6;

const Demande = z.object({
  text: z.string().trim().min(1).max(TEXTE_MAX),
  history: z
    .array(z.object({ from: z.enum(["toi", "blush"]), text: z.string().max(TEXTE_MAX) }))
    .max(FIL_MAX)
    .default([]),
});

/** Les noms de ce poste : l’aperçu ne répond qu’à eux (next dev écoute sur 127.0.0.1, scripts/developper.mjs). */
const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * La requête vise-t-elle ce poste ? L’hôte qu’elle demande (Host, et X-Forwarded-Host s’il y en a un) doit en être un nom :
 * un appareil du Wi-Fi qui joint un next dev lancé sur toutes les interfaces (-H 0.0.0.0) demande l’adresse du poste
 * sur le réseau, et un site qui ferait pointer son domaine sur 127.0.0.1 (DNS rebinding) demande le sien.
 */
function hoteLocal(req: Request): boolean {
  const hotes = [req.headers.get("host"), req.headers.get("x-forwarded-host")].filter((h) => h !== null);
  if (!hotes.length) return false;
  return hotes.every((h) => {
    try {
      return HOTES_LOCAUX.has(new URL(`http://${h}`).hostname);
    } catch {
      return false;
    }
  });
}

/**
 * Hors de Vercel seulement (src/proxy.ts), et avec BLUSH_DEMANDER : pose une question au vrai chat (prompt 10), à partir
 * de la mémoire (prompt 07), via le lanceur des prompts. La config (des chemins, jamais la clé elle-même) est dans le
 * fichier BLUSH_DEMANDER. Ce poste seulement (hoteLocal), une question et un fil bornés (Demande) : 400 sinon.
 */
export async function POST(req: Request) {
  const chemin = configDuChatLocal();
  if (!chemin) return new Response(null, { status: 404 });
  /* Elle appelle le vrai modèle avec ta clé : une page d’un autre site ne doit pas pouvoir la déclencher */
  if (!memeOrigine(req) || !hoteLocal(req)) return new Response(null, { status: 403 });
  const conf = JSON.parse(await readFile(chemin, "utf8")) as Config;
  /* Ta conv (?cas=perso, ou sans cas) : sa mémoire et son cas, gardés hors du projet. Une conv de test : sa mémoire, à la date de la conv. */
  const id = new URL(req.url).searchParams.get("cas");
  const test = id && id !== "perso" ? (/^\d{2}$/.test(id) && conf.memoires ? join(conf.memoires, `${id}.json`) : null) : undefined;
  if (test === null || (test && !existsSync(test))) return new Response(null, { status: 404 });
  const quelle = test ? ["--memoire", test, "--aujourdhui", "fin"] : ["--cas-perso", conf.cas, "--memoire", conf.memoire];
  const demande = await lireCorps(req, Demande);
  if (!demande) return new Response(null, { status: 400 });
  const { text, history } = demande;
  const env = {
    // eslint-disable-next-line no-restricted-syntax -- le lanceur hérite de l’environnement du serveur local, plus la clé lue dans son fichier
    ...process.env,
    ANTHROPIC_API_KEY: (await readFile(conf.cle, "utf8")).trim(),
    ...(conf.workspace ? { ANTHROPIC_WORKSPACE_ID: (await readFile(conf.workspace, "utf8")).trim() } : {}),
  };
  const sortie = await new Promise<string>((ok, ko) => {
    const p = spawn(process.execPath, [conf.lanceur, "10", ...quelle, "--demande", text, "--historique", JSON.stringify(history)], { env });
    let s = "";
    p.stdout.on("data", (d) => (s += d));
    p.stderr.on("data", (d) => (s += d));
    p.on("close", () => ok(s));
    p.on("error", ko);
  });
  const ligne = sortie.split("\n").find((l) => l.startsWith("@@BLUSH@@"));
  if (!ligne) {
    console.error(sortie.slice(-1500));
    return Response.json({ kind: "bubbles", bubbles: [{ text: "j’ai pas réussi à te répondre, réessaie" }] });
  }
  return new Response(ligne.slice("@@BLUSH@@".length), { headers: { "content-type": "application/json" } });
}
