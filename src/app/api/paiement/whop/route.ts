import { erreur, repondre, route } from "@/server/http";
import { recevoirWebhook } from "@/server/paiement/webhook";

/* Un paiement livré relance la chaîne du rapport après la réponse (after) : elle a la durée d’une fonction de la chaîne */
export const maxDuration = 300;

/** Un webhook de Whop ne pèse que quelques Ko : au-delà, il n’en est pas un. */
const CORPS_MAX = 256 * 1024;

/**
 * Les webhooks de Whop (ou du faux Whop), hors de la garde commune : Whop n’est pas l’appli, sa requête n’a pas notre
 * origine. Seule sa signature compte (401 « interdit » sinon ; une signature fausse prévient l’équipe) : src/server/paiement/webhook.ts.
 * Le corps se lit brut, tel quel : la signature porte sur ses octets.
 */
export const POST = route("POST /api/paiement/whop", async (req: Request) => {
  if (Number(req.headers.get("content-length") ?? 0) > CORPS_MAX) return erreur("invalide");
  const corps = await req.text();
  if (corps.length > CORPS_MAX) return erreur("invalide");
  return (await recevoirWebhook(corps, req.headers)) === "ok" ? repondre("POST /api/paiement/whop", { ok: true }) : erreur("interdit");
});
