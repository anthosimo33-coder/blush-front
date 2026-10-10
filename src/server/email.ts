import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { boiteAMails, env } from "./env";
import { delaiAppel } from "./echeance";
import { mailCode } from "./mail-code";

type Mail = { sujet: string; texte: string; html: string };

/** Le plus long qu’on attend Resend pour un mail (une alerte aussi) : Resend qui ne répond pas ne doit retenir ni le rapport, ni la connexion. */
export const DELAI_MAIL_MS = 15_000;

/**
 * Tests de bout en bout (BLUSH_BOITE_MAILS, jamais sur Vercel) : le mail est écrit dans la boîte, un fichier JSON par
 * mail, au lieu de partir. Écrit à côté puis renommé : un test qui lit la boîte ne tombe jamais sur un mail à moitié écrit.
 */
async function deposer(boite: string, pour: string, mail: Mail & { code?: string }): Promise<void> {
  await mkdir(boite, { recursive: true });
  const nom = join(boite, `${Date.now()}-${randomUUID()}`);
  await writeFile(`${nom}.tmp`, JSON.stringify({ pour, ...mail, envoye: new Date().toISOString() }));
  await rename(`${nom}.tmp`, `${nom}.json`);
}

/** Resend a refusé le mail : son statut HTTP, rien d’autre (ni l’adresse, ni le contenu), qu’une alerte peut montrer. */
export class ErreurResend extends Error {
  constructor(readonly statut: number) {
    super(`Resend a répondu ${statut}`);
    this.name = "ErreurResend";
  }
}

/** Envoie un mail (sa version HTML et sa version texte). Sans clé Resend (dev), seul son sujet s’affiche dans les logs. */
export async function envoyerMail(email: string, { sujet, texte, html }: Mail): Promise<void> {
  const { RESEND_API_KEY, BLUSH_EMAIL_FROM } = env();
  const boite = boiteAMails();
  if (boite) return deposer(boite, email, { sujet, texte, html });
  if (!RESEND_API_KEY) {
    console.log(`[dev] mail « ${sujet} » pour ${email}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: BLUSH_EMAIL_FROM, to: [email], subject: sujet, text: texte, html }),
    signal: AbortSignal.timeout(delaiAppel(DELAI_MAIL_MS, 2_000)),
  });
  if (!r.ok) throw new ErreurResend(r.status);
}

/** Envoie le code de connexion. Sans clé Resend (dev), il s’affiche dans les logs du serveur. */
export async function envoyerCodeParEmail(email: string, code: string): Promise<void> {
  const { RESEND_API_KEY, BLUSH_URL } = env();
  const boite = boiteAMails();
  /* La boîte des tests garde aussi le code seul : le test le lit sans fouiller le HTML */
  if (boite) return deposer(boite, email, { ...mailCode(code, BLUSH_URL), code });
  if (!RESEND_API_KEY) {
    console.log(`[dev] code de connexion pour ${email} : ${code}`);
    return;
  }
  await envoyerMail(email, mailCode(code, BLUSH_URL));
}
