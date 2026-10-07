import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

export const dynamic = "force-dynamic";

type Config = { lanceur: string; cas: string; memoire: string; cle: string; workspace?: string };

/**
 * En local seulement : pose une question au vrai chat (prompt 10), à partir de la mémoire (prompt 07),
 * via le lanceur des prompts. La config (des chemins, jamais la clé elle-même) est dans le fichier BLUSH_DEMANDER.
 */
export async function POST(req: Request) {
  const chemin = process.env.BLUSH_DEMANDER;
  if (process.env.NODE_ENV === "production" || !chemin) return new Response(null, { status: 404 });
  const conf = JSON.parse(await readFile(chemin, "utf8")) as Config;
  const { text, history = [] } = (await req.json()) as { text: string; history?: { from: "toi" | "blush"; text: string }[] };
  const env = {
    ...process.env,
    ANTHROPIC_API_KEY: (await readFile(conf.cle, "utf8")).trim(),
    ...(conf.workspace ? { ANTHROPIC_WORKSPACE_ID: (await readFile(conf.workspace, "utf8")).trim() } : {}),
  };
  const sortie = await new Promise<string>((ok, ko) => {
    const p = spawn(process.execPath, [conf.lanceur, "10", "--cas-perso", conf.cas, "--memoire", conf.memoire, "--demande", text, "--historique", JSON.stringify(history)], { env });
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
