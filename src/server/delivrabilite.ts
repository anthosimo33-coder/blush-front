import "server-only";
import { eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { estUneRelance, SEUILS_DELIVRABILITE, VOLUME_MIN_DES_REBONDS } from "@/contenu/pilotage";
import { alerter } from "./alertes";
import { db, schema } from "./db";
import { TYPES_EVENEMENTS_MAILS, type TypeEvenementMail } from "./db/enums";
import { expediteurDe } from "./email";
import { env } from "./env";
import { auMieux, journal } from "./journal";
import { LIMITES, sousLaLimite } from "./limites";
import { verifierWebhookResend } from "./paiement/signature";

/*
 * La délivrabilité des mails : ce que Resend dit de chacun (parti, remis, refusé pour de bon, signalé comme spam,
 * retardé, bloqué par sa liste de suppression), par son webhook (POST /api/mails/resend, hors de la garde commune :
 * Resend n’est pas l’appli, seule sa signature compte, src/server/paiement/signature.ts). Chaque mail part avec un tag
 * « sorte » (SorteSuivie, src/server/email.ts) que l’événement nous rend : on garde la sorte, l’événement, son heure et
 * le compte du destinataire s’il en a un ; jamais l’adresse, le sujet ni le contenu. Un événement ne compte qu’une fois
 * (son svix-id, le même à chaque nouvel essai de Resend). /admin en montre les 7 derniers jours, par sorte, face aux
 * seuils (SEUILS_DELIVRABILITE) ; un seuil franchi prévient l’équipe, une fois par jour au plus. Gardé
 * EVENEMENTS_MAILS_GARDES_JOURS (la purge de la nuit, src/server/purge.ts).
 */

/** Combien de jours la purge garde les événements des mails. */
export const EVENEMENTS_MAILS_GARDES_JOURS = 30;

/** Un webhook de Resend ne pèse que quelques Ko : au-delà, il n’en est pas un. */
export const CORPS_MAX_RESEND = 64 * 1024;

/** La sorte d’un mail parti sans tag (avant ce suivi, ou un essai depuis le tableau de bord de Resend). */
const SANS_SORTE = "inconnue";

/**
 * Ce qu’on lit d’un webhook de Resend : son type, son heure, et du mail ses destinataires et ses tags, lus sans rien
 * exiger de leur forme (un tag mal formé, ou absent, ne doit pas faire perdre l’événement : sa sorte devient SANS_SORTE).
 */
const EvenementResend = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z.object({ to: z.unknown(), tags: z.unknown() }).partial().optional(),
});

/** Le type d’un événement (« email.bounced ») parmi ceux qu’on garde, ou null pour tous les autres (ouvertures, clics, domaines…). */
function typeDe(type: string): TypeEvenementMail | null {
  const t = type.replace(/^email\./, "");
  return type.startsWith("email.") && (TYPES_EVENEMENTS_MAILS as readonly string[]).includes(t) ? (t as TypeEvenementMail) : null;
}

/**
 * La sorte d’un mail, lue dans son tag « sorte » (les tags : un objet, comme la documentation de Resend les montre, ou
 * une liste de { name, value }, comme à l’envoi) : des lettres, des chiffres, « _ » et « - » ; SANS_SORTE sinon.
 */
function sorteDuTag(tags: unknown): string {
  const valeur = Array.isArray(tags)
    ? (tags.find((t: unknown) => (t as { name?: unknown } | null)?.name === "sorte") as { value?: unknown } | undefined)?.value
    : tags && typeof tags === "object"
      ? (tags as Record<string, unknown>).sorte
      : undefined;
  return typeof valeur === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(valeur) ? valeur : SANS_SORTE;
}

/** Le premier destinataire d’un mail (`to` : une liste, ou une adresse seule), ou undefined. */
const premierDestinataire = (to: unknown): string | undefined => {
  const premier: unknown = Array.isArray(to) ? to[0] : to;
  return typeof premier === "string" ? premier : undefined;
};

/** L’heure d’un événement : celle que Resend lui donne, sauf si elle manque ou tombe dans le futur ; maintenant sinon. */
function heureDe(createdAt: string | undefined, maintenant: Date): Date {
  const t = createdAt ? Date.parse(createdAt) : Number.NaN;
  return Number.isFinite(t) && t <= maintenant.getTime() + 60_000 ? new Date(t) : maintenant;
}

/** Le compte de cette adresse, s’il y en a un (les emails des comptes sont gardés en minuscules). */
async function compteDeLAdresse(adresse: string | undefined): Promise<string | null> {
  if (!adresse) return null;
  const [u] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, adresse.trim().toLowerCase()));
  return u?.id ?? null;
}

/**
 * Reçoit un webhook de Resend : sa signature d’abord (refusée : « refuse », un 401 ; signée mais fausse ou trop vieille,
 * l’équipe le sait), puis l’événement noté une fois. Un événement qu’on ne garde pas, ou d’une forme qu’on ne lit pas,
 * répond « ok » quand même : sinon Resend le rejouerait des heures. Un rebond ou une plainte relit les seuils, après la
 * réponse (after). Sans RESEND_WEBHOOK_SECRET, tout est refusé.
 */
export async function recevoirEvenementResend(corps: string, entetes: Headers, maintenant = new Date()): Promise<"ok" | "refuse"> {
  const secrets = env().RESEND_WEBHOOK_SECRET;
  if (!secrets.length) {
    journal("webhook de Resend sans secret", {}, "alerte");
    return "refuse";
  }
  const v = verifierWebhookResend(secrets, entetes, corps, maintenant.getTime());
  if ("refus" in v) {
    journal("webhook de Resend refusé", { raison: v.refus }, "alerte");
    /* Sans ses en-têtes, ce n’est pas Resend (un robot qui passe) : le journal suffit. Signé, mais faux ou trop vieux : l’équipe le sait */
    if (v.refus !== "entetes")
      after(() =>
        alerter("mails : webhook de Resend refusé", [
          `Un webhook de Resend a été refusé (${v.refus === "heure" ? "trop vieux, ou rejoué" : "signature fausse"}) : son événement n’est pas compté.`,
          "Si ça se répète : le secret RESEND_WEBHOOK_SECRET est-il celui du webhook (Resend, Webhooks, Signing secret) ?",
        ]),
      );
    return "refuse";
  }
  let json: unknown;
  try {
    json = JSON.parse(corps);
  } catch {
    json = null;
  }
  const lu = EvenementResend.safeParse(json);
  if (!lu.success) {
    journal("webhook de Resend illisible", { id: v.id }, "alerte");
    return "ok";
  }
  const type = typeDe(lu.data.type);
  if (!type) return "ok";
  const [note] = await db()
    .insert(schema.evenementsMails)
    .values({
      id: v.id,
      le: heureDe(lu.data.created_at, maintenant),
      type,
      sorte: sorteDuTag(lu.data.data?.tags),
      compteId: await compteDeLAdresse(premierDestinataire(lu.data.data?.to)),
    })
    .onConflictDoNothing()
    .returning({ id: schema.evenementsMails.id });
  if (note && (type === "bounced" || type === "complained")) after(() => auMieux(verifierLesSeuils(maintenant), "seuils de la délivrabilité non relus"));
  return "ok";
}

/** Ce qui est arrivé aux mails d’une sorte (ou d’un groupe de sortes) sur la période, événement par événement. */
export type ChiffresDesMails = { partis: number; delivres: number; rebonds: number; plaintes: number; retards: number; bloques: number };

/** Les chiffres d’une sorte (SorteSuivie, ou « inconnue »). */
type LigneDeDelivrabilite = { sorte: string } & ChiffresDesMails;

/** La délivrabilité sur la période, pour /admin et les alertes. */
export type Delivrabilite = {
  jours: number;
  /** Chaque sorte qui a eu un événement, les plus nombreuses d’abord. */
  sortes: LigneDeDelivrabilite[];
  /** Les mails du domaine principal (les codes, les rapports, la liste d’attente, les alertes), ceux des relances (la relance ②, les séquences), et tous. */
  principal: ChiffresDesMails;
  relances: ChiffresDesMails;
  total: ChiffresDesMails;
  /** D’où partent les mails : le domaine de BLUSH_EMAIL_FROM, et celui des relances (le même tant que BLUSH_EMAIL_FROM_MARKETING manque). */
  domaines: { principal: string; relances: string };
  /** Un secret du webhook est-il posé (RESEND_WEBHOOK_SECRET) ? */
  branche: boolean;
  /** Le dernier événement reçu (ISO), même hors de la période ; null : aucun encore. */
  dernier: string | null;
};

/** Le champ des chiffres de chaque type d’événement. */
const CHAMPS: Record<TypeEvenementMail, keyof ChiffresDesMails> = {
  sent: "partis",
  delivered: "delivres",
  bounced: "rebonds",
  complained: "plaintes",
  delivery_delayed: "retards",
  suppressed: "bloques",
};

const zero = (): ChiffresDesMails => ({ partis: 0, delivres: 0, rebonds: 0, plaintes: 0, retards: 0, bloques: 0 });

/* Le domaine d’un expéditeur : « askblush.com » pour « BLUSH <bonjour@askblush.com> » */
const domaineDe = (expediteur: string) => /@([^>\s]+)>?\s*$/.exec(expediteur)?.[1] ?? expediteur;

/** La délivrabilité des `jours` derniers jours (7 au défaut : la fenêtre des seuils), par sorte, par domaine et en tout. */
export async function delivrabilite(jours = 7): Promise<Delivrabilite> {
  const e = schema.evenementsMails;
  const [lignes, [dernier]] = await Promise.all([
    db()
      .select({ sorte: e.sorte, type: e.type, n: sql<number>`count(*)::int` })
      .from(e)
      .where(sql`${e.le} >= now() - make_interval(days => ${jours})`)
      .groupBy(e.sorte, e.type),
    db()
      .select({ le: sql<Date | null>`max(${e.le})` })
      .from(e),
  ]);
  const parSorte = new Map<string, LigneDeDelivrabilite>();
  const [principal, relances, total] = [zero(), zero(), zero()];
  for (const { sorte, type, n } of lignes) {
    const ligne = parSorte.get(sorte) ?? { sorte, ...zero() };
    const champ = CHAMPS[type];
    ligne[champ] += n;
    (estUneRelance(sorte) ? relances : principal)[champ] += n;
    total[champ] += n;
    parSorte.set(sorte, ligne);
  }
  const e2 = env();
  return {
    jours,
    sortes: [...parSorte.values()].sort((a, b) => b.partis + b.delivres - (a.partis + a.delivres) || a.sorte.localeCompare(b.sorte)),
    principal,
    relances,
    total,
    domaines: { principal: domaineDe(e2.BLUSH_EMAIL_FROM), relances: domaineDe(expediteurDe("relance", e2).de) },
    branche: e2.RESEND_WEBHOOK_SECRET.length > 0,
    dernier: dernier?.le ? new Date(dernier.le).toISOString() : null,
  };
}

/** Une part en pourcentage, « 0,12 % », pour une alerte. */
const enPourcent = (n: number, sur: number) => `${((n / sur) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}\u00a0%`;

/**
 * Relit les 7 derniers jours de tous les mails face aux seuils de Resend (SEUILS_DELIVRABILITE) : les rebonds (jugés à
 * partir de VOLUME_MIN_DES_REBONDS mails partis) et les plaintes (toujours : une seule compte, à notre volume). Un seuil
 * franchi prévient l’équipe, une fois par jour au plus (LIMITES.alertesDelivrabiliteParJour), aussi sur Telegram : le
 * mail de l’alerte part par le même prestataire. Rend les seuils franchis.
 */
export async function verifierLesSeuils(maintenant = new Date()): Promise<string[]> {
  const d = await delivrabilite(7);
  const { total: t } = d;
  const franchis: string[] = [];
  if (t.partis >= VOLUME_MIN_DES_REBONDS && t.rebonds / t.partis >= SEUILS_DELIVRABILITE.rebonds)
    franchis.push(
      `Rebonds\u00a0: ${t.rebonds} sur ${t.partis} mails partis (${enPourcent(t.rebonds, t.partis)}), au-delà des ${enPourcent(SEUILS_DELIVRABILITE.rebonds, 1)} de Resend.`,
    );
  if (t.plaintes > 0 && t.plaintes / Math.max(t.delivres, t.plaintes) >= SEUILS_DELIVRABILITE.plaintes)
    franchis.push(
      `Plaintes pour spam\u00a0: ${t.plaintes} sur ${t.delivres} mails remis (${enPourcent(t.plaintes, Math.max(t.delivres, t.plaintes))}), au-delà des ${enPourcent(SEUILS_DELIVRABILITE.plaintes, 1)} de Resend.`,
    );
  if (!franchis.length || !(await sousLaLimite("delivrabilite:alerte", LIMITES.alertesDelivrabiliteParJour))) return franchis;
  /* Les sortes en cause, par leur nom de code : jamais d’adresse */
  const enCause = d.sortes
    .filter((s) => s.rebonds || s.plaintes)
    .map((s) => `${s.sorte} (${s.rebonds} rebond${s.rebonds > 1 ? "s" : ""}, ${s.plaintes} plainte${s.plaintes > 1 ? "s" : ""})`);
  await alerter(
    "délivrabilité des mails",
    [
      ...franchis,
      `En cause : ${enCause.join(", ")}.`,
      `Domaine principal (${d.domaines.principal}) : ${d.principal.rebonds} rebonds, ${d.principal.plaintes} plaintes ; relances (${d.domaines.relances}) : ${d.relances.rebonds} rebonds, ${d.relances.plaintes} plaintes.`,
      "Le détail est dans /admin, bloc « Délivrabilité » (sur 7 jours). Les plaintes de Gmail n’arrivent pas jusqu’à Resend : elles se lisent dans Google Postmaster Tools.",
      `Relu le ${maintenant.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}. Prochaine alerte dans 24\u00a0h au plus tôt.`,
    ],
    { importante: true },
  );
  return franchis;
}
