import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { EtapeVisite, GenreFil, Jalon, OffreId, SourceVisite } from "@/types";
import { NOMS_DU_TOURNAGE } from "@/lib/noms-cookies";
import { db, schema } from "./db";
import { auMieux } from "./journal";
import { ipDe } from "./limites";
import { aujourdhuiParis } from "./temps";

/*
 * Les visiteurs et le direct d’/admin, sans cookie ni rien de gardé dans le navigateur :
 * - un visiteur se compte une fois par jour (de Paris), par l’empreinte de sa connexion : son adresse IP et son navigateur
 *   mêlés au sel du jour, tiré au hasard et effacé le surlendemain. L’adresse IP ne s’écrit nulle part, et une fois le sel
 *   parti, plus rien ne relie une empreinte à une connexion. La même personne revenue un autre jour compte une fois de plus ;
 * - chaque onglet ouvert fait signe toutes les 40 secondes tant qu’il est visible (src/lib/presence.ts) : l’écran où il
 *   est, d’où il vient, et la ville de sa connexion (celle que donne l’hébergeur, à la ville près) ;
 * - le fil du direct note une ville et un geste (une arrivée, un import, un paiement, un achat, un partage), jamais un
 *   compte ni une conv ;
 * - les jalons du tunnel (un fichier choisi, le paywall vu jusqu’aux avis, le formulaire de Whop affiché…) se comptent
 *   une fois par jour par la même empreinte que la visite : la même personne ne compte qu’une fois à chaque jalon.
 * Rien de tout ça ne fait échouer ce qu’il compte (auMieux).
 */

/** Un onglet est en ligne s’il a fait signe depuis ce temps (deux signes de 40 s, moins un raté). */
export const EN_LIGNE_S = 90;
/** Combien de jours on garde les signes des onglets et le fil du direct. */
export const PRESENCES_GARDEES_JOURS = 2;
/** Combien de jours on garde les visites (une ligne par visiteur et par jour) : deux périodes de 30 jours, et de la marge. */
export const VISITES_GARDEES_JOURS = 90;

/* Les applis dont le navigateur intégré se reconnaît à son nom (quand il ne dit pas d’où il vient) */
const APPLIS: [RegExp, SourceVisite][] = [
  [/musical_ly|bytedancewebview|tiktok|trill/i, "tiktok"],
  [/instagram/i, "instagram"],
  [/snapchat/i, "snapchat"],
];
/* Les sites d’où l’on arrive, par la fin de leur nom */
const SITES: [RegExp, SourceVisite][] = [
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)snapchat\.com$/, "snapchat"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
];
/* Ce que les créatrices écrivent dans utm_source */
const UTM: [RegExp, SourceVisite][] = [
  [/^(tiktok|tt|tik_tok)$/, "tiktok"],
  [/^(instagram|ig|insta)$/, "instagram"],
  [/^(snapchat|snap|sc)$/, "snapchat"],
  [/^google$/, "google"],
];

/**
 * D’où vient une visite : le lien d’une créatrice (utm_source), sinon un verdict partagé (/v/…), sinon le site d’avant
 * (le nôtre ne compte pas), sinon le navigateur intégré de l’appli qui l’a ouvert, sinon « direct ».
 */
export function sourceDe({ utm, referent, chemin, agent }: { utm?: string; referent?: string; chemin?: string; agent: string | null }): SourceVisite {
  const u = utm?.trim().toLowerCase();
  if (u) return UTM.find(([re]) => re.test(u))?.[1] ?? "autre";
  if (chemin?.startsWith("/v/")) return "partage";
  const hote = hoteDe(referent);
  if (hote && !/(^|\.)askblush\.com$|^localhost$/.test(hote)) return SITES.find(([re]) => re.test(hote))?.[1] ?? "autre";
  if (agent) for (const [re, source] of APPLIS) if (re.test(agent)) return source;
  return "direct";
}

const hoteDe = (adresse: string | undefined): string | null => {
  if (!adresse) return null;
  try {
    return new URL(adresse).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/** Le lieu d’une connexion : ce que l’hébergeur (Vercel) en dit, à la ville près. Rien en local. */
export type Lieu = { ville: string | null; pays: string | null; lat: number | null; lon: number | null };

/** Le lieu de la connexion d’une requête, d’après les en-têtes de Vercel (la ville arrive encodée comme dans une adresse). */
export function lieuDe(req: Request): Lieu {
  const h = req.headers;
  const lire = (nom: string) => h.get(nom)?.trim() || null;
  let ville = lire("x-vercel-ip-city");
  try {
    ville = ville && decodeURIComponent(ville);
  } catch {
    /* Une ville mal encodée reste telle quelle */
  }
  const nombre = (nom: string) => {
    const n = Number(lire(nom));
    return lire(nom) !== null && Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  };
  const pays = lire("x-vercel-ip-country");
  return {
    ville: ville ? ville.slice(0, 80) : null,
    pays: pays && /^[A-Z]{2}$/.test(pays) ? pays : null,
    lat: nombre("x-vercel-ip-latitude"),
    lon: nombre("x-vercel-ip-longitude"),
  };
}

/* Le sel de chaque jour, gardé par l’instance : une lecture de la base par jour et par instance */
const sels = new Map<string, Promise<string>>();

/** Le sel de ce jour (AAAA-MM-JJ) : créé au premier visiteur du jour, le même pour toutes les instances. */
function selDu(jour: string): Promise<string> {
  let sel = sels.get(jour);
  if (!sel) {
    sel = (async () => {
      const t = schema.selsDesVisites;
      await db()
        .insert(t)
        .values({ jour, sel: randomBytes(24).toString("base64url") })
        .onConflictDoNothing();
      const [l] = await db().select({ sel: t.sel }).from(t).where(eq(t.jour, jour));
      if (!l) throw new Error("sel du jour introuvable");
      return l.sel;
    })();
    /* Un échec n’est pas gardé : la prochaine visite réessaie */
    sel.catch(() => sels.delete(jour));
    if (sels.size > 4) sels.delete(sels.keys().next().value!);
    sels.set(jour, sel);
  }
  return sel;
}

/** L’empreinte de la connexion d’une requête, ce jour-là : jamais l’adresse IP elle-même. */
async function empreinteDe(req: Request, jour: string): Promise<string> {
  const sel = await selDu(jour);
  return createHash("sha256")
    .update(`${sel}|${ipDe(req)}|${req.headers.get("user-agent") ?? ""}`)
    .digest("base64url")
    .slice(0, 32);
}

/* La veille d’un jour AAAA-MM-JJ */
const veilleDe = (jour: string) => new Date(Date.parse(`${jour}T12:00:00Z`) - 86400e3).toISOString().slice(0, 10);

/*
 * Un garde-fou contre un flot de faux signes, par instance (sans écrire en base à chaque signe) : un onglet en envoie 15
 * en 10 minutes, une adresse IP en a donc droit à quelques onglets à la fois. Au-delà, les signes sont ignorés : seuls
 * les chiffres du direct en dépendent.
 */
const SIGNES_PAR_IP = { max: 120, fenetreMs: 10 * 60_000 };
const signesParIp = new Map<string, { n: number; debut: number }>();
function signeAdmis(req: Request, maintenant = Date.now()): boolean {
  const ip = ipDe(req);
  const c = signesParIp.get(ip);
  if (!c || maintenant - c.debut > SIGNES_PAR_IP.fenetreMs) {
    if (signesParIp.size > 20_000) signesParIp.clear();
    signesParIp.set(ip, { n: 1, debut: maintenant });
    return true;
  }
  c.n += 1;
  return c.n <= SIGNES_PAR_IP.max;
}

/**
 * La requête vient-elle d’un navigateur en mode tournage ? Son cookie (sous l’un de ses deux noms, lu dans la requête
 * elle-même : src/server/cookies.ts le pose), quelle que soit sa valeur (un lien arrêté compris).
 */
const enModeTournage = (req: Request) => (req.headers.get("cookie") ?? "").split(";").some((c) => (NOMS_DU_TOURNAGE as readonly string[]).includes(c.split("=")[0]!.trim()));

/** Le signe d’un onglet (POST /api/presence) : son identifiant, l’écran, et d’où il vient (son premier signe compte la visite). */
export type Signe = { onglet: string; etape: EtapeVisite; premier: boolean; utm?: string; referent?: string };

/**
 * Note le signe d’un onglet : sa ligne de la minute (en ligne maintenant, l’écran, la ville), et à son premier signe la
 * visite du jour (une par empreinte) ; une première visite du jour va au fil du direct (« arrive de TikTok »). Un
 * navigateur en mode tournage (une créatrice qui filme, src/server/tournage.ts) n’est ni une visite, ni dans le direct.
 */
export async function noterSigne(req: Request, signe: Signe): Promise<void> {
  if (!signeAdmis(req) || enModeTournage(req)) return;
  const agent = req.headers.get("user-agent");
  const chemin = signe.etape === "partage" ? "/v/" : undefined;
  const source = sourceDe({ utm: signe.utm, referent: signe.referent, chemin, agent });
  const lieu = lieuDe(req);
  const p = schema.presences;
  await Promise.all([
    db()
      .insert(p)
      /* La source reste celle de son premier signe : après un verdict partagé, l’onglet qui passe à l’accueil vient toujours du partage */
      .values({
        onglet: signe.onglet,
        minute: sql`date_trunc('minute', now())`,
        etape: signe.etape,
        source: sql`coalesce((select ${p.source} from ${p} where ${p.onglet} = ${signe.onglet} order by ${p.minute} limit 1), ${source})`,
        ...lieu,
      })
      .onConflictDoUpdate({ target: [p.onglet, p.minute], set: { vuLe: sql`now()`, etape: signe.etape } }),
    signe.premier ? compterLaVisite(req, source, lieu.ville) : null,
  ]);
}

/**
 * Note un jalon du tunnel (POST /api/jalon) : une fois par jour par l’empreinte de la connexion, comme la visite. Ni un
 * navigateur en mode tournage, ni au-delà du garde-fou des signes (les jalons comptent avec eux). Rien ne fait échouer.
 */
export async function noterJalon(req: Request, jalon: Jalon): Promise<void> {
  if (!signeAdmis(req) || enModeTournage(req)) return;
  await auMieux(
    async () => {
      const jour = aujourdhuiParis().iso;
      await db()
        .insert(schema.jalons)
        .values({ jour, empreinte: await empreinteDe(req, jour), jalon })
        .onConflictDoNothing();
    },
    "jalon non noté",
    { jalon },
  );
}

/** Compte la visite du jour de cette connexion, une fois ; la première du jour va au fil. */
async function compterLaVisite(req: Request, source: SourceVisite, ville: string | null): Promise<void> {
  const jour = aujourdhuiParis().iso;
  const empreinte = await empreinteDe(req, jour);
  const nouvelle = await db().insert(schema.visites).values({ jour, empreinte, source }).onConflictDoNothing().returning({ jour: schema.visites.jour });
  if (nouvelle.length) await db().insert(schema.filDirect).values({ genre: "arrivee", ville, source });
}

/**
 * La source de la visite de cette connexion, aujourd’hui ou hier (le même appareil, le même réseau), ou null : pas de
 * visite retrouvée (un réseau mobile qui a changé d’adresse, une visite d’avant le suivi).
 */
export async function sourceDeLaVisite(req: Request): Promise<SourceVisite | null> {
  const jour = aujourdhuiParis().iso;
  const jours = [jour, veilleDe(jour)];
  const t = schema.visites;
  const s = schema.selsDesVisites;
  /* Hier ne se cherche que si son sel existe encore (sinon, pas de visite d’hier à retrouver) */
  const existants = new Set((await db().select({ jour: s.jour }).from(s).where(inArray(s.jour, jours))).map((l) => l.jour));
  for (const j of jours) {
    if (!existants.has(j)) continue;
    const [v] = await db()
      .select({ source: t.source })
      .from(t)
      .where(and(eq(t.jour, j), eq(t.empreinte, await empreinteDe(req, j))));
    if (v) return v.source;
  }
  return null;
}

/** Donne à un compte qui vient d’être créé la source de sa visite (une fois : un compte qui en a une la garde). */
export async function noterLaSourceDuCompte(req: Request, userId: string): Promise<void> {
  await auMieux(async () => {
    const source = await sourceDeLaVisite(req);
    if (!source) return;
    const u = schema.users;
    await db()
      .update(u)
      .set({ source })
      .where(and(eq(u.id, userId), sql`${u.source} is null`));
  }, "source du compte non notée");
}

/**
 * Note un geste au fil du direct, avec la ville de la connexion de la requête. `ref` : l’achat d’un paiement ouvert
 * (noterAchatAuFil y retrouve sa ville).
 */
export async function noterAuFil(req: Request, geste: { genre: Exclude<GenreFil, "arrivee" | "achat">; offre?: OffreId; ref?: string }): Promise<void> {
  await auMieux(
    () =>
      db()
        .insert(schema.filDirect)
        .values({ genre: geste.genre, ville: lieuDe(req).ville, offre: geste.offre ?? null, ref: geste.ref ?? null }),
    "geste du fil non noté",
    { genre: geste.genre },
  );
}

/** Note un achat payé au fil du direct (depuis le webhook, sans connexion à situer) : la ville de son paiement ouvert, s’il y en a un. */
export async function noterAchatAuFil(achat: { id: string; offre: OffreId }): Promise<void> {
  await auMieux(async () => {
    const f = schema.filDirect;
    const [ouvert] = await db()
      .select({ ville: f.ville })
      .from(f)
      .where(and(eq(f.genre, "paiement"), eq(f.ref, achat.id)))
      .limit(1);
    await db()
      .insert(f)
      .values({ genre: "achat", ville: ouvert?.ville ?? null, offre: achat.offre });
  }, "achat du fil non noté");
}
