import "server-only";
import { env } from "./env";
import { delaiAppel } from "./echeance";
import { mailCode } from "./mail-code";

type Mail = { sujet: string; texte: string; html: string };

/** Envoie un mail (sa version HTML et sa version texte). Sans clé Resend (dev), seul son sujet s’affiche dans les logs. */
export async function envoyerMail(email: string, { sujet, texte, html }: Mail): Promise<void> {
  const { RESEND_API_KEY, BLUSH_EMAIL_FROM } = env();
  if (!RESEND_API_KEY) {
    console.log(`[dev] mail « ${sujet} » pour ${email}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: BLUSH_EMAIL_FROM, to: [email], subject: sujet, text: texte, html }),
    /* Resend qui ne répond pas ne doit pas retenir le rapport (ni la connexion) */
    signal: AbortSignal.timeout(delaiAppel(15_000, 2_000)),
  });
  if (!r.ok) throw new Error(`Resend : ${r.status}`);
}

/** Envoie le code de connexion. Sans clé Resend (dev), il s’affiche dans les logs du serveur. */
export async function envoyerCodeParEmail(email: string, code: string): Promise<void> {
  const { RESEND_API_KEY, BLUSH_URL } = env();
  if (!RESEND_API_KEY) {
    console.log(`[dev] code de connexion pour ${email} : ${code}`);
    return;
  }
  await envoyerMail(email, mailCode(code, BLUSH_URL));
}
