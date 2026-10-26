import "server-only";
import { and, isNotNull, isNull, lt, not, or } from "drizzle-orm";
import { jourDeParisAvant } from "@/lib/jours";
import { alerter } from "./alertes";
import { purgerLaListe } from "./attente";
import { db, schema } from "./db";
import { EVENEMENTS_MAILS_GARDES_JOURS } from "./delivrabilite";
import { PREDICATS } from "./depot";
import { IMPORTS_GARDES_JOURS } from "./imports";
import { journalErreur } from "./journal";
import { purgerLOAuth } from "./mcp/acces";
import { NAVIGATEUR_GARDE_JOURS } from "./navigateur";
import { PRESENCES_GARDEES_JOURS, VISITES_GARDEES_JOURS } from "./visites";

/*
 * La purge quotidienne (Vercel Cron) : on ne garde rien plus longtemps qu’utile.
 * - un brouillon jamais rattaché à un compte : effacé après 24 h ;
 * - une conv rattachée à un compte mais jamais lue (connecté, puis arrêté avant « Qui es-tu ? ») : pareil ;
 * - la conv brute d’une histoire dont le rapport est écrit, mais dont la mémoire n’a jamais pu se faire : effacée après
 *   30 jours (sinon, elle part dès la mémoire faite). Sans rapport, elle reste, chiffrée, jusqu’au déblocage : c’est
 *   d’elle que le rapport s’écrira (choix du 9 octobre 2026). Supprimer l’histoire ou le compte l’efface ;
 * - les sessions expirées, les vieux codes de connexion, et les compteurs de limites dont la fenêtre est finie ;
 * - les inscriptions à la liste d’attente de plus d’un an (ATTENTE_GARDEE_JOURS, src/server/attente.ts) ;
 * - les webhooks de paiement déjà traités (evenements_paiement) de plus de 90 jours (EVENEMENTS_PAIEMENT_GARDES_JOURS) :
 *   Whop ne rejoue un webhook que quelques jours, au-delà son `webhook-id` ne sert plus à rien ;
 * - les événements des mails que Resend nous rend (evenements_mails) de plus de 30 jours (EVENEMENTS_MAILS_GARDES_JOURS,
 *   src/server/delivrabilite.ts) : /admin n’en lit que les 7 derniers jours ;
 * - pour /admin (src/server/visites.ts) : les signes des onglets et le fil du direct de plus de deux jours
 *   (PRESENCES_GARDEES_JOURS), les visites et les jalons du tunnel (appli par appli aussi) de plus de 90 jours (VISITES_GARDEES_JOURS), et le sel
 *   des empreintes dès le surlendemain : plus rien ne relie alors une empreinte à une connexion ;
 * - les erreurs et les mesures de vitesse des navigateurs de plus de 30 jours (NAVIGATEUR_GARDE_JOURS, src/server/navigateur.ts) ;
 * - les accès de Claude à /admin (src/server/mcp/acces.ts) : les codes expirés, les accès dont le rafraîchissement a
 *   expiré, et les clients restés sans accès ;
 * - le registre des effacements de plus de 90 jours (EFFACEMENTS_GARDES_JOURS) : plus long que la fenêtre de restauration de la base ;
 * - la mesure des imports (src/server/imports.ts) de plus de 90 jours (IMPORTS_GARDES_JOURS) : /admin n’en lit que les 30 derniers.
 */

/** Combien de jours on garde le registre des effacements : plus que la fenêtre de restauration de Neon (BACKEND.md, « Les sauvegardes »). */
const EFFACEMENTS_GARDES_JOURS = 90;

/** Combien de jours on garde un webhook de paiement déjà traité (son `webhook-id`, pour l’ignorer s’il revient). */
const EVENEMENTS_PAIEMENT_GARDES_JOURS = 90;
export async function purger(maintenant = new Date()) {
  const il_y_a = (jours: number) => new Date(maintenant.getTime() - jours * 86400e3);
  /*
   * Chaque étape à part (S-35) : une erreur (la base qui coupe, un verrou) n’empêche pas les suivantes. Elle laisse une
   * ligne au journal (son nom et son code, jamais son message), et l’équipe reçoit une seule alerte pour toutes, à la
   * fin : les promesses de conservation (24 h, 30 jours) ne se rompent pas sans que personne le voie.
   */
  const echecs: string[] = [];
  const etape = async (nom: string, travail: () => Promise<unknown[] | void>): Promise<number> => {
    try {
      return (await travail())?.length ?? 0;
    } catch (e) {
      journalErreur("purge : étape en échec", e, { etape: nom });
      echecs.push(nom);
      return 0;
    }
  };
  const brouillons = await etape("brouillons", () =>
    db()
      .delete(schema.stories)
      .where(and(isNull(schema.stories.userId), lt(schema.stories.createdAt, il_y_a(1))))
      .returning({ id: schema.stories.id }),
  );
  /* Les tâches restent une fois finies : une histoire sans aucune tâche n’a jamais été lue */
  const jamaisLues = await etape("convs jamais lues", () =>
    db()
      .delete(schema.stories)
      .where(and(isNotNull(schema.stories.userId), lt(schema.stories.createdAt, il_y_a(1)), not(PREDICATS.lue)))
      .returning({ id: schema.stories.id }),
  );
  const convs = await etape("convs brutes", () =>
    db()
      .update(schema.stories)
      .set({ conv: null, convPurgedAt: maintenant })
      .where(and(PREDICATS.convGardee, lt(schema.stories.createdAt, il_y_a(30)), PREDICATS.rapportPret))
      .returning({ id: schema.stories.id }),
  );
  const sessions = await etape("sessions", () => db().delete(schema.sessions).where(lt(schema.sessions.expiresAt, maintenant)).returning({ id: schema.sessions.id }));
  await etape("codes de connexion", async () => {
    await db()
      .delete(schema.loginCodes)
      .where(lt(schema.loginCodes.expiresAt, il_y_a(1)));
  });
  /* Une clé de limite part une fois sa fenêtre finie (expires_at) ; une ligne d’avant la colonne, après deux jours, comme avant */
  await etape("limites", async () => {
    await db()
      .delete(schema.rateLimits)
      .where(or(lt(schema.rateLimits.expiresAt, maintenant), and(isNull(schema.rateLimits.expiresAt), lt(schema.rateLimits.windowStart, il_y_a(2)))));
  });
  await etape("webhooks de paiement", async () => {
    await db()
      .delete(schema.evenementsPaiement)
      .where(lt(schema.evenementsPaiement.recuLe, il_y_a(EVENEMENTS_PAIEMENT_GARDES_JOURS)));
  });
  await etape("événements des mails", async () => {
    await db()
      .delete(schema.evenementsMails)
      .where(lt(schema.evenementsMails.le, il_y_a(EVENEMENTS_MAILS_GARDES_JOURS)));
  });
  await etape("liste d’attente", () => purgerLaListe(maintenant));
  await etape("signes des onglets", async () => {
    await db()
      .delete(schema.presences)
      .where(lt(schema.presences.vuLe, il_y_a(PRESENCES_GARDEES_JOURS)));
  });
  await etape("fil du direct", async () => {
    await db()
      .delete(schema.filDirect)
      .where(lt(schema.filDirect.le, il_y_a(PRESENCES_GARDEES_JOURS)));
  });
  await etape("visites", async () => {
    await db()
      .delete(schema.visites)
      .where(lt(schema.visites.arriveLe, il_y_a(VISITES_GARDEES_JOURS)));
  });
  await etape("jalons du tunnel", async () => {
    await db()
      .delete(schema.jalons)
      .where(lt(schema.jalons.le, il_y_a(VISITES_GARDEES_JOURS)));
    await db()
      .delete(schema.jalonsParAppli)
      .where(lt(schema.jalonsParAppli.le, il_y_a(VISITES_GARDEES_JOURS)));
  });
  await etape("mesure des imports", async () => {
    await db()
      .delete(schema.imports)
      .where(lt(schema.imports.creeLe, il_y_a(IMPORTS_GARDES_JOURS)));
  });
  await etape("registre des effacements", async () => {
    await db()
      .delete(schema.effacements)
      .where(lt(schema.effacements.le, il_y_a(EFFACEMENTS_GARDES_JOURS)));
  });
  await etape("erreurs et mesures des navigateurs", async () => {
    await db()
      .delete(schema.erreursNavigateur)
      .where(lt(schema.erreursNavigateur.derniereLe, il_y_a(NAVIGATEUR_GARDE_JOURS)));
    await db()
      .delete(schema.mesuresNavigateur)
      .where(lt(schema.mesuresNavigateur.le, il_y_a(NAVIGATEUR_GARDE_JOURS)));
  });
  await etape("accès de Claude à /admin", () => purgerLOAuth(maintenant));
  /* Le sel d’hier sert encore (sourceDeLaVisite retrouve la visite de la veille) ; celui d’avant-hier, plus rien */
  await etape("sels des visites", async () => {
    await db()
      .delete(schema.selsDesVisites)
      .where(lt(schema.selsDesVisites.jour, jourDeParisAvant(1, maintenant)));
  });
  if (echecs.length)
    await alerter(
      "purge de la nuit incomplète",
      [
        `Étapes en échec : ${echecs.join(", ")}. Les autres ont tourné.`,
        "Le journal garde le code de chaque erreur (« purge : étape en échec ») ; la purge de la nuit prochaine les reprend.",
      ],
      /* Ce qu’on a promis de ne pas garder reste en base : passe dans la réserve des alertes importantes (S-19) */
      { importante: true },
    );
  return { brouillons: brouillons + jamaisLues, convs, sessions };
}
