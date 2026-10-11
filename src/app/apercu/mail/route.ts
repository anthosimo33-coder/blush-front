import { NB_CHAPITRES } from "@/contenu/chapitres";
import { mailAttente } from "@/server/mail-attente";
import { mailCode } from "@/server/mail-code";
import { mailRapport } from "@/server/mail-rapport";
import { AUTRE } from "../ecriture/exemple";

export const dynamic = "force-dynamic";

/**
 * Hors de Vercel seulement (src/proxy.ts) : un mail tel qu’il partira. Le code (par défaut) ; `?type=rapport` (`&sobre=1` :
 * le mode sobre), celui de l’histoire d’exemple (son prénom au chapitre 5 du sommaire) ; ou `?type=attente`, celui de la
 * liste d’attente (`&place=prete` : un email déjà invité, `&conv=1` : la conv importée qui n’a pas été gardée).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const type = p.get("type");
  const html =
    type === "rapport"
      ? mailRapport({ base: url.origin, lien: `${url.origin}/rapport`, chapitres: NB_CHAPITRES, lecture: "9 min", autre: AUTRE, sobre: p.get("sobre") === "1" }).html
      : type === "attente"
        ? mailAttente({
            base: url.origin,
            place: p.get("place") === "prete" ? "prete" : "liste",
            retrait: `${url.origin}/attente/retirer?id=exemple&cle=exemple`,
            convEffacee: p.get("conv") === "1",
          }).html
        : mailCode("159714", url.origin).html;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
