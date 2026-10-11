import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { boiteAMails, env } from "./env";
import { delaiAppel } from "./echeance";
import { mailCode } from "./mail-code";
import type { Mail } from "./marque";

/** Le plus long qu’on attend Resend pour un mail (une alerte aussi) : Resend qui ne répond pas ne doit retenir ni le rapport, ni la connexion. */
const DELAI_MAIL_MS = 15_000;

/**
 * Tests de bout en bout (BLUSH_BOITE_MAILS, jamais sur Vercel) : le mail est écrit dans la boîte, un fichier JSON par
 * mail et par destinataire, au lieu de partir. Écrit à côté puis renommé : un test qui lit la boîte ne tombe jamais sur
 * un mail à moitié écrit.
 */
async function deposer(boite: string, destinataires: string[], mail: Mail & { code?: string }): Promise<void> {
  await mkdir(boite, { recursive: true });
  for (const pour of destinataires) {
    const nom = join(boite, `${Date.now()}-${randomUUID()}`);
    await writeFile(`${nom}.tmp`, JSON.stringify({ pour, ...mail, envoye: new Date().toISOString() }));
    await rename(`${nom}.tmp`, `${nom}.json`);
  }
}

/** Resend a refusé le mail : son statut HTTP, rien d’autre (ni l’adresse, ni le contenu), qu’une alerte peut montrer. */
export class ErreurResend extends Error {
  constructor(readonly statut: number) {
    super(`Resend a répondu ${statut}`);
    this.name = "ErreurResend";
  }
}

/**
 * Envoie un mail, sa version texte et sa version HTML s’il en a une (une alerte de l’équipe n’en a pas), à un ou
 * plusieurs destinataires. `cle` : la clé du prestataire qui l’envoie, RESEND_API_KEY par défaut (les codes ont la
 * leur s’il y en a une : envoyerCodeParEmail). Sans clé (dev), seul son sujet s’affiche dans les logs. Rejette avec
 * ErreurResend si le prestataire le refuse : à l’appelant de dire ce qu’il en fait (une alerte, l’équipe prévenue).
 */
export async function envoyerMail(destinataires: string | string[], { sujet, texte, html }: Mail, { cle = env().RESEND_API_KEY }: { cle?: string } = {}): Promise<void> {
  const pour = typeof destinataires === "string" ? [destinataires] : destinataires;
  if (!pour.length) return;
  const boite = boiteAMails();
  if (boite) return deposer(boite, pour, { sujet, texte, ...(html !== undefined && { html }) });
  if (!cle) {
    console.log(`[dev] mail « ${sujet} » pour ${pour.join(", ")}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${cle}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env().BLUSH_EMAIL_FROM, to: pour, subject: sujet, text: texte, ...(html !== undefined && { html }) }),
    signal: AbortSignal.timeout(delaiAppel(DELAI_MAIL_MS, 2_000)),
  });
  if (!r.ok) throw new ErreurResend(r.status);
}

/** La clé qui envoie les codes : la leur (RESEND_API_KEY_CODES, un quota à part), sinon celle de tous les mails. */
const cleDesCodes = () => env().RESEND_API_KEY_CODES ?? env().RESEND_API_KEY;

/** Envoie le code de connexion. Sans clé (dev), il s’affiche dans les logs du serveur. */
export async function envoyerCodeParEmail(email: string, code: string): Promise<void> {
  const { BLUSH_URL } = env();
  const boite = boiteAMails();
  /* La boîte des tests garde aussi le code seul : le test le lit sans fouiller le HTML */
  if (boite) return deposer(boite, [email], { ...mailCode(code, BLUSH_URL), code });
  const cle = cleDesCodes();
  if (!cle) {
    console.log(`[dev] code de connexion pour ${email} : ${code}`);
    return;
  }
  await envoyerMail(email, mailCode(code, BLUSH_URL), { cle });
}
