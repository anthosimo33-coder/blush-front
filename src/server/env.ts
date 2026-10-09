import "server-only";
import { z } from "zod";

/*
 * Les variables d’environnement du back-end, vérifiées une fois au premier usage (pas au build :
 * `next build` n’a pas les secrets). Une variable manquante ou mal formée fait échouer la requête
 * avec un message clair dans les logs, jamais dans la réponse.
 */
const Env = z.object({
  /** Postgres : Neon en production, le Postgres local en dev. */
  DATABASE_URL: z.string().url(),
  /** Clé de chiffrement du contenu (32 octets en base64). Jamais dans la base. */
  BLUSH_CLE: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "BLUSH_CLE doit faire 32 octets en base64 (openssl rand -base64 32)"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** Quand la clé n’est rattachée à aucun workspace. */
  ANTHROPIC_WORKSPACE_ID: z.string().min(1).optional(),
  /** La transcription des vocaux par Mistral, prioritaire si sa clé est là ; sinon ElevenLabs (sa clé, plus bas). Sans aucune des deux, le chat répond que les vocaux arrivent bientôt. */
  MISTRAL_API_KEY: z.string().min(1).optional(),
  /** La voix de BLUSH (ElevenLabs), et la transcription de ses vocaux sans clé Mistral. Sans clé ou sans voix A, pas de vocal. */
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  /** Les voix de l’A/B test (leurs identifiants ElevenLabs). Sans voix B, tout le monde a la A. */
  BLUSH_VOIX_A: z.string().min(1).optional(),
  BLUSH_VOIX_B: z.string().min(1).optional(),
  /** Sans clé Resend, le code de connexion s’affiche dans les logs (dev seulement). */
  RESEND_API_KEY: z.string().min(1).optional(),
  BLUSH_EMAIL_FROM: z.string().default("BLUSH <bonjour@blush.app>"),
  /** L’adresse du site : les images des mails viennent de là. */
  BLUSH_URL: z.string().url().default("https://www.askblush.com"),
  /** Bêta sans paiement : emails qui ont BLUSH+ d’office, séparés par des virgules, ou « * » pour tout le monde. */
  BLUSH_ACCES_LIBRE: z.string().default(""),
  /** Bêta fermée : seuls les emails de BLUSH_ACCES_LIBRE peuvent se connecter (et donc lancer une lecture). */
  BLUSH_BETA_FERMEE: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  /** Qui reçoit les alertes (un échec définitif) et le résumé de chaque nuit : un ou des emails, séparés par des virgules. */
  BLUSH_ALERTES: z.string().optional(),
  /** Qui peut ouvrir le tableau de bord (/admin) : un ou des emails, séparés par des virgules. Par défaut, ceux de BLUSH_ALERTES. */
  BLUSH_ADMINS: z.string().optional(),
  /** Le secret que Vercel Cron envoie à /api/cron/purge (Authorization: Bearer …). */
  CRON_SECRET: z.string().min(16).optional(),
  /** Tests et dev sans coût : le modèle rejoue des sorties enregistrées au lieu d’appeler l’API. Ignoré sur Vercel. */
  BLUSH_IA_FACTICE: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  /** Tests de bout en bout (tests/e2e) : les mails sont écrits dans ce dossier au lieu de partir. Avec le modèle factice seulement. */
  BLUSH_BOITE_MAILS: z.string().min(1).optional(),
});

export type Env = z.infer<typeof Env>;

/*
 * Le modèle factice et la boîte à mails des tests n’existent jamais sur Vercel, même si leurs variables y traînent : la
 * production appelle toujours le vrai modèle, et ses mails partent toujours par Resend. La boîte va avec le modèle
 * factice (jamais allumé en production) : sans lui, elle est ignorée, et Resend reste exigé.
 */
const boiteDe = (e: Pick<Env, "BLUSH_BOITE_MAILS" | "BLUSH_IA_FACTICE">) => (process.env.VERCEL || !e.BLUSH_IA_FACTICE ? null : (e.BLUSH_BOITE_MAILS ?? null));

let cache: Env | null = null;

export function env(): Env {
  if (cache) return cache;
  const lu = Env.safeParse(process.env);
  if (!lu.success) {
    const champs = lu.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ");
    throw new Error(`Variables d’environnement invalides : ${champs}`);
  }
  if (process.env.VERCEL) lu.data.BLUSH_IA_FACTICE = false;
  if (!lu.data.BLUSH_IA_FACTICE && !lu.data.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY manque (ou BLUSH_IA_FACTICE=1)");
  /* `next start` des tests de bout en bout tourne en production, sans Resend : leurs mails vont dans la boîte */
  if (process.env.NODE_ENV === "production" && !lu.data.RESEND_API_KEY && !boiteDe(lu.data)) throw new Error("RESEND_API_KEY manque en production");
  cache = lu.data;
  return cache;
}

/** Le dossier où les mails sont écrits au lieu de partir (tests de bout en bout), ou null : ils partent par Resend. */
export const boiteAMails = () => boiteDe(env());

/** Bêta fermée : cet email peut-il se connecter ? (Ouverte : tout le monde.) */
export const peutEntrer = (email: string) => !env().BLUSH_BETA_FERMEE || accesLibre(email);

/** Cet email peut-il ouvrir le tableau de bord ? */
export function estAdmin(email: string): boolean {
  const { BLUSH_ADMINS, BLUSH_ALERTES } = env();
  return (BLUSH_ADMINS ?? BLUSH_ALERTES ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/** L’email a-t-il BLUSH+ d’office (bêta sans paiement) ? */
export function accesLibre(email: string): boolean {
  const liste = env().BLUSH_ACCES_LIBRE.trim();
  if (liste === "*") return true;
  return liste
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
