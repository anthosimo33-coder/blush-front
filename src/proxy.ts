import { NextResponse, type NextRequest } from "next/server";
import { BACKEND } from "@/services/mode";

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

/** Le cookie de session (src/server/cookies.ts) : sa seule présence, sans le vérifier, comme aUneSession. */
const SESSION = "blush-session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const variante = VARIANTES[pathname];
  if (!variante || !BACKEND || process.env.BLUSH_BETA_FERMEE !== "1") return NextResponse.next();
  /* Déjà connecté (une autre conv) : /commencer sans la liste d’attente (next.config.ts sert alors /commencer/connecte) */
  if (pathname === "/commencer" && request.cookies.has(SESSION)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = variante;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/commencer", "/email/code", "/connexion/code", "/importer/captures"] };
