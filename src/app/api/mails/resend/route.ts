import { CORPS_MAX_RESEND, recevoirEvenementResend } from "@/server/delivrabilite";
import { erreur, repondre, route } from "@/server/http";

/**
 * Les webhooks de Resend (ce qui arrive à chaque mail : remis, rebond, plainte…), hors de la garde commune : Resend
 * n’est pas l’appli, sa requête n’a pas notre origine. Seule sa signature compte (401 « interdit » sinon ; une signature
 * fausse prévient l’équipe) : src/server/delivrabilite.ts. Le corps se lit brut, tel quel : la signature porte sur ses octets.
 */
export const POST = route("POST /api/mails/resend", async (req: Request) => {
  if (Number(req.headers.get("content-length") ?? 0) > CORPS_MAX_RESEND) return erreur("invalide");
  const corps = await req.text();
  if (corps.length > CORPS_MAX_RESEND) return erreur("invalide");
  return (await recevoirEvenementResend(corps, req.headers)) === "ok" ? repondre("POST /api/mails/resend", { ok: true }) : erreur("interdit");
});
