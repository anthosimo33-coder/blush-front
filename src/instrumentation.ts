import type { Instrumentation } from "next";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- instrumentation.ts ne tourne que sur le serveur (Next le charge au démarrage de l’instance), jamais dans le navigateur
import { journalErreur } from "@/server/journal";

/*
 * L’instrumentation de Next (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 * Une erreur qui remonte jusqu’à Next (une page qui plante, une route qui lève sans la rattraper) laisse une ligne au
 * journal : son nom, son code et son empreinte (digest, que la page d’erreur montre pour la retrouver), avec la route
 * (son fichier, « /api/fiche » ou « /ouvrir/[id] », jamais l’adresse demandée ni ses paramètres). Elle trace, elle ne
 * protège pas les logs : Next écrit l’erreur entière (son message, qui pour une erreur SQL cite ses paramètres, un
 * email) avant de l’appeler (RouteModule.onRequestError). Une route /api ne laisse donc rien remonter : elle passe par
 * l’enveloppe `route` (src/server/http.ts), qui répond « panne » sans le message.
 */
export const onRequestError: Instrumentation.onRequestError = (erreur, requete, contexte) => {
  journalErreur("requête en erreur", erreur, { route: contexte.routePath, type: contexte.routeType, methode: requete.method });
};
