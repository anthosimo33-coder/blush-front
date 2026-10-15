import "server-only";
import { env } from "./env";
import { journalErreur } from "./journal";

/*
 * Le second canal des alertes de l’équipe : un message Telegram (son bot, TELEGRAM_BOT_TOKEN, dans la conversation
 * TELEGRAM_CHAT_ID). Il ne dépend pas du prestataire de mails : si Resend tombe (une carte expirée, un domaine
 * dé-vérifié), l’équipe le sait quand même (src/server/alertes.ts). Du texte brut, sans mise en forme ni aperçu de lien :
 * rien de ce qu’il contient n’est interprété. Jamais de contenu : les mêmes lignes que l’alerte par mail.
 */

/** Ce qu’attend Telegram avant d’abandonner : une alerte ne fait jamais attendre ce qui l’envoie. */
const DELAI_MS = 5_000;
/** La longueur d’un message Telegram, au plus (4096 caractères). */
const MESSAGE_MAX = 4000;

/** Envoie ce texte à l’équipe sur Telegram. Vrai s’il est parti ; faux sans bot branché, ou si Telegram refuse (le journal le dit). */
export async function envoyerSurTelegram(texte: string): Promise<boolean> {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = env();
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: texte.slice(0, MESSAGE_MAX), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(DELAI_MS),
      cache: "no-store",
    });
    if (r.ok) return true;
    /* Le statut seul : l’adresse appelée contient le jeton du bot, elle ne va jamais au journal */
    journalErreur("alerte Telegram refusée", new Error(`Telegram a répondu ${r.status}`), { statut: r.status });
  } catch (e) {
    journalErreur("alerte Telegram non envoyée", e instanceof Error ? new Error(e.name) : e);
  }
  return false;
}
