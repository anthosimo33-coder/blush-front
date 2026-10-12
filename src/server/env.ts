import "server-only";
import { z } from "zod";
import { estCleDeTest } from "@/lib/captcha";
import { enProduction, surVercel } from "./drapeaux";
import { journal } from "./journal";

/*
 * Les variables d’environnement du back-end, vérifiées une fois au premier usage (pas au build : `next build` n’a pas
 * les secrets). Une variable manquante ou mal formée fait échouer la requête avec un message clair dans les logs, jamais
 * dans la réponse. Chacune a sa ligne dans BACKEND.md (tests/documentation.test.ts y veille). Ce que le proxy et les
 * pages rendues au build lisent sans ce schéma est dans src/server/drapeaux.ts.
 */

/** L’adresse du site en ligne : le défaut de BLUSH_URL. */
const SITE_EN_LIGNE = "https://www.askblush.com";

/** Une liste d’emails séparés par des virgules : chacun sans ses espaces et en minuscules, sans case vide. */
const emails = (v: string) =>
  v
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const Env = z.object({
  /** Postgres : Neon en production, le Postgres local en dev. */
  DATABASE_URL: z.string().url(),
  /** Clé de chiffrement du contenu (32 octets en base64). Jamais dans la base. */
  BLUSH_CLE: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "BLUSH_CLE doit faire 32 octets en base64 (openssl rand -base64 32)"),
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
  /**
   * Facultative : une clé réservée aux codes de connexion (S-09), sur un compte Resend à part. Leur quota ne prend alors
   * plus rien à celui des rapports et des alertes. Sans elle, les codes partent avec RESEND_API_KEY.
   */
  RESEND_API_KEY_CODES: z.string().min(1).optional(),
  /** L’expéditeur des mails, sur le domaine vérifié chez Resend. */
  BLUSH_EMAIL_FROM: z.string().default("BLUSH <bonjour@askblush.com>"),
  /**
   * Facultatif : l’expéditeur des codes de connexion, sur un domaine vérifié sur le compte de RESEND_API_KEY_CODES (un
   * sous-domaine, par exemple). Sans lui, les codes partent de BLUSH_EMAIL_FROM : son domaine doit alors être vérifié sur
   * ce compte aussi, sinon le prestataire refuse chaque code.
   */
  BLUSH_EMAIL_FROM_CODES: z.string().min(1).optional(),
  /** L’adresse du site : les images des mails viennent de là. */
  BLUSH_URL: z.string().url().default(SITE_EN_LIGNE),
  /** Bêta sans paiement : les emails qui ont BLUSH+ d’office, séparés par des virgules, ou « * » pour tout le monde (refusé en production). */
  BLUSH_ACCES_LIBRE: z
    .string()
    .default("")
    .transform((v) => (v.trim() === "*" ? ("*" as const) : emails(v))),
  /** Bêta fermée : seuls les emails de BLUSH_ACCES_LIBRE peuvent se connecter (et donc lancer une lecture). Exigée en production. */
  BLUSH_BETA_FERMEE: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  /** Qui reçoit les alertes (un échec définitif) et le résumé de chaque nuit : un ou des emails, séparés par des virgules. */
  BLUSH_ALERTES: z.string().default("").transform(emails),
  /** Qui peut ouvrir le tableau de bord (/admin) : un ou des emails, séparés par des virgules. Sans elle, ceux de BLUSH_ALERTES. */
  BLUSH_ADMINS: z.string().transform(emails).optional(),
  /** Le secret que Vercel Cron envoie à /api/cron/purge (Authorization: Bearer …). Exigé en production. */
  CRON_SECRET: z.string().min(16).optional(),
  /**
   * Le quota du prestataire de mails, par jour (chaque destinataire compté) : 100 sur son plan gratuit. Les plafonds des
   * mails en découlent (plafondsDesMails, src/server/limites.ts) : à relever avec un plan payant, jamais au-dessus de ce
   * qu’il permet.
   */
  BLUSH_MAILS_PAR_JOUR: z.coerce.number().int().min(100).default(100),
  /**
   * Le CAPTCHA (Cloudflare Turnstile) : la clé secrète, que le serveur envoie à Cloudflare avec chaque jeton
   * (src/server/captcha.ts). Sans elle, pas de CAPTCHA ; exigée en production dès que la bêta est ouverte.
   */
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  /**
   * La clé publique du même widget, écrite dans les pages au build (NEXT_PUBLIC_, lue par le navigateur dans
   * src/lib/publique.ts) : relue ici pour vérifier qu’elle va avec la clé secrète.
   */
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  /** Tests et dev sans coût : le modèle rejoue des sorties enregistrées au lieu d’appeler l’API. Ignoré sur Vercel. */
  BLUSH_IA_FACTICE: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  /** Tests de bout en bout (tests/e2e) : les mails sont écrits dans ce dossier au lieu de partir. Avec le modèle factice seulement. */
  BLUSH_BOITE_MAILS: z.string().min(1).optional(),
});

export type Env = z.infer<typeof Env>;

/**
 * L’adresse du site, sans env() : le layout la lit au build, qui n’a pas les secrets. La même que BLUSH_URL, défaut
 * compris ; mal formée, c’est env() qui le dira.
 */
export const URL_SITE = Env.shape.BLUSH_URL.safeParse(process.env.BLUSH_URL).data ?? SITE_EN_LIGNE;

/*
 * Le modèle factice et la boîte à mails des tests n’existent jamais sur Vercel, même si leurs variables y traînent : la
 * production appelle toujours le vrai modèle, et ses mails partent toujours par Resend. La boîte va avec le modèle
 * factice (jamais allumé en production) : sans lui, elle est ignorée, et Resend reste exigé.
 */
const boiteDe = (e: Pick<Env, "BLUSH_BOITE_MAILS" | "BLUSH_IA_FACTICE">) => (surVercel() || !e.BLUSH_IA_FACTICE ? null : (e.BLUSH_BOITE_MAILS ?? null));

/*
 * En production (VERCEL_ENV), une variable oubliée lors d’un ménage ne doit ni ouvrir la bêta ou BLUSH+ à tout le
 * monde, ni arrêter la purge sans bruit : le service refuse de tourner, et les logs disent pourquoi. Les préversions,
 * le dev et les tests n’ont pas ces exigences.
 */
function refusEnProduction(e: Env): string[] {
  if (!enProduction()) return [];
  const refus: string[] = [];
  /* Son défaut ("0") ouvrirait la bêta : en production, elle s’écrit exprès */
  if (process.env.BLUSH_BETA_FERMEE === undefined) refus.push("BLUSH_BETA_FERMEE manque (1 : bêta fermée, 0 : ouverte, à écrire exprès)");
  if (!e.CRON_SECRET) refus.push("CRON_SECRET manque (sans lui, la purge de nuit ne tourne jamais)");
  /* Un plan donné n’est jamais repris : « * » donnerait BLUSH+ à chaque compte créé, pour toujours */
  if (e.BLUSH_ACCES_LIBRE === "*") refus.push("BLUSH_ACCES_LIBRE=* est refusée (BLUSH+ d’office pour tout le monde) : seulement la liste des invités");
  /* Ouverte à tous, la porte (les codes, les imports et les captures sans compte) passe par le CAPTCHA */
  if (!e.BLUSH_BETA_FERMEE && !e.TURNSTILE_SECRET_KEY) refus.push("TURNSTILE_SECRET_KEY manque : la bêta ouverte exige le CAPTCHA");
  /* Une clé de test de Cloudflare laisse passer tout le monde (ou personne) : jamais en production */
  for (const cle of ["TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"] as const)
    if (estCleDeTest(e[cle] ?? "")) refus.push(`${cle} est une clé de test de Cloudflare (elle ne protège rien)`);
  return refus;
}

/*
 * Partout, production ou non : les deux clés du CAPTCHA vont ensemble. La secrète seule, le serveur exigerait un jeton
 * que les pages ne demandent jamais (tout import sans compte refusé) ; la publique seule, les pages le demanderaient pour
 * rien.
 */
function refusDuCaptcha(e: Env): string | null {
  if (!e.TURNSTILE_SECRET_KEY === !e.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return null;
  return e.TURNSTILE_SECRET_KEY
    ? "NEXT_PUBLIC_TURNSTILE_SITE_KEY manque : TURNSTILE_SECRET_KEY va avec elle (le CAPTCHA)"
    : "TURNSTILE_SECRET_KEY manque : NEXT_PUBLIC_TURNSTILE_SITE_KEY va avec elle (le CAPTCHA)";
}

let cache: Env | null = null;

export function env(): Env {
  if (cache) return cache;
  const lu = Env.safeParse(process.env);
  if (!lu.success) {
    const champs = lu.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ");
    throw new Error(`Variables d’environnement invalides : ${champs}`);
  }
  if (surVercel() && lu.data.BLUSH_IA_FACTICE) {
    /* Ignorée, mais dite : elle n’a rien à faire sur Vercel */
    journal("variable ignorée sur Vercel, à retirer des variables du projet", { variable: "BLUSH_IA_FACTICE" }, "alerte");
    lu.data.BLUSH_IA_FACTICE = false;
  }
  if (!lu.data.BLUSH_IA_FACTICE && !lu.data.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY manque (ou BLUSH_IA_FACTICE=1)");
  /* `next start` des tests de bout en bout tourne en production, sans Resend : leurs mails vont dans la boîte */
  if (process.env.NODE_ENV === "production" && !lu.data.RESEND_API_KEY && !boiteDe(lu.data)) throw new Error("RESEND_API_KEY manque en production");
  const captcha = refusDuCaptcha(lu.data);
  if (captcha) throw new Error(captcha);
  const refus = refusEnProduction(lu.data);
  if (refus.length) throw new Error(`Configuration refusée en production : ${refus.join(" ; ")}`);
  cache = lu.data;
  return cache;
}

/** Le dossier où les mails sont écrits au lieu de partir (tests de bout en bout), ou null : ils partent par Resend. */
export const boiteAMails = () => boiteDe(env());

/**
 * Le mode factice : le modèle, la voix et la transcription ne partent jamais chez un prestataire, ils rendent des
 * réponses fixes (src/server/ia/factice.ts, lu par claude.ts, voix.ts et transcription.ts), sans rien noter dans ai_usage.
 * La seule question à poser pour le savoir : jamais sur Vercel (env() l’éteint), et jamais « une clé manque ». Ici, et
 * non dans factice.ts : la voix et la transcription le demandent sans charger les sorties factices.
 */
export const iaFactice = (): boolean => env().BLUSH_IA_FACTICE;

/**
 * Le serveur des tests de bout en bout : `next start` sur http://localhost, avec le modèle factice et la boîte à mails.
 * Jamais sur Vercel. Lu directement dans process.env, sans env() : les cookies le demandent avant toute autre variable.
 */
export const serveurDeTest = () => !surVercel() && process.env.BLUSH_IA_FACTICE === "1" && !!process.env.BLUSH_BOITE_MAILS;

/** Bêta fermée : cet email peut-il se connecter ? (Ouverte : tout le monde.) */
export const peutEntrer = (email: string) => !env().BLUSH_BETA_FERMEE || accesLibre(email);

/** Cet email peut-il ouvrir le tableau de bord ? */
export function estAdmin(email: string): boolean {
  const { BLUSH_ADMINS, BLUSH_ALERTES } = env();
  return (BLUSH_ADMINS ?? BLUSH_ALERTES).includes(email.toLowerCase());
}

/** L’email a-t-il BLUSH+ d’office (bêta sans paiement) ? */
export function accesLibre(email: string): boolean {
  const liste = env().BLUSH_ACCES_LIBRE;
  return liste === "*" || liste.includes(email.toLowerCase());
}
