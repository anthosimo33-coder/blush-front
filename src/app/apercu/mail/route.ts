import { mailCode } from "@/server/mail-code";
import { mailRapport } from "@/server/mail-rapport";

export const dynamic = "force-dynamic";

/** En local seulement : un mail tel qu’il partira. Le code (par défaut), ou `?type=rapport` (`&sobre=1` : le mode sobre). */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const url = new URL(req.url);
  const html =
    url.searchParams.get("type") === "rapport"
      ? mailRapport({ base: url.origin, lien: `${url.origin}/rapport`, chapitres: 8, lecture: "9 min", autre: "elle", sobre: url.searchParams.get("sobre") === "1" }).html
      : mailCode("159714", url.origin).html;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
