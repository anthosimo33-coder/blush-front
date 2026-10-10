import { NB_CHAPITRES } from "@/contenu/chapitres";
import { mailCode } from "@/server/mail-code";
import { mailRapport } from "@/server/mail-rapport";
import { AUTRE } from "../ecriture/exemple";

export const dynamic = "force-dynamic";

/**
 * Hors de Vercel seulement (src/proxy.ts) : un mail tel qu’il partira. Le code (par défaut), ou `?type=rapport`
 * (`&sobre=1` : le mode sobre), celui de l’histoire d’exemple (son prénom au chapitre 5 du sommaire).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const html =
    url.searchParams.get("type") === "rapport"
      ? mailRapport({ base: url.origin, lien: `${url.origin}/rapport`, chapitres: NB_CHAPITRES, lecture: "9 min", autre: AUTRE, sobre: url.searchParams.get("sobre") === "1" }).html
      : mailCode("159714", url.origin).html;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
