import "server-only";
import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type { EtapeVisite, FamilleNavigateur, MetriqueWeb } from "@/types";
import { alerter } from "./alertes";
import { db, schema } from "./db";
import { auMieux } from "./journal";
import { LIMITES, sousLaLimite } from "./limites";
import { sousLaLimiteDeLIp } from "./requete";
import { aujourdhuiParis } from "./temps";

/*
 * Ce qui se passe dans le navigateur des visiteurs, qu’aucun journal du serveur ne voit : les erreurs de l’appli (une
 * page qui plante sur un iPhone, une promesse rejetée sans rien pour l’attraper) et la vitesse ressentie (les Web
 * Vitals : l’affichage, la réponse au toucher, la mise en page qui saute), envoyées par src/lib/sentinelle.tsx.
 * Rien qui désigne quelqu’un : ni compte, ni adresse IP (elle ne sert qu’aux limites, comme ailleurs), ni adresse de
 * page (seulement l’écran, ETAPES_VISITE), ni User-Agent (seulement sa famille). Un message d’erreur peut citer un
 * contenu : il est coupé, ses emails et ses longs nombres masqués. Une erreur jamais vue du jour prévient l’équipe
 * (dix par jour au plus) ; toutes se lisent dans /admin, avec les médianes de la vitesse. Gardé NAVIGATEUR_GARDE_JOURS.
 */

const lignes = async <T>(q: SQL) => (await db().execute(q)).rows as T[];

/** Combien de jours la purge garde les erreurs et les mesures des navigateurs. */
export const NAVIGATEUR_GARDE_JOURS = 30;

/** Ce qu’un message d’erreur garde au plus, une fois masqué. */
const MESSAGE_MAX = 300;

/**
 * Un message ou une source sans ce qui pourrait désigner quelqu’un, ni de quoi tromper qui le lit : les caractères de
 * contrôle, les emails, les adresses web (avec ou sans « https:// » : ‹url›, rien de cliquable), les identifiants
 * (uuid), les nombres de 4 chiffres ou plus, même écrits par morceaux (« 06 12 34 56 78 », un code), les paramètres
 * d’une adresse ; coupé à `max` caractères.
 */
export function masquer(texte: string, max = MESSAGE_MAX): string {
  return texte
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi, "‹email›")
    .replace(/\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+/gi, "‹url›")
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|fr|net|org|io|co|app|dev|me|ly|link|xyz|info|biz|site|online|shop|be|ch|ca|de|uk|eu|ru|cn|tk|ml|gq)\b\S*/gi, "‹url›")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "‹id›")
    .replace(/\?[^\s)]*/g, "")
    .replace(/\d(?:[\s.\-/]?\d){3,}/g, "‹n›")
    .slice(0, max);
}

/** Le nom d’une erreur tel qu’un navigateur le donne (TypeError, AbortError…) : un mot ; tout le reste devient « Erreur ». */
const nomDeLErreur = (nom: string) => (/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(nom) ? nom : "Erreur");

/** La source d’une erreur réduite à un fichier de l’appli et sa ligne (« /_next/static/chunks/a1b2.js:1:2345 ») ; null pour tout le reste (une extension, un autre site). */
export function sourceDeLAppli(source: string | undefined): string | null {
  if (!source) return null;
  const m = /(\/_next\/static\/[\w./-]+\.js)(?::\d+(?::\d+)?)?/.exec(source);
  return m ? m[0].slice(0, 200) : null;
}

/** La famille d’un navigateur d’après son User-Agent : un iPhone, Android, le navigateur intégré d’une appli (Instagram, TikTok…), un ordinateur. */
export function familleDe(ua: string | null): FamilleNavigateur {
  if (!ua) return "autre";
  const appli = /Instagram|FBAN|FBAV|musical_ly|TikTok|Snapchat|BytedanceWebview/i.test(ua);
  if (/iPhone|iPad|iPod/i.test(ua)) return appli ? "iphone-appli" : "iphone";
  if (/Android/i.test(ua)) return appli ? "android-appli" : "android";
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return "ordinateur";
  return "autre";
}

/** Une erreur remontée par un navigateur (POST /api/navigateur/erreur). */
export type ErreurDuNavigateur = { nom: string; message: string; source?: string; etape: EtapeVisite };

/**
 * Note une erreur remontée par un navigateur : une ligne par signature (son nom, son message aux nombres effacés, son
 * fichier) et par jour, dont le nombre de fois monte. La première du jour d’une signature prévient l’équipe (au plus
 * LIMITES.alertesNavigateurParJour) par un mail qui ne recopie RIEN de ce que le navigateur a écrit : n’importe qui peut
 * appeler cette route, et un message libre dans un mail signé BLUSH serait une porte ouverte au hameçonnage. Le mail
 * dit le genre d’erreur (un mot), l’écran, la famille du navigateur, et renvoie à /admin, où le message masqué se lit.
 * Au-delà de sa limite (LIMITES.erreurNavigateurParIp), une adresse n’est plus écoutée, sans le dire.
 */
export async function noterErreurDuNavigateur(req: Request, e: ErreurDuNavigateur): Promise<void> {
  if (!(await sousLaLimiteDeLIp(req, "navigateur:erreur", LIMITES.erreurNavigateurParIp))) return;
  const nom = nomDeLErreur(e.nom);
  const message = masquer(e.message);
  const source = sourceDeLAppli(e.source);
  const famille = familleDe(req.headers.get("user-agent"));
  /* Le même bug d’un jour à l’autre et d’un déploiement à l’autre : sans les nombres, ni le nom haché du fichier */
  const signature = createHash("sha256")
    .update(`${nom}|${message.replace(/\d+/g, "#")}|${source?.replace(/\/[\w-]+\.js.*/, "") ?? ""}`)
    .digest("base64url")
    .slice(0, 22);
  const jour = aujourdhuiParis().iso;
  const [ligne] = await db()
    .insert(schema.erreursNavigateur)
    .values({ jour, signature, nom, message, source, etape: e.etape, famille })
    .onConflictDoUpdate({
      target: [schema.erreursNavigateur.jour, schema.erreursNavigateur.signature],
      set: { fois: sql`${schema.erreursNavigateur.fois} + 1`, derniereLe: sql`now()` },
    })
    .returning({ fois: schema.erreursNavigateur.fois });
  if (ligne?.fois !== 1) return;
  await auMieux(async () => {
    if (!(await sousLaLimite("alertes:navigateur", LIMITES.alertesNavigateurParJour))) return;
    await alerter("erreur dans un navigateur", [
      `Une erreur ${nom} jamais vue aujourd’hui, sur l’écran « ${e.etape} » (navigateur : ${famille}${source ? ", dans le code de l’appli" : ""}).`,
      "Son message (masqué, non vérifié : n’importe quel navigateur peut écrire ici) et ses suivantes se lisent dans /admin, bloc « Navigateurs ».",
    ]);
  }, "alerte d’une erreur de navigateur");
}

/** Les mesures de vitesse d’une page quittée (POST /api/navigateur/mesures). */
export type MesuresDuNavigateur = { etape: EtapeVisite; mobile: boolean; mesures: { metrique: MetriqueWeb; valeur: number }[] };

/** Note les mesures de vitesse d’une page, une ligne chacune. Au-delà de sa limite (LIMITES.mesuresParIp), une adresse n’est plus écoutée, sans le dire. */
export async function noterMesuresDuNavigateur(req: Request, m: MesuresDuNavigateur): Promise<void> {
  if (!m.mesures.length || !(await sousLaLimiteDeLIp(req, "navigateur:mesures", LIMITES.mesuresParIp))) return;
  await db()
    .insert(schema.mesuresNavigateur)
    .values(m.mesures.map((x) => ({ etape: m.etape, mobile: m.mobile, metrique: x.metrique, valeur: x.valeur })));
}

/** La vitesse d’un écran, sur téléphone ou non : le 75e centile de chaque mesure (ce que vit le visiteur lent), et combien de pages mesurées. */
type VitesseDUnEcran = { etape: EtapeVisite; mobile: boolean; pages: number } & Partial<Record<MetriqueWeb, number>>;
/** Une erreur des navigateurs sur la période : combien de fois, depuis quand, où. */
type ErreurVue = { nom: string; message: string; source: string | null; etape: EtapeVisite; famille: FamilleNavigateur; fois: number; derniere: string };
/** La santé des navigateurs sur la période, pour /admin. */
export type SanteDesNavigateurs = { vitesse: VitesseDUnEcran[]; erreurs: ErreurVue[]; totalErreurs: number };

/** La santé des navigateurs sur les `jours` derniers jours : la vitesse par écran (au moins 5 pages mesurées), et les 10 erreurs les plus fréquentes. */
export async function santeDesNavigateurs(jours: number): Promise<SanteDesNavigateurs> {
  const depuis = sql`now() - make_interval(days => ${jours})`;
  const [vitesse, erreurs, total] = await Promise.all([
    lignes<{ etape: EtapeVisite; mobile: boolean; metrique: MetriqueWeb; p75: number; n: string }>(
      sql`select etape, mobile, metrique, percentile_cont(0.75) within group (order by valeur) as p75, count(*) as n
          from mesures_navigateur where le >= ${depuis} group by etape, mobile, metrique`,
    ),
    lignes<{ nom: string; message: string; source: string | null; etape: EtapeVisite; famille: FamilleNavigateur; fois: string; derniere: Date }>(
      sql`select nom, message, max(source) as source, (array_agg(etape order by derniere_le desc))[1] as etape,
            (array_agg(famille order by derniere_le desc))[1] as famille, sum(fois) as fois, max(derniere_le) as derniere
          from erreurs_navigateur where derniere_le >= ${depuis} group by signature, nom, message order by sum(fois) desc limit 10`,
    ),
    lignes<{ n: string | null }>(sql`select sum(fois) as n from erreurs_navigateur where derniere_le >= ${depuis}`),
  ]);
  const ecrans = new Map<string, VitesseDUnEcran>();
  for (const v of vitesse) {
    const cle = `${v.etape}|${v.mobile}`;
    const e = ecrans.get(cle) ?? { etape: v.etape, mobile: v.mobile, pages: 0 };
    e[v.metrique] = Math.round(Number(v.p75) * (v.metrique === "CLS" ? 1000 : 1)) / (v.metrique === "CLS" ? 1000 : 1);
    /* Chaque page envoie au moins son TTFB : son nombre est celui des pages mesurées */
    if (v.metrique === "TTFB") e.pages = Number(v.n);
    ecrans.set(cle, e);
  }
  return {
    vitesse: [...ecrans.values()].filter((e) => e.pages >= 5).sort((a, b) => b.pages - a.pages),
    erreurs: erreurs.map((e) => ({ ...e, fois: Number(e.fois), derniere: new Date(e.derniere).toISOString() })),
    totalErreurs: Number(total[0]?.n ?? 0),
  };
}
