import "server-only";
import { env } from "./env";
import { envoyerMail } from "./email";
import { enLocal, journal, journalErreur } from "./journal";
import { LIMITES, limiteAtteinte, sousLaLimite } from "./limites";
import { envoyerSurTelegram } from "./telegram";

/*
 * Les alertes de l’équipe, par mail (BLUSH_ALERTES) : un échec définitif, un plafond qui approche. Le résumé de chaque
 * nuit part par le même chemin (src/server/veille.ts). Jamais de contenu : des codes d’erreur, des identifiants, des
 * comptes et des coûts. Ce module n’importe ni la voix ni les vocaux : tout ce qui alerte peut l’importer sans cycle.
 * Le second canal, Telegram (src/server/telegram.ts, s’il est branché), ne dépend pas du prestataire de mails : les
 * alertes importantes y partent aussi, et toute alerte ou tout résumé dont le mail échoue (OPS-3).
 */

/**
 * Un mail à l’équipe, hors du budget des alertes (le résumé de la nuit, une fois par nuit). Par le même chemin que tous
 * les mails (src/server/email.ts) : un refus du prestataire le fait rejeter. En local, sans clé, il s’écrit dans le
 * terminal du serveur de dev.
 */
export async function envoyerALEquipe(sujet: string, lignes: string[], { aussiSurTelegram = false }: { aussiSurTelegram?: boolean } = {}): Promise<void> {
  const { BLUSH_ALERTES, RESEND_API_KEY } = env();
  if (!BLUSH_ALERTES.length) return;
  if (!RESEND_API_KEY) {
    /* En local : l’alerte s’écrit dans le terminal du serveur de dev, en clair, pour qu’on la lise */
    enLocal(`[dev] alerte : ${sujet}\n${lignes.join("\n")}`);
    return;
  }
  /* Dans le quota du prestataire, une alerte passe avant la liste d’attente, après les rapports (plafondsDesMails) */
  try {
    await envoyerMail(BLUSH_ALERTES, { sujet, texte: lignes.join("\n") }, { sorte: "alerte" });
  } catch (e) {
    /* Le mail n’est pas parti (le prestataire en panne, sa clé refusée) : Telegram le dit, et dit pourquoi le mail manque */
    await envoyerSurTelegram([sujet, ...lignes, "", "(Le mail de cette alerte n’est pas parti : le prestataire de mails est peut-être en panne.)"].join("\n"));
    throw e;
  }
  /* Une alerte importante part aussi sur Telegram, même quand le mail passe : elle ne doit pas attendre qu’on lise ses mails */
  if (aussiSurTelegram) await envoyerSurTelegram([sujet, ...lignes].join("\n"));
}

/*
 * Le budget des alertes (S-19). Une seule clé pour toutes (30 par jour) s’épuisait sur un seul sujet : une rafale de
 * replis du modèle, et l’échec d’un rapport ou le budget de l’IA atteint ne partaient plus. Chaque sujet a donc sa part
 * du jour (LIMITES.alertesParSujet), et les dernières alertes du jour sont gardées pour les importantes
 * (LIMITES.alertesParJour.reserveImportantes).
 */

/** Une alerte de plus pour ce sujet, aujourd’hui, peut-elle partir ? Compte son passage si oui. */
async function dansLeBudget(sujet: string, importante: boolean): Promise<boolean> {
  const { reserveImportantes, ...jour } = LIMITES.alertesParJour;
  /* Une alerte ordinaire ne touche pas à la réserve : elle regarde sans compter, puis compte */
  if (!importante && (await limiteAtteinte("alertes", { ...jour, max: jour.max - reserveImportantes }))) return false;
  if (!(await sousLaLimite(`alertes:sujet:${sujet}`, LIMITES.alertesParSujet))) return false;
  return sousLaLimite("alertes", jour);
}

/**
 * Quelque chose a échoué pour de bon. Une alerte ne fait jamais échouer ce qui l’appelle. Pas plus de 5 par sujet et 30
 * en tout par jour, dont les 10 dernières pour les `importante` : ce qui touche tout le monde (le budget de l’IA) ou ce
 * qu’on a promis (une lecture, un rapport, la mémoire du chat en échec, src/server/pipeline.ts).
 */
export async function alerter(sujet: string, lignes: string[], { importante = false }: { importante?: boolean } = {}): Promise<void> {
  try {
    if (!(await dansLeBudget(sujet, importante))) {
      journal("alerte retenue", { sujet }, "alerte");
      return;
    }
    await envoyerALEquipe(`BLUSH · ${sujet}`, [...lignes, "", `${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} (heure de Paris)`], {
      aussiSurTelegram: importante,
    });
  } catch (e) {
    journalErreur("alerte non envoyée", e, { sujet });
  }
}
