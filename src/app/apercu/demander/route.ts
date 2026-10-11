import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ReponseDemandee } from "@prompts/lib/apercu";
import { hoteLocal } from "@/lib/hote-local";
import { configDuChatLocal } from "@/server/drapeaux";
import { bullesAffichees } from "@/server/ecrans/chat";
import { messagesAffiches } from "@/server/ecrans/messages";
import { lireCorps, memeOrigine } from "@/server/http";
import { FIL_MAX, PAS_DE_REPONSE, TEXTE_MAX } from "./bornes";

export const dynamic = "force-dynamic";

/* `lanceur` : prompts/evals/lancer.mts ; `memoires` : le dossier des mémoires des convs de test (une par conv, `01.json`…) */
type Config = { lanceur: string; cas: string; memoire: string; memoires?: string; cle: string; workspace?: string };

const Demande = z.object({
  text: z.string().trim().min(1).max(TEXTE_MAX),
  history: z
    .array(z.object({ from: z.enum(["toi", "blush"]), text: z.string().max(TEXTE_MAX) }))
    .max(FIL_MAX)
    .default([]),
});

/**
 * Hors de Vercel seulement (src/proxy.ts), et avec BLUSH_DEMANDER : pose une question au vrai chat (prompt 10), à partir
 * de la mémoire (prompt 07), via le lanceur des prompts (lancé par tsx). La config (des chemins, jamais la clé elle-même)
 * est dans le fichier BLUSH_DEMANDER. Le lanceur rend la sortie brute du chat et les lignes qu’elle peut citer
 * (ReponseDemandee, prompts/lib/apercu.ts) : la réponse est mise en bulles ici, comme celles de l’appli
 * (src/server/ecrans). Ce poste seulement (le proxy le vérifie déjà pour tout /apercu : src/proxy.ts ; la route le
 * revérifie, elle ne dépend pas du matcher), une question et un fil bornés (Demande, ./bornes.ts) : 400 sinon.
 */
export async function POST(req: Request) {
  const chemin = configDuChatLocal();
  if (!chemin) return new Response(null, { status: 404 });
  /* Elle appelle le vrai modèle avec ta clé : une page d’un autre site ne doit pas pouvoir la déclencher */
  if (!memeOrigine(req) || !hoteLocal(req.headers)) return new Response(null, { status: 403 });
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
    const p = spawn(process.execPath, ["--import", "tsx", conf.lanceur, "10", ...quelle, "--demande", text, "--historique", JSON.stringify(history)], { env });
    let s = "";
    p.stdout.on("data", (d) => (s += d));
    p.stderr.on("data", (d) => (s += d));
    p.on("close", () => ok(s));
    p.on("error", ko);
  });
  const ligne = sortie.split("\n").find((l) => l.startsWith("@@BLUSH@@"));
  const lu = ligne ? reponseLue(ligne.slice("@@BLUSH@@".length)) : null;
  if (!lu?.sortie) {
    console.error(sortie.slice(-1500));
    return Response.json(PAS_DE_REPONSE);
  }
  return Response.json(bullesAffichees(lu.sortie, messagesAffiches(new Map(lu.lignes), lu.prenom)));
}

/** La réponse du lanceur, lue par son schéma ; null si elle est illisible. */
function reponseLue(texte: string): ReponseDemandee | null {
  try {
    const ok = ReponseDemandee.safeParse(JSON.parse(texte));
    return ok.success ? ok.data : null;
  } catch {
    return null;
  }
}
