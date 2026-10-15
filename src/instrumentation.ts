import type { Instrumentation } from "next";
import { estUnAbandon } from "@/lib/tracer";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- instrumentation.ts ne tourne que sur le serveur (Next le charge au démarrage de l’instance), jamais dans le navigateur
import { auMieux, journal, journalErreur } from "@/server/journal";

/*
 * L’instrumentation de Next (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 * Une erreur qui remonte jusqu’à Next (une page qui plante, une route qui lève sans la rattraper) laisse une ligne au
 * journal : son nom, son code et son empreinte (digest, que la page d’erreur montre pour la retrouver), avec la route
 * (son fichier, « /api/fiche » ou « /ouvrir/[id] », jamais l’adresse demandée ni ses paramètres). C’est une panne :
 * elle se compte pour le jour, et la première du jour de ce fichier part à l’équipe (signalerUnePanne,
 * src/server/pannes.ts). Une page quittée en route par le navigateur n’en est pas une : une ligne « info », sans plus.
 * Elle trace, elle ne protège pas les logs : Next écrit l’erreur entière (son message, qui pour une erreur SQL cite ses
 * paramètres, un email) avant de l’appeler (RouteModule.onRequestError). Une route /api ne laisse donc rien remonter :
 * elle passe par l’enveloppe `route` (src/server/http.ts), qui répond « panne » sans le message, et compte la sienne.
 * Ce fichier se charge au démarrage de chaque instance : il n’importe que le journal (et src/lib/tracer.ts). Le
 * compteur et les alertes (la base, les mails) ne se chargent qu’à la première panne, et jamais dans le runtime edge
 * (aucune page n’y tourne, et la base n’y est pas). Next attend la promesse rendue : la panne se compte avant que
 * l’instance ne s’endorme.
 */
export const onRequestError: Instrumentation.onRequestError = async (erreur, requete, contexte) => {
  const champs = { route: contexte.routePath, type: contexte.routeType, methode: requete.method };
  if (estUnAbandon(erreur)) return journal("requête abandonnée", { ...champs, code: "abandon" });
  journalErreur("requête en erreur", erreur, champs);
  /* Écrit tel quel, comme le veut la documentation de Next : le build y met la valeur de chaque runtime, et retire l’import de celui d’edge */
  // eslint-disable-next-line no-restricted-syntax -- NEXT_RUNTIME n’est pas de la configuration : Next le remplace au build, par runtime
  if (process.env.NEXT_RUNTIME === "edge") return;
  await auMieux(
    // eslint-disable-next-line no-restricted-syntax -- seulement côté serveur (Node), à la première panne : voir plus haut
    async () => (await import("@/server/pannes")).signalerUnePanne(contexte.routePath, erreur, "page"),
    "panne non signalée",
    { route: contexte.routePath },
  );
};
