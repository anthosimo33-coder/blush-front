import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { configDuChatLocal } from "@/server/drapeaux";
import { memeOrigine } from "@/server/http";

export const dynamic = "force-dynamic";

/* `memoires` : le dossier des mémoires des convs de test (une par conv, `01.json`…) */
type Config = { lanceur: string; cas: string; memoire: string; memoires?: string; cle: string; workspace?: string };

/**
 * Hors de Vercel seulement (src/proxy.ts), et avec BLUSH_DEMANDER : pose une question au vrai chat (prompt 10), à partir
 * de la mémoire (prompt 07), via le lanceur des prompts. La config (des chemins, jamais la clé elle-même) est dans le
 * fichier BLUSH_DEMANDER.
 */
export async function POST(req: Request) {
  const chemin = configDuChatLocal();
  if (!chemin) return new Response(null, { status: 404 });
  /* Elle appelle le vrai modèle avec ta clé : une page d’un autre site ne doit pas pouvoir la déclencher */
  if (!memeOrigine(req)) return new Response(null, { status: 403 });
  const conf = JSON.parse(await readFile(chemin, "utf8")) as Config;
  /* Ta conv (?cas=perso, ou sans cas) : sa mémoire et son cas, gardés hors du projet. Une conv de test : sa mémoire, à la date de la conv. */
  const id = new URL(req.url).searchParams.get("cas");
  const test = id && id !== "perso" ? (/^\d{2}$/.test(id) && conf.memoires ? join(conf.memoires, `${id}.json`) : null) : undefined;
  if (test === null || (test && !existsSync(test))) return new Response(null, { status: 404 });
  const quelle = test ? ["--memoire", test, "--aujourdhui", "fin"] : ["--cas-perso", conf.cas, "--memoire", conf.memoire];
  const { text, history = [] } = (await req.json()) as { text: string; history?: { from: "toi" | "blush"; text: string }[] };
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
