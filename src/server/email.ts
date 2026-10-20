import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { boiteAMails, env, type Env } from "./env";
import { delaiAppel } from "./echeance";
import { auMieux, enLocal, journal } from "./journal";
import { dansLeQuotaDesMails, rendreAuQuotaDesMails, type SorteDeMail } from "./limites";
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

/**
 * Resend a refusé le mail : son statut HTTP, rien d’autre (ni l’adresse, ni le contenu), qu’une alerte peut montrer. Le
 * journal le lit dans `code` (« resend_422 », champsDErreur) : une clé révoquée (401, 403), un quota (429) ou une adresse
 * refusée (422) s’y distinguent.
 */
export class ErreurResend extends Error {
  readonly code: `resend_${number}`;
  constructor(readonly statut: number) {
    super(`Resend a répondu ${statut}`);
    this.name = "ErreurResend";
    this.code = `resend_${statut}`;
  }
}

/**
 * Resend a-t-il refusé le mail sans regarder l’adresse : trop de mails à la fois (429), une panne (5xx), la clé (401,
 * 403) ? Alors le mail n’est pas parti, et il pourra repartir plus tard, à la même adresse. Pas une adresse refusée (422),
 * ni un mail perdu en route (pas de réponse : il a pu partir). Pour les envois en série (les relances, les invitations
 * de la liste d’attente), qui s’arrêtent là au lieu de compter la personne comme servie.
 */
export const refusDuPrestataire = (e: unknown): boolean => e instanceof ErreurResend && (e.statut === 429 || e.statut === 401 || e.statut === 403 || e.statut >= 500);

/**
 * Ce qu’est un mail pour le suivi de la délivrabilité : son tag « sorte » chez Resend, que ses webhooks nous rendent
 * (src/server/delivrabilite.ts). Le code de connexion, une sorte du quota (SorteDeMail), ou un mail des séquences par sa
 * clé (« sequence-s1_haut ») : des lettres, des chiffres, « _ » et « - », comme Resend l’exige d’un tag.
 */
export type SorteSuivie = "code" | SorteDeMail | `sequence-${string}`;

/** L’adresse seule d’un expéditeur : « bonjour@askblush.com » pour « BLUSH <bonjour@askblush.com> ». */
const adresseDe = (expediteur: string) => /<([^<>]+)>\s*$/.exec(expediteur)?.[1]?.trim() ?? expediteur.trim();

/**
 * L’expéditeur d’un mail de cette sorte (du quota). Les mails qu’on envoie sans qu’on les demande, la sorte « relance »
 * (les séquences, la relance ②), partent de BLUSH_EMAIL_FROM_MARKETING s’il est posé (un sous-domaine : leurs plaintes
 * pour spam n’entraînent pas le domaine des codes), et la réponse va à l’adresse de BLUSH_EMAIL_FROM (`repondreA`, le
 * reply_to de Resend). Tous les autres (« ton rapport est prêt », la liste d’attente, les alertes), et les relances tant
 * que la variable manque, partent de BLUSH_EMAIL_FROM. Les codes ont le leur (envoyerCodeParEmail).
 */
export function expediteurDe(
  sorte: SorteDeMail,
  { BLUSH_EMAIL_FROM, BLUSH_EMAIL_FROM_MARKETING }: Pick<Env, "BLUSH_EMAIL_FROM" | "BLUSH_EMAIL_FROM_MARKETING">,
): { de: string; repondreA?: string } {
  if (sorte !== "relance" || !BLUSH_EMAIL_FROM_MARKETING) return { de: BLUSH_EMAIL_FROM };
  return { de: BLUSH_EMAIL_FROM_MARKETING, repondreA: adresseDe(BLUSH_EMAIL_FROM) };
}

/**
 * Poste un mail chez le prestataire, avec la clé `cle`, l’expéditeur `de` (et l’adresse de la réponse, `repondreA`) et
 * son tag « sorte » (`suivi`) : rejette avec ErreurResend s’il le refuse.
 */
async function poster(
  pour: string[],
  { sujet, texte, html, entetes }: Mail,
  { cle, de, repondreA, suivi }: { cle: string; de: string; repondreA?: string; suivi: SorteSuivie },
): Promise<void> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${cle}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: de,
      to: pour,
      subject: sujet,
      text: texte,
      ...(html !== undefined && { html }),
      ...(entetes && { headers: entetes }),
      ...(repondreA && { reply_to: repondreA }),
      tags: [{ name: "sorte", value: suivi }],
    }),
    signal: AbortSignal.timeout(delaiAppel(DELAI_MAIL_MS, 2_000)),
  });
  if (!r.ok) throw new ErreurResend(r.status);
}

/**
 * Envoie un mail qui n’est pas un code, sa version texte et sa version HTML s’il en a une (une alerte de l’équipe n’en a
 * pas), à un ou plusieurs destinataires, avec RESEND_API_KEY. `sorte` : ce qu’il est pour le quota du prestataire
 * (plafondsDesMails, src/server/limites.ts : « rapport » par défaut, « alerte », « attente », « relance ») ; au-delà de sa
 * part, il ne part pas, le journal le dit, et la réponse est false. Elle choisit aussi son expéditeur (expediteurDe).
 * `suivi` : son tag pour la délivrabilité, sa sorte au défaut. Sans clé (dev), seul son sujet s’affiche dans les logs.
 * Rejette avec ErreurResend si le prestataire le refuse : à l’appelant de dire ce qu’il en fait (une alerte, l’équipe prévenue).
 */
export async function envoyerMail(
  destinataires: string | string[],
  mail: Mail,
  { sorte = "rapport", suivi = sorte }: { sorte?: SorteDeMail; suivi?: SorteSuivie } = {},
): Promise<boolean> {
  const pour = typeof destinataires === "string" ? [destinataires] : destinataires;
  if (!pour.length) return true;
  const boite = boiteAMails();
  if (boite) {
    await deposer(boite, pour, { sujet: mail.sujet, texte: mail.texte, ...(mail.html !== undefined && { html: mail.html }), ...(mail.entetes && { entetes: mail.entetes }) });
    return true;
  }
  const { RESEND_API_KEY, RESEND_API_KEY_CODES } = env();
  if (!RESEND_API_KEY) {
    enLocal(`[dev] mail « ${mail.sujet} » pour ${pour.join(", ")}`);
    return true;
  }
  /* Chaque destinataire compte pour le prestataire */
  if (!(await dansLeQuotaDesMails(sorte, pour.length, { codesAPart: !!RESEND_API_KEY_CODES }))) {
    journal("mail retenu", { sorte, destinataires: pour.length }, "alerte");
    return false;
  }
  try {
    await poster(pour, mail, { cle: RESEND_API_KEY, ...expediteurDe(sorte, env()), suivi });
  } catch (e) {
    /* Refusé, il n’a rien pris au prestataire : il rend sa place. Perdu en route, il a pu partir : il la garde */
    if (e instanceof ErreurResend) await auMieux(rendreAuQuotaDesMails(pour.length), "quota des mails non rendu");
    throw e;
  }
  return true;
}

/** Envoie le code de connexion. Sans clé (dev), il s’affiche dans les logs du serveur. */
export async function envoyerCodeParEmail(email: string, code: string): Promise<void> {
  const { BLUSH_URL } = env();
  const boite = boiteAMails();
  /* La boîte des tests garde aussi le code seul : le test le lit sans fouiller le HTML */
  if (boite) return deposer(boite, [email], { ...mailCode(code, BLUSH_URL), code });
  /* La clé des codes (RESEND_API_KEY_CODES, un quota à part) et son expéditeur, sinon ceux de tous les mails */
  const { RESEND_API_KEY, RESEND_API_KEY_CODES, BLUSH_EMAIL_FROM, BLUSH_EMAIL_FROM_CODES } = env();
  const cle = RESEND_API_KEY_CODES ?? RESEND_API_KEY;
  if (!cle) {
    enLocal(`[dev] code de connexion pour ${email} : ${code}`);
    return;
  }
  /* Leur part du quota se compte avant (plafondsDesMails().codes, src/server/auth.ts : envoyerCode) */
  await poster([email], mailCode(code, BLUSH_URL), { cle, de: BLUSH_EMAIL_FROM_CODES ?? BLUSH_EMAIL_FROM, suivi: "code" });
}
