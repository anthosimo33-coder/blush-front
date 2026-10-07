import { env } from "@/server/env";
import { erreur, json } from "@/server/http";
import { purger } from "@/server/purge";

/** Appelée chaque nuit par Vercel Cron (vercel.json), avec le secret CRON_SECRET. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return erreur("interdit", 401);
  return json(await purger());
}
