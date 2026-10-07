import "server-only";
import { env } from "./env";

/** Envoie le code de connexion. Sans clé Resend (dev), il s’affiche dans les logs du serveur. */
export async function envoyerCodeParEmail(email: string, code: string): Promise<void> {
  const { RESEND_API_KEY, BLUSH_EMAIL_FROM } = env();
  if (!RESEND_API_KEY) {
    console.log(`[dev] code de connexion pour ${email} : ${code}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: BLUSH_EMAIL_FROM,
      to: [email],
      subject: `${code} : ton code BLUSH`,
      text: `Ton code BLUSH : ${code}\n\nIl marche 10 minutes. Si tu n’as rien demandé, ignore ce message.`,
    }),
  });
  if (!r.ok) throw new Error(`Resend : ${r.status}`);
}
