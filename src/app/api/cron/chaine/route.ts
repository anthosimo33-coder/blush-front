import { after } from "next/server";
import { z } from "zod";
import { empreinte, memeEmpreinte } from "@/server/chiffrement";
import { env } from "@/server/env";
import { erreur, repondre, route } from "@/server/http";
import { relancerChaine } from "@/server/pipeline";
import { RELAIS_MAX } from "@/server/relais";

/* La chaîne qu’elle reprend tourne après sa réponse : la fonction vit autant que l’échéance de la chaîne le suppose */
export const maxDuration = 300;

/** Ce que le relais donne : l’histoire, et le rang du relais (que la chaîne reprise rend au suivant). */
const Relais = z.object({ histoire: z.string().uuid(), relais: z.coerce.number().int().min(1).max(RELAIS_MAX) });

/**
 * Le relais de la chaîne (src/server/relais.ts) : une fonction à court de temps y passe la chaîne d’une histoire, avec
 * le secret CRON_SECRET, comparé à temps constant comme pour la purge. Elle répond tout de suite, puis reprend la chaîne
 * après la réponse, avec tout son temps. Ni compte ni contenu : l’identifiant de l’histoire et le rang du relais.
 */
export const GET = route("GET /api/cron/chaine", async (req: Request) => {
  const secret = env().CRON_SECRET;
  if (!secret || !memeEmpreinte(req.headers.get("authorization") ?? "", empreinte(`Bearer ${secret}`))) return erreur("interdit");
  const lu = Relais.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!lu.success) return erreur("invalide");
  const { histoire, relais } = lu.data;
  after(() => relancerChaine(histoire, { relais }));
  return repondre("GET /api/cron/chaine", { ok: true });
});
