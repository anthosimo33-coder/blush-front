import { NextResponse, type NextRequest } from "next/server";
import { hoteLocal } from "@/lib/hote-local";
import { NOMS_DE_SESSION, NOMS_DU_TOURNAGE } from "@/lib/noms-cookies";
import { cleDePostHog } from "@/lib/publique";
import { betaFermee, outilsDeLEquipe } from "@/server/drapeaux";

/*
 * La bêta fermée (BLUSH_BETA_FERMEE) se lit à l’exécution, comme sur le serveur (src/server/invitations.ts, entre) : un même
 * build sert la bêta ouverte ou fermée, et ce qu’en disent les pages ne peut pas dater du build. En production, elle reste
 * fermée tant que son ouverture n’a pas ce qu’elle exige, comme pour env() (betaFermee, src/server/drapeaux.ts). Les
 * pages du parcours d’arrivée restent statiques (servies et préchargées tout de suite) ; en bêta fermée, ce proxy sert à
 * leur adresse leur variante « fermee », statique elle aussi, sauf les captures, qui vérifient la connexion d’abord
 * (rendue à la demande).
 * Hors bêta fermée, il laisse tout passer.
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

/**
 * Le cookie de session (src/server/cookies.ts) : sa seule présence, sans le vérifier (le proxy ne fait qu’aiguiller).
 * Sous l’un ou l’autre de ses noms (__Host- en https : src/lib/noms-cookies.ts).
 */
const connecte = (request: NextRequest) => NOMS_DE_SESSION.some((nom) => request.cookies.has(nom));

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

/** Le relais de PostHog (src/lib/analytique.ts) : ses requêtes passent par une adresse de BLUSH, que les bloqueurs laissent passer. */
const RELAIS = /^\/ingest(?=\/|$)/;

/**
 * Une requête de PostHog, passée à son serveur européen (ses fichiers, /ingest/static/…, à celui de ses fichiers),
 * sans nos cookies (la session ne sort jamais de BLUSH) ni autorisation. L’adresse IP de la connexion passe (Vercel la
 * pose dans x-forwarded-for) : PostHog en tire son empreinte sans cookie, et l’oublie (le réglage « Discard client IP
 * data » du projet). Une créatrice en mode tournage n’est pas une visite : rien ne part, sans le dire (la réponse de
 * PostHog, 200 : toute autre, il la réessaierait dix fois). Sans la clé de PostHog, le relais n’existe pas (404).
 */
function versPostHog(request: NextRequest): NextResponse {
  if (!cleDePostHog()) return NextResponse.rewrite(new URL(INTROUVABLE, request.url));
  if (NOMS_DU_TOURNAGE.some((nom) => request.cookies.has(nom))) return NextResponse.json({ status: 1 });
  const chemin = request.nextUrl.pathname.replace(RELAIS, "") || "/";
  const hote = chemin.startsWith("/static/") ? "eu-assets.i.posthog.com" : "eu.i.posthog.com";
  const entetes = new Headers(request.headers);
  entetes.set("host", hote);
  entetes.delete("cookie");
  entetes.delete("authorization");
  return NextResponse.rewrite(new URL(`${chemin}${request.nextUrl.search}`, `https://${hote}`), { request: { headers: entetes } });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (RELAIS.test(pathname)) return versPostHog(request);
  /*
   * Une adresse du matcher qui finit par « / » (« /commencer/ » : le matcher de Next ne regarde pas la barre finale) :
   * vers la même sans, comme Next le faisait seul avant skipTrailingSlashRedirect (next.config.ts, pour que les requêtes
   * de PostHog, « /ingest/e/ », passent telles quelles). Sans quoi « /commencer/ » échapperait à sa variante de la bêta
   * fermée. Les autres pages s’ouvrent avec ou sans la barre, sans rien qui en dépende
   */
  if (pathname.length > 1 && pathname.endsWith("/")) {
    /* Une URL simple : celle de Next (nextUrl) remettrait la barre qu’elle a vue en arrivant */
    const url = new URL(request.url);
    url.pathname = pathname.replace(/\/+$/, "") || "/";
    return NextResponse.redirect(url, 308);
  }
  if (estUnOutil(pathname)) return outilsDeLEquipe() && hoteLocal(request.headers) ? NextResponse.next() : NextResponse.rewrite(new URL(INTROUVABLE, request.url));
  const variante = VARIANTES[pathname];
  if (!variante || !betaFermee()) return NextResponse.next();
  /* Déjà connecté (une autre conv) : /commencer sans la liste d’attente (next.config.ts sert alors /commencer/connecte) */
  if (pathname === "/commencer" && connecte(request)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = variante;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/commencer", "/email/code", "/connexion/code", "/importer/captures", "/apercu/:path*", "/styleguide", "/paiement/factice", "/api/paiement/factice", "/ingest/:path*"],
};
