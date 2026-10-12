import "server-only";
import { peut, type Besoin } from "@/lib/acces";
import { estMutation } from "@/types/api";
import { alerter } from "./alertes";
import { compteDeSession, type Utilisateur } from "./auth";
import { lireSession } from "./cookies";
import { contexteRequete } from "./donnees";
import { cleDeLimiteDuCompte, LIMITES_DU_COMPTE, type LimiteDuCompte } from "./email-canonique";
import type { LigneEcran } from "./histoires";
import { erreur, memeOrigine } from "./http";
import { auMieux } from "./journal";
import { compter, ipDe, LIMITES, rendre, sousLaLimite, type Limite } from "./limites";

/*
 * La garde commune des routes /api : ce que chacune vérifie avant de faire quoi que ce soit, toujours dans le même ordre.
 * 1. D’où vient la requête : une requête qui modifie (tout sauf GET et HEAD) doit venir de l’appli (memeOrigine), 403
 *    « origine ». La méthode en décide, pas la route : une mutation ajoutée est gardée sans y penser.
 * 2. Qui la fait : sa session, requise (401 « connexion »), facultative, ou lue sans le filtre de la bêta (« Tout effacer »).
 * 3. Ce que son plan ouvre (402 « acces »), puis sa conv ouverte (404 « aucune »).
 * 4. Une limite par adresse IP (429 « trop »), comptée en dernier : une requête refusée avant ne l’use pas. Une limite
 *    par compte, elle, se compte dans la route (sousLaLimiteDuCompte), une fois qu’elle sait ce qu’elle lance (un
 *    message au chat, un vocal, une lecture) : elle peut la rendre si rien ne part (rendreAuCompte).
 * Elle rend le contexte de la requête (le compte, sa conv), ou la réponse d’erreur que la route renvoie telle quelle.
 * tests/unit/garde-routes.test.ts vérifie le 403 et le 401 de chaque route de la table (src/types/api.ts).
 */

/**
 * Qui fait la requête. « requise » : un compte connecté, que la bêta laisse entrer. « facultative » : le compte s’il y en
 * a un (et sa conv ouverte, ou le brouillon importé). « sansBeta » : un compte connecté, même retiré de la bêta, sans sa
 * conv (seul « Tout effacer » s’en sert : on peut toujours effacer ce qu’on a laissé). « aucune » : la route ne lit pas
 * la session (l’import avant l’email, la connexion, la liste d’attente).
 */
type Session = "requise" | "facultative" | "sansBeta" | "aucune";

/** Une limite par adresse IP comptée à l’entrée de la route : son nom (le début de sa clé) et son plafond (LIMITES). */
type LimiteDeRoute = { ip: string; limite: Limite };

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

/**
 * Le compte de la requête et sa conv ouverte (contexteRequete, src/server/donnees.ts), en options nommées. `parcours` :
 * les écrans et routes de l’import, qui suivent d’abord la conv en train d’être importée.
 */
export const contexte = ({ parcours = false }: { parcours?: boolean } = {}) => contexteRequete(parcours);

/**
 * Compte un passage de cette limite pour ce compte, et dit s’il reste dessous. Rangée sur son email canonique
 * (cleDeLimiteDuCompte) : un alias, ou le même compte effacé puis recréé, ne repart pas de zéro. Son plafond vient de son
 * nom (LIMITES_DU_COMPTE).
 */
export const sousLaLimiteDuCompte = (compte: { email: string }, nom: LimiteDuCompte) => sousLaLimite(cleDeLimiteDuCompte(nom, compte.email), LIMITES[LIMITES_DU_COMPTE[nom]]);

/** Rend un passage compté pour ce compte (sousLaLimiteDuCompte) : ce qui l’a compté n’a finalement rien lancé. */
export const rendreAuCompte = (compte: { email: string }, nom: LimiteDuCompte) => rendre(cleDeLimiteDuCompte(nom, compte.email));

/**
 * Compte un passage de cette limite pour l’adresse IP de la requête (une IPv6 par son /64 : ipDe), et dit s’il reste
 * dessous. Sa clé, « <nom>:ip:<adresse> », ne peut pas tomber sur celle d’un compte (« <nom>:compte:<email> ») : une
 * adresse lue dans x-forwarded-for qui n’en est pas une (« compte:quelquun@gmail.com ») reste dans la famille des IP.
 */
export const sousLaLimiteDeLIp = (req: Request, nom: string, limite: Limite, n = 1) => sousLaLimite(`${nom}:ip:${ipDe(req)}`, limite, n);

/* Le compteur du jour des Ko importés par tous (LIMITES.koBrouillonsParJour) */
const KO_DES_BROUILLONS = "brouillons:ko";

/**
 * Les octets d’un import tiennent-ils dans le budget du jour (S-02) ? Comptés en Ko, arrondis au-dessus : d’abord pour
 * l’adresse IP de la requête (LIMITES.koImportParIp ; un fichier refusé compte aussi, comme tout passage), puis pour tous
 * (LIMITES.koBrouillonsParJour ; un fichier refusé là rend sa place, il ne garde personne dehors). L’équipe est prévenue
 * quand le jour passe 80 % du plafond de tous, puis quand il l’atteint : une fois chacun par jour.
 */
export async function octetsDansLeBudget(req: Request, octets: number): Promise<boolean> {
  const ko = Math.max(1, Math.ceil(octets / 1024));
  if (!(await sousLaLimiteDeLIp(req, "import:ko", LIMITES.koImportParIp, ko))) return false;
  const { alerteA, ...jour } = LIMITES.koBrouillonsParJour;
  const total = await compter(KO_DES_BROUILLONS, jour, ko);
  const avant = total - ko;
  /* Le premier refusé (un import qui remplit pile le plafond passe : c’est le suivant qui le dit) */
  if (avant <= jour.max && total > jour.max) await prevenirDesBrouillons(1, avant);
  else if (avant < alerteA * jour.max && total >= alerteA * jour.max) await prevenirDesBrouillons(alerteA, total);
  if (total <= jour.max) return true;
  await rendre(KO_DES_BROUILLONS, ko);
  return false;
}

/** Prévient l’équipe que les Ko importés du jour ont passé ce seuil du plafond (1 : atteint), une fois par seuil et par jour. */
async function prevenirDesBrouillons(seuil: number, ko: number): Promise<void> {
  await auMieux(async () => {
    if (!(await sousLaLimite(`${KO_DES_BROUILLONS}:alerte:${seuil}`, { max: 1, fenetreS: 86400 }))) return;
    const { max } = LIMITES.koBrouillonsParJour;
    await alerter(
      seuil >= 1 ? "imports : plafond du jour atteint" : `imports : ${Math.round(seuil * 100)} % du plafond du jour`,
      [
        `${ko} Ko importés depuis le début de la fenêtre, pour un plafond de ${max} Ko par jour (LIMITES.koBrouillonsParJour).`,
        "Au plafond, plus personne ne peut importer : chacun voit « trop » jusqu’à la fin de la fenêtre.",
      ],
      /* Touche tout le monde : passe dans la réserve des alertes importantes (S-19) */
      { importante: true },
    );
  }, "alerte des imports du jour");
}

/**
 * Garde une route (voir l’en-tête) : `req` dit sa méthode, son origine et son adresse IP. Rend son contexte, ou la
 * réponse d’erreur à renvoyer telle quelle :
 *   const g = await garde(req, { session: "requise", histoire: true });
 *   if (g instanceof Response) return g;
 */
export async function garde<const O extends Options>(req: Request, options: O): Promise<Garde<O> | Response> {
  if (estMutation(req.method) && !memeOrigine(req)) return erreur("origine");
  return verifier(req, options);
}

/**
 * La même garde sans la requête : ni origine, ni adresse IP, donc ni limite à l’entrée. Pour un GET qui ne lit rien de sa requête, ou une mutation
 * dont l’origine est déjà vérifiée (garde avec `session: "aucune"`) et qui lit son corps avant de savoir quelle conv
 * suivre (POST /api/analyse).
 */
export function lecture<const O extends Omit<Options, "limite"> & { limite?: never }>(options: O): Promise<Garde<O> | Response> {
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
  /* Sans requête (lecture), pas d’adresse : lecture n’accepte pas de limite */
  if (limite && !(req && (await sousLaLimiteDeLIp(req, limite.ip, limite.limite)))) return erreur("trop");
  return { utilisateur, story } as Garde<O>;
}
