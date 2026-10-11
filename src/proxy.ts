import { NextResponse, type NextRequest } from "next/server";
import { hoteLocal } from "@/lib/hote-local";
import { NOMS_DE_SESSION } from "@/lib/noms-cookies";
import { betaFermee, outilsDeLEquipe } from "@/server/drapeaux";

/*
 * La bêta fermée (BLUSH_BETA_FERMEE) se lit à l’exécution, comme sur le serveur (src/server/env.ts, peutEntrer) : un même
 * build sert la bêta ouverte ou fermée, et ce qu’en disent les pages ne peut pas dater du build. Les pages du parcours
 * d’arrivée restent statiques (servies et préchargées tout de suite) ; en bêta fermée, ce proxy sert à leur adresse leur
 * variante « fermee », statique elle aussi, sauf les captures, qui vérifient la connexion d’abord (rendue à la demande).
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
 * Le cookie de session (src/server/cookies.ts) : sa seule présence, sans le vérifier, comme aUneSession. Sous l’un ou
 * l’autre de ses noms (__Host- en https : src/lib/noms-cookies.ts).
 */
const connecte = (request: NextRequest) => NOMS_DE_SESSION.some((nom) => request.cookies.has(nom));

/**
 * Les outils de l’équipe : les aperçus (/apercu, des données fictives ou des rapports locaux) et le design system. Ils
 * n’existent pas sur Vercel (src/server/drapeaux.ts, outilsDeLEquipe) : ce proxy y sert à leur place une adresse sans
 * page, donc la page introuvable de BLUSH (src/app/not-found.tsx), en 404. Ailleurs, de même pour une requête qui ne
 * demande pas ce poste (src/lib/hote-local.ts) : un site qui fait pointer son domaine sur 127.0.0.1 ne lit pas tes
 * aperçus depuis ton navigateur, et ne lance pas /apercu/demander.
 */
const estUnOutil = (chemin: string) => /^\/(apercu|styleguide)(\/|$)/.test(chemin);
/** Aucune page à cette adresse, hors du matcher (tests/proxy.test.ts le vérifie) : Next y répond par sa page introuvable. */
const INTROUVABLE = "/introuvable";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (estUnOutil(pathname)) return outilsDeLEquipe() && hoteLocal(request.headers) ? NextResponse.next() : NextResponse.rewrite(new URL(INTROUVABLE, request.url));
  const variante = VARIANTES[pathname];
  if (!variante || !betaFermee()) return NextResponse.next();
  /* Déjà connecté (une autre conv) : /commencer sans la liste d’attente (next.config.ts sert alors /commencer/connecte) */
  if (pathname === "/commencer" && connecte(request)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = variante;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/commencer", "/email/code", "/connexion/code", "/importer/captures", "/apercu/:path*", "/styleguide"] };
