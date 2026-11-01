import "server-only";
import { estMutation } from "@/types/api";
import { alerter } from "./alertes";
import { compteDeSession, type Utilisateur } from "./auth";
import { lireSession } from "./cookies";
import { contexteRequete } from "./donnees";
import { estClient } from "./droits";
import { cleDeLimiteDuCompte, LIMITES_DU_COMPTE, type LimiteDuCompte } from "./email-canonique";
import type { LigneEcran } from "./histoires";
import { erreur, memeOrigine } from "./http";
import { auMieux } from "./journal";
import { compter, ipDe, LIMITES, rendre, sousLaLimite, type Limite } from "./limites";
import { aujourdhuiParis } from "./temps";

/*
 * La garde commune des routes /api : ce que chacune vérifie avant de faire quoi que ce soit, toujours dans le même ordre.
 * 1. D’où vient la requête : une requête qui modifie (tout sauf GET et HEAD) doit venir de l’appli (memeOrigine), 403
 *    « origine ». La méthode en décide, pas la route : une mutation ajoutée est gardée sans y penser.
 * 2. Qui la fait : sa session, requise (401 « connexion »), facultative, ou lue sans le filtre de la bêta (« Tout effacer »).
 * 3. Ce que ses droits ouvrent (402 « acces » : un client, pour sa fiche, src/server/droits.ts), puis sa conv ouverte
 *    (404 « aucune »).
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
  /** Le compte doit être client : un rapport débloqué, un achat payé, ou l’équipe (estClient, src/server/droits.ts). */
  client?: true;
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

/** Un import dans le budget d’octets du jour (octetsDansLeBudget) : `rendre` lui retire sa place dans le plafond de tous. */
export type PlaceDansLeBudget = { rendre: () => Promise<void> };

/**
 * Un budget d’octets du jour : ses clés (par adresse IP, pour tous, sur le jour de Paris : il repart à minuit, ses
 * alertes avec lui), ses plafonds, et ce que dit l’alerte à l’équipe.
 */
type BudgetDOctets = {
  cleIp: string;
  cleTous: (jour: string) => string;
  parIp: Limite;
  tous: Limite & { alerteA: number };
  nom: string;
  sujet: string;
  /** Ce que sont ces Ko, dans l’alerte (« 1 200 000 Ko importés le… ») */
  quoi: string;
  consequence: string;
};

const BUDGETS = {
  /* Le compteur des Ko importés par tous s’appelait déjà ainsi : le changer remettrait le jour à zéro pendant une mise en ligne */
  imports: {
    cleIp: "import:ko",
    cleTous: (jour) => `brouillons:ko:${jour}`,
    parIp: LIMITES.koImportParIp,
    tous: LIMITES.koBrouillonsParJour,
    nom: "LIMITES.koBrouillonsParJour",
    sujet: "imports",
    quoi: "importés",
    consequence: "Au plafond, plus personne ne peut importer\u00a0: chacun voit «\u00a0trop_jour\u00a0» jusqu’à minuit.",
  },
  ecrans: {
    cleIp: "ecrans:ko",
    cleTous: (jour) => `ecrans:ko:${jour}`,
    parIp: LIMITES.koEcransParIp,
    tous: LIMITES.koEcransParJour,
    nom: "LIMITES.koEcransParJour",
    sujet: "écrans gardés",
    quoi: "d’écrans gardés",
    consequence: "Au plafond, les longues vidéos se lisent en entier avant l’achat (plus cher), jusqu’à minuit.",
  },
} as const satisfies Record<string, BudgetDOctets>;

/**
 * Les octets d’un import tiennent-ils dans le budget du jour (S-02) ? Comptés en Ko, arrondis au-dessus, avant de le
 * lire : d’abord pour l’adresse IP de la requête (LIMITES.koImportParIp ; un fichier illisible compte aussi, contre le
 * coût de sa lecture), puis pour tous (LIMITES.koBrouillonsParJour, le jour de Paris). Rend null au-delà : un refus pour
 * tous rend les Ko comptés, à tous et à l’adresse (elle réessaiera demain sans avoir usé son budget). Sinon, la place
 * prise dans le plafond de tous : la route la rend si l’import n’aboutit pas (un fichier illisible, un groupe, une conv
 * courte n’entrent pas en base). L’équipe est prévenue quand le jour passe 80 % du plafond de tous, puis au premier
 * refus : une fois chacun par jour.
 */
export const octetsDansLeBudget = (req: Request, octets: number) => dansLeBudget(BUDGETS.imports, req, octets);

/**
 * Les octets d’un lot d’écrans gardés (POST /api/captures/ecrans) tiennent-ils dans leur budget du jour ? Comme
 * octetsDansLeBudget, sur ses plafonds à lui (LIMITES.koEcransParIp, LIMITES.koEcransParJour) : ces écrans restent
 * chiffrés en base sans qu’aucune lecture ne les paie, jusqu’à 13 jours sans paiement (48 h avant « Qui es-tu ? », puis
 * 11 jours après le paywall : src/server/ecrans-gardes.ts), et 7 de plus une fois payés.
 */
export const ecransDansLeBudget = (req: Request, octets: number) => dansLeBudget(BUDGETS.ecrans, req, octets);

async function dansLeBudget(b: BudgetDOctets, req: Request, octets: number): Promise<PlaceDansLeBudget | null> {
  const ko = Math.max(1, Math.ceil(octets / 1024));
  const deLIp = `${b.cleIp}:ip:${ipDe(req)}`;
  if (!(await sousLaLimite(deLIp, b.parIp, ko))) return null;
  const { alerteA, ...plafond } = b.tous;
  const jour = aujourdhuiParis().iso;
  const deTous = b.cleTous(jour);
  const total = await compter(deTous, plafond, ko);
  const avant = total - ko;
  /* Au-delà du plafond, chaque refus le dit : la clé de l’alerte n’en laisse partir qu’une par jour */
  if (total > plafond.max) await prevenir(b, jour, 1, avant);
  else if (avant < alerteA * plafond.max && total >= alerteA * plafond.max) await prevenir(b, jour, alerteA, total);
  const rendreATous = () => auMieux(() => rendre(deTous, ko), "Ko d’un import non rendus", { ko });
  if (total <= plafond.max) return { rendre: rendreATous };
  await rendreATous();
  await auMieux(() => rendre(deLIp, ko), "Ko d’un import non rendus à l’adresse", { ko });
  return null;
}

/** Prévient l’équipe que les Ko de ce jour ont passé ce seuil du plafond de tous (1 : atteint), une fois par seuil et par jour. */
async function prevenir(b: BudgetDOctets, jour: string, seuil: number, ko: number): Promise<void> {
  await auMieux(async () => {
    if (!(await sousLaLimite(`${b.cleTous(jour)}:alerte:${seuil}`, { max: 1, fenetreS: 2 * 86400 }))) return;
    await alerter(
      seuil >= 1 ? `${b.sujet} : plafond du jour atteint` : `${b.sujet} : ${Math.round(seuil * 100)} % du plafond du jour`,
      [`${ko} Ko ${b.quoi} le ${jour}, pour un plafond de ${b.tous.max} Ko par jour (${b.nom}).`, b.consequence],
      /* Touche tout le monde : passe dans la réserve des alertes importantes (S-19) */
      { importante: true },
    );
  }, "alerte des octets du jour");
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

async function verifier<O extends Options>(req: Request | null, { session, parcours, histoire, client, limite }: O): Promise<Garde<O> | Response> {
  let utilisateur: Utilisateur | null = null;
  let story: LigneEcran | null = null;
  if (session === "sansBeta") utilisateur = await compteDeSession(await lireSession());
  else if (session !== "aucune") ({ utilisateur, story } = await contexte({ parcours }));
  if (!utilisateur && (session === "requise" || session === "sansBeta")) return erreur("connexion");
  if (client && !(utilisateur && (await estClient(utilisateur)))) return erreur("acces");
  if (histoire && !story) return erreur("aucune");
  /* Sans requête (lecture), pas d’adresse : lecture n’accepte pas de limite */
  if (limite && !(req && (await sousLaLimiteDeLIp(req, limite.ip, limite.limite)))) return erreur("trop");
  return { utilisateur, story } as Garde<O>;
}
