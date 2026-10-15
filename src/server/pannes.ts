import "server-only";
import { champsDErreur, estUnAbandon } from "@/lib/tracer";
import { alerter } from "./alertes";
import { compterUnePanne } from "./compteurs";

/*
 * Les pannes du serveur (OPS-2) : une route /api qui répond « panne » (une erreur imprévue rattrapée par l’enveloppe
 * `route`, src/server/http.ts), une page ou un gestionnaire hors de /api qui plante (onRequestError,
 * src/instrumentation.ts). Chacune se compte par lieu et par jour de Paris (la table counters, « panne:<lieu> »), que la
 * carte Santé d’/admin lit (src/server/stats.ts). La première du jour d’un lieu part aussi à l’équipe, dans le budget
 * des alertes : une rafale (un déploiement qui casse une route pour tout le monde) ne fait qu’un mail par lieu et par
 * jour, et un sujet par genre (5 mails par jour au plus, src/server/limites.ts) borne une panne qui touche toutes les
 * routes à la fois. Jamais le message de l’erreur (une erreur SQL cite ses paramètres, un email) : le lieu, le nom et le
 * code de l’erreur, et l’empreinte qu’une page d’erreur montre (digest). Une page qui plante dans un composant serveur
 * compte deux fois par requête : Next appelle onRequestError pour son rendu serveur (RSC), puis pour son HTML, avec la
 * même empreinte. Le compte dit l’ampleur, pas le nombre exact de visiteurs.
 * Pas de boucle : rien ici ne lève (le compteur rend null, alerter() rattrape tout, src/server/alertes.ts), et une
 * alerte qui échoue ne laisse qu’une ligne au journal, jamais une autre panne. Une base en panne ne se compte pas (le
 * compteur rend null) et n’alerte pas d’ici, puisque le budget des alertes vit dans la même base : la veille la voit
 * (/api/reveil, .github/workflows/veille.yml), et la mise en production aussi (.github/workflows/ci.yml).
 */

/** Où la panne a eu lieu : une route /api (par l’enveloppe `route`), ou une page et tout ce qui remonte jusqu’à Next. */
type GenreDePanne = "route" | "page";

/** Le sujet de l’alerte, un par genre : son budget du jour est celui de tous les lieux du genre. */
const SUJETS: Record<GenreDePanne, string> = { route: "route /api en panne", page: "page en panne" };

/**
 * Une panne de `lieu` (la clé du contrat d’une route, « POST /api/import » ; le fichier d’une page, « /rapport/[id] »,
 * jamais l’adresse demandée) : comptée pour aujourd’hui, et à l’équipe si c’est la première du jour de ce lieu. Une
 * requête abandonnée par le navigateur n’en est pas une. Ne lève jamais.
 */
export async function signalerUnePanne(lieu: string, e: unknown, genre: GenreDePanne): Promise<void> {
  if (estUnAbandon(e)) return;
  if ((await compterUnePanne(lieu)) !== 1) return;
  const { erreur, code, digest } = champsDErreur(e);
  await alerter(SUJETS[genre], [
    `${genre === "route" ? "Route" : "Page"} : ${lieu}`,
    `Erreur : ${erreur}${code ? ` (${code})` : ""}`,
    ...(digest ? [`Empreinte : ${digest}`] : []),
    "",
    "La première panne du jour à cet endroit : les suivantes se comptent dans /admin (Santé), sans mail. Le détail est au journal du serveur.",
  ]);
}
