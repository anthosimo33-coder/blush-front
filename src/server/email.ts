import "server-only";
import { env } from "./env";
import { mailCode } from "./mail-code";

/** Envoie le code de connexion. Sans clé Resend (dev), il s’affiche dans les logs du serveur. */
export async function envoyerCodeParEmail(email: string, code: string): Promise<void> {
  const { RESEND_API_KEY, BLUSH_EMAIL_FROM, BLUSH_URL } = env();
  if (!RESEND_API_KEY) {
    console.log(`[dev] code de connexion pour ${email} : ${code}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
    /* Le mail aux couleurs de BLUSH, et sa version texte pour les messageries qui n’affichent pas le HTML */
    body: (({ sujet, texte, html }) => JSON.stringify({ from: BLUSH_EMAIL_FROM, to: [email], subject: sujet, text: texte, html }))(mailCode(code, BLUSH_URL)),
  });
  if (!r.ok) throw new Error(`Resend : ${r.status}`);
}
