import { NextResponse, type NextRequest, type ProxyConfig } from "next/server";
import { hoteLocal } from "@/lib/hote-local";
import { NOMS_DE_SESSION, NOMS_DU_TOURNAGE } from "@/lib/noms-cookies";
import { betaFermee, outilsDeLEquipe } from "@/server/drapeaux";

/*
 * Ce proxy sert à l’adresse d’une page une autre variante de la page, sans changer l’adresse. Les pages du parcours
 * d’arrivée restent statiques (servies et préchargées tout de suite) ; ce qui y dépend de la session, du mode tournage ou
 * de la bêta fermée est une variante, choisie ici.
 *
 * La session et le tournage : la seule présence de leur cookie, sans le vérifier (le proxy ne fait qu’aiguiller), et
 * jamais sa valeur. Ces aiguillages étaient des réécritures de next.config.ts (`has: [{ type: "cookie", key }]`) : Next y
 * ajoute la valeur du cookie aux paramètres de la destination, que la page relit (ses searchParams, ses données RSC,
 * l’en-tête x-nextjs-rewritten-query) ; le secret httpOnly de la session devenait lisible par le JavaScript de la page.
 * NextResponse.rewrite ne garde que l’adresse demandée et sa requête à elle (tests/proxy.test.ts le vérifie).
 *
 * La bêta fermée (BLUSH_BETA_FERMEE) se lit à l’exécution, comme sur le serveur (src/server/invitations.ts, entre) : un même
 * build sert la bêta ouverte ou fermée, et ce qu’en disent les pages ne peut pas dater du build. En production, elle reste
 * fermée tant que son ouverture n’a pas ce qu’elle exige, comme pour env() (betaFermee, src/server/drapeaux.ts). En bêta
 * fermée, ce proxy sert à leur adresse leur variante « fermee », statique elle aussi, sauf les captures, qui vérifient la
 * connexion d’abord (rendue à la demande).
 * Hors de ces variantes, il laisse tout passer.
 */
const VARIANTES: Record<string, string> = {
  /* La liste d’attente annoncée dès le début, plutôt qu’après l’import */
  "/commencer": "/commencer/fermee",
  /* L’écran du code dit pareil à tous qu’un mail est parti : le code pour un invité, la liste d’attente pour les autres */
  "/email/code": "/email/code/fermee",
  "/connexion/code": "/connexion/code/fermee",
  /* BLUSH ne lit des captures que pour un compte connecté (src/server/captures.ts, lecturePermise) */
  "/importer/captures": "/importer/captures/fermee",
};

/** Les variantes de qui a un cookie de session, servies avant celles de la bêta fermée. */
const SOUS_LA_SESSION: Record<string, string> = {
  /* Qui revient connecté voit la landing de src/app/retour : ses boutons mènent à son accueil */
  "/": "/retour",
  /* Déjà connecté (une autre conv) : sans la liste d’attente, bêta fermée ou non */
  "/commencer": "/commencer/connecte",
  /* Déjà connecté : son accueil */
  "/connexion": "/connexion/connecte",
};

/**
 * La variante de qui a le cookie du mode tournage (src/server/tournage.ts) : l’export sans fichier, rendu à la demande,
 * qui vérifie son lien (un lien arrêté y voit l’écran de tout le monde).
 */
const SOUS_LE_TOURNAGE: Record<string, string> = { "/importer/export": "/importer/export/tournage" };

/**
 * L’un de ces cookies est là (sous l’un ou l’autre de ses noms : __Host- en https, src/lib/noms-cookies.ts), sans le
 * vérifier ni le lire.
 */
const present = (request: NextRequest, noms: readonly string[]) => noms.some((nom) => request.cookies.has(nom));

/**
 * Les outils de l’équipe : les aperçus (/apercu, des données fictives ou des rapports locaux), le design system, et le
 * faux Whop (sa page de paiement, /paiement/factice, et ses boutons, /api/paiement/factice : BLUSH_PAIEMENT_FACTICE). Ils
 * n’existent pas sur Vercel (src/server/drapeaux.ts, outilsDeLEquipe) : ce proxy y sert à leur place une adresse sans
 * page, donc la page introuvable de BLUSH (src/app/not-found.tsx), en 404. Ailleurs, de même pour une requête qui ne
 * demande pas ce poste (src/lib/hote-local.ts) : un site qui fait pointer son domaine sur 127.0.0.1 ne lit pas tes
 * aperçus depuis ton navigateur, et ne lance pas /apercu/demander.
 */
const estUnOutil = (chemin: string) => /^\/(apercu|styleguide|paiement\/factice|api\/paiement\/factice)(\/|$)/.test(chemin);
/** Aucune page à cette adresse, hors du matcher (tests/proxy.test.ts le vérifie) : Next y répond par sa page introuvable. */
const INTROUVABLE = "/introuvable";

/** La variante servie à l’adresse de cette requête, ou rien : la page elle-même. */
const varianteDe = (request: NextRequest) => {
  const { pathname } = request.nextUrl;
  if (SOUS_LA_SESSION[pathname] && present(request, NOMS_DE_SESSION)) return SOUS_LA_SESSION[pathname];
  if (SOUS_LE_TOURNAGE[pathname] && present(request, NOMS_DU_TOURNAGE)) return SOUS_LE_TOURNAGE[pathname];
  if (VARIANTES[pathname] && betaFermee()) return VARIANTES[pathname];
  return null;
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (estUnOutil(pathname)) return outilsDeLEquipe() && hoteLocal(request.headers) ? NextResponse.next() : NextResponse.rewrite(new URL(INTROUVABLE, request.url));
  const variante = varianteDe(request);
  if (!variante) return NextResponse.next();
  /* Le chemin seul change : la requête reste celle du navigateur (?app=, ?suite=), sans rien de ses cookies */
  const url = request.nextUrl.clone();
  url.pathname = variante;
  return NextResponse.rewrite(url);
}

/*
 * Next lit ce matcher au build, sans rien exécuter : des valeurs écrites en toutes lettres. Les noms des cookies y sont
 * donc recopiés de src/lib/noms-cookies.ts (tests/proxy.test.ts les compare). Sans leur cookie, /, /connexion et
 * /importer/export ne passent pas par le proxy : la landing reste servie telle quelle aux nouveaux visiteurs.
 */
export const config = {
  matcher: [
    "/commencer",
    "/email/code",
    "/connexion/code",
    "/importer/captures",
    "/apercu/:path*",
    "/styleguide",
    "/paiement/factice",
    "/api/paiement/factice",
    { source: "/", has: [{ type: "cookie", key: "__Host-blush-session" }] },
    { source: "/", has: [{ type: "cookie", key: "blush-session" }] },
    { source: "/connexion", has: [{ type: "cookie", key: "__Host-blush-session" }] },
    { source: "/connexion", has: [{ type: "cookie", key: "blush-session" }] },
    { source: "/importer/export", has: [{ type: "cookie", key: "__Host-blush-tournage" }] },
    { source: "/importer/export", has: [{ type: "cookie", key: "blush-tournage" }] },
  ],
} satisfies ProxyConfig;
