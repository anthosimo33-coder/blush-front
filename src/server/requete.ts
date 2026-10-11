import "server-only";
import { peut, type Besoin } from "@/lib/acces";
import { compteDeSession, type Utilisateur } from "./auth";
import { lireSession } from "./cookies";
import { contexteRequete } from "./donnees";
import { cleDuCompte, type LimiteDuCompte } from "./email-canonique";
import type { LigneEcran } from "./histoires";
import { erreur, memeOrigine } from "./http";
import { ipDe, sousLaLimite, type LIMITES } from "./limites";

/*
 * La garde commune des routes /api : ce que chacune vérifie avant de faire quoi que ce soit, toujours dans le même ordre.
 * 1. D’où vient la requête : une requête qui modifie (tout sauf GET et HEAD) doit venir de l’appli (memeOrigine), 403
 *    « origine ». La méthode en décide, pas la route : une mutation ajoutée est gardée sans y penser.
 * 2. Qui la fait : sa session, requise (401 « connexion »), facultative, ou lue sans le filtre de la bêta (« Tout effacer »).
 * 3. Ce que son plan ouvre (402 « acces »), puis sa conv ouverte (404 « aucune »).
 * 4. Une limite du jour, par compte ou par adresse IP (429 « trop »).
 * Elle rend le contexte de la requête (le compte, sa conv), ou la réponse d’erreur que la route renvoie telle quelle.
 * tests/unit/garde-routes.test.ts vérifie le 403 et le 401 de chaque route de la table (src/types/api.ts).
 */

type Limite = (typeof LIMITES)[keyof typeof LIMITES];

/**
 * Qui fait la requête. « requise » : un compte connecté, que la bêta laisse entrer. « facultative » : le compte s’il y en
 * a un (et sa conv ouverte, ou le brouillon importé). « sansBeta » : un compte connecté, même retiré de la bêta, sans sa
 * conv (seul « Tout effacer » s’en sert : on peut toujours effacer ce qu’on a laissé). « aucune » : la route ne lit pas
 * la session (l’import avant l’email, la connexion, la liste d’attente).
 */
type Session = "requise" | "facultative" | "sansBeta" | "aucune";

/** Une limite comptée à l’entrée de la route : sa clé (« image »), son plafond (LIMITES), et sur quoi elle se range. */
type LimiteDeRoute = { cle: LimiteDuCompte; limite: Limite; par: "compte" } | { cle: string; limite: Limite; par: "ip" };

type Options = {
  session: Session;
  /** Les écrans et les routes de l’import : la conv en train d’être importée passe avant celle qui est ouverte (histoireOuverte). */
  parcours?: boolean;
  /** Il faut une conv ouverte. */
  histoire?: boolean;
  /** Ce que le plan du compte doit ouvrir (src/lib/acces.ts). */
  plan?: Besoin;
  limite?: LimiteDeRoute;
};

/** Le contexte d’une requête gardée : le compte et sa conv, typés d’après ce que la garde a exigé. */
type Garde<O extends Options> = {
  utilisateur: O["session"] extends "requise" | "sansBeta" ? Utilisateur : Utilisateur | null;
  story: O["histoire"] extends true ? LigneEcran : LigneEcran | null;
};

/** Les méthodes qui ne font que lire : tout le reste doit venir de l’appli. */
const LECTURES = new Set(["GET", "HEAD"]);

/**
 * Le compte de la requête et sa conv ouverte (contexteRequete, src/server/donnees.ts), en options nommées. `parcours` :
 * les écrans et routes de l’import, qui suivent d’abord la conv en train d’être importée.
 */
export const contexte = ({ parcours = false }: { parcours?: boolean } = {}) => contexteRequete(parcours);

/** Compte un passage de cette limite pour ce compte (rangée sur son email canonique : cleDuCompte), et dit s’il reste dessous. */
export const sousLaLimiteDuCompte = (utilisateur: Pick<Utilisateur, "email">, cle: LimiteDuCompte, limite: Limite) => sousLaLimite(`${cle}:${cleDuCompte(utilisateur.email)}`, limite);

/** Compte un passage de cette limite pour l’adresse IP de la requête (une IPv6 par son /64 : ipDe), et dit s’il reste dessous. */
export const sousLaLimiteDeLIp = (req: Request, cle: string, limite: Limite) => sousLaLimite(`${cle}:${ipDe(req)}`, limite);

/**
 * Garde une route (voir l’en-tête) : `req` dit sa méthode, son origine et son adresse IP. Rend son contexte, ou la
 * réponse d’erreur à renvoyer telle quelle :
 *   const g = await garde(req, { session: "requise", histoire: true });
 *   if (g instanceof Response) return g;
 */
export async function garde<const O extends Options>(req: Request, options: O): Promise<Garde<O> | Response> {
  if (!LECTURES.has(req.method) && !memeOrigine(req)) return erreur("origine");
  return verifier(req, options);
}

/** La même garde pour une route qui ne lit rien de sa requête (un GET sans paramètre) : ni origine, ni adresse IP. */
export function lecture<const O extends Options & { limite?: Extract<LimiteDeRoute, { par: "compte" }> }>(options: O): Promise<Garde<O> | Response> {
  return verifier(null, options);
}

async function verifier<O extends Options>(req: Request | null, { session, parcours, histoire, plan, limite }: O): Promise<Garde<O> | Response> {
  let utilisateur: Utilisateur | null = null;
  let story: LigneEcran | null = null;
  if (session === "sansBeta") utilisateur = await compteDeSession(await lireSession());
  else if (session !== "aucune") ({ utilisateur, story } = await contexte({ parcours }));
  if (!utilisateur && (session === "requise" || session === "sansBeta")) return erreur("connexion");
  if (plan && !(utilisateur && peut(utilisateur.plan, plan))) return erreur("acces");
  if (histoire && !story) return erreur("aucune");
  if (limite) {
    const sous =
      limite.par === "ip" ? !!req && (await sousLaLimiteDeLIp(req, limite.cle, limite.limite)) : !!utilisateur && (await sousLaLimiteDuCompte(utilisateur, limite.cle, limite.limite));
    if (!sous) return erreur("trop");
  }
  return { utilisateur, story } as Garde<O>;
}
